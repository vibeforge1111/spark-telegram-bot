import 'dotenv/config';
import { config as loadEnv } from 'dotenv';
import { execFile } from 'node:child_process';
import { existsSync } from 'node:fs';
import { appendFile, mkdir } from 'node:fs/promises';
import { createHash, randomUUID } from 'node:crypto';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import { Telegraf } from 'telegraf';

// Load .env.override LAST with override=true. Wins over anything spark-cli
// rewrites in .env. Never committed (.gitignored). Dedicated harnesses can
// opt out when they need an isolated process.env without local profile bleed.
if (process.env.SPARK_SKIP_ENV_OVERRIDE !== '1') {
  loadEnv({ path: path.join(__dirname, '..', '.env.override'), override: true });
}
import { message } from 'telegraf/filters';
import {
  conversation,
  isPendingTaskRecoveryQuestion,
  renderPendingTaskRecoveryReply
} from './conversation';
import { renderChoiceContextAcknowledgement, renderConversationFrameContext, type ConversationFrame } from './conversationFrame';
import {
  classifyBrowserCapabilityQuestion,
  browserTaskNeedsReferenceResearch,
  browserUseTaskGoalForIntent,
  browserUseTaskScreenshotPath,
  parseBrowserUseCommandArgs,
  renderBrowserCapabilityAnswer,
  renderBrowserUseActionAnswer,
  renderBrowserUsePrimitiveAnswer,
  renderBrowserUseReviewAnswer,
  renderBrowserUseTaskAnswer,
  shouldRunFullBrowserUseTask,
  type BrowserCapabilityIntent,
  type BrowserUseProfileOptions
} from './browserCapability';
import { shouldSendBrowserTaskStartNotice } from './browserTaskProgress';
import {
  getBuilderBridgeStatus,
  runBuilderAocPreflight,
  formatMemoryInPlaySummary,
  runBuilderAgentBlackBox,
  runBuilderAgentOperatingContext,
  runBuilderConversationColdContext,
  runBuilderDiagnosticsScan,
  formatRouteConfidenceGateReply,
  runBuilderRouteProbe,
  runBuilderRouteConfidenceGate,
  runBuilderSourceUsed,
  runBuilderSelfImprovementPlan,
  runBuilderSelfAwarenessStatus,
  runBuilderTelegramBridge,
  runBuilderWikiAnswer,
  runBuilderWikiInventory,
  runBuilderWikiPromoteImprovement,
  runBuilderWikiQuery,
  runBuilderWikiStatus
} from './builderBridge';
import { spark } from './spark';
import { generateBuildClarificationMicrocopy, llm, type BuildClarificationMicrocopy } from './llm';
import { sanitizeAndSplitTelegramText } from './outboundSanitize';
import { installConsoleRedaction, redactText } from './redaction';
import {
  formatCreatorMissionExecutionSummary,
  formatCreatorMissionStatusSummary,
  formatCreatorMissionSummary,
  formatCreatorMissionValidationSummary,
  localServiceTimeoutMs,
  postLocalServiceWithRetry,
  spawner
} from './spawner';
import { createChipFromPrompt } from './chipCreate';
import { runChipLoop } from './chipLoop';
import { resolveRecursiveStartTarget, runSpecializationPathAutoloop } from './pathLoop';
import {
  parseRecursiveCommand,
  proposeRecursiveWorkspaceEvidence,
  queueRecursiveCanvas,
  recordRecursiveDecision,
  recursiveReviewCandidates,
  recursiveSessionReport,
  recursiveSessions,
  recursiveSessionReview,
  recursiveSessionStatus,
  recursiveTraceReply,
  renderRecursiveDecision,
  renderRecursiveCanvasQueue,
  renderRecursiveArtifactSyncCompletion,
  renderBuilderChipLoopCompletion,
  renderRecursiveHelp,
  renderRecursivePaths,
  renderRecursiveNetworkProposal,
  renderRecursivePromotionPacket,
  renderRecursiveReviewCandidates,
  renderRecursiveSessions,
  renderRecursiveSwarmPacket,
  renderSpecializationPathLoopCompletion,
  sparkWorkspaceBridgeHints,
  sparkWorkspaceConfigured,
  sparkWorkspaceRecursionsUrl,
  stageRecursivePromotionPacket,
  stageRecursiveSwarmPacket,
  syncBuilderChipLoopToWorkspace,
  syncRecursiveArtifactToWorkspace
} from './recursive';
import { spawnerAxiosOptions } from './spawnerAuth';
import { resolveSpawnerUiUrl } from './spawnerUrl';
import { readNoEditProbeMission, storeNoEditProbeMission, type NoEditProbeMission } from './noEditProbeStore';
import {
  isLocalWorkspaceInspectionOnlyRequest,
  renderLocalWorkspaceInspectionReply,
  summarizeLocalWorkspaces
} from './localWorkspace';
import { createSchedule, deleteSchedule, listSchedules, formatScheduleList, humanizeCron, formatNextFireLocal } from './schedule';
import { probeTelegramRunnerWritability } from './runnerPreflight';
import {
  describeSparkAccessProfile,
  getConfiguredSparkAccessProfile,
  getSparkAccessProfile,
  normalizeSparkAccessProfile,
  renderSparkAccessChangeSummary,
  renderSparkAccessCapabilityStatus,
  renderSparkAccessChangeConfirmation,
  renderSparkAccessLevel5ConfirmationPrompt,
  renderSparkAccessConversationHelp,
  renderSparkAccessDenial,
  renderSparkAccessOnboarding,
  renderSparkAccessRuntimeHint,
  renderSparkAccessStatus,
  setSparkAccessProfile,
  sparkAccessAllows,
  sparkAccessLevel,
  sparkMissionNeedsOperatingSystemAccess,
  validateSparkAccessProfileForRuntime,
  type SparkAccessProfile,
  type SparkAccessRequirement
} from './accessPolicy';
import {
  accessActionNeedsConfirmation,
  buildSparkAccessActionKeyboard,
  buildSparkAccessChangeKeyboard,
  buildSparkAccessConfirmationKeyboard,
  buildSparkAccessLevel5ConfirmKeyboard,
  formatSparkAccessActionConfirmationPrompt,
  formatSparkAccessAutomaticRestartNotice,
  runSparkAccessActionDetailed,
  scheduleSparkRestartAfterAccessChange,
  sparkAccessActionLabel,
  type SparkAccessActionId
} from './accessActions';
import {
  describeTelegramMissionLinkPreference,
  describeTelegramRelayVerbosity,
  getTelegramMissionLinkPreference,
  getTelegramRelayVerbosity,
  normalizeTelegramMissionLinkPreference,
  normalizeTelegramRelayVerbosity,
  approvePendingMissionLesson,
  getTelegramRelayIdentity,
  markMissionRelayCancelled,
  markMissionRelayPaused,
  markMissionRelayResumed,
  registerMissionRelay,
  shouldSuppressMissionHandoff,
  setMissionRelayRuntimeStatus,
  setTelegramMissionLinkPreference,
  setTelegramRelayVerbosity,
  startMissionRelay
} from './missionRelay';
import { buildDiagnoseReport } from './diagnose';
import { readAuthorityStatusSummary, renderAuthorityStatusSummary } from './authorityStatus';
import { readCapabilityGardenSummary, renderCapabilityGardenSummary } from './capabilityGarden';
import { readMemoryMovementSummary, renderMemoryMovementSummary } from './memoryMovement';
import { readTraceRepairSummary, renderTraceRepairSummary } from './traceRepair';
import { parseBuildIntent } from './buildIntent';
import { parseSafeOperatorAction, runSafeOperatorAction } from './operatorActions';
import { evaluateDeterministicRoute, type DeterministicRouteId } from './routeFirewall';
import { withHiddenWindows } from './hiddenProcess';
import { queueRouteArbiterShadow } from './routeArbiter';
import { resolveMissionDefaultProvider } from './providerRouting';
import {
  buildIdeationFallbackReply,
  buildIdeationSystemHint,
  buildContextualImprovementGoal,
  buildProjectImprovementGoal,
  buildDiagnosticFollowupTestReply,
  buildExternalResearchGoal,
  buildLocalSparkServiceClarificationReply,
  buildLocalSparkServiceReply,
  buildMemoryBridgeUnavailableReply,
  buildRecentBuildContextReply,
  extractSparkSelfImprovementGoal,
  extractSparkWikiAnswerQuestion,
  extractSparkWikiPromotionIntent,
  extractSparkWikiQuery,
  extractPlainChatMemoryDirective,
  formatGlobalAgentDoctrineRequestReply,
  formatMissionUpdatePreferenceAcknowledgement,
  inferDefaultBuildFromRecentScoping,
  inferMissionFromRecentContext,
  isContextualAccessCapabilityMismatchQuestion,
  isAccessCapabilityMismatchQuestion,
  isAccessHelpQuestion,
  isBuildContextRecallQuestion,
  isDiagnosticFollowupTestQuestion,
  isDiagnosticsScanRequest,
  isMissionExecutionConfirmation,
  isAmbiguousLocalSparkServiceRequest,
  isExternalResearchRequest,
  isExplicitContextualBuildRequest,
  isGlobalAgentDoctrineRequest,
  isNoExecutionBoundary,
  isSparkChipStatusOverclaimQuestion,
  isSparkWikiInventoryQuestion,
  isSparkWikiStatusQuestion,
  isProjectImprovementRequest,
  isLocalSparkServiceRequest,
  isLowInformationLlmReply,
  parseContextualAccessChangeIntent,
  parseNaturalAccessChangeIntent,
  parseNaturalChipCreateIntent,
  parseSpawnerBoardNaturalIntent,
  parseMissionUpdatePreferenceIntent,
  renderChatRuntimeFailureReply,
  builderReplySuppressionReason,
  shouldSuppressBuilderReplyForPlainChat,
  shouldUseBuilderReplyForMemoryDirective,
  shouldPreferConversationalIdeation
} from './conversationIntent';
import {
  decideNaturalRoute,
  type NaturalRouteDecision,
  type NaturalRouteOwnerSystem
} from './naturalRouteDecision';
import { renderNaturalRouteDecisionReply } from './naturalRouteTelemetry';
import {
  appendNaturalRouteExecutionRecord,
  createNaturalRouteExecutionRecord,
  shouldWriteNaturalRouteLedger
} from './naturalRouteLedger';
import { getLatestShippedProjectContext } from './shippedProjectContext';
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
import {
  buildMemoryDoctorEvidencePrompt,
  isMemoryDoctorBridgeDetourReply,
  renderMemoryDoctorEvidenceFallback,
  selectMemoryDoctorEvidenceTurns,
  shouldAttachMemoryDoctorEvidence,
  shouldPreferMemoryDoctorEvidenceFallback
} from './memoryDoctorBridge';
import { buildVoiceBridgeUpdate } from './telegramVoiceBridge';
import { formatVoiceMediaCaption } from './voiceCaption';
import { extractStartSession, recordTelegramFirstMessage } from './onboardingBridge';

const TELEGRAM_SMOKE_MODE = process.env.TELEGRAM_SMOKE_MODE === '1';
const execFileAsync = promisify(execFile);
const SPARK_CLI_COMMAND = process.env.SPARK_CLI_COMMAND
  || (process.platform === 'win32' ? path.join(os.homedir(), '.spark', 'bin', 'spark.cmd') : 'spark');
const BROWSER_USE_TASK_MAX_STEPS = Number.parseInt(process.env.SPARK_BROWSER_USE_TASK_MAX_STEPS || '', 10) > 0
  ? Number.parseInt(process.env.SPARK_BROWSER_USE_TASK_MAX_STEPS || '', 10)
  : 8;
const BROWSER_USE_REFERENCE_TASK_MAX_STEPS = Number.parseInt(process.env.SPARK_BROWSER_USE_REFERENCE_TASK_MAX_STEPS || '', 10) > 0
  ? Number.parseInt(process.env.SPARK_BROWSER_USE_REFERENCE_TASK_MAX_STEPS || '', 10)
  : Math.max(BROWSER_USE_TASK_MAX_STEPS, 18);

installConsoleRedaction();

// Validate environment
if (!process.env.BOT_TOKEN && !TELEGRAM_SMOKE_MODE) {
  console.error('ERROR: BOT_TOKEN not set in .env');
  console.error('Get one from @BotFather on Telegram');
  process.exit(1);
}

