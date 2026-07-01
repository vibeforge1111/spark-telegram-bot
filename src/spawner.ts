import axios from 'axios';
import {
  createHarnessCoreActionEnvelopeVNext,
  createHarnessCoreAuthorizedGovernorDecision,
  type HarnessCoreActionMutationClass
} from '@spark/harness-core';
import { telegramRelayIdentityFromEnv } from './relayIdentity';
import { spawnerAxiosOptions } from './spawnerAuth';
import { resolveProjectPreviewBaseUrl, resolveSpawnerPublicUrl, resolveSpawnerUiUrl } from './spawnerUrl';
import { DEFAULT_LOCAL_SERVICE_TIMEOUT_MS, localServiceDefaultTimeoutMs, positiveIntegerEnv } from './timeoutConfig';
import type { SkillTier } from './userTier';
import { creatorMissionClosureProof } from './creatorMissionClosureProof';
import { domainChipLabsEvidenceSurfaceLine, formatDomainChipLabsContractProofLine } from './domainChipLabsCreatorContract';
const SPAWNER_UI_URL = resolveSpawnerUiUrl();
const PROJECT_PREVIEW_URL = resolveProjectPreviewBaseUrl();
const SPARK_RUN_PROJECT_PATH = process.env.SPARK_RUN_PROJECT_PATH?.trim();
type MissionAction = 'status' | 'pause' | 'resume' | 'kill';
type CreatorPrivacyMode = 'local_only' | 'github_pr' | 'swarm_shared';
type CreatorRiskLevel = 'low' | 'medium' | 'high';

interface RunGoalInput {
  goal: string;
  missionName?: string;
  chatId: string;
  userId: string;
  requestId: string;
  traceRef?: string;
  executionAuthority?: unknown;
  tier?: SkillTier;
  providers?: string[];
  promptMode?: 'simple' | 'orchestrator';
}

interface RunGoalResult {
  success: boolean;
  missionId?: string;
  requestId?: string;
  providers?: string[];
  error?: string;
}

interface LoopEngineeringRunInput {
  chipKey: string;
  objective?: string;
  roundLimit?: number;
  benchmarkCaseIds?: string[];
  executeNow?: boolean;
  sourceSurface?: 'telegram' | 'spawner';
  requestId?: string;
  executionAuthority?: unknown;
}

interface LoopEngineeringRunResult {
  success: boolean;
  action?: string;
  missionId?: string;
  eventId?: string;
  inspectUrl?: string;
  message?: string;
  event?: Record<string, unknown>;
  mission?: Record<string, unknown>;
  commandResult?: Record<string, unknown>;
  error?: string;
}

interface LoopEngineeringChipSummary {
  id: string;
  name?: string;
  domain?: string;
  statusLabel?: string;
  status?: string;
  nextAction?: string;
  benchmark?: {
    utilityDelta?: number | null;
  };
}

interface LoopEngineeringChipListResult {
  success: boolean;
  chips?: LoopEngineeringChipSummary[];
  inspectUrl?: string;
  error?: string;
}

interface LoopEngineeringEvaluatorReviewInput {
  chipKey: string;
  previousScore: number;
  candidateScore: number;
  roundsObserved?: number;
  evidenceRefs: string[];
  label?: string;
  sourceSurface?: 'telegram' | 'spawner';
  requestId?: string;
  executionAuthority?: unknown;
}

interface LoopEngineeringDistillationInput {
  chipKey: string;
  sourceEvaluatorEventId: string;
  lessons: string[];
  runtimeNotes?: string;
  tokenBudgetHint?: string;
  evidenceRefs?: string[];
  sourceSurface?: 'telegram' | 'spawner';
  requestId?: string;
  executionAuthority?: unknown;
}

interface LoopEngineeringActivationInput {
  chipKey: string;
  useCase: string;
  surfaces?: Array<'telegram' | 'spawner' | 'builder' | 'codex' | 'scheduler'>;
  mode?: 'manual' | 'suggested' | 'local_fast_path';
  triggerPatterns?: string[];
  nonTriggerPatterns?: string[];
  riskPolicy?: 'low_only' | 'review_packet' | 'loop_mode_required';
  approvalRequired?: boolean;
  rollbackRef?: string;
  sourceSurface?: 'telegram' | 'spawner';
  requestId?: string;
  executionAuthority?: unknown;
}

interface LoopEngineeringBenchmarkCaseInput {
  chipKey: string;
  kind: 'visible' | 'held_out' | 'trap' | 'no_op' | 'regression';
  prompt: string;
  expectedBehavior: string;
  scoringRubricRef?: string;
  evidenceRefs?: string[];
  sourceSurface?: 'telegram' | 'spawner';
  requestId?: string;
  executionAuthority?: unknown;
}

interface LoopEngineeringScheduleInput {
  chipKey: string;
  name?: string;
  mode?: 'once' | 'interval' | 'fixed_time' | 'continuous' | 'round_count';
  intervalMinutes?: number;
  fixedLocalTime?: string;
  timezone?: string;
  roundLimit: number;
  stopConditions?: string[];
  sourceSurface?: 'telegram' | 'spawner';
  requestId?: string;
  executionAuthority?: unknown;
}

interface LoopEngineeringScheduleFireInput {
  chipKey: string;
  scheduleId: string;
  sourceSurface?: 'telegram' | 'spawner' | 'scheduler';
  requestId?: string;
  executionAuthority?: unknown;
}

interface LoopEngineeringCompletionInput {
  chipKey: string;
  eventId: string;
  missionId?: string;
  status: 'passed' | 'failed' | 'blocked';
  previousScore?: number;
  candidateScore?: number;
  utilityDelta?: number;
  roundsObserved?: number;
  evaluatorSeparated?: boolean;
  evidenceRefs?: string[];
  sourceRef?: string;
  evaluatorVerdictRef?: string;
  scheduleId?: string;
  nextAction?: string;
  requestId?: string;
  executionAuthority?: unknown;
}

interface CreatorMissionInput {
  brief: string;
  requestId?: string;
  missionId?: string;
  privacyMode?: CreatorPrivacyMode;
  riskLevel?: CreatorRiskLevel;
  executionPolicy?: 'manual_run' | 'read_only';
  executionAuthority?: unknown;
}

function safeDomainChipKey(value: string): string | null {
  const clean = String(value || '').trim().toLowerCase();
  return /^domain-chip-[a-z0-9][a-z0-9-]{2,}$/.test(clean) ? clean : null;
}

interface CreatorIntentPacket {
  target_domain?: string;
  privacy_mode?: CreatorPrivacyMode;
  risk_level?: CreatorRiskLevel;
}

interface CreatorCanonicalStatus {
  verdict?: string;
  evidence_tier?: string;
}

interface CreatorPublicationStatus {
  publish_mode?: CreatorPrivacyMode;
  swarm_shared_allowed?: boolean;
  network_absorbable?: boolean;
}

interface CreatorMissionTrace {
  mission_id?: string;
  request_id?: string;
  creator_mode?: string;
  artifacts?: string[];
  artifact_manifests?: Array<{ artifact_id?: string; artifact_type?: string; repo?: string; validation_commands?: string[] }>;
  artifact_manifest_validation_issues?: unknown[];
  validation_runs?: CreatorValidationRun[];
  current_stage?: string;
  stage_status?: string;
  execution_policy?: string;
  publish_readiness?: string;
  blockers?: string[];
  tasks?: unknown[];
  intent_packet?: CreatorIntentPacket;
  canonical?: CreatorCanonicalStatus;
  publication?: CreatorPublicationStatus;
  links?: { canvas?: string; kanban?: string; review?: string; artifact?: string };
}

interface CreatorMissionResult {
  success: boolean;
  missionId?: string;
  requestId?: string;
  taskCount?: number;
  canvasUrl?: string;
  tracePath?: string;
  trace?: CreatorMissionTrace;
  error?: string;
}

interface CreatorMissionExecutionInput {
  missionId?: string;
  requestId?: string;
  executionAuthority?: unknown;
}

function governorDecisionAuthority(input: {
  source: string;
  reason: string;
  toolName: string;
  mutationClass: HarnessCoreActionMutationClass;
  requestId?: string;
  target?: string;
}) {
  const envelope = createHarnessCoreActionEnvelopeVNext({
    surface: 'telegram',
    ownerSystem: 'spawner-ui',
    source: input.source,
    reason: input.reason,
    toolName: input.toolName,
    mutationClass: input.mutationClass,
    requestId: input.requestId,
    actorKind: 'system',
    actorIdRef: 'spark-telegram-bot',
    target: input.target,
    confidence: 0.9
  });
  return createHarnessCoreAuthorizedGovernorDecision({
    envelope,
    tool_name: input.toolName,
    restrictions: {
      network_allowed: false,
      write_allowed: ['writes_files', 'creates_schedule', 'deletes_schedule', 'creates_chip', 'launches_mission'].includes(input.mutationClass),
      publish_allowed: input.mutationClass === 'publishes'
    }
  });
}

interface CreatorMissionLookupInput {
  missionId?: string;
  requestId?: string;
}

interface CreatorMissionStatusResult {
  success: boolean;
  missionId?: string;
  requestId?: string;
  tracePath?: string;
  trace?: CreatorMissionTrace;
  error?: string;
}

interface CreatorMissionExecutionResult {
  success: boolean;
  missionId?: string;
  requestId?: string;
  started?: boolean;
  skipped?: boolean;
  reason?: string;
  providerId?: string;
  projectPath?: string;
  canvasUrl?: string;
  trace?: CreatorMissionTrace;
  error?: string;
}

interface CreatorMissionValidationInput {
  missionId?: string;
  requestId?: string;
  maxCommands?: number;
}

interface CreatorValidationCommandResult {
  artifact_id?: string;
  artifact_type?: string;
  repo?: string;
  command?: string;
  cwd?: string;
  status?: 'passed' | 'failed' | 'skipped';
  exit_code?: number | null;
  stdout_tail?: string;
  stderr_tail?: string;
  error?: string | null;
}

interface CreatorValidationRun {
  run_id?: string;
  mission_id?: string;
  started_at?: string;
  completed_at?: string;
  status?: 'passed' | 'failed' | 'blocked';
  results?: CreatorValidationCommandResult[];
}

interface CreatorMissionValidationResult {
  success: boolean;
  missionId?: string;
  requestId?: string;
  status?: 'passed' | 'failed' | 'blocked';
  run?: CreatorValidationRun;
  trace?: CreatorMissionTrace;
  error?: string;
}

interface BoardEntry {
  missionId: string;
  missionName?: string | null;
  status: 'created' | 'running' | 'paused' | 'completed' | 'failed' | 'cancelled';
  lastEventType: string;
  lastUpdated: string;
  lastSummary: string;
  taskName: string | null;
  taskNames?: string[];
  taskCount?: number;
  telegramRelay?: {
    port?: number | null;
    profile?: string | null;
    url?: string | null;
  } | null;
  providerResults?: Array<{
    providerId?: string;
    status?: string;
    summary?: string;
  }>;
  providerSummary?: string;
}

const STALE_RUNNING_MISSION_MS = 15 * 60 * 1000;
const PROVIDER_LABELS: Record<string, string> = {
  claude: 'Claude',
  codex: 'Codex',
  minimax: 'MiniMax',
  zai: 'Z.AI'
};

