import 'dotenv/config';
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import { existsSync } from 'node:fs';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { Telegraf } from 'telegraf';
import { message } from 'telegraf/filters';
import { conversation } from './conversation';
import { spark } from './spark';
import { llm } from './llm';
import { spawner } from './spawner';
import { registerMissionRelay, startMissionRelay } from './missionRelay';

// Validate environment
if (!process.env.BOT_TOKEN) {
  console.error('ERROR: BOT_TOKEN not set in .env');
  console.error('Get one from @BotFather on Telegram');
  process.exit(1);
}

const bot = new Telegraf(process.env.BOT_TOKEN);

// Rate limiting (simple in-memory)
const userLastAction = new Map<number, number>();
const RATE_LIMIT_MS = 1000; // 1 second between messages
const webhookUpdateCache = new Map<number, number>();
const WEBHOOK_UPDATE_TTL_MS = 5 * 60 * 1000;
const WEBHOOK_STATE_PATH = path.join(process.cwd(), '.spark-telegram-webhook-state.json');
let telegramWebhookServer: Server | null = null;
let pollingActive = false;
let webhookStateLoaded = false;

interface PersistedWebhookState {
  seenUpdateIds: Array<{
    updateId: number;
    timestamp: number;
  }>;
}

function getGatewayMode(): 'auto' | 'polling' | 'webhook' {
  const raw = process.env.TELEGRAM_GATEWAY_MODE?.trim().toLowerCase() || 'auto';
  if (raw === 'auto' || raw === 'polling' || raw === 'webhook') {
    return raw;
  }

  throw new Error('TELEGRAM_GATEWAY_MODE must be one of: auto, polling, webhook');
}

function getWebhookConfig() {
  const webhookUrl = process.env.TELEGRAM_WEBHOOK_URL?.trim();
  if (!webhookUrl) {
    return null;
  }

  const webhookSecret = process.env.TELEGRAM_WEBHOOK_SECRET?.trim();
  if (!webhookSecret) {
    throw new Error('TELEGRAM_WEBHOOK_SECRET is required when TELEGRAM_WEBHOOK_URL is set');
  }

  const parsedUrl = new URL(webhookUrl);
  const port = Number(process.env.TELEGRAM_WEBHOOK_PORT || '8443');
  if (!Number.isFinite(port) || port <= 0) {
    throw new Error('TELEGRAM_WEBHOOK_PORT must be a positive integer');
  }

  return {
    url: webhookUrl,
    path: parsedUrl.pathname || '/',
    port,
    secret: webhookSecret
  };
}

function writeJson(res: ServerResponse, statusCode: number, body: Record<string, unknown>): void {
  res.statusCode = statusCode;
  res.setHeader('Content-Type', 'application/json');
  res.end(JSON.stringify(body));
}

function pruneWebhookUpdateCache(now = Date.now()): void {
  const cutoff = now - WEBHOOK_UPDATE_TTL_MS;
  for (const [cachedId, timestamp] of webhookUpdateCache.entries()) {
    if (timestamp < cutoff) {
      webhookUpdateCache.delete(cachedId);
    }
  }
}

async function loadWebhookState(): Promise<void> {
  if (webhookStateLoaded) {
    return;
  }

  webhookStateLoaded = true;
  if (!existsSync(WEBHOOK_STATE_PATH)) {
    return;
  }

  try {
    const raw = await readFile(WEBHOOK_STATE_PATH, 'utf-8');
    const parsed = JSON.parse(raw) as PersistedWebhookState;
    for (const entry of parsed.seenUpdateIds || []) {
      if (typeof entry?.updateId === 'number' && typeof entry?.timestamp === 'number') {
        webhookUpdateCache.set(entry.updateId, entry.timestamp);
      }
    }
    pruneWebhookUpdateCache();
  } catch (error) {
    console.warn('[TelegramWebhook] Failed to load webhook state:', error);
  }
}

async function persistWebhookState(): Promise<void> {
  try {
    pruneWebhookUpdateCache();
    const state: PersistedWebhookState = {
      seenUpdateIds: Array.from(webhookUpdateCache.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, 1000)
        .map(([updateId, timestamp]) => ({ updateId, timestamp }))
    };
    await writeFile(WEBHOOK_STATE_PATH, JSON.stringify(state, null, 2), 'utf-8');
  } catch (error) {
    console.warn('[TelegramWebhook] Failed to persist webhook state:', error);
  }
}