const botToken = process.env.BOT_TOKEN || '0:telegram-smoke-token';
export const bot = new Telegraf(botToken, {
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

function renderTelegramError(prefix: string, error: unknown): string {
  const raw = error instanceof Error ? error.message : String(error || 'unknown error');
  const detail = redactText(raw).trim() || 'unknown error';
  return `${prefix}: ${detail}`;
}

async function runSparkCli(args: string[], timeoutMs = 30_000): Promise<string> {
  const invocation = sparkCliInvocation(args);
  const { stdout, stderr } = await execFileAsync(
    invocation.command,
    invocation.args,
    withHiddenWindows({
      timeout: timeoutMs,
      maxBuffer: 8 * 1024 * 1024,
    })
  );
  return redactText([stdout, stderr].map((value) => String(value || '').trim()).filter(Boolean).join('\n'));
}

async function runSparkCliReceipt(args: string[], timeoutMs = 30_000): Promise<string> {
  try {
    return await runSparkCli(args, timeoutMs);
  } catch (error) {
    const err = error as Error & { stdout?: unknown; stderr?: unknown };
    const combined = redactText([err.stdout, err.stderr]
      .map((value) => String(value || '').trim())
      .filter(Boolean)
      .join('\n'));
    if (combined.includes('"backend_kind"')) {
      return combined;
    }
    throw error;
  }
}

function sparkCliInvocation(args: string[]): { command: string; args: string[] } {
  if (process.platform === 'win32' && /\.cmd$/i.test(SPARK_CLI_COMMAND)) {
    return {
      command: process.env.ComSpec || 'cmd.exe',
      args: ['/d', '/s', '/c', SPARK_CLI_COMMAND, ...args],
    };
  }
  return { command: SPARK_CLI_COMMAND, args };
}

function sparkCliFailureReason(error: unknown): string {
  const detail = redactText(error instanceof Error ? error.message : String(error || 'unknown error'))
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
  if (/enoent|spawn spark|command not found|not recognized/.test(detail)) {
    return 'Spark CLI is not available to this Telegram runtime.';
  }
  if (/timed out|timeout/.test(detail)) {
    return 'Spark CLI did not answer before the Telegram timeout.';
  }
  if (/eacces|access is denied|permission denied/.test(detail)) {
    return 'This Telegram runtime cannot execute the local Spark CLI.';
  }
  return 'The local Spark CLI probe failed before returning usable health data.';
}

async function runBrowserUseAction(intent: BrowserCapabilityIntent): Promise<Record<string, unknown>> {
  if (!intent.url) {
    return {
      ok: false,
      status: 'blocked',
      action: intent.kind === 'specific_screenshot' ? 'screenshot' : 'open',
      last_failure_reason: 'Send a public URL with the browser request.',
    };
  }
  if (browserUseProfileRequiresFullTask(intent.profile)) {
    return {
      ok: false,
      status: 'blocked',
      action: intent.kind === 'specific_screenshot' ? 'screenshot' : 'open',
      last_failure_reason: 'Use /browser task full with --user-data-dir, --profile-directory, or --storage-state. Fast open/screenshot supports --profile only.',
    };
  }
  const command = intent.kind === 'specific_screenshot' ? 'screenshot' : 'open';
  try {
    const raw = await runSparkCliReceipt(['browser-use', command, intent.url, ...browserUseProfileCliArgs(intent.profile, 'action'), '--json'], 120_000);
    const parsed = parseSparkCliJsonObject(raw);
    return parsed && typeof parsed === 'object' ? parsed as Record<string, unknown> : {
      ok: false,
      status: 'failed',
      action: command,
      last_failure_reason: 'Spark browser-use returned an unreadable receipt.',
    };
  } catch (error) {
    return {
      ok: false,
      status: 'failed',
      action: command,
      last_failure_reason: browserUseFailureReason(error),
    };
  }
}

async function runBrowserUsePrimitive(
  action: string,
  primitiveArgs: string[],
  profile: BrowserUseProfileOptions | undefined
): Promise<Record<string, unknown>> {
  if (browserUseProfileRequiresFullTask(profile)) {
    return {
      ok: false,
      status: 'blocked',
      action,
      last_failure_reason: 'Direct browser actions support --profile and --cdp-url. Use /browser task full for custom user-data-dir, profile-directory, or storage-state.',
    };
  }
  try {
    const raw = await runSparkCliReceipt(
      ['browser-use', action, ...browserUseProfileCliArgs(profile, 'action'), '--json', ...primitiveArgs],
      120_000
    );
    const parsed = parseSparkCliJsonObject(raw);
    return parsed && typeof parsed === 'object' ? parsed as Record<string, unknown> : {
      ok: false,
      status: 'failed',
      action,
      last_failure_reason: 'Spark browser-use returned an unreadable receipt.',
    };
  } catch (error) {
    return {
      ok: false,
      status: 'failed',
      action,
      last_failure_reason: browserUseFailureReason(error),
    };
  }
}

async function runBrowserUseTask(intent: BrowserCapabilityIntent): Promise<Record<string, unknown>> {
  const goal = browserUseTaskGoalForIntent(intent);
  if (!goal) {
    return {
      ok: false,
      status: 'blocked',
      action: 'task',
      last_failure_reason: 'Send a browser-use task goal.',
    };
  }
  const maxSteps = browserTaskNeedsReferenceResearch(intent)
    ? BROWSER_USE_REFERENCE_TASK_MAX_STEPS
    : BROWSER_USE_TASK_MAX_STEPS;
  console.log(`[BrowserUse] task start url=${intent.url || ''} goalLen=${goal.length} maxSteps=${maxSteps}`);
  const args = ['browser-use', 'task', '--max-steps', String(maxSteps), '--json'];
  if (intent.url) {
    args.push('--url', intent.url);
  }
  args.push(...browserUseProfileCliArgs(intent.profile, 'task'));
  args.push(goal);
  try {
    const raw = await runSparkCliReceipt(args, 360_000);
    const parsed = parseSparkCliJsonObject(raw);
    const payload = parsed && typeof parsed === 'object' ? parsed as Record<string, unknown> : {
      ok: false,
      status: 'failed',
      action: 'task',
      last_failure_reason: 'Spark browser-use returned an unreadable task receipt.',
    };
    console.log(`[BrowserUse] task done ok=${payload.ok === true} status=${String(payload.status || '')}`);
    return payload;
  } catch (error) {
    console.log('[BrowserUse] task done ok=false status=failed');
    return {
      ok: false,
      status: 'failed',
      action: 'task',
      last_failure_reason: browserUseFailureReason(error),
    };
  }
}

async function runBrowserUseReview(intent: BrowserCapabilityIntent): Promise<Record<string, unknown>> {
  if (!intent.url) {
    return {
      ok: false,
      status: 'blocked',
      action: 'review',
      last_failure_reason: 'Send a URL with the browser review request.',
    };
  }
  return runBrowserUseAction({
    kind: 'specific_screenshot',
    url: intent.url,
    goal: intent.goal,
    profile: intent.profile,
  });
}

function browserUseQaGoal(input: string): string {
  const scenario = input.trim() || 'QA the primary visible workflow.';
  return [
    'QA this page like a useful operator using live browser evidence only.',
    'Look for broken, confusing, blocked, contradictory, or high-friction moments.',
    'Do not report passes, present checkmarks, or validate labels unless there are no issues.',
    'Return exactly five short bullets under Fix next.',
    'Each bullet must be a concrete next fix, not a status observation.',
    `Scenario: ${scenario}`,
  ].join('\n');
}

async function replyWithBrowserUseTaskScreenshot(ctx: any, payload: Record<string, unknown>): Promise<void> {
  if (payload.ok !== true) return;
  const screenshotPath = browserUseReceiptScreenshotPath(payload);
  if (!screenshotPath || !existsSync(screenshotPath)) return;
  await ctx.replyWithPhoto({ source: screenshotPath }).catch(async () => {
    await ctx.reply('Screenshot was saved locally, but Telegram could not upload it.').catch(() => {});
  });
}

function browserUseReceiptScreenshotPath(payload: Record<string, unknown>): string {
  return browserUseTaskScreenshotPath(payload) || String(payload.screenshot_path || '').trim();
}

function shouldFallbackToBrowserUseReview(payload: Record<string, unknown>, intent: BrowserCapabilityIntent): boolean {
  if (payload.ok === true || !intent.url) return false;
  if (browserTaskNeedsReferenceResearch(intent)) return false;
  const reason = String(payload.last_failure_reason || '').toLowerCase();
  return /invalid action format|invalid model output|json_invalid|agentoutput|pydantic|timed out|timeout|fast \/browser task path/.test(reason);
}

function browserUseProfileCliArgs(profile: BrowserUseProfileOptions | undefined, scope: 'action' | 'task'): string[] {
  if (!profile) return [];
  const args: string[] = [];
  if (profile.profile) args.push('--profile', profile.profile);
  if (profile.cdpUrl) args.push('--cdp-url', profile.cdpUrl);
  if (scope === 'task') {
    if (profile.userDataDir) args.push('--user-data-dir', profile.userDataDir);
    if (profile.profileDirectory) args.push('--profile-directory', profile.profileDirectory);
    if (profile.storageState) args.push('--storage-state', profile.storageState);
  }
  return args;
}

function browserUseProfileRequiresFullTask(profile: BrowserUseProfileOptions | undefined): boolean {
  return Boolean(profile?.userDataDir || profile?.profileDirectory || profile?.storageState);
}

function parseSparkCliJsonObject(raw: string): unknown {
  try {
    return JSON.parse(raw);
  } catch {
    const marker = raw.indexOf('"backend_kind"');
    if (marker < 0) throw new Error('Spark CLI output did not contain a browser-use JSON receipt.');
    const start = raw.lastIndexOf('{', marker);
    if (start < 0) throw new Error('Spark CLI output did not contain a browser-use JSON object.');
    let depth = 0;
    let inString = false;
    let escaped = false;
    for (let index = start; index < raw.length; index += 1) {
      const char = raw[index];
      if (inString) {
        if (escaped) {
          escaped = false;
        } else if (char === '\\') {
          escaped = true;
        } else if (char === '"') {
          inString = false;
        }
        continue;
      }
      if (char === '"') {
        inString = true;
      } else if (char === '{') {
        depth += 1;
      } else if (char === '}') {
        depth -= 1;
        if (depth === 0) {
          return JSON.parse(raw.slice(start, index + 1));
        }
      }
    }
    throw new Error('Spark CLI browser-use JSON receipt was incomplete.');
  }
}

function browserUseFailureReason(error: unknown): string {
  const detail = redactText(error instanceof Error ? error.message : String(error || 'unknown error'))
    .replace(/\s+/g, ' ')
    .trim();
  const normalized = detail.toLowerCase();
  if (/timed out|timeout/.test(normalized)) {
    return 'Browser-use did not finish before Telegram timed out. Use /browser task for the fast screenshot/state review, or /browser task full only for longer agent loops.';
  }
  if (/invalid model output|validation error|json_invalid|agentoutput|pydantic/.test(normalized)) {
    return 'The full browser-use agent model returned an invalid action format. The fast /browser task path still works from fresh screenshot/state evidence.';
  }
  if (/spawn einval/.test(normalized)) {
    return 'The Telegram runtime could not start the browser-use command on this machine.';
  }
  if (/invalid choice.*browser-use|browser-use.*invalid choice/.test(normalized)) {
    return 'This Telegram runtime is using a Spark CLI that does not expose browser-use yet.';
  }
  return 'Browser-use failed before returning a valid receipt.';
}

type TelegramSourceUsedEvidence = {
  source: string;
  role: string;
  freshness: 'fresh' | 'stale' | 'contradicted' | 'unknown' | 'live_probed';
  sourceRef: string;
  summary: string;
};

function recordTelegramSourceUsedEvidence(
  ctx: any,
  user: any,
  _currentMessage: string,
  selectedRoute: string,
  evidence: TelegramSourceUsedEvidence[],
  confidence = 'high'
): void {
  if (process.env.SPARK_BOT_TEST_MODE === '1') {
    return;
  }
  const chatId = ctx.chat?.id;
  const userId = ctx.from?.id ?? user?.id;
  if (chatId === undefined || userId === undefined || evidence.length === 0) {
    return;
  }
  for (const item of evidence) {
    void runBuilderSourceUsed({
      chatId,
      userId,
      currentMessage: selectedRoute,
      source: item.source,
      role: item.role,
      freshness: item.freshness,
      sourceRef: item.sourceRef,
      summary: item.summary,
      userIntent: selectedRoute,
      selectedRoute,
      confidence,
      actorId: 'spark-telegram-bot'
    }).catch((error) => {
      const detail = error instanceof Error ? error.message : String(error);
      console.warn(`[SourceLedger] failed to record ${item.source} for ${selectedRoute}: ${redactText(detail)}`);
    });
  }
}

function runtimeTruthSourceEvidence(text: string): TelegramSourceUsedEvidence[] {
  const signals = runtimeTruthSignals(text);
  const evidence: TelegramSourceUsedEvidence[] = [];
  if (signals.access) {
    evidence.push(
      {
        source: 'operator_supplied_access',
        role: 'permission_context',
        freshness: 'fresh',
        sourceRef: 'spark access status --level 5 --json',
        summary: 'Telegram answer used the current Spark access state.'
      },
      {
        source: 'runner_preflight',
        role: 'execution_capability_context',
        freshness: 'live_probed',
        sourceRef: 'telegram runner writability preflight',
        summary: 'Telegram answer used the current runner writability preflight.'
      }
    );
  }
  if (signals.live) {
    evidence.push(
      {
        source: 'current_diagnostics',
        role: 'live_runtime_status',
        freshness: 'live_probed',
        sourceRef: 'spark live status',
        summary: 'Telegram answer used fresh Spark Live status.'
      },
      {
        source: 'live_probe',
        role: 'supervision_cross_check',
        freshness: 'live_probed',
        sourceRef: 'spark verify --deep',
        summary: 'Telegram answer used a supervision cross-check.'
      }
    );
  }
  if (signals.providers) {
    evidence.push({
      source: 'current_diagnostics',
      role: 'provider_status',
      freshness: 'live_probed',
      sourceRef: 'spark providers status',
      summary: 'Telegram answer used fresh provider status.'
    });
  }
  if (signals.memory) {
    evidence.push({
      source: 'current_diagnostics',
      role: 'memory_builder_status',
      freshness: 'live_probed',
      sourceRef: 'spark verify --deep',
      summary: 'Telegram answer used fresh Builder/memory evidence.'
    });
  }
  return evidence;
}

function isLiveSparkHealthQuestion(text: string): boolean {
  const normalized = text.toLowerCase().replace(/\s+/g, ' ').trim();
  if (!normalized) return false;
  return (
    /\bspark live status\b/.test(normalized) ||
    /\blive spark health\b/.test(normalized) ||
    /\bsame source as spark live status\b/.test(normalized) ||
    (/\bspawner\b/.test(normalized) && /\btelegram\b/.test(normalized) && /\b(?:supervised|running|stopped|health|live)\b/.test(normalized))
  );
}

function isSpawnerGoldenPathRequest(text: string): boolean {
  const normalized = text.toLowerCase().replace(/\s+/g, ' ').trim();
  return (
    /\bgolden[_\s-]*path\b/.test(normalized) ||
    (/\btiny mission\b/.test(normalized) && /\bspawner\b/.test(normalized)) ||
    (/\b(?:golden_path_ok|spark_qa_no_edit_ok)\b/.test(normalized) && /\bspawner\b/.test(normalized)) ||
    (/\bstart\s+(?:a\s+)?mission\b/.test(normalized) &&
      /\bonly\s+repl(?:y|ies)\b/.test(normalized) &&
      /\b(?:do(?:es)?\s+not|don't|dont)\s+edit\s+files\b/.test(normalized))
  );
}

function extractNoEditMissionReplyPhrase(text: string): string {
  const exactReply = text.match(/\bonly\s+repl(?:y|ies)\s*:?\s*[`"']?([A-Za-z0-9_ -]{2,80}?)[`"']?(?:[.!?\n]|$)/i)?.[1]?.trim();
  if (exactReply) {
    return exactReply.replace(/\s+/g, ' ').trim();
  }
  const bareToken = text.match(/\b([A-Z][A-Z0-9_]{5,80})\b/)?.[1]?.trim();
  return bareToken || 'GOLDEN_PATH_OK';
}

function compactSparkLiveOutput(output: string): string {
  return output
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !/^Useful:/i.test(line) && !/^spark live /i.test(line))
    .slice(0, 18)
    .join('\n');
}

async function renderAuthoritativeSparkLiveStatus(): Promise<string> {
  try {
    const [liveStatus, deepVerify] = await Promise.all([
      runSparkCli(['live', 'status'], 45_000),
      runSparkCli(['verify', '--deep'], 90_000).catch((error) => `verify_failed: ${error instanceof Error ? error.message : String(error)}`)
    ]);
    const spawnerOk = /\[OK\]\s+spawner-ui/i.test(liveStatus);
    const telegramOk = /\[OK\]\s+spark-telegram-bot/i.test(liveStatus);
    const supervised = deepVerify.match(/Runtime processes are running under Spark supervision:\s*([^\n]+)/i)?.[1]?.trim();
    return [
      '✅ Spark Live health',
      '',
      'Source: local Spark CLI from this Telegram runtime.',
      'Commands: `spark live status`; supervision cross-check: `spark verify --deep`.',
      '',
      `Spawner: ${spawnerOk ? 'OK' : 'not OK in live status'}.`,
      `Telegram: ${telegramOk ? 'OK' : 'not OK in live status'}.`,
      supervised ? `Supervision: ${supervised.replace(/\.+$/, '')}.` : 'Supervision: not proven by verify output.',
      '',
      compactSparkLiveOutput(liveStatus)
    ].join('\n');
  } catch (error) {
    return [
      '⚠️ Spark Live health is unverified.',
      '',
      'What happened',
      `• ${sparkCliFailureReason(error)}`,
      '',
      'What this means',
      '• Telegram could not prove live Spark health from here.',
      '• This is not proof that Spawner or Telegram are offline.',
      '',
      'Next move',
      '• Run /diagnose, or check `spark live status` from the Spark CLI.'
    ].join('\n');
  }
}

function firstMatchingLine(output: string, pattern: RegExp): string {
  return output
    .split(/\r?\n/)
    .map((line) => line.trim())
    .find((line) => pattern.test(line)) || '';
}

async function renderAuthoritativeSparkLiveStateAnswer(): Promise<string> {
  try {
    const [liveStatus, deepVerify] = await Promise.all([
      runSparkCli(['live', 'status'], 45_000),
      runSparkCli(['verify', '--deep'], 90_000).catch((error) => `verify_failed: ${error instanceof Error ? error.message : String(error)}`)
    ]);
    const liveReady = /\[OK\]\s+Spark Live is ready/i.test(liveStatus);
    const spawnerLine = firstMatchingLine(liveStatus, /\[OK\]\s+spawner-ui|spawner-ui:/i);
    const telegramLine = firstMatchingLine(liveStatus, /\[OK\]\s+spark-telegram-bot|spark-telegram-bot:/i);
    const profilesLine = firstMatchingLine(liveStatus, /Telegram profiles:/i);
    const rolesLine = firstMatchingLine(liveStatus, /LLM roles:/i);
    const supervised = deepVerify.match(/Runtime processes are running under Spark supervision:\s*([^\n]+)/i)?.[1]?.trim();
    const spawnerOk = /\[OK\]\s+spawner-ui/i.test(spawnerLine);
    const telegramOk = /\[OK\]\s+spark-telegram-bot/i.test(telegramLine);
    const headline = liveReady && spawnerOk && telegramOk
      ? 'Current live state: healthy.'
      : 'Current live state: attention needed.';
    return [
      headline,
      '',
      'Fresh `spark live status` evidence:',
      spawnerLine ? `- Spawner UI: ${spawnerOk ? 'OK' : 'not OK'} - ${spawnerLine.replace(/^\[OK\]\s+spawner-ui:\s*/i, '')}` : '- Spawner UI: not reported by live status.',
      telegramLine ? `- Telegram: ${telegramOk ? 'OK' : 'not OK'} - ${telegramLine.replace(/^\[OK\]\s+spark-telegram-bot:\s*/i, '')}` : '- Telegram: not reported by live status.',
      profilesLine ? `- ${profilesLine}` : '',
      rolesLine ? `- ${rolesLine}` : '',
      supervised ? `- Supervision: ${supervised.replace(/\.+$/, '')}.` : '- Supervision: not proven by verify output.',
      '',
      liveReady && spawnerOk && telegramOk
        ? 'Call: Spark Live, Spawner, and Telegram are up right now.'
        : 'Call: at least one live operating surface is not proven healthy right now.'
    ].filter(Boolean).join('\n');
  } catch (error) {
    return [
      '⚠️ Current live state is unknown.',
      '',
      `What happened: ${sparkCliFailureReason(error)}`,
      '',
      'Call: this is a probe failure, not proof that Spawner or Telegram are down.'
    ].join('\n');
  }
}

async function renderAuthoritativeSparkRiskProfileAnswer(): Promise<string> {
  try {
    const [liveStatus, providerStatus] = await Promise.all([
      runSparkCli(['live', 'status'], 45_000),
      runSparkCli(['providers', 'status'], 45_000).catch((error) => `provider_check_failed: ${error instanceof Error ? error.message : String(error)}`)
    ]);
    const liveReady = /\[OK\]\s+Spark Live is ready/i.test(liveStatus);
    const spawnerOk = /\[OK\]\s+spawner-ui/i.test(liveStatus);
    const telegramOk = /\[OK\]\s+spark-telegram-bot/i.test(liveStatus);
    const providersOk = !/provider_check_failed/i.test(providerStatus) && !/\[(?:FAIL|ERROR|WARN)\]/i.test(providerStatus);
    const risk = liveReady && spawnerOk && telegramOk && providersOk ? 'low' : 'attention';
    return [
      `Current Spark risk profile: ${risk}.`,
      '',
      'Fresh evidence:',
      `- Live stack: ${liveReady ? 'ready' : 'not fully ready'}.`,
      `- Spawner: ${spawnerOk ? 'OK' : 'not proven OK'}.`,
      `- Telegram: ${telegramOk ? 'OK' : 'not proven OK'}.`,
      `- Providers: ${providersOk ? 'OK by provider status' : 'not fully proven by provider status'}.`,
      '',
      risk === 'low'
        ? 'Call: the main risk right now is regression/drift from future changes, not a current outage. I did not start a mission or repair action.'
        : 'Call: at least one surface needs attention before trusting execution. I did not start a mission or repair action.'
    ].join('\n');
  } catch (error) {
    return [
      '⚠️ Current Spark risk profile is unknown.',
      '',
      `What happened: ${sparkCliFailureReason(error)}`,
      'I did not start a mission or repair action.'
    ].join('\n');
  }
}

async function buildAocLiveState(): Promise<Record<string, unknown>> {
  try {
    const [liveStatus, providerStatus, deepVerify] = await Promise.all([
      runSparkCli(['live', 'status'], 45_000),
      runSparkCli(['providers', 'status'], 45_000).catch((error) => `provider_check_failed: ${error instanceof Error ? error.message : String(error)}`),
      runSparkCli(['verify', '--deep'], 90_000).catch((error) => `verify_failed: ${error instanceof Error ? error.message : String(error)}`)
    ]);
    const liveReady = /\[OK\]\s+Spark Live is ready/i.test(liveStatus);
    const spawnerOk = /\[OK\]\s+spawner-ui/i.test(liveStatus);
    const telegramOk = /\[OK\]\s+spark-telegram-bot/i.test(liveStatus);
    const providersOk = !/provider_check_failed/i.test(providerStatus) && !/\[(?:FAIL|ERROR|WARN)\]/i.test(providerStatus);
    const memoryOk = /\[OK\]\s+(?:domain-chip-memory|spark-researcher|spark-intelligence-builder)/i.test(liveStatus) || /memory|domain-chip-memory|researcher/i.test(deepVerify);
    return {
      status: liveReady && spawnerOk && telegramOk ? 'healthy' : 'attention',
      spawner_ok: spawnerOk,
      telegram_ok: telegramOk,
      providers_ok: providersOk,
      memory_ok: memoryOk,
      checked_at: new Date().toISOString(),
      source: 'telegram_runtime_probe',
      source_ref: 'spark live status; spark providers status; spark verify --deep',
      freshness: 'live_probed',
      claim_boundary: 'Live Spark state was probed by the Telegram runtime for this AOC request and can go stale after restart.'
    };
  } catch (error) {
    const detail = redactText(error instanceof Error ? error.message : String(error));
    return {
      status: 'unknown',
      checked_at: new Date().toISOString(),
      source: 'telegram_runtime_probe',
      source_ref: 'spark live status',
      freshness: 'unknown',
      error: detail,
      claim_boundary: 'Telegram could not probe live Spark state for this AOC request; absence of proof is not outage proof.'
    };
  }
}

async function renderMemoryRuntimeSeparationAnswer(): Promise<string> {
  try {
    const liveStatus = await runSparkCli(['live', 'status'], 45_000);
    const liveReady = /\[OK\]\s+Spark Live is ready/i.test(liveStatus);
    const spawnerOk = /\[OK\]\s+spawner-ui/i.test(liveStatus);
    const telegramOk = /\[OK\]\s+spark-telegram-bot/i.test(liveStatus);
    return [
      'No. Remembering a phrase does not change live Spark health.',
      '',
      `Fresh live state after the memory write: ${liveReady && spawnerOk && telegramOk ? 'healthy' : 'attention needed'}.`,
      `Spawner: ${spawnerOk ? 'OK' : 'not proven OK'}. Telegram: ${telegramOk ? 'OK' : 'not proven OK'}.`,
      '',
      'Memory can change recall/history. Runtime health still has to come from live probes.'
    ].join('\n');
  } catch (error) {
    const detail = redactText(error instanceof Error ? error.message : String(error));
    return [
      'No. Remembering a phrase should not change live Spark health.',
      '',
      `I could not refresh live health for this answer: ${detail}`
    ].join('\n');
  }
}

function objectRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' ? value as Record<string, unknown> : {};
}

function boolText(value: unknown): string {
  return value === true ? 'yes' : value === false ? 'no' : 'unknown';
}

async function renderAuthoritativeSparkAccessStatus(chatId: string | number): Promise<string> {
  const [chatProfile, runnerPreflight] = await Promise.all([
    getSparkAccessProfile(chatId),
    probeTelegramRunnerWritability()
  ]);
  const runnerSummary = renderSparkAccessCapabilityStatus(chatProfile, runnerPreflight);
  const runnerLine = runnerSummary.split('\n').find((line) => /^Runner:/i.test(line)) || 'Runner: not checked yet.';
  try {
    const rawStatus = await runSparkCli(['access', 'status', '--level', '5', '--json'], 30_000);
    const payload = JSON.parse(rawStatus) as Record<string, unknown>;
    const level5 = objectRecord(payload.level5);
    const stateMachine = objectRecord(payload.state_machine);
    const effective = payload.effective_access_level ?? stateMachine.effective_access_level ?? 'unknown';
    const requested = stateMachine.requested_access_level ?? payload.access_level ?? 'unknown';
    const activation = String(level5.activation_state || stateMachine.activation_state || 'unknown');
    const serviceEnabled = level5.service_enabled === true || stateMachine.service_can_operate_whole_computer === true;
    const chatLevel = sparkAccessLevel(chatProfile);
    return [
      'Spark Access Status',
      '',
      `Chat setting: Access level ${chatLevel}.`,
      `Requested by CLI: Level ${requested}.`,
      `Effective by CLI: Level ${effective}.`,
      `Level 5: ${serviceEnabled ? 'active' : 'blocked/off'} (activation_state: ${activation}, service_enabled: ${boolText(level5.service_enabled)}).`,
      '',
      runnerLine,
      '',
      serviceEnabled && chatProfile === 'operator'
        ? 'Verdict: whole-computer operator mode is active, with destructive/secret/publish safety checks still on.'
        : serviceEnabled
          ? `Verdict: Level 5 service guardrails are active, but this chat is set to Access level ${chatLevel}. Use /access 5 to enter operator mode, or /access 4 to return services to the workspace sandbox.`
        : `Verdict: chat is set to Level ${sparkAccessLevel(chatProfile)}, but whole-computer Level 5 is not active. Effective local work is Level ${effective}.`
    ].join('\n');
  } catch (error) {
    return [
      '⚠️ Spark Access status is partly unverified.',
      '',
      `Chat setting: Access level ${sparkAccessLevel(chatProfile)}.`,
      'CLI effective access: unavailable.',
      `Why: ${sparkCliFailureReason(error)}`,
      '',
      runnerLine,
      '',
      'Verdict: this runner could not read the authoritative access state, so I will not claim Level 5 is active.'
    ].join('\n');
  }
}

async function readSparkAccessState(): Promise<{
  effective: unknown;
  requested: unknown;
  activation: string;
  serviceEnabled: boolean;
  workspaceWritable: unknown;
}> {
  const rawStatus = await runSparkCli(['access', 'status', '--level', '5', '--json'], 30_000);
  const payload = JSON.parse(rawStatus) as Record<string, unknown>;
  const level5 = objectRecord(payload.level5);
  const stateMachine = objectRecord(payload.state_machine);
  const workspacePreflight = objectRecord(payload.workspace_preflight);
  return {
    effective: payload.effective_access_level ?? stateMachine.effective_access_level ?? 'unknown',
    requested: stateMachine.requested_access_level ?? payload.access_level ?? 'unknown',
    activation: String(level5.activation_state || stateMachine.activation_state || 'unknown'),
    serviceEnabled: level5.service_enabled === true || stateMachine.service_can_operate_whole_computer === true,
    workspaceWritable: workspacePreflight.writable
  };
}

function shouldAnswerAuthoritativeAccessCapability(text: string): boolean {
  const normalized = text.toLowerCase().replace(/\s+/g, ' ').trim();
  if (!normalized) return false;
  return (
    /\b(?:are|is)\s+(?:you|recursive|runner|telegram\s+runner|this\s+runner)\s+(?:writable|read[-\s]*only)\b/.test(normalized) ||
    /\bcan\s+you\s+(?:edit|write|modify|touch)\b.*\b(?:files?|outside|workspace|computer|machine)\b/.test(normalized) ||
    /\b(?:edit|write|modify|touch)\s+files?\s+outside\s+(?:the\s+)?spark\s+workspace\b/.test(normalized) ||
    /\boutside[-\s]*workspace\s+(?:edits?|writes?|access)\b/.test(normalized) ||
    /\beffective\s+access\s+level\b/.test(normalized) && /\b(?:writable|edit|write|runner|current|right\s+now)\b/.test(normalized)
  );
}

function shouldAnswerSparkRiskProfile(text: string): boolean {
  const normalized = text.toLowerCase().replace(/\s+/g, ' ').trim();
  return /\bspark\b/.test(normalized) && /\brisk\s+profile\b/.test(normalized);
}

function shouldAnswerMemoryRuntimeSeparation(text: string): boolean {
  const normalized = text.toLowerCase().replace(/\s+/g, ' ').trim();
  return /\bdid\b.*\bremember(?:ing)?\b.*\bchange\b.*\b(?:live\s+)?spark\s+health\b/.test(normalized);
}

async function renderAuthoritativeSparkEditCapabilityAnswer(chatId: string | number): Promise<string> {
  const [chatProfile, runnerPreflight] = await Promise.all([
    getSparkAccessProfile(chatId),
    probeTelegramRunnerWritability()
  ]);
  try {
    const accessState = await readSparkAccessState();
    const chatLevel = sparkAccessLevel(chatProfile);
    const runnerWritable = runnerPreflight.runnerWritable === 'yes';
    const canOperateOutsideWorkspace = accessState.serviceEnabled && chatProfile === 'operator' && runnerWritable;
    return [
      canOperateOutsideWorkspace
        ? 'Yes. This Telegram runner is writable and Level 5 operator mode is active.'
        : 'No. Whole-computer file work is not fully available from this Telegram runner right now.',
      '',
      'Fresh access evidence:',
      `- Chat setting: Access level ${chatLevel}.`,
      `- Requested by CLI: Level ${accessState.requested}.`,
      `- Effective by CLI: Level ${accessState.effective}.`,
      `- Level 5 service guardrails: ${accessState.serviceEnabled ? 'active' : 'off/blocked'} (${accessState.activation}).`,
      `- Runner writable: ${runnerPreflight.runnerWritable}.`,
      `- Spark workspace writable: ${boolText(accessState.workspaceWritable)}.`,
      '',
      canOperateOutsideWorkspace
        ? 'Boundary: routine outside-workspace operator work is allowed, but deleting important files, exposing secrets, publishing, or deploying still requires confirmation.'
        : 'Boundary: Spark should stay in the workspace/sandbox path unless Level 5 service guardrails, chat access, and runner writability are all active.'
    ].join('\n');
  } catch (error) {
    return [
      '⚠️ I cannot prove whole-computer file access from current Spark access state.',
      '',
      `Why: ${sparkCliFailureReason(error)}`,
      `Runner writable: ${runnerPreflight.runnerWritable}.`,
      '',
      'So I will treat outside-workspace edits as unavailable until the access check succeeds.'
    ].join('\n');
  }
}

async function renderLevel5ActivationAnswer(chatId: string | number): Promise<string> {
  const [chatProfile, runnerPreflight] = await Promise.all([
    getSparkAccessProfile(chatId),
    probeTelegramRunnerWritability()
  ]);
  try {
    const rawStatus = await runSparkCli(['access', 'status', '--level', '5', '--json'], 30_000);
    const payload = JSON.parse(rawStatus) as Record<string, unknown>;
    const level5 = objectRecord(payload.level5);
    const stateMachine = objectRecord(payload.state_machine);
    const effective = payload.effective_access_level ?? stateMachine.effective_access_level ?? 'unknown';
    const requested = stateMachine.requested_access_level ?? payload.access_level ?? 'unknown';
    const activation = String(level5.activation_state || stateMachine.activation_state || 'unknown');
    const serviceEnabled = level5.service_enabled === true || stateMachine.service_can_operate_whole_computer === true;
    const runner = runnerPreflight.runnerWritable === 'yes'
      ? 'This Telegram runner is writable.'
      : `This Telegram runner is not writable${runnerPreflight.failureReason ? ` (${runnerPreflight.failureReason})` : ''}.`;
    if (serviceEnabled && chatProfile !== 'operator') {
      return [
        'Level 5 service guardrails are active, but this chat is not in Level 5 operator mode.',
        '',
        `This chat is set to Access level ${sparkAccessLevel(chatProfile)}. Requested level is ${requested}, effective service level is ${effective}.`,
        runner,
        'Use /access 5 to enter operator mode, or /access 4 to return services to the workspace sandbox.'
      ].join('\n');
    }
    if (serviceEnabled) {
      return [
        'Level 5 is active.',
        '',
        `Requested level is ${requested}, effective level is ${effective}, and the service guardrails are enabled.`,
        runner,
        'I will still ask before destructive actions, secret exposure, publishing, or deploys.'
      ].join('\n');
    }
    return [
      'Level 5 is only requested right now, not active.',
      '',
      `Spark reports effective access Level ${effective}; Level 5 is ${activation}.`,
      runner,
      'So local workspace work is available, but whole-computer operator mode is not live.'
    ].join('\n');
  } catch (error) {
    const detail = redactText(error instanceof Error ? error.message : String(error));
    return [
      'I cannot prove Level 5 is active from the local Spark access state.',
      '',
      `Access check failed: ${detail}`,
      'So I will treat Level 5 as not active rather than overclaiming.'
    ].join('\n');
  }
}

function shouldAnswerRuntimeTruthPriority(text: string): boolean {
  const normalized = text.toLowerCase().replace(/\s+/g, ' ').trim();
  if (!normalized) return false;
  return (
    /\b(?:which|what)\s+source\s+wins\b/.test(normalized) ||
    /\b(?:memory|old\s+memory|stale\s+memory)\b.*\b(?:spark\s+live\s+status|fresh\s+(?:state|runtime)|current\s+(?:state|truth))\b.*\b(?:wins?|trust|believe|use)\b/.test(normalized) ||
    /\b(?:spark\s+live\s+status|fresh\s+(?:state|runtime)|current\s+(?:state|truth))\b.*\b(?:memory|old\s+memory|stale\s+memory)\b.*\b(?:wins?|trust|believe|use)\b/.test(normalized)
  );
}

function renderRuntimeTruthPriorityAnswer(): string {
  return [
    'Fresh runtime state wins for current-state questions.',
    '',
    'Rule: `spark live status`, `spark access status`, provider checks, and direct smoke probes are authoritative for what is true right now. Memory is useful for history and continuity, but it must not override fresh runtime evidence.',
    '',
    'So if memory says Spawner is down and fresh `spark live status` says Spawner is up, Spawner is up right now. The memory becomes stale context, not current truth.'
  ].join('\n');
}

function shouldAnswerRestartSurvivalQuestion(text: string): boolean {
  const normalized = text.toLowerCase().replace(/\s+/g, ' ').trim();
  return (
    /\bsurviv(?:e|ed)\b.*\brestart\b/.test(normalized) ||
    /\brestart\b.*\bsurviv(?:e|ed)\b/.test(normalized)
  );
}

async function renderRestartSurvivalAnswer(chatId: string | number): Promise<string> {
  try {
    const [accessState, liveStatus, providerStatus, deepVerify, chatProfile] = await Promise.all([
      readSparkAccessState(),
      runSparkCli(['live', 'status'], 45_000),
      runSparkCli(['providers', 'status'], 45_000),
      runSparkCli(['verify', '--deep'], 90_000).catch((error) => `verify_failed: ${error instanceof Error ? error.message : String(error)}`),
      getSparkAccessProfile(chatId)
    ]);
    const spawnerOk = /\[OK\]\s+spawner-ui/i.test(liveStatus);
    const telegramOk = /\[OK\]\s+spark-telegram-bot/i.test(liveStatus);
    const memoryOk = /\[OK\]\s+(?:domain-chip-memory|spark-researcher|spark-intelligence-builder)/i.test(liveStatus) || /memory|domain-chip-memory|researcher/i.test(deepVerify);
    const roles = providerStatus
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => /^\[OK\]\s+(?:chat|builder|memory|mission)\b/i.test(line))
      .slice(0, 4);
    return [
      'Fresh post-restart state:',
      '',
      `- Access chat setting: Level ${sparkAccessLevel(chatProfile)}.`,
      `- Effective CLI access: Level ${accessState.effective}.`,
      `- Level 5 guardrails: ${accessState.serviceEnabled ? 'active' : 'off/blocked'} (${accessState.activation}).`,
      `- Spawner supervision/health: ${spawnerOk ? 'OK' : 'not proven OK'}.`,
      `- Telegram supervision/health: ${telegramOk ? 'OK' : 'not proven OK'}.`,
      `- Memory/Builder evidence: ${memoryOk ? 'OK present' : 'not proven OK'}.`,
      roles.length ? `- Provider roles: ${roles.map((line) => line.replace(/^\[OK\]\s+/, '')).join('; ')}.` : '- Provider roles: not proven by provider status.',
      '',
      'Call: durable config/memory can survive restart, but live capability is only trusted after these fresh checks pass.'
    ].join('\n');
  } catch (error) {
    const detail = redactText(error instanceof Error ? error.message : String(error));
    return [
      'I could not prove what survived the restart from fresh checks.',
      '',
      `Error: ${detail}`
    ].join('\n');
  }
}

function shouldAnswerMissionProvenanceQuestion(text: string): boolean {
  const normalized = text.toLowerCase().replace(/\s+/g, ' ').trim();
  return (
    /\b(?:did|whether|can\s+you\s+tell)\b.*\bmission\b.*\b(?:spawner|chat)\b/.test(normalized) ||
    /\b(?:ran|run|routed)\s+through\s+spawner\b/.test(normalized) ||
    /\bjust\s+through\s+chat\b/.test(normalized)
  );
}

async function renderMissionProvenanceAnswer(ctx: any, user: any): Promise<string> {
  const key = noEditProbeKey(ctx);
  const latestProbe = lastNoEditProbeMissions.get(key) || await readNoEditProbeMission(key).catch(() => null);
  if (latestProbe) {
    return [
      'Yes. The latest no-edit probe was routed through Spawner, not just chat.',
      '',
      `Evidence: Telegram created Spawner mission \`${latestProbe.missionId}\` for the requested reply \`${latestProbe.requestedPhrase}\` at ${latestProbe.startedAt}.`,
      'A plain chat answer would not have a Spawner mission id.'
    ].join('\n');
  }
  const recentMessages = await conversation.getRecentMessages(user, 8).catch(() => []);
  const recentText = recentMessages.join('\n');
  const missionId = recentText.match(/\bMission:\s*((?:spark|mission)-[A-Za-z0-9_-]+)/i)?.[1] ||
    recentText.match(/\b((?:spark|mission)-[0-9A-Za-z_-]{6,})\b/)?.[1];
  if (missionId) {
    return [
      'Most likely Spawner, not plain chat.',
      '',
      `Evidence: the recent thread includes mission id \`${missionId}\`. A plain chat answer would not normally produce a Spawner mission id.`,
      'I do not have a durable no-edit probe record for this mission, so this is provenance from recent thread evidence rather than the probe store.'
    ].join('\n');
  }
  return [
    'I cannot prove whether the latest mission ran through Spawner from the current thread state.',
    '',
    'The proof I need is a fresh mission id or a Spawner result record. Without that, I should not claim it was Spawner.'
  ].join('\n');
}

type RuntimeTruthSignals = {
  access: boolean;
  live: boolean;
  providers: boolean;
  memory: boolean;
};

function runtimeTruthSignals(text: string): RuntimeTruthSignals {
  const normalized = text.toLowerCase().replace(/\s+/g, ' ').trim();
  if (!normalized) {
    return { access: false, live: false, providers: false, memory: false };
  }
  const sourceCheck = /\b(?:old\s+memory|fresh\s+state|fresh\s+runtime|current\s+truth|using\s+memory|using\s+fresh)\b/.test(normalized);
  const access = (
    sourceCheck ||
    /\blevel\s*[1-5]\b/.test(normalized) ||
    /\bspark\s+access\b/.test(normalized) ||
    /\baccess\s+(?:level|profile|status)\b/.test(normalized) ||
    /\b(?:runner|read[-\s]*only|writable|operator\s+mode|whole[-\s]*computer|full\s+access)\b/.test(normalized)
  );
  const live = (
    sourceCheck ||
    /\bcurrent\s+(?:live\s+)?(?:state|status)\s+of\s+spark\b/.test(normalized) ||
    /\bcurrent\s+spark\s+(?:state|status)\b/.test(normalized) ||
    /\blive\s+state\b/.test(normalized) ||
    /\bspark\s+live\b/.test(normalized) ||
    /\blive\s+(?:spark\s+)?(?:health|status|system|stack|state)\b/.test(normalized) ||
    /\b(?:spawner|mission\s+control|telegram|relay|supervised|supervision|running|stopped|offline|online|health|systems?|state)\b/.test(normalized) &&
      /\b(?:spark|spawner|telegram|relay|live|supervised|system|stack|health|status|state|running|stopped|offline|online)\b/.test(normalized)
  );
  const providers = (
    sourceCheck ||
    /\b(?:provider|providers|llm|model|models|codex|openai|anthropic|openrouter|ollama|chat\s+model|current\s+model)\b/.test(normalized) &&
      /\b(?:spark|current|using|configured|healthy|working|status|test|which|what|who)\b/.test(normalized)
  );
  const memory = (
    sourceCheck ||
    /\b(?:memory\s+bridge|builder\s+memory|domain[-\s]*chip[-\s]*memory|recall|remember|memory\s+health|memory\s+status)\b/.test(normalized) &&
      /\b(?:spark|builder|memory|bridge|health|status|online|offline|working|current)\b/.test(normalized)
  );
  return { access, live, providers, memory };
}

function shouldAttachFreshRuntimeTruthContext(text: string): boolean {
  const signals = runtimeTruthSignals(text);
  return signals.access || signals.live || signals.providers || signals.memory;
}

function shouldAnswerAuthoritativeRuntimeStatus(text: string): boolean {
  const normalized = text.toLowerCase().replace(/\s+/g, ' ').trim();
  if (!runtimeTruthSignals(text).live) return false;
  return (
    isLiveSparkHealthQuestion(text) ||
    /\bcurrent\s+(?:live\s+)?(?:state|status)\s+of\s+spark\b/.test(normalized) ||
    /\bcurrent\s+spark\s+(?:state|status)\b/.test(normalized) ||
    /\bwhat\s+is\s+(?:the\s+)?(?:current\s+)?live\s+state\b/.test(normalized) ||
    /\b(?:is|are)\s+(?:spawner|telegram|spark|systems?|stack)\b.*\b(?:healthy|running|online|up|live|supervised)\b/.test(normalized) ||
    /\b(?:spawner|telegram)\b.*\b(?:healthy|running|supervised|stopped|offline|online|up|down)\b/.test(normalized)
  );
}

function shouldAnswerAuthoritativeProviderStatus(text: string): boolean {
  const normalized = text.toLowerCase().replace(/\s+/g, ' ').trim();
  if (!runtimeTruthSignals(text).providers) return false;
  return (
    /\b(?:provider|providers|routing|model|models|llm|codex|reasoning|service\s+tier|high\s+fast)\b/.test(normalized) &&
    /\b(?:are|is|am|what|which|show|check|tell|using|running|configured|current|right\s+now)\b/.test(normalized)
  );
}

type ProviderRoleStatus = {
  role: string;
  provider: string;
  model: string;
  auth: string;
  serviceTier?: string;
  reasoning?: string;
  ok: boolean;
};

function parseProviderStatusOutput(output: string): ProviderRoleStatus[] {
  const rows: ProviderRoleStatus[] = [];
  const lines = output.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  for (let index = 0; index < lines.length; index += 1) {
    const match = lines[index].match(/^\[(OK|WARN|FAIL|ERROR)\]\s+(\w+)\s+provider=([^\s]+)\s+model=([^\s]+)\s+auth=([^\s]+)/i);
    if (!match) continue;
    const clientLine = lines[index + 1] || '';
    const clientMatch = clientLine.match(/service_tier=([^\s]+)\s+reasoning=([^\s]+)/i);
    rows.push({
      role: match[2].toLowerCase(),
      provider: match[3],
      model: match[4],
      auth: match[5],
      serviceTier: clientMatch?.[1],
      reasoning: clientMatch?.[2],
      ok: match[1].toUpperCase() === 'OK'
    });
  }
  return rows;
}

function renderProviderRoutingAnswer(output: string): string {
  const rows = parseProviderStatusOutput(output);
  if (!rows.length) {
    return [
      '🟡 I could not read provider routing cleanly.',
      '',
      'Try',
      '• /model',
      '• /diagnose'
    ].join('\n');
  }

  const allOk = rows.every((row) => row.ok);
  const allCodex = rows.every((row) => row.provider.toLowerCase() === 'codex');
  const codexRows = rows.filter((row) => row.provider.toLowerCase() === 'codex');
  const tier = codexRows.find((row) => row.serviceTier)?.serviceTier;
  const reasoning = codexRows.find((row) => row.reasoning)?.reasoning;
  const headline = allOk && allCodex && tier === 'fast' && reasoning === 'high'
    ? '🟢 Yes - this bot is on Codex high fast.'
    : allOk
      ? '🟢 Provider routing is healthy.'
      : '🟡 Provider routing needs attention.';

  const roleLabels: Record<string, string> = {
    chat: 'chat',
    builder: 'builder',
    memory: 'memory',
    mission: 'mission'
  };

  return [
    headline,
    '',
    'Roles',
    ...rows.map((row) => `• ${roleLabels[row.role] || row.role}: ${row.provider} ${row.model}`),
    '',
    'Codex',
    `• reasoning ${reasoning || 'unknown'}`,
    `• tier ${tier || 'unknown'}`
  ].join('\n');
}

async function renderAuthoritativeProviderRoutingAnswer(): Promise<string> {
  try {
    const output = await runSparkCli(['providers', 'status'], 45_000);
    return renderProviderRoutingAnswer(output);
  } catch (error) {
    const detail = redactText(error instanceof Error ? error.message : String(error));
    return [
      '🟡 I could not verify provider routing right now.',
      '',
      'Reason',
      `• ${detail}`,
      '',
      'Try',
      '• /diagnose'
    ].join('\n');
  }
}

function compactRuntimeOutput(output: string, maxLines = 18): string {
  return output
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !/^Useful:/i.test(line))
    .slice(0, maxLines)
    .join('\n');
}

async function buildFreshRuntimeTruthContext(text: string, chatId: string | number): Promise<string> {
  const signals = runtimeTruthSignals(text);
  const [chatProfile, runnerPreflight] = await Promise.all([
    getSparkAccessProfile(chatId),
    probeTelegramRunnerWritability()
  ]);
  const lines = [
    'Fresh Spark runtime truth for this turn (ephemeral, not memory):',
    `- Chat access setting: Access level ${sparkAccessLevel(chatProfile)}.`,
    `- Telegram runner writable: ${runnerPreflight.runnerWritable}.`,
    runnerPreflight.runnerLabel ? `- Runner preflight: ${runnerPreflight.runnerLabel}.` : '',
  ];
  if (signals.access) {
    try {
      const rawStatus = await runSparkCli(['access', 'status', '--level', '5', '--json'], 30_000);
      const payload = JSON.parse(rawStatus) as Record<string, unknown>;
      const level5 = objectRecord(payload.level5);
      const stateMachine = objectRecord(payload.state_machine);
      const effective = payload.effective_access_level ?? stateMachine.effective_access_level ?? 'unknown';
      const requested = stateMachine.requested_access_level ?? payload.access_level ?? 'unknown';
      const activation = String(level5.activation_state || stateMachine.activation_state || 'unknown');
      const serviceEnabled = level5.service_enabled === true || stateMachine.service_can_operate_whole_computer === true;
      lines.push(
        `- Requested access from Spark CLI: Level ${requested}.`,
        `- Effective access from Spark CLI: Level ${effective}.`,
        `- Level 5 service guardrails active: ${serviceEnabled ? 'yes' : 'no'} (${activation}).`
      );
    } catch (error) {
      const detail = redactText(error instanceof Error ? error.message : String(error));
      lines.push(`- Fresh Spark CLI access check failed: ${detail}.`);
    }
  }
  if (signals.live) {
    try {
      const [liveStatus, deepVerify] = await Promise.all([
        runSparkCli(['live', 'status'], 45_000),
        runSparkCli(['verify', '--deep'], 90_000).catch((error) => `verify_failed: ${error instanceof Error ? error.message : String(error)}`)
      ]);
      const supervised = deepVerify.match(/Runtime processes are running under Spark supervision:\s*([^\n]+)/i)?.[1]?.trim();
      lines.push(
        '- Fresh live status:',
        compactRuntimeOutput(liveStatus, 14),
        supervised ? `- Supervision evidence: ${supervised.replace(/\.+$/, '')}.` : '- Supervision evidence: not proven by verify output.'
      );
    } catch (error) {
      const detail = redactText(error instanceof Error ? error.message : String(error));
      lines.push(`- Fresh live status check failed: ${detail}.`);
    }
  }
  if (signals.providers) {
    try {
      const providerStatus = await runSparkCli(['providers', 'status'], 45_000);
      lines.push('- Fresh provider status:', compactRuntimeOutput(providerStatus, 14));
    } catch (error) {
      const detail = redactText(error instanceof Error ? error.message : String(error));
      lines.push(`- Fresh provider status check failed: ${detail}.`);
    }
  }
  if (signals.memory) {
    try {
      const deepVerify = await runSparkCli(['verify', '--deep'], 90_000);
      const memoryLines = deepVerify
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter((line) => /memory|builder|domain-chip-memory|researcher/i.test(line))
        .slice(0, 10)
        .join('\n');
      lines.push('- Fresh memory/Builder evidence:', memoryLines || compactRuntimeOutput(deepVerify, 10));
    } catch (error) {
      const detail = redactText(error instanceof Error ? error.message : String(error));
      lines.push(`- Fresh memory/Builder check failed: ${detail}.`);
    }
  }
  lines.push(
    '',
    'Conversation guidance: Use these fresh facts as higher priority than older memory, persona, or generic access doctrine. Answer naturally and briefly. Do not dump raw status fields unless the user explicitly asks for raw/debug output. If fresh evidence is available, do not contradict it.'
  );
  return lines.filter(Boolean).join('\n');
}

function activeTelegramProfile(): string {
  try {
    return getTelegramRelayIdentity().profile;
  } catch {
    return process.env.SPARK_TELEGRAM_PROFILE || process.env.TELEGRAM_PROFILE || 'unknown';
  }
}

async function recordNaturalRouteShadow(ctx: any, text: string): Promise<NaturalRouteDecision | null> {
  try {
    return decideNaturalRoute(text, {
      recentMessages: await conversation.getRecentMessages(ctx.from, 15).catch(() => []),
      pendingBuildClarification: Boolean(
        ctx.chat?.id &&
        ctx.from?.id &&
        pendingClarificationForMessage(`${ctx.chat.id}-${ctx.from.id}`, text)
      )
    });
  } catch (error) {
    console.warn('[NaturalRoute] shadow decision failed:', error);
    return null;
  }
}

function recordNaturalRouteExecution(
  ctx: any,
  decision: NaturalRouteDecision | null,
  executedRoute: string,
  executedOwner: NaturalRouteOwnerSystem,
  executedAction: string
): void {
  if (!decision || !shouldWriteNaturalRouteLedger()) return;
  const record = createNaturalRouteExecutionRecord({
    decision,
    profile: activeTelegramProfile(),
    userId: ctx.from?.id,
    chatId: ctx.chat?.id,
    chatType: ctx.chat?.type,
    admin: conversation.isAdmin(ctx.from),
    executedRoute,
    executedOwner,
    executedAction
  });
  void appendNaturalRouteExecutionRecord(record).catch((error) => {
    console.warn('[NaturalRoute] execution ledger write failed:', error);
  });
}

function deterministicRouteAllowed(route: DeterministicRouteId, text: string): boolean {
  const verdict = evaluateDeterministicRoute(route, text);
  queueRouteArbiterShadow({
    route,
    text,
    verdict,
    profile: activeTelegramProfile()
  });
  if (!verdict.allow) {
    console.log(`[RouteFirewall] blocked route=${route} reason=${verdict.reason} textLen=${text.length}`);
  }
  return verdict.allow;
}

function nodeOutboundAuditPath(): string {
  return (
    process.env.SPARK_NODE_OUTBOUND_AUDIT_PATH ||
    path.join(os.homedir(), '.spark', 'state', 'spark-telegram-bot', 'node-outbound-audit.jsonl')
  );
}

const OUTBOUND_TRACE_CONTEXT_KEY = '__sparkTraceContext';

type NodeOutboundTraceContext = {
  route?: string;
  command?: string;
  replyKind?: string;
  requestId?: string;
  traceRef?: string;
  missionId?: string;
};

function opaqueRef(label: string, value: unknown): string {
  return `${label}_${createHash('sha256').update(String(value ?? '')).digest('hex').slice(0, 16)}`;
}

function chatRef(chatId: unknown): string {
  return opaqueRef('chat', chatId);
}

function userRef(userId: unknown): string {
  return opaqueRef('user', userId);
}

function extractOutboundTraceContext(extra: unknown): NodeOutboundTraceContext | null {
  if (!extra || typeof extra !== 'object') return null;
  const raw = (extra as Record<string, unknown>)[OUTBOUND_TRACE_CONTEXT_KEY];
  if (!raw || typeof raw !== 'object') return null;
  return raw as NodeOutboundTraceContext;
}

function stripOutboundTraceContext<T>(extra: T): T {
  if (!extra || typeof extra !== 'object' || !(OUTBOUND_TRACE_CONTEXT_KEY in (extra as Record<string, unknown>))) {
    return extra;
  }
  const clean = { ...(extra as Record<string, unknown>) };
  delete clean[OUTBOUND_TRACE_CONTEXT_KEY];
  return clean as T;
}

function outboundTraceExtra(traceContext: NodeOutboundTraceContext): Record<string, unknown> {
  return {
    [OUTBOUND_TRACE_CONTEXT_KEY]: traceContext
  };
}

export function buildNodeOutboundAuditRecord(
  chatId: unknown,
  deliveredText: unknown,
  now = new Date(),
  traceContext?: NodeOutboundTraceContext | null
): Record<string, unknown> {
  const text = typeof deliveredText === 'string' ? deliveredText : String(deliveredText ?? '');
  const requestId = typeof traceContext?.requestId === 'string' && traceContext.requestId.trim()
    ? traceContext.requestId.trim()
    : null;
  const traceRef = typeof traceContext?.traceRef === 'string' && traceContext.traceRef.trim()
    ? traceContext.traceRef.trim()
    : null;
  const missionId = typeof traceContext?.missionId === 'string' && traceContext.missionId.trim()
    ? traceContext.missionId.trim()
    : null;
  return {
    ts: now.toISOString(),
    event: 'telegram_node_delivered',
    privacy: 'metadata_only',
    chat_id_present: String(chatId ?? '').trim().length > 0,
    chat_ref: chatRef(chatId),
    text_length: text.length,
    trace_context_present: Boolean(requestId || traceRef || missionId),
    mission_id_present: Boolean(missionId),
    ...(requestId ? { request_id: requestId } : {}),
    ...(traceRef ? { trace_ref: traceRef } : {}),
    ...(typeof traceContext?.route === 'string' && traceContext.route.trim() ? { route: traceContext.route.trim() } : {}),
    ...(typeof traceContext?.command === 'string' && traceContext.command.trim() ? { command: traceContext.command.trim() } : {}),
    ...(typeof traceContext?.replyKind === 'string' && traceContext.replyKind.trim() ? { reply_kind: traceContext.replyKind.trim() } : {})
  };
}

function recordNodeOutboundDelivery(chatId: unknown, deliveredText: unknown, traceContext?: NodeOutboundTraceContext | null): void {
  const auditPath = nodeOutboundAuditPath();
  const record = buildNodeOutboundAuditRecord(chatId, deliveredText, new Date(), traceContext);
  mkdir(path.dirname(auditPath), { recursive: true })
    .then(() => appendFile(auditPath, `${JSON.stringify(record)}\n`, 'utf-8'))
    .catch((error) => {
      console.warn('[OutboundAudit] failed to write node delivery audit:', error);
    });
}

function finalAnswerGateAuditPath(): string {
  return (
    process.env.SPARK_FINAL_ANSWER_GATE_AUDIT_PATH ||
    path.join(os.homedir(), '.spark', 'state', 'spark-telegram-bot', 'final-answer-gate-audit.jsonl')
  );
}

type FinalAnswerGateSuppressionInput = {
  chatId: unknown;
  userId: unknown;
  suppressionReason: string;
  builderRoutingDecision: string;
  builderBridgeMode: string;
  builderReply: string;
  requestId?: string;
  traceRef?: string;
  fallbackRoute: 'local_chat';
};

function recordFinalAnswerGateSuppression(input: FinalAnswerGateSuppressionInput): void {
  const auditPath = finalAnswerGateAuditPath();
  const requestId = String(input.requestId || '').trim();
  const traceRef = String(input.traceRef || '').trim();
  const record = {
    ts: new Date().toISOString(),
    event: 'final_answer_checked',
    outcome: 'suppressed_builder_reply',
    chat_id_present: String(input.chatId ?? '').trim().length > 0,
    user_id_present: String(input.userId ?? '').trim().length > 0,
    chat_ref: chatRef(input.chatId),
    user_ref: userRef(input.userId),
    suppression_reason: input.suppressionReason,
    builder_routing_decision: input.builderRoutingDecision || '',
    builder_bridge_mode: input.builderBridgeMode || '',
    builder_reply_length: input.builderReply.length,
    builder_reply_redacted: true,
    ...(requestId ? { request_id: requestId } : {}),
    ...(traceRef ? { trace_ref: traceRef } : {}),
    fallback_route: input.fallbackRoute,
    latest_intent_preserved: true
  };
  mkdir(path.dirname(auditPath), { recursive: true })
    .then(() => appendFile(auditPath, `${JSON.stringify(record)}\n`, 'utf-8'))
    .catch((error) => {
      console.warn('[FinalAnswerGate] failed to write suppression audit:', error);
    });
}

function recordCommandReplyDelivery(input: {
  command: string;
  replyKind: string;
  requestId?: string | null;
  traceRef?: string | null;
}): void {
  const auditPath = finalAnswerGateAuditPath();
  const requestId = typeof input.requestId === 'string' && input.requestId.trim() ? input.requestId.trim() : null;
  const traceRef = typeof input.traceRef === 'string' && input.traceRef.trim() ? input.traceRef.trim() : null;
  const record = {
    ts: new Date().toISOString(),
    event: 'telegram_command_reply',
    outcome: 'command_reply_delivered',
    privacy: 'metadata_only',
    command: input.command,
    reply_kind: input.replyKind,
    ...(requestId ? { request_id: requestId } : {}),
    ...(traceRef ? { trace_ref: traceRef } : {})
  };
  mkdir(path.dirname(auditPath), { recursive: true })
    .then(() => appendFile(auditPath, `${JSON.stringify(record)}\n`, 'utf-8'))
    .catch((error) => {
      console.warn('[FinalAnswerGate] failed to write command reply audit:', error);
    });
}

// Outbound sanitizer: wrap bot.telegram.sendMessage so every Telegram
// reply (ctx.reply, ctx.telegram.sendMessage, bot.telegram.sendMessage)
// runs through the deterministic voice rules before delivery. Persona
// forbids em dashes; production telemetry showed ~50% leak rate before
// this shim. Mirrors spark_character.output_sanitizer (Python).
const _origSendMessage = bot.telegram.sendMessage.bind(bot.telegram);
bot.telegram.sendMessage = (async (chatId: any, text: any, extra?: any) => {
  const traceContext = extractOutboundTraceContext(extra);
  const cleanExtra = stripOutboundTraceContext(extra);
  if (typeof text !== 'string') {
    const delivery = await _origSendMessage(chatId, text, cleanExtra);
    recordNodeOutboundDelivery(chatId, text, traceContext);
    return delivery;
  }

  const chunks = sanitizeAndSplitTelegramText(text);
  let lastDelivery: Awaited<ReturnType<typeof _origSendMessage>> | null = null;
  for (const chunk of chunks) {
    lastDelivery = await _origSendMessage(chatId, chunk, cleanExtra);
    recordNodeOutboundDelivery(chatId, chunk, traceContext);
  }
  return lastDelivery!;
}) as typeof bot.telegram.sendMessage;

bot.use(async (ctx, next) => {
  const originalReply = ctx.reply.bind(ctx);
  ctx.reply = (async (text: any, extra?: any) => {
    const traceContext = extractOutboundTraceContext(extra);
    const cleanExtra = stripOutboundTraceContext(extra);
    if (typeof text !== 'string') {
      const delivery = await originalReply(text, cleanExtra);
      recordNodeOutboundDelivery(ctx.chat?.id, text, traceContext);
      return delivery;
    }

    const chunks = sanitizeAndSplitTelegramText(text);
    let lastReply: Awaited<ReturnType<typeof originalReply>> | null = null;
    for (const chunk of chunks) {
      lastReply = await originalReply(chunk, cleanExtra);
      recordNodeOutboundDelivery(ctx.chat?.id, chunk, traceContext);
    }
    return lastReply!;
  }) as typeof ctx.reply;
  await next();
});

// Rate limiting (simple in-memory)
const userLastAction = new Map<number, number>();
const RATE_LIMIT_MS = 1000; // 1 second between messages

const lastNoEditProbeMissions = new Map<string, NoEditProbeMission>();

function noEditProbeKey(ctx: any): string {
  return `${ctx.chat?.id ?? 'unknown'}-${ctx.from?.id ?? 'unknown'}`;
}

// Pending clarification state — keyed by `${chatId}-${userId}`. In-memory
// only for v1; doesn't survive bot restart. /clarify reads + clears.
interface PendingClarification {
  requestId: string;
  prd: string;
  projectName: string;
  projectPath: string | null;
  buildMode: 'direct' | 'advanced_prd';
  buildModeReason: string;
  capabilityProposalPacket?: Record<string, unknown>;
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
  capabilityProposalPacket?: Record<string, unknown>;
  timestamp: number;
}
const pendingDomainChipBuilds = new Map<string, PendingDomainChipBuild>();
const CLARIFICATION_TTL_MS = 30 * 60 * 1000; // 30 minutes
const PUBLIC_ONBOARDING_COMMANDS = new Set(['/start', '/myid']);
const TELEGRAM_POLLING_READY_GRACE_MS = 3000;
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

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
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
  const user = ctx.from;
  if (user) {
    await conversation.remember(user, text).catch(() => {});
  }
  const builderReply = await runBuilderTelegramBridge(buildUpdateWithText(ctx.update as Record<string, unknown>, text));
  if (!builderReply.used || builderReply.bridgeMode === 'bridge_error') {
    return false;
  }
  if (isLowInformationLlmReply(builderReply.responseText)) {
    return false;
  }
  await deliverBuilderReply(ctx, builderReply);
  if (user && builderReply.responseText) {
    await conversation.rememberAssistantReply(user, builderReply.responseText).catch(() => {});
  }
  return true;
}

async function deliverBuilderReply(ctx: any, builderReply: Awaited<ReturnType<typeof runBuilderTelegramBridge>>): Promise<void> {
  if (builderReply.voiceMedia) {
    await sendBuilderVoiceMedia(ctx, builderReply.voiceMedia, builderReply.responseText);
    return;
  }
  if (builderReply.responseText) {
    await replyWithSanitizedTelegramText(ctx, builderReply.responseText);
  }
}

function isTelegramMessageTooLongError(error: unknown): boolean {
  const err = error as { message?: unknown; response?: { description?: unknown } };
  const text = `${typeof err?.message === 'string' ? err.message : ''} ${typeof err?.response?.description === 'string' ? err.response.description : ''}`;
  return /message is too long|message_too_long/i.test(text);
}

async function replyWithSanitizedTelegramText(ctx: any, text: string, extra?: any): Promise<void> {
  try {
    for (const chunk of sanitizeAndSplitTelegramText(text)) {
      await ctx.reply(chunk, extra);
    }
    return;
  } catch (error) {
    if (!isTelegramMessageTooLongError(error)) {
      throw error;
    }
  }

  for (const chunk of sanitizeAndSplitTelegramText(text, 900)) {
    await ctx.reply(chunk, extra);
  }
}

function voiceMediaCaption(
  voiceMedia: NonNullable<Awaited<ReturnType<typeof runBuilderTelegramBridge>>['voiceMedia']>,
  fallbackText = ''
): string | undefined {
  return formatVoiceMediaCaption({
    responseText: fallbackText,
    spokenText: voiceMedia.spokenText
  });
}

async function sendBuilderVoiceMedia(
  ctx: any,
  voiceMedia: NonNullable<Awaited<ReturnType<typeof runBuilderTelegramBridge>>['voiceMedia']>,
  fallbackText = ''
): Promise<void> {
  const audioBuffer = Buffer.from(voiceMedia.audioBase64, 'base64');
  const inputFile = {
    source: audioBuffer,
    filename: voiceMedia.filename,
  };
  const caption = voiceMediaCaption(voiceMedia, fallbackText);
  const options = caption ? { caption } : undefined;
  console.log(
    `[BridgeVoice] delivering media filename=${voiceMedia.filename} mime=${voiceMedia.mimeType} voiceCompatible=${voiceMedia.voiceCompatible} bytes=${audioBuffer.length} captionChars=${caption?.length || 0} spokenChars=${(voiceMedia.spokenText || '').length}`
  );
  if (voiceMedia.voiceCompatible) {
    await ctx.replyWithVoice(inputFile, options);
    return;
  }
  await ctx.replyWithAudio(inputFile, options);
}

function formatLocalMemoryDirectiveBufferNotice(directive: string): string {
  const normalized = directive.replace(/[.!?]+$/g, '').trim();
  return [
    `I kept this in the local Telegram conversation buffer: ${normalized}.`,
    '',
    'I could not confirm a durable Spark memory save from Builder yet, so I should not claim this is saved memory.'
  ].join('\n');
}

function renderSparkChipStatusBoundaryFallbackReply(): string {
  return [
    'Spark chip status',
    '',
    'I should not claim all chips work from registration alone.',
    '',
    'Boundary',
    '- Registered or attached means discoverable.',
    '- Working means a recent authorized route succeeded with trace evidence.',
    '',
    'Next probe',
    '- Run the target chip or self-awareness route, then record last_success_at and last_failure_reason.'
  ].join('\n');
}

async function handlePlainChatMemoryDirective(ctx: any, user: any, text: string, directive: string): Promise<void> {
  let localSaved = false;
  try {
    await conversation.remember(user, text);
    await conversation.learnAboutUser(user, `User asked Spark to remember: ${directive}`);
    localSaved = true;
  } catch (error) {
    console.warn('[MemoryDirective] local memory save failed:', error);
  }

  await safeSendChatAction(ctx, 'typing');
  try {
    const builderReply = await runBuilderTelegramBridge(ctx.update as unknown as Record<string, unknown>);
    console.log(`[Bridge] user=${ctx.from?.id} used=${builderReply.used} mode=${builderReply.bridgeMode} routing=${builderReply.routingDecision} textLen=${(builderReply.responseText || '').length}`);
    if (
      builderReply.used &&
      builderReply.bridgeMode !== 'bridge_error' &&
      shouldUseBuilderReplyForMemoryDirective(builderReply.responseText, builderReply.routingDecision)
    ) {
      await ctx.reply(builderReply.responseText);
      await conversation.rememberAssistantReply(user, builderReply.responseText).catch(() => {});
      return;
    }
  } catch (error) {
    console.warn('[MemoryDirective] Builder memory confirmation unavailable:', error);
  }

  const reply = localSaved
    ? formatLocalMemoryDirectiveBufferNotice(directive)
    : buildMemoryBridgeUnavailableReply('remember');
  await ctx.reply(reply);
  await conversation.rememberAssistantReply(user, reply).catch(() => {});
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
  const startText = 'text' in (ctx.message || {}) ? String((ctx.message as any).text || '') : '';
  const onboardingSession = extractStartSession(startText);

  const builderBridge = await getBuilderBridgeStatus();

  const spawnerAvailable = await spawner.isAvailable();

  const lines = [
    `👋 Hey ${name}, I'm Spark.`,
    builderBridge.available
      ? '🧠 Builder memory is connected.'
      : '⚠️ Builder memory is offline right now, so I will avoid claiming saved memory.',
    spawnerAvailable
      ? '✅ Mission relay is reachable.'
      : '⚠️ Mission relay is offline right now.',
    '',
    'Good first moves:',
    '• /status - health and access',
    '• /diagnose - deeper health check',
    '• /remember <text> - save an important detail',
    '• /recall <topic> - ask what I remember',
    '',
    'You can also just chat with me here.'
  ];

  if (conversation.isAdmin(user)) {
    lines.push(
      '',
      'Admin shortcuts:',
      '• /run <goal> - start a Spawner mission',
      '• /board - mission board',
      '• /access <1|2|3|4|5> - choose chat permissions',
      '• /access 5 - Approve Level 5 setup from Telegram',
      '• /model - model routing',
      '• /workspaces - local project folders',
      '',
      'Advanced:',
      '• /creator, /recursive, /context, /probe, /trace, /memory_movement, /wiki'
    );
  } else {
    lines.push('', 'Setup:', '• /myid - share your Telegram ID with the operator');
  }

  await ctx.reply(lines.join('\n'));
  if (onboardingSession) {
    await recordTelegramFirstMessage({
      event: 'telegram_first_message',
      session: onboardingSession,
      replied: true,
      ts: new Date().toISOString(),
      chat_id: String(ctx.chat?.id ?? ''),
      user_id: String(user.id ?? ''),
      profile: process.env.SPARK_TELEGRAM_PROFILE || 'default'
    }).catch((error) => {
      console.warn('[Onboarding] failed to write first-message event:', error);
    });
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

  let status = '✅ System status\n\n';

  status += `Builder memory: ${builderBridge.available ? '✅ online' : '⚠️ offline'} (${builderBridge.mode})\n`;

  if (isAdmin) {
    status += '\n';
    status += await renderAuthoritativeSparkLiveStatus();
    status += '\n\n';
    status += await renderAuthoritativeSparkAccessStatus(ctx.chat.id);
    recordTelegramSourceUsedEvidence(
      ctx,
      ctx.from,
      '/status',
      'telegram_status_command',
      runtimeTruthSourceEvidence('spark live status access providers memory')
    );
  } else {
    status += 'Spark launch core: ✅ online\n';
    status += 'Legacy dashboard commands: paused for launch v1\n';
  }

  await ctx.reply(status);
});

// /diagnose command â€” one-shot full-stack health + per-provider ping test
bot.command('diagnose', async (ctx) => {
  if (!requireAdmin(ctx)) return;
  await safeSendChatAction(ctx, 'typing');
  await ctx.reply('🔎 Running diagnostics...\n\nChecks chat, access, relay, Spawner, and provider ping. Takes ~30s.');
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

bot.command('self', async (ctx) => {
  await safeSendChatAction(ctx, 'typing');
  try {
    const text = 'text' in (ctx.message || {}) ? String((ctx.message as any).text || '') : '';
    const improveMatch = text.match(/^\/self(?:@\w+)?\s+(?:improve|upgrade|fix)\s*(.*)$/i);
    const result = improveMatch
      ? await runBuilderSelfImprovementPlan({
          userId: ctx.from.id,
          chatId: ctx.chat.id,
          currentMessage: text,
          goal: improveMatch[1]?.trim() || 'Improve Spark weak spots with probe-first evidence.',
        })
      : await runBuilderSelfAwarenessStatus({
      userId: ctx.from.id,
      chatId: ctx.chat.id,
      currentMessage: text,
    });
    await ctx.reply(result.replyText);
  } catch (err: any) {
    await ctx.reply(renderSparkErrorReply(err, 'builder', conversation.isAdmin(ctx.from)));
  }
});

bot.command('wiki', async (ctx) => {
  await safeSendChatAction(ctx, 'typing');
  try {
    const text = 'text' in (ctx.message || {}) ? String((ctx.message as any).text || '') : '';
    const promoteMatch = text.match(/^\/wiki(?:@\w+)?\s+promote(?:\s+(candidate|verified))?\s+(.+)$/i);
    const answerMatch = text.match(/^\/wiki(?:@\w+)?\s+answer\s+(.+)$/i);
    const queryMatch = text.match(/^\/wiki(?:@\w+)?\s+(?:search|query|find)\s+(.+)$/i);
    const wantsInventory = /\b(?:pages?|files?|notes?|inventory|index|contents?|vault|list|map)\b/i.test(text);
    const result = promoteMatch?.[2]?.trim()
      ? await runBuilderWikiPromoteImprovement({
          title: promoteMatch[2].trim(),
          summary: promoteMatch[2].trim(),
          status: promoteMatch[1]?.toLowerCase() === 'verified' ? 'verified' : 'candidate',
          evidenceRefs: [`telegram:${String(ctx.chat.id)}:${String((ctx.message as any)?.message_id || 'unknown')}`],
          sourceRefs: [`telegram:user:${String(ctx.from.id)}`],
          nextProbe: 'Run the relevant Spark probe, test, or trace check before treating this note as current truth.',
        })
      : answerMatch?.[1]?.trim()
      ? await runBuilderWikiAnswer({
          question: answerMatch[1].trim(),
          refresh: true,
          limit: 5,
          userId: ctx.from.id,
          chatId: ctx.chat.id,
          currentMessage: text,
        })
      : queryMatch?.[1]?.trim()
      ? await runBuilderWikiQuery({ query: queryMatch[1].trim(), refresh: true, limit: 5 })
      : wantsInventory
      ? await runBuilderWikiInventory({ refresh: true, limit: 12 })
      : await runBuilderWikiStatus({ refresh: true });
    await ctx.reply(result.replyText);
  } catch (err: any) {
    await ctx.reply(renderSparkErrorReply(err, 'builder', conversation.isAdmin(ctx.from)));
  }
});

const TELEGRAM_COMMAND_ALIASES: Record<string, string> = {
  operating_context: 'context',
  agent_context: 'context',
  blackbox: 'black_box',
  'black-box': 'black_box',
  route_probe: 'probe',
  natural_route: 'nl_route',
  trace_repair: 'trace',
  memory_flow: 'memory_movement',
  workspace: 'workspaces',
};

function telegramCommandName(ctx: any): string {
  const text = 'text' in (ctx.message || {}) ? String((ctx.message as any).text || '') : '';
  return text.match(/^\/([^\s@]+)/)?.[1]?.toLowerCase() || '';
}

function withCanonicalAliasNotice(ctx: any, replyText: string): string {
  const alias = telegramCommandName(ctx);
  const canonical = TELEGRAM_COMMAND_ALIASES[alias];
  if (!canonical) return replyText;
  return [`↪️ /${alias} maps to /${canonical}.`, '', replyText].join('\n');
}

async function replyWithBrowserTaskStartNotice(ctx: any, replyText: string): Promise<void> {
  if (!(await shouldSendBrowserTaskStartNotice(ctx))) {
    return;
  }
  await ctx.reply(withCanonicalAliasNotice(ctx, replyText));
}

async function handleAgentOperatingContextCommand(ctx: any): Promise<void> {
  await safeSendChatAction(ctx, 'typing');
  try {
    const text = 'text' in (ctx.message || {}) ? String((ctx.message as any).text || '') : '';
    const memoryQuery = text.replace(/^\/(?:context|operating_context|agent_context|aoc)(?:@\w+)?\s*/i, '').trim();
    const accessProfile = await getSparkAccessProfile(ctx.chat.id);
    const [runnerPreflight, liveState] = await Promise.all([
      probeTelegramRunnerWritability(),
      buildAocLiveState()
    ]);
    const [result, memoryInPlay] = await Promise.all([
      runBuilderAgentOperatingContext({
        userId: ctx.from.id,
        chatId: ctx.chat.id,
        currentMessage: text,
        sparkAccessLevel: sparkAccessLevel(accessProfile),
        runnerWritable: runnerPreflight.runnerWritable,
        runnerLabel: runnerPreflight.runnerLabel,
        liveState,
      }),
      memoryQuery
        ? runBuilderConversationColdContext({
            userId: ctx.from.id,
            currentMessage: memoryQuery,
          })
        : Promise.resolve({ used: false, contextText: '', sourceCount: 0, bridgeMode: 'not_requested' }),
    ]);
    const memorySummary = memoryQuery ? formatMemoryInPlaySummary(memoryInPlay) : '';
    await ctx.reply(withCanonicalAliasNotice(ctx, [result.replyText, memorySummary].filter(Boolean).join('\n\n')));
  } catch (err: any) {
    await ctx.reply(withCanonicalAliasNotice(ctx, renderSparkErrorReply(err, 'builder', conversation.isAdmin(ctx.from))));
  }
}

async function handleAgentBlackBoxCommand(ctx: any): Promise<void> {
  if (!requireAdmin(ctx)) return;
  await safeSendChatAction(ctx, 'typing');
  try {
    const text = 'text' in (ctx.message || {}) ? String((ctx.message as any).text || '') : '';
    const arg = text.replace(/^\/(?:black_box|blackbox|black-box)(?:@\w+)?\s*/i, '').trim();
    if (/^(?:help|usage)$/i.test(arg)) {
      await ctx.reply(withCanonicalAliasNotice(ctx, [
        '🧾 Agent black box',
        '',
        'Use',
        '• /black_box [request_id]',
        '',
        'What it shows',
        '• Compact event evidence only.',
        '• It does not promote memory or grant authority.'
      ].join('\n')));
      return;
    }
    const requestId = arg.split(/\s+/)[0] || '';
    const result = await runBuilderAgentBlackBox({
      userId: ctx.from.id,
      chatId: ctx.chat.id,
      currentMessage: text,
      requestId,
      limit: 12,
    });
    await ctx.reply(withCanonicalAliasNotice(ctx, result.replyText));
  } catch (err: any) {
    await ctx.reply(withCanonicalAliasNotice(ctx, renderSparkErrorReply(err, 'builder', conversation.isAdmin(ctx.from))));
  }
}

bot.command('context', handleAgentOperatingContextCommand);
bot.command('operating_context', handleAgentOperatingContextCommand);
bot.command('agent_context', handleAgentOperatingContextCommand);
bot.command('aoc', handleAgentOperatingContextCommand);
bot.command('black_box', handleAgentBlackBoxCommand);
bot.command('blackbox', handleAgentBlackBoxCommand);
bot.hears(/^\/black-box(?:@\w+)?(?:\s|$)/i, handleAgentBlackBoxCommand);

const AOC_ROUTE_ALIASES: Record<string, string> = {
  builder: 'spark_intelligence_builder',
  sib: 'spark_intelligence_builder',
  spark_builder: 'spark_intelligence_builder',
  spark_intelligence_builder: 'spark_intelligence_builder',
  spawner: 'spark_spawner',
  spark_spawner: 'spark_spawner',
  memory: 'spark_memory',
  spark_memory: 'spark_memory',
  researcher: 'spark_researcher',
  spark_researcher: 'spark_researcher',
  swarm: 'spark_swarm',
  spark_swarm: 'spark_swarm',
  browser: 'spark_browser',
  spark_browser: 'spark_browser',
  local: 'spark_local_work',
  local_work: 'spark_local_work',
  spark_local_work: 'spark_local_work',
};

const AOC_CORE_ROUTE_KEYS = [
  'spark_memory',
  'spark_researcher',
  'spark_swarm',
  'spark_spawner',
  'spark_intelligence_builder',
];

const AOC_ALL_ROUTE_KEYS = [
  ...AOC_CORE_ROUTE_KEYS,
  'spark_browser',
  'spark_local_work',
];

const AOC_ROUTE_LABELS: Record<string, string> = {
  spark_intelligence_builder: 'Builder',
  spark_spawner: 'Spawner',
  spark_memory: 'Memory',
  spark_researcher: 'Researcher',
  spark_swarm: 'Swarm',
  spark_browser: 'Browser Use',
  spark_local_work: 'Local Work',
};

function normalizeAocProbeRoute(raw: string): string {
  const key = raw.trim().toLowerCase().replace(/-/g, '_');
  return AOC_ROUTE_ALIASES[key] || '';
}

function renderAocProbeHelp(): string {
  return [
    '🧪 Route probe',
    '',
    'Use',
    '• /probe <route>',
    '• /probe core',
    '• /probe all',
    '',
    'Routes',
    '• builder',
    '• spawner',
    '• memory',
    '• researcher',
    '• swarm',
    '• browser',
    '• local_work',
  ].join('\n');
}

function aocProbeSummaryLine(routeKey: string, payload: Record<string, unknown>): string {
  const label = AOC_ROUTE_LABELS[routeKey] || routeKey;
  const status = String(payload.status || 'unknown').trim() || 'unknown';
  const latency = typeof payload.route_latency_ms === 'number' ? `, ${payload.route_latency_ms}ms` : '';
  const failure = String(payload.failure_reason || '').trim();
  const summary = humanizeAocProbeSummary(routeKey, String(payload.probe_summary || failure || '').trim());
  const evidence = summary ? ` - ${summary.slice(0, 110)}` : '';
  return `• ${label}: ${status}${latency}${evidence}`;
}

function humanizeAocProbeSummary(routeKey: string, summary: string): string {
  if (routeKey !== 'spark_browser') {
    return summary;
  }
  const match = summary.match(/(?:^|\s)proofs=([a-z0-9_,.-]+)/i);
  if (!match) {
    return summary;
  }
  const labels: Record<string, string> = {
    doctor: 'doctor',
    public_page_open: 'public page',
    screenshot_capture: 'screenshot',
    state_read: 'state',
  };
  const proofs = match[1]
    .split(',')
    .map((item) => labels[item.trim()] || '')
    .filter(Boolean);
  return proofs.length ? `proved ${proofs.join(', ')}` : summary;
}

function aocProbeFailureSummary(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  if (/Builder bridge unavailable/i.test(message)) return 'Builder bridge unavailable';
  if (/timed out|timeout/i.test(message)) return 'Probe timed out';
  return 'Probe failed before evidence was available';
}

async function runAocProbeBatch(ctx: any, routeKeys: string[]): Promise<void> {
  await ctx.reply(`🧪 Running ${routeKeys.length} route probes. This can take a little while...`);
  const lines = ['Route probes'];
  for (const routeKey of routeKeys) {
    await safeSendChatAction(ctx, 'typing');
    try {
      const result = await runBuilderRouteProbe(routeKey);
      lines.push(aocProbeSummaryLine(routeKey, result.payload));
    } catch (error) {
      lines.push(`• ${AOC_ROUTE_LABELS[routeKey] || routeKey}: failed - ${aocProbeFailureSummary(error)}`);
    }
  }
  lines.push('', 'Run /aoc to see the refreshed Agent Operating Context.');
  await ctx.reply(lines.join('\n'));
}

async function handleAgentRouteProbeCommand(ctx: any): Promise<void> {
  if (!requireAdmin(ctx)) return;
  await safeSendChatAction(ctx, 'typing');
  try {
    const text = 'text' in (ctx.message || {}) ? String((ctx.message as any).text || '') : '';
    const routeArg = text.replace(/^\/(?:probe|route_probe)(?:@\w+)?\s*/i, '').trim();
    if (!routeArg || /^(?:help|routes?|list)$/i.test(routeArg)) {
      await ctx.reply(withCanonicalAliasNotice(ctx, renderAocProbeHelp()));
      return;
    }
    const firstArg = routeArg.split(/\s+/)[0]?.trim().toLowerCase().replace(/-/g, '_') || '';
    if (firstArg === 'core') {
      await runAocProbeBatch(ctx, AOC_CORE_ROUTE_KEYS);
      return;
    }
    if (firstArg === 'all') {
      await runAocProbeBatch(ctx, AOC_ALL_ROUTE_KEYS);
      return;
    }
    const routeKey = normalizeAocProbeRoute(firstArg);
    if (!routeKey) {
      await ctx.reply(withCanonicalAliasNotice(ctx, renderAocProbeHelp()));
      return;
    }
    const result = await runBuilderRouteProbe(routeKey);
    await ctx.reply(withCanonicalAliasNotice(ctx, result.replyText));
  } catch (err: any) {
    await ctx.reply(withCanonicalAliasNotice(ctx, renderSparkErrorReply(err, 'builder', conversation.isAdmin(ctx.from))));
  }
}

function renderBrowserUseHelp(): string {
  return [
    'Browser-use',
    '',
    'Use',
    '\u2022 /browser open [--profile <name>] <url>',
    '\u2022 /browser screenshot [--profile <name>] <url>',
    '\u2022 /browser state',
    '\u2022 /browser click <index>',
    '\u2022 /browser type <text>',
    '\u2022 /browser input <index> <text>',
    '\u2022 /browser scroll [up|down] [--amount <px>]',
    '\u2022 /browser back',
    '\u2022 /browser task [--profile <name>] [url] <goal>',
    '\u2022 /browser qa [--cdp-url <url>] <url> <scenario>',
    '\u2022 /browser task full [--profile <name>] [--user-data-dir <path>] [--cdp-url <url>] [url] <goal>',
    '',
    'Use direct actions for hands-on browsing. Use task or qa when Spark should operate the page for you.'
  ].join('\n');
}

async function handleBrowserUseCommand(ctx: any): Promise<void> {
  if (!requireAdmin(ctx)) return;
  await safeSendChatAction(ctx, 'typing');
  try {
    const text = 'text' in (ctx.message || {}) ? String((ctx.message as any).text || '') : '';
    const raw = text.replace(/^\/browser(?:@\w+)?\s*/i, '').trim();
    if (!raw || /^(?:help|usage)$/i.test(raw)) {
      await ctx.reply(withCanonicalAliasNotice(ctx, renderBrowserUseHelp()));
      return;
    }
    const parsed = parseBrowserUseCommandArgs(raw);
    const [first = '', ...rest] = parsed.args;
    const primitiveActions = new Set(['state', 'click', 'type', 'input', 'scroll', 'back', 'eval', 'close']);
    const firstAction = first.toLowerCase();
    const action = firstAction === 'screenshot'
      ? 'screenshot'
      : firstAction === 'open'
        ? 'open'
        : firstAction === 'task'
          ? 'task'
          : firstAction === 'qa'
            ? 'qa'
            : primitiveActions.has(firstAction)
              ? firstAction
              : '';
    if (!action) {
      await ctx.reply(withCanonicalAliasNotice(ctx, renderBrowserUseHelp()));
      return;
    }
    if (primitiveActions.has(action)) {
      const payload = await runBrowserUsePrimitive(action, rest, parsed.profile);
      await ctx.reply(withCanonicalAliasNotice(ctx, renderBrowserUsePrimitiveAnswer(action, payload, parsed.profile)));
      return;
    }
    if (action === 'qa') {
      const taskText = rest.join(' ').trim();
      const urlMatch = taskText.match(/https?:\/\/[^\s)>\]]+/i);
      const url = urlMatch?.[0]?.replace(/[.,;!?]+$/, '') || '';
      const scenario = url && taskText.startsWith(url)
        ? taskText.slice(url.length).trim()
        : taskText.replace(url, '').trim();
      const intent: BrowserCapabilityIntent = {
        kind: 'task',
        ...(url ? { url } : {}),
        goal: browserUseQaGoal(scenario),
        profile: parsed.profile,
      };
      await replyWithBrowserTaskStartNotice(ctx, [
        'Browser-use QA started.',
        '',
        'I will send the result here when the browser run finishes.'
      ].join('\n'));
      const payload = await runBrowserUseTask(intent);
      if (shouldFallbackToBrowserUseReview(payload, intent)) {
        const reviewPayload = await runBrowserUseReview(intent);
        if (reviewPayload.ok === true) {
          await ctx.reply(withCanonicalAliasNotice(ctx, renderBrowserUseReviewAnswer(intent, reviewPayload)));
          await replyWithBrowserUseTaskScreenshot(ctx, reviewPayload);
          return;
        }
      }
      await ctx.reply(withCanonicalAliasNotice(ctx, renderBrowserUseTaskAnswer(intent, payload)));
      await replyWithBrowserUseTaskScreenshot(ctx, payload);
      return;
    }
    if (action === 'task') {
      const explicitFullTask = /^(?:full|agent|loop)$/i.test(rest[0] || '');
      const taskText = (explicitFullTask ? rest.slice(1) : rest).join(' ').trim();
      const fullTask = explicitFullTask || shouldRunFullBrowserUseTask(taskText);
      const urlMatch = taskText.match(/https?:\/\/[^\s)>\]]+/i);
      const url = urlMatch?.[0]?.replace(/[.,;!?]+$/, '') || '';
      const goal = url && taskText.startsWith(url)
        ? taskText.slice(url.length).trim() || `Inspect ${url} and summarize what matters.`
        : taskText;
      const intent: BrowserCapabilityIntent = {
        kind: 'task',
        ...(url ? { url } : {}),
        goal,
        profile: parsed.profile,
      };
      if (!fullTask) {
        const payload = await runBrowserUseReview(intent);
        await ctx.reply(withCanonicalAliasNotice(ctx, renderBrowserUseReviewAnswer(intent, payload)));
        const screenshotPath = String(payload.screenshot_path || '').trim();
        if (payload.ok === true && screenshotPath) {
          await ctx.replyWithPhoto({ source: screenshotPath }).catch(() => {});
        }
        return;
      }
      await replyWithBrowserTaskStartNotice(ctx, [
        'Browser-use full task started.',
        '',
        'I captured the request and will send the result here when the browser agent loop finishes.'
      ].join('\n'));
      const payload = await runBrowserUseTask(intent);
      if (shouldFallbackToBrowserUseReview(payload, intent)) {
        const reviewPayload = await runBrowserUseReview(intent);
        if (reviewPayload.ok === true) {
          await ctx.reply(withCanonicalAliasNotice(ctx, renderBrowserUseReviewAnswer(intent, reviewPayload)));
          await replyWithBrowserUseTaskScreenshot(ctx, reviewPayload);
          return;
        }
      }
      await ctx.reply(withCanonicalAliasNotice(ctx, renderBrowserUseTaskAnswer(intent, payload)));
      await replyWithBrowserUseTaskScreenshot(ctx, payload);
      return;
    }
    const url = rest.join(' ').trim();
    const intent: BrowserCapabilityIntent = {
      kind: action === 'screenshot' ? 'specific_screenshot' : 'specific_open',
      ...(url ? { url } : {}),
      profile: parsed.profile,
    };
    const payload = await runBrowserUseAction(intent);
    const reply = renderBrowserUseActionAnswer(intent, payload);
    await ctx.reply(withCanonicalAliasNotice(ctx, reply));
    if (action === 'screenshot' && payload.ok === true) {
      const screenshotPath = String(payload.screenshot_path || '').trim();
      if (screenshotPath) {
        await ctx.replyWithPhoto({ source: screenshotPath }).catch(() => {});
      }
    }
  } catch (error) {
    await ctx.reply(withCanonicalAliasNotice(ctx, [
      'Browser-use could not start that request.',
      '',
      'Why',
      `\u2022 ${browserUseFailureReason(error)}`
    ].join('\n')));
  }
}