type BoardBucket = 'running' | 'paused' | 'completed' | 'failed' | 'cancelled' | 'created';
type BoardSnapshot = Record<BoardBucket, BoardEntry[]>;

export function localServiceTimeoutMs(envKey: string, fallbackMs = DEFAULT_LOCAL_SERVICE_TIMEOUT_MS): number {
  const defaultMs = process.env.SPARK_LOCAL_SERVICE_TIMEOUT_MS
    ? positiveIntegerEnv(process.env, 'SPARK_LOCAL_SERVICE_TIMEOUT_MS', fallbackMs)
    : fallbackMs;
  return positiveIntegerEnv(process.env, envKey, defaultMs);
}

function isRetryableLocalServiceError(err: any): boolean {
  const code = String(err?.code || '').toUpperCase();
  const message = String(err?.message || '').toLowerCase();
  return (
    code === 'ECONNABORTED' ||
    code === 'ECONNRESET' ||
    code === 'ETIMEDOUT' ||
    message.includes('timeout') ||
    message.includes('socket hang up')
  );
}

export async function postLocalServiceWithRetry<T = any>(
  url: string,
  body: unknown,
  timeoutMs = DEFAULT_LOCAL_SERVICE_TIMEOUT_MS
): Promise<{ data: T }> {
  try {
    return await axios.post(url, body, spawnerAxiosOptions(timeoutMs));
  } catch (err: any) {
    if (!isRetryableLocalServiceError(err)) throw err;
    try {
      return await axios.post(url, body, spawnerAxiosOptions(timeoutMs));
    } catch (retryErr: any) {
      const original = err?.message || 'local service request failed';
      const retry = retryErr?.message || 'retry failed';
      retryErr.message = `${retry} after retry. First attempt: ${original}`;
      throw retryErr;
    }
  }
}

function normalizeBucket(value: unknown): BoardEntry[] {
  return Array.isArray(value) ? value as BoardEntry[] : [];
}

function isFreshRunningEntry(entry: BoardEntry): boolean {
  const ageMs = Date.now() - Date.parse(entry.lastUpdated);
  return !Number.isFinite(ageMs) || ageMs < STALE_RUNNING_MISSION_MS;
}

async function fetchBoardSnapshot(): Promise<BoardSnapshot> {
  const res = await axios.get(`${SPAWNER_UI_URL}/api/mission-control/board`, spawnerAxiosOptions(10000));
  const board = res.data?.board || {};
  return {
    running: normalizeBucket(board.running).filter(isFreshRunningEntry),
    paused: normalizeBucket(board.paused),
    completed: normalizeBucket(board.completed),
    failed: normalizeBucket(board.failed),
    cancelled: normalizeBucket(board.cancelled),
    created: normalizeBucket(board.created)
  };
}

function latestBoardEntry(board: BoardSnapshot): BoardEntry | null {
  const entries = [
    ...board.running,
    ...board.paused,
    ...board.completed,
    ...board.failed,
    ...board.cancelled,
    ...board.created
  ];
  entries.sort((a, b) => Date.parse(b.lastUpdated || '') - Date.parse(a.lastUpdated || ''));
  return entries[0] || null;
}

function latestFailureEntry(board: BoardSnapshot): BoardEntry | null {
  const entries = [
    ...board.failed,
    ...board.running,
    ...board.completed,
    ...board.created
  ];
  entries.sort((a, b) => Date.parse(b.lastUpdated || '') - Date.parse(a.lastUpdated || ''));
  return entries.find((entry) => entry.status === 'failed' || entry.lastEventType === 'mission_failed') || null;
}

function isKnownProviderLabel(value: string | null | undefined): value is string {
  if (!value?.trim()) return false;
  const normalized = value.trim().toLowerCase();
  return Boolean(PROVIDER_LABELS[normalized]) || [
    'codex',
    'claude',
    'zai',
    'openai',
    'openrouter',
    'minimax',
    'ollama',
    'lmstudio',
    'huggingface'
  ].includes(normalized);
}

function providerNames(entry: BoardEntry): string | null {
  const names = (entry.providerResults || [])
    .map((provider) => provider.providerId)
    .filter((name): name is string => Boolean(name?.trim()));

  if (names.length > 0) {
    return [...new Set(names)].map(formatProviderLabel).join(', ');
  }

  const summaryPrefix = entry.providerSummary?.match(/^([^:]+):/)?.[1]?.trim();
  if (isKnownProviderLabel(summaryPrefix)) return formatProviderLabel(summaryPrefix);
  if (isKnownProviderLabel(entry.taskName)) return formatProviderLabel(entry.taskName);
  return null;
}

function formatProviderLabel(providerId: string): string {
  const normalized = providerId.trim().toLowerCase();
  return PROVIDER_LABELS[normalized] || providerId.trim();
}

function normalizeLocalProjectPath(pathValue: string): string {
  const normalized = pathValue.trim().replace(/^file:\/\/\/?/i, '').replace(/\\/g, '/');
  const wslDrive = normalized.match(/^\/([a-zA-Z])\/(.+)$/);
  if (wslDrive) return `${wslDrive[1].toUpperCase()}:/${wslDrive[2]}`.replace(/\/+$/, '');
  return normalized.replace(/\/+$/, '');
}

function projectPreviewLink(projectPath: string): string {
  const token = Buffer.from(normalizeLocalProjectPath(projectPath), 'utf8').toString('base64url');
  return `${PROJECT_PREVIEW_URL.replace(/\/+$/, '')}/preview/${token}/index.html`;
}

function extractProjectPathFromText(text: string): string | null {
  const patterns = [
    /(?:built|verified|created)[\s\S]{0,240}?(?:in|at)\s+`([^`\r\n]+)`/i,
    /Project:\s*([A-Za-z]:\\[^\r\n]+)/i,
    /Project folder:\s*([A-Za-z]:\\[^\r\n]+)/i,
    /(?:at|in)\s+([A-Za-z]:\\Users\\[^\r\n`]+)/i
  ];
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match?.[1]) return match[1].trim().replace(/[.。]\s*$/, '');
  }
  return null;
}

function extractPreviewUrlFromText(text: string): string | null {
  const match = text.match(/https?:\/\/(?:127\.0\.0\.1|localhost):\d+\/preview\/[A-Za-z0-9_-]+\/index\.html/i);
  return match?.[0] || null;
}

function providerResultText(entry: BoardEntry): string {
  return [
    entry.providerSummary,
    ...(entry.providerResults || []).map((result) => result.summary),
    entry.lastSummary,
    entry.missionName || ''
  ].filter((part): part is string => Boolean(part?.trim())).join('\n');
}

function rootRouteLooksLikeProject(text: string): boolean {
  return /\b(?:replaced the root screen|root route|src\/routes\/\+page|visiting\s+\/|at\s+\/)\b/i.test(text);
}

function projectOpenLinkForEntry(entry: BoardEntry): string | null {
  const text = providerResultText(entry);
  const projectPath = extractProjectPathFromText(text);
  return extractPreviewUrlFromText(text)
    || (projectPath ? projectPreviewLink(projectPath) : null)
    || (rootRouteLooksLikeProject(text) ? PROJECT_PREVIEW_URL.replace(/\/+$/, '') : null);
}

function isOperationalProbeMission(entry: BoardEntry): boolean {
  const title = missionTitle(entry);
  const text = providerResultText(entry);
  return /\btelegram\s+golden\s+path\s+probe\b/i.test(title)
    || /\bno[-\s]*edit\s+spawner\s+probe\b/i.test(title)
    || /\bgolden[-\s]*path\s+health\s+probe\b/i.test(text)
    || /\breply\s+with\s+exactly\b[\s\S]{0,140}\bdo\s+not\s+edit\s+files\b/i.test(text);
}

function missionTitle(entry: BoardEntry): string {
  return entry.missionName || entry.taskName || readableMissionTitleFromId(entry.missionId) || entry.missionId || 'latest mission';
}

function missionTitleForActiveSummary(entry: BoardEntry): string | null {
  const title = entry.missionName || entry.taskName || '';
  return title.trim() || readableMissionTitleFromId(entry.missionId);
}

