import 'dotenv/config';
import { config as loadEnv } from 'dotenv';
import { appendFile, mkdir } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { Telegraf } from 'telegraf';

// Load .env.override LAST with override=true. Wins over anything spark-cli
// rewrites in .env. Never committed (.gitignored).
loadEnv({ path: path.join(__dirname, '..', '.env.override'), override: true });
import { message } from 'telegraf/filters';
import {
  conversation,
  isPendingTaskRecoveryQuestion,
  renderPendingTaskRecoveryReply
} from './conversation';
import { renderChoiceContextAcknowledgement, renderConversationFrameContext, type ConversationFrame } from './conversationFrame';
import {
  getBuilderBridgeStatus,
  runBuilderConversationColdContext,
  runBuilderDiagnosticsScan,
  runBuilderTelegramBridge
} from './builderBridge';
import { spark } from './spark';
import { generateBuildClarificationMicrocopy, llm, type BuildClarificationMicrocopy } from './llm';
import { sanitizeOutbound } from './outboundSanitize';
import { installConsoleRedaction } from './redaction';
import { localServiceTimeoutMs, postLocalServiceWithRetry, spawner } from './spawner';
import { createChipFromPrompt } from './chipCreate';
import { runChipLoop } from './chipLoop';
import {
  renderLocalWorkspaceInspectionReply,
  summarizeLocalWorkspaces
} from './localWorkspace';
import { createSchedule, deleteSchedule, listSchedules, formatScheduleList, humanizeCron, formatNextFireLocal } from './schedule';
import {
  describeSparkAccessProfile,
  getConfiguredSparkAccessProfile,
  getSparkAccessProfile,
  normalizeSparkAccessProfile,
  renderSparkAccessChangeConfirmation,
  renderSparkAccessDenial,
  renderSparkAccessOnboarding,
  renderSparkAccessRuntimeHint,
  renderSparkAccessStatus,
  setSparkAccessProfile,
  sparkAccessAllows,
  sparkMissionNeedsOperatingSystemAccess,
  validateSparkAccessProfileForRuntime,
  type SparkAccessRequirement
} from './accessPolicy';
import {
  describeTelegramMissionLinkPreference,
  describeTelegramRelayVerbosity,
  getTelegramMissionLinkPreference,
  getTelegramRelayVerbosity,
  normalizeTelegramMissionLinkPreference,
  normalizeTelegramRelayVerbosity,
  getTelegramRelayIdentity,
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
  formatMissionUpdatePreferenceAcknowledgement,
  inferDefaultBuildFromRecentScoping,
  inferMissionGoalFromRecentContext,
  isBuildContextRecallQuestion,
  isDiagnosticFollowupTestQuestion,
  isDiagnosticsScanRequest,
  isMissionExecutionConfirmation,
  isAmbiguousLocalSparkServiceRequest,
  isExternalResearchRequest,
  isExplicitContextualBuildRequest,
  isLocalSparkServiceRequest,
  isLowInformationLlmReply,
  parseNaturalChipCreateIntent,
  parseSpawnerBoardNaturalIntent,
  parseMissionUpdatePreferenceIntent,
  renderChatRuntimeFailureReply,
  shouldSuppressBuilderReplyForPlainChat,
  shouldPreferConversationalIdeation
} from './conversationIntent';
import axios from 'axios';
import { getTierForUser } from './userTier';
import { acquireGatewayOwnership, releaseGatewayOwnership } from './gatewayOwnership';
import { requireRelaySecret, resolveTelegramLaunchConfig } from './launchMode';
import { renderSparkErrorReply } from './errorExplain';
import {
  normalizeModelProvider,
  normalizeModelRole,
  renderModelRecommendations,
  renderModelStatus,
  switchModelRoute
} from './modelSwitch';
import { telegramHandlerTimeoutMs } from './timeoutConfig';
import {
  buildContextualImageUpdate,
  imageMessageHasCaption,
  isTelegramImageMessage,
  telegramImageMemoryText
} from './telegramImageBridge';

const TELEGRAM_SMOKE_MODE = process.env.TELEGRAM_SMOKE_MODE === '1';

installConsoleRedaction();

// Validate environment
if (!process.env.BOT_TOKEN && !TELEGRAM_SMOKE_MODE) {
  console.error('ERROR: BOT_TOKEN not set in .env');
  console.error('Get one from @BotFather on Telegram');
  process.exit(1);
}

const botToken = process.env.BOT_TOKEN || '0:telegram-smoke-token';
const bot = new Telegraf(botToken, {
  handlerTimeout: telegramHandlerTimeoutMs()
});

async function safeSendChatAction(ctx: any, action: 'typing'): Promise<void> {
  try {
    await ctx.sendChatAction(action);
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    console.warn(`[Telegram] ignored sendChatAction failure: ${detail}`);
  }
}

function nodeOutboundAuditPath(): string {
  return (
    process.env.SPARK_NODE_OUTBOUND_AUDIT_PATH ||
    path.join(os.homedir(), '.spark', 'state', 'spark-telegram-bot', 'node-outbound-audit.jsonl')
  );
}

function previewAuditText(text: string, limit = 240): string {
  const normalized = text.replace(/\s+/g, ' ').trim();
  return normalized.length > limit ? `${normalized.slice(0, limit - 1)}...` : normalized;
}

function recordNodeOutboundDelivery(chatId: unknown, deliveredText: unknown): void {
  const text = typeof deliveredText === 'string' ? deliveredText : String(deliveredText ?? '');
  const auditPath = nodeOutboundAuditPath();
  const record = {
    ts: new Date().toISOString(),
    event: 'telegram_node_delivered',
    chat_id: String(chatId ?? ''),
    text_length: text.length,
    text_preview: previewAuditText(text),
    delivered_text: text,
  };
  mkdir(path.dirname(auditPath), { recursive: true })
    .then(() => appendFile(auditPath, `${JSON.stringify(record)}\n`, 'utf-8'))
    .catch((error) => {
      console.warn('[OutboundAudit] failed to write node delivery audit:', error);
    });
}

// Outbound sanitizer: wrap bot.telegram.sendMessage so every Telegram
// reply (ctx.reply, ctx.telegram.sendMessage, bot.telegram.sendMessage)
// runs through the deterministic voice rules before delivery. Persona
// forbids em dashes; production telemetry showed ~50% leak rate before
// this shim. Mirrors spark_character.output_sanitizer (Python).
const _origSendMessage = bot.telegram.sendMessage.bind(bot.telegram);
bot.telegram.sendMessage = ((chatId: any, text: any, extra?: any) => {
  const cleaned = typeof text === 'string' ? sanitizeOutbound(text) : text;
  const delivery = _origSendMessage(chatId, cleaned, extra);
  delivery.then(() => recordNodeOutboundDelivery(chatId, cleaned)).catch(() => {});
  return delivery;
}) as typeof bot.telegram.sendMessage;