async function handleNaturalRouteProbeCommand(ctx: any): Promise<void> {
  if (!requireAdmin(ctx)) return;
  await safeSendChatAction(ctx, 'typing');
  try {
    const text = 'text' in (ctx.message || {}) ? String((ctx.message as any).text || '') : '';
    const probeText = text.replace(/^\/(?:nl_route|natural_route)(?:@\w+)?\s*/i, '').trim();
    if (!probeText || /^(?:help|usage)$/i.test(probeText)) {
      await ctx.reply(withCanonicalAliasNotice(ctx, [
        '🧭 Natural route probe',
        '',
        'Use',
        '• /nl_route <message>',
        '',
        'What it does',
        '• Shows the diagnostic route decision only.',
        '• Does not execute the route.'
      ].join('\n')));
      return;
    }
    const decision = decideNaturalRoute(probeText, {
      recentMessages: await conversation.getRecentMessages(ctx.from, 15).catch(() => []),
      pendingBuildClarification: Boolean(
        ctx.chat?.id &&
        ctx.from?.id &&
        pendingClarificationForMessage(`${ctx.chat.id}-${ctx.from.id}`, probeText)
      )
    });
    await ctx.reply(withCanonicalAliasNotice(ctx, renderNaturalRouteDecisionReply(decision)));
  } catch (err: any) {
    await ctx.reply(withCanonicalAliasNotice(ctx, renderSparkErrorReply(err, 'chat', conversation.isAdmin(ctx.from))));
  }
}