function readableMissionTitleFromId(missionId: string | undefined): string | null {
  const slug = (missionId || '')
    .trim()
    .replace(/^spark-/i, '')
    .replace(/^mission-\d{6,}-?/i, '')
    .replace(/-\d{6,}.*$/i, '')
    .replace(/[-_]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (!slug || !/[a-z]/i.test(slug)) return null;
  return slug
    .split(' ')
    .map((word) => word ? word[0].toUpperCase() + word.slice(1).toLowerCase() : word)
    .join(' ');
}

function countWord(count: number): string {
  if (count === 0) return 'no';
  if (count === 1) return 'one';
  if (count === 2) return 'two';
  if (count === 3) return 'three';
  return String(count);
}

function activeMissionClause(entries: BoardEntry[], status: 'running' | 'paused'): string {
  if (entries.length === 0) return `no ${status} missions`;
  const visibleTitles = entries
    .map(missionTitleForActiveSummary)
    .filter((title): title is string => Boolean(title));
  if (entries.length === 1 && visibleTitles[0]) {
    return `one ${status} mission: ${visibleTitles[0]}`;
  }
  if (visibleTitles.length > 0) {
    const shown = visibleTitles.slice(0, 3).join(', ');
    const remaining = entries.length - visibleTitles.slice(0, 3).length;
    return `${countWord(entries.length)} ${status} missions: ${shown}${remaining > 0 ? `, plus ${remaining} more` : ''}`;
  }
  return `${countWord(entries.length)} ${status} mission${entries.length === 1 ? '' : 's'}`;
}

function contextualMissionCommandPicker(entries: BoardEntry[], statusLabel: string, action: MissionAction, verb: string): string {
  const shown = entries.slice(0, 5);
  const noun = statusLabel === 'active' ? 'active missions' : `${statusLabel} missions`;
  const lines = [
    `I see ${countWord(entries.length)} ${noun}. Which one should I ${verb}?`,
    '',
    ...shown.map((entry) => `- ${missionTitle(entry)}: \`/mission ${action} ${entry.missionId}\``)
  ];
  const remaining = entries.length - shown.length;
  if (remaining > 0) {
    lines.push('', `There ${remaining === 1 ? 'is' : 'are'} ${remaining} more on the board.`);
  }
  return lines.join('\n');
}

function formatActiveMissionsTelegramSummary(board: BoardSnapshot): string {
  if (board.running.length === 0 && board.paused.length === 0) {
    return 'Mission Control has nothing running or paused right now.';
  }

  if (board.running.length === 0) {
    const paused = activeMissionClause(board.paused, 'paused');
    const nextAction = board.paused.length === 1 ? ' You can say `resume that one` if you want it moving again.' : '';
    return `Mission Control has nothing running. ${paused[0]?.toUpperCase()}${paused.slice(1)}.${nextAction}`;
  }

  if (board.paused.length === 0) {
    const nextAction = board.running.length === 1 ? ' You can say `pause that one` if you want it held.' : '';
    return `Mission Control has ${activeMissionClause(board.running, 'running')}. Nothing paused.${nextAction}`;
  }

  const running = activeMissionClause(board.running, 'running');
  const paused = activeMissionClause(board.paused, 'paused');
  return `Mission Control has ${running}. ${paused[0]?.toUpperCase()}${paused.slice(1)}.`;
}

function statusPhrase(status: string): string {
  if (status === 'completed') return 'finished';
  if (status === 'failed') return 'failed';
  if (status === 'running') return 'is still running';
  if (status === 'paused') return 'is paused';
  if (status === 'cancelled') return 'was cancelled';
  return 'is waiting to start';
}

function boardInspectLine(): string {
  return `Board: ${missionBoardUrl()}`;
}

function missionScopedBoardUrl(missionId: string, baseUrl = spawnerPublicUrl()): string {
  return `${baseUrl.replace(/\/+$/, '')}/kanban?mission=${encodeURIComponent(missionId)}`;
}

function missionDetailUrl(missionId: string, baseUrl = spawnerPublicUrl()): string {
  return `${baseUrl.replace(/\/+$/, '')}/missions/${encodeURIComponent(missionId)}`;
}

function missionTraceUrl(missionId: string, baseUrl = spawnerPublicUrl()): string {
  return `${baseUrl.replace(/\/+$/, '')}/trace?missionId=${encodeURIComponent(missionId)}`;
}

function missionInspectionLines(missionId: string, baseUrl = spawnerPublicUrl()): string[] {
  return [
    'Inspect',
    `• Detail: ${missionDetailUrl(missionId, baseUrl)}`,
    `• Board: ${missionScopedBoardUrl(missionId, baseUrl)}`,
    `• Trace: ${missionTraceUrl(missionId, baseUrl)}`
  ];
}

function formatLatestKanbanTelegramSummary(entry: BoardEntry): string {
  const title = missionTitle(entry);
  const provider = providerNames(entry);
  const lines = [`The newest thing on the board is ${title}. It ${statusPhrase(statusWord(entry.status))}.`];

  if (provider) lines.push(`${provider} is attached to it.`);

  lines.push('', ...missionInspectionLines(entry.missionId));
  return lines.join('\n');
}

function formatLatestMissionTelegramSummary(entry: BoardEntry): string {
  const title = missionTitle(entry);
  const provider = providerNames(entry);
  const status = statusWord(entry.status);
  if (status === 'completed') {
    const lines = [
      provider
        ? `${title} finished cleanly. ${provider} handled it.`
        : `${title} finished cleanly.`
    ];
    const openLink = projectOpenLinkForEntry(entry);
    if (openLink) {
      lines.push('', 'Open it here:', openLink);
    }
    return lines.join('\n');
  }
  if (status === 'running') {
    return provider
      ? `${title} is still running. ${provider} is handling it.`
      : `${title} is still running.`;
  }
  if (status === 'failed') {
    return provider
      ? `${title} did not make it through. ${provider} was attached.`
      : `${title} did not make it through before a provider was reported.`;
  }
  if (status === 'cancelled') {
    return `${title} was cancelled.`;
  }
  if (status === 'paused') {
    return provider
      ? `${title} is paused. ${provider} is attached.`
      : `${title} is paused.`;
  }
  return provider
    ? `${title} is queued. ${provider} is attached, but it has not started yet.`
    : `${title} is queued. No LLM has picked it up yet.`;
}

function statusWord(status: string): string {
  if (status === 'completed') return 'completed';
  if (status === 'failed') return 'failed';
  if (status === 'running') return 'running';
  if (status === 'paused') return 'paused';
  if (status === 'cancelled') return 'cancelled';
  return 'queued';
}

function providerSummarySentence(provider: string | null, status: string, subject = 'latest Spawner job'): string {
  if (!provider) {
    if (status === 'queued') return `No LLM has picked up the ${subject} yet.`;
    if (status === 'failed') return `The ${subject} failed before it reported an LLM provider.`;
    if (status === 'paused') return `The ${subject} is paused before any LLM provider was reported.`;
    if (status === 'cancelled') return `The ${subject} was cancelled before any LLM provider was reported.`;
    return `The ${subject} has not reported an LLM provider yet.`;
  }
  if (status === 'completed') {
    return `${provider} took the ${subject}, and it finished.`;
  }
  if (status === 'running') {
    return `${provider} is on the ${subject} right now.`;
  }
  if (status === 'failed') {
    return `The ${subject} reached ${provider}, then failed.`;
  }
  if (status === 'cancelled') {
    return `The ${subject} was cancelled after ${provider} was attached.`;
  }
  if (status === 'paused') {
    return `The ${subject} is paused with ${provider} attached.`;
  }
  return `${provider} is attached to the ${subject}.`;
}

function formatLatestProviderTelegramSummary(entry: BoardEntry, opts: { subject?: string; boardOnly?: boolean } = {}): string {
  const provider = providerNames(entry);
  const status = statusWord(entry.status);
  const needsInspectionLink = entry.status === 'failed' || entry.status === 'paused';
  const subject = opts.subject || 'latest Spawner job';

  if (!provider) {
    const lines = [
      providerSummarySentence(null, status, subject)
    ];

    if (needsInspectionLink) {
      lines.push('', opts.boardOnly ? `Board: ${missionScopedBoardUrl(entry.missionId)}` : missionInspectionLines(entry.missionId).join('\n'));
    }

    return lines.join('\n');
  }

  const lines = [
    providerSummarySentence(provider, status, subject)
  ];

  if (entry.status === 'failed') {
    lines.push(
      '',
      'The board has the failure details if you want the trace.'
    );
  }

  lines.push('', opts.boardOnly ? `Board: ${missionScopedBoardUrl(entry.missionId)}` : missionInspectionLines(entry.missionId).join('\n'));
  return lines.join('\n');
}

function failureCauseLines(entry: BoardEntry): string[] {
  const text = providerResultText(entry).toLowerCase();
  const causes: string[] = [];
  const hasSkillApiFailure = /\bh70\b|\bskill api\b|\bapi\/h70-skills\b/.test(text);

  if (hasSkillApiFailure) {
    causes.push('Skill API was unreachable from the spawned Codex lane.');
  }
  if (/\bread[-\s]*only\b|\boperation not permitted\b|\bpatch was rejected\b|\bwrite probe\b|\bwrite(?:able|ability)?\b.*\bfailed\b/.test(text)) {
    causes.push('The spawned workspace was read-only.');
  }
  if (!hasSkillApiFailure && /\bconnection refused\b|\beconnrefused\b|\bfailed to connect\b/.test(text)) {
    causes.push('A local service connection failed inside the spawned lane.');
  }
  if (/\bauth\b|\boauth\b|\bunauthorized\b|\bforbidden\b|\b401\b|\b403\b/.test(text)) {
    causes.push('Provider/auth access needs a fresh check.');
  }

  return causes.length ? causes.slice(0, 3) : ['Spawner recorded a provider failure.'];
}

function formatLatestFailureTelegramSummary(entry: BoardEntry): string {
  const title = missionTitle(entry);
  const causes = failureCauseLines(entry);
  return [
    `That run did not make it through: ${title}.`,
    '',
    'What blocked it',
    ...causes.map((line) => `• ${line}`),
    '',
    `Board: ${missionScopedBoardUrl(entry.missionId)}`
  ].join('\n');
}

function boardEntrySentence(entry: BoardEntry, label: 'Active' | 'Latest'): string {
  const title = missionTitle(entry);
  const status = statusWord(entry.status);
  if (status === 'running') return `${label}: ${title} is running.`;
  if (status === 'paused') return `${label}: ${title} is paused.`;
  if (status === 'completed') return `${label}: ${title} finished.`;
  if (status === 'failed') return `${label}: ${title} failed.`;
  if (status === 'cancelled') return `${label}: ${title} was cancelled.`;
  return `${label}: ${title} is queued.`;
}

function boardCountLine(label: 'running' | 'paused' | 'queued', count: number, entry?: BoardEntry): string {
  const title = entry ? missionTitle(entry) : '';
  return `• ${label}: ${count}${title ? ` - ${title}` : ''}`;
}

function formatBoardTelegramSummary(board: BoardSnapshot): string {
  const counts = {
    running: board.running.length,
    paused: board.paused.length,
    completed: board.completed.length,
    failed: board.failed.length,
    cancelled: board.cancelled.length,
    queued: board.created.length
  };
  const history = counts.completed + counts.failed + counts.cancelled;
  const latest = latestBoardEntry(board);
  const lines = [
    'Right now',
    boardCountLine('running', counts.running, board.running[0]),
    boardCountLine('paused', counts.paused, board.paused[0]),
    boardCountLine('queued', counts.queued, board.created[0]),
    '',
    'History',
    `• total: ${history}`,
    `• complete: ${counts.completed}`,
    `• failed: ${counts.failed}`,
    `• cancelled: ${counts.cancelled}`
  ];

  const active = board.running[0] || board.paused[0] || board.created[0] || null;
  if (active) {
    const activeProvider = providerNames(active);
    if (activeProvider) {
      lines.push('', `${activeProvider} is attached.`);
    }
  }

  if (latest && latest !== active) {
    lines.push('', boardEntrySentence(latest, 'Latest'));
    const provider = providerNames(latest);
    if (provider) {
      lines.push(`${provider} is attached to the latest item.`);
    }
  }

  const inspectTarget = active || latest;
  if (inspectTarget) {
    lines.push('', `Board: ${missionScopedBoardUrl(inspectTarget.missionId)}`);
  } else {
    lines.push('', boardInspectLine());
  }

  return lines.join('\n');
}

function spawnerPublicUrl(): string {
  return resolveSpawnerPublicUrl().replace(/\/+$/, '');
}

function missionBoardUrl(): string {
  return `${spawnerPublicUrl()}/kanban`;
}

function creatorMissionKanbanUrl(missionId: string, baseUrl = spawnerPublicUrl()): string {
  return `${baseUrl.replace(/\/+$/, '')}/kanban?mission=${encodeURIComponent(missionId)}`;
}

function creatorWorkspaceUrl(surface: 'canvas' | 'kanban', baseUrl = spawnerPublicUrl()): string {
  return `${baseUrl.replace(/\/+$/, '')}/${surface}`;
}

function absoluteSpawnerUrl(value: string | undefined, baseUrl = spawnerPublicUrl()): string | undefined {
  if (!value?.trim()) return undefined;
  const trimmed = value.trim();
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  if (trimmed.startsWith('/')) return `${baseUrl.replace(/\/+$/, '')}${trimmed}`;
  return trimmed;
}

function formatCreatorMode(value: string | undefined): string {
  const normalized = (value || 'unknown').replace(/_/g, ' ');
  if (value === 'full_path') return 'Loop Engineering system';
  if (value === 'specialization_path') return 'specialization path';
  if (value === 'domain_chip') return 'domain chip';
  return normalized;
}

function missionStatusLabel(status: any): string {
  if (status?.allComplete) return 'complete';
  if (status?.paused) return 'paused';
  if (typeof status?.boardStatus === 'string' && status.boardStatus.trim()) {
    return formatCreatorReadiness(status.boardStatus);
  }
  return 'running';
}

function providerStatusRows(providers: unknown): string[] {
  if (!providers || typeof providers !== 'object' || Array.isArray(providers)) {
    return ['• none'];
  }

  const rows = Object.entries(providers as Record<string, unknown>).map(([id, value]) => {
    const status = formatCreatorReadiness(String(value || 'unknown'));
    return `• ${formatProviderLabel(id)}: ${status}`;
  });
  return rows.length > 0 ? rows : ['• none'];
}

function formatCreatorReadiness(value: string | undefined): string {
  return (value || 'unknown').replace(/_/g, ' ');
}

function formatCreatorPrivacy(value: string | undefined): string {
  if (value === 'local_only') return 'private workspace';
  if (value === 'github_pr') return 'GitHub review';
  if (value === 'swarm_shared') return 'Swarm sharing';
  return value || 'private workspace';
}

function formatCreatorCheckHeadline(status: string): string {
  if (status === 'passed') return '🟢 Loop Engineering checks passed.';
  if (status === 'failed') return '🔴 Loop Engineering checks need attention.';
  if (status === 'blocked') return '🟡 Loop Engineering checks are blocked.';
  return '🟡 Loop Engineering checks finished.';
}

export function formatCreatorDomainLabel(value: string | undefined): string {
  const raw = (value || '').trim();
  if (!raw) return 'Unknown domain';

  const words = raw
    .replace(/[_/]+/g, '-')
    .split(/-|\s+/)
    .map((word) => word.trim())
    .filter(Boolean);
  const controlWords = new Set([
    'a',
    'an',
    'the',
    'private',
    'local',
    'public',
    'shared',
    'network',
    'benchmark',
    'benchmarked',
    'specialization',
    'specialisation',
    'path',
    'autoloop',
    'auto',
    'loop',
    'use',
    'create',
    'creator',
    'mission',
    'with',
    'for'
  ]);
  const kept = words.filter((word) => !controlWords.has(word.toLowerCase()));
  const labelWords = kept.length > 0 ? kept : words;

  return labelWords
    .map((word) => {
      const lower = word.toLowerCase();
      if (['ai', 'api', 'llm', 'pr', 'ui', 'ux', 'yc'].includes(lower)) return lower.toUpperCase();
      return lower.charAt(0).toUpperCase() + lower.slice(1);
    })
    .join(' ');
}

function formatCreatorArtifactLabel(value: string): string {
  const labels: Record<string, string> = {
    domain_chip: 'domain chip',
    benchmark_pack: 'benchmark pack',
    specialization_path: 'specialization path',
    autoloop_policy: 'autoloop policy',
    tool_integration: 'Telegram/Spawner wiring',
    swarm_publish_packet: 'Swarm contribution packet',
    swarm_contribution_packet: 'Swarm contribution packet',
    creator_report: 'creator report'
  };
  return labels[value] || value.replace(/_/g, ' ');
}

function creatorPlanOpening(seed: string): string {
  const variants = [
    'Loop Engineering plan ready. I staged the private path without starting it.',
    'Private path staged. Nothing is running yet.',
    'Loop Engineering plan is staged and waiting for your call.'
  ];
  const score = seed.split('').reduce((sum, char) => sum + char.charCodeAt(0), 0);
  return variants[score % variants.length];
}

function formatCreatorArtifactSummary(artifacts: string[] | undefined): string {
  const usable = Array.isArray(artifacts) ? artifacts.filter((artifact) => artifact.trim()) : [];
  if (usable.length === 0) return 'artifact plan pending';
  return usable.slice(0, 6).map(formatCreatorArtifactLabel).join(', ');
}
function creatorEvidenceStandardLine(): string {
  return `intent packet, adapter map, artifact manifest, domain chip, ${domainChipLabsEvidenceSurfaceLine()}, specialization path, autoloop policy, Loop Engineering status, swarm/contribution_packet.json`;
}

function formatEvidenceTier(value: string | undefined): string {
  return value?.trim() || 'not proven yet';
}

function formatNetworkAbsorbable(value: boolean | undefined): string {
  return value === true ? 'true' : 'false';
}

function formatCreatorArtifactLines(artifacts: string[] | undefined): string[] {
  const usable = Array.isArray(artifacts) ? artifacts.filter((artifact) => artifact.trim()) : [];
  if (usable.length === 0) return ['- workspace plan'];
  return usable.slice(0, 6).map((artifact) => `- ${formatCreatorArtifactLabel(artifact)}`);
}

function latestCreatorValidationRun(trace: CreatorMissionTrace): CreatorValidationRun | null {
  const runs = Array.isArray(trace.validation_runs) ? trace.validation_runs : [];
  return runs[runs.length - 1] || null;
}

function countValidationResults(run: CreatorValidationRun | null, status: CreatorValidationCommandResult['status']): number {
  return (run?.results || []).filter((result) => result.status === status).length;
}

function formatValidationResultLine(result: CreatorValidationCommandResult): string {
  const artifact = result.artifact_id || result.artifact_type || 'unknown artifact';
  const status = result.status || 'unknown';
  const error = result.error || '';
  const safeError = /(?:repository path not found|required path not found|no such file|enoent).*(?:\/Users\/|\.spark\/modules|[A-Z]:\\)/i.test(error)
    ? 'required local artifact path is not available'
    : error;
  const suffix = safeError ? ` (${safeError})` : '';
  return `${status}: ${artifact}${suffix}`;
}

function formatArtifactLabel(value: string): string {
  return value.replace(/_/g, ' ');
}

function creatorValidationIcon(status: string | undefined): string {
  const normalized = (status || '').toLowerCase();
  if (/\b(pass|success|validated|complete)\b/.test(normalized)) return '🟢';
  if (/\b(fail|error|reject)\b/.test(normalized)) return '🔴';
  if (/\b(skip|block|wait|pending)\b/.test(normalized)) return '🟡';
  return '⚪';
}

export function formatCreatorMissionSummary(result: CreatorMissionResult, baseUrl = spawnerPublicUrl()): string {
  if (!result.success) {
    return `Loop Engineering staging failed: ${result.error || 'unknown error'}`;
  }

  const trace = result.trace || {};
  const intent = trace.intent_packet || {};
  const provenMissionId = result.missionId || trace.mission_id;
  const missionId = provenMissionId || 'staged-review';
  const explicitReadOnly = trace.execution_policy === 'read_only';
  const readOnly = explicitReadOnly || !provenMissionId;
  const canvasProof = result.canvasUrl || trace.links?.canvas;
  const reviewUrl = absoluteSpawnerUrl(result.tracePath || trace.links?.review || trace.links?.artifact, baseUrl);
  const kanbanUrl = provenMissionId
    ? (explicitReadOnly ? creatorWorkspaceUrl('kanban', baseUrl) : trace.links?.kanban || creatorMissionKanbanUrl(missionId, baseUrl))
    : undefined;
  const taskCount = typeof result.taskCount === 'number' ? result.taskCount : Array.isArray(trace.tasks) ? trace.tasks.length : null;
  const canvasUrl = explicitReadOnly
    ? creatorWorkspaceUrl('canvas', baseUrl)
    : absoluteSpawnerUrl(canvasProof, baseUrl);
  const domain = formatCreatorDomainLabel(intent.target_domain);
  const artifacts = formatCreatorArtifactSummary(trace.artifacts);
  const evidenceTier = formatEvidenceTier(trace.canonical?.evidence_tier);
  const networkAbsorbable = formatNetworkAbsorbable(trace.publication?.network_absorbable);
  const verdict = trace.canonical?.verdict || 'staged';

  const lines = [
    `🧩 ${creatorPlanOpening(missionId + domain)}`,
    '',
    `Domain: ${domain}`,
    `Boundary: ${formatCreatorPrivacy(trace.publication?.publish_mode || intent.privacy_mode)} / ${intent.risk_level || 'unknown'} risk. No execution or publishing happened from staging.`,
    `Labs verdict: ${formatCreatorReadiness(verdict)}; evidence tier: ${formatCreatorReadiness(evidenceTier)}; network_absorbable=${networkAbsorbable}`,
    ...(taskCount !== null ? [`${taskCount} tasks ${readOnly ? 'staged' : 'queued'}`] : []),
    '',
    'Evidence',
    `Staged: ${artifacts}`,
    `Loop Engineering contract: ${creatorEvidenceStandardLine()}`,
    'Capability gain needs baseline, candidate, held-out or trap evidence before Rec says the path made the agent better.',
    '',
    'Workspace',
    ...(canvasUrl ? [`Canvas: ${canvasUrl}`] : []),
    ...(reviewUrl ? [`Review: ${reviewUrl}`] : []),
    ...(kanbanUrl ? [`Board: ${kanbanUrl}`] : []),
    '',
    'Next',
    ...(readOnly
      ? ['say: status', 'say: revise the plan']
      : ['say: run it', 'say: status', 'say: validate it'])
  ];

  return lines.join('\n');
}

export function formatCreatorMissionStatusSummary(
  result: CreatorMissionStatusResult,
  baseUrl = spawnerPublicUrl()
): string {
  if (!result.success) {
    return `Loop Engineering status failed: ${result.error || 'unknown error'}`;
  }

  const trace = result.trace || {};
  const intent = trace.intent_packet || {};
  const missionId = result.missionId || trace.mission_id || 'unknown';
  const latestRun = latestCreatorValidationRun(trace);
  const kanbanUrl = trace.links?.kanban || (missionId !== 'unknown' ? creatorMissionKanbanUrl(missionId, baseUrl) : `${baseUrl}/kanban`);
  const canvasUrl = absoluteSpawnerUrl(trace.links?.canvas, baseUrl);
  const blockers = Array.isArray(trace.blockers) ? trace.blockers.filter((blocker) => String(blocker).trim()) : [];
  const artifactCount = Array.isArray(trace.artifact_manifests) ? trace.artifact_manifests.length : trace.artifacts?.length || 0;
  const issueCount = Array.isArray(trace.artifact_manifest_validation_issues) ? trace.artifact_manifest_validation_issues.length : 0;
  const domain = formatCreatorDomainLabel(intent.target_domain);
  const statusIcon = blockers.length > 0 || issueCount > 0 ? '🟡' : creatorValidationIcon(latestRun?.status || trace.stage_status);
  const evidenceTier = formatEvidenceTier(trace.canonical?.evidence_tier);
  const networkAbsorbable = formatNetworkAbsorbable(trace.publication?.network_absorbable);

  return [
    `${statusIcon} ${domain} Loop Engineering status.`,
    '',
    'State',
    `${formatCreatorReadiness(trace.stage_status)} at ${formatCreatorReadiness(trace.current_stage)}`,
    `Labs verdict: ${formatCreatorReadiness(trace.canonical?.verdict || trace.publish_readiness)}`,
    `evidence tier: ${formatCreatorReadiness(evidenceTier)}; network_absorbable=${networkAbsorbable}`,
    latestRun
      ? `checks: ${latestRun.status || 'unknown'} (${countValidationResults(latestRun, 'passed')} passed, ${countValidationResults(latestRun, 'failed')} failed, ${countValidationResults(latestRun, 'skipped')} skipped)`
      : 'checks: not run yet',
    latestRun?.status === 'passed'
      ? 'capability gain: validation passed; benchmark before/after evidence still decides the claim.'
      : 'capability gain: not proven yet.',
    issueCount > 0 ? `${issueCount} manifest issue${issueCount === 1 ? '' : 's'}` : null,
    ...(blockers.length > 0 ? [`blocker: ${blockers[0]}`] : []),
    '',
    'Evidence',
    `Loop Engineering contract: ${creatorEvidenceStandardLine()}`,
    formatDomainChipLabsContractProofLine(trace),
    '',
    'Workspace',
    `${artifactCount} artifact plan${artifactCount === 1 ? '' : 's'}`,
    ...(canvasUrl ? [`Canvas: ${canvasUrl}`] : []),
    `Board: ${kanbanUrl}`
  ].filter((line): line is string => Boolean(line)).join('\n');
}

export function formatCreatorMissionExecutionSummary(
  result: CreatorMissionExecutionResult,
  baseUrl = spawnerPublicUrl()
): string {
  if (!result.success) {
    return `Loop Engineering run failed: ${result.error || 'unknown error'}`;
  }

  const trace = result.trace || {};
  const missionId = result.missionId || trace.mission_id || 'unknown';
  const canvasUrl = absoluteSpawnerUrl(result.canvasUrl || trace.links?.canvas, baseUrl);
  const kanbanUrl = trace.links?.kanban || (missionId !== 'unknown' ? creatorMissionKanbanUrl(missionId, baseUrl) : `${baseUrl}/kanban`);
  const headline = result.started
    ? '🟢 Loop Engineering run started.'
    : result.skipped
      ? '🟡 Loop Engineering run was already handled.'
      : '🟢 Loop Engineering run accepted.';

  return [
    headline,
    '',
    'Build',
    result.started ? 'running now' : result.skipped ? 'already handled' : 'queued',
    ...(result.providerId ? [`Builder: ${formatProviderLabel(result.providerId)}`] : []),
    ...(result.reason ? [`Note: ${result.reason}`] : []),
    '',
    'Workspace',
    ...(canvasUrl ? [`Canvas: ${canvasUrl}`] : []),
    `Board: ${kanbanUrl}`
  ].join('\n');
}

export function formatCreatorMissionValidationSummary(
  result: CreatorMissionValidationResult,
  baseUrl = spawnerPublicUrl()
): string {
  if (!result.success) {
    return `Loop Engineering validation failed: ${result.error || 'unknown error'}`;
  }

  const trace = result.trace || {};
  const missionId = result.missionId || trace.mission_id || 'unknown';
  const run = result.run || latestCreatorValidationRun(trace);
  const results = run?.results || [];
  const kanbanUrl = trace.links?.kanban || (missionId !== 'unknown' ? creatorMissionKanbanUrl(missionId, baseUrl) : `${baseUrl}/kanban`);
  const canvasUrl = absoluteSpawnerUrl(trace.links?.canvas, baseUrl);
  const failedOrSkipped = results.filter((item) => item.status === 'failed' || item.status === 'skipped').slice(0, 5);
  const status = result.status || run?.status || 'unknown';
  const blockers = Array.isArray(trace.blockers) ? trace.blockers.filter((blocker) => String(blocker).trim()) : [];
  const promotionBlocked = blockers.length > 0 ||
    /block/.test(String(trace.stage_status || '').toLowerCase()) ||
    /promotion[_-\s]*blocked/.test(String(trace.current_stage || '').toLowerCase());
  const headline = status === 'passed' && promotionBlocked
    ? '🟡 Loop Engineering artifact validation passed; promotion is still blocked.'
    : `${creatorValidationIcon(status)} Loop Engineering validation ${formatCreatorReadiness(status)}.`;

  return [
    headline,
    '',
    'Checks',
    `${results.length} command${results.length === 1 ? '' : 's'}`,
    `${countValidationResults(run, 'passed')} passed`,
    `${countValidationResults(run, 'failed')} failed`,
    `${countValidationResults(run, 'skipped')} skipped`,
    ...(failedOrSkipped.length > 0 ? ['', 'Needs attention', ...failedOrSkipped.map(formatValidationResultLine)] : []),
    '',
    'Ability',
    status === 'passed' && !promotionBlocked
      ? 'The path can claim improvement only where the benchmark pack shows a before/after gain.'
      : 'No higher-ability claim yet; promotion needs baseline, candidate, delta, held-out/trap verdicts, and benchmark refs.',
    ...(promotionBlocked && blockers.length > 0 ? ['', 'Promotion blocker', blockers[0]] : []),
    '',
    'Workspace',
    ...(canvasUrl ? [`Canvas: ${canvasUrl}`] : []),
    `Board: ${kanbanUrl}`
  ].join('\n');
}

async function runLoopEngineeringSpawnerAction(
  kind: 'benchmark' | 'loop',
  input: LoopEngineeringRunInput
): Promise<LoopEngineeringRunResult> {
  const chipKey = safeDomainChipKey(input.chipKey);
  if (!chipKey) return { success: false, error: 'valid domain-chip key required' };
  const endpoint = kind === 'benchmark'
    ? `/api/loop-engineering/chips/${encodeURIComponent(chipKey)}/benchmarks/run`
    : `/api/loop-engineering/chips/${encodeURIComponent(chipKey)}/loops/run`;
  const toolName = kind === 'benchmark'
    ? 'spawner.loop_engineering.benchmark.run'
    : 'spawner.loop_engineering.loop.run';
  try {
    const res = await postLocalServiceWithRetry(
      `${SPAWNER_UI_URL}${endpoint}`,
      {
        ...(input.objective?.trim() ? { objective: input.objective.trim() } : {}),
        ...(kind === 'loop' && typeof input.roundLimit === 'number' ? { roundLimit: input.roundLimit } : {}),
        ...(input.benchmarkCaseIds?.length ? { benchmarkCaseIds: input.benchmarkCaseIds } : {}),
        ...(input.executeNow ? { executeNow: true } : {}),
        sourceSurface: input.sourceSurface || 'telegram',
        ...(input.requestId?.trim() ? { requestId: input.requestId.trim() } : {}),
        executionAuthority: input.executionAuthority ?? governorDecisionAuthority({
          source: 'telegram_loop_engineering_bridge',
          reason: `Telegram requested a private loop-engineering ${kind} mission through Spawner.`,
          toolName,
          mutationClass: 'launches_mission',
          requestId: input.requestId,
          target: chipKey
        })
      },
      localServiceTimeoutMs('SPARK_LOOP_ENGINEERING_RUN_TIMEOUT_MS')
    );
    const commandResult = res.data?.commandResult && typeof res.data.commandResult === 'object'
      ? res.data.commandResult
      : {};
    const missionId = typeof commandResult.missionId === 'string'
      ? commandResult.missionId
      : typeof res.data?.mission?.id === 'string'
        ? res.data.mission.id
        : undefined;
    const eventId = typeof commandResult.eventId === 'string' ? commandResult.eventId : undefined;
    const action = typeof commandResult.action === 'string' ? commandResult.action : undefined;
    if (res.data?.ok && input.executeNow) {
      const expectedAction = kind === 'benchmark' ? 'benchmark_run_executed' : 'loop_run_executed';
      const runIdKey = kind === 'benchmark' ? 'benchmarkRunId' : 'loopRunId';
      const runId = typeof commandResult[runIdKey] === 'string' ? commandResult[runIdKey] : undefined;
      if (action !== expectedAction || !missionId || !eventId || !runId) {
        return {
          success: false,
          action,
          missionId,
          eventId,
          inspectUrl: typeof commandResult.inspectUrl === 'string' ? absoluteSpawnerUrl(commandResult.inspectUrl) : undefined,
          event: res.data?.event && typeof res.data.event === 'object' ? res.data.event : undefined,
          mission: res.data?.mission && typeof res.data.mission === 'object' ? res.data.mission : undefined,
          commandResult,
          error: `Spawner did not return ${kind} execution proof, so Telegram did not treat it as run.`
        };
      }
    }
    return {
      success: Boolean(res.data?.ok),
      action,
      missionId,
      eventId,
      inspectUrl: typeof commandResult.inspectUrl === 'string' ? absoluteSpawnerUrl(commandResult.inspectUrl) : undefined,
      message: typeof commandResult.userMessage === 'string' ? commandResult.userMessage : undefined,
      event: res.data?.event && typeof res.data.event === 'object' ? res.data.event : undefined,
      mission: res.data?.mission && typeof res.data.mission === 'object' ? res.data.mission : undefined,
      commandResult,
      ...(res.data?.ok ? {} : { error: res.data?.error || `Loop-engineering ${kind} run failed` })
    };
  } catch (err: any) {
    return {
      success: false,
      error: err?.response?.data?.error || err?.message || `Loop-engineering ${kind} run failed`
    };
  }
}

async function postLoopEngineeringCommandResult(input: {
  chipKey: string;
  endpoint: string;
  toolName: string;
  mutationClass?: HarnessCoreActionMutationClass;
  body: Record<string, unknown>;
  requestId?: string;
  target?: string;
}): Promise<LoopEngineeringRunResult> {
  const chipKey = safeDomainChipKey(input.chipKey);
  if (!chipKey) return { success: false, error: 'valid domain-chip key required' };
  try {
    const res = await postLocalServiceWithRetry(
      `${SPAWNER_UI_URL}${input.endpoint}`,
      {
        ...input.body,
        executionAuthority: input.body.executionAuthority ?? governorDecisionAuthority({
          source: 'telegram_loop_engineering_bridge',
          reason: `Telegram requested ${input.toolName} through Spawner.`,
          toolName: input.toolName,
          mutationClass: input.mutationClass || 'writes_files',
          requestId: input.requestId,
          target: input.target || chipKey
        })
      },
      localServiceTimeoutMs('SPARK_LOOP_ENGINEERING_RUN_TIMEOUT_MS')
    );
    const commandResult = res.data?.commandResult && typeof res.data.commandResult === 'object'
      ? res.data.commandResult
      : {};
    return {
      success: Boolean(res.data?.ok),
      action: typeof commandResult.action === 'string' ? commandResult.action : undefined,
      missionId: typeof commandResult.missionId === 'string' ? commandResult.missionId : undefined,
      eventId: typeof commandResult.eventId === 'string' ? commandResult.eventId : undefined,
      inspectUrl: typeof commandResult.inspectUrl === 'string' ? absoluteSpawnerUrl(commandResult.inspectUrl) : undefined,
      message: typeof commandResult.userMessage === 'string' ? commandResult.userMessage : undefined,
      event: res.data?.event && typeof res.data.event === 'object' ? res.data.event : undefined,
      mission: res.data?.mission && typeof res.data.mission === 'object' ? res.data.mission : undefined,
      commandResult,
      ...(res.data?.ok ? {} : { error: res.data?.error || 'Loop-engineering command failed' })
    };
  } catch (err: any) {
    return {
      success: false,
      error: err?.response?.data?.error || err?.message || 'Loop-engineering command failed'
    };
  }
}

export const spawner = {
  async isAvailable(): Promise<boolean> {
    try {
      const res = await axios.get(`${SPAWNER_UI_URL}/api/providers`, spawnerAxiosOptions(3000));
      return Array.isArray(res.data?.providers);
    } catch {
      return false;
    }
  },

  async runGoal(input: RunGoalInput): Promise<RunGoalResult> {
    try {
      const relay = telegramRelayIdentityFromEnv();
      const res = await postLocalServiceWithRetry(
        `${SPAWNER_UI_URL}/api/spark/run`,
        {
          goal: input.goal,
          ...(input.missionName?.trim() ? { missionName: input.missionName.trim() } : {}),
          chatId: input.chatId,
          userId: input.userId,
          requestId: input.requestId,
          ...(input.traceRef ? { traceRef: input.traceRef } : {}),
          telegramRelay: relay,
          ...(input.tier ? { tier: input.tier } : {}),
          ...(SPARK_RUN_PROJECT_PATH ? { projectPath: SPARK_RUN_PROJECT_PATH } : {}),
          ...(input.providers && input.providers.length > 0 ? { providers: input.providers } : {}),
          ...(input.promptMode ? { promptMode: input.promptMode } : {}),
          executionAuthority: input.executionAuthority ?? governorDecisionAuthority({
            source: 'telegram_spawner_run_bridge',
            reason: 'Telegram run bridge requested Spawner mission execution.',
            toolName: 'spawner.run',
            mutationClass: 'launches_mission',
            requestId: input.requestId,
            target: input.goal
          })
        },
        localServiceTimeoutMs('SPARK_SPAWNER_RUN_TIMEOUT_MS')
      );

      if (res.data?.success && !(typeof res.data?.missionId === 'string' && res.data.missionId.trim())) return { success: false, error: 'Spark run bridge returned success but missing mission id.' };
      return {
        success: Boolean(res.data?.success),
        missionId: res.data?.missionId,
        requestId: res.data?.requestId,
        providers: Array.isArray(res.data?.providers) ? res.data.providers : []
      };
    } catch (err: any) {
      return {
        success: false,
        error: err.response?.data?.error || err.message
      };
    }
  },

  async runLoopEngineeringBenchmark(input: LoopEngineeringRunInput): Promise<LoopEngineeringRunResult> {
    return runLoopEngineeringSpawnerAction('benchmark', input);
  },

  async runLoopEngineeringLoop(input: LoopEngineeringRunInput): Promise<LoopEngineeringRunResult> {
    return runLoopEngineeringSpawnerAction('loop', input);
  },

  async listLoopEngineeringChips(): Promise<LoopEngineeringChipListResult> {
    try {
      const res = await axios.get(`${SPAWNER_UI_URL}/api/loop-engineering/chips`, spawnerAxiosOptions(10000));
      const chips = Array.isArray(res.data?.registry?.chips)
        ? res.data.registry.chips.filter((item: unknown): item is LoopEngineeringChipSummary => Boolean(item && typeof item === 'object' && typeof (item as LoopEngineeringChipSummary).id === 'string'))
        : [];
      return {
        success: Boolean(res.data?.ok),
        chips,
        inspectUrl: absoluteSpawnerUrl('/loop-engineering'),
        ...(res.data?.ok ? {} : { error: res.data?.error || 'Loop Engineering chip list failed' })
      };
    } catch (err: any) {
      return {
        success: false,
        inspectUrl: absoluteSpawnerUrl('/loop-engineering'),
        error: err?.response?.data?.error || err?.message || 'Loop Engineering chip list failed'
      };
    }
  },

  async recordLoopEngineeringEvaluatorReview(input: LoopEngineeringEvaluatorReviewInput): Promise<LoopEngineeringRunResult> {
    const chipKey = safeDomainChipKey(input.chipKey);
    if (!chipKey) return { success: false, error: 'valid domain-chip key required' };
    return postLoopEngineeringCommandResult({
      chipKey,
      endpoint: `/api/loop-engineering/chips/${encodeURIComponent(chipKey)}/evaluator-review`,
      toolName: 'spawner.loop_engineering.evaluator_review.record',
      requestId: input.requestId,
      target: chipKey,
      body: {
        previousScore: input.previousScore,
        candidateScore: input.candidateScore,
        ...(typeof input.roundsObserved === 'number' ? { roundsObserved: input.roundsObserved } : {}),
        evaluatorSeparated: true,
        evidenceRefs: input.evidenceRefs,
        sourceSurface: input.sourceSurface || 'telegram',
        ...(input.label?.trim() ? { label: input.label.trim() } : {}),
        ...(input.requestId?.trim() ? { requestId: input.requestId.trim() } : {}),
        ...(input.executionAuthority ? { executionAuthority: input.executionAuthority } : {})
      }
    });
  },

  async distillLoopEngineeringLessons(input: LoopEngineeringDistillationInput): Promise<LoopEngineeringRunResult> {
    const chipKey = safeDomainChipKey(input.chipKey);
    if (!chipKey) return { success: false, error: 'valid domain-chip key required' };
    return postLoopEngineeringCommandResult({
      chipKey,
      endpoint: `/api/loop-engineering/chips/${encodeURIComponent(chipKey)}/distill`,
      toolName: 'spawner.loop_engineering.distill.stage',
      requestId: input.requestId,
      target: chipKey,
      body: {
        sourceEvaluatorEventId: input.sourceEvaluatorEventId,
        lessons: input.lessons,
        ...(input.runtimeNotes?.trim() ? { runtimeNotes: input.runtimeNotes.trim() } : {}),
        ...(input.tokenBudgetHint?.trim() ? { tokenBudgetHint: input.tokenBudgetHint.trim() } : {}),
        ...(input.evidenceRefs?.length ? { evidenceRefs: input.evidenceRefs } : {}),
        sourceSurface: input.sourceSurface || 'telegram',
        ...(input.requestId?.trim() ? { requestId: input.requestId.trim() } : {}),
        ...(input.executionAuthority ? { executionAuthority: input.executionAuthority } : {})
      }
    });
  },

  async stageLoopEngineeringActivation(input: LoopEngineeringActivationInput): Promise<LoopEngineeringRunResult> {
    const chipKey = safeDomainChipKey(input.chipKey);
    if (!chipKey) return { success: false, error: 'valid domain-chip key required' };
    return postLoopEngineeringCommandResult({
      chipKey,
      endpoint: `/api/loop-engineering/chips/${encodeURIComponent(chipKey)}/activation`,
      toolName: 'spawner.loop_engineering.activation.stage',
      requestId: input.requestId,
      target: input.useCase,
      body: {
        useCase: input.useCase,
        ...(input.surfaces?.length ? { surfaces: input.surfaces } : {}),
        ...(input.mode ? { mode: input.mode } : {}),
        ...(input.triggerPatterns?.length ? { triggerPatterns: input.triggerPatterns } : {}),
        ...(input.nonTriggerPatterns?.length ? { nonTriggerPatterns: input.nonTriggerPatterns } : {}),
        ...(input.riskPolicy ? { riskPolicy: input.riskPolicy } : {}),
        ...(typeof input.approvalRequired === 'boolean' ? { approvalRequired: input.approvalRequired } : {}),
        ...(input.rollbackRef?.trim() ? { rollbackRef: input.rollbackRef.trim() } : {}),
        ...(input.sourceSurface ? { sourceSurface: input.sourceSurface } : {}),
        ...(input.requestId?.trim() ? { requestId: input.requestId.trim() } : {}),
        ...(input.executionAuthority ? { executionAuthority: input.executionAuthority } : {})
      }
    });
  },

  async stageLoopEngineeringBenchmarkCase(input: LoopEngineeringBenchmarkCaseInput): Promise<LoopEngineeringRunResult> {
    const chipKey = safeDomainChipKey(input.chipKey);
    if (!chipKey) return { success: false, error: 'valid domain-chip key required' };
    return postLoopEngineeringCommandResult({
      chipKey,
      endpoint: `/api/loop-engineering/chips/${encodeURIComponent(chipKey)}/benchmarks/cases`,
      toolName: 'spawner.loop_engineering.benchmark_case.stage',
      requestId: input.requestId,
      target: chipKey,
      body: {
        kind: input.kind,
        prompt: input.prompt,
        expectedBehavior: input.expectedBehavior,
        ...(input.scoringRubricRef?.trim() ? { scoringRubricRef: input.scoringRubricRef.trim() } : {}),
        ...(input.evidenceRefs?.length ? { evidenceRefs: input.evidenceRefs } : {}),
        ...(input.sourceSurface ? { sourceSurface: input.sourceSurface } : {}),
        ...(input.requestId?.trim() ? { requestId: input.requestId.trim() } : {}),
        ...(input.executionAuthority ? { executionAuthority: input.executionAuthority } : {})
      }
    });
  },

  async stageLoopEngineeringSchedule(input: LoopEngineeringScheduleInput): Promise<LoopEngineeringRunResult> {
    const chipKey = safeDomainChipKey(input.chipKey);
    if (!chipKey) return { success: false, error: 'valid domain-chip key required' };
    return postLoopEngineeringCommandResult({
      chipKey,
      endpoint: `/api/loop-engineering/chips/${encodeURIComponent(chipKey)}/schedules`,
      toolName: 'spawner.loop_engineering.schedule.stage',
      mutationClass: 'creates_schedule',
      requestId: input.requestId,
      target: chipKey,
      body: {
        ...(input.name?.trim() ? { name: input.name.trim() } : {}),
        mode: input.mode || 'round_count',
        ...(typeof input.intervalMinutes === 'number' ? { intervalMinutes: input.intervalMinutes } : {}),
        ...(input.fixedLocalTime?.trim() ? { fixedLocalTime: input.fixedLocalTime.trim() } : {}),
        ...(input.timezone?.trim() ? { timezone: input.timezone.trim() } : {}),
        roundLimit: input.roundLimit,
        ...(input.stopConditions?.length ? { stopConditions: input.stopConditions } : {}),
        ...(input.sourceSurface ? { sourceSurface: input.sourceSurface } : {}),
        ...(input.requestId?.trim() ? { requestId: input.requestId.trim() } : {}),
        ...(input.executionAuthority ? { executionAuthority: input.executionAuthority } : {})
      }
    });
  },

  async fireLoopEngineeringSchedule(input: LoopEngineeringScheduleFireInput): Promise<LoopEngineeringRunResult> {
    const chipKey = safeDomainChipKey(input.chipKey);
    if (!chipKey) return { success: false, error: 'valid domain-chip key required' };
    const scheduleId = input.scheduleId.trim();
    if (!scheduleId) return { success: false, error: 'loop-engineering schedule id required' };
    return postLoopEngineeringCommandResult({
      chipKey,
      endpoint: `/api/loop-engineering/chips/${encodeURIComponent(chipKey)}/schedules/${encodeURIComponent(scheduleId)}/fire`,
      toolName: 'spawner.loop_engineering.schedule.fire',
      mutationClass: 'launches_mission',
      requestId: input.requestId,
      target: chipKey,
      body: {
        sourceSurface: input.sourceSurface || 'telegram',
        ...(input.requestId?.trim() ? { requestId: input.requestId.trim() } : {}),
        ...(input.executionAuthority ? { executionAuthority: input.executionAuthority } : {})
      }
    });
  },

  async completeLoopEngineeringRun(input: LoopEngineeringCompletionInput): Promise<LoopEngineeringRunResult> {
    const chipKey = safeDomainChipKey(input.chipKey);
    if (!chipKey) return { success: false, error: 'valid domain-chip key required' };
    const eventId = input.eventId.trim();
    if (!eventId) return { success: false, error: 'loop-engineering event id required' };
    return postLoopEngineeringCommandResult({
      chipKey,
      endpoint: `/api/loop-engineering/events/${encodeURIComponent(eventId)}/complete`,
      toolName: 'spawner.loop_engineering.event.complete',
      requestId: input.requestId,
      target: chipKey,
      body: {
        chipKey,
        eventId,
        status: input.status,
        ...(input.missionId?.trim() ? { missionId: input.missionId.trim() } : {}),
        ...(typeof input.previousScore === 'number' ? { previousScore: input.previousScore } : {}),
        ...(typeof input.candidateScore === 'number' ? { candidateScore: input.candidateScore } : {}),
        ...(typeof input.utilityDelta === 'number' ? { utilityDelta: input.utilityDelta } : {}),
        ...(typeof input.roundsObserved === 'number' ? { roundsObserved: input.roundsObserved } : {}),
        evaluatorSeparated: input.evaluatorSeparated !== false,
        ...(input.evidenceRefs?.length ? { evidenceRefs: input.evidenceRefs } : {}),
        ...(input.sourceRef?.trim() ? { sourceRef: input.sourceRef.trim() } : {}),
        ...(input.evaluatorVerdictRef?.trim() ? { evaluatorVerdictRef: input.evaluatorVerdictRef.trim() } : {}),
        ...(input.scheduleId?.trim() ? { scheduleId: input.scheduleId.trim() } : {}),
        ...(input.nextAction?.trim() ? { nextAction: input.nextAction.trim() } : {}),
        ...(input.requestId?.trim() ? { requestId: input.requestId.trim() } : {}),
        ...(input.executionAuthority ? { executionAuthority: input.executionAuthority } : {})
      }
    });
  },

  async creatorMission(input: CreatorMissionInput): Promise<CreatorMissionResult> {
    try {
      const res = await postLocalServiceWithRetry(
        `${SPAWNER_UI_URL}/api/creator/mission`,
        {
          brief: input.brief,
          ...(input.requestId ? { requestId: input.requestId } : {}),
          ...(input.missionId ? { missionId: input.missionId } : {}),
          ...(input.privacyMode ? { privacyMode: input.privacyMode } : {}),
          ...(input.riskLevel ? { riskLevel: input.riskLevel } : {}),
          ...(input.executionPolicy ? { executionPolicy: input.executionPolicy } : {}),
          ...(input.executionPolicy !== 'read_only'
            ? {
                executionAuthority: input.executionAuthority ?? governorDecisionAuthority({
                  source: 'telegram_creator_mission_bridge',
                  reason: 'Telegram Loop Engineering bridge requested an executable path.',
                  toolName: 'creator.mission.create',
                  mutationClass: 'creates_chip',
                  requestId: input.requestId,
                  target: input.brief
                })
              }
            : {})
        },
        localServiceTimeoutMs('SPARK_CREATOR_MISSION_TIMEOUT_MS')
      );

      if (res.data?.ok === false) return { success: false, error: res.data?.error || 'Loop Engineering request was rejected.' };
      const proof = creatorMissionClosureProof(res.data);
      if (res.data?.ok && !proof.missionId && !proof.stagedPath) return { success: false, error: 'Loop Engineering bridge returned ok but missing mission id or staged artifact proof.' };

      return {
        success: Boolean(res.data?.ok),
        missionId: proof.missionId,
        requestId: res.data?.requestId,
        taskCount: typeof res.data?.taskCount === 'number' ? res.data.taskCount : undefined,
        canvasUrl: typeof res.data?.canvasUrl === 'string' ? res.data.canvasUrl : undefined,
        tracePath: proof.stagedPath,
        trace: res.data?.trace
      };
    } catch (err: any) {
      return {
        success: false,
        error: err.response?.data?.error || err.message
      };
    }
  },

  async creatorMissionExecute(input: CreatorMissionExecutionInput): Promise<CreatorMissionExecutionResult> {
    try {
      const res = await postLocalServiceWithRetry(
        `${SPAWNER_UI_URL}/api/creator/mission/execute`,
        {
          ...(input.missionId ? { missionId: input.missionId } : {}),
          ...(input.requestId ? { requestId: input.requestId } : {}),
          executionAuthority: input.executionAuthority ?? governorDecisionAuthority({
            source: 'telegram_creator_mission_execute_bridge',
            reason: 'Telegram Loop Engineering bridge requested execution of a staged path.',
            toolName: 'spawner.dispatch',
            mutationClass: 'launches_mission',
            requestId: input.requestId,
            target: input.missionId || input.requestId
          })
        },
        localServiceTimeoutMs('SPARK_CREATOR_MISSION_EXECUTE_TIMEOUT_MS')
      );

      if (res.data?.ok === false) {
        return {
          success: false,
          error: res.data?.error || 'Loop Engineering execution was rejected.'
        };
      }

      return {
        success: Boolean(res.data?.ok),
        missionId: res.data?.missionId,
        requestId: res.data?.requestId,
        started: res.data?.started === true,
        skipped: res.data?.skipped === true,
        reason: typeof res.data?.reason === 'string' ? res.data.reason : undefined,
        providerId: typeof res.data?.providerId === 'string' ? res.data.providerId : undefined,
        projectPath: typeof res.data?.projectPath === 'string' ? res.data.projectPath : undefined,
        canvasUrl: typeof res.data?.canvasUrl === 'string' ? res.data.canvasUrl : undefined,
        trace: res.data?.trace,
        error: typeof res.data?.error === 'string' ? res.data.error : undefined
      };
    } catch (err: any) {
      return {
        success: false,
        error: err.response?.data?.error || err.message
      };
    }
  },

  async creatorMissionStatus(input: CreatorMissionLookupInput): Promise<CreatorMissionStatusResult> {
    try {
      const params = new URLSearchParams();
      if (input.missionId) params.set('missionId', input.missionId);
      if (input.requestId) params.set('requestId', input.requestId);
      const query = params.toString();
      const res = await axios.get(
        `${SPAWNER_UI_URL}/api/creator/mission${query ? `?${query}` : ''}`,
        spawnerAxiosOptions(localServiceTimeoutMs('SPARK_CREATOR_MISSION_STATUS_TIMEOUT_MS', 30000))
      );

      if (res.data?.ok === false) {
        return {
          success: false,
          error: res.data?.error || 'Loop Engineering status lookup was rejected.'
        };
      }

      const trace = res.data?.trace;
      return {
        success: Boolean(res.data?.ok),
        missionId: res.data?.missionId || trace?.mission_id,
        requestId: res.data?.requestId || trace?.request_id,
        tracePath: typeof res.data?.tracePath === 'string' ? res.data.tracePath : undefined,
        trace
      };
    } catch (err: any) {
      return {
        success: false,
        error: err.response?.data?.error || err.message
      };
    }
  },

  async creatorMissionValidate(input: CreatorMissionValidationInput): Promise<CreatorMissionValidationResult> {
    try {
      const res = await postLocalServiceWithRetry(
        `${SPAWNER_UI_URL}/api/creator/mission/validate`,
        {
          ...(input.missionId ? { missionId: input.missionId } : {}),
          ...(input.requestId ? { requestId: input.requestId } : {}),
          ...(typeof input.maxCommands === 'number' ? { maxCommands: input.maxCommands } : {})
        },
        localServiceTimeoutMs('SPARK_CREATOR_MISSION_VALIDATE_TIMEOUT_MS')
      );

      if (res.data?.ok === false) {
        return {
          success: false,
          error: res.data?.error || 'Loop Engineering validation was rejected.'
        };
      }

      return {
        success: Boolean(res.data?.ok),
        missionId: res.data?.missionId,
        requestId: res.data?.requestId,
        status: res.data?.status,
        run: res.data?.run,
        trace: res.data?.trace
      };
    } catch (err: any) {
      return {
        success: false,
        error: err.response?.data?.error || err.message
      };
    }
  },

  async missionCommand(action: MissionAction, missionId: string): Promise<{ success: boolean; message: string }> {
    try {
      const res = await axios.post(
        `${SPAWNER_UI_URL}/api/mission-control/command`,
        {
          action,
          missionId,
          source: 'telegram'
        },
        spawnerAxiosOptions(10000)
      );

      if (res.data?.ok === false) {
        return {
          success: false,
          message: res.data?.error || `Mission ${missionId} command was rejected.`
        };
      }

      if (action === 'status') {
        const status = res.data?.status;
        const statusLabel = missionStatusLabel(status);
        const boardStatus = typeof status?.boardStatus === 'string' && status.boardStatus.trim()
          ? formatCreatorReadiness(status.boardStatus)
          : null;
        const lines = [
          `Mission is ${statusLabel}.`,
          '',
          'State',
          ...(boardStatus ? [`• Board: ${boardStatus}`] : []),
          `• Paused: ${status?.paused ? 'yes' : 'no'}`,
          `• Complete: ${status?.allComplete ? 'yes' : 'no'}`,
          '',
          'Providers',
          ...providerStatusRows(status?.providers),
          '',
          'Next',
          status?.allComplete
            ? '• Inspect the handoff in Spawner.'
            : status?.paused
              ? `• /mission resume ${missionId}`
              : `• /mission pause ${missionId}`,
          '',
          ...missionInspectionLines(missionId)
        ];
        return { success: true, message: lines.join('\n') };
      }

      const actionLabel = action === 'kill' ? 'stop' : action;
      return {
        success: Boolean(res.data?.ok),
        message: [
          `Mission ${actionLabel} was sent.`,
          '',
          'Next',
          `• /mission status ${missionId}`,
          '',
          ...missionInspectionLines(missionId)
        ].join('\n')
      };
    } catch (err: any) {
      return {
        success: false,
        message: err.response?.data?.error || err.message
      };
    }
  },

  async pauseContextualActiveMission(): Promise<{ success: boolean; message: string; missionId?: string; commandSent?: boolean }> {
    try {
      const board = await fetchBoardSnapshot();
      const running = board.running;

      if (running.length === 1) {
        const mission = running[0];
        const title = missionTitle(mission);
        const result = await spawner.missionCommand('pause', mission.missionId);
        if (!result.success) {
          return {
            success: false,
            message: `I could not pause ${title}: ${result.message}`
          };
        }
        return {
          success: true,
          missionId: mission.missionId,
          commandSent: true,
          message: [
            `I paused ${title}.`,
            '',
            `Board: ${missionScopedBoardUrl(mission.missionId)}`
          ].join('\n')
        };
      }

      if (running.length > 1) {
        return {
          success: false,
          message: contextualMissionCommandPicker(running, 'running', 'pause', 'pause')
        };
      }

      if (board.paused.length === 1) {
        return {
          success: true,
          message: `That mission is already paused: ${missionTitle(board.paused[0])}.`
        };
      }

      if (board.paused.length > 1) {
        return {
          success: true,
          message: 'I do not see a running mission to pause. The active items I can see are already paused, so I did not send a command.'
        };
      }

      return {
        success: false,
        message: 'I do not see a running mission to pause right now.'
      };
    } catch (err: any) {
      return {
        success: false,
        message: `I could not check Mission Control before pausing: ${err.response?.data?.error || err.message}`
      };
    }
  },

  async describeContextualActiveMissionPauseBoundary(): Promise<{ success: boolean; message: string; missionId?: string; commandSent?: boolean }> {
    try {
      const board = await fetchBoardSnapshot();
      const running = board.running;

      if (running.length === 1) {
        const title = missionTitle(running[0]);
        return {
          success: true,
          message: `I did not pause it. ${title} is still running.`
        };
      }

      if (running.length > 1) {
        return {
          success: true,
          message: `I did not pause anything. I see ${countWord(running.length)} running missions, so I need you to choose one before I pause anything.`
        };
      }

      if (board.paused.length === 1) {
        return {
          success: true,
          message: `I did not pause anything. ${missionTitle(board.paused[0])} is already paused.`
        };
      }

      if (board.paused.length > 1) {
        return {
          success: true,
          message: 'I did not pause anything. The active items I can see are already paused.'
        };
      }

      return {
        success: true,
        message: 'I did not pause anything. Mission Control has nothing running right now.'
      };
    } catch (err: any) {
      return {
        success: false,
        message: `I could not check Mission Control before answering: ${err.response?.data?.error || err.message}`
      };
    }
  },

  async describeContextualPausedMissionResumeBoundary(): Promise<{ success: boolean; message: string; missionId?: string; commandSent?: boolean }> {
    try {
      const board = await fetchBoardSnapshot();
      const paused = board.paused;

      if (paused.length === 1) {
        const title = missionTitle(paused[0]);
        return {
          success: true,
          message: `I did not resume it. ${title} is still paused. If you want it moving again, say \`resume that one\`.`
        };
      }

      if (paused.length > 1) {
        return {
          success: true,
          message: `I did not resume anything. I see ${countWord(paused.length)} paused missions, so I need you to choose one before I move anything.`
        };
      }

      if (board.running.length > 0) {
        return {
          success: true,
          message: 'I did not resume anything. I do not see a paused mission right now.'
        };
      }

      return {
        success: true,
        message: 'I did not resume anything. Mission Control has nothing paused right now.'
      };
    } catch (err: any) {
      return {
        success: false,
        message: `I could not check Mission Control before answering: ${err.response?.data?.error || err.message}`
      };
    }
  },

  async resumeContextualPausedMission(): Promise<{ success: boolean; message: string; missionId?: string; commandSent?: boolean }> {
    try {
      const board = await fetchBoardSnapshot();
      const paused = board.paused;

      if (paused.length === 1) {
        const mission = paused[0];
        const title = missionTitle(mission);
        const result = await spawner.missionCommand('resume', mission.missionId);
        if (!result.success) {
          return {
            success: false,
            message: `I could not resume ${title}: ${result.message}`
          };
        }
        return {
          success: true,
          missionId: mission.missionId,
          commandSent: true,
          message: [
            `I resumed ${title}.`,
            '',
            `Board: ${missionScopedBoardUrl(mission.missionId)}`
          ].join('\n')
        };
      }

      if (paused.length > 1) {
        return {
          success: false,
          message: contextualMissionCommandPicker(paused, 'paused', 'resume', 'resume')
        };
      }

      if (board.running.length === 1) {
        return {
          success: true,
          message: `That mission is already running: ${missionTitle(board.running[0])}.`
        };
      }

      if (board.running.length > 1) {
        return {
          success: true,
          message: 'I do not see a paused mission to resume. The active items I can see are already running, so I did not send a command.'
        };
      }

      return {
        success: false,
        message: 'I do not see a paused mission to resume right now.'
      };
    } catch (err: any) {
      return {
        success: false,
        message: `I could not check Mission Control before resuming: ${err.response?.data?.error || err.message}`
      };
    }
  },

  async prepareContextualMissionCancel(): Promise<{ success: boolean; message: string; missionId?: string; title?: string; needsConfirmation?: boolean }> {
    try {
      const board = await fetchBoardSnapshot();
      const active = [...board.running, ...board.paused];

      if (active.length === 1) {
        const mission = active[0];
        const title = missionTitle(mission);
        return {
          success: true,
          missionId: mission.missionId,
          title,
          needsConfirmation: true,
          message: [
            `I can cancel ${title}.`,
            '',
            'Reply `yes, cancel it` to confirm.',
            '',
            `Board: ${missionScopedBoardUrl(mission.missionId)}`
          ].join('\n')
        };
      }

      if (active.length > 1) {
        return {
          success: false,
          message: contextualMissionCommandPicker(active, 'active', 'kill', 'cancel')
        };
      }

      return {
        success: false,
        message: 'I do not see a running or paused mission to cancel right now.'
      };
    } catch (err: any) {
      return {
        success: false,
        message: `I could not check Mission Control before preparing cancellation: ${err.response?.data?.error || err.message}`
      };
    }
  },

  async describeContextualMissionCancelBoundary(): Promise<{ success: boolean; message: string; missionId?: string; title?: string; needsConfirmation?: boolean }> {
    try {
      const board = await fetchBoardSnapshot();
      const active = [...board.running, ...board.paused];

      if (active.length === 1) {
        const mission = active[0];
        const title = missionTitle(mission);
        const status = mission.status === 'paused' || mission.lastEventType === 'mission_paused' ? 'paused' : 'active';
        return {
          success: true,
          message: `I did not cancel it. ${title} is still ${status}.`
        };
      }

      if (active.length > 1) {
        return {
          success: true,
          message: `I did not cancel anything. I see ${countWord(active.length)} active missions, so I need you to choose one before I stop anything.`
        };
      }

      return {
        success: true,
        message: 'I did not cancel anything. Mission Control has nothing running or paused right now.'
      };
    } catch (err: any) {
      return {
        success: false,
        message: `I could not check Mission Control before answering: ${err.response?.data?.error || err.message}`
      };
    }
  },

  async confirmContextualMissionCancel(missionId: string, title: string): Promise<{ success: boolean; message: string; missionId?: string; commandSent?: boolean }> {
    try {
      const board = await fetchBoardSnapshot();
      const active = [...board.running, ...board.paused];
      const mission = active.find((entry) => entry.missionId === missionId);

      if (!mission) {
        return {
          success: false,
          message: [
            'That mission is no longer running or paused, so I did not cancel it.',
            '',
            `Board: ${missionScopedBoardUrl(missionId)}`
          ].join('\n')
        };
      }

      const currentTitle = missionTitle(mission) || title;
      const result = await spawner.missionCommand('kill', missionId);
      if (!result.success) {
        return {
          success: false,
          message: `I could not cancel ${currentTitle}: ${result.message}`
        };
      }

      return {
        success: true,
        missionId,
        commandSent: true,
        message: result.message
      };
    } catch (err: any) {
      return {
        success: false,
        message: `I could not check Mission Control before confirming cancellation: ${err.response?.data?.error || err.message}`
      };
    }
  },

  async board(): Promise<{ success: boolean; message: string }> {
    try {
      const board = await fetchBoardSnapshot();
      return {
        success: true,
        message: formatBoardTelegramSummary(board)
      };
    } catch (err: any) {
      return {
        success: false,
        message: err.response?.data?.error || err.message
      };
    }
  },

  async latestKanbanSummary(): Promise<{ success: boolean; message: string }> {
    try {
      const latest = latestBoardEntry(await fetchBoardSnapshot());
      if (!latest) {
        return {
          success: true,
          message: 'Kanban has no missions yet.'
        };
      }

      return {
        success: true,
        message: formatLatestKanbanTelegramSummary(latest)
      };
    } catch (err: any) {
      return {
        success: false,
        message: err.response?.data?.error || err.message
      };
    }
  },

  async activeMissionSummary(): Promise<{ success: boolean; message: string }> {
    try {
      return {
        success: true,
        message: formatActiveMissionsTelegramSummary(await fetchBoardSnapshot())
      };
    } catch (err: any) {
      return {
        success: false,
        message: err.response?.data?.error || err.message
      };
    }
  },

  async latestProviderSummary(): Promise<{ success: boolean; message: string }> {
    try {
      const latest = latestBoardEntry(await fetchBoardSnapshot());
      if (!latest) {
        return {
          success: true,
          message: 'I do not see any Spawner jobs on Kanban yet.'
        };
      }

      return {
        success: true,
        message: formatLatestProviderTelegramSummary(latest)
      };
    } catch (err: any) {
      return {
        success: false,
        message: err.response?.data?.error || err.message
      };
    }
  },

  async latestFailedProviderSummary(): Promise<{ success: boolean; message: string }> {
    try {
      const latest = latestFailureEntry(await fetchBoardSnapshot());
      if (!latest) {
        return {
          success: true,
          message: 'I do not see a failed Spawner mission in the current board.'
        };
      }

      return {
        success: true,
        message: formatLatestProviderTelegramSummary(latest, {
          subject: 'latest failed Spawner job',
          boardOnly: true
        })
      };
    } catch (err: any) {
      return {
        success: false,
        message: err.response?.data?.error || err.message
      };
    }
  },

  async latestMissionSummary(): Promise<{ success: boolean; message: string }> {
    try {
      const latest = latestBoardEntry(await fetchBoardSnapshot());
      if (!latest) {
        return {
          success: true,
          message: 'I do not see any Spawner missions on the current board yet.'
        };
      }

      return {
        success: true,
        message: formatLatestMissionTelegramSummary(latest)
      };
    } catch (err: any) {
      return {
        success: false,
        message: err.response?.data?.error || err.message
      };
    }
  },

  async latestFailureSummary(): Promise<{ success: boolean; message: string }> {
    try {
      const latest = latestFailureEntry(await fetchBoardSnapshot());
      if (!latest) {
        return {
          success: true,
          message: 'I do not see a failed Spawner mission in the current board.'
        };
      }

      return {
        success: true,
        message: formatLatestFailureTelegramSummary(latest)
      };
    } catch (err: any) {
      return {
        success: false,
        message: err.response?.data?.error || err.message
      };
    }
  },

  async latestProjectPreview(): Promise<{ success: boolean; message: string }> {
    try {
      const board = await fetchBoardSnapshot();
      const completed = [...board.completed]
        .sort((a, b) => Date.parse(b.lastUpdated || '') - Date.parse(a.lastUpdated || ''));
      const shippedCandidates = completed.filter((entry) => !isOperationalProbeMission(entry));
      const latest = shippedCandidates.find((entry) => projectOpenLinkForEntry(entry)) || shippedCandidates[0];
      if (!latest) {
        return {
          success: true,
          message: 'I do not see a shipped app link yet.'
        };
      }

      const openLink = projectOpenLinkForEntry(latest);
      if (!openLink) {
        return {
          success: true,
          message: [
            `I found the latest app-like completed run: ${missionTitle(latest)}.`,
            '',
            'I do not see a local preview link attached yet, so the board is the best place to inspect it.',
            '',
            'Mission board',
            `• ${missionBoardUrl()}`
          ].join('\n')
        };
      }

      return {
        success: true,
        message: [
          'Here is the latest shipped app:',
          '',
          latest.missionName || latest.taskName || latest.missionId,
          openLink,
          '',
          'Tell me what feels off and Spark can keep polishing it.'
        ].join('\n')
      };
    } catch (err: any) {
      return {
        success: false,
        message: err.response?.data?.error || err.message
      };
    }
  }
};