bot.use(async (ctx, next) => {
  const originalReply = ctx.reply.bind(ctx);
  ctx.reply = ((text: any, extra?: any) => {
    const cleaned = typeof text === 'string' ? sanitizeOutbound(text) : text;
    return originalReply(cleaned, extra);
  }) as typeof ctx.reply;
  await next();
});

// Rate limiting (simple in-memory)
const userLastAction = new Map<number, number>();
const RATE_LIMIT_MS = 1000; // 1 second between messages

// Pending clarification state — keyed by `${chatId}-${userId}`. In-memory
// only for v1; doesn't survive bot restart. /clarify reads + clears.
interface PendingClarification {
  requestId: string;
  prd: string;
  projectName: string;
  projectPath: string | null;
  buildMode: 'direct' | 'advanced_prd';
  buildModeReason: string;
  questions: string[];
  addedAssumptions: string[];
  timestamp: number;
}
const pendingClarifications = new Map<string, PendingClarification>();
interface PendingDomainChipBuild {
  brief: string;
  prd: string;
  projectName: string;
  buildMode: 'direct' | 'advanced_prd';
  buildModeReason: string;
  timestamp: number;
}
const pendingDomainChipBuilds = new Map<string, PendingDomainChipBuild>();
const CLARIFICATION_TTL_MS = 30 * 60 * 1000; // 30 minutes
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
  ctx.reply(renderSparkErrorReply(err, 'telegram', ctx.from ? conversation.isAdmin(ctx.from) : false)).catch(() => {});
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
      '/workspaces - Show local project folders',
      '/model - Show or change Agent/Mission model routing',
      '/models - Show recommended model versions',
      '/updates <minimal|normal|verbose> - Tune live mission updates',
      '/access <1|2|3|4> - Choose Chat Only, Build When Asked, Research + Build, or Full Access',
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
  if (conversation.isAdmin(user)) {
    const configuredAccess = await getConfiguredSparkAccessProfile(ctx.chat.id);
    if (!configuredAccess) {
      const defaultAccess = await getSparkAccessProfile(ctx.chat.id);
      await ctx.reply(renderSparkAccessOnboarding(defaultAccess));
    }
  }
});

// /status command
bot.command('status', async (ctx) => {
  await safeSendChatAction(ctx, 'typing');

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
  await safeSendChatAction(ctx, 'typing');
  await ctx.reply('Running diagnostics - checks chat, access, relay, Spawner, and provider ping. Takes ~30s...');
  try {
    const report = await buildDiagnoseReport(ctx.from.id, {
      userId: ctx.from.id,
      chatId: ctx.chat.id,
      isAdmin: conversation.isAdmin(ctx.from),
      isAllowed: conversation.isAllowed(ctx.from)
    });
    // Telegram limit is 4096 chars; diagnose is always well under.
    await ctx.reply(report);
  } catch (err: any) {
    await ctx.reply(renderSparkErrorReply(err, 'diagnose', conversation.isAdmin(ctx.from)));
  }
});

bot.command('context', async (ctx) => {
  if (!requireAdmin(ctx)) return;
  const report = await conversation.getConversationFrameDiagnostics(ctx.from);
  await ctx.reply(report);
});

async function handleLocalWorkspaceInventory(ctx: any): Promise<void> {
  if (!requireAdmin(ctx)) return;
  const accessProfile = await getSparkAccessProfile(ctx.chat.id);
  if (!sparkAccessAllows(accessProfile, 'operating_system')) {
    await ctx.reply(renderSparkAccessDenial(accessProfile, 'operating_system'));
    return;
  }
  await safeSendChatAction(ctx, 'typing');
  try {
    const summary = await summarizeLocalWorkspaces();
    const reply = renderLocalWorkspaceInspectionReply(summary);
    await ctx.reply(reply);
    await conversation.rememberAssistantReply(ctx.from, reply).catch(() => {});
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    await ctx.reply(`Local workspace inspection failed: ${detail}`);
  }
}

bot.command('workspaces', handleLocalWorkspaceInventory);
bot.command('workspace', handleLocalWorkspaceInventory);

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

