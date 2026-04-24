import 'dotenv/config';
import { config as loadEnv } from 'dotenv';
import path from 'node:path';
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import { existsSync } from 'node:fs';
import { Telegraf } from 'telegraf';

// Load .env.override LAST with override=true. Wins over anything spark-cli
// rewrites in .env. Never committed (.gitignored).
loadEnv({ path: path.join(__dirname, '..', '.env.override'), override: true });
import { message } from 'telegraf/filters';
import { conversation } from './conversation';
import { getBuilderBridgeStatus, runBuilderTelegramBridge } from './builderBridge';
import { spark } from './spark';
import { llm } from './llm';
import { spawner } from './spawner';
import { registerMissionRelay, startMissionRelay } from './missionRelay';
import { buildDiagnoseReport } from './diagnose';
import { enqueueTelegramUpdate, startTelegramInboxProcessor } from './telegramInbox';
import { acquireGatewayOwnership, releaseGatewayOwnership } from './gatewayOwnership';
import { readJsonFile, resolveStatePath, writeJsonAtomic } from './jsonState';

const TELEGRAM_SMOKE_MODE = process.env.TELEGRAM_SMOKE_MODE === '1';

// Validate environment
if (!process.env.BOT_TOKEN && !TELEGRAM_SMOKE_MODE) {
  console.error('ERROR: BOT_TOKEN not set in .env');
  console.error('Get one from @BotFather on Telegram');
  process.exit(1);
}

const botToken = process.env.BOT_TOKEN || '0:telegram-smoke-token';
const bot = new Telegraf(botToken);

// Rate limiting (simple in-memory)
const userLastAction = new Map<number, number>();
const RATE_LIMIT_MS = 1000; // 1 second between messages
const webhookUpdateCache = new Map<number, number>();
const WEBHOOK_UPDATE_TTL_MS = 5 * 60 * 1000;
const WEBHOOK_STATE_PATH = resolveStatePath('.spark-telegram-webhook-state.json');
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
    const parsed = await readJsonFile<PersistedWebhookState>(WEBHOOK_STATE_PATH);
    if (!parsed) {
      return;
    }
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
    await writeJsonAtomic(WEBHOOK_STATE_PATH, state);
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
      if (req.method === 'GET' && reqUrl.pathname === '/healthz') {
        writeJson(res, 200, {
          ok: true,
          service: 'spark-telegram-bot',
          mode,
          webhookPath: webhook.path
        });
        return;
      }

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

      try {
        await enqueueTelegramUpdate(payload as Record<string, unknown>);
      } catch (error) {
        console.error('Telegram webhook enqueue failed:', error);
        writeJson(res, 500, { ok: false, error: 'enqueue_failed' });
        return;
      }

      writeJson(res, 200, { ok: true });
    });

    await new Promise<void>((resolve, reject) => {
      telegramWebhookServer!.once('error', reject);
      telegramWebhookServer!.listen(webhook.port, '0.0.0.0', () => {
        telegramWebhookServer!.off('error', reject);
        resolve();
      });
    });
  }

  if (!TELEGRAM_SMOKE_MODE) {
    await bot.telegram.setWebhook(webhook.url, {
      secret_token: webhook.secret
    });
  }

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

function buildUpdateWithText(update: Record<string, unknown>, text: string): Record<string, unknown> {
  const cloned = JSON.parse(JSON.stringify(update)) as Record<string, unknown>;
  const messagePayload = cloned.message;
  if (!messagePayload || typeof messagePayload !== 'object') {
    throw new Error('Telegram update is missing a message payload.');
  }
  (messagePayload as Record<string, unknown>).text = text;
  return cloned;
}

async function replyViaBuilder(ctx: any, text: string): Promise<boolean> {
  const builderReply = await runBuilderTelegramBridge(buildUpdateWithText(ctx.update as Record<string, unknown>, text));
  if (!builderReply.used || builderReply.bridgeMode === 'bridge_error') {
    return false;
  }
  await ctx.reply(builderReply.responseText || "I'm here, but I couldn't generate a Builder reply right now.");
  return true;
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

  const builderBridge = await getBuilderBridgeStatus();

  const [sparkAvailable, spawnerAvailable] = await Promise.all([
    spark.isAvailable(),
    spawner.isAvailable()
  ]);

  await ctx.reply(
    `Hey ${name}! I'm Spark ⚡\n\n` +
    `I remember conversations through the Builder memory path.\n\n` +
    `Memory Commands:\n` +
    `/remember <text> - Save something important\n` +
    `/recall <topic> - Ask what I remember about a topic\n` +
    `/about - Ask what I know about you\n` +
    `/forget <text> - Ask me to forget a saved detail\n\n` +
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
    (builderBridge.available ? '' : '\n⚠️ Builder memory bridge unavailable; local fallback may be used') +
    (sparkAvailable ? '' : '\n⚠️ Spark offline')
  );
  if (!spawnerAvailable && conversation.isAdmin(user)) {
    await ctx.reply('Spawner orchestration is offline.');
  }
});