async function handleCapabilityLedgerReviewCommand(ctx: any): Promise<void> {
  if (!requireAdmin(ctx)) return;
  await safeSendChatAction(ctx, 'typing');
  try {
    const builderReply = await runBuilderTelegramBridge(ctx.update as unknown as Record<string, unknown>);
    if (builderReply.used && builderReply.bridgeMode !== 'bridge_error' && builderReply.responseText.trim()) {
      await ctx.reply(builderReply.responseText);
      return;
    }
    await ctx.reply('Capability ledger review is unavailable right now. Run /diagnose to check the Builder bridge.');
  } catch (err: any) {
    await ctx.reply(renderSparkErrorReply(err, 'builder', conversation.isAdmin(ctx.from)));
  }
}

async function handleCapabilityGardenCommand(ctx: any): Promise<void> {
  if (!requireAdmin(ctx)) return;
  await safeSendChatAction(ctx, 'typing');
  try {
    const summary = await readCapabilityGardenSummary();
    await ctx.reply(renderCapabilityGardenSummary(summary));
  } catch (err: any) {
    await ctx.reply(renderSparkErrorReply(err, 'builder', conversation.isAdmin(ctx.from)));
  }
}

async function handleAuthorityStatusCommand(ctx: any): Promise<void> {
  if (!requireAdmin(ctx)) return;
  await safeSendChatAction(ctx, 'typing');
  try {
    const summary = await readAuthorityStatusSummary();
    await ctx.reply(renderAuthorityStatusSummary(summary));
  } catch (err: any) {
    await ctx.reply(renderSparkErrorReply(err, 'builder', conversation.isAdmin(ctx.from)));
  }
}

async function handleTraceRepairCommand(ctx: any): Promise<void> {
  if (!requireAdmin(ctx)) return;
  await safeSendChatAction(ctx, 'typing');
  try {
    const summary = await readTraceRepairSummary();
    await ctx.reply(withCanonicalAliasNotice(ctx, renderTraceRepairSummary(summary)));
  } catch (err: any) {
    await ctx.reply(withCanonicalAliasNotice(ctx, renderSparkErrorReply(err, 'builder', conversation.isAdmin(ctx.from))));
  }
}

async function handleMemoryMovementCommand(ctx: any): Promise<void> {
  if (!requireAdmin(ctx)) return;
  await safeSendChatAction(ctx, 'typing');
  try {
    const summary = await readMemoryMovementSummary();
    await ctx.reply(withCanonicalAliasNotice(ctx, renderMemoryMovementSummary(summary)));
  } catch (err: any) {
    await ctx.reply(withCanonicalAliasNotice(ctx, renderSparkErrorReply(err, 'builder', conversation.isAdmin(ctx.from))));
  }
}

bot.command('probe', handleAgentRouteProbeCommand);
bot.command('route_probe', handleAgentRouteProbeCommand);
bot.command('browser', handleBrowserUseCommand);
bot.command('nl_route', handleNaturalRouteProbeCommand);
bot.command('natural_route', handleNaturalRouteProbeCommand);
bot.command('ledger', handleCapabilityLedgerReviewCommand);
bot.command('capabilities', handleCapabilityGardenCommand);
bot.command('authority', handleAuthorityStatusCommand);
bot.command('trace_repair', handleTraceRepairCommand);
bot.command('trace', handleTraceRepairCommand);
bot.command('memory_movement', handleMemoryMovementCommand);
bot.command('memory_flow', handleMemoryMovementCommand);

bot.command('conversation_context', async (ctx) => {
  if (!requireAdmin(ctx)) return;
  const report = await conversation.getConversationFrameDiagnostics(ctx.from);
  await ctx.reply(report);
});

