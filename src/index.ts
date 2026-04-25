import 'dotenv/config';
import { config as loadEnv } from 'dotenv';
import path from 'node:path';
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
import { createChipFromPrompt } from './chipCreate';
import { runChipLoop } from './chipLoop';
import { createSchedule, deleteSchedule, listSchedules, formatScheduleList, humanizeCron, formatNextFireLocal } from './schedule';
import {
  describeSparkAccessProfile,
  getSparkAccessProfile,
  normalizeSparkAccessProfile,
  renderSparkAccessStatus,
  setSparkAccessProfile,
  sparkAccessLabel,
  sparkAccessAllowsExternalResearch
} from './accessPolicy';
import {
  describeTelegramMissionLinkPreference,
  describeTelegramRelayVerbosity,
  getTelegramMissionLinkPreference,
  getTelegramRelayVerbosity,
  normalizeTelegramMissionLinkPreference,
  normalizeTelegramRelayVerbosity,
  registerMissionRelay,
  setTelegramMissionLinkPreference,
  setTelegramRelayVerbosity,
  startMissionRelay
} from './missionRelay';
import { buildDiagnoseReport } from './diagnose';
import { parseBuildIntent } from './buildIntent';
import { resolveMissionDefaultProvider } from './providerRouting';
import {
  buildIdeationFallbackReply,
  buildIdeationSystemHint,
  buildContextualImprovementGoal,
  buildDiagnosticFollowupTestReply,
  buildExternalResearchGoal,
  buildLocalSparkServiceClarificationReply,
  buildLocalSparkServiceReply,
  buildMemoryBridgeUnavailableReply,
  buildRecentBuildContextReply,
  extractPlainChatMemoryDirective,
  inferMissionGoalFromRecentContext,
  isBuildContextRecallQuestion,
  isDiagnosticFollowupTestQuestion,
  isAmbiguousLocalSparkServiceRequest,
  isExternalResearchRequest,
  isExplicitContextualBuildRequest,
  isLocalSparkServiceRequest,
  isLowInformationLlmReply,
  parseMissionUpdatePreferenceIntent,
  shouldSuppressBuilderReplyForPlainChat,
  shouldPreferConversationalIdeation
} from './conversationIntent';
import axios from 'axios';
import { acquireGatewayOwnership, releaseGatewayOwnership } from './gatewayOwnership';
import { requireRelaySecret, resolveTelegramLaunchConfig } from './launchMode';

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
const PUBLIC_ONBOARDING_COMMANDS = new Set(['/start', '/myid']);
let pollingActive = false;

function extractCommandName(text: string | undefined): string | null {
  if (!text?.startsWith('/')) {
    return null;
  }
  const command = text.split(/\s+/, 1)[0].split('@', 1)[0].toLowerCase();
  return command || null;
}

