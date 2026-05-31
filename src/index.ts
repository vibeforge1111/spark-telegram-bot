import 'dotenv/config';
import { config as loadEnv } from 'dotenv';
import { execFile } from 'node:child_process';
import { appendFile, mkdir } from 'node:fs/promises';
import { createHash, randomUUID } from 'node:crypto';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
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
  runBuilderAocPreflight,
  formatMemoryInPlaySummary,
  runBuilderAgentBlackBox,
  runBuilderAgentOperatingContext,
  runBuilderConversationColdContext,
  runBuilderDiagnosticsScan,
  runBuilderRouteConfidenceGate,
  runBuilderRouteProbe,
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
import { applyPlainWordsSurfaceRequest } from './telegramSurface';
import { installConsoleRedaction, redactIdentifier, redactText } from './redaction';
import { readJsonFile } from './jsonState';
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
import { packageSpecializationPathLoop, readSpecializationPathLoopInsights, readSpecializationPathLoopStatus, resolveRecursiveStartTarget, runSpecializationPathAutoloop } from './pathLoop';
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
  renderSpecializationLoopComparison,
  renderSpecializationLoopEvidence,
  renderSpecializationLoopStatus,
  renderSpecializationLoopInsights,
  renderSpecializationLoopPackage,
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
  renderSparkAccessBriefStatus,
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
import { parseBuildIntent, polishBuildProjectName, type BuildLane } from './buildIntent';
import { parseSafeOperatorAction, runSafeOperatorAction } from './operatorActions';
import { evaluateDeterministicRoute, type DeterministicRouteId } from './routeFirewall';
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
  isAccessStatusQuestion,
  isBuildContextRecallQuestion,
  isUserMemoryRecallQuestion,
  isDiagnosticFollowupTestQuestion,
  isDiagnosticsScanRequest,
  isMissionExecutionConfirmation,
  isAmbiguousLocalSparkServiceRequest,
  isExternalResearchRequest,
  isExplicitContextualBuildRequest,
  isGlobalAgentDoctrineRequest,
  isMissionRoutingFailureClassQuestion,
  isNoExecutionBoundary,
  isSparkChipStatusOverclaimQuestion,
  isSparkThreadQaGoldenCaseRequest,
  isSparkWorkflowBugHuntRequest,
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
  renderMissionRoutingFailureClassReply,
  renderSparkThreadQaGoldenCaseReply,
  renderSparkWorkflowBugHuntReply,
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
import { describeTier, getTierForUser, type SkillTier } from './userTier';
import { acquireGatewayOwnership, releaseGatewayOwnership } from './gatewayOwnership';
import { requireRelaySecret, resolveTelegramLaunchConfig } from './launchMode';
import { renderSparkErrorReply } from './errorExplain';
import {
  resolveWindowsCommand,
  windowsCmdShimArgs,
  windowsPowerShellShimArgs,
  withHiddenWindows
} from './hiddenProcess';
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

function renderTelegramError(prefix: string, error: unknown): string {
  const raw = error instanceof Error ? error.message : String(error || 'unknown error');
  const detail = redactText(raw).trim() || 'unknown error';
  return `${prefix}: ${detail}`;
}

async function runSparkCli(args: string[], timeoutMs = 30_000): Promise<string> {
  const resolvedCommand = resolveWindowsCommand('spark');
  const [command, commandArgs] = process.platform === 'win32' && /\.(cmd|bat)$/i.test(resolvedCommand)
    ? [process.env.ComSpec || 'cmd.exe', windowsCmdShimArgs(resolvedCommand, args)]
    : process.platform === 'win32' && /\.ps1$/i.test(resolvedCommand)
      ? ['powershell.exe', windowsPowerShellShimArgs(resolvedCommand, args)]
      : [resolvedCommand, args];
  const { stdout, stderr } = await execFileAsync(
    command,
    commandArgs,
    withHiddenWindows({
      timeout: timeoutMs,
      maxBuffer: 1024 * 1024,
    })
  );
  return redactText([stdout, stderr].map((value) => String(value || '').trim()).filter(Boolean).join('\n'));
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
  currentMessage: string,
  selectedRoute: string,
  evidence: TelegramSourceUsedEvidence[],
  confidence = 'high'
): void {
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
  const explicitlyStopsExecution = /\b(?:do\s+not|don't|dont|no\s+need\s+to|without)\s+(?:start|run|launch|queue|dispatch|execute)\b/.test(normalized);
  if (explicitlyStopsExecution) return false;

  const mentionsNoEditProbe =
    /\bno[-\s]*edit\b/.test(normalized) &&
    /\bspawner\b/.test(normalized) &&
    /\b(?:run|start|launch|queue|execute|through)\b/.test(normalized) &&
    (
      /\bmission\s+control\b/.test(normalized) ||
      /\bdiagnostic\b/.test(normalized) ||
      /\brepl(?:y|ies)\s+with\b/.test(normalized) ||
      /\bspark_[a-z0-9_]{4,}\b/.test(normalized)
    );

  return (
    /\bgolden[_\s-]*path\b/.test(normalized) ||
    (/\btiny mission\b/.test(normalized) && /\bspawner\b/.test(normalized)) ||
    (/\b(?:golden_path_ok|spark_qa_no_edit_ok|spark_e2e_[a-z0-9_]+)\b/.test(normalized) && /\bspawner\b/.test(normalized)) ||
    mentionsNoEditProbe
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

function extractNoEditProbeWaitSeconds(text: string): number | null {
  const waitMatch = text.match(/\b(?:wait|waiting)\s+(?:about\s+|around\s+|for\s+)?(\d{1,2})\s*(?:seconds?|secs?)\b/i);
  if (!waitMatch) return null;
  const seconds = Number(waitMatch[1]);
  if (!Number.isFinite(seconds) || seconds < 5) return null;
  return Math.min(seconds, 60);
}

function noEditProbeGoal(replyPhrase: string, originalText: string): string {
  const waitSeconds = extractNoEditProbeWaitSeconds(originalText);
  const waitInstruction = waitSeconds
    ? ` Before replying, wait about ${waitSeconds} seconds so Mission Control can show a running state.`
    : '';
  return `Reply with exactly: ${replyPhrase}.${waitInstruction} Do not edit files. Do not create files. This is a no-edit Spawner golden-path health probe.`;
}

function compactSparkLiveOutput(output: string): string {
  return output
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !/^Useful:/i.test(line) && !/^spark live /i.test(line))
    .slice(0, 18)
    .join('\n');
}

type SparkLiveSummary = {
  liveReady: boolean;
  spawnerOk: boolean;
  telegramOk: boolean;
  spawnerText: string;
  telegramText: string;
  profilesText: string;
  rolesText: string;
  supervisionText: string;
};

function cleanSparkStatusLine(line: string, label: string): string {
  return line
    .replace(new RegExp(`^\\[OK\\]\\s+${label}:\\s*`, 'i'), '')
    .replace(/\s*\|\s*/g, ' | ')
    .replace(/\s+/g, ' ')
    .trim();
}

function parseSparkLiveSummary(liveStatus: string, deepVerify: string): SparkLiveSummary {
  const spawnerLine = firstMatchingLine(liveStatus, /\[OK\]\s+spawner-ui|spawner-ui:/i);
  const telegramLine = firstMatchingLine(liveStatus, /\[OK\]\s+spark-telegram-bot|spark-telegram-bot:/i);
  const profilesLine = firstMatchingLine(liveStatus, /Telegram profiles:/i);
  const rolesLine = firstMatchingLine(liveStatus, /LLM roles:/i);
  const supervised = deepVerify.match(/Runtime processes are running under Spark supervision:\s*([^\n]+)/i)?.[1]?.trim() || '';
  const liveReady = /\[OK\]\s+Spark Live is ready/i.test(liveStatus);
  const spawnerOk = /\[OK\]\s+spawner-ui/i.test(spawnerLine);
  const telegramOk = /\[OK\]\s+spark-telegram-bot/i.test(telegramLine);
  const spawnerProviderBits = spawnerLine.match(/(\d+\s+providers listed).*?(\d+\s+configured)/i);
  const spawnerWorkspace = spawnerLine.match(/workspace=([^|]+)/i)?.[1]?.trim();
  const telegramRuntime = telegramLine.match(/\(([^)]*polling=active[^)]*)\)/i)?.[1]?.trim();
  return {
    liveReady,
    spawnerOk,
    telegramOk,
    spawnerText: spawnerOk
      ? [
          spawnerProviderBits ? `${spawnerProviderBits[1]}, ${spawnerProviderBits[2]}` : 'healthy',
          spawnerWorkspace ? `workspace ${spawnerWorkspace}` : ''
        ].filter(Boolean).join('; ')
      : (spawnerLine ? cleanSparkStatusLine(spawnerLine, 'spawner-ui') : 'not reported by live status'),
    telegramText: telegramOk
      ? (telegramRuntime ? `polling active (${telegramRuntime.replace(/\s+/g, ' ')})` : 'polling active')
      : (telegramLine ? cleanSparkStatusLine(telegramLine, 'spark-telegram-bot') : 'not reported by live status'),
    profilesText: profilesLine.replace(/^Telegram profiles:\s*/i, '').trim(),
    rolesText: rolesLine.replace(/^LLM roles:\s*/i, '').trim(),
    supervisionText: supervised.replace(/\.+$/, '')
  };
}

function renderSparkLiveSummary(
  summary: SparkLiveSummary,
  opts: { restartGuidance?: boolean; rawDetails?: boolean; includeAction?: boolean; sourceDisclosure?: boolean } = {}
): string {
  const healthy = summary.liveReady && summary.spawnerOk && summary.telegramOk;
  const includeAction = opts.includeAction ?? true;
  const lines: string[] = [
    healthy ? '✅ Spark is healthy right now.' : '⚠️ Spark needs attention right now.'
  ];

  if (opts.sourceDisclosure) {
    lines.push('', "I'm using fresh runtime state here, not memory.");
  }

  lines.push(
    '',
    'Live loop',
    `• Spawner: ${summary.spawnerOk ? 'reachable' : 'needs attention'}.`,
    `• Telegram: ${summary.telegramOk ? 'polling' : 'needs attention'}.`,
    `• Mission Control: ${summary.liveReady ? 'ready' : 'not fully ready'}.`
  );

  if (opts.rawDetails) {
    lines.push(
      '',
      'Raw proof',
      `• Spawner: ${summary.spawnerText}.`,
      `• Telegram: ${summary.telegramText}.`,
      summary.profilesText ? `• Profiles: ${summary.profilesText}.` : '',
      summary.rolesText ? `• Models: ${summary.rolesText}.` : '',
      summary.supervisionText ? `• Supervision: ${summary.supervisionText}.` : ''
    );
  }

  if (includeAction) {
    lines.push(
      '',
      healthy
        ? (opts.restartGuidance
            ? 'No restart needed. Restarting now would mostly add churn.'
            : 'No repair action needed right now.')
        : (opts.restartGuidance
            ? 'Do not blindly restart. Start or restart only after confirming which supervised surface is down.'
            : 'Next step: repair the unhealthy surface, then rerun this fresh check.')
    );
  }
  return lines.join('\n').replace(/\n{3,}/g, '\n\n').trim();
}

function shouldShowRawSparkLiveDetails(text: string): boolean {
  return /\b(?:raw|debug|details?|pids?|pid|provider|providers|models?|supervision|exact|full)\b/i.test(text);
}

async function renderAuthoritativeSparkLiveStatus(
  opts: { restartGuidance?: boolean; rawDetails?: boolean; includeAction?: boolean } = {}
): Promise<string> {
  try {
    const [liveStatus, deepVerify] = await Promise.all([
      runSparkCli(['live', 'status'], 45_000),
      runSparkCli(['verify', '--deep'], 90_000).catch((error) => `verify_failed: ${error instanceof Error ? error.message : String(error)}`)
    ]);
    return renderSparkLiveSummary(parseSparkLiveSummary(liveStatus, deepVerify), opts);
  } catch (error) {
    const detail = redactText(error instanceof Error ? error.message : String(error));
    return [
      'Spark Live Health',
      '',
      'I could not run the authoritative local Spark CLI health check from this Telegram runtime.',
      `Error: ${detail}`,
      '',
      'This means this runner could not probe local Spark health. It does not prove Spawner or Telegram are offline.'
    ].join('\n');
  }
}

function firstMatchingLine(output: string, pattern: RegExp): string {
  return output
    .split(/\r?\n/)
    .map((line) => line.trim())
    .find((line) => pattern.test(line)) || '';
}