// /clarify <answers> — re-dispatch a build that was held by the
// clarification gate. The original brief + user-supplied answers are
// concatenated and re-sent to spawner-ui with forceDispatch:true.
export async function handleClarificationAnswers(ctx: any, answersRawInput: string): Promise<void> {
  const key = `${ctx.chat.id}-${ctx.from.id}`;
  const pending = pendingClarifications.get(key);
  if (!pending) {
    await ctx.reply('No pending clarification for you. Send a /build message first.');
    return;
  }
  if (Date.now() - pending.timestamp > CLARIFICATION_TTL_MS) {
    pendingClarifications.delete(key);
    await ctx.reply('Clarification window expired (30 min). Send the build message again.');
    return;
  }

  const answersRaw = answersRawInput.trim();
  const runWithDefaults = /^(?:go|run|start|ship|yes|yep|yeah|do it|let'?s go|default|defaults|skip)$/i.test(answersRaw);
  pendingClarifications.delete(key);

  let enrichedPrd = pending.prd;
  if (!runWithDefaults && answersRaw) {
    enrichedPrd = `${pending.prd}\n\n## User clarifications\n\n${pending.questions
      .map((q, i) => `Q${i + 1}: ${q}`)
      .join('\n')}\n\nAnswers: ${answersRaw}`;
  } else if (runWithDefaults) {
    await ctx.reply('Perfect, I will run with the default direction.');
  }

  const spawnerUrl = process.env.SPAWNER_UI_URL || 'http://127.0.0.1:3333';
  const newRequestId = `${pending.requestId}-clarified-${Date.now()}`;
  const missionId = missionIdFromTelegramBuildRequest(newRequestId);
  const tier = getTierForUser(ctx.from.id);
  const prdContent = pending.projectPath
    ? `# ${pending.projectName}\n\nBuild mode: ${pending.buildMode}\nBuild mode reason: ${pending.buildModeReason}\nTarget operating-system folder: \`${pending.projectPath}\`\n\n${enrichedPrd}`
    : `# ${pending.projectName}\n\nBuild mode: ${pending.buildMode}\nBuild mode reason: ${pending.buildModeReason}\n\n${enrichedPrd}`;

  try {
    const res = await axios.post(
      `${spawnerUrl}/api/prd-bridge/write`,
      {
        content: prdContent,
        requestId: newRequestId,
        projectName: pending.projectName,
        buildMode: pending.buildMode,
        buildModeReason: pending.buildModeReason,
        chatId: String(ctx.chat.id),
        userId: String(ctx.from.id),
        telegramRelay: getTelegramRelayIdentity(),
        tier,
        forceDispatch: true,
        missionId,
        options: { includeSkills: true, includeMCPs: false }
      },
      { timeout: 10000 }
    );

    if (!res.data?.success) {
      await ctx.reply(renderSparkErrorReply(new Error(res.data?.error || 'Clarification re-dispatch failed'), 'spawner', conversation.isAdmin(ctx.from)));
      return;
    }

    const publicSpawnerUrl = process.env.SPAWNER_UI_PUBLIC_URL || spawnerUrl;
    const canvasUrl = projectCanvasUrl(publicSpawnerUrl, newRequestId, missionId);
    const kanbanUrl = missionBoardUrl(publicSpawnerUrl);
    await ctx.reply([
      runWithDefaults ? 'Perfect, I will run with the default direction.' : 'Got it, I will use that direction.',
      '',
      `Project: ${pending.projectName}`,
      `Mode: ${pending.buildMode === 'advanced_prd' ? 'Advanced PRD build' : 'Direct build'}`,
      `Mission: ${missionId}`,
      `Mission board: ${kanbanUrl}`,
      '',
      'I am shaping the plan now. I will send the project canvas link as soon as it is ready.'
    ].join('\n'));
    startPrdCanvasReadyNotifier({
      chatId: Number(ctx.chat.id),
      projectName: pending.projectName,
      requestId: newRequestId,
      missionId,
      spawnerUrl,
      publicSpawnerUrl,
      canvasUrl,
      kanbanUrl
    });
  } catch (err) {
    await ctx.reply(renderSparkErrorReply(err instanceof Error ? err : new Error(String(err)), 'spawner', conversation.isAdmin(ctx.from)));
  }
}

function startPrdCanvasReadyNotifier(args: {
  chatId: number;
  projectName: string;
  requestId: string;
  missionId: string;
  spawnerUrl: string;
  publicSpawnerUrl: string;
  canvasUrl: string;
  kanbanUrl: string;
}): void {
  void (async () => {
    const started = Date.now();
    const readyTimeoutMs = localServiceTimeoutMs('SPARK_SPAWNER_PRD_READY_TIMEOUT_MS');
    const deadline = started + readyTimeoutMs;
    const resultUrl = `${args.spawnerUrl}/api/prd-bridge/result?requestId=${encodeURIComponent(args.requestId)}`;
    const heartbeatThresholds = [25_000, 75_000, 135_000];
    let heartbeatIndex = 0;
    while (Date.now() < deadline) {
      await new Promise((r) => setTimeout(r, 4000));
      try {
        const elapsedMs = Date.now() - started;
        if (heartbeatIndex < heartbeatThresholds.length && elapsedMs >= heartbeatThresholds[heartbeatIndex]) {
          const elapsedSec = Math.round(elapsedMs / 1000);
          await bot.telegram.sendMessage(
            args.chatId,
            `Still working on ${args.projectName}. Spark is shaping the PRD and preparing the canvas (${elapsedSec}s elapsed).`
          ).catch(() => {});
          heartbeatIndex += 1;
        }

        const poll = await axios.get(resultUrl, { timeout: 3000 });
        if (poll.data?.found && poll.data?.result?.success) {
          try {
            const queue = await axios.post(
              `${args.spawnerUrl}/api/prd-bridge/load-to-canvas`,
              { requestId: args.requestId, missionId: args.missionId, autoRun: true, telegramRelay: getTelegramRelayIdentity() },
              { timeout: 8000 }
            );
            const taskCount = queue.data?.taskCount;
            const readyCanvasUrl = queue.data?.canvasUrl
              ? `${args.publicSpawnerUrl.replace(/\/+$/, '')}${queue.data.canvasUrl}`
              : args.canvasUrl;
            const elapsed = Math.round((Date.now() - started) / 1000);
            await bot.telegram.sendMessage(args.chatId, formatCanvasReadySummary({
              projectName: args.projectName,
              taskCount,
              elapsed,
              analysis: poll.data.result,
              readyCanvasUrl,
              kanbanUrl: args.kanbanUrl
            }));
          } catch (queueErr: any) {
            await bot.telegram.sendMessage(
              args.chatId,
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
      args.chatId,
      `Analysis is still running after ${Math.round(readyTimeoutMs / 1000)}s for ${args.projectName}. Mission: ${args.missionId}\nMission board: ${args.kanbanUrl}`
    );
  })();
}

bot.command('clarify', async (ctx) => {
  await handleClarificationAnswers(ctx, ctx.message.text.replace(/^\/clarify\b/, ''));
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
    await ctx.reply(renderSparkErrorReply(err, 'memory', conversation.isAdmin(ctx.from)));
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
    await ctx.reply(renderSparkErrorReply(err, 'memory', conversation.isAdmin(ctx.from)));
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
    await ctx.reply(renderSparkErrorReply(err, 'memory', conversation.isAdmin(ctx.from)));
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
  await safeSendChatAction(ctx, 'typing');
  const status = await spark.getQuickStatus();
  await ctx.reply(`Spark Intelligence\n\n${status}`);
});

// /resonance - resonance state
bot.command('resonance', async (ctx) => {
  await safeSendChatAction(ctx, 'typing');
  const resonance = await spark.getResonance();
  await ctx.reply(`Resonance\n\n${resonance}`);
});

// /insights - cognitive insights
bot.command('insights', async (ctx) => {
  await safeSendChatAction(ctx, 'typing');
  const insights = await spark.getInsights(5);
  await ctx.reply(insights);
});

// /voice - what Spark learned about user
bot.command('voice', async (ctx) => {
  await safeSendChatAction(ctx, 'typing');
  const voice = await spark.getVoice();
  await ctx.reply(voice);
});

// /lessons - surprise lessons
bot.command('lessons', async (ctx) => {
  await safeSendChatAction(ctx, 'typing');
  const lessons = await spark.getSurprises();
  await ctx.reply(lessons);
});

// /process - process pending events
bot.command('process', async (ctx) => {
  await safeSendChatAction(ctx, 'typing');
  await ctx.reply('Processing queue...');
  const result = await spark.processQueue();
  await ctx.reply(result);
});

// /reflect - trigger deep reflection
bot.command('reflect', async (ctx) => {
  await safeSendChatAction(ctx, 'typing');
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

function missionIdFromTelegramBuildRequest(requestId: string): string {
  const stamp = requestId.match(/(\d{10,})$/)?.[1];
  return `mission-${stamp || requestId.replace(/[^a-zA-Z0-9_-]/g, '_')}`;
}

function projectCanvasUrl(baseUrl: string, requestId: string, missionId: string): string {
  const root = baseUrl.replace(/\/+$/, '');
  return `${root}/canvas?pipeline=${encodeURIComponent(`prd-${requestId}`)}&mission=${encodeURIComponent(missionId)}`;
}

function projectKanbanUrl(baseUrl: string, missionId: string): string {
  const root = baseUrl.replace(/\/+$/, '');
  return `${root}/kanban?mission=${encodeURIComponent(missionId)}`;
}

function missionBoardUrl(baseUrl: string): string {
  return `${baseUrl.replace(/\/+$/, '')}/kanban`;
}

export function formatBuildClarificationReply(projectName: string, questions: string[], assumptions: string[]): string {
  return formatBuildClarificationReplyWithMicrocopy(projectName, questions, assumptions, null);
}

export function formatBuildClarificationReplyWithMicrocopy(
  projectName: string,
  questions: string[],
  assumptions: string[],
  microcopy: BuildClarificationMicrocopy | null = null
): string {
  const lower = `${projectName}\n${questions.join('\n')}\n${assumptions.join('\n')}`.toLowerCase();
  const isGame = /\b(game|maze|puzzle|arcade|player|score|level|win condition)\b/.test(lower);
  const isDashboard = /\b(dashboard|metric|analytics|monitor|report)\b/.test(lower);
  const recommendation = microcopy?.recommendation || (isGame
    ? 'browser-playable, keyboard controls, clear win/score loop, restart, and local best score'
    : isDashboard
      ? 'focused web dashboard, the key metrics first, seeded data if live data is not ready, and clean empty/error states'
      : (assumptions[0]?.replace(/^Assume\s+/i, '').replace(/\.$/, '') || 'focused web v1 with a polished first screen and simple verification'));
  const steerQuestion = microcopy?.steeringQuestion || questions[0] || (isGame
    ? 'What twist should make it fun?'
    : 'What is the one detail I should not guess?');
  return [
    `I can build ${projectName}. I recommend: ${recommendation}.`,
    '',
    `Say "go" and I will start. Or steer one thing: ${steerQuestion}`
  ].join('\n');
}

async function buildBuildClarificationReply(projectName: string, questions: string[], assumptions: string[]): Promise<string> {
  const microcopy = await generateBuildClarificationMicrocopy({ projectName, questions, assumptions });
  return formatBuildClarificationReplyWithMicrocopy(projectName, questions, assumptions, microcopy);
}

function slugForDomainChipBrief(brief: string): string {
  const slug = brief
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .split('-')
    .filter(Boolean)
    .slice(0, 5)
    .join('-');
  return slug || 'custom-domain-chip';
}

export function projectNameForDomainChipBrief(brief: string): string {
  const base = slugForDomainChipBrief(brief);
  return base.startsWith('domain-chip-') ? base : `domain-chip-${base}`;
}

export function buildDomainChipPrd(brief: string): string {
  const chipKey = projectNameForDomainChipBrief(brief);
  return [
    `Create a Spark domain chip named ${chipKey}.`,
    '',
    `Natural-language chip brief: ${brief}`,
    '',
    'This must use the current Spark-compatible domain chip standards, not the older domain-chip-labs-only assumptions.',
    '',
    'Requirements:',
    '- Scaffold or update the chip under the active Spark chip runtime location.',
    '- Include a valid spark-chip.json manifest with router metadata, precise intent keywords, and no generic keyword hijacking.',
    '- Implement hook entrypoints that can be invoked through the Spark attachments/chips runtime.',
    '- Add focused tests or smoke checks that prove the chip is router-invokable.',
    '- Register or document the runtime activation step if the scaffolder does not activate it automatically.',
    '- Avoid deterministic slash-command handoffs in Telegram-facing text; the chip should work from natural language.',
    '- Validate that unrelated mentions of "chip" do not route to this chip.',
    '',
    'Acceptance checks:',
    `- The created chip key is ${chipKey} or a clearly justified close variant.`,
    '- The chip can be discovered by the Spark chip router for matching domain language.',
    '- A non-domain phrase like "we talked about chips and snacks earlier" falls through conversationally.',
    '- The final response reports chip key, path, router-invokable status, and any warnings.'
  ].join('\n');
}

function domainChipBuildModeForBrief(_brief: string): { buildMode: 'direct' | 'advanced_prd'; reason: string } {
  return {
    buildMode: 'advanced_prd',
    reason: 'Domain-chip creation needs manifest design, hook contracts, router boundaries, activation notes, and tests.'
  };
}

export function formatDomainChipBuildPreview(brief: string): string {
  const projectName = projectNameForDomainChipBrief(brief);
  const mode = domainChipBuildModeForBrief(brief);
  return [
    `I can build this as ${projectName}.`,
    `Recommended path: ${mode.buildMode === 'advanced_prd' ? 'Advanced PRD -> tasks' : 'Direct build'} because ${mode.reason}`,
    'Before I start: should outputs be names only, or names with rationale + usage angle? Any vibe to prefer, like luxury, absurd, consumer, or sci-fi?',
    'Reply "go" to use my default: surreal-but-usable names, short rationale, router-safe tests.'
  ].join('\n');
}

function isDomainChipPendingStart(text: string): boolean {
  const normalized = text.trim().toLowerCase();
  return /^(?:go|start|run|build|create|make|ship|do it|build it|create it|make it|start it|yes|yeah|yep|ok|okay|sure|perfect)$/i.test(normalized) ||
    isMissionExecutionConfirmation(text);
}

function isDomainChipPendingCancel(text: string): boolean {
  return /^(?:cancel|stop|never mind|nevermind|not now|no)$/i.test(text.trim());
}

function domainChipPrdWithUserDirection(pending: PendingDomainChipBuild, text: string): string {
  if (isDomainChipPendingStart(text)) {
    return `${pending.prd}\n\n## Pre-build direction\n\nUse the default direction: surreal-but-usable outputs, short rationale, usage angle, and router-safe tests.`;
  }
  return `${pending.prd}\n\n## User direction before build\n\n${text.trim()}`;
}

async function handlePendingDomainChipBuild(ctx: any, text: string): Promise<boolean> {
  const key = `${ctx.chat.id}-${ctx.from.id}`;
  const pending = pendingDomainChipBuilds.get(key);
  if (!pending) return false;

  if (Date.now() - pending.timestamp > CLARIFICATION_TTL_MS) {
    pendingDomainChipBuilds.delete(key);
    await ctx.reply('That domain-chip draft expired. Send the idea again and I will shape it before starting.');
    return true;
  }

  if (isDomainChipPendingCancel(text)) {
    pendingDomainChipBuilds.delete(key);
    await ctx.reply('No problem. I will hold off on creating that domain chip.');
    return true;
  }

  pendingDomainChipBuilds.delete(key);
  const prd = domainChipPrdWithUserDirection(pending, text);
  await ctx.reply(isDomainChipPendingStart(text)
    ? `Starting ${pending.projectName} with the recommended defaults.`
    : `Got it. I will use that direction and start ${pending.projectName}.`);
  await handleBuildIntent(
    ctx,
    prd,
    pending.projectName,
    null,
    pending.buildMode,
    pending.buildModeReason
  );
  return true;
}

export function formatCanvasReadySummary(args: {
  projectName: string;
  taskCount: unknown;
  elapsed: number;
  analysis: any;
  readyCanvasUrl: string;
  kanbanUrl: string;
}): string {
  const tasks = Array.isArray(args.analysis?.tasks) ? args.analysis.tasks : [];
  const taskTitles = tasks
    .map((task: any) => typeof task?.title === 'string' ? task.title.trim() : '')
    .filter(Boolean)
    .slice(0, 3);
  const lines = [
    `Canvas is ready for ${args.projectName}.`,
    `${args.taskCount ?? tasks.length} build steps queued in ${args.elapsed}s.`,
  ];
  if (taskTitles.length > 0) {
    lines.push('', 'Plan:');
    taskTitles.forEach((title: string, index: number) => lines.push(`${index + 1}. ${title}`));
    if (tasks.length > taskTitles.length) {
      lines.push(`+${tasks.length - taskTitles.length} more`);
    }
  }
  lines.push('', `Canvas: ${args.readyCanvasUrl}`, `Mission board: ${args.kanbanUrl}`, '', "I'll post progress here when a step starts or finishes.");
  return lines.join('\n');
}

async function handleRunCommand(
  ctx: any,
  goal: string,
  providers: string[],
  requiredAccess?: SparkAccessRequirement
): Promise<string | null> {
  await safeSendChatAction(ctx, 'typing');

  const accessRequirement = requiredAccess || (
    sparkMissionNeedsOperatingSystemAccess(goal) ? 'operating_system' : 'spawner_build'
  );
  const accessProfile = await getSparkAccessProfile(ctx.chat.id);
  if (!sparkAccessAllows(accessProfile, accessRequirement)) {
    await ctx.reply(renderSparkAccessDenial(accessProfile, accessRequirement));
    return null;
  }

  const requestId = `tg-${ctx.chat.id}-${ctx.message.message_id}`;
  const result = await spawner.runGoal({
    goal,
    chatId: String(ctx.chat.id),
    requestId,
    userId: String(ctx.from.id),
    tier: getTierForUser(ctx.from.id),
    providers,
    promptMode: 'simple'
  });

  if (!result.success || !result.missionId) {
    await ctx.reply(renderSparkErrorReply(new Error(result.error || 'Spawner mission start failed'), 'spawner', conversation.isAdmin(ctx.from)));
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

export async function handleBuildIntent(
  ctx: any,
  prd: string,
  projectName: string,
  projectPath: string | null,
  buildMode: 'direct' | 'advanced_prd',
  buildModeReason: string
): Promise<void> {
  await safeSendChatAction(ctx, 'typing');

  const accessRequirement: SparkAccessRequirement = sparkMissionNeedsOperatingSystemAccess(prd, projectPath)
    ? 'operating_system'
    : 'spawner_build';
  const accessProfile = await getSparkAccessProfile(ctx.chat.id);
  if (!sparkAccessAllows(accessProfile, accessRequirement)) {
    await ctx.reply(renderSparkAccessDenial(accessProfile, accessRequirement));
    return;
  }

  const spawnerUrl = process.env.SPAWNER_UI_URL || 'http://127.0.0.1:3333';
  const chatId = Number(ctx.chat.id);
  const requestId = `tg-build-${ctx.chat.id}-${ctx.message.message_id}-${Date.now()}`;
  const missionId = missionIdFromTelegramBuildRequest(requestId);

  const prdContent = projectPath
    ? `# ${projectName}\n\nBuild mode: ${buildMode}\nBuild mode reason: ${buildModeReason}\nTarget operating-system folder: \`${projectPath}\`\n\n${prd}`
    : `# ${projectName}\n\nBuild mode: ${buildMode}\nBuild mode reason: ${buildModeReason}\n\n${prd}`;

  const tier = getTierForUser(ctx.from.id);
  try {
    const res = await postLocalServiceWithRetry(
      `${spawnerUrl}/api/prd-bridge/write`,
      {
        content: prdContent,
        requestId,
        projectName,
        buildMode,
        buildModeReason,
        chatId: String(chatId),
        userId: String(ctx.from.id),
        telegramRelay: getTelegramRelayIdentity(),
        tier,
        options: { includeSkills: true, includeMCPs: false }
      },
      localServiceTimeoutMs('SPARK_SPAWNER_PRD_WRITE_TIMEOUT_MS')
    );

    if (!res.data?.success) {
      await ctx.reply(renderSparkErrorReply(new Error(res.data?.error || 'Spawner PRD queue failed'), 'spawner', conversation.isAdmin(ctx.from)));
      return;
    }

    // Clarification gate: spawner returns needsClarification:true on vague
    // briefs. Surface the questions to the user and stash the original
    // request so /clarify can re-dispatch with forceDispatch.
    if (res.data?.needsClarification && Array.isArray(res.data.openQuestions)) {
      pendingClarifications.set(`${ctx.chat.id}-${ctx.from.id}`, {
        requestId,
        prd,
        projectName,
        projectPath,
        buildMode,
        buildModeReason,
        questions: res.data.openQuestions,
        addedAssumptions: res.data.addedAssumptions ?? [],
        timestamp: Date.now()
      });

      const clarificationQuestions = res.data.openQuestions.filter((q: unknown): q is string => typeof q === 'string');
      const clarificationAssumptions = Array.isArray(res.data.addedAssumptions)
        ? res.data.addedAssumptions.filter((a: unknown): a is string => typeof a === 'string')
        : [];
      await ctx.reply(await buildBuildClarificationReply(projectName, clarificationQuestions, clarificationAssumptions));
      return;
    }

    const publicSpawnerUrl = process.env.SPAWNER_UI_PUBLIC_URL || spawnerUrl;
    const canvasUrl = projectCanvasUrl(publicSpawnerUrl, requestId, missionId);
    const kanbanUrl = missionBoardUrl(publicSpawnerUrl);
    const ackLines = [
      'Got it. Spark picked up the build.',
      '',
      `Project: ${projectName}`,
      `Mode: ${buildMode === 'advanced_prd' ? 'Advanced PRD build' : 'Direct build'}`,
      projectPath ? `Target folder: ${projectPath}` : null,
      `Mission: ${missionId}`,
      '',
      `Mission board: ${kanbanUrl}`,
      '',
      'I am shaping the plan now. I will send the project canvas link as soon as it is ready.'
    ].filter(Boolean);
    await ctx.reply(ackLines.join('\n'));

    if (process.env.SPARK_BOT_TEST_MODE === '1') {
      return;
    }

    startPrdCanvasReadyNotifier({
      chatId,
      projectName,
      requestId,
      missionId,
      spawnerUrl,
      publicSpawnerUrl,
      canvasUrl,
      kanbanUrl
    });
  } catch (err: any) {
    await ctx.reply(renderSparkErrorReply(err, 'spawner', conversation.isAdmin(ctx.from)));
  }
}

function parseRunCommand(text: string, command: string): string {
  const idx = text.indexOf(command);
  if (idx === -1) return text.trim();
  return text.slice(idx + command.length).trim();
}

function missionDefaultProvider(): string {
  return resolveMissionDefaultProvider();
}

const RUN_VARIANTS: Array<{ name: string; providers: string[]; usage: string }> = [
  { name: 'run', providers: [], usage: '/run <goal>  (default: current mission provider)' },
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
    const providers = variant.name === 'run' ? [missionDefaultProvider()] : variant.providers;
    await handleRunCommand(ctx, goal, providers);
  });
}

bot.command('model', async (ctx) => {
  if (!requireAdmin(ctx)) return;

  const raw = ctx.message.text.replace('/model', '').trim();
  if (!raw || raw.toLowerCase() === 'status') {
    await ctx.reply(renderModelStatus());
    return;
  }

  const [roleToken, providerToken, modelToken] = raw.split(/\s+/).filter(Boolean);
  const role = normalizeModelRole(roleToken);
  const provider = normalizeModelProvider(providerToken);
  if (!role || !provider) {
    await ctx.reply([
      'Use /model like this:',
      '/model agent zai',
      '/model agent codex',
      '/model agent claude',
      '/model mission codex',
      '/model mission claude',
      '',
      'Agent means chat + runtime + memory. Mission means Spawner builds.'
    ].join('\n'));
    return;
  }

  const reply = await switchModelRoute(role, provider, modelToken);
  await ctx.reply(reply);
});

bot.command('models', async (ctx) => {
  if (!requireAdmin(ctx)) return;

  const raw = ctx.message.text.replace('/models', '').trim();
  const provider = normalizeModelProvider(raw);
  await ctx.reply(renderModelRecommendations(provider));
});

bot.command('board', async (ctx) => {
  if (!requireAdmin(ctx)) return;

  await safeSendChatAction(ctx, 'typing');
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

  await safeSendChatAction(ctx, 'typing');
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
  await safeSendChatAction(ctx, 'typing');
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
    await ctx.reply('Choose an access level: /access 1 Chat Only, /access 2 Build When Asked, /access 3 Research + Build, or /access 4 Full Access.');
    return;
  }

  const runtimeGate = validateSparkAccessProfileForRuntime(next);
  if (!runtimeGate.ok) {
    await ctx.reply(runtimeGate.message);
    return;
  }

  await setSparkAccessProfile(ctx.chat.id, next);
  await conversation.learnAboutUser(ctx.from, `Spark access profile for this chat is ${next}. ${describeSparkAccessProfile(next)}`).catch(() => {});
  const reply = renderSparkAccessChangeConfirmation(next);
  await ctx.reply(reply);
  await conversation.rememberAssistantReply(ctx.from, reply).catch(() => {});
});

async function handleAccessChangeRequest(ctx: any, raw: string): Promise<boolean> {
  if (!requireAdmin(ctx)) return true;

  const next = normalizeSparkAccessProfile(raw);
  if (!next) {
    await ctx.reply('Choose an access level: /access 1 Chat Only, /access 2 Build When Asked, /access 3 Research + Build, or /access 4 Full Access.');
    return true;
  }

  const runtimeGate = validateSparkAccessProfileForRuntime(next);
  if (!runtimeGate.ok) {
    await ctx.reply(runtimeGate.message);
    return true;
  }

  await setSparkAccessProfile(ctx.chat.id, next);
  await conversation.learnAboutUser(ctx.from, `Spark access profile for this chat is ${next}. ${describeSparkAccessProfile(next)}`).catch(() => {});
  const reply = renderSparkAccessChangeConfirmation(next);
  await ctx.reply(reply);
  await conversation.rememberAssistantReply(ctx.from, reply).catch(() => {});
  return true;
}

function answerFromRememberTurns(text: string, turns: ReadonlyArray<{ role: string; text: string }>): string | null {
  if (extractPlainChatMemoryDirective(text)) {
    return null;
  }
  const normalized = text.toLowerCase().replace(/\s+/g, ' ').trim();
  if (!/\b(?:asked you to remember|told you to remember|session test code word|code word)\b/.test(normalized)) {
    return null;
  }

  for (const turn of [...turns].reverse()) {
    if (turn.role !== 'user') continue;
    const directive = extractPlainChatMemoryDirective(turn.text);
    if (!directive) continue;
    const cleaned = directive.replace(/^this\s+/i, '').replace(/[.!?]+$/g, '').trim();
    if (!cleaned) continue;
    const codeWord = cleaned.match(/\b(?:session\s+test\s+)?code\s+word\s*[:\-]\s*(.+)$/i);
    if (codeWord?.[1]?.trim()) {
      return codeWord[1].trim().replace(/^["']|["']$/g, '');
    }
    return cleaned;
  }

  return null;
}

function buildSelectedListReferencePrompt(frame: ConversationFrame): string | null {
  if (frame.referenceResolution.kind !== 'list_item' || !frame.referenceResolution.value) return null;
  const artifact = frame.artifacts.find((item) => item.key === frame.referenceResolution.sourceArtifactKey);
  const listLines = artifact?.items.length
    ? ['Recent list options:', ...artifact.items.map((item, index) => `${index + 1}. ${item}`)]
    : [];
  return [
    `The user selected this exact option from the recent list: ${frame.referenceResolution.value}`,
    artifact ? `The selected option belongs to this list context: ${artifact.title}` : '',
    ...listLines,
    '',
    'Continue only from that selected option and its list. Do not blend this with older unrelated lists, project names, access levels, or prior option sets. Do not reinterpret the short follow-up as a request for a quantity.'
  ].filter(Boolean).join('\n');
}

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

  if (!/^spark-[A-Za-z0-9_-]+$/.test(missionId)) {
    return ctx.reply('Use a real mission ID from /board, for example: /mission status spark-1776768300668');
  }

  await safeSendChatAction(ctx, 'typing');
  const result = await spawner.missionCommand(action, missionId);
  await ctx.reply(result.success ? result.message : `Mission command failed: ${result.message}`);
});

// Handle regular text messages
export async function handleTextMessage(ctx: any): Promise<void> {
  const user = ctx.from;
  const text = ctx.message.text;

  if (text.startsWith('/')) {
    return;
  }

  if (isPendingTaskRecoveryQuestion(text)) {
    const pendingTask = await conversation.getPendingTaskRecovery(user);
    if (pendingTask) {
      const reply = renderPendingTaskRecoveryReply(pendingTask);
      await conversation.remember(user, text).catch(() => {});
      await ctx.reply(reply);
      await conversation.rememberAssistantReply(user, reply).catch(() => {});
      return;
    }
  }

  const conversationFrame = await conversation.getConversationFrame(user, text);
  let conversationFrameContext = renderConversationFrameContext(conversationFrame, 12_000);

  const recentRememberedAnswer = answerFromRememberTurns(text, [
    ...conversationFrame.hotTurns.filter((turn) => turn.role === 'user' || turn.role === 'assistant'),
    ...await conversation.getRecentTurns(user, 40)
  ]);
  if (recentRememberedAnswer) {
    await conversation.remember(user, text).catch(() => {});
    await ctx.reply(recentRememberedAnswer);
    await conversation.rememberAssistantReply(user, recentRememberedAnswer).catch(() => {});
    return;
  }

  const choiceContextAcknowledgement = renderChoiceContextAcknowledgement(text);
  if (choiceContextAcknowledgement) {
    await conversation.remember(user, text).catch(() => {});
    await ctx.reply(choiceContextAcknowledgement);
    await conversation.rememberAssistantReply(user, choiceContextAcknowledgement).catch(() => {});
    return;
  }

  try {
    const coldMemoryContext = await runBuilderConversationColdContext({
      userId: user.id,
      currentMessage: text,
    });
    if (coldMemoryContext.contextText) {
      conversationFrameContext = [conversationFrameContext, coldMemoryContext.contextText].filter(Boolean).join('\n\n');
    }
  } catch (error) {
    console.warn('[BuilderBridge] Skipping cold memory context for this turn:', error);
  }

  // Natural-language project-build intent: "build a ...", "make me a ...", etc.
  // Routes to Spawner UI's PRD bridge so the canvas auto-loads and Spark can
  // execute the project with the selected build mode.
  if (conversation.isAdmin(ctx.from)) {
    const recentMessages = await conversation.getRecentMessages(user, 8);
    const sessionContext = await conversation.getContext(user, text);
    const contextualTurns = [...recentMessages, sessionContext, conversationFrameContext];
    const buildIntent = parseBuildIntent(text);

    if (await handlePendingDomainChipBuild(ctx, text)) {
      await conversation.remember(user, text).catch(() => {});
      return;
    }

    const pendingClarification = pendingClarifications.get(`${ctx.chat.id}-${ctx.from.id}`);
    if (pendingClarification && !buildIntent) {
      await handleClarificationAnswers(ctx, text);
      return;
    }

    // Build intent must win over preference/board/status language. Users often
    // include words like "Mission Control", "updates", or "progress" inside
    // actual project briefs.
    if (buildIntent) {
      console.log(`[BuildIntent] route user=${ctx.from?.id} project=${JSON.stringify(buildIntent.projectName).slice(0, 80)}`);
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

    const defaultBuild = inferDefaultBuildFromRecentScoping(text, recentMessages);
    if (defaultBuild) {
      await conversation.remember(user, text).catch(() => {});
      await ctx.reply(`I will choose the default and start it: ${defaultBuild.projectName}.`);
      await handleBuildIntent(
        ctx,
        defaultBuild.prd,
        defaultBuild.projectName,
        null,
        'advanced_prd',
        'User asked Spark to choose the recommended direction after collaborative scoping.'
      );
      return;
    }

    const missionUpdatePreference = parseMissionUpdatePreferenceIntent(text);
    if (missionUpdatePreference) {
      await conversation.remember(user, text).catch(() => {});
      const detailLines: string[] = [];
      if (missionUpdatePreference.verbosity) {
        await setTelegramRelayVerbosity(ctx.chat.id, missionUpdatePreference.verbosity);
        detailLines.push(`Updates: ${missionUpdatePreference.verbosity} - ${describeTelegramRelayVerbosity(missionUpdatePreference.verbosity)}`);
      }
      if (missionUpdatePreference.links) {
        await setTelegramMissionLinkPreference(ctx.chat.id, missionUpdatePreference.links);
        detailLines.push(`Links: ${missionUpdatePreference.links} - ${describeTelegramMissionLinkPreference(missionUpdatePreference.links)}`);
      }
      await ctx.reply(formatMissionUpdatePreferenceAcknowledgement(detailLines));
      return;
    }

    const localServiceContext = contextualTurns.join('\n');

    const naturalChipBrief = parseNaturalChipCreateIntent(text);
    if (naturalChipBrief) {
      await conversation.remember(user, text).catch(() => {});
      const mode = domainChipBuildModeForBrief(naturalChipBrief);
      pendingDomainChipBuilds.set(`${ctx.chat.id}-${ctx.from.id}`, {
        brief: naturalChipBrief,
        prd: buildDomainChipPrd(naturalChipBrief),
        projectName: projectNameForDomainChipBrief(naturalChipBrief),
        buildMode: mode.buildMode,
        buildModeReason: mode.reason,
        timestamp: Date.now()
      });
      await ctx.reply(formatDomainChipBuildPreview(naturalChipBrief));
      return;
    }

    const spawnerBoardIntent = parseSpawnerBoardNaturalIntent(text);
    if (spawnerBoardIntent) {
      await conversation.remember(user, text).catch(() => {});
      await safeSendChatAction(ctx, 'typing');
      const result = spawnerBoardIntent === 'latest_provider'
        ? await spawner.latestProviderSummary()
        : spawnerBoardIntent === 'latest_on_kanban'
          ? await spawner.latestKanbanSummary()
          : spawnerBoardIntent === 'latest_project_preview'
            ? await spawner.latestProjectPreview()
          : await spawner.board();
      await ctx.reply(result.success ? result.message : `Board failed: ${result.message}`);
      return;
    }

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

    if (isDiagnosticsScanRequest(text)) {
      await conversation.remember(user, text).catch(() => {});
      await safeSendChatAction(ctx, 'typing');
      try {
        const scan = await runBuilderDiagnosticsScan();
        await ctx.reply(scan.replyText);
        if (scan.markdownPath) {
          try {
            await ctx.replyWithDocument({
              source: scan.markdownPath,
              filename: path.basename(scan.markdownPath),
            });
          } catch (attachError) {
            console.warn('[Diagnostics] failed to attach markdown note:', attachError);
            await ctx.reply(`I wrote the Markdown note, but could not attach it here:\n${scan.markdownPath}`);
          }
        }
      } catch (error) {
        const detail = error instanceof Error ? error.message : String(error);
        await conversation.recordInterruptedTask(user, {
          message: text,
          failure: detail,
          stage: 'diagnostics_scan'
        }).catch(() => {});
        await ctx.reply(`Diagnostics scan failed: ${detail}`);
      }
      return;
    }

    if (isExplicitContextualBuildRequest(text)) {
      const improvementGoal = buildContextualImprovementGoal(text, contextualTurns);
      if (improvementGoal) {
        console.log(`[ConversationIntent] inferred contextual improvement mission user=${ctx.from?.id} textLen=${text.length}`);
        await conversation.remember(user, text).catch(() => {});
        const missionId = await handleRunCommand(ctx, improvementGoal, [missionDefaultProvider()]);
        if (missionId) {
          await conversation.learnAboutUser(user, `Started Spawner mission ${missionId} to improve the Spark Diagnostic Agent integration from Telegram context.`).catch(() => {});
        }
        return;
      }
    }

    if (isExternalResearchRequest(text)) {
      const accessProfile = await getSparkAccessProfile(ctx.chat.id);
      if (!sparkAccessAllows(accessProfile, 'external_research')) {
        await ctx.reply(renderSparkAccessDenial(accessProfile, 'external_research'));
        return;
      }
      await conversation.remember(user, text).catch(() => {});
      const missionId = await handleRunCommand(ctx, buildExternalResearchGoal(text, contextualTurns), [missionDefaultProvider()], 'external_research');
      if (missionId) {
        await conversation.learnAboutUser(user, `Started Spawner mission ${missionId} to inspect an external GitHub/web target from Telegram.`).catch(() => {});
      }
      return;
    }

    const inferredMissionGoal = inferMissionGoalFromRecentContext(text, recentMessages);
    if (inferredMissionGoal) {
      console.log(`[ConversationIntent] inferred mission from follow-up user=${ctx.from?.id} textLen=${text.length}`);
      await conversation.remember(user, text).catch(() => {});
      const missionId = await handleRunCommand(ctx, inferredMissionGoal, [missionDefaultProvider()]);
      if (missionId) {
        await conversation.learnAboutUser(user, `Started Spawner mission ${missionId} from Telegram follow-up: ${inferredMissionGoal.slice(0, 220)}`).catch(() => {});
      }
      return;
    }

    await conversation.remember(user, text).catch(() => {});

    if (shouldPreferConversationalIdeation(text)) {
      console.log(`[ConversationIntent] ideation route user=${ctx.from?.id} textLen=${text.length}`);
      await safeSendChatAction(ctx, 'typing');
      const memories = [await conversation.getContext(user, text), conversationFrameContext].join('\n\n');
      const accessProfile = await getSparkAccessProfile(ctx.chat.id);
      const ideationPrompt = buildSelectedListReferencePrompt(conversationFrame) || text;
      const llmResponse = await llm.chat(
        ideationPrompt,
        [buildIdeationSystemHint(text), renderSparkAccessRuntimeHint(accessProfile)].join('\n\n'),
        memories
      );
      const response = isLowInformationLlmReply(llmResponse)
        ? buildIdeationFallbackReply(text)
        : llmResponse;
      await ctx.reply(response);
      await conversation.rememberAssistantReply(user, response).catch(() => {});
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
  await safeSendChatAction(ctx, 'typing');

  try {
    const memoryDirective = extractPlainChatMemoryDirective(text);
    if (memoryDirective) {
      await conversation.learnAboutUser(user, `User asked Spark to remember: ${memoryDirective}`).catch(() => {});
    }

    let bridgeFailed = false;
    let builderReply = {
      used: false,
      responseText: '',
      decision: '',
      bridgeMode: '',
      routingDecision: ''
    };
    try {
      builderReply = await runBuilderTelegramBridge(ctx.update as unknown as Record<string, unknown>);
    } catch (bridgeError) {
      bridgeFailed = true;
      console.warn('[Bridge] local chat fallback after bridge error:', bridgeError);
    }
    console.log(`[Bridge] user=${ctx.from?.id} used=${builderReply.used} mode=${builderReply.bridgeMode} routing=${builderReply.routingDecision} textLen=${(builderReply.responseText || '').length}`);
    if (builderReply.used && builderReply.bridgeMode !== 'bridge_error') {
      const contradictsResolvedList = conversationFrame.referenceResolution.kind === 'list_item' &&
        /\b(?:no prior list|what are you choosing between|which one|which option)\b/i.test(builderReply.responseText);
      if (!contradictsResolvedList && !shouldSuppressBuilderReplyForPlainChat(builderReply.responseText, builderReply.routingDecision)) {
        if (memoryDirective) {
          await conversation.remember(user, text).catch(() => {});
        }
        await ctx.reply(builderReply.responseText);
        await conversation.rememberAssistantReply(user, builderReply.responseText).catch(() => {});
        return;
      }
      console.warn(`[Bridge] ignored non-chat Builder reply routing=${builderReply.routingDecision}`);
    }

    // Get context from previous memories
    const memories = [await conversation.getContext(user, text), conversationFrameContext].join('\n\n');
    const accessProfile = await getSparkAccessProfile(ctx.chat.id);

    const chatPrompt = buildSelectedListReferencePrompt(conversationFrame) || text;

    // Get LLM response with Spark context
    const response = await llm.chat(chatPrompt, renderSparkAccessRuntimeHint(accessProfile), memories);

    if (isLowInformationLlmReply(response)) {
      await conversation.recordInterruptedTask(user, {
        message: text,
        failure: bridgeFailed ? 'Builder bridge failed and chat fallback returned a low-information reply.' : 'Chat runtime returned a low-information reply.',
        stage: bridgeFailed ? 'builder_bridge_fallback' : 'chat_runtime'
      }).catch(() => {});
      await ctx.reply(renderChatRuntimeFailureReply(conversation.isAdmin(user), bridgeFailed));
      return;
    }

    await ctx.reply(response);
    await conversation.rememberAssistantReply(user, response).catch(() => {});

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
    const detail = err instanceof Error ? err.message : String(err);
    await conversation.recordInterruptedTask(user, {
      message: text,
      failure: detail,
      stage: 'telegram_message_handler'
    }).catch(() => {});
    await ctx.reply(renderSparkErrorReply(err, 'chat', conversation.isAdmin(user)));
  }
}

export async function handleImageMessage(ctx: any): Promise<void> {
  const user = ctx.from;
  const imageMemoryText = telegramImageMemoryText(ctx.message);

  await conversation.remember(user, imageMemoryText).catch(() => {});
  await safeSendChatAction(ctx, 'typing');

  try {
    const bridgeUpdate = imageMessageHasCaption(ctx.message)
      ? ctx.update as unknown as Record<string, unknown>
      : buildContextualImageUpdate(
          ctx.update as unknown as Record<string, unknown>,
          await conversation.getRecentMessages(user, 6).catch(() => [])
        );
    const builderReply = await runBuilderTelegramBridge(bridgeUpdate);
    console.log(`[ImageBridge] user=${ctx.from?.id} used=${builderReply.used} mode=${builderReply.bridgeMode} routing=${builderReply.routingDecision} textLen=${(builderReply.responseText || '').length}`);

    if (builderReply.used && builderReply.bridgeMode !== 'bridge_error' && builderReply.responseText) {
      await ctx.reply(builderReply.responseText);
      await conversation.rememberAssistantReply(user, builderReply.responseText).catch(() => {});
      return;
    }

    const fallback = 'I received the image, but Spark did not return an image analysis. Run `/diagnose`, then ask the operator to run `spark-intelligence auth verify-image-input --live --json`.';
    await ctx.reply(fallback);
    await conversation.recordInterruptedTask(user, {
      message: imageMemoryText,
      failure: `Builder image bridge returned no usable response. mode=${builderReply.bridgeMode || 'none'} routing=${builderReply.routingDecision || 'none'}`,
      stage: 'telegram_image_handler'
    }).catch(() => {});
  } catch (err) {
    console.error('Image handling error:', err);
    const detail = err instanceof Error ? err.message : String(err);
    await conversation.recordInterruptedTask(user, {
      message: imageMemoryText,
      failure: detail,
      stage: 'telegram_image_handler'
    }).catch(() => {});
    await ctx.reply(renderSparkErrorReply(err, 'telegram', conversation.isAdmin(user)));
  }
}

bot.on(message('text'), handleTextMessage);
bot.on(message('photo'), handleImageMessage);
bot.on(message('document'), async (ctx) => {
  if (!isTelegramImageMessage(ctx.message)) {
    return;
  }
  await handleImageMessage(ctx);
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

// Guard: only auto-start when run as the main module. Importing this file
// from a test (e.g. tests/buildE2E.test.ts) should not trigger bot.launch().
if (process.env.SPARK_BOT_TEST_MODE !== '1' && require.main === module) {
  start().catch((err) => {
    void releaseGatewayOwnership();
    console.error('Failed to start bot:', err);
    process.exit(1);
  });
}