async function shouldSkipWebhookUpdate(updateId: unknown): Promise<boolean> {
  await loadWebhookState();
  if (typeof updateId !== 'number' || !Number.isFinite(updateId)) {
    return false;
  }

  const now = Date.now();
  const previous = webhookUpdateCache.get(updateId);
  if (typeof previous === 'number' && now - previous < WEBHOOK_UPDATE_TTL_MS) {
    return true;
  }

  webhookUpdateCache.set(updateId, now);
  pruneWebhookUpdateCache(now);
  await persistWebhookState();

  return false;
}

function readJsonBody(req: IncomingMessage): Promise<Record<string, unknown> | null> {
  return new Promise((resolve) => {
    const chunks: Buffer[] = [];
    let size = 0;

    req.on('data', (chunk: Buffer) => {
      size += chunk.length;
      if (size > 256 * 1024) {
        resolve(null);
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });

    req.on('end', () => {
      try {
        const parsed = JSON.parse(Buffer.concat(chunks).toString('utf-8')) as Record<string, unknown>;
        resolve(parsed);
      } catch {
        resolve(null);
      }
    });

    req.on('error', () => resolve(null));
  });
}

async function startTelegramWebhookServer(mode: 'auto' | 'polling' | 'webhook'): Promise<{ port: number; path: string } | null> {
  const webhook = getWebhookConfig();
  if (mode === 'polling') {
    if (webhook) {
      throw new Error('Polling mode refused because TELEGRAM_WEBHOOK_URL is configured. Clear webhook env or use TELEGRAM_GATEWAY_MODE=webhook.');
    }
    return null;
  }

  if (mode === 'webhook' && !webhook) {
    throw new Error('Webhook mode requires TELEGRAM_WEBHOOK_URL and TELEGRAM_WEBHOOK_SECRET.');
  }

  if (!webhook) {
    return null;
  }

  if (!telegramWebhookServer) {
    telegramWebhookServer = createServer(async (req, res) => {
      const reqUrl = new URL(req.url || '/', 'http://127.0.0.1');
      if (req.method !== 'POST' || reqUrl.pathname !== webhook.path) {
        writeJson(res, 404, { ok: false, error: 'not_found' });
        return;
      }

      const secretHeader = req.headers['x-telegram-bot-api-secret-token'];
      if (secretHeader !== webhook.secret) {
        writeJson(res, 401, { ok: false, error: 'invalid_secret' });
        return;
      }

      const payload = await readJsonBody(req);
      if (!payload) {
        writeJson(res, 400, { ok: false, error: 'invalid_payload' });
        return;
      }

      if (await shouldSkipWebhookUpdate(payload.update_id)) {
        writeJson(res, 202, { ok: true, duplicate: true });
        return;
      }

      writeJson(res, 200, { ok: true });

      void bot.handleUpdate(payload as any).catch((error) => {
        console.error('Telegram webhook update failed:', error);
      });
    });

    await new Promise<void>((resolve, reject) => {
      telegramWebhookServer!.once('error', reject);
      telegramWebhookServer!.listen(webhook.port, '0.0.0.0', () => {
        telegramWebhookServer!.off('error', reject);
        resolve();
      });
    });
  }

  await bot.telegram.setWebhook(webhook.url, {
    secret_token: webhook.secret
  });

  return { port: webhook.port, path: webhook.path };
}

async function ensurePollingAllowed(): Promise<void> {
  const webhookInfo = await bot.telegram.getWebhookInfo();
  if (webhookInfo.url) {
    throw new Error(
      `Polling mode refused because Telegram webhook ownership is active at ${webhookInfo.url}. Use TELEGRAM_GATEWAY_MODE=webhook or clear the webhook first.`
    );
  }
}

function requireAdmin(ctx: any): boolean {
  if (conversation.isAdmin(ctx.from)) {
    return true;
  }

  ctx.reply('Admin only. Add your Telegram ID to ADMIN_TELEGRAM_IDS first.').catch(() => {});
  return false;
}

// Error handler
bot.catch((err, ctx) => {
  console.error(`Error for ${ctx.updateType}:`, err);
  ctx.reply('Something went wrong. Please try again.').catch(() => {});
});

// Rate limit middleware
bot.use(async (ctx, next) => {
  const userId = ctx.from?.id;
  if (userId) {
    const lastAction = userLastAction.get(userId);
    if (lastAction && Date.now() - lastAction < RATE_LIMIT_MS) {
      return; // Rate limited
    }
    userLastAction.set(userId, Date.now());
  }
  return next();
});

// /start command
bot.start(async (ctx) => {
  const user = ctx.from;
  const name = user.first_name || user.username || 'friend';

  // Check if Mind is available
  const mindAvailable = await conversation.isAvailable();

  if (mindAvailable) {
    // Remember this user started
    await conversation.learnAboutUser(user, `Started using bot on ${new Date().toISOString()}`);
  }

  const [sparkAvailable, spawnerAvailable] = await Promise.all([
    spark.isAvailable(),
    spawner.isAvailable()
  ]);

  await ctx.reply(
    `Hey ${name}! I'm Spark ⚡\n\n` +
    `I remember conversations and learn over time.\n\n` +
    `Memory Commands:\n` +
    `/remember <text> - Store a memory\n` +
    `/recall <topic> - Search memories\n` +
    `/about - What I know about you\n\n` +
    `Spark Intelligence:\n` +
    `/spark - System status\n` +
    `/resonance - Our sync level\n` +
    `/insights - What I'm learning\n` +
    `/voice - Your preferences\n` +
    `/lessons - Surprise lessons\n` +
    `/process - Process event queue\n` +
    `/reflect - Deep reflection\n\n` +
    (conversation.isAdmin(user)
      ? `Spawner Control:\n` +
        `/run <goal> - Start a mission in Spawner\n` +
        `/board - Mission state report\n` +
        `/mission <status|pause|resume|kill> <missionId> - Control a mission\n\n`
      : '') +
    `Or just chat!` +
    (mindAvailable ? '' : '\n⚠️ Memory offline') +
    (sparkAvailable ? '' : '\n⚠️ Spark offline')
  );
  if (!spawnerAvailable && conversation.isAdmin(user)) {
    await ctx.reply('Spawner orchestration is offline.');
  }
});

// /status command
bot.command('status', async (ctx) => {
  await ctx.sendChatAction('typing');

  const [mindHealthy, sparkHealthy] = await Promise.all([
    conversation.isAvailable(),
    spark.isAvailable()
  ]);
  const isAdmin = conversation.isAdmin(ctx.from);

  let status = '⚡ System Status\n\n';

  if (mindHealthy) {
    const count = await conversation.getMemoryCount(ctx.from);
    status += `🧠 Mind: ONLINE (${count} memories)\n`;
  } else {
    status += '🧠 Mind: OFFLINE\n';
  }

  if (sparkHealthy) {
    const dashboard = await spark.getDashboardStatus();
    if (dashboard) {
      const r = dashboard.resonance;
      status += `⚡ Spark: ONLINE\n`;
      status += `${r.icon} Resonance: ${r.name} (${r.score.toFixed(0)}%)\n`;
      status += `📊 Insights: ${dashboard.cognitive.total}\n`;
    } else {
      status += '⚡ Spark: ONLINE (dashboard offline)\n';
    }
  } else {
    status += '⚡ Spark: OFFLINE\n';
  }

  if (isAdmin) status += '\n🔑 Admin access';

  await ctx.reply(status);
});

// /myid command - get your secure Telegram ID (for admin setup)
bot.command('myid', async (ctx) => {
  const user = ctx.from;
  const isAdmin = conversation.isAdmin(user);
  await ctx.reply(
    `Your Telegram ID: ${user.id}\n` +
    `Username: @${user.username || 'none'}\n` +
    (isAdmin ? '🔑 You are an admin' : 'ℹ️ Add this ID to ADMIN_TELEGRAM_IDS in .env for admin access')
  );
});

// /remember command
bot.command('remember', async (ctx) => {
  const text = ctx.message.text.replace('/remember', '').trim();

  if (!text) {
    return ctx.reply('Usage: /remember <something to remember>');
  }

  try {
    await conversation.storePreference(ctx.from, text);
    await ctx.reply(`Got it! I'll remember: "${text}"`);
  } catch (err) {
    console.error('Failed to remember:', err);
    await ctx.reply('Sorry, I couldn\'t save that. Mind might be offline.');
  }
});

// /recall command
bot.command('recall', async (ctx) => {
  const query = ctx.message.text.replace('/recall', '').trim();

  if (!query) {
    return ctx.reply('Usage: /recall <topic to recall>');
  }

  try {
    const memories = await conversation.recall(ctx.from, query, 5);

    if (memories.length === 0) {
      return ctx.reply(`I don't have any memories about "${query}".`);
    }

    const list = memories
      .map((m, i) => `${i + 1}. ${m.content}`)
      .join('\n\n');

    await ctx.reply(`Here's what I remember about "${query}":\n\n${list}`);
  } catch (err) {
    console.error('Failed to recall:', err);
    await ctx.reply('Sorry, I couldn\'t search my memories. Mind might be offline.');
  }
});

// /about command - what do I know about you
bot.command('about', async (ctx) => {
  try {
    const memories = await conversation.recallRecent(ctx.from, 10);

    if (memories.length === 0) {
      return ctx.reply('I don\'t know much about you yet. Keep chatting!');
    }

    const list = memories
      .map((m, i) => `${i + 1}. ${m.content}`)
      .join('\n\n');

    await ctx.reply(`Here's what I remember:\n\n${list}`);
  } catch (err) {
    console.error('Failed to recall about user:', err);
    await ctx.reply('Sorry, I couldn\'t access my memories.');
  }
});

// /forget command - show what would be forgotten (for safety)
bot.command('forget', async (ctx) => {
  await ctx.reply(
    'To protect your data, please use the Mind V5 dashboard to manage memories:\n' +
    'http://localhost:8501\n\n' +
    'Or contact the bot admin.'
  );
});

// ============= SPARK COMMANDS =============

// /spark - quick status
bot.command('spark', async (ctx) => {
  await ctx.sendChatAction('typing');
  const status = await spark.getQuickStatus();
  await ctx.reply(`⚡ Spark Intelligence\n\n${status}`);
});

// /resonance - resonance state
bot.command('resonance', async (ctx) => {
  await ctx.sendChatAction('typing');
  const resonance = await spark.getResonance();
  await ctx.reply(`🌟 Resonance\n\n${resonance}`);
});

// /insights - cognitive insights
bot.command('insights', async (ctx) => {
  await ctx.sendChatAction('typing');
  const insights = await spark.getInsights(5);
  await ctx.reply(insights);
});

// /voice - what Spark learned about user
bot.command('voice', async (ctx) => {
  await ctx.sendChatAction('typing');
  const voice = await spark.getVoice();
  await ctx.reply(voice);
});

// /lessons - surprise lessons
bot.command('lessons', async (ctx) => {
  await ctx.sendChatAction('typing');
  const lessons = await spark.getSurprises();
  await ctx.reply(lessons);
});

// /process - process pending events
bot.command('process', async (ctx) => {
  await ctx.sendChatAction('typing');
  await ctx.reply('⏳ Processing queue...');
  const result = await spark.processQueue();
  await ctx.reply(result);
});

// /reflect - trigger deep reflection
bot.command('reflect', async (ctx) => {
  await ctx.sendChatAction('typing');
  await ctx.reply('🔮 Starting deep reflection...');
  const result = await spark.reflect();
  await ctx.reply(result);
});

bot.command('run', async (ctx) => {
  if (!requireAdmin(ctx)) return;

  const goal = ctx.message.text.replace('/run', '').trim();
  if (!goal) {
    return ctx.reply('Usage: /run <goal>');
  }

  await ctx.sendChatAction('typing');
  await ctx.reply('Launching mission in Spawner...');

  const requestId = `tg-${ctx.chat.id}-${ctx.message.message_id}`;

  const result = await spawner.runGoal({
    goal,
    chatId: String(ctx.chat.id),
    requestId,
    userId: String(ctx.from.id)
  });

  if (!result.success || !result.missionId) {
    return ctx.reply(`Spawner run failed: ${result.error || 'unknown error'}`);
  }

  await ctx.reply(
    [
      'Mission started',
      `ID: ${result.missionId}`,
      `Request: ${result.requestId || requestId}`,
      `Providers: ${(result.providers || []).join(', ') || 'default'}`,
      `Check: /mission status ${result.missionId}`
    ].join('\n')
  );

  await registerMissionRelay({
    missionId: result.missionId,
    chatId: String(ctx.chat.id),
    userId: String(ctx.from.id),
    requestId: result.requestId || requestId,
    goal,
    createdAt: new Date().toISOString(),
    updateId: typeof ctx.update.update_id === 'number' ? ctx.update.update_id : undefined
  });
});

bot.command('board', async (ctx) => {
  if (!requireAdmin(ctx)) return;

  await ctx.sendChatAction('typing');
  const result = await spawner.board();
  await ctx.reply(result.success ? result.message : `Board failed: ${result.message}`);
});

bot.command('mission', async (ctx) => {
  if (!requireAdmin(ctx)) return;

  const args = ctx.message.text.replace('/mission', '').trim().split(/\s+/).filter(Boolean);
  if (args.length < 2) {
    return ctx.reply('Usage: /mission <status|pause|resume|kill> <missionId>');
  }

  const action = args[0] as 'status' | 'pause' | 'resume' | 'kill';
  const missionId = args[1];

  if (!['status', 'pause', 'resume', 'kill'].includes(action)) {
    return ctx.reply('Usage: /mission <status|pause|resume|kill> <missionId>');
  }

  if (missionId.includes('<') || missionId.includes('>')) {
    return ctx.reply('Use the real mission ID from /run, for example: /mission status spark-1776768300668');
  }

  await ctx.sendChatAction('typing');
  const result = await spawner.missionCommand(action, missionId);
  await ctx.reply(result.success ? result.message : `Mission command failed: ${result.message}`);
});

// Handle regular text messages
bot.on(message('text'), async (ctx) => {
  const user = ctx.from;
  const text = ctx.message.text;

  // Show typing indicator
  await ctx.sendChatAction('typing');

  try {
    // Store the message as a memory
    await conversation.remember(user, text).catch(() => {});

    // Get context from previous memories
    const memories = await conversation.getContext(user, text);

    // Get LLM response with Spark context
    const response = await llm.chat(text, '', memories);

    await ctx.reply(response);

    // Learn preferences from patterns
    if (text.toLowerCase().includes('i like')) {
      const preference = text.replace(/i like/i, '').trim();
      if (preference) {
        await conversation.learnAboutUser(user, `Likes: ${preference}`).catch(() => {});
      }
    }

    if (text.toLowerCase().includes('my name is')) {
      const name = text.replace(/my name is/i, '').trim();
      if (name) {
        await conversation.learnAboutUser(user, `Name: ${name}`).catch(() => {});
      }
    }

  } catch (err) {
    console.error('Message handling error:', err);
    await ctx.reply("I'm having trouble responding right now. Try again in a moment.");
  }
});

// Graceful shutdown
process.once('SIGINT', () => {
  console.log('Shutting down...');
  telegramWebhookServer?.close();
  if (pollingActive) {
    bot.stop('SIGINT');
  }
});
process.once('SIGTERM', () => {
  console.log('Shutting down...');
  telegramWebhookServer?.close();
  if (pollingActive) {
    bot.stop('SIGTERM');
  }
});

// Start bot
async function start() {
  const gatewayMode = getGatewayMode();
  const relay = await startMissionRelay(bot);
  const webhook = await startTelegramWebhookServer(gatewayMode);

  // Check connections
  const [mindHealthy, sparkHealthy, ollamaHealthy] = await Promise.all([
    conversation.isAvailable(),
    spark.isAvailable(),
    llm.isAvailable()
  ]);

  console.log(`Mind V5: ${mindHealthy ? 'CONNECTED' : 'OFFLINE'}`);
  console.log(`Spark:   ${sparkHealthy ? 'CONNECTED' : 'OFFLINE'}`);
  console.log(`Ollama:  ${ollamaHealthy ? 'CONNECTED' : 'OFFLINE'}`);

  if (!mindHealthy) {
    console.warn('WARNING: Mind V5 is not running. Memories will not persist.');
  }

  if (!sparkHealthy) {
    console.warn('WARNING: Spark is not running. Intelligence features disabled.');
  }

  if (!ollamaHealthy) {
    console.warn('WARNING: Ollama is not running. Natural language disabled.');
    console.warn('Start Ollama with: ollama serve');
  }

  // Start polling
  console.log('Starting Spark Telegram bot...');
  console.log(`Mission relay: http://127.0.0.1:${relay.port}/spawner-events`);
  if (webhook) {
    console.log(`Telegram ingress: webhook ${webhook.path} on port ${webhook.port}`);
    console.log('Spark bot is running in webhook mode. Press Ctrl+C to stop.');
    return;
  }

  await ensurePollingAllowed();
  await bot.launch();
  pollingActive = true;
  console.log('Spark bot is running in polling mode. Press Ctrl+C to stop.');
}

start().catch((err) => {
  console.error('Failed to start bot:', err);
  process.exit(1);
});