async function renderAuthoritativeSparkLiveStateAnswer(
  opts: { restartGuidance?: boolean; rawDetails?: boolean; includeAction?: boolean } = {}
): Promise<string> {
  try {
    const [liveStatus, deepVerify] = await Promise.all([
      runSparkCli(['live', 'status'], 45_000),
      runSparkCli(['verify', '--deep'], 90_000).catch((error) => `verify_failed: ${error instanceof Error ? error.message : String(error)}`)
    ]);
    return renderSparkLiveSummary(parseSparkLiveSummary(liveStatus, deepVerify), {
      ...opts,
      sourceDisclosure: true
    });
  } catch (error) {
    const detail = redactText(error instanceof Error ? error.message : String(error));
    return [
      'Current live state: unknown.',
      '',
      'I could not run `spark live status` from this Telegram runtime.',
      `Error: ${detail}`,
      '',
      'This is a probe failure, not proof that Spawner or Telegram are down.'
    ].join('\n');
  }
}

function shouldAnswerRestartNeededQuestion(text: string): boolean {
  const normalized = text.toLowerCase().replace(/\s+/g, ' ').trim();
  return /\brestart\b/.test(normalized) && /\b(?:needed|need|recommend|should|improve|healthy|right now)\b/.test(normalized);
}

async function renderRestartNeededAnswer(): Promise<string> {
  try {
    const [liveStatus, deepVerify] = await Promise.all([
      runSparkCli(['live', 'status'], 45_000),
      runSparkCli(['verify', '--deep'], 90_000).catch((error) => `verify_failed: ${error instanceof Error ? error.message : String(error)}`)
    ]);
    return renderSparkLiveSummary(parseSparkLiveSummary(liveStatus, deepVerify), { restartGuidance: true });
  } catch (error) {
    const detail = redactText(error instanceof Error ? error.message : String(error));
    return [
      'I cannot prove whether restart is needed from this Telegram runtime.',
      '',
      `Fresh check failed: ${detail}`,
      '',
      'So I will not recommend restart from stale memory.'
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
      'Fresh check:',
      `• Live stack: ${liveReady ? 'ready' : 'not fully ready'}.`,
      `• Spawner: ${spawnerOk ? 'OK' : 'not proven OK'}.`,
      `• Telegram: ${telegramOk ? 'OK' : 'not proven OK'}.`,
      `• Providers: ${providersOk ? 'OK by provider status' : 'not fully proven by provider status'}.`,
      '',
      risk === 'low'
        ? 'Main risk now is regression or drift from future changes, not a current outage. I did not start a mission or repair action.'
        : 'At least one surface needs attention before trusting execution. I did not start a mission or repair action.'
    ].join('\n');
  } catch (error) {
    const detail = redactText(error instanceof Error ? error.message : String(error));
    return [
      'Current Spark risk profile: unknown.',
      '',
      `Fresh risk check failed: ${detail}`,
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
    const rawStatus = await runSparkCli(['access', 'status', '--json'], 30_000);
    const payload = JSON.parse(rawStatus) as Record<string, unknown>;
    const level5 = objectRecord(payload.level5);
    const stateMachine = objectRecord(payload.state_machine);
    const effective = payload.effective_access_level ?? stateMachine.effective_access_level ?? 'unknown';
    const requested = stateMachine.requested_access_level ?? payload.access_level ?? 'unknown';
    const activation = String(level5.activation_state || stateMachine.activation_state || 'unknown');
    const serviceEnabled = level5.service_enabled === true || stateMachine.service_can_operate_whole_computer === true;
    const stateMachineWholeComputer = stateMachine.can_operate_whole_computer === true ||
      stateMachine.effective_access_level === 5 ||
      payload.effective_access_level === 5;
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
      serviceEnabled && chatProfile === 'operator' && stateMachineWholeComputer
        ? 'Verdict: whole-computer operator mode is active, with destructive/secret/publish safety checks still on.'
        : serviceEnabled && chatProfile === 'operator'
          ? `Verdict: chat is set to Level ${chatLevel} and Level 5 service guardrails are active, but plain CLI effective access is Level ${effective}. Treat whole-computer work as service-lane only until the execution route proves Level 5 for this turn.`
        : serviceEnabled
          ? `Verdict: Level 5 service guardrails are active, but this chat is set to Access level ${chatLevel}. Use /access 5 to enter operator mode, or /access 4 to return services to the workspace sandbox.`
        : `Verdict: chat is set to Level ${sparkAccessLevel(chatProfile)}, but whole-computer Level 5 is not active. Effective local work is Level ${effective}.`
    ].join('\n');
  } catch (error) {
    const detail = redactText(error instanceof Error ? error.message : String(error));
    return [
      'Spark Access Status',
      '',
      `Chat setting: Access level ${sparkAccessLevel(chatProfile)}.`,
      'CLI effective access: unavailable.',
      `Error: ${detail}`,
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
    const detail = redactText(error instanceof Error ? error.message : String(error));
    return [
      'I cannot prove whole-computer file access from current Spark access state.',
      '',
      `Access check failed: ${detail}`,
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
    'Fresh runtime state wins.',
    '',
    'If fresh `spark live status` says Spawner is up, Spawner is up right now. Memory becomes stale context, not current truth.'
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
      'Durable config and memory can survive restart. Live capability is only trusted after these fresh checks pass.'
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
    /\b(?:did|whether|can\s+you\s+tell)\b.*\bspawner\s+mission\b/.test(normalized) ||
    /\b(?:create|created|start|started|spawn|spawned|launch|launched)\b.*\bspawner\s+mission\b/.test(normalized) ||
    /\b(?:ran|run|routed)\s+through\s+spawner\b/.test(normalized) ||
    /\bjust\s+through\s+chat\b/.test(normalized)
  );
}

function isSpecificChatPromptMissionQuestion(text: string): boolean {
  const normalized = text.toLowerCase().replace(/\s+/g, ' ').trim();
  const asksMissionCreation = (
    /\b(?:did|whether|can\s+you\s+tell|answer)\b.*\b(?:create|created|start|started|spawn|spawned|launch|launched)\b.*\b(?:spawner\s+)?mission\b/.test(normalized) ||
    /\b(?:create|created|start|started|spawn|spawned|launch|launched)\b.*\bspawner\s+mission\b/.test(normalized)
  );
  const specificPrompt = /\b(?:route[-\s]*gate|qa\s+prompt|last\s+(?:prompt|turn|message)|that\s+(?:prompt|turn|message)|previous\s+(?:prompt|turn|message))\b/.test(normalized) ||
    /\b(?:last|previous|that)\s+['"`]?go['"`]?\b/.test(normalized);
  return asksMissionCreation && specificPrompt;
}

async function renderMissionProvenanceAnswer(ctx: any, user: any): Promise<string> {
  const key = noEditProbeKey(ctx);
  const latestProbe = lastNoEditProbeMissions.get(key) || await readNoEditProbeMission(key).catch(() => null);
  const recentMessages = await conversation.getRecentMessages(user, 12).catch(() => []);
  const recentText = recentMessages.join('\n');
  const messageText = ctx.message?.text || '';
  if (isSpecificChatPromptMissionQuestion(messageText)) {
    const normalizedQuestion = messageText.toLowerCase().replace(/\s+/g, ' ').trim();
    const lastGoQuestion = /\b(?:last|previous|that)\s+['"`]?go['"`]?\b/.test(normalizedQuestion);
    const routeGateEvidence = /\bRoute:\s*chat\s+QA\s*\/\s*route[-\s]*gate\b/i.test(recentText) ||
      /\bno mission,\s*no setup,\s*no access change,\s*no repair\b/i.test(recentText);
    const clearedGoEvidence = /\bnot seeing an active build or mission waiting\b/i.test(recentText) ||
      /\bno build or mission started\b/i.test(recentText) ||
      /\bno build.*mission started\b/i.test(recentText);
    return [
      routeGateEvidence
        ? 'No. The route-gate QA prompt stayed in chat.'
        : clearedGoEvidence
          ? 'No. The last `go` stayed in chat.'
          : lastGoQuestion
            ? 'I do not see proof that the last `go` created a Spawner mission.'
        : 'I do not see proof that the specific QA prompt created a mission.',
      '',
      'Evidence',
      routeGateEvidence
        ? '• The recent assistant reply classified it as chat QA / route-gate advisory.'
        : clearedGoEvidence
          ? '• The recent assistant reply said there was no active build or mission waiting.'
        : '• The recent thread does not show a fresh mission id tied to that prompt.',
      latestProbe
        ? `• Latest recorded no-edit Spawner probe is \`${latestProbe.missionId}\` for \`${latestProbe.requestedPhrase}\`.`
        : '• I do not have a recorded no-edit Spawner probe newer than that prompt.',
      '',
      routeGateEvidence
        ? 'A chat route-gate answer should not count as Spawner execution unless Spark returns a fresh mission id for that exact turn.'
        : lastGoQuestion
          ? 'A chat `go` only counts as Spawner execution when Spark returns a fresh mission id for that exact turn.'
          : 'A chat answer should not count as Spawner execution unless Spark returns a fresh mission id for that exact turn.'
    ].join('\n');
  }
  if (latestProbe) {
    return [
      'Yes. The latest no-edit probe was routed through Spawner, not just chat.',
      '',
      `Evidence: Telegram created Spawner mission \`${latestProbe.missionId}\` for the requested reply \`${latestProbe.requestedPhrase}\` at ${latestProbe.startedAt}.`,
      'A plain chat answer would not have a Spawner mission id.'
    ].join('\n');
  }
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
    /\b(?:raw|debug|details?|full|exact)\b.*\b(?:live|health|status|state)\b/.test(normalized) ||
    /\b(?:live|health|status|state)\b.*\b(?:raw|debug|details?|full|exact)\b/.test(normalized) ||
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
    /\b(?:raw|debug|details?|full|exact)\b.*\b(?:live|health|status|state)\b/.test(normalized) ||
    /\b(?:live|health|status|state)\b.*\b(?:raw|debug|details?|full|exact)\b/.test(normalized) ||
    isLiveSparkHealthQuestion(text) ||
    /\bcurrent\s+(?:live\s+)?(?:state|status)\s+of\s+spark\b/.test(normalized) ||
    /\bcurrent\s+spark\s+(?:state|status)\b/.test(normalized) ||
    /\bwhat\s+is\s+(?:the\s+)?(?:current\s+)?live\s+state\b/.test(normalized) ||
    /\b(?:is|are)\s+(?:spawner|telegram|spark|systems?|stack)\b.*\b(?:healthy|running|online|up|live|supervised)\b/.test(normalized) ||
    /\b(?:spawner|telegram)\b.*\b(?:healthy|running|supervised|stopped|offline|online|up|down)\b/.test(normalized)
  );
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

function naturalRecursiveRawCommand(decision: NaturalRouteDecision | null): string | null {
  if (!decision || decision.action !== 'recursive.command') return null;
  const rawCommand = decision.payload?.rawCommand;
  return typeof rawCommand === 'string' && rawCommand.trim() ? rawCommand.trim() : null;
}

function naturalRecursiveStatusTarget(rawCommand: string): string | null {
  const match = rawCommand.trim().match(/^status\s+(.+)$/i);
  return match?.[1]?.trim() || null;
}

function labelForTelegram(value: string): string {
  return String(value || '')
    .replace(/^path:/, '')
    .replace(/^path[_-]/, '')
    .replace(/[_-]+/g, ' ')
    .replace(/\b\w/g, (match) => match.toUpperCase())
    .trim() || 'specialization';
}

async function handleNaturalRecursiveRoute(
  ctx: any,
  user: any,
  text: string,
  decision: NaturalRouteDecision | null
): Promise<boolean> {
  if (!conversation.isAdmin(ctx.from)) return false;
  const rawCommand = naturalRecursiveRawCommand(decision);
  if (!rawCommand) return false;

  await conversation.remember(user, text).catch(() => {});

  if (/^start\b/i.test(rawCommand)) {
    recordNaturalRouteExecution(ctx, decision, 'recursive.start_confirmation_required', 'spark-telegram-bot', 'clarify');
    const target = rawCommand.replace(/^start\s+/i, '').replace(/\s+rounds\s+\d+\s*$/i, '').trim();
    const reply = target
      ? `I can run the ${labelForTelegram(target)} loop, but that starts benchmark work. Use \`/recursive ${rawCommand}\` when you want the run to actually begin.`
      : 'I can run that loop, but it starts benchmark work. Use the explicit `/recursive start <target> rounds <n>` command when you want it live.';
    await ctx.reply(reply);
    await conversation.rememberAssistantReply(user, reply).catch(() => {});
    return true;
  }

  recordNaturalRouteExecution(ctx, decision, decision?.route || 'recursive.command', 'spark-telegram-bot', 'recursive.command');

  const statusTarget = naturalRecursiveStatusTarget(rawCommand);
  if (statusTarget) {
    await safeSendChatAction(ctx, 'typing');
    const target = await resolveRecursiveStartTarget(statusTarget);
    if (target.kind !== 'path') {
      const reply = `${statusTarget} does not look like an attached specialization path yet. Use /recursive paths to pick a loop.`;
      await ctx.reply(reply);
      await conversation.rememberAssistantReply(user, reply).catch(() => {});
      return true;
    }
    const reply = renderSpecializationLoopStatus(await readSpecializationPathLoopStatus(target), {
      style: 'conversational'
    });
    await ctx.reply(reply);
    await conversation.rememberAssistantReply(user, reply).catch(() => {});
    return true;
  }

  await handleRecursiveCommand(ctx, rawCommand);
  return true;
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

function previewAuditText(text: string, limit = 240): string {
  const normalized = text.replace(/\s+/g, ' ').trim();
  return normalized.length > limit ? `${normalized.slice(0, limit - 1)}...` : normalized;
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

function chatRef(chatId: unknown): string {
  return redactIdentifier(String(chatId ?? ''), 'chat');
}

function userRef(userId: unknown): string {
  return redactIdentifier(String(userId ?? ''), 'user');
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
    builder_reply_preview: previewAuditText(input.builderReply, 180),
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

interface LatestCanvasPlanTask {
  title: string;
  skills: string[];
}

interface LatestCanvasPlan {
  projectName: string;
  taskCount: number | null;
  tasks: LatestCanvasPlanTask[];
	tier: SkillTier;
  readyCanvasUrl: string;
  recordedAt: string;
}

const latestCanvasPlans = new Map<string, LatestCanvasPlan>();

function noEditProbeKey(ctx: any): string {
  return `${ctx.chat?.id ?? 'unknown'}-${ctx.from?.id ?? 'unknown'}`;
}

function canvasPlanKey(chatId: string | number | undefined, userId: string | number | undefined): string {
  return `${chatId ?? 'unknown'}-${userId ?? 'unknown'}`;
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
  buildLane?: BuildLane;
  buildLaneReason?: string;
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

function clearPendingExecutionState(key: string): boolean {
  const hadClarification = pendingClarifications.delete(key);
  const hadDomainChip = pendingDomainChipBuilds.delete(key);
  const hadCreatorMission = pendingCreatorMissions.delete(key);
  return hadClarification || hadDomainChip || hadCreatorMission;
}

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
  const responseText = applyPlainWordsSurfaceRequest(text, builderReply.responseText);
  await deliverBuilderReply(ctx, { ...builderReply, responseText });
  if (user && responseText) {
    await conversation.rememberAssistantReply(user, responseText).catch(() => {});
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

function formatLocalMemoryDirectiveAcknowledgement(directive: string): string {
  return `Saved in Telegram memory: ${directive.replace(/[.!?]+$/g, '').trim()}.`;
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
    console.log(`[Bridge] user=${userRef(ctx.from?.id)} used=${builderReply.used} mode=${builderReply.bridgeMode} routing=${builderReply.routingDecision} textLen=${(builderReply.responseText || '').length}`);
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
    ? formatLocalMemoryDirectiveAcknowledgement(directive)
    : buildMemoryBridgeUnavailableReply('remember');
  await ctx.reply(reply);
  await conversation.rememberAssistantReply(user, reply).catch(() => {});
}

async function saveSlashRememberLocally(user: any, text: string): Promise<boolean> {
  try {
    await conversation.remember(user, `remember this: ${text}`);
    await conversation.learnAboutUser(user, `User asked Spark to remember: ${text}`);
    return true;
  } catch (error) {
    console.warn('[SlashRemember] local memory save failed:', error);
    return false;
  }
}

async function buildLocalRecallReply(user: any, query: string): Promise<string | null> {
  try {
    const memories = await conversation.recall(user, query, 1);
    const memory = memories[0];
    if (!memory?.content) return null;
    return `I remember this: ${memory.content.replace(/[.!?]+$/g, '').trim()}.`;
  } catch (error) {
    console.warn('[SlashRecall] local recall failed:', error);
    return null;
  }
}

function extractNaturalLocalMemoryRecallQuery(text: string): string | null {
  if (extractPlainChatMemoryDirective(text)) return null;
  const decided = text.match(/\bwhat\s+did\s+we\s+decide\s+about\s+(.+?)(?:[?.!]|$)/i)?.[1]?.trim();
  if (decided) {
    return decided
      .replace(/\b(?:keep\s+it|and\s+keep\s+it|please\s+keep\s+it)\b[\s\S]*$/i, '')
      .replace(/\b(?:do\s+not|don't)\s+run\b[\s\S]*$/i, '')
      .trim();
  }
  return isUserMemoryRecallQuestion(text) ? text : null;
}

async function buildNaturalLocalMemoryRecallReply(user: any, text: string): Promise<string | null> {
  const query = extractNaturalLocalMemoryRecallQuery(text);
  if (!query) return null;
  return buildLocalRecallReply(user, query);
}

export async function handleRememberCommand(ctx: any): Promise<void> {
  const text = ctx.message.text.replace('/remember', '').trim();

  if (!text) {
    return ctx.reply('Usage: /remember <something to remember>');
  }

  try {
    const missionLessonReply = await approvePendingMissionLesson(ctx.from.id, text);
    if (missionLessonReply) {
      await ctx.reply(missionLessonReply);
      return;
    }
    const localSaved = await saveSlashRememberLocally(ctx.from, text);
    if (await replyViaBuilder(ctx, `Please remember this: ${text}`)) {
      return;
    }
    await ctx.reply(localSaved ? formatLocalMemoryDirectiveAcknowledgement(text) : buildMemoryBridgeUnavailableReply('remember'));
  } catch (err) {
    console.error('Failed to remember:', err);
    await ctx.reply(renderSparkErrorReply(err, 'memory', conversation.isAdmin(ctx.from)));
  }
}

export async function handleRecallCommand(ctx: any): Promise<void> {
  const query = ctx.message.text.replace('/recall', '').trim();

  if (!query) {
    return ctx.reply('Usage: /recall <topic to recall>');
  }

  try {
    const localRecall = await buildLocalRecallReply(ctx.from, query);
    if (localRecall) {
      await ctx.reply(localRecall);
      await conversation.rememberAssistantReply(ctx.from, localRecall).catch(() => {});
      return;
    }
    if (await replyViaBuilder(ctx, `What do you remember about ${query}?`)) {
      return;
    }
    await ctx.reply(buildMemoryBridgeUnavailableReply('recall'));
  } catch (err) {
    console.error('Failed to recall:', err);
    await ctx.reply(renderSparkErrorReply(err, 'memory', conversation.isAdmin(ctx.from)));
  }
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
      '/creator plan <brief> - Plan a creator mission for a chip/path/benchmark/autoloop',
      '/creator run <missionId> - Execute a planned creator mission',
      '/creator status <missionId> - Show creator mission readiness and validation state',
      '/creator validate <missionId> [maxCommands] - Run creator validation gates',
      '/workspaces - Show local project folders',
      '/model - Show or change Agent/Mission model routing',
      '/models - Show recommended model versions',
      '/wiki - Check Spark LLM wiki health; use /wiki pages for vault inventory',
      '/context - Show Agent Operating Context',
      '/black_box - Show compact agent black-box trace counts',
      '/trace_repair - Show trace health repair summary',
      '/memory_movement - Show memory movement summary',
      '/probe <route> - Run a route probe and record AOC evidence',
      '/operating_context or /agent_context - Same, Telegram-safe aliases',
      '/conversation_context - Show conversation-frame diagnostics',
      '/updates <minimal|normal|verbose> - Tune live mission updates',
      '/access <1|2|3|4|5> - Choose what this Telegram chat can do',
      '/access_setup - Set up the safe Level 4 workspace from Telegram',
      '/docker_doctor - Check Docker sandbox readiness without changing the computer',
      '/docker_smoke confirm - Run the no-secret Docker sandbox smoke',
      '/access 5 - Approve Level 5 setup from Telegram',
      '/mission <status|pause|resume|kill> <missionId> - Control a mission'
    );
  }

  lines.push('', 'Or just chat!');
  if (!builderBridge.available) {
    lines.push('', 'Builder memory bridge unavailable; local fallback may be used.');
  }

  await ctx.reply(lines.join('\n'));
  if (onboardingSession) {
    await recordTelegramFirstMessage({
      event: 'telegram_first_message',
      session: onboardingSession,
      replied: true,
      ts: new Date().toISOString(),
      chat_id: chatRef(ctx.chat?.id),
      user_id: userRef(user.id),
      profile: process.env.SPARK_TELEGRAM_PROFILE || 'default'
    }).catch((error) => {
      console.warn('[Onboarding] failed to write first-message event:', error);
    });
  }
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
  const liveSummary = isAdmin
    ? await renderAuthoritativeSparkLiveStatus({
        rawDetails: shouldShowRawSparkLiveDetails('text' in (ctx.message || {}) ? String((ctx.message as any).text || '') : ''),
        includeAction: false
      })
    : '';
  const lines = [
    liveSummary || (builderBridge.available ? '✅ Spark is ready.' : '⚠️ Spark needs attention.'),
    '',
    'Core',
    `• Memory bridge: ${builderBridge.available ? 'online' : 'offline'}.`,
    '• Launch core: online.'
  ];
  if (isAdmin) {
    lines.push('• Access: admin.');
    recordTelegramSourceUsedEvidence(
      ctx,
      ctx.from,
      '/status',
      'telegram_status_command',
      runtimeTruthSourceEvidence('spark live status access providers memory')
    );
  }
  if (liveSummary) {
    lines.push(
      '',
      liveSummary.startsWith('✅')
        ? 'No repair action needed right now.'
        : 'Next step: repair the unhealthy surface, then rerun this fresh check.'
    );
  }

  await ctx.reply(lines.join('\n').replace(/\n{3,}/g, '\n\n').trim());
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
   const requestId = opaqueTelegramRequestId('tg-status');
  const traceRef = telegramRunTraceRef(requestId);
  await ctx.reply(lines.join('\n').replace(/\n{3,}/g, '\n\n').trim());
  recordCommandReplyDelivery({
    command: 'status',
    replyKind: 'status_reply',
    requestId,
    traceRef
  });
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
    const requestId = opaqueTelegramRequestId('tg-context');
    const traceRef = telegramRunTraceRef(requestId);
    await ctx.reply([result.replyText, memorySummary].filter(Boolean).join('\n\n'));
    recordCommandReplyDelivery({
      command: 'context',
      replyKind: 'context_reply',
      requestId,
      traceRef
    });
  } catch (err: any) {
    await ctx.reply(renderSparkErrorReply(err, 'builder', conversation.isAdmin(ctx.from)));
  }
}

async function handleAgentBlackBoxCommand
  if (!requireAdmin(ctx)) return;
  await safeSendChatAction(ctx, 'typing');
  try {
    const text = 'text' in (ctx.message || {}) ? String((ctx.message as any).text || '') : '';
    const arg = text.replace(/^\/(?:black_box|blackbox|black-box)(?:@\w+)?\s*/i, '').trim();
    if (/^(?:help|usage)$/i.test(arg)) {
      await ctx.reply([
        'Agent black box',
        'Usage: /black_box [request_id]',
        '',
        'This shows compact event evidence only. It does not promote memory or grant authority.'
      ].join('\n'));
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
    await ctx.reply(result.replyText);
  } catch (err: any) {
    await ctx.reply(renderSparkErrorReply(err, 'builder', conversation.isAdmin(ctx.from)));
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
    'Route probe',
    'Usage: /probe <route>',
    'Batch: /probe core or /probe all',
    '',
    'Routes:',
    '- core',
    '- all',
    '- builder',
    '- spawner',
    '- memory',
    '- researcher',
    '- swarm',
    '- browser',
    '- local_work',
  ].join('\n');
}

function aocProbeSummaryLine(routeKey: string, payload: Record<string, unknown>): string {
  const label = AOC_ROUTE_LABELS[routeKey] || routeKey;
  const status = String(payload.status || 'unknown').trim() || 'unknown';
  const latency = typeof payload.route_latency_ms === 'number' ? `, ${payload.route_latency_ms}ms` : '';
  const failure = String(payload.failure_reason || '').trim();
  const summary = String(payload.probe_summary || failure || '').trim();
  const evidence = summary ? ` - ${summary.slice(0, 110)}` : '';
  return `- ${label}: ${status}${latency}${evidence}`;
}

async function runAocProbeBatch(ctx: any, routeKeys: string[]): Promise<void> {
  await ctx.reply(`Running ${routeKeys.length} route probes. This can take a little while...`);
  const lines = ['Route probes'];
  for (const routeKey of routeKeys) {
    await safeSendChatAction(ctx, 'typing');
    try {
      const result = await runBuilderRouteProbe(routeKey);
      lines.push(aocProbeSummaryLine(routeKey, result.payload));
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      lines.push(`- ${AOC_ROUTE_LABELS[routeKey] || routeKey}: failed - ${message.slice(0, 120)}`);
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
      await ctx.reply(renderAocProbeHelp());
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
      await ctx.reply(renderAocProbeHelp());
      return;
    }
    const result = await runBuilderRouteProbe(routeKey);
    await ctx.reply(result.replyText);
  } catch (err: any) {
    await ctx.reply(renderSparkErrorReply(err, 'builder', conversation.isAdmin(ctx.from)));
  }
}

async function handleNaturalRouteProbeCommand(ctx: any): Promise<void> {
  if (!requireAdmin(ctx)) return;
  await safeSendChatAction(ctx, 'typing');
  try {
    const text = 'text' in (ctx.message || {}) ? String((ctx.message as any).text || '') : '';
    const probeText = text.replace(/^\/(?:nl_route|natural_route)(?:@\w+)?\s*/i, '').trim();
    if (!probeText || /^(?:help|usage)$/i.test(probeText)) {
      await ctx.reply([
        'Natural route probe',
        'Usage: /nl_route <message>',
        '',
        'This shows the diagnostic route decision only. It does not execute the route.'
      ].join('\n'));
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
    await ctx.reply(renderNaturalRouteDecisionReply(decision));
  } catch (err: any) {
    await ctx.reply(renderSparkErrorReply(err, 'chat', conversation.isAdmin(ctx.from)));
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
    const requestId = opaqueTelegramRequestId('tg-trace-repair');
    const traceRef = telegramRunTraceRef(requestId);
    await ctx.reply(renderTraceRepairSummary(summary));
    recordCommandReplyDelivery({
      command: 'trace_repair',
      replyKind: 'trace_repair_reply',
      requestId,
      traceRef
    });
  } catch (err: any) {
    await ctx.reply(renderSparkErrorReply(err, 'builder', conversation.isAdmin(ctx.from)));
  }
}

async function handleMemoryMovementCommand(ctx: any): Promise<void> {
  if (!requireAdmin(ctx)) return;
  await safeSendChatAction(ctx, 'typing');
  try {
    const summary = await readMemoryMovementSummary();
    await ctx.reply(renderMemoryMovementSummary(summary));
  } catch (err: any) {
    await ctx.reply(renderSparkErrorReply(err, 'builder', conversation.isAdmin(ctx.from)));
  }
}

bot.command('probe', handleAgentRouteProbeCommand);
bot.command('route_probe', handleAgentRouteProbeCommand);
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
  const buildLane = pending.buildLane || buildLaneForMode(pending.buildMode);
  const buildLaneReason = pending.buildLaneReason || 'Build lane inferred from build mode.';
  const accessRequirement: SparkAccessRequirement = sparkMissionNeedsOperatingSystemAccess(enrichedPrd, pending.projectPath)
    ? 'operating_system'
    : 'spawner_build';
  if (!(await buildDispatchRouteConfidenceAllows({
    ctx,
    accessRequirement,
    prd: enrichedPrd,
    requestId: newRequestId,
    traceRef,
    runnerPreflight,
    confirmationState: runWithDefaults ? 'confirmed' : 'not_required'
  }))) {
    return;
  }
  const projectName = pending.capabilityProposalPacket
    ? pending.projectName
    : polishBuildProjectName(pending.projectName);
  const prdContent = pending.projectPath
    ? `# ${projectName}\n\nBuild mode: ${pending.buildMode}\nBuild mode reason: ${pending.buildModeReason}\nBuild lane: ${buildLane}\nBuild lane reason: ${buildLaneReason}\nTarget workspace/project path: \`${pending.projectPath}\`\n\n${enrichedPrd}`
    : `# ${projectName}\n\nBuild mode: ${pending.buildMode}\nBuild mode reason: ${pending.buildModeReason}\nBuild lane: ${buildLane}\nBuild lane reason: ${buildLaneReason}\n\n${enrichedPrd}`;

  try {
    const res = await axios.post(
      `${spawnerUrl}/api/prd-bridge/write`,
      {
        content: prdContent,
        requestId: newRequestId,
        traceRef,
        projectName,
        buildMode: pending.buildMode,
        buildModeReason: pending.buildModeReason,
        buildLane,
        buildLaneReason,
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
        options: prdBridgeOptionsForBuildLane(buildLane)
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
      goal: projectName || pending.prd,
      createdAt: new Date().toISOString(),
      updateId: typeof ctx.update.update_id === 'number' ? ctx.update.update_id : undefined
    });

    const publicSpawnerUrl = process.env.SPAWNER_UI_PUBLIC_URL || spawnerUrl;
    const canvasUrl = projectCanvasUrl(publicSpawnerUrl, newRequestId, missionId);
    const kanbanUrl = missionBoardUrl(publicSpawnerUrl);
    await ctx.reply(formatBuildMissionQueuedReply({
      lead: runWithDefaults ? 'Perfect, I will use the default direction.' : 'Got it, I will use that direction.',
      projectName,
      buildMode: pending.buildMode,
      buildLane,
      missionId,
      kanbanUrl
    }));
    startPrdCanvasReadyNotifier({
      chatId: Number(ctx.chat.id),
      userId: Number(ctx.from.id),
      projectName,
      requestId: newRequestId,
      missionId,
      spawnerUrl,
      publicSpawnerUrl,
      canvasUrl,
      kanbanUrl,
      buildLane,
      tier
    });
  } catch (err) {
    await ctx.reply(renderSparkErrorReply(err instanceof Error ? err : new Error(String(err)), 'spawner', conversation.isAdmin(ctx.from)));
  }
}

function startPrdCanvasReadyNotifier(args: {
  chatId: number;
  userId: number;
  projectName: string;
  requestId: string;
  missionId: string;
  spawnerUrl: string;
	publicSpawnerUrl: string;
	canvasUrl: string;
	kanbanUrl: string;
	buildLane?: BuildLane;
	tier?: SkillTier;
}): void {
  void (async () => {
    const started = Date.now();
    const readyTimeoutMs = localServiceTimeoutMs('SPARK_SPAWNER_PRD_READY_TIMEOUT_MS');
    const backendFallbackGraceMs = Math.min(60_000, Math.max(15_000, Math.round(readyTimeoutMs * 0.25)));
    const deadline = started + readyTimeoutMs + backendFallbackGraceMs;
    const resultUrl = `${args.spawnerUrl}/api/prd-bridge/result?requestId=${encodeURIComponent(args.requestId)}`;
    const verbosity = await getTelegramRelayVerbosity(args.chatId).catch(() => 'normal' as const);
    const heartbeatThresholds = verbosity === 'verbose' && args.buildLane !== 'fast_direct' ? [120_000] : [];
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
          await bot.telegram.sendMessage(args.chatId, formatCanvasShapingHeartbeatSummary({
            projectName: args.projectName,
            elapsedSeconds: elapsedSec
          })).catch(() => {});
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
            rememberLatestCanvasPlan(args.chatId, args.userId, {
              projectName: args.projectName,
              taskCount: typeof taskCount === 'number' ? taskCount : null,
              analysis: poll.data.result,
              tier: args.tier || 'base',
              readyCanvasUrl
            });
            await bot.telegram.sendMessage(args.chatId, formatCanvasReadySummary({
              projectName: args.projectName,
              taskCount,
              elapsed,
              analysis: poll.data.result,
              tier: args.tier,
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
    await bot.telegram.sendMessage(args.chatId, formatCanvasStillRunningSummary({
      projectName: args.projectName,
      elapsedSeconds: Math.round(readyTimeoutMs / 1000),
      kanbanUrl: args.kanbanUrl
    }));
  })();
}

bot.command('clarify', async (ctx) => {
  await handleClarificationAnswers(ctx, ctx.message.text.replace(/^\/clarify\b/, ''));
});

// /remember command
bot.command('remember', handleRememberCommand);

// /recall command
bot.command('recall', handleRecallCommand);

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

// /voice - Builder-owned voice status/onboarding. Do not fall back to the
// deferred dashboard placeholder; voice is a Builder/chip capability now.
bot.command('voice', async (ctx) => {
  await safeSendChatAction(ctx, 'typing');
  console.log(`[Voice] /voice command received user=${userRef(ctx.from?.id)} chat_type=${ctx.chat?.type || 'unknown'}`);
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
  await ctx.reply('Voice is routed through Builder now, but the Builder voice route did not answer this turn. Run `/diagnose`, then try `/voice` again.');
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
  if (providers.length === 1) return `I will run that through ${who} now.`;
  return `I will check that with ${who} in parallel now.`;
}

function telegramBlocks(...blocks: Array<string | null | undefined | false>): string {
  return blocks
    .filter((block): block is string => Boolean(block && block.trim()))
    .map((block) => block.trim())
    .join('\n\n');
}

function sentenceWithPeriod(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return '';
  return /[.!?]$/.test(trimmed) ? trimmed : `${trimmed}.`;
}

export function formatCanvasStillRunningSummary(args: {
  projectName: string;
  elapsedSeconds: number;
  kanbanUrl: string;
}): string {
  return telegramBlocks(
    `still preparing ${args.projectName}. It is taking a little longer than usual, and I will send the canvas when it is ready.`,
    `Board: ${args.kanbanUrl}`
  );
}

export function formatCanvasShapingHeartbeatSummary(args: {
  projectName: string;
  elapsedSeconds: number;
}): string {
  return telegramBlocks(
    `still shaping ${args.projectName}.`,
    'I will keep this quiet until the canvas is ready or something needs attention.'
  );
}

function formatBuildMissionQueuedReply(input: {
  lead: string;
  projectName: string;
  buildMode: 'direct' | 'advanced_prd';
  buildLane?: BuildLane;
  projectPath?: string | null;
  missionId: string;
  kanbanUrl: string;
}): string {
  const modeText = input.buildLane === 'fast_direct'
    ? 'fast build'
    : input.buildMode === 'advanced_prd'
      ? 'planning canvas'
      : 'direct build';
  return telegramBlocks(
    input.lead,
    `🛠️ Setting up ${input.projectName} as a ${modeText}. Canvas next.`,
    input.projectPath ? ['Workspace', `• ${input.projectPath}`].join('\n') : null,
  );
}

function buildLaneForMode(buildMode: 'direct' | 'advanced_prd'): BuildLane {
  return buildMode === 'advanced_prd' ? 'advanced_prd' : 'direct';
}

function prdBridgeOptionsForBuildLane(buildLane: BuildLane): { includeSkills: boolean; includeMCPs: boolean; fastLane?: boolean } {
  if (buildLane === 'fast_direct') {
    return { includeSkills: false, includeMCPs: false, fastLane: true };
  }
  return { includeSkills: true, includeMCPs: false };
}

function missionIdFromTelegramBuildRequest(requestId: string): string {
  const stamp = requestId.match(/(\d{10,})$/)?.[1];
  return `mission-${stamp || requestId.replace(/[^a-zA-Z0-9_-]/g, '_')}`;
}

function opaqueTelegramRequestId(prefix: 'tg-run' | 'tg-build' | 'tg-creator'): string {
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

function projectKanbanUrl(baseUrl: string, missionId: string): string {
  const root = baseUrl.replace(/\/+$/, '');
  return `${root}/kanban?mission=${encodeURIComponent(missionId)}`;
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

const CREATOR_USAGE = [
  'Usage: /creator plan [private|github|swarm] [risk low|medium|high] <brief>',
  '       /creator run <mission-creator-id>',
  '       /creator status <mission-creator-id>',
  '       /creator validate <mission-creator-id> [maxCommands]',
  'Example: /creator plan private risk medium create a Startup YC benchmarked specialization path',
  'Example: /creator run mission-creator-1776768300668',
  'Example: /creator validate mission-creator-1776768300668 6'
].join('\n');

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

function creatorExecutionPolicyForBrief(brief: string): 'manual_run' | 'read_only' {
  return /\b(?:stage\s+only|do\s+not\s+run|don't\s+run|no\s+run|without\s+running|do\s+not\s+start|don't\s+start|no\s+execution)\b/i.test(brief)
    ? 'read_only'
    : 'manual_run';
}

function parsePendingCreatorMissionAction(text: string): ParsedCreatorMissionControlCommand['action'] | null {
  const normalized = text.trim().toLowerCase().replace(/\s+/g, ' ');
  if (!normalized) return null;
  if (/^(?:run|start|execute|kick off|go|go ahead|do it|run it|start it|execute it|kick it off)(?:\s+(?:the\s+)?(?:(?:creator\s+)?mission|private\s+path|specialization\s+path|path|autoloop))?$/i.test(normalized)) {
    return 'run';
  }
  if (/^(?:validate|verify|test)(?:\s+(?:it|the\s+(?:creator\s+)?mission|the\s+private\s+path|the\s+specialization\s+path|the\s+path|the\s+benchmark(?:\s+pack)?|the\s+autoloop|the\s+evidence|the\s+capability\s+gain))?$/i.test(normalized) ||
    /^(?:run|start)\s+(?:validation|checks?|benchmarks?|benchmark\s+validation|the\s+checks?)(?:\s+(?:on|for)\s+(?:it|the\s+path|the\s+specialization\s+path|the\s+benchmark(?:\s+pack)?))?$/i.test(normalized)) {
    return 'validate';
  }
  if (/^(?:status|show status|check|check status|what'?s happening|what happened|where are we|show me status|show me what improved|what improved|did it improve|is it better yet|prepare it for review)(?:\s+(?:for\s+)?(?:it|the\s+(?:creator\s+)?mission|the\s+private\s+path|the\s+specialization\s+path|the\s+path|the\s+benchmark(?:\s+pack)?))?$/i.test(normalized)) {
    return 'status';
  }
  return null;
}

function normalizeNaturalCreatorText(text: string): string {
  return text.toLowerCase().replace(/[^\w\s-]/g, ' ').replace(/\s+/g, ' ').trim();
}

function naturalCreatorTargetLabelFromText(text: string): string | null {
  const normalized = normalizeNaturalCreatorText(text);
  if (/\bstartup[-\s]+yc\b/.test(normalized)) return 'Startup YC';
  if (/\bspark\s+qa\s+operator\b|\bqa\s+operator\b/.test(normalized)) return 'Spark QA Operator';
  if (/\bdomain[-\s]+chip[-\s]+creator\b/.test(normalized)) return 'Domain Chip Creator';
  const namedMatch = text.match(/\b(?:called|named|for)\s+["“]?([A-Z][A-Za-z0-9]*(?:[\s-]+[A-Z0-9][A-Za-z0-9]*){0,5})["”]?/);
  return namedMatch?.[1]?.trim() || null;
}

function inferNaturalCreatorTargetLabel(text: string, recentMessages: string[] = []): string | null {
  const direct = naturalCreatorTargetLabelFromText(text);
  if (direct) return direct;

  const normalized = normalizeNaturalCreatorText(text);
  const isContextualFollowup = /\b(?:this|that|same|current|latest|proven|it)\b.*\b(?:loop|path|template|domain chip|benchmark|packet|creator)\b/.test(normalized) ||
    /\b(?:turn|package|link|update|create|stage)\s+(?:this|that|it)\b/.test(normalized);
  if (!isContextualFollowup) return null;

  for (const message of [...recentMessages].reverse()) {
    const label = naturalCreatorTargetLabelFromText(message);
    if (label) return label;
  }
  return null;
}

function inferNaturalCreatorPrivacyMode(normalized: string): ParsedCreatorCommand['privacyMode'] | undefined {
  if (/\b(?:do not|don't|dont|please don't|please dont|no need to)\s+(?:publish|share|ship|deploy)\b/.test(normalized)) return 'local_only';
  if (/\b(?:no|not)\s+(?:publish|sharing|share|deploy)(?:ing)?\s+(?:yet|for\s+now|right\s+now)\b/.test(normalized)) return 'local_only';
  if (/\b(?:private|local|locally|workspace only|personal workspace)\b/.test(normalized)) return 'local_only';
  if (/\b(?:github|pull request|pr)\b/.test(normalized)) return 'github_pr';
  if (/\b(?:swarm|network|public|share|shared)\b/.test(normalized)) return 'swarm_shared';
  return 'local_only';
}

function inferNaturalCreatorRiskLevel(normalized: string): ParsedCreatorCommand['riskLevel'] | undefined {
  const match = normalized.match(/\brisk\s+(low|medium|high)\b/);
  return match ? (match[1] as ParsedCreatorCommand['riskLevel']) : 'medium';
}

export function parseNaturalCreatorMissionIntent(text: string, recentMessages: string[] = []): NaturalCreatorMissionIntent | null {
  const normalized = normalizeNaturalCreatorText(text);
  if (!normalized || normalized.startsWith('/')) return null;
  if (/\b(?:what|which|show|list|status|report|review|trace)\b/.test(normalized) && !/\b(?:create|build|make|plan|scaffold|generate)\b/.test(normalized)) {
    return null;
  }

  const hasCreateVerb = /\b(?:create|build|make|plan|stage|scaffold|generate|set up|spin up|prepare|add|attach|update|package|link|turn)\b/.test(normalized);
  if (!hasCreateVerb) return null;

  const artifactPatterns: Array<{ label: string; pattern: RegExp }> = [
    { label: 'full creator system', pattern: /\b(?:creator system|creator mission|creator run|full path|domain chip.*benchmark.*(?:specialization|path|autoloop)|specialization.*benchmark.*autoloop)\b/ },
    { label: 'specialization path', pattern: /\b(?:specialization path|specialisation path|learning path|mastery path)\b/ },
    { label: 'autoloop', pattern: /\b(?:autoloop|auto loop|recursive loop|self-improvement loop)\b/ },
    { label: 'benchmark pack', pattern: /\b(?:benchmark pack|eval pack|evaluation pack|test suite)\b/ },
    { label: 'insight packet', pattern: /\b(?:shareable insight packet|insight packet|review packet)\b/ },
    { label: 'Swarm contribution packet', pattern: /\b(?:swarm contribution packet|swarm review packet|contribution packet)\b/ },
    { label: 'reusable template', pattern: /\b(?:reusable template|loop template|specialization template)\b/ },
    { label: 'domain chip', pattern: /\b(?:domain chip|domain-chip)\b/ }
  ];
  const artifact = artifactPatterns.find((entry) => entry.pattern.test(normalized));
  if (!artifact) return null;

  const brief = text.trim().replace(/\s+/g, ' ');
  if (brief.length < 8) return null;
  const targetLabel = inferNaturalCreatorTargetLabel(text, recentMessages);
  const contextLines = [
    targetLabel ? `Target domain/path: ${targetLabel}.` : null,
    `Requested artifact: ${artifact.label}.`,
    targetLabel && artifact.label === 'reusable template'
      ? `Keep the reusable template attached to the active ${targetLabel} specialization loop; do not rename it to a generic Intent path.`
      : null
  ].filter((line): line is string => Boolean(line));
  return {
    brief: [
      ...contextLines,
      ...(contextLines.length > 0 ? [''] : []),
      brief,
      '',
      'Treat higher-intelligence, tool-usage, reasoning, or ability-gain claims as unproven until benchmark validation records a before/after gain.',
      'Require explicit evidence for creator-intent.json, adapter-map.json, created-artifact-manifest.json, domain-chip/, benchmark/, specialization-path/, autoloop/policy.json, reports/evidence_ladder.md, reports/creator-mission-status.json, and swarm/contribution_packet.json before any publish or share step.',
      'Keep publication.network_absorbable=false unless future promotion gates and explicit operator approval allow it.',
      'Use Spark creator-system standards: creator intent packet, adapter map, artifact manifests, benchmark gates, evidence ladder, local/private boundary, rollback note, and review bundle only when gates allow it.',
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
  const isReasoningGame =
    isGame &&
    /\b(reasoning|trust|claims?|verify|quarantine|memory|contradiction|confidence|logic)\b/.test(lower);
  const explicitlyWantsMaze = /\bmaze\b/.test(lower);
  const isDashboard = /\b(dashboard|metric|analytics|monitor|report)\b/.test(lower);
  const fallbackRecommendation = isReasoningGame
    ? 'trust/verify/quarantine choices, scoring, explanations, and replayable reasoning rounds'
    : isGame
      ? 'browser-playable, keyboard controls, clear win/score loop, restart, and local best score'
    : isDashboard
      ? 'focused web dashboard, the key metrics first, seeded data if live data is not ready, and clean empty/error states'
      : (assumptions[0]?.replace(/^Assume\s+/i, '').replace(/\.$/, '') || 'focused web v1 with a polished first screen and simple verification');
  const microcopyRecommendation = microcopy?.recommendation || '';
  const recommendation =
    isReasoningGame &&
    !explicitlyWantsMaze &&
    /\bmaze\b/.test(microcopyRecommendation.toLowerCase())
      ? fallbackRecommendation
      : (microcopyRecommendation || fallbackRecommendation);
  const steerQuestion = microcopy?.steeringQuestion || questions[0] || (isGame
    ? 'What twist should make it fun?'
    : 'What is the one detail I should not guess?');
  return [
    `I can turn this into ${projectName}.`,
    `Recommended starting point: ${sentenceWithPeriod(recommendation)}`,
    `Say "go" to start, or steer one thing first: ${steerQuestion}`
  ].join('\n\n');
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

export function isDomainChipPendingDirection(text: string): boolean {
  const normalized = text.trim().toLowerCase().replace(/\s+/g, ' ');
  if (!normalized || normalized.length > 260) return false;
  if (isDomainChipPendingStart(normalized) || isDomainChipPendingCancel(normalized)) return true;
  if (/^(?:what|which|how|why|can|could|should|would|do|does|did|is|are|will)\b/.test(normalized)) return false;
  if (/\b(?:test|tests|testing|unit\s+test|qa|bug\s+hunter|bug\s+hunt|edge\s+cases?|spawner|mission\s+control|workflow|prs?|publish|merge|ship)\b/.test(normalized)) {
    return false;
  }
  return /\b(?:names?|rationale|usage\s+angle|vibe|style|tone|output|outputs?|luxury|absurd|consumer|sci[-\s]*fi|surreal|weird|funny|serious|enterprise|developer|technical|visual|image|poster|prompt|prompts)\b/.test(normalized);
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

  if (!isDomainChipPendingDirection(text)) {
    return false;
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
  const requestId = opaqueTelegramRequestId('tg-creator');
  const result = await spawner.creatorMission({
    brief: parsed.brief,
    requestId,
    privacyMode: parsed.privacyMode,
    riskLevel: parsed.riskLevel,
    executionPolicy: creatorExecutionPolicyForBrief(parsed.brief)
  });

  await ctx.reply(formatCreatorMissionSummary(result));
  if (result.success && result.missionId && result.trace?.execution_policy !== 'read_only') {
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

function isBareExecutionStart(text: string): boolean {
  const normalized = text.trim().toLowerCase().replace(/\s+/g, ' ');
  return /^(?:go|run|start|ship|do it|let'?s go|default|defaults|skip)[.! ]*$/i.test(normalized);
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
	tier?: SkillTier;
  readyCanvasUrl: string;
  kanbanUrl: string;
}): string {
  const tasks = Array.isArray(args.analysis?.tasks) ? args.analysis.tasks : [];
  const tier = args.tier || 'base';
  const rawTaskCount = typeof args.taskCount === 'number' ? args.taskCount : tasks.length;
  const taskCount = Number.isFinite(rawTaskCount) ? rawTaskCount : 0;
  const buildStepLine = taskCount > 0
    ? `I queued ${taskCount} build ${taskCount === 1 ? 'step' : 'steps'}. Spark is moving into the build now.`
    : 'Spark is moving into the build now.';
  const taskPreview = formatCanvasTaskPreview(tasks, tier);
  const skillSummary = formatCanvasSkillSummary(tasks, tier);
  return telegramBlocks(
    `Canvas is ready for ${args.projectName}.`,
    buildStepLine,
    taskPreview,
    skillSummary,
    ['Canvas', `• ${args.readyCanvasUrl}`].join('\n')
  );
}

function taskTitleFromAnalysisTask(task: any): string | null {
  const raw = task?.title || task?.name || task?.task || task?.description;
  if (typeof raw !== 'string') return null;
  const title = raw.replace(/\s+/g, ' ').trim();
  return title || null;
}

function compactCanvasTaskTitle(title: string): string {
	const normalized = title.trim().toLowerCase();
	const shortTitles: Record<string, string> = {
		'create the playable game shell': 'Playable shell',
		'design the core play and reasoning loop': 'Core reasoning loop',
		'add scoring, restart, and player feedback': 'Scoring and feedback',
		'verify the playable loop': 'Playable-loop QA',
		'create the app shell and project structure': 'App shell',
		'create the app shell': 'App shell',
		'implement the core interaction and state': 'Core interaction',
		'implement reasoning rounds': 'Reasoning rounds',
		'polish the visual system and documentation': 'Polish and docs',
		'polish the visual system': 'Visual polish',
		'write smoke notes': 'Smoke notes',
		'build and check the single-file static page': 'Build + check static page',
		'build and check the focused static page': 'Build + check static page',
		'scaffold chip manifest and hooks': 'Chip manifest',
		'validate router behavior': 'Router behavior',
		'model the token and nft launch signals': 'Launch signals',
		'build the launch decision dashboard': 'Decision dashboard',
		'add scenario controls and warning states': 'Scenarios and warnings',
		'verify launch dashboard quality': 'Launch-dashboard QA'
	};
	if (shortTitles[normalized]) return shortTitles[normalized];
	if (title.length <= 42) return title;
	return `${title.slice(0, 39).replace(/\s+\S*$/, '').trim()}...`;
}

function taskSkillsFromAnalysisTask(task: any): string[] {
	const raw: unknown[] = Array.isArray(task?.skills) ? task.skills : [];
	return raw
		.filter((skill): skill is string => typeof skill === 'string' && skill.trim().length > 0)
		.map((skill) => skill.trim());
}

const BASE_SKILL_IDS = new Set([
	'accessibility',
	'ai-observability',
	'api-design',
	'authentication-oauth',
	'database-architect',
	'data-pipeline',
	'design-systems',
	'devops',
	'error-handling',
	'forms-validation',
	'frontend-engineer',
	'llm-architect',
	'observability',
	'playwright-testing',
	'prompt-engineer',
	'queue-workers',
	'rag-engineer',
	'rate-limiting',
	'react-patterns',
	'redis-specialist',
	'responsive-mobile-first',
	'security-owasp',
	'stripe-integration',
	'structured-output',
	'subscription-billing',
	'testing-strategies',
	'ui-design',
	'ux-design',
	'vector-specialist',
	'webhook-processing',
	'workflow-automation'
]);

const COMMON_PRO_SKILL_IDS = new Set([
	'copywriting',
	'data-dashboard-design',
	'game-design',
	'game-design-core',
	'game-development',
	'game-ui-design',
	'level-design',
	'nft-systems',
	'player-onboarding',
	'procedural-generation',
	'product-analytics-engineering',
	'product-strategy',
	'puzzle-design',
	'qa-engineering',
	'risk-management-trading',
	'state-management',
	'technical-writer',
	'threejs-3d-graphics',
	'tokenomics-design'
]);

function skillTierForDisplay(skill: string): SkillTier | 'unknown' {
	const normalized = skill.trim().toLowerCase().replace(/[_\s]+/g, '-');
	if (!normalized) return 'unknown';
	if (BASE_SKILL_IDS.has(normalized)) return 'base';
	if (COMMON_PRO_SKILL_IDS.has(normalized)) return 'pro';
	return 'unknown';
}

function uniqueTaskSkills(tasks: any[]): string[] {
	return [...new Set(tasks.flatMap((task) => taskSkillsFromAnalysisTask(task)))];
}

function readableSkillLabel(skill: string): string {
	const normalized = skill.trim().toLowerCase().replace(/[_\s]+/g, '-');
	const shortLabels: Record<string, string> = {
		'frontend-engineer': 'frontend',
		'threejs-3d-graphics': 'Three.js',
		'game-development': 'game dev',
		'game-design': 'game design',
		'game-design-core': 'game loop',
		'game-ui-design': 'game UI',
		'puzzle-design': 'puzzle',
		'responsive-mobile-first': 'mobile',
		'state-management': 'state',
		'player-onboarding': 'onboarding',
		'qa-engineering': 'QA',
		'testing-strategies': 'testing',
		'test-architect': 'test design',
		'tailwind-css': 'Tailwind',
		'technical-writer': 'docs',
		'ui-design': 'UI design',
		'accessibility': 'accessibility',
		'procedural-generation': 'procedural',
		'level-design': 'levels'
	};
	return shortLabels[normalized] || skill
		.replace(/[-_]+/g, ' ')
		.replace(/\bui\b/gi, 'UI')
		.replace(/\bqa\b/gi, 'QA')
		.trim();
}

function formatCanvasSkillSummary(tasks: any[], tier: SkillTier): string | null {
	const skills = uniqueTaskSkills(tasks);
	if (skills.length === 0) return null;
	const base = skills.filter((skill) => skillTierForDisplay(skill) === 'base');
	const pro = skills.filter((skill) => skillTierForDisplay(skill) === 'pro');
	const activeSkills = tier === 'pro'
		? skills.filter((skill) => skillTierForDisplay(skill) !== 'unknown')
		: base;
	const rows: string[] = [];
	if (activeSkills.length > 0) {
		const preview = activeSkills
			.map((skill) => activeSkills.length <= 4 && skill.trim().toLowerCase().replace(/[_\s]+/g, '-') === 'puzzle-design'
				? 'puzzle design'
				: readableSkillLabel(skill))
			.join(', ');
		rows.push(`• Active: ${activeSkills.length} ${activeSkills.length === 1 ? 'skill' : 'skills'}: ${preview}`);
		rows.push(`• Skill tier: ${describeTier(tier)}`);
	}
	if (tier === 'base' && pro.length > 0) {
		const preview = pro.map(readableSkillLabel).join(', ');
		rows.push(`• Pro can add ${pro.length} ${pro.length === 1 ? 'skill' : 'skills'}: ${preview}`);
	}
	if (rows.length === 0) return null;
	return ['Skills invoked', ...rows].join('\n');
}

function taskSkillsForTierDisplay(skills: string[], tier: SkillTier): string[] {
	if (tier === 'pro') return skills;
	return skills.filter((skill) => skillTierForDisplay(skill) === 'base');
}

function formatCanvasTaskPreview(tasks: any[], tier: SkillTier): string | null {
	const rows = tasks
		.map((task) => {
			const title = taskTitleFromAnalysisTask(task);
			if (!title) return null;
			const skills = taskSkillsForTierDisplay(taskSkillsFromAnalysisTask(task), tier).slice(0, 1).map(readableSkillLabel);
			const compactTitle = compactCanvasTaskTitle(title);
			return skills.length > 0 ? `• ${compactTitle} · ${skills[0]}` : `• ${compactTitle}`;
		})
		.filter((row): row is string => Boolean(row))
		.slice(0, 10);
	if (rows.length === 0) return null;
	const hiddenCount = Math.max(0, tasks.length - rows.length);
	return ['Plan', ...rows, hiddenCount > 0 ? `• +${hiddenCount} more` : null]
		.filter((row): row is string => Boolean(row))
		.join('\n');
}

function canvasPlanTasksFromAnalysis(analysis: any): LatestCanvasPlanTask[] {
  const tasks: unknown[] = Array.isArray(analysis?.tasks) ? analysis.tasks : [];
  return tasks
    .map((task: unknown) => {
      const title = taskTitleFromAnalysisTask(task);
      return title ? { title, skills: taskSkillsFromAnalysisTask(task) } : null;
    })
    .filter((task): task is LatestCanvasPlanTask => Boolean(task))
    .slice(0, 8);
}

function rememberLatestCanvasPlan(chatId: string | number, userId: string | number, input: {
  projectName: string;
  taskCount: number | null;
  analysis: any;
	tier?: SkillTier;
  readyCanvasUrl: string;
}): void {
  latestCanvasPlans.set(canvasPlanKey(chatId, userId), {
    projectName: input.projectName,
    taskCount: input.taskCount,
    tasks: canvasPlanTasksFromAnalysis(input.analysis),
		tier: input.tier || 'base',
    readyCanvasUrl: input.readyCanvasUrl,
    recordedAt: new Date().toISOString()
  });
}

function spawnerUiStatePath(filename: string): string {
  const sparkHome = process.env.SPARK_HOME?.trim() || path.join(os.homedir(), '.spark');
  return path.join(sparkHome, 'state', 'spawner-ui', filename);
}

function normalizeCanvasSkillTier(value: unknown): SkillTier {
  return typeof value === 'string' && value.toLowerCase() === 'pro' ? 'pro' : 'base';
}

export function latestCanvasPlanFromLoadState(state: any, baseUrl: string): LatestCanvasPlan | null {
  if (!state || typeof state !== 'object') return null;
  const projectName = typeof state.pipelineName === 'string' && state.pipelineName.trim()
    ? state.pipelineName.trim()
    : null;
  const requestId = typeof state.requestId === 'string' && state.requestId.trim()
    ? state.requestId.trim()
    : null;
  const missionId = typeof state.missionId === 'string' && state.missionId.trim()
    ? state.missionId.trim()
    : null;
  if (!projectName || !requestId || !missionId) return null;
  const nodes = Array.isArray(state.nodes) ? state.nodes : [];
  const tasks = nodes
    .map((node: any) => {
      const skill = node?.skill && typeof node.skill === 'object' ? node.skill : null;
      const title = typeof skill?.name === 'string' ? skill.name.trim() : '';
      const chain: unknown[] = Array.isArray(skill?.skillChain) ? skill.skillChain : Array.isArray(skill?.tags) ? skill.tags : [];
      const skills = chain
        .filter((entry: unknown): entry is string => typeof entry === 'string' && Boolean(entry.trim()))
        .map((entry: string) => entry.trim());
      return title ? { title, skills } : null;
    })
    .filter((task: LatestCanvasPlanTask | null): task is LatestCanvasPlanTask => Boolean(task))
    .slice(0, 10);
  return {
    projectName,
    taskCount: nodes.length || tasks.length || null,
    tasks,
    tier: normalizeCanvasSkillTier(state.tier),
    readyCanvasUrl: projectCanvasUrl(baseUrl, requestId, missionId),
    recordedAt: typeof state.timestamp === 'string' ? state.timestamp : new Date().toISOString()
  };
}

async function readLatestCanvasPlanFromSpawnerState(): Promise<LatestCanvasPlan | null> {
  const publicSpawnerUrl = process.env.SPAWNER_UI_PUBLIC_URL || process.env.SPAWNER_UI_URL || 'http://127.0.0.1:3333';
  const state = await readJsonFile<any>(spawnerUiStatePath('last-canvas-load.json'));
  return latestCanvasPlanFromLoadState(state, publicSpawnerUrl);
}

export function isLatestCanvasPlanQuestion(text: string): boolean {
  const normalized = text.toLowerCase().replace(/\s+/g, ' ').trim();
  if (/\b(?:mission|project|build)\s+title\b/.test(normalized) || /\btitle\s+would\s+you\s+use\b/.test(normalized)) {
    return false;
  }
  const asksPlanDetails = /\b(?:what|which|show|list|tell me|give me)\b/.test(normalized)
    || /\bfull plan\b/.test(normalized);
  const asksTasksOrSkills = /\b(?:tasks?|steps?|skills?|paired skills?|queued|plan)\b/.test(normalized);
  const anchoredToRecentCanvas = /\b(?:canvas|mission|build|project|latest|last|queued|full plan)\b/.test(normalized)
    || /\b(?:that|it)\s+(?:canvas|mission|build|project|plan|queue|queued)\b/.test(normalized);
  return asksPlanDetails && asksTasksOrSkills && anchoredToRecentCanvas;
}

export function formatLatestCanvasPlanReply(plan: LatestCanvasPlan): string {
  const taskLines = plan.tasks.length > 0
    ? plan.tasks.map((task) => {
        const visibleSkills = taskSkillsForTierDisplay(task.skills, plan.tier).map(readableSkillLabel);
        const skills = visibleSkills.length > 0 ? ` - ${visibleSkills.join(', ')}` : '';
        return `• ${task.title}${skills}`;
      })
    : ['• The canvas is ready, but it did not return task rows to Telegram.'];
	const skillSummary = formatCanvasSkillSummary(plan.tasks, plan.tier);

  const count = plan.taskCount ?? plan.tasks.length;
  return [
    `The latest canvas is for ${plan.projectName}.`,
    count > 0 ? `${count} build steps are queued.` : null,
    '',
    'Tasks',
    ...taskLines,
		skillSummary ? ['', skillSummary] : null,
    '',
    'Canvas',
    `• ${plan.readyCanvasUrl}`
  ].flat().filter((line): line is string => line !== null).join('\n');
}

function buildNoStartMissionTitleReply(text: string): string | null {
  const normalized = text.toLowerCase().replace(/\s+/g, ' ').trim();
  const asksTitle = /\b(?:mission|project|build)\s+title\b/.test(normalized) || /\btitle\s+would\s+you\s+use\b/.test(normalized);
  const noStart = /\b(?:do\s+not|don't|without|no)\s+(?:start|launch|run|create|build)\b/.test(normalized);
  if (!asksTitle || !noStart) return null;

  const quotedPhrases = Array.from(text.matchAll(/["“”']([^"“”']{3,240})["“”']/g))
    .map((match) => match[1].trim())
    .filter(Boolean);
  for (const phrase of quotedPhrases) {
    const intent = parseBuildIntent(phrase);
    if (intent?.projectName) {
      return `I’d use ${intent.projectName}. I would not start a mission from that title check.`;
    }
  }

  return null;
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

function redactedRef(label: string, value: string): string {
  return `${label}:sha256:${createHash('sha256').update(value).digest('hex').slice(0, 16)}`;
}

function recordRouteConfidenceDispatchOutcome(input: {
  route: string;
  decision: string;
  outcome: 'acted' | 'blocked' | 'failed_closed';
  requestId: string;
  traceRef: string;
  policy?: string;
}): void {
  const auditPath = process.env.SPARK_TELEGRAM_ROUTE_CONFIDENCE_AUDIT_PATH || path.join(
    os.homedir(),
    '.spark',
    'state',
    'spark-telegram-bot',
    'route-confidence-audit.jsonl'
  );
  const record = {
    schema_version: 'spark.telegram_route_confidence_audit.v1',
    recorded_at: new Date().toISOString(),
    route: input.route,
    decision: input.decision,
    outcome: input.outcome,
    safe_reply_policy: input.policy || null,
    request_ref: redactedRef('request', input.requestId),
    trace_ref: redactedRef('trace', input.traceRef),
    privacy: 'metadata_only'
  };
  mkdir(path.dirname(auditPath), { recursive: true })
    .then(() => appendFile(auditPath, `${JSON.stringify(record)}\n`, 'utf-8'))
    .catch(() => {});
}

export async function buildDispatchRouteConfidenceAllows(input: {
  ctx: any;
  accessRequirement: SparkAccessRequirement;
  prd: string;
  requestId: string;
  traceRef: string;
  runnerPreflight: Awaited<ReturnType<typeof probeTelegramRunnerWritability>> | null;
  latestInstruction?: 'allow_execution' | 'no_execution';
  confirmationState?: 'not_required' | 'confirmed' | 'missing';
  gateRunner?: typeof runBuilderRouteConfidenceGate;
  spawnerAvailableProbe?: () => Promise<boolean>;
}): Promise<boolean> {
  if (process.env.SPARK_BOT_TEST_MODE === '1') {
    return true;
  }
  let spawnerAvailable = false;
  const runnerWritable = input.runnerPreflight?.runnerWritable || 'unknown';

  try {
    const gateRunner = input.gateRunner || runBuilderRouteConfidenceGate;
    spawnerAvailable = input.spawnerAvailableProbe
      ? await input.spawnerAvailableProbe()
      : await spawner.isAvailable().catch(() => false);
    const routeCapabilityState = spawnerAvailable ? 'available' : 'unavailable';
    const routeRunnerState = runnerWritable === 'no' ? 'unavailable' : 'available';
    const authorityVerdict = {
      schema_version: 'spark.authority_verdict.v1',
      decision: 'allowed',
      source_owner: 'spark-telegram-bot',
      action_family: 'spawner.build',
      permission_required: input.accessRequirement,
      confirmation_state: input.confirmationState || 'not_required'
    };
    const gate = await gateRunner({
      intent: 'build_dispatch',
      candidateRoute: 'spawner.build',
      routeContext: {
        latest_instruction: input.latestInstruction || 'allow_execution',
        intent_clarity: 'explicit',
        route_fit: 'exact',
        consequence_risk: buildDispatchConsequenceRisk(input.prd),
        permission_required: input.accessRequirement,
        authority_verdict: authorityVerdict,
        capability_state: routeCapabilityState,
        runner_state: routeRunnerState,
        confirmation_state: input.confirmationState || 'not_required',
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
      recordRouteConfidenceDispatchOutcome({
        route: 'spawner.build',
        decision,
        outcome: 'acted',
        requestId: input.requestId,
        traceRef: input.traceRef,
        policy: typeof gate.payload.safe_reply_policy === 'string' ? gate.payload.safe_reply_policy : undefined
      });
      return true;
    }
    recordRouteConfidenceDispatchOutcome({
      route: 'spawner.build',
      decision,
      outcome: 'blocked',
      requestId: input.requestId,
      traceRef: input.traceRef,
      policy: typeof gate.payload.safe_reply_policy === 'string' ? gate.payload.safe_reply_policy : undefined
    });
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
    if (isRouteConfidenceGateUnsupportedError(error)) {
      const allowedByLocalCompatibility = routeConfidenceGateCompatibilityAllows({
        latestInstruction: input.latestInstruction || 'allow_execution',
        confirmationState: input.confirmationState || 'not_required',
        spawnerAvailable,
        runnerWritable
      });
      recordRouteConfidenceDispatchOutcome({
        route: 'spawner.build',
        decision: allowedByLocalCompatibility ? 'act' : 'unavailable',
        outcome: allowedByLocalCompatibility ? 'acted' : 'failed_closed',
        requestId: input.requestId,
        traceRef: input.traceRef,
        policy: 'compat_builder_route_confidence_gate_missing'
      });
      if (allowedByLocalCompatibility) {
        console.warn('[RouteConfidenceGate] Builder gate command is unavailable; using local compatibility gate for explicit build dispatch.');
        return true;
      }
      await input.ctx.reply([
        'I can shape the build, but I cannot prove the route gate from this Builder version yet.',
        '',
        'Try /diagnose, then ask again after Spark finishes syncing.'
      ].join('\n'));
      return false;
    }
    recordRouteConfidenceDispatchOutcome({
      route: 'spawner.build',
      decision: 'unavailable',
      outcome: 'failed_closed',
      requestId: input.requestId,
      traceRef: input.traceRef,
      policy: 'fail_closed_gate_unavailable'
    });
    console.warn('[RouteConfidenceGate] build dispatch failed closed:', redactText(error instanceof Error ? error.message : String(error)));
    await input.ctx.reply(renderSparkErrorReply(
      error instanceof Error ? error : new Error(String(error)),
      'builder',
      conversation.isAdmin(input.ctx.from)
    ));
    return false;
  }
}

export function isRouteConfidenceGateUnsupportedError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return (
    /\broute-confidence-gate\b/i.test(message) &&
    (
      /\binvalid choice\b/i.test(message) ||
      /\bunrecognized arguments?\b/i.test(message) ||
      /\bNo such command\b/i.test(message) ||
      /\bunknown command\b/i.test(message)
    )
  );
}

export function routeConfidenceGateCompatibilityAllows(input: {
  latestInstruction: 'allow_execution' | 'no_execution';
  confirmationState: 'not_required' | 'confirmed' | 'missing';
  spawnerAvailable: boolean;
  runnerWritable: 'yes' | 'no' | 'unknown';
}): boolean {
  if (input.latestInstruction === 'no_execution') return false;
  if (input.confirmationState === 'missing') return false;
  if (!input.spawnerAvailable) return false;
  if (input.runnerWritable === 'no') return false;
  return true;
}

interface RunCommandOptions {
  allowBuildIntent?: boolean;
  missionName?: string;
  relayGoal?: string;
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
      buildIntent.buildModeReason,
      undefined,
      buildIntent.buildLane,
      buildIntent.buildLaneReason
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
    goal: options.relayGoal || goal,
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
  capabilityProposalPacket?: Record<string, unknown>,
  buildLane: BuildLane = buildLaneForMode(buildMode),
  buildLaneReason = 'Build lane inferred from build mode.'
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
    reason: `Telegram access gate passed for build /run; dispatching to Spawner PRD bridge with ${buildLane} lane.`
  });
  if (!(await buildDispatchRouteConfidenceAllows({ ctx, accessRequirement, prd, requestId, traceRef, runnerPreflight }))) {
    return;
  }

  const polishedProjectName = capabilityProposalPacket
    ? projectName
    : polishBuildProjectName(projectName);
  const prdContent = projectPath
    ? `# ${polishedProjectName}\n\nBuild mode: ${buildMode}\nBuild mode reason: ${buildModeReason}\nBuild lane: ${buildLane}\nBuild lane reason: ${buildLaneReason}\nTarget workspace/project path: \`${projectPath}\`\n\n${prd}`
    : `# ${polishedProjectName}\n\nBuild mode: ${buildMode}\nBuild mode reason: ${buildModeReason}\nBuild lane: ${buildLane}\nBuild lane reason: ${buildLaneReason}\n\n${prd}`;

  const tier = getTierForUser(ctx.from.id);
  try {
    const res = await postLocalServiceWithRetry(
      `${spawnerUrl}/api/prd-bridge/write`,
      {
        content: prdContent,
        requestId,
        traceRef,
        projectName: polishedProjectName,
        buildMode,
        buildModeReason,
        buildLane,
        buildLaneReason,
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
        options: prdBridgeOptionsForBuildLane(buildLane)
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
        projectName: polishedProjectName,
        projectPath,
        buildMode,
        buildModeReason,
        buildLane,
        buildLaneReason,
        capabilityProposalPacket,
        questions: res.data.openQuestions,
        addedAssumptions: res.data.addedAssumptions ?? [],
        timestamp: Date.now()
      });

      const clarificationQuestions = res.data.openQuestions.filter((q: unknown): q is string => typeof q === 'string');
      const clarificationAssumptions = Array.isArray(res.data.addedAssumptions)
        ? res.data.addedAssumptions.filter((a: unknown): a is string => typeof a === 'string')
        : [];
      await ctx.reply(await buildBuildClarificationReply(polishedProjectName, clarificationQuestions, clarificationAssumptions));
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
      goal: polishedProjectName || prd,
      createdAt: new Date().toISOString(),
      updateId: typeof ctx.update.update_id === 'number' ? ctx.update.update_id : undefined
    });

    await ctx.reply(formatBuildMissionQueuedReply({
      lead: 'Got it. Spark is on it.',
      projectName: polishedProjectName,
      buildMode,
      buildLane,
      projectPath,
      missionId,
      kanbanUrl
    }), outboundTraceExtra({
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
      userId: Number(ctx.from.id),
      projectName: polishedProjectName,
      requestId,
      missionId,
      spawnerUrl,
      publicSpawnerUrl,
      canvasUrl,
      kanbanUrl,
      buildLane,
      tier
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

  await ctx.reply('I will stage the creator mission first. No run or publishing yet.');
  await handleCreatorMissionPlan(ctx, parsed);
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
    return ctx.reply(renderTelegramError('Chip create failed', result.error));
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

    if (parsed.action === 'status') {
      if (!parsed.id) return ctx.reply('Usage: /recursive status <path>');
      await safeSendChatAction(ctx, 'typing');
      const target = await resolveRecursiveStartTarget(parsed.id);
      if (target.kind !== 'path') {
        return ctx.reply(`${parsed.id} does not look like an attached specialization path yet. Use /recursive paths to pick a loop.`);
      }
      return ctx.reply(renderSpecializationLoopStatus(await readSpecializationPathLoopStatus(target)));
    }

    if (parsed.action === 'compare' || parsed.action === 'evidence') {
      if (!parsed.id) return ctx.reply(`Usage: /recursive ${parsed.action} <path>`);
      await safeSendChatAction(ctx, 'typing');
      const target = await resolveRecursiveStartTarget(parsed.id);
      if (target.kind !== 'path') {
        return ctx.reply(`${parsed.id} does not look like an attached specialization path yet. Use /recursive paths to pick a loop.`);
      }
      const status = await readSpecializationPathLoopStatus(target);
      return ctx.reply(parsed.action === 'compare'
        ? renderSpecializationLoopComparison(status)
        : renderSpecializationLoopEvidence(status));
    }

    if (parsed.action === 'package') {
      if (!parsed.id) return ctx.reply('Usage: /recursive package <path>');
      await safeSendChatAction(ctx, 'typing');
      const target = await resolveRecursiveStartTarget(parsed.id);
      if (target.kind !== 'path') {
        return ctx.reply(`${parsed.id} does not look like an attached specialization path yet. Use /recursive paths to pick a loop.`);
      }
      return ctx.reply(renderSpecializationLoopPackage(await packageSpecializationPathLoop(target)));
    }

    if (parsed.action === 'report') {
      if (!parsed.id) return ctx.reply('Usage: /recursive report <id>');
      await safeSendChatAction(ctx, 'typing');
      const target = await resolveRecursiveStartTarget(parsed.id);
      if (target.kind === 'path') {
        return ctx.reply(renderSpecializationLoopInsights(await readSpecializationPathLoopInsights(target)));
      }
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
      const actor = `telegram:${userRef(ctx.from?.id)}`;
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
      if (!parsed.chipKey) return ctx.reply('Usage: /recursive start <targetKey> [rounds <n>]');
      const chatId = ctx.chat.id;
      const rounds = parsed.rounds || 3;
      const startTarget = await resolveRecursiveStartTarget(parsed.chipKey);
      await safeSendChatAction(ctx, 'typing');
      const targetLabel = startTarget.kind === 'path' ? 'Spark Swarm specialization path loop' : 'recursive Builder chip loop';
      const startLine = startTarget.kind === 'path'
        ? `🧪 I’m starting ${startTarget.key} for ${rounds} benchmark round(s). I’ll keep the raw evidence local and send the summary when the loop settles.`
        : `🧪 I’m starting ${targetLabel} on ${startTarget.key} for ${rounds} round(s). I’ll send the summary when it settles.`;
      await ctx.reply(startLine);

      void (async () => {
        try {
          if (startTarget.kind === 'path') {
            const result = await runSpecializationPathAutoloop(startTarget, rounds, sparkWorkspaceBridgeHints());
            if (!result.ok) {
              await ctx.telegram.sendMessage(chatId, renderTelegramError('Recursive path loop failed', result.error));
              return;
            }
            const insights = await readSpecializationPathLoopInsights(startTarget);
            await ctx.telegram.sendMessage(
              chatId,
              insights.ok ? renderSpecializationLoopInsights(insights) : renderSpecializationPathLoopCompletion(result)
            );
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

  const raw = extractTelegramCommandArgs(ctx.message.text, 'access');
  const current = await getSparkAccessProfile(ctx.chat.id);
  if (!raw || raw.toLowerCase() === 'status') {
    await ctx.reply(await renderAuthoritativeSparkAccessStatus(ctx.chat.id), buildSparkAccessActionKeyboard(current));
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

function extractTelegramCommandArgs(text: string, command: string): string {
  const escapedCommand = command.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = text.match(new RegExp(`^\\s*/${escapedCommand}(?:@\\w+)?(?:\\s+([\\s\\S]*?))?\\s*$`, 'i'));
  if (match) {
    return (match[1] || '').trim();
  }
  return text.replace(new RegExp(`^\\s*/${escapedCommand}\\b`, 'i'), '').trim();
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
    const detail = redactText(error instanceof Error ? error.message : String(error));
    await ctx.reply(`Access Level 5 setup failed: ${detail}`);
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
    const detail = redactText(error instanceof Error ? error.message : String(error));
    await ctx.reply(`Spark access action failed: ${detail}`);
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

// Handle regular text messages
export async function handleTextMessage(ctx: any): Promise<void> {
  const user = ctx.from;
  const text = ctx.message.text;

  if (text.startsWith('/')) {
    return;
  }

  const naturalRouteShadow = await recordNaturalRouteShadow(ctx, text);
  const globalAgentDoctrineRequest = isGlobalAgentDoctrineRequest(text);
  const parsedEarlyBuildIntent = conversation.isAdmin(ctx.from) && !globalAgentDoctrineRequest ? parseBuildIntent(text) : null;
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
  const noStartMissionTitleReply = !earlyBuildIntent && conversation.isAdmin(ctx.from)
    ? buildNoStartMissionTitleReply(text)
    : null;
  if (noStartMissionTitleReply) {
    await conversation.remember(user, text).catch(() => {});
    recordNaturalRouteExecution(ctx, naturalRouteShadow, 'spawner.title_probe', 'spark-telegram-bot', 'answer');
    await ctx.reply(noStartMissionTitleReply);
    await conversation.rememberAssistantReply(user, noStartMissionTitleReply).catch(() => {});
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

  if (!earlyBuildIntent && conversation.isAdmin(ctx.from) && isLatestCanvasPlanQuestion(text)) {
    const latestPlan = latestCanvasPlans.get(canvasPlanKey(ctx.chat?.id, ctx.from?.id)) ||
      await readLatestCanvasPlanFromSpawnerState();
    if (latestPlan) {
      const reply = formatLatestCanvasPlanReply(latestPlan);
      await conversation.remember(user, text).catch(() => {});
      await ctx.reply(reply);
      await conversation.rememberAssistantReply(user, reply).catch(() => {});
      return;
    }
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

  if (!earlyBuildIntent && shouldAnswerRestartNeededQuestion(text)) {
    await conversation.remember(user, text).catch(() => {});
    const reply = await renderRestartNeededAnswer();
    await ctx.reply(reply);
    recordTelegramSourceUsedEvidence(ctx, user, text, 'telegram_restart_needed_answer', runtimeTruthSourceEvidence(text));
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

  if (!earlyBuildIntent && isSpawnerGoldenPathRequest(text)) {
    await conversation.remember(user, text).catch(() => {});
    const replyPhrase = extractNoEditMissionReplyPhrase(text);
    const missionId = await handleRunCommand(
      ctx,
      noEditProbeGoal(replyPhrase, text),
      [missionDefaultProvider()],
      'spawner_build',
      { missionName: 'Telegram Golden Path Probe', relayGoal: text }
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
      await conversation.learnAboutUser(user, `Started Spawner golden-path probe mission ${missionId} from Telegram; requested exact reply: ${replyPhrase}.`).catch(() => {});
    }
    return;
  }

  if (!earlyBuildIntent && shouldAnswerAuthoritativeRuntimeStatus(text)) {
    await conversation.remember(user, text).catch(() => {});
    const reply = await renderAuthoritativeSparkLiveStateAnswer({ rawDetails: shouldShowRawSparkLiveDetails(text) });
    await ctx.reply(reply);
    recordTelegramSourceUsedEvidence(ctx, user, text, 'telegram_live_state_answer', runtimeTruthSourceEvidence(text));
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

  if (!earlyBuildIntent && isAccessStatusQuestion(text) && deterministicRouteAllowed('access.status', text)) {
    await conversation.remember(user, text).catch(() => {});
    const reply = await renderAuthoritativeSparkAccessStatus(ctx.chat.id);
    await ctx.reply(reply);
    recordTelegramSourceUsedEvidence(ctx, user, text, 'telegram_access_status_answer', [
      {
        source: 'spark_access_status',
        role: 'access_truth',
        freshness: 'fresh',
        sourceRef: 'spark access status --json',
        summary: 'Telegram answered access status from the Spark CLI access state and runner writability preflight.'
      }
    ]);
    await conversation.rememberAssistantReply(user, reply).catch(() => {});
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

  if (!earlyBuildIntent && isSparkThreadQaGoldenCaseRequest(text)) {
    const reply = renderSparkThreadQaGoldenCaseReply(text);
    await conversation.remember(user, text).catch(() => {});
    recordNaturalRouteExecution(ctx, naturalRouteShadow, 'conversation.thread_qa_golden_case', 'spark-telegram-bot', 'plain_chat.qa_fixture');
    await ctx.reply(reply);
    await conversation.rememberAssistantReply(user, reply).catch(() => {});
    return;
  }

  if (!earlyBuildIntent && isMissionRoutingFailureClassQuestion(text)) {
    const reply = renderMissionRoutingFailureClassReply(text);
    await conversation.remember(user, text).catch(() => {});
    recordNaturalRouteExecution(ctx, naturalRouteShadow, 'conversation.mission_routing_failure_class', 'spark-telegram-bot', 'plain_chat.qa_boundary');
    await ctx.reply(reply);
    await conversation.rememberAssistantReply(user, reply).catch(() => {});
    return;
  }

  if (!earlyBuildIntent && isSparkWorkflowBugHuntRequest(text)) {
    const reply = renderSparkWorkflowBugHuntReply(text);
    await conversation.remember(user, text).catch(() => {});
    recordNaturalRouteExecution(ctx, naturalRouteShadow, 'conversation.qa_planning', 'spark-telegram-bot', 'plain_chat.qa_plan');
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

  if (!earlyBuildIntent && await handleNaturalRecursiveRoute(ctx, user, text, naturalRouteShadow)) {
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
  const recentMessagesForNaturalRouting = conversation.isAdmin(ctx.from)
    ? await conversation.getRecentMessages(ctx.from, 15).catch(() => [])
    : [];
  const naturalCreatorIntent = conversation.isAdmin(ctx.from) ? parseNaturalCreatorMissionIntent(text, recentMessagesForNaturalRouting) : null;
  const recentCreatorLoopContext = recentMessagesForNaturalRouting.some((message) => (
    /\b(?:creator\s+(?:mission|system|run)|speciali[sz]ation\s+path|benchmark\s+pack|autoloop|startup[-\s]+yc|shareable\s+insight\s+packet|reusable\s+template|recursive\s+loop)\b/i.test(message)
  ));
  const creatorLoopDomainChipFollowup =
    recentCreatorLoopContext &&
    /\b(?:domain[-\s]*chip|chip)\b/i.test(text) &&
    (
      /\b(?:the|this|that|current|existing)\s+(?:domain[-\s]*chip|chip)\b/i.test(text) ||
      /\b(?:create|update|attach|add|link)\b.{0,24}\b(?:domain[-\s]*chip|chip)\b/i.test(text)
    );
  const earlyNaturalChipBrief = conversation.isAdmin(ctx.from) ? parseNaturalChipCreateIntent(text) : null;
  if (naturalCreatorIntent && (!earlyNaturalChipBrief || creatorLoopDomainChipFollowup) && deterministicRouteAllowed('creator.mission', text)) {
    await conversation.remember(user, text).catch(() => {});
    await ctx.reply(`I will stage the ${naturalCreatorIntent.artifactLabel} privately first. No run or publishing yet.`);
    await handleCreatorMissionPlan(ctx, naturalCreatorIntent);
    return;
  }
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
  if (!earlyBuildIntent && shouldPreferConversationalIdeation(text)) {
    console.log(`[ConversationIntent] early ideation route user=${userRef(ctx.from?.id)} textLen=${text.length}`);
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
    const response = applyPlainWordsSurfaceRequest(text, isLowInformationLlmReply(llmResponse)
      ? buildIdeationFallbackReply(text)
      : llmResponse);
    await ctx.reply(response);
    await conversation.rememberAssistantReply(user, response).catch(() => {});
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
  const naturalLocalMemoryRecall = earlyBuildIntent ? null : await buildNaturalLocalMemoryRecallReply(user, text);
  if (naturalLocalMemoryRecall) {
    await conversation.remember(user, text).catch(() => {});
    await ctx.reply(naturalLocalMemoryRecall);
    await conversation.rememberAssistantReply(user, naturalLocalMemoryRecall).catch(() => {});
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
    const pendingExecutionKey = `${ctx.chat.id}-${ctx.from.id}`;
    const pendingClarification = pendingClarificationForMessage(pendingExecutionKey, text);

    // Build intent gets first refusal inside the admin lane. Utility helpers can
    // still extract preferences from the same prompt, but they must not stop a
    // detailed project brief from becoming a mission.
    if (isNoExecutionBoundary(text) && clearPendingExecutionState(pendingExecutionKey)) {
      await conversation.remember(user, text).catch(() => {});
      await ctx.reply('Got it, no build or mission started. We can keep talking here.');
      return;
    }

    if (pendingClarification && isPendingClarificationFollowup(text)) {
      await handleClarificationAnswers(ctx, text);
      return;
    }

    if (deterministicRouteAllowed('domain_chip.pending', text) && await handlePendingDomainChipBuild(ctx, text)) {
      await conversation.remember(user, text).catch(() => {});
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
      console.log(`[BuildIntent] route user=${userRef(ctx.from?.id)} project=${JSON.stringify(buildIntent.projectName).slice(0, 80)}`);
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
        buildIntent.buildModeReason,
        undefined,
        buildIntent.buildLane,
        buildIntent.buildLaneReason
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

    if (isBareExecutionStart(text)) {
      await conversation.remember(user, text).catch(() => {});
      await ctx.reply('I am not seeing an active build or mission waiting from here. Give me the target again and I will route it fresh.');
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
      const result = spawnerBoardIntent === 'latest_provider'
        ? await spawner.latestProviderSummary()
        : spawnerBoardIntent === 'latest_mission'
          ? await spawner.latestMissionSummary()
        : spawnerBoardIntent === 'latest_on_kanban'
          ? await spawner.latestKanbanSummary()
          : spawnerBoardIntent === 'latest_project_preview'
            ? await spawner.latestProjectPreview()
            : spawnerBoardIntent === 'latest_failure'
              ? await spawner.latestFailureSummary()
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
        console.log(`[ConversationIntent] inferred contextual improvement mission user=${userRef(ctx.from?.id)} textLen=${text.length}`);
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
      console.log(`[ConversationIntent] inferred mission from follow-up user=${userRef(ctx.from?.id)} textLen=${text.length}`);
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
      console.log(`[ConversationIntent] ideation route user=${userRef(ctx.from?.id)} textLen=${text.length}`);
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
      const response = applyPlainWordsSurfaceRequest(text, isLowInformationLlmReply(llmResponse)
        ? buildIdeationFallbackReply(text)
        : llmResponse);
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
    console.log(`[Bridge] user=${userRef(ctx.from?.id)} used=${builderReply.used} mode=${builderReply.bridgeMode} routing=${builderReply.routingDecision} textLen=${(builderReply.responseText || '').length} hasVoice=${Boolean(builderReply.voiceMedia)}`);
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
        const responseText = applyPlainWordsSurfaceRequest(text, builderReply.responseText);
        await deliverBuilderReply(ctx, { ...builderReply, responseText });
        if (responseText) {
          await conversation.rememberAssistantReply(user, responseText).catch(() => {});
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
    const response = applyPlainWordsSurfaceRequest(text, await llm.chat(chatPrompt, systemContext, memories));

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
    console.log(`[ImageBridge] user=${userRef(ctx.from?.id)} used=${builderReply.used} mode=${builderReply.bridgeMode} routing=${builderReply.routingDecision} textLen=${(builderReply.responseText || '').length}`);

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
    console.log(`[VoiceBridge] user=${userRef(ctx.from?.id)} used=${builderReply.used} mode=${builderReply.bridgeMode} routing=${builderReply.routingDecision} textLen=${(builderReply.responseText || '').length} hasVoice=${Boolean(builderReply.voiceMedia)}${voiceTiming}`);

    if (builderReply.used && builderReply.bridgeMode !== 'bridge_error' && (builderReply.responseText || builderReply.voiceMedia)) {
      await deliverBuilderReply(ctx, builderReply);
      const deliveredAt = Date.now();
      console.log(
        `[VoiceBridgeTiming] user=${userRef(ctx.from?.id)} remember_ms=${rememberedAt - startedAt} media_ms=${mediaReadyAt - rememberedAt} builder_ms=${builderReadyAt - mediaReadyAt} deliver_ms=${deliveredAt - builderReadyAt} total_ms=${deliveredAt - startedAt}`
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