async function handleLocalWorkspaceInventory(ctx: any): Promise<void> {
  if (!requireAdmin(ctx)) return;
  const accessProfile = await getSparkAccessProfile(ctx.chat.id);
  if (!sparkAccessAllows(accessProfile, 'operating_system')) {
    await ctx.reply(withCanonicalAliasNotice(ctx, renderSparkAccessDenial(accessProfile, 'operating_system')));
    return;
  }
  await safeSendChatAction(ctx, 'typing');
  try {
    const summary = await summarizeLocalWorkspaces();
    const reply = renderLocalWorkspaceInspectionReply(summary);
    await ctx.reply(withCanonicalAliasNotice(ctx, reply));
    await conversation.rememberAssistantReply(ctx.from, reply).catch(() => {});
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    await ctx.reply(withCanonicalAliasNotice(ctx, `Local workspace inspection failed: ${detail}`));
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
  if (isNoExecutionBoundary(answersRaw)) {
    pendingClarifications.delete(key);
    await ctx.reply('Got it, no build started. We can keep talking here.');
    return;
  }
  const runWithDefaults = /^(?:go|run|start|ship|yes|yep|yeah|do it|let'?s go|default|defaults|skip)$/i.test(answersRaw);
  pendingClarifications.delete(key);

  let enrichedPrd = pending.prd;
  if (!runWithDefaults && answersRaw) {
    enrichedPrd = `${pending.prd}\n\n## User clarifications\n\n${pending.questions
      .map((q, i) => `Q${i + 1}: ${q}`)
      .join('\n')}\n\nAnswers: ${answersRaw}`;
  }

  const spawnerUrl = resolveSpawnerUiUrl();
  const newRequestId = `${pending.requestId}-clarified-${Date.now()}`;
  const missionId = missionIdFromTelegramBuildRequest(newRequestId);
  const traceRef = spawnerPrdTraceRef(missionId);
  const tier = getTierForUser(ctx.from.id);
  const runnerPreflight = pending.projectPath ? await probeTelegramRunnerWritability() : null;
  if (runnerPreflight?.runnerWritable === 'no') {
    await ctx.reply([
      'The clarified build is allowed, but the current Telegram runner is read-only.',
      '',
      'I did not enqueue it because this route cannot prove local workspace access.',
      '',
      'Next: send `/access_setup`, restart Spark if prompted, then try again from this chat.'
    ].join('\n'));
    return;
  }
  const prdContent = pending.projectPath
    ? `# ${pending.projectName}\n\nBuild mode: ${pending.buildMode}\nBuild mode reason: ${pending.buildModeReason}\nTarget workspace/project path: \`${pending.projectPath}\`\n\n${enrichedPrd}`
    : `# ${pending.projectName}\n\nBuild mode: ${pending.buildMode}\nBuild mode reason: ${pending.buildModeReason}\n\n${enrichedPrd}`;

  try {
    const res = await axios.post(
      `${spawnerUrl}/api/prd-bridge/write`,
      {
        content: prdContent,
        requestId: newRequestId,
        traceRef,
        projectName: pending.projectName,
        buildMode: pending.buildMode,
        buildModeReason: pending.buildModeReason,
        chatId: String(ctx.chat.id),
        userId: String(ctx.from.id),
        runnerCapability: runnerPreflight
          ? {
              runnerWritable: runnerPreflight.runnerWritable,
              runnerLabel: runnerPreflight.runnerLabel,
              checkedAt: runnerPreflight.checkedAt
            }
          : { runnerWritable: 'unknown' },
        telegramRelay: getTelegramRelayIdentity(),
        tier,
        forceDispatch: true,
        ...(pending.capabilityProposalPacket ? { capabilityProposalPacket: pending.capabilityProposalPacket } : {}),
        missionId,
        options: { includeSkills: true, includeMCPs: false }
      },
      { timeout: 10000 }
    );

    if (!res.data?.success) {
      await ctx.reply(renderSparkErrorReply(new Error(res.data?.error || 'Clarification re-dispatch failed'), 'spawner', conversation.isAdmin(ctx.from)));
      return;
    }

    await registerMissionRelay({
      missionId,
      chatId: String(ctx.chat.id),
      userId: String(ctx.from.id),
      requestId: newRequestId,
      goal: pending.projectName || pending.prd,
      createdAt: new Date().toISOString(),
      updateId: typeof ctx.update.update_id === 'number' ? ctx.update.update_id : undefined
    });

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
    const backendFallbackGraceMs = Math.min(60_000, Math.max(15_000, Math.round(readyTimeoutMs * 0.25)));
    const deadline = started + readyTimeoutMs + backendFallbackGraceMs;
    const resultUrl = `${args.spawnerUrl}/api/prd-bridge/result?requestId=${encodeURIComponent(args.requestId)}`;
    const verbosity = await getTelegramRelayVerbosity(args.chatId).catch(() => 'normal' as const);
    const heartbeatThresholds = verbosity === 'verbose' ? [120_000] : [];
    let heartbeatIndex = 0;
    while (Date.now() < deadline) {
      await new Promise((r) => setTimeout(r, 4000));
      if (shouldSuppressMissionHandoff(args.missionId)) {
        return;
      }
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

        const poll = await axios.get(resultUrl, spawnerAxiosOptions(3000));
        if (poll.data?.found && poll.data?.result?.success) {
          try {
            if (shouldSuppressMissionHandoff(args.missionId)) {
              return;
            }
            const queue = await axios.post(
              `${args.spawnerUrl}/api/prd-bridge/load-to-canvas`,
              { requestId: args.requestId, missionId: args.missionId, autoRun: true, telegramRelay: getTelegramRelayIdentity() },
              spawnerAxiosOptions(8000)
            );
            if (shouldSuppressMissionHandoff(args.missionId)) {
              return;
            }
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
    if (shouldSuppressMissionHandoff(args.missionId)) {
      return;
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
    return ctx.reply([
      '🧠 Save a memory',
      '',
      'Use: /remember <something important>',
      'Example: /remember I prefer concise mission updates.'
    ].join('\n'));
  }

  try {
    const missionLessonReply = await approvePendingMissionLesson(ctx.from.id, text);
    if (missionLessonReply) {
      await ctx.reply(missionLessonReply);
      return;
    }
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
    return ctx.reply([
      '🔎 Recall memory',
      '',
      'Use: /recall <topic>',
      'Example: /recall mission update preferences'
    ].join('\n'));
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
    [
      '🧹 Forget memory',
      '',
      'Use: /forget <thing to forget>',
      'Example: /forget my old project nickname',
      '',
      'If Builder memory is offline, try again after /diagnose shows memory is healthy.'
    ].join('\n')
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

// /voice - Builder-owned voice status/onboarding. Do not fall back to the
// deferred dashboard placeholder; voice is a Builder/chip capability now.
bot.command('voice', async (ctx) => {
  await safeSendChatAction(ctx, 'typing');
  console.log(`[Voice] /voice command received user=${ctx.from?.id || 'unknown'} chat_type=${ctx.chat?.type || 'unknown'}`);
  try {
    const routed = await replyViaBuilder(ctx, ctx.message?.text || '/voice');
    if (routed) {
      console.log('[Voice] Builder voice route replied');
      return;
    }
    console.log('[Voice] Builder voice route unavailable');
  } catch (err) {
    console.warn('[Bridge] /voice Builder route failed:', err);
  }
  await ctx.reply(renderVoiceUnavailableReply());
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
  const result = await spark.processQueue();
  await ctx.reply(result);
});

// /reflect - trigger deep reflection
bot.command('reflect', async (ctx) => {
  await safeSendChatAction(ctx, 'typing');
  const result = await spark.reflect();
  await ctx.reply(result);
});

function renderVoiceUnavailableReply(): string {
  return [
    '🎙️ Voice setup is not ready yet.',
    '',
    'What happened',
    '• Telegram is running, but Builder did not return voice status.',
    '',
    'Next move',
    '• Run /diagnose, then try /voice again.'
  ].join('\n');
}

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

export interface NaturalRecursiveProposalIntent {
  target: string;
  submit: boolean;
}

export function parseNaturalRecursiveProposalIntent(text: string): NaturalRecursiveProposalIntent | null {
  const normalized = text
    .toLowerCase()
    .replace(/[^\w\s-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (!normalized) return null;
  const wantsReviewPacket = /\b(prepare|propose|package|submit|share|send)\b/.test(normalized) &&
    /\b(review|network|swarm|spark swarm|workspace)\b/.test(normalized);
  if (!wantsReviewPacket) return null;
  const submit = /\b(submit|share|send)\b/.test(normalized) && /\b(network|swarm|spark swarm|review)\b/.test(normalized);
  if (/\bcrypto[-\s]+trading\b/.test(normalized)) return { target: 'crypto-trading', submit };
  if (/\bstartup[-\s]+yc\b/.test(normalized)) return { target: 'startup-yc', submit };
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

function opaqueTelegramRequestId(prefix: 'tg-run' | 'tg-build'): string {
  return `${prefix}-${randomUUID().replace(/-/g, '').slice(0, 12)}-${Date.now()}`;
}

function spawnerPrdTraceRef(missionId: string): string {
  return `trace:spawner-prd:${missionId}`;
}

function telegramRunTraceRef(requestId: string): string {
  return `trace:telegram-run:${requestId}`;
}

function projectCanvasUrl(baseUrl: string, requestId: string, missionId: string): string {
  const root = baseUrl.replace(/\/+$/, '');
  return `${root}/canvas?pipeline=${encodeURIComponent(`prd-${requestId}`)}&mission=${encodeURIComponent(missionId)}`;
}

function missionBoardUrl(baseUrl: string): string {
  return `${baseUrl.replace(/\/+$/, '')}/kanban`;
}

type ParsedCreatorCommand = {
  brief: string;
  privacyMode?: 'local_only' | 'github_pr' | 'swarm_shared';
  riskLevel?: 'low' | 'medium' | 'high';
};

type NaturalCreatorMissionIntent = ParsedCreatorCommand & {
  artifactLabel: string;
};

type PendingCreatorMission = {
  missionId: string;
  timestamp: number;
};

const pendingCreatorMissions = new Map<string, PendingCreatorMission>();

function renderCreatorUsage(reason = ''): string {
  return [
    reason ? `⚠️ ${reason}` : '🎯 Creator missions',
    '',
    'Use',
    '• /creator plan [private|github|swarm] [risk low|medium|high] <brief>',
    '• /creator run <mission-creator-id>',
    '• /creator status <mission-creator-id>',
    '• /creator validate <mission-creator-id> [maxCommands]',
    '',
    'Example',
    '• /creator plan private risk medium create a Startup YC benchmarked specialization path'
  ].join('\n');
}

const CREATOR_USAGE = renderCreatorUsage();

function isLowInformationCreatorBrief(brief: string): boolean {
  const normalized = brief.trim().toLowerCase();
  const words = normalized.split(/\s+/).filter(Boolean);
  return words.length < 3 || /^(?:public|private|github|swarm|risk|low|medium|high)$/.test(normalized);
}

function normalizeCreatorPrivacyMode(value: string): ParsedCreatorCommand['privacyMode'] | null {
  const normalized = value.toLowerCase();
  if (['private', 'local', 'local_only', 'local-only'].includes(normalized)) return 'local_only';
  if (['github', 'github_pr', 'github-pr', 'pr'].includes(normalized)) return 'github_pr';
  if (['swarm', 'shared', 'swarm_shared', 'swarm-shared'].includes(normalized)) return 'swarm_shared';
  return null;
}

function normalizeCreatorRiskLevel(value: string): ParsedCreatorCommand['riskLevel'] | null {
  const normalized = value.toLowerCase();
  if (['low', 'medium', 'high'].includes(normalized)) {
    return normalized as ParsedCreatorCommand['riskLevel'];
  }
  return null;
}

export function parseCreatorPlanCommand(raw: string): ParsedCreatorCommand | null {
  const parts = raw.trim().split(/\s+/).filter(Boolean);
  const action = parts.shift()?.toLowerCase();
  if (action !== 'plan') return null;

  let privacyMode: ParsedCreatorCommand['privacyMode'];
  let riskLevel: ParsedCreatorCommand['riskLevel'];

  while (parts.length > 0) {
    const token = parts[0];
    const lower = token.toLowerCase();

    if (lower === '--') {
      parts.shift();
      break;
    }

    const privacyEquals = lower.match(/^--privacy(?:-mode)?=(.+)$/);
    if (privacyEquals) {
      const parsed = normalizeCreatorPrivacyMode(privacyEquals[1]);
      if (!parsed) return null;
      privacyMode = parsed;
      parts.shift();
      continue;
    }

    if (lower === '--privacy' || lower === '--privacy-mode' || lower === 'privacy') {
      const parsed = parts[1] ? normalizeCreatorPrivacyMode(parts[1]) : null;
      if (!parsed) return null;
      privacyMode = parsed;
      parts.splice(0, 2);
      continue;
    }

    const riskEquals = lower.match(/^--risk(?:-level)?=(.+)$/);
    if (riskEquals) {
      const parsed = normalizeCreatorRiskLevel(riskEquals[1]);
      if (!parsed) return null;
      riskLevel = parsed;
      parts.shift();
      continue;
    }

    if (lower === '--risk' || lower === '--risk-level' || lower === 'risk') {
      const parsed = parts[1] ? normalizeCreatorRiskLevel(parts[1]) : null;
      if (!parsed) return null;
      riskLevel = parsed;
      parts.splice(0, 2);
      continue;
    }

    const privacyAlias = normalizeCreatorPrivacyMode(token);
    if (privacyAlias) {
      privacyMode = privacyAlias;
      parts.shift();
      continue;
    }

    const riskAlias = normalizeCreatorRiskLevel(token);
    if (riskAlias) {
      riskLevel = riskAlias;
      parts.shift();
      continue;
    }

    break;
  }

  const brief = parts.join(' ').trim();
  return brief ? { brief, privacyMode, riskLevel } : null;
}

type ParsedCreatorMissionControlCommand = {
  action: 'run' | 'status' | 'validate';
  missionId: string;
  maxCommands?: number;
};

function parseCreatorMissionControlCommand(raw: string): ParsedCreatorMissionControlCommand | null {
  const parts = raw.trim().split(/\s+/).filter(Boolean);
  const actionToken = parts.shift()?.toLowerCase();
  const missionId = parts.shift();
  if (!actionToken || !missionId) return null;

  const action = ['run', 'execute', 'start'].includes(actionToken)
    ? 'run'
    : ['status', 'show', 'inspect'].includes(actionToken)
      ? 'status'
      : ['validate', 'check', 'verify'].includes(actionToken)
        ? 'validate'
        : null;
  if (!action) return null;

  let maxCommands: number | undefined;
  if (parts.length > 0) {
    if (action !== 'validate') return null;
    const maxToken = parts.length === 1
      ? parts[0]
      : parts.length === 2 && ['max', '--max', '--max-commands'].includes(parts[0].toLowerCase())
        ? parts[1]
        : '';
    const parsedMax = Number.parseInt(maxToken, 10);
    if (!Number.isInteger(parsedMax) || parsedMax < 1) return null;
    maxCommands = parsedMax;
  }

  return { action, missionId, maxCommands };
}

function isValidCreatorMissionId(missionId: string): boolean {
  return /^mission-creator-[A-Za-z0-9_-]+$/.test(missionId);
}

function pendingCreatorMissionKey(ctx: any): string {
  return `${ctx.chat.id}-${ctx.from.id}`;
}

function parsePendingCreatorMissionAction(text: string): ParsedCreatorMissionControlCommand['action'] | null {
  const normalized = text.trim().toLowerCase().replace(/\s+/g, ' ');
  if (!normalized) return null;
  if (/^(?:run|start|execute|kick off|go|go ahead|do it|run it|start it|execute it|kick it off)(?:\s+(?:the\s+)?(?:creator\s+)?mission)?$/i.test(normalized)) {
    return 'run';
  }
  if (/^(?:validate|check|verify|test)(?:\s+(?:it|the\s+creator\s+mission|the\s+mission))?$/i.test(normalized)) {
    return 'validate';
  }
  if (/^(?:status|show status|what'?s happening|what happened|show me status|check status)(?:\s+(?:for\s+)?(?:it|the\s+creator\s+mission|the\s+mission))?$/i.test(normalized)) {
    return 'status';
  }
  return null;
}

function normalizeNaturalCreatorText(text: string): string {
  return text.toLowerCase().replace(/[^\w\s-]/g, ' ').replace(/\s+/g, ' ').trim();
}

function inferNaturalCreatorPrivacyMode(normalized: string): ParsedCreatorCommand['privacyMode'] | undefined {
  if (/\b(?:private|local|locally|workspace only|personal workspace)\b/.test(normalized)) return 'local_only';
  if (/\b(?:github|pull request|pr)\b/.test(normalized)) return 'github_pr';
  if (/\b(?:swarm|network|public|share|shared)\b/.test(normalized)) return 'swarm_shared';
  return 'local_only';
}

function inferNaturalCreatorRiskLevel(normalized: string): ParsedCreatorCommand['riskLevel'] | undefined {
  const match = normalized.match(/\brisk\s+(low|medium|high)\b/);
  return match ? (match[1] as ParsedCreatorCommand['riskLevel']) : 'medium';
}

export function parseNaturalCreatorMissionIntent(text: string): NaturalCreatorMissionIntent | null {
  const normalized = normalizeNaturalCreatorText(text);
  if (!normalized || normalized.startsWith('/')) return null;
  if (/\b(?:what|which|show|list|status|report|review|trace)\b/.test(normalized) && !/\b(?:create|build|make|plan|scaffold|generate)\b/.test(normalized)) {
    return null;
  }

  const hasCreateVerb = /\b(?:create|build|make|plan|scaffold|generate|set up|spin up)\b/.test(normalized);
  if (!hasCreateVerb) return null;

  const artifactPatterns: Array<{ label: string; pattern: RegExp }> = [
    { label: 'full creator system', pattern: /\b(?:creator system|creator mission|creator run|full path|domain chip.*benchmark.*(?:specialization|path|autoloop)|specialization.*benchmark.*autoloop)\b/ },
    { label: 'specialization path', pattern: /\b(?:specialization path|specialisation path|learning path|mastery path)\b/ },
    { label: 'autoloop', pattern: /\b(?:autoloop|auto loop|recursive loop|self-improvement loop)\b/ },
    { label: 'benchmark pack', pattern: /\b(?:benchmark pack|benchmark|eval pack|evaluation pack|test suite)\b/ },
    { label: 'domain chip', pattern: /\b(?:domain chip|domain-chip)\b/ }
  ];
  const artifact = artifactPatterns.find((entry) => entry.pattern.test(normalized));
  if (!artifact) return null;

  const brief = text.trim().replace(/\s+/g, ' ');
  if (brief.length < 8) return null;
  return {
    brief: [
      brief,
      '',
      'Use Spark creator-system standards: creator intent packet, adapter map, artifact manifests, benchmark gates, evidence ladder, local/private boundary, and Swarm review packet only when gates allow it.',
      'Keep Telegram user-facing output natural and concise; keep detailed evidence in Workspace/Canvas/Kanban.'
    ].join('\n'),
    privacyMode: inferNaturalCreatorPrivacyMode(normalized),
    riskLevel: inferNaturalCreatorRiskLevel(normalized),
    artifactLabel: artifact.label
  };
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

export function buildDomainChipCapabilityProposalPacket(brief: string): Record<string, unknown> {
  const chipKey = projectNameForDomainChipBrief(brief);
  return {
    schema_version: 'spark.capability_proposal.v1',
    status: 'proposal_plan_only',
    capability_goal: brief,
    recipient: 'Spark',
    implementation_route: 'domain_chip',
    owner_system: 'Spark domain chip runtime',
    permissions_required: ['operator_approval_to_activate'],
    safe_probe: 'Create the chip in a local or shadow route first, then prove only matching domain language invokes it.',
    human_approval_boundary: 'Operator approval is required before activating the chip in the live Spark router.',
    rollback_path: `Disable or remove ${chipKey} from the chip registry and delete its runtime attachment.`,
    activation_path: 'Register the chip manifest through the Spark chip attachment contract after tests pass.',
    eval_or_smoke_test: 'Router-invocation smoke test plus a fallthrough test for unrelated natural language.',
    capability_ledger_key: `domain_chip:${chipKey}`,
    claim_boundary: 'This packet is a proposal plan, not proof that Spark has gained the capability.'
  };
}

export function buildDomainChipPrd(brief: string): string {
  const chipKey = projectNameForDomainChipBrief(brief);
  return [
    `Create a Spark domain chip named ${chipKey}.`,
    '',
    `Natural-language chip brief: ${brief}`,
    '',
    'This must use the current Spark-compatible domain chip standards, not the older domain-chip-labs-only assumptions.',
    'If this chip adds an executable Spark capability, follow Builder docs/CAPABILITY_PROPOSAL_STANDARD_V1.md: classify the route, name permissions, safe probe, approval boundary, rollback, eval, activation path, and capability ledger key before claiming the capability is live.',
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
  return isNoExecutionBoundary(text) || /^(?:cancel|stop|never mind|nevermind|not now|no)$/i.test(text.trim());
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
    pending.buildModeReason,
    pending.capabilityProposalPacket
  );
  return true;
}

async function handleCreatorMissionPlan(ctx: any, parsed: ParsedCreatorCommand): Promise<void> {
  const accessProfile = await getSparkAccessProfile(ctx.chat.id);
  if (!sparkAccessAllows(accessProfile, 'spawner_build')) {
    await ctx.reply(renderSparkAccessDenial(accessProfile, 'spawner_build'));
    return;
  }

  await safeSendChatAction(ctx, 'typing');
  const requestId = `tg-creator-${ctx.chat.id}-${ctx.message.message_id}-${Date.now()}`;
  const result = await spawner.creatorMission({
    brief: parsed.brief,
    requestId,
    privacyMode: parsed.privacyMode,
    riskLevel: parsed.riskLevel
  });

  await ctx.reply(formatCreatorMissionSummary(result));
  if (result.success && result.missionId) {
    pendingCreatorMissions.set(pendingCreatorMissionKey(ctx), {
      missionId: result.missionId,
      timestamp: Date.now()
    });
    await conversation.learnAboutUser(
      ctx.from,
      `Planned creator mission ${result.missionId} for ${parsed.brief.slice(0, 220)}`
    ).catch(() => {});
  }
}

async function handlePendingCreatorMissionControl(ctx: any, text: string): Promise<boolean> {
  const key = pendingCreatorMissionKey(ctx);
  const pending = pendingCreatorMissions.get(key);
  if (!pending) return false;
  if (Date.now() - pending.timestamp > CLARIFICATION_TTL_MS) {
    pendingCreatorMissions.delete(key);
    return false;
  }

  const action = parsePendingCreatorMissionAction(text);
  if (!action) return false;
  const accessProfile = await getSparkAccessProfile(ctx.chat.id);
  if (!sparkAccessAllows(accessProfile, 'spawner_build')) {
    await ctx.reply(renderSparkAccessDenial(accessProfile, 'spawner_build'));
    return true;
  }
  await conversation.remember(ctx.from, text).catch(() => {});
  await safeSendChatAction(ctx, 'typing');

  if (action === 'status') {
    const result = await spawner.creatorMissionStatus({ missionId: pending.missionId });
    await ctx.reply(formatCreatorMissionStatusSummary(result));
    return true;
  }

  if (action === 'validate') {
    const result = await spawner.creatorMissionValidate({ missionId: pending.missionId });
    await ctx.reply(formatCreatorMissionValidationSummary(result));
    return true;
  }

  const result = await spawner.creatorMissionExecute({ missionId: pending.missionId });
  await ctx.reply(formatCreatorMissionExecutionSummary(result));
  return true;
}

function isPendingClarificationFollowup(text: string): boolean {
  const normalized = text.trim().toLowerCase().replace(/\s+/g, ' ');
  if (!normalized) return false;
  if (/^(?:go|run|start|ship|yes|yep|yeah|ok|okay|sure|perfect|do it|let'?s go|default|defaults|skip)$/i.test(normalized)) {
    return true;
  }
  const startsWithConfirmation = /^(?:yes|yeah|yep|ok|okay|sure|perfect|sounds good|great|cool)\b/.test(normalized);
  const contextualObject = /\b(?:it|this|that|the project|the dashboard|the app|the build)\b/.test(normalized);
  const action = /\b(?:build|create|make|ship|start|run|do|use|analyz|analyse)\b/.test(normalized);
  return contextualObject && action && (startsWithConfirmation || /\b(?:create|build|make|ship|start|run|do)\s+(?:it|this|that)\b/.test(normalized));
}

export function shouldUsePendingClarificationForMessage(pending: { timestamp: number } | null | undefined, text: string): boolean {
  if (!pending) return false;
  const expired = Date.now() - pending.timestamp > CLARIFICATION_TTL_MS;
  if (!expired) return true;
  return isPendingClarificationFollowup(text);
}

function pendingClarificationForMessage(key: string, text: string): PendingClarification | null {
  const pending = pendingClarifications.get(key);
  if (!pending) return null;
  if (!shouldUsePendingClarificationForMessage(pending, text)) {
    pendingClarifications.delete(key);
    return null;
  }
  return pending;
}

function quotedTelegramMessageText(message: any): string {
  const quoted = message?.reply_to_message;
  const text = typeof quoted?.text === 'string' ? quoted.text : typeof quoted?.caption === 'string' ? quoted.caption : '';
  return text.replace(/\s+/g, ' ').trim();
}

function compactTelegramReplyQuote(text: string, maxChars = 360): string {
  const compact = text.replace(/\s+/g, ' ').trim();
  if (compact.length <= maxChars) {
    return compact;
  }
  return `${compact.slice(0, Math.max(0, maxChars - 14)).trim()} [truncated]`;
}

function isMissionStatusOriginQuestion(text: string): boolean {
  const normalized = text.replace(/\s+/g, ' ').trim().toLowerCase();
  return /^(?:where\s+did\s+this\s+come\s+from|what\s+is\s+this|what\s+was\s+this|why\s+did\s+you\s+send\s+this)\??$/.test(normalized);
}

export function buildTelegramReplyContextPrompt(currentText: string, quotedText: string, quotedSender = 'previous message'): string {
  return [
    '[Telegram direct reply context]',
    `Quoted sender: ${quotedSender || 'previous message'}`,
    `Quoted message: ${compactTelegramReplyQuote(quotedText)}`,
    '',
    '[Current user message]',
    currentText.trim(),
  ].join('\n');
}

export function buildQuotedMissionStatusOriginReply(currentText: string, quotedText: string): string | null {
  if (!isMissionStatusOriginQuestion(currentText)) return null;
  const quoted = compactTelegramReplyQuote(quotedText);
  if (!quoted) return null;
  if (/\bStill working on\b.+\bshaping the PRD\b|\bpreparing the canvas\b/i.test(quoted)) {
    return [
      'That came from the Mission Control PRD/canvas prep notifier for an older build request.',
      '',
      'It means Spark had accepted a build, was turning the request into a task canvas, and had not started execution yet.'
    ].join('\n');
  }
  if (/\b(?:Spark has the build ready|Spark finished the build|Spark completed the mission|Open it here:|Mission:\s*(?:spark|mission)-)\b/i.test(quoted)) {
    return 'That was the final Mission Control handoff for a build: the Codex result, preview link if there is one, and mission id.';
  }
  return null;
}

function buildLatestAssistantOriginReply(currentText: string, pending: PendingClarification | null): string | null {
  if (!isMissionStatusOriginQuestion(currentText)) return null;
  if (!pending) return null;
  return [
    `That was the build clarification gate for ${pending.projectName}.`,
    '',
    'Spark had enough to understand the project, but paused before enqueueing Mission Control because it wanted one steering answer or an explicit "go".'
  ].join('\n');
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
    `${args.taskCount ?? tasks.length} build steps queued.`,
  ];
  if (taskTitles.length > 0) {
    lines.push('', 'First up:');
    taskTitles.forEach((title: string) => lines.push(`• ${title}`));
    if (tasks.length > taskTitles.length) {
      lines.push(`+${tasks.length - taskTitles.length} more`);
    }
  }
  lines.push('', `Canvas: ${args.readyCanvasUrl}`, `Mission board: ${args.kanbanUrl}`, '', 'I will send the final handoff when it is built.');
  return lines.join('\n');
}

async function recordBuilderAocPreflightForRun(input: {
  ctx: any;
  requestId: string;
  traceRef: string;
  selectedRoute: string;
  userIntent: string;
  reason: string;
}): Promise<void> {
  if (process.env.SPARK_BOT_TEST_MODE === '1' || process.env.SPARK_TELEGRAM_AOC_PREFLIGHT === '0') {
    return;
  }
  try {
    await runBuilderAocPreflight({
      userId: String(input.ctx.from?.id ?? ''),
      chatId: String(input.ctx.chat?.id ?? ''),
      requestId: input.requestId,
      traceRef: input.traceRef,
      selectedRoute: input.selectedRoute,
      userIntent: input.userIntent,
      confidence: 'high',
      reason: input.reason
    });
  } catch (error) {
    console.warn('[BuilderAOC] preflight recording failed:', redactText(error instanceof Error ? error.message : String(error)));
  }
}

function buildDispatchConsequenceRisk(prd: string): 'medium' | 'external' {
  const text = prd.toLowerCase();
  const asksForExternalSideEffect = /\b(push|publish|deploy|release|ship|upload|send|post|email|tweet|live|production)\b/.test(text);
  const boundedLocalOnly = /\b(local-only|local only|do not publish|do not deploy|do not push|no network calls|static proof)\b/.test(text);
  return asksForExternalSideEffect && !boundedLocalOnly ? 'external' : 'medium';
}

function routeConfidenceDecision(payload: Record<string, unknown>): string {
  return typeof payload.decision === 'string' ? payload.decision : 'ask';
}

function routeConfidenceHumanNextAction(payload: Record<string, unknown>): string {
  return typeof payload.human_next_action === 'string'
    ? payload.human_next_action
    : 'Reply with a clearer scope or explicit confirmation before I start a mission.';
}

async function buildDispatchRouteConfidenceAllows(input: {
  ctx: any;
  accessRequirement: SparkAccessRequirement;
  prd: string;
  requestId: string;
  traceRef: string;
  runnerPreflight: Awaited<ReturnType<typeof probeTelegramRunnerWritability>> | null;
}): Promise<boolean> {
  if (process.env.SPARK_BOT_TEST_MODE === '1') {
    return true;
  }

  try {
    const runnerWritable = input.runnerPreflight?.runnerWritable || 'unknown';
    const gate = await runBuilderRouteConfidenceGate({
      intent: 'build_dispatch',
      candidateRoute: 'spawner.build',
      routeContext: {
        latest_instruction: 'allow_execution',
        intent_clarity: 'explicit',
        route_fit: 'exact',
        consequence_risk: buildDispatchConsequenceRisk(input.prd),
        permission_required: input.accessRequirement,
        authority_verdict: 'allowed',
        capability_state: runnerWritable === 'no' ? 'unavailable' : 'unknown',
        runner_state: runnerWritable === 'no' ? 'unavailable' : 'unknown',
        confirmation_state: 'not_required',
        reversibility: 'reversible',
        source_status: 'present',
        freshness: 'current_turn',
        request_id: input.requestId,
        trace_ref: input.traceRef,
        joined_sources: [
          'telegram_access_policy',
          'telegram_route_firewall',
          'builder_route_confidence_gate'
        ],
        data_boundary: {
          exports_raw_prompt: false,
          exports_chat_id: false,
          exports_provider_output: false,
          exports_memory_body: false,
          exports_transcript_body: false,
          exports_audio: false,
          exports_env_value: false,
          exports_secret: false
        },
        verification_command: 'spark os trace --json'
      }
    });

    const decision = routeConfidenceDecision(gate.payload);
    if (decision === 'act') {
      return true;
    }
    if (decision === 'explain') {
      await input.ctx.reply([
        'Spark will not start a build from this message.',
        '',
        routeConfidenceHumanNextAction(gate.payload)
      ].join('\n'));
      return false;
    }
    if (decision === 'refuse') {
      await input.ctx.reply([
        'I cannot start that build safely from this route.',
        '',
        routeConfidenceHumanNextAction(gate.payload)
      ].join('\n'));
      return false;
    }
    await input.ctx.reply([
      'I can prepare this build, but I need one confirmation first.',
      '',
      routeConfidenceHumanNextAction(gate.payload)
    ].join('\n'));
    return false;
  } catch (error) {
    if ((process.env.SPARK_BUILDER_BRIDGE_MODE || 'auto').toLowerCase() === 'required') {
      await input.ctx.reply(renderSparkErrorReply(
        error instanceof Error ? error : new Error(String(error)),
        'builder',
        conversation.isAdmin(input.ctx.from)
      ));
      return false;
    }
    console.warn('[RouteConfidenceGate] build dispatch gate unavailable; using local Telegram access gate:', redactText(error instanceof Error ? error.message : String(error)));
    return true;
  }
}

interface RunCommandOptions {
  allowBuildIntent?: boolean;
  missionName?: string;
}

export async function handleRunCommand(
  ctx: any,
  goal: string,
  providers: string[],
  requiredAccess?: SparkAccessRequirement,
  options: RunCommandOptions = {}
): Promise<string | null> {
  const buildIntent = options.allowBuildIntent ? parseBuildIntent(goal) : null;
  if (buildIntent) {
    await handleBuildIntent(
      ctx,
      buildIntent.prd,
      buildIntent.projectName,
      buildIntent.projectPath,
      buildIntent.buildMode,
      buildIntent.buildModeReason
    );
    return null;
  }

  await safeSendChatAction(ctx, 'typing');

  const accessRequirement = requiredAccess || (
    sparkMissionNeedsOperatingSystemAccess(goal) ? 'operating_system' : 'spawner_build'
  );
  const accessProfile = await getSparkAccessProfile(ctx.chat.id);
  if (!sparkAccessAllows(accessProfile, accessRequirement)) {
    await ctx.reply(renderSparkAccessDenial(accessProfile, accessRequirement));
    return null;
  }

  const requestId = opaqueTelegramRequestId('tg-run');
  const traceRef = telegramRunTraceRef(requestId);
  await recordBuilderAocPreflightForRun({
    ctx,
    requestId,
    traceRef,
    selectedRoute: 'spawner_run',
    userIntent: 'telegram_run_mission',
    reason: 'Telegram access gate passed for non-build /run; dispatching to Spawner with shared trace.'
  });
  const result = await spawner.runGoal({
    goal,
    chatId: String(ctx.chat.id),
    requestId,
    traceRef,
    userId: String(ctx.from.id),
    tier: getTierForUser(ctx.from.id),
    providers,
    promptMode: 'simple',
    missionName: options.missionName
  });

  if (!result.success || !result.missionId) {
    await ctx.reply(renderSparkErrorReply(new Error(result.error || 'Spawner mission start failed'), 'spawner', conversation.isAdmin(ctx.from)));
    return null;
  }

  await ctx.reply(humanAck(result.providers || providers), outboundTraceExtra({
    route: 'spawner',
    command: 'run',
    replyKind: 'mission_ack',
    requestId: result.requestId || requestId,
    traceRef,
    missionId: result.missionId
  }));
  recordCommandReplyDelivery({
    command: 'run',
    replyKind: 'mission_ack',
    requestId: result.requestId || requestId,
    traceRef
  });

  await registerMissionRelay({
    missionId: result.missionId,
    chatId: String(ctx.chat.id),
    userId: String(ctx.from.id),
    requestId: result.requestId || requestId,
    traceRef,
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
  buildModeReason: string,
  capabilityProposalPacket?: Record<string, unknown>
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
  const runnerPreflight = accessRequirement === 'operating_system'
    ? await probeTelegramRunnerWritability()
    : null;
  if (runnerPreflight?.runnerWritable === 'no') {
    await ctx.reply([
      'This chat is allowed to request local workspace work, but the current Telegram runner is read-only.',
      '',
      'I did not enqueue the build because it could claim local access that this route cannot prove.',
      '',
      'Next: send `/access_setup`, restart Spark if prompted, then try again. If this machine is intentionally read-only, use a writable Mission Control/Codex route.'
    ].join('\n'));
    return;
  }

  const spawnerUrl = resolveSpawnerUiUrl();
  const chatId = Number(ctx.chat.id);
  const requestId = opaqueTelegramRequestId('tg-build');
  const missionId = missionIdFromTelegramBuildRequest(requestId);
  const traceRef = spawnerPrdTraceRef(missionId);
  await recordBuilderAocPreflightForRun({
    ctx,
    requestId,
    traceRef,
    selectedRoute: 'spawner_prd_bridge',
    userIntent: buildMode === 'advanced_prd' ? 'telegram_run_advanced_prd_build' : 'telegram_run_direct_build',
    reason: 'Telegram access gate passed for build /run; dispatching to Spawner PRD bridge with shared trace.'
  });
  if (!(await buildDispatchRouteConfidenceAllows({ ctx, accessRequirement, prd, requestId, traceRef, runnerPreflight }))) {
    return;
  }

  const prdContent = projectPath
    ? `# ${projectName}\n\nBuild mode: ${buildMode}\nBuild mode reason: ${buildModeReason}\nTarget workspace/project path: \`${projectPath}\`\n\n${prd}`
    : `# ${projectName}\n\nBuild mode: ${buildMode}\nBuild mode reason: ${buildModeReason}\n\n${prd}`;

  const tier = getTierForUser(ctx.from.id);
  try {
    const res = await postLocalServiceWithRetry(
      `${spawnerUrl}/api/prd-bridge/write`,
      {
        content: prdContent,
        requestId,
        traceRef,
        projectName,
        buildMode,
        buildModeReason,
        chatId: String(chatId),
        userId: String(ctx.from.id),
        runnerCapability: runnerPreflight
          ? {
              runnerWritable: runnerPreflight.runnerWritable,
              runnerLabel: runnerPreflight.runnerLabel,
              checkedAt: runnerPreflight.checkedAt
            }
          : { runnerWritable: 'unknown' },
        telegramRelay: getTelegramRelayIdentity(),
        tier,
        ...(capabilityProposalPacket ? { capabilityProposalPacket } : {}),
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
        capabilityProposalPacket,
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

    await registerMissionRelay({
      missionId,
      chatId: String(ctx.chat.id),
      userId: String(ctx.from.id),
      requestId,
      traceRef,
      goal: projectName || prd,
      createdAt: new Date().toISOString(),
      updateId: typeof ctx.update.update_id === 'number' ? ctx.update.update_id : undefined
    });

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
    await ctx.reply(ackLines.join('\n'), outboundTraceExtra({
      route: 'spawner',
      command: 'run',
      replyKind: 'build_ack',
      requestId,
      traceRef,
      missionId
    }));
    recordCommandReplyDelivery({
      command: 'run',
      replyKind: 'build_ack',
      requestId,
      traceRef
    });

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

const RUN_VARIANTS: Array<{ name: string; providers: string[] }> = [
  { name: 'run', providers: [] },
  { name: 'runminimax', providers: ['minimax'] },
  { name: 'runglm', providers: ['zai'] },
  { name: 'runzai', providers: ['zai'] },
  { name: 'runclaude', providers: ['claude'] },
  { name: 'runcodex', providers: ['codex'] },
  { name: 'run2', providers: ['minimax', 'zai'] },
  { name: 'runall', providers: ['minimax', 'zai', 'claude', 'codex'] }
];

function missionDefaultProvider(): string {
  return resolveMissionDefaultProvider();
}

function renderRunUsage(variant: typeof RUN_VARIANTS[number]): string {
  const command = `/${variant.name}`;
  const isDefault = variant.name === 'run';
  const routeLine = isDefault
    ? `Uses current mission provider: ${missionDefaultProvider()}.`
    : `Expert shortcut: sends directly to ${humanProviderList(variant.providers)}.`;
  const example = isDefault
    ? '/run audit the Telegram command copy and suggest fixes'
    : `${command} compare the current plan against the launch docs`;
  const title = isDefault ? '🚀 Start a mission' : `🚀 Start a ${humanProviderList(variant.providers)} mission`;
  return [
    title,
    '',
    'Use',
    `• ${command} <goal>`,
    '',
    'Example',
    `• ${example}`,
    '',
    'Route',
    `• ${routeLine}`,
    '• /model shows or changes the default mission route.'
  ].join('\n');
}

for (const variant of RUN_VARIANTS) {
  bot.command(variant.name, async (ctx) => {
    if (!requireAdmin(ctx)) return;
    const goal = parseRunCommand(ctx.message.text, `/${variant.name}`);
    if (!goal) {
      return ctx.reply(renderRunUsage(variant));
    }
    const providers = variant.name === 'run' ? [missionDefaultProvider()] : variant.providers;
    await handleRunCommand(ctx, goal, providers, undefined, { allowBuildIntent: variant.name === 'run' });
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

  const accessProfile = await getSparkAccessProfile(ctx.chat.id);
  if (!sparkAccessAllows(accessProfile, 'spawner_build')) {
    await ctx.reply(renderSparkAccessDenial(accessProfile, 'spawner_build'));
    return;
  }

  await safeSendChatAction(ctx, 'typing');
  const result = await spawner.board();
  await ctx.reply(result.success ? result.message : `Board failed: ${result.message}`);
});

bot.command('creator', async (ctx) => {
  if (!requireAdmin(ctx)) return;

  const raw = ctx.message.text.replace('/creator', '').trim();
  const control = parseCreatorMissionControlCommand(raw);
  const parsed = control ? null : parseCreatorPlanCommand(raw);
  if (!control && !parsed) {
    return ctx.reply(CREATOR_USAGE);
  }
  if (parsed && isLowInformationCreatorBrief(parsed.brief)) {
    return ctx.reply(renderCreatorUsage('Add a creator mission brief after the mode.'));
  }

  const accessProfile = await getSparkAccessProfile(ctx.chat.id);
  if (!sparkAccessAllows(accessProfile, 'spawner_build')) {
    await ctx.reply(renderSparkAccessDenial(accessProfile, 'spawner_build'));
    return;
  }

  await safeSendChatAction(ctx, 'typing');

  if (control) {
    const missionId = control.missionId.trim();
    if (missionId.includes('<') || missionId.includes('>')) {
      return ctx.reply('Use the real creator mission ID, for example: /creator run mission-creator-1776768300668');
    }
    if (!isValidCreatorMissionId(missionId)) {
      return ctx.reply('Use a creator mission ID from /creator plan or /board, for example: /creator run mission-creator-1776768300668');
    }

    if (control.action === 'status') {
      const result = await spawner.creatorMissionStatus({ missionId });
      await ctx.reply(formatCreatorMissionStatusSummary(result));
      return;
    }

    if (control.action === 'validate') {
      await ctx.reply('Running creator mission validation through Spawner...');
      const result = await spawner.creatorMissionValidate({ missionId, maxCommands: control.maxCommands });
      await ctx.reply(formatCreatorMissionValidationSummary(result));
      if (result.success && result.missionId) {
        await conversation.learnAboutUser(
          ctx.from,
          `Ran validation for creator mission ${result.missionId} from Telegram.`
        ).catch(() => {});
      }
      return;
    }

    if (control.action === 'run') {
      await ctx.reply('Starting creator mission execution through Spawner...');
      const result = await spawner.creatorMissionExecute({ missionId });
      await ctx.reply(formatCreatorMissionExecutionSummary(result));
      if (result.success && result.missionId) {
        await conversation.learnAboutUser(
          ctx.from,
          `Started execution for creator mission ${result.missionId} from Telegram.`
        ).catch(() => {});
      }
      return;
    }
  }

  if (!parsed) {
    return ctx.reply(CREATOR_USAGE);
  }

  await ctx.reply('Planning creator mission...');
  await handleCreatorMissionPlan(ctx, parsed);
});

function renderChipUsage(): string {
  return [
    '🌱 Create a domain chip',
    '',
    'Use',
    '• /chip create <natural language description>',
    '',
    'Example',
    '• /chip create a QA operator that catches launch-blocking UI regressions',
    '',
    'Next move',
    '• Use /creator for planned creator missions, or /recursive for recursive loops.'
  ].join('\n');
}

bot.command('chip', async (ctx) => {
  if (!requireAdmin(ctx)) return;

  const raw = ctx.message.text.replace('/chip', '').trim();
  const parts = raw.split(/\s+/);
  const action = parts.shift()?.toLowerCase() || '';
  const prompt = parts.join(' ').trim();

  if (action !== 'create' || !prompt) {
    return ctx.reply(renderChipUsage());
  }

  await safeSendChatAction(ctx, 'typing');
  await ctx.reply('🌱 Scaffolding a new domain chip from your brief...');

  const result = await createChipFromPrompt(prompt);

  if (!result.ok) {
    return ctx.reply(renderTelegramError('Chip create failed', result.error));
  }

  const lines = [
    '✅ Chip created.',
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

function renderLoopUsage(): string {
  return [
    '🌀 Run a chip autoloop',
    '',
    'Use',
    '• /loop <chip_key> [rounds]',
    '',
    'Example',
    '• /loop startup-yc 3',
    '',
    'What happens',
    '• Spark asks the chip for candidates, evaluates them, and posts a summary.'
  ].join('\n');
}

bot.command('loop', async (ctx) => {
  if (!requireAdmin(ctx)) return;

  const raw = ctx.message.text.replace('/loop', '').trim();
  const parts = raw.split(/\s+/).filter(Boolean);
  const chipKey = parts[0];
  const rounds = Math.max(1, Math.min(10, Number.parseInt(parts[1] ?? '3', 10) || 3));

  if (!chipKey) {
    return ctx.reply(renderLoopUsage());
  }

  const chatId = ctx.chat.id;
  await safeSendChatAction(ctx, 'typing');
  await ctx.reply(`🌀 Starting autoloop on ${chipKey} for ${rounds} round(s).\n\nI will post the summary when it finishes.`);

  // Detach the heavy work so the Telegraf handler returns instantly;
  // the loop can exceed the handler timeout without failing the turn.
  void (async () => {
    try {
      const result = await runChipLoop(chipKey, rounds, 3);
      if (!result.ok) {
        await ctx.telegram.sendMessage(chatId, renderTelegramError('Loop failed', result.error));
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
      await ctx.telegram.sendMessage(chatId, renderTelegramError('Loop crashed', err));
    }
  })();
});

export async function handleRecursiveCommand(ctx: any, rawOverride?: string): Promise<unknown> {
  if (!requireAdmin(ctx)) return;

  const raw = rawOverride ?? ctx.message.text.replace('/recursive', '').trim();
  const parsed = parseRecursiveCommand(raw);
  if (!parsed) return ctx.reply(renderRecursiveHelp());

  try {
    if (parsed.action === 'help') {
      return ctx.reply(renderRecursiveHelp());
    }

    if (parsed.action === 'sessions') {
      await safeSendChatAction(ctx, 'typing');
      return ctx.reply(renderRecursiveSessions(await recursiveSessions()));
    }

    if (parsed.action === 'paths') {
      await safeSendChatAction(ctx, 'typing');
      return ctx.reply(renderRecursivePaths(await recursiveSessions()));
    }

    if (parsed.action === 'session') {
      if (!parsed.id) return ctx.reply('Usage: /recursive session <id>');
      await safeSendChatAction(ctx, 'typing');
      return ctx.reply(await recursiveSessionStatus(parsed.id));
    }

    if (parsed.action === 'report') {
      if (!parsed.id) return ctx.reply('Usage: /recursive report <id>');
      await safeSendChatAction(ctx, 'typing');
      return ctx.reply(await recursiveSessionReport(parsed.id));
    }

    if (parsed.action === 'trace') {
      if (!parsed.id) return ctx.reply('Usage: /recursive trace <id>');
      await safeSendChatAction(ctx, 'typing');
      return ctx.reply(await recursiveTraceReply(parsed.id));
    }

    if (parsed.action === 'canvas') {
      if (!parsed.id) return ctx.reply('Usage: /recursive canvas <id>');
      await safeSendChatAction(ctx, 'typing');
      return ctx.reply(renderRecursiveCanvasQueue(await queueRecursiveCanvas(parsed.id)));
    }

    if (parsed.action === 'review') {
      await safeSendChatAction(ctx, 'typing');
      if (parsed.id) return ctx.reply(await recursiveSessionReview(parsed.id));
      return ctx.reply(renderRecursiveReviewCandidates(await recursiveReviewCandidates()));
    }

    if (parsed.action === 'approve' || parsed.action === 'defer' || parsed.action === 'reject' || parsed.action === 'more-eval') {
      if (!parsed.id) return ctx.reply(`Usage: /recursive ${parsed.action} <id> <rationale>`);
      const actor = `telegram:${ctx.from?.id ?? 'unknown'}`;
      const decision = await recordRecursiveDecision({
        id: parsed.id,
        action: parsed.action,
        actor,
        rationale: parsed.rationale
      });
      return ctx.reply(renderRecursiveDecision(decision));
    }

    if (parsed.action === 'promote') {
      if (!parsed.id) return ctx.reply('Usage: /recursive promote <id>');
      await safeSendChatAction(ctx, 'typing');
      const packet = await stageRecursivePromotionPacket(parsed.id);
      return ctx.reply(renderRecursivePromotionPacket(packet));
    }

    if (parsed.action === 'sync') {
      if (parsed.syncKind) {
        await safeSendChatAction(ctx, 'typing');
        const result = await syncRecursiveArtifactToWorkspace({
          kind: parsed.syncKind,
          args: parsed.syncArgs || []
        });
        return ctx.reply(renderRecursiveArtifactSyncCompletion(result));
      }
      if (!parsed.id) return ctx.reply('Usage: /recursive sync <id>');
      await safeSendChatAction(ctx, 'typing');
      const packet = await stageRecursiveSwarmPacket(parsed.id);
      return ctx.reply(renderRecursiveSwarmPacket(packet));
    }

    if (parsed.action === 'propose') {
      if (!parsed.id) return ctx.reply('Usage: /recursive propose <chip-or-path-name> [submit]');
      await safeSendChatAction(ctx, 'typing');
      const result = await proposeRecursiveWorkspaceEvidence(parsed.id, parsed.proposeArgs || []);
      return ctx.reply(renderRecursiveNetworkProposal(result));
    }

    if (parsed.action === 'start') {
      if (!parsed.chipKey) {
        return ctx.reply([
          '🌀 Start a recursive loop',
          '',
          'Use',
          '• /recursive start <targetKey> [rounds <n>]',
          '',
          'Example',
          '• /recursive start startup-yc rounds 3',
          '',
          'Find targets',
          '• /recursive sessions',
          '• /recursive paths'
        ].join('\n'));
      }
      const chatId = ctx.chat.id;
      const rounds = parsed.rounds || 3;
      const startTarget = await resolveRecursiveStartTarget(parsed.chipKey);
      await safeSendChatAction(ctx, 'typing');
      const targetLabel = startTarget.kind === 'path' ? 'Spark Swarm specialization path loop' : 'recursive Builder chip loop';
      await ctx.reply(`Starting ${targetLabel} on ${startTarget.key} for ${rounds} round(s). I will post the summary when it finishes.`);

      void (async () => {
        try {
          if (startTarget.kind === 'path') {
            const result = await runSpecializationPathAutoloop(startTarget, rounds, sparkWorkspaceBridgeHints());
            if (!result.ok) {
              await ctx.telegram.sendMessage(chatId, renderTelegramError('Recursive path loop failed', result.error));
              return;
            }
            await ctx.telegram.sendMessage(chatId, renderSpecializationPathLoopCompletion(result));
            return;
          }

          const result = await runChipLoop(parsed.chipKey!, rounds, 3);
          if (!result.ok) {
            await ctx.telegram.sendMessage(chatId, renderTelegramError('Recursive loop failed', result.error));
            return;
          }
          let sync = null;
          let syncError = null;
          if (sparkWorkspaceConfigured()) {
            try {
              sync = await syncBuilderChipLoopToWorkspace(result);
            } catch (syncErr: any) {
              syncError = syncErr?.message || String(syncErr);
            }
          }
          await ctx.telegram.sendMessage(chatId, renderBuilderChipLoopCompletion(result, sync, syncError));
        } catch (err: any) {
          await ctx.telegram.sendMessage(chatId, renderTelegramError('Recursive loop crashed', err));
        }
      })();
      return;
    }

    return ctx.reply(renderRecursiveHelp());
  } catch (err: any) {
    const status = err?.response?.status;
    const detail = redactText(err?.response?.data?.error || err?.message || String(err));
    if (status === 401 && detail === 'authentication_required') {
      return ctx.reply([
        'Recursive command failed (401): Spark Workspace rejected this agent token for recursive reads.',
        'Start/sync may still work, but /recursive report and /recursive trace need the deployed Workspace API with CLI-token collective-snapshot support.',
        `Workspace: ${sparkWorkspaceRecursionsUrl()}`
      ].join('\n'));
    }
    return ctx.reply(`Recursive command failed${status ? ` (${status})` : ''}: ${detail}`);
  }
}

bot.command('recursive', async (ctx) => handleRecursiveCommand(ctx));

function renderScheduleUsage(): string {
  return [
    '🗓️ Schedule recurring work',
    '',
    'Use',
    '• /schedule "<cron>" mission <goal>',
    '• /schedule "<cron>" loop <chipKey> [rounds]',
    '',
    'Example',
    '• /schedule "*/5 * * * *" loop startup-yc 2',
    '',
    'Manage',
    '• /schedules lists or deletes scheduled work.'
  ].join('\n');
}

bot.command('schedule', async (ctx) => {
  if (!requireAdmin(ctx)) return;

  const raw = ctx.message.text.replace('/schedule', '').trim();
  // Expect: "<cron>" mission <goal>   OR   "<cron>" loop <chipKey> [rounds]
  const quoteMatch = raw.match(/^"([^"]+)"\s+(.*)$/);
  if (!quoteMatch) {
    return ctx.reply(renderScheduleUsage());
  }
  const cron = quoteMatch[1].trim();
  const rest = quoteMatch[2].trim().split(/\s+/);
  const action = rest.shift()?.toLowerCase();
  if (action === 'mission') {
    const goal = rest.join(' ').trim();
    if (!goal) return ctx.reply('⚠️ Missing mission goal.\n\nExample\n• /schedule "*/5 * * * *" mission check launch health');
    const res = await createSchedule({
      cron,
      action: 'mission',
      payload: { goal },
      chatId: String(ctx.chat.id),
    });
    if (!res.ok || !res.schedule) return ctx.reply(`Schedule failed: ${res.error || 'unknown error'}`);
    return ctx.reply(
      `✅ Schedule created.\nSchedule: ${humanizeCron(res.schedule.cron)}\nWhat it does: Run mission "${goal}"\nNext: ${formatNextFireLocal(res.schedule.nextFireAt)}\nId: ${res.schedule.id}`
    );
  }
  if (action === 'loop') {
    const chipKey = rest.shift();
    const rounds = Math.max(1, Math.min(10, Number.parseInt(rest[0] ?? '2', 10) || 2));
    if (!chipKey) return ctx.reply('⚠️ Missing chip key.\n\nExample\n• /schedule "*/5 * * * *" loop startup-yc 2');
    const res = await createSchedule({
      cron,
      action: 'loop',
      payload: { chipKey, rounds },
      chatId: String(ctx.chat.id),
    });
    if (!res.ok || !res.schedule) return ctx.reply(`Schedule failed: ${res.error || 'unknown error'}`);
    return ctx.reply(
      `✅ Schedule created.\nSchedule: ${humanizeCron(res.schedule.cron)}\nWhat it does: Run ${rounds} loop round${rounds === 1 ? '' : 's'} on ${chipKey}\nNext: ${formatNextFireLocal(res.schedule.nextFireAt)}\nId: ${res.schedule.id}`
    );
  }
  return ctx.reply([
    `⚠️ Unknown schedule action '${action}'.`,
    '',
    'Use',
    '• mission',
    '• loop'
  ].join('\n'));
});

bot.command('schedules', async (ctx) => {
  if (!requireAdmin(ctx)) return;
  const raw = ctx.message.text.replace('/schedules', '').trim();
  const parts = raw.split(/\s+/).filter(Boolean);
  const sub = parts.shift()?.toLowerCase();
  if (sub === 'delete') {
    const id = parts.shift();
    if (!id) {
      return ctx.reply([
        '🗓️ Delete a schedule',
        '',
        'Use',
        '• /schedules delete <id>',
        '',
        'Find IDs',
        '• /schedules'
      ].join('\n'));
    }
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
    const runnerPreflight = await probeTelegramRunnerWritability();
    await ctx.reply([
      renderSparkAccessStatus(current),
      '',
      renderSparkAccessCapabilityStatus(current, runnerPreflight)
    ].join('\n'), buildSparkAccessActionKeyboard(current));
    return;
  }

  const next = normalizeSparkAccessProfile(raw);
  if (!next) {
    await ctx.reply('Choose an access level: /access 1 chat/memory/diagnostics, /access 2 requested builds, /access 3 public research plus builds, /access 4 sandboxed local projects, or /access 5 whole-computer operator mode.');
    return;
  }

  if (next === 'operator' && current === 'operator' && !accessLevelChangeConfirmed(raw)) {
    const runtimeGate = validateSparkAccessProfileForRuntime(next);
    if (runtimeGate.ok) {
      const reply = await renderLevel5ActivationAnswer(ctx.chat.id);
      await ctx.reply(reply);
      await conversation.rememberAssistantReply(ctx.from, reply).catch(() => {});
      return;
    }
  }

  if (next === 'operator' && !accessLevelChangeConfirmed(raw)) {
    await ctx.reply(renderSparkAccessLevel5ConfirmationPrompt(), buildSparkAccessLevel5ConfirmKeyboard());
    return;
  }

  await applySparkAccessProfileChange(ctx, next);
});

function accessLevelChangeConfirmed(raw: string): boolean {
  return /\bconfirm\b/i.test(raw);
}

async function isLevel5ServiceEnabled(): Promise<boolean> {
  try {
    const rawStatus = await runSparkCli(['access', 'status', '--level', '5', '--json'], 30_000);
    const payload = JSON.parse(rawStatus) as Record<string, unknown>;
    const level5 = objectRecord(payload.level5);
    const stateMachine = objectRecord(payload.state_machine);
    return level5.service_enabled === true || stateMachine.service_can_operate_whole_computer === true;
  } catch {
    return false;
  }
}

async function applySparkAccessProfileChange(ctx: any, next: SparkAccessProfile): Promise<void> {
  const runtimeGate = validateSparkAccessProfileForRuntime(next);
  if (!runtimeGate.ok) {
    if (next === 'operator') {
      await prepareLevel5AndApplyAccess(ctx);
      return;
    }
    await ctx.reply(runtimeGate.message);
    return;
  }

  const current = await getSparkAccessProfile(ctx.chat.id);
  let level5DisableResult: Awaited<ReturnType<typeof runSparkAccessActionDetailed>> | null = null;
  if (next !== 'operator' && (current === 'operator' || await isLevel5ServiceEnabled())) {
    level5DisableResult = await runSparkAccessActionDetailed('level5_disable');
    if (level5DisableResult.payload?.ok === false) {
      await ctx.reply(level5DisableResult.reply);
      return;
    }
  }

  await setSparkAccessProfile(ctx.chat.id, next);
  await conversation.learnAboutUser(ctx.from, `Spark access profile for this chat is ${next}. ${describeSparkAccessProfile(next)}`).catch(() => {});
  const baseReply = await renderSparkAccessChangeReply(next);
  const reply = level5DisableResult
    ? [
        baseReply,
        '',
        'I also disabled Level 5 service guardrails so Spark returns to the workspace sandbox.',
        level5DisableResult.needsSparkRestart ? formatSparkAccessAutomaticRestartNotice('level5_disable') : ''
      ].filter(Boolean).join('\n')
    : baseReply;
  await ctx.reply(reply, buildSparkAccessChangeKeyboard(next));
  await conversation.rememberAssistantReply(ctx.from, reply).catch(() => {});
  if (level5DisableResult?.needsSparkRestart) {
    scheduleSparkRestartAfterAccessChange();
  }
}

async function prepareLevel5AndApplyAccess(ctx: any): Promise<void> {
  await safeSendChatAction(ctx, 'typing');
  try {
    const result = await runSparkAccessActionDetailed('level5_enable');
    const ok = result.payload?.ok !== false;
    if (!ok) {
      await ctx.reply(result.reply);
      return;
    }

    await setSparkAccessProfile(ctx.chat.id, 'operator');
    await conversation.learnAboutUser(ctx.from, `Spark access profile for this chat is operator. ${describeSparkAccessProfile('operator')}`).catch(() => {});
    const reply = [
      'Access Level 5 is approved.',
      '',
      result.needsSparkRestart
        ? ['I prepared the local guardrails.', '', formatSparkAccessAutomaticRestartNotice('level5_enable')].join('\n')
        : await renderSparkAccessChangeReply('operator'),
    ].join('\n');
    await ctx.reply(reply);
    await conversation.rememberAssistantReply(ctx.from, reply).catch(() => {});
    if (result.needsSparkRestart) {
      scheduleSparkRestartAfterAccessChange();
    }
  } catch (error) {
    await ctx.reply([
      '⚠️ Access Level 5 setup could not run.',
      '',
      `Why: ${sparkCliFailureReason(error)}`,
      '',
      'Next move: run /diagnose, or complete Level 5 setup from the Spark CLI.'
    ].join('\n'));
  }
}

async function renderSparkAccessChangeReply(profile: SparkAccessProfile): Promise<string> {
  if (profile !== 'developer' && profile !== 'operator') {
    return renderSparkAccessChangeConfirmation(profile);
  }
  return renderSparkAccessChangeSummary(profile, await probeTelegramRunnerWritability());
}

async function handleSparkAccessAction(ctx: any, actionId: SparkAccessActionId, confirmed: boolean): Promise<void> {
  if (!requireAdmin(ctx)) return;

  if (accessActionNeedsConfirmation(actionId) && !confirmed) {
    await ctx.reply(formatSparkAccessActionConfirmationPrompt(actionId), buildSparkAccessConfirmationKeyboard(actionId));
    return;
  }

  await safeSendChatAction(ctx, 'typing');
  try {
    const result = await runSparkAccessActionDetailed(actionId);
    const reply = result.needsSparkRestart
      ? [result.reply, '', formatSparkAccessAutomaticRestartNotice(actionId)].join('\n')
      : result.reply;
    await ctx.reply(reply);
    await conversation.rememberAssistantReply(ctx.from, reply).catch(() => {});
    if (result.needsSparkRestart) {
      scheduleSparkRestartAfterAccessChange();
    }
  } catch (error) {
    await ctx.reply([
      `⚠️ ${sparkAccessActionLabel(actionId)} could not run.`,
      '',
      `Why: ${sparkCliFailureReason(error)}`,
      '',
      'Next move: run /diagnose, or run the same access action from the Spark CLI.'
    ].join('\n'));
  }
}

async function handleSparkAccessActionCommand(ctx: any, actionId: SparkAccessActionId): Promise<void> {
  const raw = String(ctx.message?.text || '');
  await handleSparkAccessAction(ctx, actionId, /\bconfirm\b/i.test(raw));
}

bot.command('access_setup', async (ctx) => handleSparkAccessActionCommand(ctx, 'workspace_setup'));
bot.command('docker_doctor', async (ctx) => handleSparkAccessActionCommand(ctx, 'docker_doctor'));
bot.command('docker_smoke', async (ctx) => handleSparkAccessActionCommand(ctx, 'docker_smoke'));
bot.command('level5_setup', async (ctx) => handleSparkAccessActionCommand(ctx, 'level5_enable'));
bot.command('level5_disable', async (ctx) => handleSparkAccessActionCommand(ctx, 'level5_disable'));

bot.action(/^spark_access:(workspace_setup|docker_doctor|docker_smoke|level5_enable|level5_disable)(?::(confirm))?$/, async (ctx) => {
  await ctx.answerCbQuery().catch(() => {});
  const match = String((ctx.callbackQuery as any)?.data || '').match(/^spark_access:(workspace_setup|docker_doctor|docker_smoke|level5_enable|level5_disable)(?::(confirm))?$/);
  if (!match) return;
  await handleSparkAccessAction(ctx, match[1] as SparkAccessActionId, match[2] === 'confirm');
});

bot.action(/^spark_access_level:operator:confirm$/, async (ctx) => {
  await ctx.answerCbQuery().catch(() => {});
  if (!requireAdmin(ctx)) return;
  await applySparkAccessProfileChange(ctx, 'operator');
});

async function handleAccessChangeRequest(ctx: any, raw: string): Promise<boolean> {
  if (!requireAdmin(ctx)) return true;

  const next = normalizeSparkAccessProfile(raw);
  if (!next) {
    await ctx.reply('Choose an access level: /access 1 chat/memory/diagnostics, /access 2 requested builds, /access 3 public research plus builds, /access 4 sandboxed local projects, or /access 5 whole-computer operator mode.');
    return true;
  }

  const current = await getSparkAccessProfile(ctx.chat.id);
  if (next === 'operator' && current === 'operator' && !accessLevelChangeConfirmed(raw)) {
    const runtimeGate = validateSparkAccessProfileForRuntime(next);
    if (runtimeGate.ok) {
      const reply = await renderLevel5ActivationAnswer(ctx.chat.id);
      await ctx.reply(reply);
      await conversation.rememberAssistantReply(ctx.from, reply).catch(() => {});
      return true;
    }
  }

  if (next === 'operator' && !accessLevelChangeConfirmed(raw)) {
    await ctx.reply(renderSparkAccessLevel5ConfirmationPrompt(), buildSparkAccessLevel5ConfirmKeyboard());
    return true;
  }

  await applySparkAccessProfileChange(ctx, next);
  return true;
}

function answerFromRememberTurns(text: string, turns: ReadonlyArray<{ role: string; text: string }>): string | null {
  if (extractPlainChatMemoryDirective(text)) {
    return null;
  }
  const normalized = text.toLowerCase().replace(/\s+/g, ' ').trim();
  const asksRememberedPreference =
    /\bwhat\b.*\bremember\b.*\b(?:prefer|preferred|preference|like|mission updates?|updates?)\b/.test(normalized) ||
    /\bwhat\b.*\b(?:prefer|preferred|preference)\b.*\bremember\b/.test(normalized);
  if (!asksRememberedPreference && !/\b(?:asked you to remember|told you to remember|session test code word|code word)\b/.test(normalized)) {
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
    if (asksRememberedPreference) {
      const userFacing = cleaned
        .replace(/^my\b/i, 'your')
        .replace(/^i\b/i, 'you');
      return `You told me ${userFacing}.`;
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

function buildSelectedListFastReply(frame: ConversationFrame): string | null {
  if (frame.referenceResolution.kind !== 'list_item' || !frame.referenceResolution.value) return null;
  const selected = frame.referenceResolution.value.trim();
  if (!selected) return null;
  return [
    `${selected} it is.`,
    '',
    'I am resolving that against the current list context, not older memory.',
    '',
    `For ${selected}, the next step is one tiny version: what happens, who uses it, and what counts as done.`
  ].join('\n');
}

function isShortResolvedListPick(text: string, frame: ConversationFrame): boolean {
  return frame.referenceResolution.kind === 'list_item' && text.trim().length <= 40;
}

function renderMissionUsage(): string {
  return [
    '🧭 Control a mission',
    '',
    'Use',
    '• /mission status <missionId>',
    '• /mission pause <missionId>',
    '• /mission resume <missionId>',
    '• /mission kill <missionId>',
    '',
    'Example',
    '• /mission status spark-1776768300668',
    '',
    'Tip',
    '• /board shows recent mission IDs.'
  ].join('\n');
}

bot.command('mission', async (ctx) => {
  if (!requireAdmin(ctx)) return;

  const args = ctx.message.text.replace('/mission', '').trim().split(/\s+/).filter(Boolean);
  if (args.length < 2) {
    return ctx.reply(renderMissionUsage());
  }

  const action = args[0] as 'status' | 'pause' | 'resume' | 'kill';
  const missionId = args[1];

  if (!['status', 'pause', 'resume', 'kill'].includes(action)) {
    return ctx.reply(renderMissionUsage());
  }

  if (missionId.includes('<') || missionId.includes('>')) {
    return ctx.reply('Use the real mission ID from /run or /creator, for example: /mission status spark-1776768300668');
  }

  if (!/^(?:spark|mission)-[A-Za-z0-9_-]+$/.test(missionId)) {
    return ctx.reply('Use a real mission ID from /board, for example: /mission status spark-1776768300668 or /mission status mission-creator-1776768300668');
  }

  const accessProfile = await getSparkAccessProfile(ctx.chat.id);
  if (!sparkAccessAllows(accessProfile, 'spawner_build')) {
    await ctx.reply(renderSparkAccessDenial(accessProfile, 'spawner_build'));
    return;
  }

  await safeSendChatAction(ctx, 'typing');
  const result = await spawner.missionCommand(action, missionId);
  if (result.success && action === 'kill') {
    markMissionRelayCancelled(missionId);
  }
  if (result.success && action === 'pause') {
    markMissionRelayPaused(missionId);
  }
  if (result.success && action === 'resume') {
    markMissionRelayResumed(missionId);
  }
  await ctx.reply(result.success ? result.message : `Mission command failed: ${result.message}`);
});

bot.hears(/^\/[A-Za-z0-9_-]+(?:@\w+)?(?:\s|$)/, async (ctx) => {
  const text = 'text' in (ctx.message || {}) ? String((ctx.message as any).text || '') : '';
  const command = text.match(/^\/([^\s@]+)/)?.[1] || 'that';
  await ctx.reply([
    `❔ Unknown command: /${command}.`,
    '',
    'Try',
    '• /status',
    '• /diagnose',
    '• /run <goal>',
    '',
    'For the current command list, send /start.'
  ].join('\n'));
});

// Handle regular text messages
export async function handleTextMessage(ctx: any): Promise<void> {
  const user = ctx.from;
  const text = ctx.message.text;

  if (text.startsWith('/')) {
    return;
  }

  const naturalRouteShadow = await recordNaturalRouteShadow(ctx, text);
  const globalAgentDoctrineRequest = isGlobalAgentDoctrineRequest(text);
  const earlyBrowserCapabilityIntent = !globalAgentDoctrineRequest ? classifyBrowserCapabilityQuestion(text) : null;
  const parsedEarlyBuildIntent = conversation.isAdmin(ctx.from) && !globalAgentDoctrineRequest && !earlyBrowserCapabilityIntent ? parseBuildIntent(text) : null;
  const earlyBuildIntent = parsedEarlyBuildIntent && deterministicRouteAllowed('spawner.build', text)
    ? parsedEarlyBuildIntent
    : null;
  const quotedOriginReply = buildQuotedMissionStatusOriginReply(text, quotedTelegramMessageText(ctx.message));
  if (!earlyBuildIntent && quotedOriginReply) {
    await conversation.remember(user, text).catch(() => {});
    await ctx.reply(quotedOriginReply);
    await conversation.rememberAssistantReply(user, quotedOriginReply).catch(() => {});
    return;
  }
  const latestOriginReply = !earlyBuildIntent && conversation.isAdmin(ctx.from)
    ? buildLatestAssistantOriginReply(text, pendingClarifications.get(`${ctx.chat.id}-${ctx.from.id}`) || null)
    : null;
  if (latestOriginReply) {
    await conversation.remember(user, text).catch(() => {});
    await ctx.reply(latestOriginReply);
    await conversation.rememberAssistantReply(user, latestOriginReply).catch(() => {});
    return;
  }

  if (globalAgentDoctrineRequest) {
    const reply = formatGlobalAgentDoctrineRequestReply(text);
    await conversation.remember(user, text).catch(() => {});
    recordNaturalRouteExecution(ctx, naturalRouteShadow, 'agent_doctrine.global_blocked', 'spark-telegram-bot', 'clarify');
    await ctx.reply(reply);
    await conversation.rememberAssistantReply(user, reply).catch(() => {});
    return;
  }

  if (
    !earlyBuildIntent &&
    !shouldAttachMemoryDoctorEvidence(text) &&
    isPendingTaskRecoveryQuestion(text) &&
    deterministicRouteAllowed('pending_task.recovery', text)
  ) {
    const pendingTask = await conversation.getPendingTaskRecovery(user);
    if (pendingTask) {
      const reply = renderPendingTaskRecoveryReply(pendingTask);
      await conversation.remember(user, text).catch(() => {});
      await ctx.reply(reply);
      await conversation.rememberAssistantReply(user, reply).catch(() => {});
      return;
    }
  }

  const naturalAccessChange = earlyBuildIntent ? null : parseNaturalAccessChangeIntent(text);
  if (naturalAccessChange && deterministicRouteAllowed('access.change', text)) {
    await conversation.remember(user, text).catch(() => {});
    await handleAccessChangeRequest(ctx, naturalAccessChange);
    return;
  }

  const conversationFrame = await conversation.getConversationFrame(user, text);
  let conversationFrameContext = renderConversationFrameContext(conversationFrame, 12_000);
  let freshRuntimeTruthContext = '';
  const attachFreshRuntimeTruthContext = async (): Promise<void> => {
    if (freshRuntimeTruthContext) return;
    freshRuntimeTruthContext = await buildFreshRuntimeTruthContext(text, ctx.chat.id);
    conversationFrameContext = [conversationFrameContext, freshRuntimeTruthContext].filter(Boolean).join('\n\n');
    recordTelegramSourceUsedEvidence(ctx, user, text, 'telegram_fresh_runtime_context', runtimeTruthSourceEvidence(text));
  };
  const frameAccessChange = !earlyBuildIntent && conversationFrame.referenceResolution.kind === 'access_level'
    ? conversationFrame.referenceResolution.value
    : null;
  if (frameAccessChange && deterministicRouteAllowed('access.change', text)) {
    await conversation.remember(user, text).catch(() => {});
    await handleAccessChangeRequest(ctx, frameAccessChange);
    return;
  }

  const recentAccessMessages = await conversation.getRecentMessages(user, 6);
  const contextualAccessChange = earlyBuildIntent || conversationFrame.referenceResolution.kind === 'list_item'
    ? null
    : parseContextualAccessChangeIntent(text, recentAccessMessages);
  if (contextualAccessChange && deterministicRouteAllowed('access.change', text)) {
    await conversation.remember(user, text).catch(() => {});
    await handleAccessChangeRequest(ctx, contextualAccessChange);
    return;
  }

  if (
    !earlyBuildIntent &&
    (isAccessCapabilityMismatchQuestion(text) || isContextualAccessCapabilityMismatchQuestion(text, recentAccessMessages))
  ) {
    await attachFreshRuntimeTruthContext();
  }

  if (!earlyBuildIntent && shouldAnswerRuntimeTruthPriority(text)) {
    await conversation.remember(user, text).catch(() => {});
    const reply = renderRuntimeTruthPriorityAnswer();
    await ctx.reply(reply);
    recordTelegramSourceUsedEvidence(ctx, user, text, 'telegram_runtime_truth_priority', [
      {
        source: 'current_user_message',
        role: 'latest_turn_authority',
        freshness: 'fresh',
        sourceRef: 'telegram current turn',
        summary: 'Telegram answered a source-priority question from the latest user turn and source hierarchy policy.'
      },
      {
        source: 'current_diagnostics',
        role: 'current_state_authority_policy',
        freshness: 'fresh',
        sourceRef: 'spark source hierarchy',
        summary: 'Fresh diagnostics and live probes outrank stale memory for current-state claims.'
      }
    ]);
    await conversation.rememberAssistantReply(user, reply).catch(() => {});
    return;
  }

  if (!earlyBuildIntent && shouldAnswerAuthoritativeAccessCapability(text)) {
    await conversation.remember(user, text).catch(() => {});
    const reply = await renderAuthoritativeSparkEditCapabilityAnswer(ctx.chat.id);
    await ctx.reply(reply);
    recordTelegramSourceUsedEvidence(ctx, user, text, 'telegram_access_capability_answer', runtimeTruthSourceEvidence(text));
    await conversation.rememberAssistantReply(user, reply).catch(() => {});
    return;
  }

  const browserCapabilityIntent = !earlyBuildIntent ? earlyBrowserCapabilityIntent : null;
  if (browserCapabilityIntent) {
    await conversation.remember(user, text).catch(() => {});
    await safeSendChatAction(ctx, 'typing');
    let reply = '';
    let actionPayload: Record<string, unknown> | null = null;
    if (browserCapabilityIntent.kind === 'task') {
      if (shouldRunFullBrowserUseTask(browserCapabilityIntent.goal || text)) {
        await replyWithBrowserTaskStartNotice(ctx, [
          'Browser-use full task started.',
          '',
          'I captured the request and will send the result here when the browser agent loop finishes.'
        ].join('\n'));
        actionPayload = await runBrowserUseTask(browserCapabilityIntent);
        if (shouldFallbackToBrowserUseReview(actionPayload, browserCapabilityIntent)) {
          const reviewPayload = await runBrowserUseReview(browserCapabilityIntent);
          if (reviewPayload.ok === true) {
            actionPayload = reviewPayload;
            reply = renderBrowserUseReviewAnswer(browserCapabilityIntent, actionPayload);
          } else {
            reply = renderBrowserUseTaskAnswer(browserCapabilityIntent, actionPayload);
          }
        } else {
          reply = renderBrowserUseTaskAnswer(browserCapabilityIntent, actionPayload);
        }
      } else {
        actionPayload = await runBrowserUseReview(browserCapabilityIntent);
        reply = renderBrowserUseReviewAnswer(browserCapabilityIntent, actionPayload);
      }
    } else if (browserCapabilityIntent.kind === 'specific_open' || browserCapabilityIntent.kind === 'specific_screenshot') {
      actionPayload = await runBrowserUseAction(browserCapabilityIntent);
      reply = renderBrowserUseActionAnswer(browserCapabilityIntent, actionPayload);
    } else {
      const result = await runBuilderRouteProbe('spark_browser');
      reply = renderBrowserCapabilityAnswer(browserCapabilityIntent, result.payload);
    }
    await ctx.reply(withCanonicalAliasNotice(ctx, reply));
    if ((browserCapabilityIntent.kind === 'specific_screenshot' || browserCapabilityIntent.kind === 'task') && actionPayload?.ok === true) {
      const screenshotPath = browserCapabilityIntent.kind === 'task'
        ? browserUseReceiptScreenshotPath(actionPayload)
        : String(actionPayload.screenshot_path || '').trim();
      if (screenshotPath) {
        await ctx.replyWithPhoto({ source: screenshotPath }).catch(() => {});
      }
    }
    recordTelegramSourceUsedEvidence(ctx, user, text, 'telegram_browser_capability_answer', runtimeTruthSourceEvidence(text));
    await conversation.rememberAssistantReply(user, reply).catch(() => {});
    return;
  }

  if (!earlyBuildIntent && shouldAnswerSparkRiskProfile(text)) {
    await conversation.remember(user, text).catch(() => {});
    const reply = await renderAuthoritativeSparkRiskProfileAnswer();
    await ctx.reply(reply);
    recordTelegramSourceUsedEvidence(ctx, user, text, 'telegram_spark_risk_profile_answer', runtimeTruthSourceEvidence(text));
    await conversation.rememberAssistantReply(user, reply).catch(() => {});
    return;
  }

  if (!earlyBuildIntent && shouldAnswerMemoryRuntimeSeparation(text)) {
    await conversation.remember(user, text).catch(() => {});
    const reply = await renderMemoryRuntimeSeparationAnswer();
    await ctx.reply(reply);
    recordTelegramSourceUsedEvidence(ctx, user, text, 'telegram_memory_runtime_boundary_answer', runtimeTruthSourceEvidence(text));
    await conversation.rememberAssistantReply(user, reply).catch(() => {});
    return;
  }

  if (!earlyBuildIntent && shouldAnswerRestartSurvivalQuestion(text)) {
    await conversation.remember(user, text).catch(() => {});
    const reply = await renderRestartSurvivalAnswer(ctx.chat.id);
    await ctx.reply(reply);
    recordTelegramSourceUsedEvidence(ctx, user, text, 'telegram_restart_survival_answer', runtimeTruthSourceEvidence(text));
    await conversation.rememberAssistantReply(user, reply).catch(() => {});
    return;
  }

  if (!earlyBuildIntent && shouldAnswerMissionProvenanceQuestion(text)) {
    await conversation.remember(user, text).catch(() => {});
    const reply = await renderMissionProvenanceAnswer(ctx, user);
    await ctx.reply(reply);
    recordTelegramSourceUsedEvidence(ctx, user, text, 'telegram_mission_provenance_answer', [
      {
        source: 'mission_trace',
        role: 'spawner_mission_provenance',
        freshness: 'fresh',
        sourceRef: 'telegram no-edit probe mission record',
        summary: 'Telegram answered from no-edit Spawner probe mission evidence when available.'
      }
    ]);
    await conversation.rememberAssistantReply(user, reply).catch(() => {});
    return;
  }

  if (!earlyBuildIntent && shouldAnswerAuthoritativeRuntimeStatus(text)) {
    await conversation.remember(user, text).catch(() => {});
    const reply = await renderAuthoritativeSparkLiveStateAnswer();
    await ctx.reply(reply);
    recordTelegramSourceUsedEvidence(ctx, user, text, 'telegram_live_state_answer', runtimeTruthSourceEvidence(text));
    await conversation.rememberAssistantReply(user, reply).catch(() => {});
    return;
  }

  if (!earlyBuildIntent && shouldAnswerAuthoritativeProviderStatus(text)) {
    await conversation.remember(user, text).catch(() => {});
    const reply = await renderAuthoritativeProviderRoutingAnswer();
    await ctx.reply(reply);
    recordTelegramSourceUsedEvidence(ctx, user, text, 'telegram_provider_routing_answer', runtimeTruthSourceEvidence(text));
    await conversation.rememberAssistantReply(user, reply).catch(() => {});
    return;
  }

  if (!earlyBuildIntent && shouldAttachFreshRuntimeTruthContext(text) && !conversationFrameContext.includes('Fresh Spark runtime truth for this turn')) {
    await attachFreshRuntimeTruthContext();
  }

  if (!earlyBuildIntent && isLiveSparkHealthQuestion(text)) {
    if (!conversationFrameContext.includes('Fresh Spark runtime truth for this turn')) {
      await attachFreshRuntimeTruthContext();
    }
  }

  if (!earlyBuildIntent && isSpawnerGoldenPathRequest(text)) {
    await conversation.remember(user, text).catch(() => {});
    const replyPhrase = extractNoEditMissionReplyPhrase(text);
    const missionId = await handleRunCommand(
      ctx,
      `Reply with exactly: ${replyPhrase}. Do not edit files. Do not create files. This is a no-edit Spawner golden-path health probe.`,
      [missionDefaultProvider()],
      'spawner_build',
      { missionName: 'Telegram Golden Path Probe' }
    );
    if (missionId) {
      const probeMission = {
        missionId,
        requestedPhrase: replyPhrase,
        startedAt: new Date().toISOString()
      };
      const key = noEditProbeKey(ctx);
      lastNoEditProbeMissions.set(key, probeMission);
      await storeNoEditProbeMission(key, probeMission).catch((error) => {
        const detail = error instanceof Error ? error.message : String(error);
        console.warn(`[NoEditProbe] failed to persist mission ${missionId}: ${redactText(detail)}`);
      });
      await conversation.learnAboutUser(user, `Started Spawner golden-path probe mission ${missionId} from Telegram; requested reply phrase is stored only in local probe state.`).catch(() => {});
    }
    return;
  }

  if (!earlyBuildIntent && isAccessHelpQuestion(text) && deterministicRouteAllowed('access.help', text)) {
    await conversation.remember(user, text).catch(() => {});
    const accessProfile = await getSparkAccessProfile(ctx.chat.id);
    const reply = renderSparkAccessConversationHelp(accessProfile);
    await ctx.reply(reply);
    await conversation.rememberAssistantReply(user, reply).catch(() => {});
    return;
  }
  const safeOperatorAction = earlyBuildIntent ? null : parseSafeOperatorAction(text);
  if (safeOperatorAction && deterministicRouteAllowed('operator.safe_action', text)) {
    await conversation.remember(user, text).catch(() => {});
    const accessProfile = await getSparkAccessProfile(ctx.chat.id);
    if (safeOperatorAction.kind === 'level5_smoke' && accessProfile !== 'operator') {
      await ctx.reply(renderSparkAccessDenial(accessProfile, 'operating_system'));
      return;
    }
    if (!sparkAccessAllows(accessProfile, 'operating_system')) {
      await ctx.reply(renderSparkAccessDenial(accessProfile, 'operating_system'));
      return;
    }
    await safeSendChatAction(ctx, 'typing');
    try {
      const reply = await runSafeOperatorAction(safeOperatorAction);
      await ctx.reply(reply);
      await conversation.rememberAssistantReply(user, reply).catch(() => {});
    } catch (err: any) {
      const reply = `Safe operator check failed: ${err?.message || String(err)}`;
      await ctx.reply(reply);
      await conversation.rememberAssistantReply(user, reply).catch(() => {});
    }
    return;
  }
  const activePendingClarification = conversation.isAdmin(ctx.from)
    ? pendingClarificationForMessage(`${ctx.chat.id}-${ctx.from.id}`, text)
    : null;
  if (
    activePendingClarification &&
    isPendingClarificationFollowup(text) &&
    deterministicRouteAllowed('spawner.pending_clarification', text)
  ) {
    recordNaturalRouteExecution(ctx, naturalRouteShadow, 'spawner.pending_clarification', 'spawner-ui', 'spawner.clarification_reply');
    await handleClarificationAnswers(ctx, text);
    return;
  }
  if (!earlyBuildIntent && conversation.isAdmin(ctx.from) && await handlePendingCreatorMissionControl(ctx, text)) {
    return;
  }
  if (!earlyBuildIntent && shouldPreferConversationalIdeation(text)) {
    console.log(`[ConversationIntent] early ideation route user=${ctx.from?.id} textLen=${text.length}`);
    await conversation.remember(user, text).catch(() => {});
    recordNaturalRouteExecution(ctx, naturalRouteShadow, 'conversation.ideation', 'spark-intelligence-builder', 'plain_chat.ideation');
    await safeSendChatAction(ctx, 'typing');
    if (isShortResolvedListPick(text, conversationFrame)) {
      const fastReply = buildSelectedListFastReply(conversationFrame);
      if (fastReply) {
        await ctx.reply(fastReply);
        await conversation.rememberAssistantReply(user, fastReply).catch(() => {});
        return;
      }
    }
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
  const earlyNaturalChipBrief = conversation.isAdmin(ctx.from) ? parseNaturalChipCreateIntent(text) : null;
  if (earlyNaturalChipBrief && deterministicRouteAllowed('domain_chip.create', text)) {
    await conversation.remember(user, text).catch(() => {});
    const mode = domainChipBuildModeForBrief(earlyNaturalChipBrief);
    pendingDomainChipBuilds.set(`${ctx.chat.id}-${ctx.from.id}`, {
      brief: earlyNaturalChipBrief,
      prd: buildDomainChipPrd(earlyNaturalChipBrief),
      projectName: projectNameForDomainChipBrief(earlyNaturalChipBrief),
      buildMode: mode.buildMode,
      buildModeReason: mode.reason,
      capabilityProposalPacket: buildDomainChipCapabilityProposalPacket(earlyNaturalChipBrief),
      timestamp: Date.now()
    });
    await ctx.reply(formatDomainChipBuildPreview(earlyNaturalChipBrief));
    return;
  }
  const naturalCreatorIntent = conversation.isAdmin(ctx.from) ? parseNaturalCreatorMissionIntent(text) : null;
  if (naturalCreatorIntent && deterministicRouteAllowed('creator.mission', text)) {
    await conversation.remember(user, text).catch(() => {});
    await ctx.reply(`Planning ${naturalCreatorIntent.artifactLabel} creator mission...`);
    await handleCreatorMissionPlan(ctx, naturalCreatorIntent);
    return;
  }
  const naturalRecursiveProposal = earlyBuildIntent ? null : parseNaturalRecursiveProposalIntent(text);
  if (naturalRecursiveProposal && conversation.isAdmin(ctx.from) && deterministicRouteAllowed('recursive.proposal', text)) {
    await conversation.remember(user, text).catch(() => {});
    const submitArg = naturalRecursiveProposal.submit ? ' submit' : '';
    await handleRecursiveCommand(ctx, `propose ${naturalRecursiveProposal.target}${submitArg}`);
    return;
  }
  if (!earlyBuildIntent && isSparkChipStatusOverclaimQuestion(text)) {
    await conversation.remember(user, text).catch(() => {});
    await safeSendChatAction(ctx, 'typing');
    try {
      const result = await runBuilderSelfAwarenessStatus({
        userId: user.id,
        chatId: ctx.chat.id,
        currentMessage: text,
      });
      await ctx.reply(result.replyText);
      await conversation.rememberAssistantReply(user, result.replyText).catch(() => {});
    } catch (err: any) {
      const reply = renderSparkChipStatusBoundaryFallbackReply();
      await ctx.reply(reply);
      await conversation.rememberAssistantReply(user, reply).catch(() => {});
    }
    return;
  }
  const memoryDirective = earlyBuildIntent ? null : extractPlainChatMemoryDirective(text);
  if (memoryDirective && deterministicRouteAllowed('memory.write', text)) {
    await handlePlainChatMemoryDirective(ctx, user, text, memoryDirective);
    return;
  }
  const selfImprovementGoal = earlyBuildIntent ? null : extractSparkSelfImprovementGoal(text);
  if (selfImprovementGoal && deterministicRouteAllowed('spark.self_improvement', text)) {
    await conversation.remember(user, text).catch(() => {});
    await safeSendChatAction(ctx, 'typing');
    try {
      const result = await runBuilderSelfImprovementPlan({
        userId: user.id,
        chatId: ctx.chat.id,
        currentMessage: text,
        goal: selfImprovementGoal,
      });
      await ctx.reply(result.replyText);
      await conversation.rememberAssistantReply(user, result.replyText).catch(() => {});
    } catch (err: any) {
      await ctx.reply(renderSparkErrorReply(err, 'builder', conversation.isAdmin(ctx.from)));
    }
    return;
  }
  const wikiPromotion = earlyBuildIntent ? null : extractSparkWikiPromotionIntent(text);
  if (wikiPromotion) {
    await conversation.remember(user, text).catch(() => {});
    await safeSendChatAction(ctx, 'typing');
    try {
      const result = await runBuilderWikiPromoteImprovement({
        title: wikiPromotion.title,
        summary: wikiPromotion.summary,
        status: wikiPromotion.status,
        evidenceRefs: [`telegram:${String(ctx.chat.id)}:${String((ctx.message as any)?.message_id || 'unknown')}`],
        sourceRefs: [`telegram:user:${String(user.id)}`],
        nextProbe: 'Run the relevant Spark probe, test, or trace check before treating this note as current truth.',
        invalidationTrigger: 'Downgrade this note if newer live traces, tests, or source docs contradict it.',
      });
      await ctx.reply(result.replyText);
      await conversation.rememberAssistantReply(user, result.replyText).catch(() => {});
    } catch (err: any) {
      await ctx.reply(renderSparkErrorReply(err, 'builder', conversation.isAdmin(ctx.from)));
    }
    return;
  }
  if (!earlyBuildIntent && isSparkWikiInventoryQuestion(text)) {
    await conversation.remember(user, text).catch(() => {});
    await safeSendChatAction(ctx, 'typing');
    try {
      const result = await runBuilderWikiInventory({ refresh: true, limit: 12 });
      await ctx.reply(result.replyText);
      await conversation.rememberAssistantReply(user, result.replyText).catch(() => {});
    } catch (err: any) {
      await ctx.reply(renderSparkErrorReply(err, 'builder', conversation.isAdmin(ctx.from)));
    }
    return;
  }
  const wikiAnswerQuestion = earlyBuildIntent ? null : extractSparkWikiAnswerQuestion(text);
  if (wikiAnswerQuestion) {
    await conversation.remember(user, text).catch(() => {});
    await safeSendChatAction(ctx, 'typing');
    try {
      const result = await runBuilderWikiAnswer({
        question: wikiAnswerQuestion,
        refresh: true,
        limit: 5,
        userId: user.id,
        chatId: ctx.chat.id,
        currentMessage: text,
      });
      await ctx.reply(result.replyText);
      await conversation.rememberAssistantReply(user, result.replyText).catch(() => {});
    } catch (err: any) {
      await ctx.reply(renderSparkErrorReply(err, 'builder', conversation.isAdmin(ctx.from)));
    }
    return;
  }
  const wikiQuery = earlyBuildIntent ? null : extractSparkWikiQuery(text);
  if (wikiQuery) {
    await conversation.remember(user, text).catch(() => {});
    await safeSendChatAction(ctx, 'typing');
    try {
      const result = await runBuilderWikiQuery({ query: wikiQuery, refresh: true, limit: 5 });
      await ctx.reply(result.replyText);
      await conversation.rememberAssistantReply(user, result.replyText).catch(() => {});
    } catch (err: any) {
      await ctx.reply(renderSparkErrorReply(err, 'builder', conversation.isAdmin(ctx.from)));
    }
    return;
  }
  if (!earlyBuildIntent && isSparkWikiStatusQuestion(text)) {
    await conversation.remember(user, text).catch(() => {});
    await safeSendChatAction(ctx, 'typing');
    try {
      const result = await runBuilderWikiStatus({ refresh: true });
      await ctx.reply(result.replyText);
      await conversation.rememberAssistantReply(user, result.replyText).catch(() => {});
    } catch (err: any) {
      await ctx.reply(renderSparkErrorReply(err, 'builder', conversation.isAdmin(ctx.from)));
    }
    return;
  }
  const recentRememberedAnswer = earlyBuildIntent ? null : answerFromRememberTurns(text, [
    ...conversationFrame.hotTurns.filter((turn) => turn.role === 'user' || turn.role === 'assistant'),
    ...await conversation.getRecentTurns(user, 40)
  ]);
  if (recentRememberedAnswer) {
    await conversation.remember(user, text).catch(() => {});
    await ctx.reply(recentRememberedAnswer);
    await conversation.rememberAssistantReply(user, recentRememberedAnswer).catch(() => {});
    return;
  }

  const choiceContextAcknowledgement = earlyBuildIntent ? null : renderChoiceContextAcknowledgement(text);
  if (choiceContextAcknowledgement) {
    await conversation.remember(user, text).catch(() => {});
    await ctx.reply(choiceContextAcknowledgement);
    await conversation.rememberAssistantReply(user, choiceContextAcknowledgement).catch(() => {});
    return;
  }

  if (!earlyBuildIntent) {
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
  }

  // Natural-language project-build intent: "build a ...", "make me a ...", etc.
  // Routes to Spawner UI's PRD bridge so the canvas auto-loads and Spark can
  // execute the project with the selected build mode.
  if (conversation.isAdmin(ctx.from)) {
    const recentMessages = await conversation.getRecentMessages(user, 8);
    const sessionContext = await conversation.getContext(user, text);
    const contextualTurns = [...recentMessages, sessionContext, conversationFrameContext];
    const buildIntent = earlyBuildIntent;
    const pendingClarification = pendingClarificationForMessage(`${ctx.chat.id}-${ctx.from.id}`, text);

    // Build intent gets first refusal inside the admin lane. Utility helpers can
    // still extract preferences from the same prompt, but they must not stop a
    // detailed project brief from becoming a mission.
    if (pendingClarification && isPendingClarificationFollowup(text)) {
      await handleClarificationAnswers(ctx, text);
      return;
    }

    const latestShippedProject = await getLatestShippedProjectContext(ctx.chat.id);
    if (
      isProjectImprovementRequest(text, latestShippedProject) &&
      deterministicRouteAllowed('spawner.project_iteration', text)
    ) {
      const improvementGoal = buildProjectImprovementGoal(text, latestShippedProject, contextualTurns);
      if (improvementGoal && latestShippedProject) {
        await conversation.remember(user, text).catch(() => {});
        await ctx.reply([
          `Got it. I will improve ${latestShippedProject.projectName}.`,
          '',
          'I will keep the existing project intact and ship this as the next polish pass.',
          latestShippedProject.previewUrl ? `Current preview: ${latestShippedProject.previewUrl}` : null
        ].filter(Boolean).join('\n'));
        await handleBuildIntent(
          ctx,
          improvementGoal,
          `${latestShippedProject.projectName} polish ${latestShippedProject.iteration + 1}`,
          latestShippedProject.projectPath,
          'advanced_prd',
          'User gave feedback on the latest shipped project, so Spark is improving the existing app instead of starting a new one.'
        );
        return;
      }
    }

    if (buildIntent) {
      console.log(`[BuildIntent] route user=${ctx.from?.id} project=${JSON.stringify(buildIntent.projectName).slice(0, 80)}`);
      const accessPreference = parseNaturalAccessChangeIntent(text);
      const normalizedAccessPreference = accessPreference ? normalizeSparkAccessProfile(accessPreference) : null;
      if (normalizedAccessPreference) {
        const runtimeGate = validateSparkAccessProfileForRuntime(normalizedAccessPreference);
        if (!runtimeGate.ok) {
          await ctx.reply(runtimeGate.message);
          return;
        }
        await setSparkAccessProfile(ctx.chat.id, normalizedAccessPreference);
      }
      const buildPreference = parseMissionUpdatePreferenceIntent(text, { allowExecutionLanguage: true });
      if (buildPreference?.verbosity) {
        await setTelegramRelayVerbosity(ctx.chat.id, buildPreference.verbosity);
      }
      if (buildPreference?.links) {
        await setTelegramMissionLinkPreference(ctx.chat.id, buildPreference.links);
      }
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

    if (isLocalWorkspaceInspectionOnlyRequest(text) && deterministicRouteAllowed('local_workspace.inspect', text)) {
      const accessProfile = await getSparkAccessProfile(ctx.chat.id);
      if (!sparkAccessAllows(accessProfile, 'operating_system')) {
        await ctx.reply(renderSparkAccessDenial(accessProfile, 'operating_system'));
        return;
      }
      await conversation.remember(user, text).catch(() => {});
      await safeSendChatAction(ctx, 'typing');
      try {
        const summary = await summarizeLocalWorkspaces();
        const reply = renderLocalWorkspaceInspectionReply(summary);
        await ctx.reply(reply);
        await conversation.rememberAssistantReply(user, reply).catch(() => {});
      } catch (error) {
        const detail = error instanceof Error ? error.message : String(error);
        await conversation.recordInterruptedTask(user, {
          message: text,
          failure: detail,
          stage: 'local_workspace_inspection'
        }).catch(() => {});
        await ctx.reply(`Local workspace inspection failed: ${detail}`);
      }
      return;
    }

    if (deterministicRouteAllowed('domain_chip.pending', text) && await handlePendingDomainChipBuild(ctx, text)) {
      await conversation.remember(user, text).catch(() => {});
      return;
    }

    if (pendingClarification && !buildIntent && deterministicRouteAllowed('spawner.pending_clarification', text)) {
      await handleClarificationAnswers(ctx, text);
      return;
    }

    const defaultBuild = inferDefaultBuildFromRecentScoping(text, recentMessages);
    if (defaultBuild && deterministicRouteAllowed('spawner.default_build', text)) {
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
    if (missionUpdatePreference && deterministicRouteAllowed('mission_updates.preference', text)) {
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
    if (naturalChipBrief && deterministicRouteAllowed('domain_chip.create', text)) {
      await conversation.remember(user, text).catch(() => {});
      const mode = domainChipBuildModeForBrief(naturalChipBrief);
      pendingDomainChipBuilds.set(`${ctx.chat.id}-${ctx.from.id}`, {
        brief: naturalChipBrief,
        prd: buildDomainChipPrd(naturalChipBrief),
        projectName: projectNameForDomainChipBrief(naturalChipBrief),
        buildMode: mode.buildMode,
        buildModeReason: mode.reason,
        capabilityProposalPacket: buildDomainChipCapabilityProposalPacket(naturalChipBrief),
        timestamp: Date.now()
      });
      await ctx.reply(formatDomainChipBuildPreview(naturalChipBrief));
      return;
    }

    const spawnerBoardIntent = parseSpawnerBoardNaturalIntent(text);
    if (spawnerBoardIntent && deterministicRouteAllowed('spawner.board', text)) {
      const accessProfile = await getSparkAccessProfile(ctx.chat.id);
      if (!sparkAccessAllows(accessProfile, 'spawner_build')) {
        await ctx.reply(renderSparkAccessDenial(accessProfile, 'spawner_build'));
        return;
      }

      await conversation.remember(user, text).catch(() => {});
      await safeSendChatAction(ctx, 'typing');
      if (spawnerBoardIntent === 'latest_provider') {
        try {
          await runSparkCli(['os', 'compile', '--json'], 90_000);
          const gate = await runBuilderRouteConfidenceGate({
            intent: 'status',
            candidateRoute: 'spawner.latest_job_provider',
          });
          await ctx.reply(formatRouteConfidenceGateReply(gate.payload));
        } catch (error) {
          await ctx.reply(
            [
              'I cannot prove the latest Spawner provider yet.',
              '',
              'State',
              '- Missing: fresh Spark OS trace plus Builder RouteConfidenceGate evidence',
              `- Detail: ${redactText(error instanceof Error ? error.message : String(error || 'unknown error'))}`,
              '',
              'Next',
              '- Run /board or /diagnose, then ask again.'
            ].join('\n')
          );
        }
        return;
      }
      const result = spawnerBoardIntent === 'latest_on_kanban'
          ? await spawner.latestKanbanSummary()
          : spawnerBoardIntent === 'latest_project_preview'
            ? await spawner.latestProjectPreview()
          : await spawner.board();
      await ctx.reply(result.success ? result.message : `Board failed: ${result.message}`);
      return;
    }

    if (isLocalSparkServiceRequest(text, localServiceContext) && deterministicRouteAllowed('spawner.local_service', text)) {
      await conversation.remember(user, text).catch(() => {});
      await ctx.reply(buildLocalSparkServiceReply(await spawner.isAvailable()));
      return;
    }

    if (isAmbiguousLocalSparkServiceRequest(text, localServiceContext) && deterministicRouteAllowed('spawner.local_service', text)) {
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

    if (isDiagnosticFollowupTestQuestion(text) && deterministicRouteAllowed('diagnostics.followup_test', text)) {
      const reply = buildDiagnosticFollowupTestReply(sessionContext);
      if (reply) {
        await conversation.remember(user, text).catch(() => {});
        await ctx.reply(reply);
        return;
      }
    }

    if (isDiagnosticsScanRequest(text) && deterministicRouteAllowed('diagnostics.scan', text)) {
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

    if (isExplicitContextualBuildRequest(text) && deterministicRouteAllowed('spawner.contextual_improvement', text)) {
      const improvementGoal = buildContextualImprovementGoal(text, contextualTurns);
      if (improvementGoal) {
        console.log(`[ConversationIntent] inferred contextual improvement mission user=${ctx.from?.id} textLen=${text.length}`);
        await conversation.remember(user, text).catch(() => {});
        const missionId = await handleRunCommand(ctx, improvementGoal, [missionDefaultProvider()], undefined, {
          missionName: 'Spark Diagnostic Agent Integration'
        });
        if (missionId) {
          await conversation.learnAboutUser(user, `Started Spawner mission ${missionId} to improve the Spark Diagnostic Agent integration from Telegram context.`).catch(() => {});
        }
        return;
      }
    }

    if (isExternalResearchRequest(text) && deterministicRouteAllowed('spawner.external_research', text)) {
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

    const inferredMission = inferMissionFromRecentContext(text, recentMessages);
    if (inferredMission && deterministicRouteAllowed('spawner.contextual_mission', text)) {
      console.log(`[ConversationIntent] inferred mission from follow-up user=${ctx.from?.id} textLen=${text.length}`);
      await conversation.remember(user, text).catch(() => {});
      const missionId = await handleRunCommand(ctx, inferredMission.goal, [missionDefaultProvider()], undefined, {
        missionName: inferredMission.missionName
      });
      if (missionId) {
        await conversation.learnAboutUser(user, `Started Spawner mission ${missionId} from Telegram follow-up: ${inferredMission.goal.slice(0, 220)}`).catch(() => {});
      }
      return;
    }

    await conversation.remember(user, text).catch(() => {});

    if (shouldPreferConversationalIdeation(text)) {
      console.log(`[ConversationIntent] ideation route user=${ctx.from?.id} textLen=${text.length}`);
      await safeSendChatAction(ctx, 'typing');
      if (isShortResolvedListPick(text, conversationFrame)) {
        const fastReply = buildSelectedListFastReply(conversationFrame);
        if (fastReply) {
          await ctx.reply(fastReply);
          await conversation.rememberAssistantReply(user, fastReply).catch(() => {});
          return;
        }
      }
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
    if (intent && deterministicRouteAllowed('natural_run', text)) {
      await handleRunCommand(ctx, intent.goal, intent.providers);
      return;
    }
  }

  // Show typing indicator
  await safeSendChatAction(ctx, 'typing');

  try {
    const memoryDoctorEvidenceTurns = shouldAttachMemoryDoctorEvidence(text)
      ? selectMemoryDoctorEvidenceTurns(text, await conversation.getRecentTurns(user, 8).catch(() => []))
      : [];
    await conversation.remember(user, text).catch(() => {});
    if (memoryDoctorEvidenceTurns.length > 0 && shouldPreferMemoryDoctorEvidenceFallback(text, memoryDoctorEvidenceTurns)) {
      const fallback = renderMemoryDoctorEvidenceFallback(text, memoryDoctorEvidenceTurns);
      await ctx.reply(fallback);
      await conversation.rememberAssistantReply(user, fallback).catch(() => {});
      return;
    }

    const hasFreshRuntimeTruth = Boolean(freshRuntimeTruthContext);
    let bridgeFailed = false;
    let builderReply: Awaited<ReturnType<typeof runBuilderTelegramBridge>> = {
      used: false,
      responseText: '',
      decision: '',
      bridgeMode: '',
      routingDecision: ''
    };
    if (!hasFreshRuntimeTruth) {
      try {
        const bridgeUpdate = memoryDoctorEvidenceTurns.length > 0
          ? buildUpdateWithText(
              ctx.update as unknown as Record<string, unknown>,
              buildMemoryDoctorEvidencePrompt(text, memoryDoctorEvidenceTurns)
            )
          : ctx.update as unknown as Record<string, unknown>;
        builderReply = await runBuilderTelegramBridge(bridgeUpdate);
      } catch (bridgeError) {
        bridgeFailed = true;
        console.warn('[Bridge] local chat fallback after bridge error:', bridgeError);
      }
    }
    console.log(`[Bridge] user=${ctx.from?.id} used=${builderReply.used} mode=${builderReply.bridgeMode} routing=${builderReply.routingDecision} textLen=${(builderReply.responseText || '').length} hasVoice=${Boolean(builderReply.voiceMedia)}`);
    if (builderReply.used && builderReply.bridgeMode !== 'bridge_error') {
      if (memoryDoctorEvidenceTurns.length > 0 && isMemoryDoctorBridgeDetourReply(builderReply.responseText)) {
        const fallback = renderMemoryDoctorEvidenceFallback(text, memoryDoctorEvidenceTurns);
        await ctx.reply(fallback);
        await conversation.rememberAssistantReply(user, fallback).catch(() => {});
        return;
      }
      const contradictsResolvedList = conversationFrame.referenceResolution.kind === 'list_item' &&
        /\b(?:no prior list|what are you choosing between|which one|which option)\b/i.test(builderReply.responseText);
      const suppressionReason = contradictsResolvedList
        ? 'contradicts_resolved_list'
        : builderReplySuppressionReason(builderReply.responseText, builderReply.routingDecision);
      if (!suppressionReason && !shouldSuppressBuilderReplyForPlainChat(builderReply.responseText, builderReply.routingDecision)) {
        await deliverBuilderReply(ctx, builderReply);
        if (builderReply.responseText) {
          await conversation.rememberAssistantReply(user, builderReply.responseText).catch(() => {});
        }
        return;
      }
      recordFinalAnswerGateSuppression({
        chatId: ctx.chat?.id,
        userId: ctx.from?.id,
        suppressionReason: suppressionReason || 'plain_chat_suppression',
        builderRoutingDecision: builderReply.routingDecision,
        builderBridgeMode: builderReply.bridgeMode,
        builderReply: builderReply.responseText,
        requestId: builderReply.requestId,
        traceRef: builderReply.traceRef,
        fallbackRoute: 'local_chat'
      });
      console.warn(`[Bridge] ignored non-chat Builder reply routing=${builderReply.routingDecision}`);
    }

    // Get context from previous memories
    const storedMemoryContext = await conversation.getContext(user, text);
    const memories = freshRuntimeTruthContext
      ? [freshRuntimeTruthContext, conversationFrameContext, storedMemoryContext].filter(Boolean).join('\n\n')
      : [storedMemoryContext, conversationFrameContext].filter(Boolean).join('\n\n');
    const accessProfile = await getSparkAccessProfile(ctx.chat.id);

    const chatPrompt = buildSelectedListReferencePrompt(conversationFrame) || text;
    const systemContext = [
      renderSparkAccessRuntimeHint(accessProfile),
      freshRuntimeTruthContext
        ? [
            'Authoritative current-state context for this answer:',
            freshRuntimeTruthContext,
            'Use the authoritative current-state context above as the highest-priority source for current state. Do not contradict it with memory or older Builder capsules.'
          ].join('\n')
        : ''
    ].filter(Boolean).join('\n\n');

    // Get LLM response with Spark context
    const response = await llm.chat(chatPrompt, systemContext, memories);

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

export async function handleVoiceMessage(ctx: any): Promise<void> {
  const user = ctx.from;
  const startedAt = Date.now();

  await conversation.remember(user, '[voice message]').catch(() => {});
  const rememberedAt = Date.now();
  await safeSendChatAction(ctx, 'typing');

  try {
    const bridgeUpdate = await buildVoiceBridgeUpdate(ctx);
    const mediaReadyAt = Date.now();
    const builderReply = await runBuilderTelegramBridge(bridgeUpdate);
    const builderReadyAt = Date.now();
    const voiceTiming = builderReply.voiceTiming && Object.keys(builderReply.voiceTiming).length
      ? ` voiceTiming=${JSON.stringify(builderReply.voiceTiming)}`
      : '';
    console.log(`[VoiceBridge] user=${ctx.from?.id} used=${builderReply.used} mode=${builderReply.bridgeMode} routing=${builderReply.routingDecision} textLen=${(builderReply.responseText || '').length} hasVoice=${Boolean(builderReply.voiceMedia)}${voiceTiming}`);

    if (builderReply.used && builderReply.bridgeMode !== 'bridge_error' && (builderReply.responseText || builderReply.voiceMedia)) {
      await deliverBuilderReply(ctx, builderReply);
      const deliveredAt = Date.now();
      console.log(
        `[VoiceBridgeTiming] user=${ctx.from?.id} remember_ms=${rememberedAt - startedAt} media_ms=${mediaReadyAt - rememberedAt} builder_ms=${builderReadyAt - mediaReadyAt} deliver_ms=${deliveredAt - builderReadyAt} total_ms=${deliveredAt - startedAt}`
      );
      if (builderReply.responseText) {
        await conversation.rememberAssistantReply(user, builderReply.responseText).catch(() => {});
      }
      return;
    }

    const fallback = 'I received the voice note, but Spark did not return a transcription or voice reply. Run `/voice`, then try one short voice note again.';
    await ctx.reply(fallback);
    await conversation.recordInterruptedTask(user, {
      message: '[voice message]',
      failure: `Builder voice bridge returned no usable response. mode=${builderReply.bridgeMode || 'none'} routing=${builderReply.routingDecision || 'none'}`,
      stage: 'telegram_voice_handler'
    }).catch(() => {});
  } catch (err) {
    console.error('Voice handling error:', err);
    const detail = err instanceof Error ? err.message : String(err);
    await conversation.recordInterruptedTask(user, {
      message: '[voice message]',
      failure: detail,
      stage: 'telegram_voice_handler'
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
bot.on(message('voice'), handleVoiceMessage);
bot.on(message('audio'), handleVoiceMessage);

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
  setMissionRelayRuntimeStatus({
    telegramPolling: TELEGRAM_SMOKE_MODE ? 'disabled' : 'starting',
    pollingStartedAt: null
  });
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
  console.log(`Mission relay: ${getTelegramRelayIdentity().url || `http://127.0.0.1:${relay.port}/spawner-events`}`);
  if (TELEGRAM_SMOKE_MODE) {
    console.log('Telegram smoke mode: local relay is running; Telegram API calls are disabled.');
    return;
  }

  await ensurePollingReady();
  const launchPromise = bot.launch();
  const launchProbe = await Promise.race([
    launchPromise.then(
      () => ({ status: 'settled' as const }),
      (error) => ({ status: 'failed' as const, error })
    ),
    wait(TELEGRAM_POLLING_READY_GRACE_MS).then(() => ({ status: 'running' as const }))
  ]);
  if (launchProbe.status === 'failed') {
    throw launchProbe.error;
  }
  if (launchProbe.status === 'settled') {
    throw new Error('Telegram polling stopped during startup.');
  }
  pollingActive = true;
  setMissionRelayRuntimeStatus({
    telegramPolling: 'active',
    pollingStartedAt: new Date().toISOString()
  });
  console.log('Spark bot is running in polling mode. Press Ctrl+C to stop.');
  void launchPromise.catch((err) => {
    void releaseGatewayOwnership();
    console.error('Telegram polling stopped:', err);
    process.exit(1);
  });
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