async function ensurePollingReady(): Promise<void> {
  const webhookInfo = await bot.telegram.getWebhookInfo();
  if (webhookInfo.url) {
    console.warn(`Telegram webhook was active at ${webhookInfo.url}; deleting it before long polling.`);
    await bot.telegram.deleteWebhook({ drop_pending_updates: false });
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
  if (isLowInformationLlmReply(builderReply.responseText)) {
    return false;
  }
  await ctx.reply(builderReply.responseText);
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

// Private-by-default access gate. Keep /start and /myid open so a new user can
// identify themselves to the operator without getting access to LLM or agent actions.
bot.use(async (ctx, next) => {
  const user = ctx.from;
  if (!user) {
    return next();
  }

  const text = 'text' in (ctx.message || {}) ? (ctx.message as any).text as string | undefined : undefined;
  const commandName = extractCommandName(text);
  if (commandName && PUBLIC_ONBOARDING_COMMANDS.has(commandName)) {
    return next();
  }

  if (conversation.isAllowed(user)) {
    return next();
  }

  const setupHint = conversation.hasAnyOperatorConfigured()
    ? 'Send /myid to the operator so they can add you to ALLOWED_TELEGRAM_IDS.'
    : 'Owner setup is not complete yet. Send /myid and add that ID to ADMIN_TELEGRAM_IDS.';
  await ctx.reply(`This Spark bot is private right now. ${setupHint}`);
});

// /start command
bot.start(async (ctx) => {
  const user = ctx.from;
  const name = user.first_name || user.username || 'friend';

  const builderBridge = await getBuilderBridgeStatus();

  const spawnerAvailable = await spawner.isAvailable();

  const lines = [
    `Hey ${name}! I'm Spark.`,
    '',
    'I remember conversations through the Builder memory path.',
    '',
    'Memory Commands:',
    '/remember <text> - Save something important',
    '/recall <topic> - Ask what I remember about a topic',
    '/about - Ask what I know about you',
    '/forget <text> - Ask me to forget a saved detail',
    '',
    'Spark Intelligence:',
    '/spark - System status'
  ];

  if (conversation.isAdmin(user)) {
    lines.push(
      '',
      'Spawner Control:',
      '/run <goal> - Start a mission in Spawner',
      '/board - Mission state report',
      '/updates <minimal|normal|verbose> - Tune live mission updates',
      '/access <1|2|3|4> - Choose Spark access level for this chat',
      '/mission <status|pause|resume|kill> <missionId> - Control a mission'
    );
  }

  lines.push('', 'Or just chat!');
  if (!builderBridge.available) {
    lines.push('', 'Builder memory bridge unavailable; local fallback may be used.');
  }

  await ctx.reply(lines.join('\n'));
  if (!spawnerAvailable && conversation.isAdmin(user)) {
    await ctx.reply('Spawner orchestration is offline.');
  }
});

// /status command
bot.command('status', async (ctx) => {
  await ctx.sendChatAction('typing');

  const builderBridge = await getBuilderBridgeStatus();
  const isAdmin = conversation.isAdmin(ctx.from);

  let status = 'System Status\n\n';

  status += `Builder memory bridge: ${builderBridge.available ? 'ONLINE' : 'OFFLINE'} (${builderBridge.mode})\n`;

  status += 'Spark launch core: ONLINE\n';
  status += 'Dashboard/resonance: deferred\n';

  if (isAdmin) status += '\nAdmin access';

  await ctx.reply(status);
});

// /diagnose command â€” one-shot full-stack health + per-provider ping test
bot.command('diagnose', async (ctx) => {
  if (!requireAdmin(ctx)) return;
  await ctx.sendChatAction('typing');
  await ctx.reply('Running diagnostics - pings 4 providers, takes ~30s...');
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
    (isAdmin ? 'You are an admin' : 'Add this ID to ADMIN_TELEGRAM_IDS in .env for admin access')
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
    await ctx.reply(buildMemoryBridgeUnavailableReply('remember'));
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
    await ctx.reply(buildMemoryBridgeUnavailableReply('recall'));
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
    await ctx.reply(buildMemoryBridgeUnavailableReply('about'));
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
  await ctx.reply(`Spark Intelligence\n\n${status}`);
});

// /resonance - resonance state
bot.command('resonance', async (ctx) => {
  await ctx.sendChatAction('typing');
  const resonance = await spark.getResonance();
  await ctx.reply(`Resonance\n\n${resonance}`);
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
  await ctx.reply('Processing queue...');
  const result = await spark.processQueue();
  await ctx.reply(result);
});

// /reflect - trigger deep reflection
bot.command('reflect', async (ctx) => {
  await ctx.sendChatAction('typing');
  await ctx.reply('Starting deep reflection...');
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
  if (providers.length === 1) return `On it - asking ${who}, give me a moment.`;
  return `On it - checking with ${who} in parallel. Hang on.`;
}

async function handleRunCommand(
  ctx: any,
  goal: string,
  providers: string[]
): Promise<string | null> {
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
    await ctx.reply(`Hit a snag starting that - ${result.error || 'something went wrong'}. Want me to retry?`);
    return null;
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
  return result.missionId;
}

async function handleBuildIntent(
  ctx: any,
  prd: string,
  projectName: string,
  projectPath: string | null,
  buildMode: 'direct' | 'advanced_prd',
  buildModeReason: string
): Promise<void> {
  await ctx.sendChatAction('typing');

  const spawnerUrl = process.env.SPAWNER_UI_URL || 'http://127.0.0.1:5173';
  const chatId = Number(ctx.chat.id);
  const requestId = `tg-build-${ctx.chat.id}-${ctx.message.message_id}-${Date.now()}`;

  const prdContent = projectPath
    ? `# ${projectName}\n\nBuild mode: ${buildMode}\nBuild mode reason: ${buildModeReason}\nTarget workspace: \`${projectPath}\`\n\n${prd}`
    : `# ${projectName}\n\nBuild mode: ${buildMode}\nBuild mode reason: ${buildModeReason}\n\n${prd}`;

  try {
    const res = await axios.post(
      `${spawnerUrl}/api/prd-bridge/write`,
      {
        content: prdContent,
        requestId,
        projectName,
        buildMode,
        buildModeReason,
        chatId: String(chatId),
        userId: String(ctx.from.id),
        options: { includeSkills: true, includeMCPs: false }
      },
      { timeout: 10000 }
    );

    if (!res.data?.success) {
      await ctx.reply(`Couldn't queue the PRD - ${res.data?.error || 'unknown error'}.`);
      return;
    }

    const ackLines = [
      `Got it. Project: ${projectName}`,
      `Build mode: ${buildMode === 'advanced_prd' ? 'Advanced PRD -> tasks' : 'Direct build'}`,
      projectPath ? `Target folder: ${projectPath}` : null,
      `Request ID: ${requestId}`,
      '',
      `Spark is turning this into a build plan. I'll DM you when the canvas is ready, then keep posting progress here.`
    ].filter(Boolean);
    await ctx.reply(ackLines.join('\n'));

    // Fire-and-forget: poll for analysis result, queue to canvas, notify user.
    void (async () => {
      const started = Date.now();
      const deadline = started + 180_000;
      const resultUrl = `${spawnerUrl}/api/prd-bridge/result?requestId=${encodeURIComponent(requestId)}`;
      const heartbeatThresholds = [25_000, 75_000, 135_000];
      let heartbeatIndex = 0;
      while (Date.now() < deadline) {
        await new Promise((r) => setTimeout(r, 4000));
        try {
          const elapsedMs = Date.now() - started;
          if (heartbeatIndex < heartbeatThresholds.length && elapsedMs >= heartbeatThresholds[heartbeatIndex]) {
            const elapsedSec = Math.round(elapsedMs / 1000);
            await bot.telegram.sendMessage(
              chatId,
              `Still working on ${projectName}. Spark is shaping the PRD and preparing the canvas (${elapsedSec}s elapsed).`
            ).catch(() => {});
            heartbeatIndex += 1;
          }

          const poll = await axios.get(resultUrl, { timeout: 3000 });
          if (poll.data?.found && poll.data?.result?.success) {
            try {
              const queue = await axios.post(
                `${spawnerUrl}/api/prd-bridge/load-to-canvas`,
                { requestId, autoRun: true },
                { timeout: 8000 }
              );
              const taskCount = queue.data?.taskCount;
              const elapsed = Math.round((Date.now() - started) / 1000);
              await bot.telegram.sendMessage(
                chatId,
                `Canvas ready for ${projectName}. ${taskCount} tasks queued in ${elapsed}s.\n\nOpen ${spawnerUrl}/canvas and it will start automatically. I'll post live progress and results here.`
              );
            } catch (queueErr: any) {
              await bot.telegram.sendMessage(
                chatId,
                `Analysis finished but I couldn't queue the canvas: ${queueErr.message || 'unknown'}.`
              );
            }
            return;
          }
        } catch {
          // keep polling
        }
      }
      await bot.telegram.sendMessage(
        chatId,
        `Analysis timed out after 180s for ${projectName}. The PRD is written at .spawner/pending-prd.md. Want me to retry?`
      );
    })();
  } catch (err: any) {
    const detail = err.response?.data?.error || err.message || 'unknown error';
    await ctx.reply(`Couldn't reach Spawner PRD bridge - ${detail}. Is spawner-ui running on ${spawnerUrl}?`);
  }
}

function parseRunCommand(text: string, command: string): string {
  const idx = text.indexOf(command);
  if (idx === -1) return text.trim();
  return text.slice(idx + command.length).trim();
}

const MISSION_DEFAULT_PROVIDER = resolveMissionDefaultProvider();

const RUN_VARIANTS: Array<{ name: string; providers: string[]; usage: string }> = [
  { name: 'run', providers: [MISSION_DEFAULT_PROVIDER], usage: `/run <goal>  (default: ${MISSION_DEFAULT_PROVIDER})` },
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

bot.command('chip', async (ctx) => {
  if (!requireAdmin(ctx)) return;

  const raw = ctx.message.text.replace('/chip', '').trim();
  const parts = raw.split(/\s+/);
  const action = parts.shift()?.toLowerCase() || '';
  const prompt = parts.join(' ').trim();

  if (action !== 'create' || !prompt) {
    return ctx.reply('Usage: /chip create <natural language description>');
  }

  await ctx.sendChatAction('typing');
  await ctx.reply('Scaffolding new domain chip from your brief...');

  const result = await createChipFromPrompt(prompt);

  if (!result.ok) {
    return ctx.reply(`Chip create failed: ${result.error || 'unknown error'}`);
  }

  const lines = [
    'Chip created successfully.',
    `Key: ${result.chipKey}`,
    `Path: ${result.chipPath}`,
    `Router invokable: ${result.routerInvokable ? 'yes' : 'no'}`,
  ];
  if (result.warnings && result.warnings.length > 0) {
    lines.push('Warnings:');
    for (const w of result.warnings) lines.push(`- ${w}`);
  }
  await ctx.reply(lines.join('\n'));
});

bot.command('loop', async (ctx) => {
  if (!requireAdmin(ctx)) return;

  const raw = ctx.message.text.replace('/loop', '').trim();
  const parts = raw.split(/\s+/).filter(Boolean);
  const chipKey = parts[0];
  const rounds = Math.max(1, Math.min(10, Number.parseInt(parts[1] ?? '3', 10) || 3));

  if (!chipKey) {
    return ctx.reply('Usage: /loop <chip_key> [rounds]\n' +
      'Runs a recursive self-improving loop: each round calls the chip\'s suggest hook for candidates, then evaluates them.\n' +
      'Example: /loop startup-yc 3');
  }

  const chatId = ctx.chat.id;
  await ctx.sendChatAction('typing');
  await ctx.reply(`Starting autoloop on ${chipKey} for ${rounds} round(s). This may take several minutes - I'll post the summary when it finishes.`);

  // Detach the heavy work so the Telegraf handler returns instantly;
  // the loop can exceed the handler timeout without failing the turn.
  void (async () => {
    try {
      const result = await runChipLoop(chipKey, rounds, 3);
      if (!result.ok) {
        await ctx.telegram.sendMessage(chatId, `Loop failed: ${result.error || 'unknown error'}`);
        return;
      }
      const lines = [
        `Loop complete: ${result.chipKey}`,
        `Rounds: ${result.roundsCompleted}/${result.totalRounds}`,
      ];
      if (result.history && result.history.length > 0) {
        lines.push('Per-round summary:');
        for (const r of result.history) {
          const verdict = r.best_verdict ?? '-';
          const metric = r.best_metric !== null && r.best_metric !== undefined ? r.best_metric.toFixed(3) : '-';
          lines.push(`  round ${r.round_index}: candidates=${r.suggestions_count} best_verdict=${verdict} best_metric=${metric}`);
        }
      } else {
        lines.push('No rounds executed.');
      }
      if (result.statusPath) lines.push(`Status file: ${result.statusPath}`);
      await ctx.telegram.sendMessage(chatId, lines.join('\n'));
    } catch (err: any) {
      await ctx.telegram.sendMessage(chatId, `Loop crashed: ${err?.message || String(err)}`);
    }
  })();
});

bot.command('schedule', async (ctx) => {
  if (!requireAdmin(ctx)) return;

  const raw = ctx.message.text.replace('/schedule', '').trim();
  // Expect: "<cron>" mission <goal>   OR   "<cron>" loop <chipKey> [rounds]
  const quoteMatch = raw.match(/^"([^"]+)"\s+(.*)$/);
  if (!quoteMatch) {
    return ctx.reply('Usage: /schedule "<cron>" mission <goal>\n       /schedule "<cron>" loop <chipKey> [rounds]\nExample: /schedule "*/5 * * * *" loop startup-yc 2');
  }
  const cron = quoteMatch[1].trim();
  const rest = quoteMatch[2].trim().split(/\s+/);
  const action = rest.shift()?.toLowerCase();
  if (action === 'mission') {
    const goal = rest.join(' ').trim();
    if (!goal) return ctx.reply('Missing mission goal.');
    const res = await createSchedule({
      cron,
      action: 'mission',
      payload: { goal },
      chatId: String(ctx.chat.id),
    });
    if (!res.ok || !res.schedule) return ctx.reply(`Schedule failed: ${res.error || 'unknown error'}`);
    return ctx.reply(
      `Schedule created.\nSchedule: ${humanizeCron(res.schedule.cron)}\nWhat it does: Run mission "${goal}"\nNext: ${formatNextFireLocal(res.schedule.nextFireAt)}\nId: ${res.schedule.id}`
    );
  }
  if (action === 'loop') {
    const chipKey = rest.shift();
    const rounds = Math.max(1, Math.min(10, Number.parseInt(rest[0] ?? '2', 10) || 2));
    if (!chipKey) return ctx.reply('Missing chipKey.');
    const res = await createSchedule({
      cron,
      action: 'loop',
      payload: { chipKey, rounds },
      chatId: String(ctx.chat.id),
    });
    if (!res.ok || !res.schedule) return ctx.reply(`Schedule failed: ${res.error || 'unknown error'}`);
    return ctx.reply(
      `Schedule created.\nSchedule: ${humanizeCron(res.schedule.cron)}\nWhat it does: Run ${rounds} loop round${rounds === 1 ? '' : 's'} on ${chipKey}\nNext: ${formatNextFireLocal(res.schedule.nextFireAt)}\nId: ${res.schedule.id}`
    );
  }
  return ctx.reply(`Unknown schedule action '${action}'. Use mission or loop.`);
});

bot.command('schedules', async (ctx) => {
  if (!requireAdmin(ctx)) return;
  const raw = ctx.message.text.replace('/schedules', '').trim();
  const parts = raw.split(/\s+/).filter(Boolean);
  const sub = parts.shift()?.toLowerCase();
  if (sub === 'delete') {
    const id = parts.shift();
    if (!id) return ctx.reply('Usage: /schedules delete <id>');
    const res = await deleteSchedule(id);
    return ctx.reply(res.ok ? `Deleted ${id}` : `Delete failed: ${res.error || 'not found'}`);
  }
  const res = await listSchedules();
  if (!res.ok) return ctx.reply(`List failed: ${res.error}`);
  await ctx.reply(formatScheduleList(res.schedules ?? []));
});

bot.command('updates', async (ctx) => {
  if (!requireAdmin(ctx)) return;

  const raw = ctx.message.text.replace('/updates', '').trim();
  if (!raw) {
    const current = await getTelegramRelayVerbosity(ctx.chat.id);
    const links = await getTelegramMissionLinkPreference(ctx.chat.id);
    await ctx.reply(
      `Live mission updates are set to ${current}.\n` +
      `${describeTelegramRelayVerbosity(current)}\n` +
      `Mission links are set to ${links}.\n` +
      `${describeTelegramMissionLinkPreference(links)}\n\n` +
      'Usage:\n' +
      '/updates minimal | /updates normal | /updates verbose\n' +
      '/updates links none | kanban | canvas | both'
    );
    return;
  }

  const linkMatch = raw.match(/^links?\s+(.+)$/i);
  if (linkMatch) {
    const nextLinks = normalizeTelegramMissionLinkPreference(linkMatch[1]);
    if (!nextLinks) {
      await ctx.reply('Choose one of: /updates links none, /updates links kanban, /updates links canvas, or /updates links both.');
      return;
    }
    await setTelegramMissionLinkPreference(ctx.chat.id, nextLinks);
    await ctx.reply(`Mission links set to ${nextLinks}.\n${describeTelegramMissionLinkPreference(nextLinks)}`);
    return;
  }

  const next = normalizeTelegramRelayVerbosity(raw);
  if (!next) {
    await ctx.reply('Choose one of: /updates minimal, /updates normal, /updates verbose, or /updates links kanban|canvas|both|none.');
    return;
  }

  await setTelegramRelayVerbosity(ctx.chat.id, next);
  await ctx.reply(`Live mission updates set to ${next}.\n${describeTelegramRelayVerbosity(next)}`);
});

bot.command('access', async (ctx) => {
  if (!requireAdmin(ctx)) return;

  const raw = ctx.message.text.replace('/access', '').trim();
  const current = await getSparkAccessProfile(ctx.chat.id);
  if (!raw || raw.toLowerCase() === 'status') {
    await ctx.reply(renderSparkAccessStatus(current));
    return;
  }

  const next = normalizeSparkAccessProfile(raw);
  if (!next) {
    await ctx.reply('Choose an access level: /access 1, /access 2, /access 3, or /access 4.');
    return;
  }

  await setSparkAccessProfile(ctx.chat.id, next);
  await conversation.learnAboutUser(ctx.from, `Spark access profile for this chat is ${next}. ${describeSparkAccessProfile(next)}`).catch(() => {});
  await ctx.reply(renderSparkAccessStatus(next));
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

  // Natural-language project-build intent: "build a ...", "make me a ...", etc.
  // Routes to Spawner UI's PRD bridge so the canvas auto-loads and Spark can
  // execute the project with the selected build mode.
  if (conversation.isAdmin(ctx.from)) {
    const recentMessages = await conversation.getRecentMessages(user, 8);
    const sessionContext = await conversation.getContext(user, text);
    const contextualTurns = [...recentMessages, sessionContext];

    const missionUpdatePreference = parseMissionUpdatePreferenceIntent(text);
    if (missionUpdatePreference) {
      await conversation.remember(user, text).catch(() => {});
      const lines: string[] = ['Saved your mission update preference.'];
      if (missionUpdatePreference.verbosity) {
        await setTelegramRelayVerbosity(ctx.chat.id, missionUpdatePreference.verbosity);
        lines.push(`Updates: ${missionUpdatePreference.verbosity} - ${describeTelegramRelayVerbosity(missionUpdatePreference.verbosity)}`);
      }
      if (missionUpdatePreference.links) {
        await setTelegramMissionLinkPreference(ctx.chat.id, missionUpdatePreference.links);
        lines.push(`Links: ${missionUpdatePreference.links} - ${describeTelegramMissionLinkPreference(missionUpdatePreference.links)}`);
      }
      await ctx.reply(lines.join('\n'));
      return;
    }

    const localServiceContext = contextualTurns.join('\n');
    if (isLocalSparkServiceRequest(text, localServiceContext)) {
      await conversation.remember(user, text).catch(() => {});
      await ctx.reply(buildLocalSparkServiceReply(await spawner.isAvailable()));
      return;
    }

    if (isAmbiguousLocalSparkServiceRequest(text, localServiceContext)) {
      await conversation.remember(user, text).catch(() => {});
      await ctx.reply(buildLocalSparkServiceClarificationReply());
      return;
    }

    if (isBuildContextRecallQuestion(text)) {
      const recentBuildContext = buildRecentBuildContextReply(contextualTurns);
      if (recentBuildContext) {
        await ctx.reply(recentBuildContext);
        return;
      }
    }

    if (isDiagnosticFollowupTestQuestion(text)) {
      const reply = buildDiagnosticFollowupTestReply(sessionContext);
      if (reply) {
        await conversation.remember(user, text).catch(() => {});
        await ctx.reply(reply);
        return;
      }
    }

    if (isExplicitContextualBuildRequest(text)) {
      const improvementGoal = buildContextualImprovementGoal(text, contextualTurns);
      if (improvementGoal) {
        console.log(`[ConversationIntent] inferred contextual improvement mission user=${ctx.from?.id} textLen=${text.length}`);
        await conversation.remember(user, text).catch(() => {});
        const missionId = await handleRunCommand(ctx, improvementGoal, [MISSION_DEFAULT_PROVIDER]);
        if (missionId) {
          await conversation.learnAboutUser(user, `Started Spawner mission ${missionId} to improve the Spark Diagnostic Agent integration from Telegram context.`).catch(() => {});
        }
        return;
      }
    }

    if (isExternalResearchRequest(text)) {
      const accessProfile = await getSparkAccessProfile(ctx.chat.id);
      if (!sparkAccessAllowsExternalResearch(accessProfile)) {
        await ctx.reply(
          [
            `I can inspect public GitHub/web targets through a Spawner mission, but this chat is at ${sparkAccessLabel(accessProfile)} right now.`,
            'Switch to `/access 3` for public research/repo inspection, or `/access 4` when you also want workspace build permissions.'
          ].join('\n')
        );
        return;
      }
      await conversation.remember(user, text).catch(() => {});
      const missionId = await handleRunCommand(ctx, buildExternalResearchGoal(text, contextualTurns), [MISSION_DEFAULT_PROVIDER]);
      if (missionId) {
        await conversation.learnAboutUser(user, `Started Spawner mission ${missionId} to inspect an external GitHub/web target from Telegram.`).catch(() => {});
      }
      return;
    }

    const inferredMissionGoal = inferMissionGoalFromRecentContext(text, recentMessages);
    if (inferredMissionGoal) {
      console.log(`[ConversationIntent] inferred mission from follow-up user=${ctx.from?.id} textLen=${text.length}`);
      await conversation.remember(user, text).catch(() => {});
      const missionId = await handleRunCommand(ctx, inferredMissionGoal, [MISSION_DEFAULT_PROVIDER]);
      if (missionId) {
        await conversation.learnAboutUser(user, `Started Spawner mission ${missionId} from Telegram follow-up: ${inferredMissionGoal.slice(0, 220)}`).catch(() => {});
      }
      return;
    }

    await conversation.remember(user, text).catch(() => {});

    if (shouldPreferConversationalIdeation(text)) {
      console.log(`[ConversationIntent] ideation route user=${ctx.from?.id} textLen=${text.length}`);
      await ctx.sendChatAction('typing');
      const memories = await conversation.getContext(user, text);
      const llmResponse = await llm.chat(text, buildIdeationSystemHint(text), memories);
      const response = isLowInformationLlmReply(llmResponse)
        ? buildIdeationFallbackReply(text)
        : llmResponse;
      await ctx.reply(response);
      return;
    }

    const buildIntent = parseBuildIntent(text);
    if (buildIntent) {
      await handleBuildIntent(
        ctx,
        buildIntent.prd,
        buildIntent.projectName,
        buildIntent.projectPath,
        buildIntent.buildMode,
        buildIntent.buildModeReason
      );
      return;
    }

    // Single-provider run intent: "minimax, draft...", "ask claude to...", "all models: ..."
    const intent = parseNaturalRunIntent(text);
    if (intent) {
      await handleRunCommand(ctx, intent.goal, intent.providers);
      return;
    }
  }

  // Show typing indicator
  await ctx.sendChatAction('typing');

  try {
    const memoryDirective = extractPlainChatMemoryDirective(text);
    if (memoryDirective) {
      await conversation.learnAboutUser(user, `User asked Spark to remember: ${memoryDirective}`).catch(() => {});
    }

    const builderReply = await runBuilderTelegramBridge(ctx.update as unknown as Record<string, unknown>);
    console.log(`[Bridge] user=${ctx.from?.id} used=${builderReply.used} mode=${builderReply.bridgeMode} routing=${builderReply.routingDecision} textLen=${(builderReply.responseText || '').length}`);
    if (builderReply.used && builderReply.bridgeMode !== 'bridge_error') {
      if (!shouldSuppressBuilderReplyForPlainChat(builderReply.responseText)) {
        if (memoryDirective) {
          await conversation.remember(user, text).catch(() => {});
        }
        await ctx.reply(builderReply.responseText);
        return;
      }
      console.warn(`[Bridge] ignored non-chat Builder reply routing=${builderReply.routingDecision}`);
    }

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
  void releaseGatewayOwnership();
  if (pollingActive) {
    bot.stop('SIGINT');
  }
});
process.once('SIGTERM', () => {
  console.log('Shutting down...');
  void releaseGatewayOwnership();
  if (pollingActive) {
    bot.stop('SIGTERM');
  }
});

// Start bot
async function start() {
  const launchConfig = resolveTelegramLaunchConfig();
  requireRelaySecret();

  if (!TELEGRAM_SMOKE_MODE) {
    await acquireGatewayOwnership({
      botToken,
      mode: launchConfig.mode
    });
  }
  const relay = await startMissionRelay(bot);

  // Check launch-critical connections.
  const llmHealthy = await llm.isAvailable();

  console.log('Spark:  LAUNCH CORE READY');
  console.log(`LLM:    ${llmHealthy ? 'CONNECTED' : 'OFFLINE'}`);

  if (!llmHealthy) {
    console.warn('WARNING: LLM provider is not reachable. Natural language disabled.');
  }

  // Start polling
  console.log('Starting Spark Telegram bot...');
  console.log(`Mission relay: http://127.0.0.1:${relay.port}/spawner-events`);
  if (TELEGRAM_SMOKE_MODE) {
    console.log('Telegram smoke mode: local relay is running; Telegram API calls are disabled.');
    return;
  }

  await ensurePollingReady();
  await bot.launch();
  pollingActive = true;
  console.log('Spark bot is running in polling mode. Press Ctrl+C to stop.');
}

start().catch((err) => {
  void releaseGatewayOwnership();
  console.error('Failed to start bot:', err);
  process.exit(1);
});