// /status command
bot.command('status', async (ctx) => {
  await ctx.sendChatAction('typing');

  const [builderBridge, sparkHealthy] = await Promise.all([
    getBuilderBridgeStatus(),
    spark.isAvailable()
  ]);
  const isAdmin = conversation.isAdmin(ctx.from);

  let status = '⚡ System Status\n\n';

  status += `🧠 Builder memory bridge: ${builderBridge.available ? 'ONLINE' : 'OFFLINE'} (${builderBridge.mode})\n`;

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

// /diagnose command — one-shot full-stack health + per-provider ping test
bot.command('diagnose', async (ctx) => {
  if (!requireAdmin(ctx)) return;
  await ctx.sendChatAction('typing');
  await ctx.reply('Running diagnostics — pings 4 providers, takes ~30s...');
  try {
    const report = await buildDiagnoseReport(ctx.from.id);
    // Telegram limit is 4096 chars; diagnose is always well under.
    await ctx.reply(report);
  } catch (err: any) {
    await ctx.reply(`Diagnose failed: ${err.message || err}`);
  }
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
    if (await replyViaBuilder(ctx, `Please remember this: ${text}`)) {
      return;
    }
    await conversation.storePreference(ctx.from, text);
    await ctx.reply(`Got it! I'll remember: "${text}"`);
  } catch (err) {
    console.error('Failed to remember:', err);
    await ctx.reply('Sorry, I couldn\'t save that right now.');
  }
});

// /recall command
bot.command('recall', async (ctx) => {
  const query = ctx.message.text.replace('/recall', '').trim();

  if (!query) {
    return ctx.reply('Usage: /recall <topic to recall>');
  }

  try {
    if (await replyViaBuilder(ctx, `What do you remember about ${query}?`)) {
      return;
    }
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
    await ctx.reply('Sorry, I couldn\'t search my memories right now.');
  }
});

// /about command - what do I know about you
bot.command('about', async (ctx) => {
  try {
    if (await replyViaBuilder(ctx, 'What do you know about me?')) {
      return;
    }
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

// /forget command - prefer Builder deletion flow
bot.command('forget', async (ctx) => {
  const target = ctx.message.text.replace('/forget', '').trim();
  if (target) {
    try {
      if (await replyViaBuilder(ctx, `Forget ${target}.`)) {
        return;
      }
    } catch (err) {
      console.error('Failed to forget via Builder bridge:', err);
    }
  }
  await ctx.reply(
    'Usage: /forget <thing to forget>\n\n' +
    'If the Builder memory bridge is unavailable, try again once it is back or contact the bot admin.'
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

const PROVIDER_LABELS: Record<string, string> = {
  minimax: 'MiniMax',
  zai: 'Z.AI GLM',
  claude: 'Claude',
  codex: 'Codex'
};

const PROVIDER_ALIASES: Record<string, string> = {
  minimax: 'minimax', mini: 'minimax', mm: 'minimax',
  claude: 'claude', cla: 'claude',
  glm: 'zai', zai: 'zai', 'z.ai': 'zai',
  codex: 'codex', cod: 'codex', gpt5: 'codex', 'gpt-5': 'codex'
};

export function parseNaturalRunIntent(text: string): { providers: string[]; goal: string } | null {
  const trimmed = text.trim();
  if (!trimmed || trimmed.length < 4) return null;

  const allMatch = trimmed.match(/^(?:ask\s+|use\s+|using\s+|with\s+)?(?:all(?:\s+(?:four|models|of\s+them))?|everyone|everybody|every\s+model)\s*[,:\-\u2014]?\s*(.+)$/i);
  if (allMatch && allMatch[1]) {
    return { providers: ['minimax', 'zai', 'claude', 'codex'], goal: allMatch[1].trim() };
  }

  const compareMatch = trimmed.match(/^(?:compare|consensus(?:\s+of)?)\s+(\w[\w.]*)\s+(?:and|vs|versus|with|\+|&)\s+(\w[\w.]*)(?:\s+(?:on|about|for))?\s*[,:\-\u2014]?\s*(.+)$/i);
  if (compareMatch) {
    const p1 = PROVIDER_ALIASES[compareMatch[1].toLowerCase()];
    const p2 = PROVIDER_ALIASES[compareMatch[2].toLowerCase()];
    if (p1 && p2 && p1 !== p2) {
      return { providers: [p1, p2], goal: compareMatch[3].trim() };
    }
  }

  const verbMatch = trimmed.match(/^(?:ask|use|using|with|have|run(?:\s+(?:this|it))?\s+(?:with|on|by))\s+(\w[\w.]*)\s+(?:and|\+|&)\s+(\w[\w.]*)(?:\s+(?:to|for))?\s*[,:\-\u2014]?\s*(.+)$/i);
  if (verbMatch) {
    const p1 = PROVIDER_ALIASES[verbMatch[1].toLowerCase()];
    const p2 = PROVIDER_ALIASES[verbMatch[2].toLowerCase()];
    if (p1 && p2 && p1 !== p2) {
      return { providers: [p1, p2], goal: verbMatch[3].trim() };
    }
  }

  const singleVerbMatch = trimmed.match(/^(?:ask|use|using|with|have|run(?:\s+(?:this|it))?\s+(?:with|on|by))\s+(\w[\w.]*)(?:\s+(?:to|for))?\s*[,:\-\u2014]?\s*(.+)$/i);
  if (singleVerbMatch) {
    const p = PROVIDER_ALIASES[singleVerbMatch[1].toLowerCase()];
    if (p) return { providers: [p], goal: singleVerbMatch[2].trim() };
  }

  const leadMatch = trimmed.match(/^(\w[\w.]*)\s*[,:\-\u2014]\s*(.{3,})$/i);
  if (leadMatch) {
    const p = PROVIDER_ALIASES[leadMatch[1].toLowerCase()];
    if (p) return { providers: [p], goal: leadMatch[2].trim() };
  }

  return null;
}

function humanProviderList(providers: string[]): string {
  const labels = providers.map((id) => PROVIDER_LABELS[id] || id);
  if (labels.length === 1) return labels[0];
  if (labels.length === 2) return `${labels[0]} and ${labels[1]}`;
  return labels.slice(0, -1).join(', ') + ', and ' + labels[labels.length - 1];
}

function humanAck(providers: string[]): string {
  const who = humanProviderList(providers);
  if (providers.length === 1) return `On it — asking ${who}, give me a moment.`;
  return `On it — checking with ${who} in parallel. Hang on.`;
}

async function handleRunCommand(
  ctx: any,
  goal: string,
  providers: string[]
): Promise<void> {
  await ctx.sendChatAction('typing');

  const requestId = `tg-${ctx.chat.id}-${ctx.message.message_id}`;
  const result = await spawner.runGoal({
    goal,
    chatId: String(ctx.chat.id),
    requestId,
    userId: String(ctx.from.id),
    providers,
    promptMode: 'simple'
  });

  if (!result.success || !result.missionId) {
    await ctx.reply(`Hit a snag starting that — ${result.error || 'something went wrong'}. Want me to retry?`);
    return;
  }

  await ctx.reply(humanAck(result.providers || providers));

  await registerMissionRelay({
    missionId: result.missionId,
    chatId: String(ctx.chat.id),
    userId: String(ctx.from.id),
    requestId: result.requestId || requestId,
    goal,
    createdAt: new Date().toISOString(),
    updateId: typeof ctx.update.update_id === 'number' ? ctx.update.update_id : undefined
  });
}

function parseRunCommand(text: string, command: string): string {
  const idx = text.indexOf(command);
  if (idx === -1) return text.trim();
  return text.slice(idx + command.length).trim();
}

const VALID_PROVIDER_IDS = new Set(['minimax', 'zai', 'claude', 'codex']);
const BOT_DEFAULT_PROVIDER = (() => {
  const raw = (process.env.BOT_DEFAULT_PROVIDER || 'codex').trim().toLowerCase();
  return VALID_PROVIDER_IDS.has(raw) ? raw : 'codex';
})();

const RUN_VARIANTS: Array<{ name: string; providers: string[]; usage: string }> = [
  { name: 'run', providers: [BOT_DEFAULT_PROVIDER], usage: `/run <goal>  (default: ${BOT_DEFAULT_PROVIDER})` },
  { name: 'runminimax', providers: ['minimax'], usage: '/runminimax <goal>' },
  { name: 'runglm', providers: ['zai'], usage: '/runglm <goal>  (Z.AI GLM)' },
  { name: 'runzai', providers: ['zai'], usage: '/runzai <goal>' },
  { name: 'runclaude', providers: ['claude'], usage: '/runclaude <goal>' },
  { name: 'runcodex', providers: ['codex'], usage: '/runcodex <goal>' },
  { name: 'run2', providers: ['minimax', 'zai'], usage: '/run2 <goal>  (consensus: minimax + zai)' },
  { name: 'runall', providers: ['minimax', 'zai', 'claude', 'codex'], usage: '/runall <goal>  (all 4 providers)' }
];

for (const variant of RUN_VARIANTS) {
  bot.command(variant.name, async (ctx) => {
    if (!requireAdmin(ctx)) return;
    const goal = parseRunCommand(ctx.message.text, `/${variant.name}`);
    if (!goal) {
      return ctx.reply(`Usage: ${variant.usage}`);
    }
    await handleRunCommand(ctx, goal, variant.providers);
  });
}

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

  if (text.startsWith('/')) {
    return;
  }

  // Natural-language run intent: "minimax, draft...", "ask claude to...", "all models: ..."
  // Caught BEFORE the Builder bridge so provider routing wins over chip routing.
  // Use side-effect-free admin check so non-admin messages fall through to chip router silently.
  if (conversation.isAdmin(ctx.from)) {
    const intent = parseNaturalRunIntent(text);
    if (intent) {
      await handleRunCommand(ctx, intent.goal, intent.providers);
      return;
    }
  }

  // Show typing indicator
  await ctx.sendChatAction('typing');

  try {
    const builderReply = await runBuilderTelegramBridge(ctx.update as unknown as Record<string, unknown>);
    console.log(`[Bridge] user=${ctx.from?.id} used=${builderReply.used} mode=${builderReply.bridgeMode} routing=${builderReply.routingDecision} textLen=${(builderReply.responseText || '').length}`);
    if (builderReply.used && builderReply.bridgeMode !== 'bridge_error') {
      await ctx.reply(builderReply.responseText || "I'm here, but I couldn't generate a Builder reply right now.");
      return;
    }

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
  void releaseGatewayOwnership();
  if (pollingActive) {
    bot.stop('SIGINT');
  }
});
process.once('SIGTERM', () => {
  console.log('Shutting down...');
  telegramWebhookServer?.close();
  void releaseGatewayOwnership();
  if (pollingActive) {
    bot.stop('SIGTERM');
  }
});

// Start bot
async function start() {
  if (TELEGRAM_SMOKE_MODE && getGatewayMode() !== 'webhook') {
    throw new Error('TELEGRAM_SMOKE_MODE requires TELEGRAM_GATEWAY_MODE=webhook so /healthz can be smoke-tested locally.');
  }

  if (!TELEGRAM_SMOKE_MODE) {
    await startTelegramInboxProcessor(bot);
  }
  const gatewayMode = getGatewayMode();
  if (!TELEGRAM_SMOKE_MODE) {
    await acquireGatewayOwnership({
      botToken,
      mode: gatewayMode,
      webhookUrl: process.env.TELEGRAM_WEBHOOK_URL?.trim() || null
    });
  }
  const relay = await startMissionRelay(bot);
  const webhook = await startTelegramWebhookServer(gatewayMode);

  // Check connections
  const [sparkHealthy, llmHealthy] = await Promise.all([
    spark.isAvailable(),
    llm.isAvailable()
  ]);

  console.log(`Spark:  ${sparkHealthy ? 'CONNECTED' : 'OFFLINE'}`);
  console.log(`LLM:    ${llmHealthy ? 'CONNECTED' : 'OFFLINE'}`);

  if (!sparkHealthy) {
    console.warn('WARNING: Spark is not running. Intelligence features disabled.');
  }

  if (!llmHealthy) {
    console.warn('WARNING: LLM provider is not reachable. Natural language disabled.');
  }

  // Start polling
  console.log('Starting Spark Telegram bot...');
  console.log(`Mission relay: http://127.0.0.1:${relay.port}/spawner-events`);
  if (TELEGRAM_SMOKE_MODE) {
    console.log('Telegram smoke mode: local relay/webhook are running; Telegram API calls are disabled.');
  }
  if (webhook) {
    console.log(`Telegram ingress: webhook ${webhook.path} on port ${webhook.port}`);
    console.log('Spark bot is running in webhook mode. Press Ctrl+C to stop.');
    return;
  }

  await ensurePollingAllowed();
  void bot.launch().catch((err) => {
    pollingActive = false;
    void releaseGatewayOwnership();
    console.error('Failed to start bot:', err);
    process.exit(1);
  });
  pollingActive = true;
  console.log('Spark bot is running in polling mode. Press Ctrl+C to stop.');
}

start().catch((err) => {
  void releaseGatewayOwnership();
  console.error('Failed to start bot:', err);
  process.exit(1);
});
