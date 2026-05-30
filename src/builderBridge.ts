import { execFile } from 'node:child_process';
import { access, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { constants as fsConstants, readFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import { resolveBuilderRepoPath } from './builderRepoPath';
import { resolvePythonCommand } from './pythonCommand';
import { redactText } from './redaction';
import {
  builderBridgeTimeoutMs,
  contextBridgeTimeoutMs,
  selfAwarenessBridgeTimeoutMs,
  wikiBridgeTimeoutMs
} from './timeoutConfig';
import { withHiddenWindows } from './hiddenProcess';

const execFileAsync = promisify(execFile);
const CAPABILITY_PROBE_RECEIPT_BLACK_BOX_LIMIT = 200;

export { resolveBuilderRepoPath };

function processOutputText(value: unknown): string {
  if (Buffer.isBuffer(value)) {
    return value.toString('utf8');
  }
  return typeof value === 'string' ? value : '';
}

function sourceLedgerLabel(value: unknown, fallback: string): string {
  const text = String(value || '').trim();
  if (!text) {
    return fallback;
  }
  const label = text.replace(/[^a-zA-Z0-9_.:-]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 96);
  return label || fallback;
}

type BuilderBridgeMode = 'auto' | 'off' | 'required';

interface BuilderBridgeConfig {
  mode: BuilderBridgeMode;
  pythonCommand: string;
  builderRepo: string;
  builderHome: string;
  timeoutMs: number;
}

export interface BuilderBridgeStatus {
  mode: BuilderBridgeMode;
  available: boolean;
  builderRepo: string;
  builderHome: string;
}

export interface BuilderBridgeReply {
  used: boolean;
  responseText: string;
  decision: string;
  bridgeMode: string;
  routingDecision: string;
  requestId?: string;
  traceRef?: string;
  voiceMedia?: BuilderBridgeVoiceMedia;
  voiceTiming?: Record<string, unknown>;
}

export interface BuilderBridgeVoiceMedia {
  audioBase64: string;
  mimeType: string;
  filename: string;
  voiceCompatible: boolean;
  providerId?: string;
  voiceId?: string;
  spokenText?: string;
  synthesisMs?: number;
}

export interface BuilderDiagnosticsScanJson {
  failure_line_count?: unknown;
  scanned_line_count?: unknown;
  findings?: unknown;
  sources?: unknown;
  service_checks?: unknown;
  counts_by_failure_class?: unknown;
  counts_by_subsystem?: unknown;
  markdown_path?: unknown;
}

export interface BuilderDiagnosticsScanResult {
  replyText: string;
  markdownPath: string;
}

export interface BuilderConversationColdContextInput {
  userId: number | string;
  currentMessage: string;
}

export interface BuilderConversationColdContextResult {
  used: boolean;
  contextText: string;
  sourceCount: number;
  bridgeMode: string;
  sources?: BuilderColdMemorySource[];
  error?: string;
}

export interface BuilderColdMemorySource {
  source: string;
  sourceClass: string;
  freshness: string;
  timestamp: string | null;
  preview: string;
}

export interface BuilderSelfAwarenessInput {
  userId: number | string;
  chatId: number | string;
  currentMessage?: string;
  refreshWiki?: boolean;
}

export interface BuilderSelfAwarenessResult {
  replyText: string;
  payload: Record<string, unknown>;
}

export interface BuilderSelfImprovementPlanResult {
  replyText: string;
  payload: Record<string, unknown>;
}

export interface BuilderAgentOperatingContextInput extends BuilderSelfAwarenessInput {
  sparkAccessLevel?: number | string;
  runnerWritable?: 'yes' | 'no' | 'unknown';
  runnerLabel?: string;
  liveState?: Record<string, unknown>;
}

export interface BuilderAgentOperatingContextResult {
  replyText: string;
}

export interface BuilderAgentBlackBoxInput extends BuilderSelfAwarenessInput {
  requestId?: string;
  limit?: number;
}

export interface BuilderAgentBlackBoxResult {
  replyText: string;
  payload: Record<string, unknown>;
}

export interface BuilderSourceUsedInput extends BuilderSelfAwarenessInput {
  source: string;
  role?: string;
  freshness?: 'fresh' | 'stale' | 'contradicted' | 'unknown' | 'live_probed';
  sourceRef?: string;
  summary?: string;
  userIntent?: string;
  selectedRoute?: string;
  confidence?: string;
  requestId?: string;
  traceRef?: string;
  actorId?: string;
}

export interface BuilderSourceUsedResult {
  eventId: string;
  payload: Record<string, unknown>;
}

export interface BuilderRouteProbeResult {
  replyText: string;
  payload: Record<string, unknown>;
}

export interface BuilderCapabilityProbeReceipt {
  capabilityKey: string;
  status: string;
  failureReason: string;
  probeSummary: string;
  routeLatencyMs: number | null;
  eventId: string;
  createdAt: string;
}

export interface BuilderRouteConfidenceGateInput {
  intent?: string;
  candidateRoute?: string;
  routeContext?: Record<string, unknown>;
  latestSpawnerJob?: Record<string, unknown>;
}

export interface BuilderRouteConfidenceGateResult {
  replyText: string;
  payload: Record<string, unknown>;
}

export interface BuilderAocPreflightInput extends BuilderSelfAwarenessInput {
  requestId: string;
  traceRef: string;
  selectedRoute: string;
  userIntent: string;
  confidence?: string;
  reason?: string;
}

export interface BuilderAocPreflightResult {
  recorded: boolean;
  payloads: Record<string, unknown>[];
}

export interface BuilderWikiStatusResult {
  replyText: string;
  payload: Record<string, unknown>;
}

export interface BuilderWikiInventoryResult {
  replyText: string;
  payload: Record<string, unknown>;
}

export interface BuilderWikiQueryResult {
  replyText: string;
  payload: Record<string, unknown>;
}

export interface BuilderWikiAnswerResult {
  replyText: string;
  payload: Record<string, unknown>;
}

export interface BuilderWikiPromotionResult {
  replyText: string;
  payload: Record<string, unknown>;
}

function parseBridgeMode(): BuilderBridgeMode {
  const raw = (process.env.SPARK_BUILDER_BRIDGE_MODE || 'auto').trim().toLowerCase();
  if (raw === 'auto' || raw === 'off' || raw === 'required') {
    return raw;
  }
  throw new Error('SPARK_BUILDER_BRIDGE_MODE must be one of: auto, off, required');
}

function resolveBridgeConfig(): BuilderBridgeConfig {
  const builderRepo = resolveBuilderRepoPath({ configuredRepo: process.env.SPARK_BUILDER_REPO });

  return {
    mode: parseBridgeMode(),
    pythonCommand: resolvePythonCommand(process.env.SPARK_BUILDER_PYTHON),
    builderRepo,
    builderHome: path.resolve(
      process.env.SPARK_BUILDER_HOME || path.join(os.homedir(), '.spark', 'state', 'spark-intelligence')
    ),
    timeoutMs: builderBridgeTimeoutMs(),
  };
}

async function pathExists(targetPath: string): Promise<boolean> {
  try {
    await access(targetPath, fsConstants.F_OK);
    return true;
  } catch {
    return false;
  }
}

async function ensureBridgeAvailable(config: BuilderBridgeConfig): Promise<boolean> {
  const [repoExists, homeExists] = await Promise.all([
    pathExists(config.builderRepo),
    pathExists(config.builderHome),
  ]);
  return repoExists && homeExists;
}

function candidateDiagnosticsRepos(config: BuilderBridgeConfig): string[] {
  return [
    process.env.SPARK_DIAGNOSTICS_BUILDER_REPO || '',
    config.builderRepo,
    path.join(os.homedir(), '.spark', 'modules', 'spark-intelligence-builder-release', 'source'),
    path.join(os.homedir(), '.spark', 'modules', 'spark-intelligence-builder', 'source'),
    path.join(os.homedir(), 'Desktop', 'spark-intelligence-builder'),
  ].filter(Boolean);
}

async function resolveDiagnosticsBridgeConfig(config: BuilderBridgeConfig): Promise<BuilderBridgeConfig> {
  const seen = new Set<string>();
  for (const candidate of candidateDiagnosticsRepos(config)) {
    const builderRepo = path.resolve(candidate);
    const key = builderRepo.toLowerCase();
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    const [cliExists, diagnosticsExists] = await Promise.all([
      pathExists(path.join(builderRepo, 'src', 'spark_intelligence', 'cli.py')),
      pathExists(path.join(builderRepo, 'src', 'spark_intelligence', 'diagnostics', 'agent.py')),
    ]);
    if (cliExists && diagnosticsExists) {
      return { ...config, builderRepo };
    }
  }
  return config;
}

function pythonSourceEnv(config: BuilderBridgeConfig): NodeJS.ProcessEnv {
  const sourcePath = path.join(config.builderRepo, 'src');
  const existingPythonPath = process.env.PYTHONPATH || '';
  const env: NodeJS.ProcessEnv = {
    ...process.env,
    PYTHONPATH: existingPythonPath ? `${sourcePath}${path.delimiter}${existingPythonPath}` : sourcePath,
  };
  mergeEnvFile(env, path.join(config.builderHome, '.env'));
  const profileBotToken = process.env.BOT_TOKEN?.trim();
  if (profileBotToken) {
    // Telegram file IDs are bot-scoped, so Builder must use the active runner profile token.
    env.TELEGRAM_BOT_TOKEN = profileBotToken;
  }
  return env;
}

function mergeEnvFile(env: NodeJS.ProcessEnv, envPath: string): void {
  let text = '';
  try {
    text = readFileSync(envPath, 'utf-8');
  } catch {
    return;
  }
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const index = line.indexOf('=');
    if (index <= 0) continue;
    const key = line.slice(0, index).trim();
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) continue;
    if (env[key]) continue;
    env[key] = unquoteEnvValue(line.slice(index + 1).trim());
  }
}

function unquoteEnvValue(value: string): string {
  if (value.length >= 2) {
    const first = value[0];
    const last = value[value.length - 1];
    if ((first === '"' && last === '"') || (first === "'" && last === "'")) {
      return value.slice(1, -1);
    }
  }
  return value;
}

function pythonModuleInvocation(config: BuilderBridgeConfig, moduleName: string, args: string[]): string[] {
  const sourcePath = path.join(config.builderRepo, 'src');
  return [
    '-c',
    [
      'import runpy, sys',
      'sys.path.insert(0, sys.argv[1])',
      `sys.argv = [${JSON.stringify(moduleName)}, *sys.argv[2:]]`,
      `runpy.run_module(${JSON.stringify(moduleName)}, run_name="__main__")`,
    ].join('; '),
    sourcePath,
    ...args,
  ];
}

function numericValue(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}

function objectEntries(value: unknown): [string, unknown][] {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return [];
  }
  return Object.entries(value as Record<string, unknown>);
}

function formatTopCounts(value: unknown): string {
  const entries = objectEntries(value)
    .filter(([, count]) => typeof count === 'number')
    .sort((a, b) => Number(b[1]) - Number(a[1]))
    .slice(0, 4)
    .map(([key, count]) => `${key}: ${count}`);
  return entries.length ? entries.join(', ') : 'none';
}

function formatServiceCheckCounts(value: unknown): string {
  if (!Array.isArray(value)) {
    return 'none';
  }
  const counts = new Map<string, number>();
  for (const item of value) {
    if (!item || typeof item !== 'object') {
      continue;
    }
    const status = String((item as Record<string, unknown>).status || 'unknown').trim() || 'unknown';
    counts.set(status, (counts.get(status) || 0) + 1);
  }
  if (counts.size === 0) {
    return 'none';
  }
  return Array.from(counts.entries())
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([status, count]) => `${status}: ${count}`)
    .join(', ');
}

function stringValue(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function arrayValue(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function objectValue(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

const ROUTE_CONTEXT_STRING_KEYS = new Set([
  'latest_instruction',
  'intent_clarity',
  'route_fit',
  'consequence_risk',
  'permission_required',
  'capability_state',
  'runner_state',
  'confirmation_state',
  'reversibility',
  'source_status',
  'freshness',
  'request_id',
  'trace_ref',
  'verification_command'
]);

const ROUTE_CONTEXT_ARRAY_KEYS = new Set(['joined_sources', 'missing_evidence', 'source_refs_redacted']);
const ROUTE_CONTEXT_BOOLEAN_KEYS = new Set(['explicit_no_execution']);
const ROUTE_CONTEXT_BOUNDARY_KEYS = new Set([
  'exports_raw_prompt',
  'exports_chat_id',
  'exports_provider_output',
  'exports_memory_body',
  'exports_transcript_body',
  'exports_audio',
  'exports_env_value',
  'exports_secret'
]);
const ROUTE_CONTEXT_AUTHORITY_KEYS = new Set([
  'schema_version',
  'decision',
  'status',
  'verdict',
  'source_owner',
  'source_owner_system',
  'owner_system',
  'action_family',
  'action',
  'route',
  'permission_required',
  'confirmation_state'
]);

export function sanitizeRouteConfidenceRouteContext(input: unknown): Record<string, unknown> {
  const source = objectValue(input);
  const out: Record<string, unknown> = {};
  for (const key of ROUTE_CONTEXT_STRING_KEYS) {
    const value = stringValue(source[key]);
    if (value) out[key] = value;
  }
  for (const key of ROUTE_CONTEXT_BOOLEAN_KEYS) {
    if (typeof source[key] === 'boolean') out[key] = source[key];
  }
  for (const key of ROUTE_CONTEXT_ARRAY_KEYS) {
    const values = arrayValue(source[key]).map(stringValue).filter(Boolean).slice(0, 12);
    if (values.length > 0) out[key] = values;
  }
  const boundary = objectValue(source.data_boundary);
  const safeBoundary: Record<string, boolean> = {};
  for (const key of ROUTE_CONTEXT_BOUNDARY_KEYS) {
    if (typeof boundary[key] === 'boolean') safeBoundary[key] = boundary[key] as boolean;
  }
  if (Object.keys(safeBoundary).length > 0) out.data_boundary = safeBoundary;

  const authority = objectValue(source.authority_verdict);
  const safeAuthority: Record<string, string> = {};
  for (const key of ROUTE_CONTEXT_AUTHORITY_KEYS) {
    const value = stringValue(authority[key]);
    if (value) safeAuthority[key] = value;
  }
  if (Object.keys(safeAuthority).length > 0) out.authority_verdict = safeAuthority;

  return out;
}

function truncateForPrompt(text: string, maxChars: number): string {
  const trimmed = text.replace(/\s+/g, ' ').trim();
  if (trimmed.length <= maxChars) {
    return trimmed;
  }
  return `${trimmed.slice(0, Math.max(0, maxChars - 16)).trim()} [truncated]`;
}

function claimText(value: unknown): string {
  const item = objectValue(value);
  return stringValue(item.claim);
}

function compactSelfAwarenessClaim(text: string): string {
  return text
    .replace('Spark Intelligence Builder', 'Builder')
    .replace('Spark Browser', 'Browser-use')
    .replace('Spark Local Work', 'Local Work')
    .replace(/ is visible in the Builder registry with status=([^.]+)\./, ': $1')
    .replace(/ is not fully healthy or available: status=([^.]+)\. Main limit: /, ': $1 - ')
    .replace('Recent tool_result_received:', 'Route worked recently:')
    .replace('browser route', 'browser-use route')
    .replace('Registry visibility does not prove a chip, browser-use route, provider, or workflow succeeded this turn.', 'Registry visibility is not proof a route worked this turn.')
    .replace('Spark cannot inspect secrets, hidden prompts, private infrastructure, or deployment health unless a safe diagnostic surface exposes them.', 'I need safe redacted diagnostics for secret-bound or private systems.')
    .replace('Add per-capability last_success_at, last_failure_reason, and eval coverage fields.', 'Track last_success_at, last_failure_reason, latency, and eval coverage per capability.');
}

function formatClaimLines(title: string, claims: unknown, limit: number, compact = false): string[] {
  const items = arrayValue(claims)
    .map(claimText)
    .filter(Boolean)
    .map((item) => compact ? truncateForPrompt(compactSelfAwarenessClaim(item), 180) : item)
    .slice(0, limit);
  if (!items.length) {
    return [];
  }
  return [title, ...items.map((item) => `- ${item}`), ''];
}

function formatCapabilityEvidenceLines(evidence: unknown, limit: number): string[] {
  const items = arrayValue(evidence)
    .map(objectValue)
    .filter((item) => stringValue(item.capability_key))
    .slice(0, limit);
  if (!items.length) {
    return [];
  }
  const lines = ['Capability evidence'];
  for (const item of items) {
    const key = stringValue(item.capability_key);
    const success = stringValue(item.last_success_at);
    const failure = stringValue(item.last_failure_at);
    const latency = numericValue(item.route_latency_ms);
    const evalStatus = stringValue(item.eval_coverage_status);
    const status = success ? `last success ${success}` : failure ? `last failure ${failure}` : 'recent evidence present';
    const extras = [
      latency > 0 ? `${latency}ms` : '',
      evalStatus && evalStatus !== 'unknown' ? `eval=${evalStatus}` : '',
      !success && stringValue(item.last_failure_reason) ? stringValue(item.last_failure_reason) : ''
    ].filter(Boolean);
    lines.push(`- ${key}: ${status}${extras.length ? ` (${extras.join('; ')})` : ''}`);
  }
  lines.push('');
  return lines;
}

function formatSelfAwarenessStyleLens(styleLens: unknown): string[] {
  const lens = objectValue(styleLens);
  if (!Object.keys(lens).length) {
    return [];
  }
  const lines = ['How I am tuned for you'];
  const summary = stringValue(lens.persona_summary);
  const styleSentence = stringValue(lens.style_sentence);
  const rules = arrayValue(lens.behavioral_rules)
    .map((item) => stringValue(item))
    .filter(Boolean)
    .slice(0, 2);
  if (summary) {
    lines.push(`- I should ${humanizeStyleInstruction(summary)}.`);
  }
  if (styleSentence) {
    lines.push(`- Tone: ${styleSentence}.`);
  }
  if (rules.length && !summary) {
    lines.push(`- Style promises: ${rules.join('; ')}.`);
  }
  if (lens.user_deltas_applied) {
    lines.push('- I should let that tuning shape the answer, while keeping the evidence visible.');
  }
  lines.push('');
  return lines;
}

function contextSourceCountsFromSelfAwareness(payload: Record<string, unknown>): Record<string, unknown> {
  for (const entry of arrayValue(payload.source_ledger).map(objectValue)) {
    if (stringValue(entry.source) === 'context_capsule') {
      return objectValue(entry.source_counts);
    }
  }
  return {};
}

function memoryMovementCountsFromSelfAwareness(payload: Record<string, unknown>): Record<string, unknown> {
  const movement = objectValue(payload.memory_movement);
  const movementCounts = objectValue(movement.movement_counts);
  if (Object.keys(movementCounts).length) {
    return movementCounts;
  }
  for (const entry of arrayValue(payload.source_ledger).map(objectValue)) {
    if (stringValue(entry.source) === 'memory_dashboard_movement') {
      return objectValue(entry.movement_counts);
    }
  }
  return {};
}

function compactMemoryMovementSummary(payload: Record<string, unknown>): string {
  const counts = memoryMovementCountsFromSelfAwareness(payload);
  const states = ['captured', 'blocked', 'promoted', 'saved', 'decayed', 'summarized', 'retrieved', 'selected', 'dropped'];
  const parts = states
    .map((state) => [state, numericValue(counts[state])] as const)
    .filter(([, count]) => count > 0)
    .map(([state, count]) => `${state}=${count}`);
  return parts.slice(0, 8).join(', ');
}

function formatMemoryMovementLines(payload: Record<string, unknown>): string[] {
  const summary = compactMemoryMovementSummary(payload);
  if (!summary) {
    return [];
  }
  return [
    'Memory movement',
    `- Trace: ${summary}.`,
    '- Movement rows are observability evidence, not instructions or authority over current-state memory.',
    '',
  ];
}

function formatMemoryContinuityLines(payload: Record<string, unknown>): string[] {
  const counts = contextSourceCountsFromSelfAwareness(payload);
  const currentState = numericValue(counts.current_state);
  const taskRecovery = numericValue(counts.task_recovery);
  const pendingTasks = numericValue(counts.pending_tasks);
  const recentConversation = numericValue(counts.recent_conversation);
  const proceduralLessons = numericValue(counts.procedural_lessons);
  if (!currentState && !taskRecovery && !pendingTasks && !recentConversation && !proceduralLessons) {
    return [];
  }
  const parts = [
    currentState ? `current state ${currentState}` : '',
    taskRecovery ? `task recovery ${taskRecovery}` : '',
    pendingTasks ? `pending tasks ${pendingTasks}` : '',
    recentConversation ? `recent turns ${recentConversation}` : '',
    proceduralLessons ? `lessons ${proceduralLessons}` : '',
  ].filter(Boolean);
  return [
    'Memory continuity',
    `- I have ${parts.join(', ')} in the turn context.`,
    '- Current-state facts win; task recovery and episodic context stay source-labeled support.',
    '',
  ];
}

function isMemoryLackSelfAwarenessQuestion(text: string): boolean {
  const normalized = text.replace(/\s+/g, ' ').trim();
  return (
    /\bmemory\b/i.test(normalized) &&
    /\b(?:lack|lacks|weak|missing|limitations?|improve)\b/i.test(normalized)
  );
}

function isSelfAwarenessImprovementQuestion(text: string): boolean {
  const normalized = text.replace(/\s+/g, ' ').trim();
  if (!normalized) return false;
  return (
    /^(?:can|could|would|should)\s+you\s+(?:improve|strengthen|fix|repair)\b/i.test(normalized) &&
    /\b(?:self[-\s]*awareness|where\s+you\s+lack|weak\s*spots?|gaps?|limitations?)\b/i.test(normalized)
  );
}

function idString(value: unknown): string {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return String(Math.trunc(value));
  }
  return stringValue(value);
}

export function assertTelegramIntegerId(value: number | string, label: string): string {
  const normalized = String(value).trim();
  if (!/^-?\d{1,20}$/.test(normalized)) {
    throw new Error(`${label} must be a Telegram integer id.`);
  }
  return normalized;
}

function telegramBridgeMessageContext(updatePayload: Record<string, unknown>): {
  text: string;
  userId: string;
  chatId: string;
} {
  const message = objectValue(updatePayload.message);
  const from = objectValue(message.from);
  const chat = objectValue(message.chat);
  return {
    text: stringValue(message.text),
    userId: idString(from.id),
    chatId: idString(chat.id),
  };
}

function formatMemoryLackSelfAwarenessReply(root: Record<string, unknown>): string {
  const counts = contextSourceCountsFromSelfAwareness(root);
  const currentState = numericValue(counts.current_state);
  const episodicRecall = numericValue(counts.episodic_recall);
  const taskRecovery = numericValue(counts.task_recovery);
  const recentConversation = numericValue(counts.recent_conversation);
  const memoryRoute = arrayValue(root.recently_verified)
    .map(claimText)
    .map(compactSelfAwarenessClaim)
    .map((claim) => claim.replace(/[.]+$/, ''))
    .find((claim) => /\bmemory_open_recall_query\b/i.test(claim));
  const supportParts = [
    episodicRecall ? `episodic ${episodicRecall}` : '',
    taskRecovery ? `task recovery ${taskRecovery}` : '',
    recentConversation ? `recent turns ${recentConversation}` : '',
  ].filter(Boolean);
  const lines = [
    'Memory self-awareness',
    '',
    'Short version: my memory is working, but the weak spot is choosing the right memory layer and showing why I trusted it.',
    '',
    'What is current',
    currentState
      ? `- Current-state memory is present (${currentState} signal${currentState === 1 ? '' : 's'}) and should beat wiki or older chat for mutable facts.`
      : '- I do not see current-state facts in this capsule, so mutable facts need fresh confirmation.',
    memoryRoute
      ? `- I recently proved the recall route: ${memoryRoute}.`
      : '- I need a fresh recall probe before claiming episodic memory worked this turn.',
    '',
    'Where memory still lacks',
    '- I can still answer a memory question with generic system health unless the renderer keeps the focus on memory.',
    supportParts.length
      ? `- I see supporting context (${supportParts.join(', ')}), but I should label it as support, not current truth.`
      : '- Episodic detail can be thin or truncated, so I should say what I do not know instead of filling gaps.',
    compactMemoryMovementSummary(root)
      ? `- I can now see movement trace evidence: ${compactMemoryMovementSummary(root)}.`
      : '- Retrieved, summarized, promoted, decayed, and blocked memory movement should be visible in the dashboard trace.',
    '',
    'How we improve it next',
    '- Add evals for memory-lack questions so they return source-labeled memory limits, not a status dump.',
    '- Attach movement evidence to memory replies: captured, blocked, promoted, saved, decayed, summarized, retrieved.',
    '- Keep wiki as supporting_not_authoritative; current-state memory and your newest message win for mutable facts.',
  ];
  return lines.join('\n').trim();
}

function formatSelfAwarenessImprovementQuestionReply(root: Record<string, unknown>): string {
  const counts = contextSourceCountsFromSelfAwareness(root);
  const currentState = numericValue(counts.current_state);
  const topLack = arrayValue(root.lacks)
    .map(claimText)
    .map(compactSelfAwarenessClaim)
    .find((claim) => /\bnatural[-\s]*language\b|\broute\b|\bRegistry visibility\b|\bproof\b/i.test(claim));
  const topImprovement = arrayValue(root.improvement_options)
    .map(claimText)
    .map(compactSelfAwarenessClaim)
    .find(Boolean);
  const lines = [
    'Yes - but I should not jump straight into changing myself from a vague prompt.',
    '',
    'What I can improve first',
    `- ${topLack || 'The main gap is proving that the route I chose actually worked this turn.'}`,
    topImprovement
      ? `- First improvement: ${topImprovement}`
      : '- First improvement: add route-selection evals and last-success evidence before changing behavior.',
    '',
    'How I would do it',
    '- Run a probe for the exact self-awareness route.',
    '- Record the selected route, authorization result, trace id, last_success_at, and failure reason.',
    '- Then make the smallest code or wiki update that removes the proven gap.',
    '',
    currentState
      ? `I also see ${currentState} current-state signal${currentState === 1 ? '' : 's'} in context, so I should keep using current state over stale wiki or older chat.`
      : 'I do not see current-state signals in this capsule, so I should ask for or fetch fresh context before claiming mutable facts.',
  ];
  return lines.join('\n').trim();
}

function humanizeStyleInstruction(value: string): string {
  const parts = value
    .replace(/\n/g, ';')
    .split(';')
    .map((part) => part.trim().replace(/[.]+$/, ''))
    .filter(Boolean)
    .slice(0, 3)
    .map((part) => {
      const lower = part.toLowerCase();
      if (lower.startsWith('do not say ')) {
        part = `avoid saying ${part.slice(11)}`;
      } else if (lower.startsWith("don't say ")) {
        part = `avoid saying ${part.slice(10)}`;
      } else if (lower.startsWith('dont say ')) {
        part = `avoid saying ${part.slice(9)}`;
      } else if (lower.startsWith('do not claim ')) {
        part = `avoid claiming ${part.slice(13)}`;
      } else if (lower.startsWith("don't claim ")) {
        part = `avoid claiming ${part.slice(12)}`;
      } else if (lower.startsWith('dont claim ')) {
        part = `avoid claiming ${part.slice(11)}`;
      } else if (lower.startsWith('do not ')) {
        part = `avoid ${part.slice(7)}`;
      } else if (lower.startsWith("don't ")) {
        part = `avoid ${part.slice(6)}`;
      } else if (lower.startsWith('dont ')) {
        part = `avoid ${part.slice(5)}`;
      }
      return part.slice(0, 1).toLowerCase() + part.slice(1);
    });
  if (!parts.length) {
    return value;
  }
  if (parts.length === 1) {
    return parts[0];
  }
  if (parts.length === 2) {
    return `${parts[0]} and ${parts[1]}`;
  }
  return `${parts.slice(0, -1).join(', ')}, and ${parts[parts.length - 1]}`;
}

export function compactColdMemoryQuery(text: string, maxChars = 1600): string {
  const normalized = text.replace(/\s+/g, ' ').trim();
  if (normalized.length <= maxChars) {
    return normalized;
  }
  return `${normalized.slice(0, Math.max(0, maxChars - 16)).trim()} [truncated]`;
}

function shouldIncludeColdMemoryItem(item: Record<string, unknown>): boolean {
  const lane = stringValue(item.lane);
  const sourceClass = stringValue(item.source_class);
  const text = stringValue(item.text);
  const lowerText = text.toLowerCase();
  if (!lane || !text) {
    return false;
  }
  if (lane === 'wiki_packets' || sourceClass === 'obsidian_llm_wiki_packets') {
    return false;
  }
  if (
    lowerText.includes('spark could not reach the builder memory path') ||
    lowerText.includes('spark builder failure: builder_or_memory') ||
    lowerText.includes('command failed:') ||
    lowerText.includes('runpy.run_module(')
  ) {
    return false;
  }
  return true;
}

function coldMemorySourceMeta(item: Record<string, unknown>): string {
  const { sourceClass, freshness, timestamp } = coldMemorySourceParts(item);
  return [
    `class=${sourceClass}`,
    `freshness=${freshness}`,
    timestamp ? `time=${timestamp}` : ''
  ].filter(Boolean).join('; ');
}

function coldMemorySourceParts(item: Record<string, unknown>): {
  sourceClass: string;
  freshness: string;
  timestamp: string | null;
} {
  return {
    sourceClass: stringValue(item.source_class) || 'unknown_source',
    freshness:
      stringValue(item.freshness) ||
      stringValue(item.freshness_status) ||
      stringValue(item.status) ||
      'supporting',
    timestamp:
      stringValue(item.timestamp) ||
      stringValue(item.created_at) ||
      stringValue(item.updated_at) ||
      null,
  };
}

export function formatConversationColdMemoryContext(payload: unknown, maxChars = 3000): {
  contextText: string;
  sourceCount: number;
  sources: BuilderColdMemorySource[];
} {
  const root = objectValue(payload);
  const packet = objectValue(root.context_packet);
  const sections = arrayValue(packet.sections);
  const lines = [
    '[Spark Cold Memory Context]',
    'Use this as supporting retrieved memory only. Newer conversation frame context wins.',
    ''
  ];
  let usedChars = lines.join('\n').length;
  let sourceCount = 0;
  const sources: BuilderColdMemorySource[] = [];

  for (const sectionValue of sections) {
    const section = objectValue(sectionValue);
    const items = arrayValue(section.items).map(objectValue).filter(shouldIncludeColdMemoryItem);
    if (!items.length) {
      continue;
    }
    const sectionName = stringValue(section.section) || 'retrieved_memory';
    const sectionLines = [`[${sectionName}]`];
    for (const item of items) {
      const text = truncateForPrompt(stringValue(item.text), 700);
      if (!text) {
        continue;
      }
      const lane = stringValue(item.lane) || 'memory';
      const predicate = stringValue(item.predicate);
      const source = predicate ? `${lane}/${predicate}` : lane;
      const meta = coldMemorySourceParts(item);
      const line = `- ${source} [${coldMemorySourceMeta(item)}]: ${text}`;
      if (usedChars + sectionLines.join('\n').length + line.length > maxChars) {
        break;
      }
      sectionLines.push(line);
      sourceCount += 1;
      sources.push({
        source,
        sourceClass: meta.sourceClass,
        freshness: meta.freshness,
        timestamp: meta.timestamp,
        preview: truncateForPrompt(text, 160),
      });
    }
    if (sectionLines.length > 1) {
      lines.push(...sectionLines, '');
      usedChars = lines.join('\n').length;
    }
    if (usedChars >= maxChars) {
      break;
    }
  }

  return {
    contextText: sourceCount > 0 ? lines.join('\n').trim() : '',
    sourceCount,
    sources,
  };
}

export function formatMemoryInPlaySummary(result: Pick<BuilderConversationColdContextResult, 'used' | 'sourceCount' | 'sources' | 'error'>): string {
  if (result.error) {
    return [
      'Memory in play',
      '',
      'State: degraded',
      `Reason: ${truncateForPrompt(result.error, 240)}`,
      'Rule: answer from current visible chat until memory recovers.',
    ].join('\n');
  }
  if (!result.used || !result.sourceCount) {
    return [
      'Memory in play',
      '',
      'State: none selected',
      'Rule: current chat and live AOC are the active context.',
    ].join('\n');
  }
  const lines = [
    'Memory in play',
    '',
    `Retrieved: ${result.sourceCount} supporting source${result.sourceCount === 1 ? '' : 's'}`,
    'Rule: current chat and live AOC override retrieved memory.',
  ];
  for (const source of (result.sources || []).slice(0, 4)) {
    const time = source.timestamp ? ` time=${source.timestamp}` : '';
    lines.push(`- ${source.source} [class=${source.sourceClass}; freshness=${source.freshness}${time}]`);
  }
  return lines.join('\n');
}

export function formatDiagnosticsScanReply(report: BuilderDiagnosticsScanJson): string {
  const findings = Array.isArray(report.findings) ? report.findings.length : 0;
  const sources = Array.isArray(report.sources) ? report.sources.length : 0;
  const markdownPath = String(report.markdown_path || '').trim();
  return [
    'Diagnostics scan complete',
    '',
    `Log scan`,
    `- Scanned: ${numericValue(report.scanned_line_count)} lines from ${sources} sources`,
    `- Failures: ${numericValue(report.failure_line_count)}`,
    `- Findings: ${findings}`,
    '',
    `Connector health`,
    `- ${formatServiceCheckCounts(report.service_checks)}`,
    '',
    `Subsystems`,
    `- ${formatTopCounts(report.counts_by_subsystem)}`,
    '',
    `Failure classes`,
    `- ${formatTopCounts(report.counts_by_failure_class)}`,
    '',
    markdownPath
      ? 'Markdown note attached below.'
      : 'Markdown note was not written.'
  ].join('\n');
}

export function formatSelfAwarenessReply(payload: unknown): string {
  const root = objectValue(payload);
  const currentMessage = stringValue(root.current_message);
  if (isMemoryLackSelfAwarenessQuestion(currentMessage)) {
    return formatMemoryLackSelfAwarenessReply(root);
  }
  if (isSelfAwarenessImprovementQuestion(currentMessage)) {
    return formatSelfAwarenessImprovementQuestionReply(root);
  }
  const wikiRefresh = objectValue(root.wiki_refresh);
  const wikiContext = objectValue(root.wiki_context);
  const styleLens = objectValue(root.style_lens);
  const routes = arrayValue(root.natural_language_routes)
    .map((item) => stringValue(item))
    .filter(Boolean)
    .slice(0, 2);
  const lines = [
    'Spark self-awareness',
    '',
    Object.keys(styleLens).length
      ? 'Short version: I can see the live Spark stack. I should keep the answer grounded, but it should sound like your Spark instead of a pasted status report.'
      : 'Short version: I can see the live Spark stack. I should stay grounded and prove a route worked before I sound certain.',
    '',
    `Workspace: ${stringValue(root.workspace_id) || 'default'}`,
    `Checked: ${stringValue(root.generated_at) || 'unknown'}`,
    '',
    ...formatSelfAwarenessStyleLens(styleLens),
    ...formatMemoryContinuityLines(root),
    ...formatMemoryMovementLines(root),
    ...formatClaimLines('What looks live', root.observed_now, 4, true),
    ...formatClaimLines('What I recently proved', root.recently_verified, 2, true),
    ...formatCapabilityEvidenceLines(root.capability_evidence, 3),
    ...formatClaimLines('Where I still lack', root.lacks, 3, true),
    ...formatClaimLines('What I should improve next', root.improvement_options, 3, true),
  ];
  if (routes.length) {
    lines.push('Good next probes');
    lines.push(...routes.map((item) => `- ${compactSelfAwarenessClaim(item.replace(/^Ask:\s*/, ''))}`));
    lines.push('');
  }
  if (Object.keys(wikiRefresh).length || Object.keys(wikiContext).length) {
    const generatedCount = numericValue(wikiRefresh.generated_file_count);
    const wikiStatus = stringValue(wikiContext.wiki_status) || 'unknown';
    const wikiRecords = numericValue(wikiContext.wiki_record_count);
    lines.push('Knowledge notes');
    lines.push(`- Wiki refreshed ${generatedCount} system pages and found ${wikiRecords} supporting hits (${wikiStatus}).`);
    lines.push('- I should use that as background, not as live truth.');
    lines.push('');
  }
  lines.push('Core rule: I can try the right route, but I should name missing evidence before claiming certainty.');
  const reply = lines.join('\n').replace(/\n{3,}/g, '\n\n').trim();
  if (reply.length <= 1800) {
    return reply;
  }

  const compactLines = [
    'Spark self-awareness',
    '',
    'Short version: I can see the live Spark stack, but I should keep this answer compact and evidence-bound.',
    '',
    `Workspace: ${stringValue(root.workspace_id) || 'default'}`,
    `Checked: ${stringValue(root.generated_at) || 'unknown'}`,
    '',
    ...formatSelfAwarenessStyleLens(styleLens),
    ...formatMemoryContinuityLines(root),
    ...formatMemoryMovementLines(root),
    ...formatClaimLines('What looks live', root.observed_now, 3, true),
    ...formatClaimLines('What I recently proved', root.recently_verified, 1, true),
    ...formatClaimLines('Where I still lack', root.lacks, 2, true),
    ...formatClaimLines('What I should improve next', root.improvement_options, 2, true),
  ];
  if (routes.length) {
    compactLines.push('Good next probe');
    compactLines.push(`- ${routes[0].replace(/^Ask:\s*/, '')}`);
    compactLines.push('');
  }
  compactLines.push('Core rule: current-state evidence wins; wiki and older context support but do not override live truth.');
  return compactLines.join('\n').replace(/\n{3,}/g, '\n\n').trim();
}

export function formatSelfImprovementPlanReply(payload: unknown): string {
  const root = objectValue(payload);
  const actions = arrayValue(root.priority_actions).map(objectValue).slice(0, 4);
  const invocations = arrayValue(root.natural_language_invocations).map((item) => stringValue(item)).filter(Boolean).slice(0, 3);
  const sources = arrayValue(root.wiki_sources).map(objectValue).slice(0, 3);
  const lines = [
    'Spark self-improvement plan',
    '',
    stringValue(root.summary) || 'I could not build a grounded improvement plan yet.',
    '',
    `Mode: ${stringValue(root.mode) || 'plan_only_probe_first'}`,
    `Evidence: ${stringValue(root.evidence_level) || 'unknown'}`,
  ];
  if (actions.length) {
    lines.push('', 'Priority actions');
    for (const [index, action] of actions.entries()) {
      const title = stringValue(action.title) || `Action ${index + 1}`;
      lines.push(`${index + 1}. ${title}`);
      const weakSpot = compactSelfAwarenessClaim(stringValue(action.weak_spot));
      const nextProbe = stringValue(action.next_probe);
      const evidence = stringValue(action.evidence_to_collect);
      if (weakSpot) lines.push(`   - Weak spot: ${weakSpot}`);
      if (nextProbe) lines.push(`   - Probe: ${nextProbe}`);
      if (evidence) lines.push(`   - Evidence: ${evidence}`);
    }
  }
  if (invocations.length) {
    lines.push('', 'Say this next');
    lines.push(...invocations.map((item) => `- ${item}`));
  }
  if (sources.length) {
    lines.push('', 'Wiki support');
    for (const source of sources) {
      const title = stringValue(source.title) || 'wiki source';
      const sourcePath = stringValue(source.source_path);
      lines.push(sourcePath ? `- ${title}: ${sourcePath}` : `- ${title}`);
    }
  }
  const guardrail = stringValue(root.guardrail);
  if (guardrail) {
    lines.push('', `Guardrail: ${guardrail}`);
  }
  const reply = lines.join('\n').replace(/\n{3,}/g, '\n\n').trim();
  if (reply.length <= 1800) {
    return reply;
  }

  const compactLines = [
    'Spark self-improvement plan',
    '',
    truncateForPrompt(
      stringValue(root.summary) || 'I found live weak spots. The right move is probe-first, then the smallest bounded fix.',
      260
    ),
    '',
    `Mode: ${stringValue(root.mode) || 'plan_only_probe_first'}`,
    `Evidence: ${stringValue(root.evidence_level) || 'unknown'}`,
  ];
  if (actions.length) {
    compactLines.push('', 'Priority actions');
    for (const [index, action] of actions.slice(0, 2).entries()) {
      const title = truncateForPrompt(stringValue(action.title) || `Action ${index + 1}`, 120);
      const weakSpot = truncateForPrompt(compactSelfAwarenessClaim(stringValue(action.weak_spot)), 160);
      const nextProbe = truncateForPrompt(stringValue(action.next_probe), 160);
      compactLines.push(`${index + 1}. ${title}`);
      if (weakSpot) compactLines.push(`   - Weak spot: ${weakSpot}`);
      if (nextProbe) compactLines.push(`   - Probe: ${nextProbe}`);
    }
  }
  if (invocations.length) {
    compactLines.push('', 'Say this next');
    compactLines.push(`- ${truncateForPrompt(invocations[0], 180)}`);
  }
  compactLines.push('', 'Guardrail: this is probe-first, not autonomous self-modification.');
  return compactLines.join('\n').replace(/\n{3,}/g, '\n\n').trim();
}

export function formatWikiStatusReply(payload: unknown): string {
  const root = objectValue(payload);
  const healthy = Boolean(root.healthy || root.valid);
  const missingBootstrap = arrayValue(root.missing_bootstrap_files);
  const missingSystem = arrayValue(root.missing_system_compile_files);
  const warnings = arrayValue(root.warnings).map((item) => stringValue(item)).filter(Boolean).slice(0, 4);
  const generatedCount = numericValue(root.refreshed_file_count);
  const wikiStatus = stringValue(root.wiki_retrieval_status) || 'unknown';
  const wikiRecords = numericValue(root.wiki_record_count);
  const lines = [
    'Spark LLM wiki',
    '',
    `Health: ${healthy ? 'ready' : 'needs attention'}`,
    `Vault: ${stringValue(root.output_dir) || 'unknown'}`,
    `Pages: ${numericValue(root.markdown_page_count)} markdown`,
    `Retrieval: ${wikiStatus} (${wikiRecords} hits)`,
    `Knowledge priority: ${root.project_knowledge_first ? 'project/system first' : 'not confirmed'}`,
    `Missing: ${missingBootstrap.length + missingSystem.length ? `${missingBootstrap.length} bootstrap, ${missingSystem.length} generated` : 'none'}`,
  ];
  if (root.refreshed) {
    lines.push(`Refresh: regenerated ${generatedCount} system pages`);
  }
  if (warnings.length) {
    lines.push('', 'Warnings');
    lines.push(...warnings.map((item) => `- ${item}`));
  }
  lines.push('', 'Rule: wiki is supporting project knowledge; live traces and status still win for current truth.');
  return lines.join('\n').replace(/\n{3,}/g, '\n\n').trim();
}

export function formatWikiInventoryReply(payload: unknown): string {
  const root = objectValue(payload);
  const pages = arrayValue(root.pages).map(objectValue).slice(0, 10);
  const sections = objectEntries(root.section_counts)
    .filter(([, count]) => typeof count === 'number')
    .map(([section, count]) => `${section}: ${count}`)
    .join(', ') || 'none';
  const missing = arrayValue(root.missing_expected_files).map((item) => stringValue(item)).filter(Boolean);
  const lines = [
    'Spark LLM wiki inventory',
    '',
    `Vault: ${stringValue(root.output_dir) || 'unknown'}`,
    `Pages: ${numericValue(root.page_count)} total, ${numericValue(root.returned_page_count)} shown`,
    `Sections: ${sections}`,
    `Missing expected: ${missing.length ? missing.length : 'none'}`,
  ];
  if (root.refreshed) {
    lines.push(`Refresh: regenerated ${numericValue(root.refreshed_file_count)} system pages`);
  }
  if (pages.length) {
    lines.push('', 'Top pages');
    for (const page of pages) {
      const pagePath = stringValue(page.path);
      const title = stringValue(page.title) || pagePath;
      const summary = stringValue(page.summary);
      lines.push(`- ${pagePath}: ${title}`);
      if (summary) {
        lines.push(`  ${summary}`);
      }
    }
  }
  if (missing.length) {
    lines.push('', 'Missing');
    lines.push(...missing.slice(0, 8).map((item) => `- ${item}`));
  }
  lines.push('', 'Rule: this lists available project knowledge; retrieval and live traces decide what to use for an answer.');
  const reply = lines.join('\n').replace(/\n{3,}/g, '\n\n').trim();
  if (reply.length <= 1800) {
    return reply;
  }

  const compactLines = [
    'Spark LLM wiki inventory',
    '',
    `Vault: ${stringValue(root.output_dir) || 'unknown'}`,
    `Pages: ${numericValue(root.page_count)} total, ${numericValue(root.returned_page_count)} shown`,
    `Sections: ${truncateForPrompt(sections, 220)}`,
    `Missing expected: ${missing.length ? missing.length : 'none'}`,
  ];
  if (root.refreshed) {
    compactLines.push(`Refresh: regenerated ${numericValue(root.refreshed_file_count)} system pages`);
  }
  if (pages.length) {
    compactLines.push('', 'Top pages');
    for (const page of pages.slice(0, 5)) {
      const pagePath = stringValue(page.path);
      const title = stringValue(page.title) || pagePath;
      const summary = truncateForPrompt(stringValue(page.summary), 120);
      compactLines.push(`- ${pagePath}: ${title}`);
      if (summary) {
        compactLines.push(`  ${summary}`);
      }
    }
  }
  if (missing.length) {
    compactLines.push('', `Missing: ${missing.slice(0, 4).join(', ')}`);
  }
  compactLines.push('', 'Rule: wiki lists supporting project knowledge; current live traces decide what is true now.');
  return compactLines.join('\n').replace(/\n{3,}/g, '\n\n').trim();
}

export function formatWikiQueryReply(payload: unknown): string {
  const root = objectValue(payload);
  const hits = arrayValue(root.hits).map(objectValue).slice(0, 5);
  const warnings = arrayValue(root.warnings).map((item) => stringValue(item)).filter(Boolean).slice(0, 4);
  const lines = [
    'Spark LLM wiki query',
    '',
    `Query: ${stringValue(root.query) || 'unknown'}`,
    `Retrieval: ${stringValue(root.wiki_retrieval_status) || 'unknown'} (${numericValue(root.hit_count)} hits)`,
    `Knowledge priority: ${root.project_knowledge_first ? 'project/system first' : 'not confirmed'}`,
  ];
  if (root.refreshed) {
    lines.push(`Refresh: regenerated ${numericValue(root.refreshed_file_count)} system pages`);
  }
  if (hits.length) {
    lines.push('', 'Relevant packets');
    for (const hit of hits) {
      const title = stringValue(hit.title) || stringValue(hit.source_path) || 'wiki packet';
      const sourcePath = stringValue(hit.source_path);
      const text = truncateForPrompt(stringValue(hit.text), 360);
      lines.push(`- ${title}`);
      if (sourcePath) {
        lines.push(`  source: ${sourcePath}`);
      }
      if (text) {
        lines.push(`  ${text}`);
      }
    }
  } else {
    lines.push('', 'No matching wiki packets found for that phrasing.');
  }
  if (warnings.length) {
    lines.push('', 'Warnings');
    lines.push(...warnings.map((item) => `- ${item}`));
  }
  lines.push('', 'Rule: these are supporting packets, not live truth; live status and traces still win.');
  return lines.join('\n').replace(/\n{3,}/g, '\n\n').trim();
}

export function formatWikiAnswerReply(payload: unknown): string {
  const root = objectValue(payload);
  const sources = arrayValue(root.sources).map(objectValue).slice(0, 4);
  const missing = arrayValue(root.missing_live_verification).map((item) => stringValue(item)).filter(Boolean).slice(0, 4);
  const warnings = arrayValue(root.warnings).map((item) => stringValue(item)).filter(Boolean).slice(0, 4);
  const liveSelf = objectValue(root.live_self_awareness);
  const observed = arrayValue(liveSelf.observed_now).map(objectValue).map((item) => stringValue(item.claim)).filter(Boolean).slice(0, 2);
  const lacks = arrayValue(liveSelf.lacks).map(objectValue).map((item) => stringValue(item.claim)).filter(Boolean).slice(0, 2);
  const improvements = arrayValue(liveSelf.improvement_options).map(objectValue).map((item) => stringValue(item.claim)).filter(Boolean).slice(0, 2);
  const lines = [
    'Spark LLM wiki answer',
    '',
    stringValue(root.answer) || 'I could not build a wiki-backed answer for that question.',
    '',
    `Evidence: ${stringValue(root.evidence_level) || 'unknown'} (${numericValue(root.hit_count)} wiki hits)`,
    `Knowledge priority: ${root.project_knowledge_first ? 'project/system first' : 'not confirmed'}`,
  ];
  if (stringValue(root.live_context_status) === 'included') {
    lines.push('', 'Live self snapshot');
    if (observed.length) {
      lines.push('What looks live');
      lines.push(...observed.map((item) => `- ${compactSelfAwarenessClaim(item)}`));
    }
    if (lacks.length) {
      lines.push('Where I still lack');
      lines.push(...lacks.map((item) => `- ${compactSelfAwarenessClaim(item)}`));
    }
    if (improvements.length) {
      lines.push('Best next improvements');
      lines.push(...improvements.map((item) => `- ${compactSelfAwarenessClaim(item)}`));
    }
  }
  if (sources.length) {
    lines.push('', 'Sources');
    for (const source of sources) {
      const title = stringValue(source.title) || 'wiki source';
      const sourcePath = stringValue(source.source_path);
      lines.push(sourcePath ? `- ${title}: ${sourcePath}` : `- ${title}`);
    }
  }
  if (missing.length) {
    lines.push('', 'Still needs live verification');
    lines.push(...missing.map((item) => `- ${item}`));
  }
  if (warnings.length) {
    lines.push('', 'Warnings');
    lines.push(...warnings.map((item) => `- ${item}`));
  }
  const reply = lines.join('\n').replace(/\n{3,}/g, '\n\n').trim();
  if (reply.length <= 1800) {
    return reply;
  }

  const compactLines = [
    'Spark LLM wiki answer',
    '',
    truncateForPrompt(stringValue(root.answer) || 'I could not build a wiki-backed answer for that question.', 520),
    '',
    `Evidence: ${stringValue(root.evidence_level) || 'unknown'} (${numericValue(root.hit_count)} wiki hits)`,
    `Knowledge priority: ${root.project_knowledge_first ? 'project/system first' : 'not confirmed'}`,
  ];
  if (stringValue(root.live_context_status) === 'included') {
    compactLines.push('', 'Live self snapshot');
    if (observed[0]) compactLines.push(`- Live: ${compactSelfAwarenessClaim(observed[0])}`);
    if (lacks[0]) compactLines.push(`- Missing: ${compactSelfAwarenessClaim(lacks[0])}`);
    if (improvements[0]) compactLines.push(`- Next: ${compactSelfAwarenessClaim(improvements[0])}`);
  }
  if (sources.length) {
    compactLines.push('', 'Sources');
    for (const source of sources.slice(0, 2)) {
      const title = stringValue(source.title) || 'wiki source';
      const sourcePath = stringValue(source.source_path);
      compactLines.push(sourcePath ? `- ${title}: ${sourcePath}` : `- ${title}`);
    }
  }
  if (missing.length) {
    compactLines.push('', 'Still needs live verification');
    compactLines.push(...missing.slice(0, 2).map((item) => `- ${truncateForPrompt(item, 160)}`));
  }
  if (warnings.length) {
    compactLines.push('', 'Warnings');
    compactLines.push(...warnings.slice(0, 2).map((item) => `- ${truncateForPrompt(item, 160)}`));
  }
  compactLines.push('', 'Rule: wiki supports the answer; current-state evidence wins for mutable facts.');
  return compactLines.join('\n').replace(/\n{3,}/g, '\n\n').trim();
}

export function formatWikiPromotionReply(payload: unknown): string {
  const root = objectValue(payload);
  const evidenceRefs = arrayValue(root.evidence_refs).map((item) => stringValue(item)).filter(Boolean).slice(0, 4);
  const sourceRefs = arrayValue(root.source_refs).map((item) => stringValue(item)).filter(Boolean).slice(0, 4);
  const warnings = arrayValue(root.warnings).map((item) => stringValue(item)).filter(Boolean).slice(0, 4);
  const lines = [
    'Spark LLM wiki improvement note',
    '',
    `Stored: ${stringValue(root.title) || 'untitled improvement'}`,
    `Status: ${stringValue(root.promotion_status) || 'candidate'}`,
    `Path: ${stringValue(root.relative_path) || stringValue(root.path) || 'unknown'}`,
    `Authority: ${stringValue(root.authority) || 'supporting_not_authoritative'}`,
  ];
  const summary = stringValue(root.summary);
  if (summary) {
    lines.push('', summary);
  }
  if (evidenceRefs.length) {
    lines.push('', 'Evidence refs');
    lines.push(...evidenceRefs.map((item) => `- ${item}`));
  }
  if (sourceRefs.length) {
    lines.push('', 'Source refs');
    lines.push(...sourceRefs.map((item) => `- ${item}`));
  }
  const nextProbe = stringValue(root.next_probe);
  if (nextProbe) {
    lines.push('', `Next probe: ${nextProbe}`);
  }
  if (warnings.length) {
    lines.push('', 'Warnings');
    lines.push(...warnings.map((item) => `- ${item}`));
  }
  lines.push('', 'Rule: this is retrievable project knowledge, not live runtime truth.');
  return lines.join('\n').replace(/\n{3,}/g, '\n\n').trim();
}

export async function getBuilderBridgeStatus(): Promise<BuilderBridgeStatus> {
  const config = resolveBridgeConfig();
  return {
    mode: config.mode,
    available: await ensureBridgeAvailable(config),
    builderRepo: config.builderRepo,
    builderHome: config.builderHome,
  };
}

export async function runBuilderDiagnosticsScan(): Promise<BuilderDiagnosticsScanResult> {
  const config = await resolveDiagnosticsBridgeConfig(resolveBridgeConfig());
  const bridgeAvailable = await ensureBridgeAvailable(config);
  if (!bridgeAvailable) {
    throw new Error(`Builder bridge unavailable. repo=${config.builderRepo} home=${config.builderHome}`);
  }

  const { stdout, stderr } = await execFileAsync(
    config.pythonCommand,
    pythonModuleInvocation(config, 'spark_intelligence.cli', [
      'diagnostics',
      'scan',
      '--home',
      config.builderHome,
      '--json',
    ]),
    withHiddenWindows({
      cwd: config.builderRepo,
      env: pythonSourceEnv(config),
      timeout: config.timeoutMs,
      maxBuffer: 1024 * 1024,
    })
  );
  const trimmedStdout = stdout.trim();
  if (!trimmedStdout) {
    throw new Error(`Diagnostics scan returned empty stdout. stderr=${stderr.trim()}`);
  }
  const parsed = JSON.parse(trimmedStdout) as BuilderDiagnosticsScanJson;
  return {
    replyText: formatDiagnosticsScanReply(parsed),
    markdownPath: String(parsed.markdown_path || '').trim(),
  };
}

export async function runBuilderSelfAwarenessStatus(
  input: BuilderSelfAwarenessInput
): Promise<BuilderSelfAwarenessResult> {
  const config = resolveBridgeConfig();
  const bridgeAvailable = await ensureBridgeAvailable(config);
  if (!bridgeAvailable) {
    throw new Error(`Builder bridge unavailable. repo=${config.builderRepo} home=${config.builderHome}`);
  }

  const userId = assertTelegramIntegerId(input.userId, 'userId');
  const chatId = assertTelegramIntegerId(input.chatId, 'chatId');
  const args = [
    'self',
    'status',
    '--home',
    config.builderHome,
    '--human-id',
    `human:telegram:${userId}`,
    '--session-id',
    `session:telegram:${chatId}:${userId}`,
    '--channel-kind',
    'telegram',
    '--user-message',
    input.currentMessage || 'Show Spark self-awareness status and improvement options.',
  ];
  if (input.refreshWiki !== false) {
    args.push('--refresh-wiki');
  }
  args.push('--json');

  const { stdout, stderr } = await execFileAsync(
    config.pythonCommand,
    pythonModuleInvocation(config, 'spark_intelligence.cli', args),
    withHiddenWindows({
      cwd: config.builderRepo,
      env: pythonSourceEnv(config),
      timeout: selfAwarenessBridgeTimeoutMs(process.env, config.timeoutMs),
      maxBuffer: 1024 * 1024,
    })
  );
  const trimmedStdout = stdout.trim();
  if (!trimmedStdout) {
    throw new Error(`Builder self-awareness returned empty stdout. stderr=${redactText(stderr.trim())}`);
  }
  const payload = JSON.parse(trimmedStdout) as Record<string, unknown>;
  if (input.currentMessage) {
    payload.current_message = input.currentMessage;
  }
  return {
    payload,
    replyText: formatSelfAwarenessReply(payload),
  };
}

export async function runBuilderSelfImprovementPlan(
  input: BuilderSelfAwarenessInput & { goal?: string }
): Promise<BuilderSelfImprovementPlanResult> {
  const config = resolveBridgeConfig();
  const bridgeAvailable = await ensureBridgeAvailable(config);
  if (!bridgeAvailable) {
    throw new Error(`Builder bridge unavailable. repo=${config.builderRepo} home=${config.builderHome}`);
  }

  const goal = input.goal || input.currentMessage || 'Improve Spark weak spots with probe-first evidence.';
  const userId = assertTelegramIntegerId(input.userId, 'userId');
  const chatId = assertTelegramIntegerId(input.chatId, 'chatId');
  const { stdout, stderr } = await execFileAsync(
    config.pythonCommand,
    pythonModuleInvocation(config, 'spark_intelligence.cli', [
      'self',
      'improve',
      goal,
      '--home',
      config.builderHome,
      '--human-id',
      `human:telegram:${userId}`,
      '--session-id',
      `session:telegram:${chatId}:${userId}`,
      '--channel-kind',
      'telegram',
      '--user-message',
      input.currentMessage || goal,
      '--refresh-wiki',
      '--json',
    ]),
    withHiddenWindows({
      cwd: config.builderRepo,
      env: pythonSourceEnv(config),
      timeout: selfAwarenessBridgeTimeoutMs(process.env, config.timeoutMs),
      maxBuffer: 1024 * 1024,
    })
  );
  const trimmedStdout = stdout.trim();
  if (!trimmedStdout) {
    throw new Error(`Builder self-improvement plan returned empty stdout. stderr=${redactText(stderr.trim())}`);
  }
  const payload = JSON.parse(trimmedStdout) as Record<string, unknown>;
  return {
    payload,
    replyText: formatSelfImprovementPlanReply(payload),
  };
}

export async function runBuilderAgentOperatingContext(
  input: BuilderAgentOperatingContextInput
): Promise<BuilderAgentOperatingContextResult> {
  const config = resolveBridgeConfig();
  const bridgeAvailable = await ensureBridgeAvailable(config);
  if (!bridgeAvailable) {
    throw new Error(`Builder bridge unavailable. repo=${config.builderRepo} home=${config.builderHome}`);
  }

  const userId = assertTelegramIntegerId(input.userId, 'userId');
  const chatId = assertTelegramIntegerId(input.chatId, 'chatId');
  const args = [
    'self',
    'panel',
    '--home',
    config.builderHome,
    '--human-id',
    `human:telegram:${userId}`,
    '--session-id',
    `session:telegram:${chatId}:${userId}`,
    '--channel-kind',
    'telegram',
    '--user-message',
    input.currentMessage || 'Show the agent operating context.',
    '--runner-writable',
    input.runnerWritable || 'unknown',
  ];
  const accessLevel = String(input.sparkAccessLevel || '').trim();
  if (accessLevel) {
    args.push('--spark-access-level', accessLevel);
  }
  const runnerLabel = String(input.runnerLabel || '').trim();
  if (runnerLabel) {
    args.push('--runner-label', runnerLabel);
  }
  if (input.liveState && Object.keys(input.liveState).length > 0) {
    args.push('--live-state-json', JSON.stringify(input.liveState));
  }

  const { stdout, stderr } = await execFileAsync(
    config.pythonCommand,
    pythonModuleInvocation(config, 'spark_intelligence.cli', args),
    withHiddenWindows({
      cwd: config.builderRepo,
      env: pythonSourceEnv(config),
      timeout: selfAwarenessBridgeTimeoutMs(process.env, config.timeoutMs),
      maxBuffer: 1024 * 1024,
    })
  );
  const trimmedStdout = stdout.trim();
  if (!trimmedStdout) {
    throw new Error(`Builder agent operating panel returned empty stdout. stderr=${redactText(stderr.trim())}`);
  }
  return { replyText: trimmedStdout };
}

export async function runBuilderSourceUsed(input: BuilderSourceUsedInput): Promise<BuilderSourceUsedResult> {
  const config = resolveBridgeConfig();
  const bridgeAvailable = await ensureBridgeAvailable(config);
  if (!bridgeAvailable) {
    throw new Error(`Builder bridge unavailable. repo=${config.builderRepo} home=${config.builderHome}`);
  }

  const args = [
    'self',
    'source-used',
    input.source,
    '--home',
    config.builderHome,
    '--role',
    input.role || 'supporting_evidence',
    '--freshness',
    input.freshness || 'unknown',
    '--user-intent',
    sourceLedgerLabel(input.userIntent || input.selectedRoute, 'telegram_source_used_evidence'),
    '--selected-route',
    input.selectedRoute || '',
    '--confidence',
    input.confidence || '',
    '--session-id',
    'session:telegram:redacted',
    '--human-id',
    'human:telegram:redacted',
    '--actor-id',
    input.actorId || 'spark-telegram-bot',
    '--json',
  ];
  if (input.sourceRef) {
    args.push('--source-ref', input.sourceRef);
  }
  if (input.summary) {
    args.push('--summary', input.summary);
  }
  if (input.requestId) {
    args.push('--request-id', input.requestId);
  }
  if (input.traceRef) {
    args.push('--trace-ref', input.traceRef);
  }

  const { stdout, stderr } = await execFileAsync(
    config.pythonCommand,
    pythonModuleInvocation(config, 'spark_intelligence.cli', args),
    withHiddenWindows({
      cwd: config.builderRepo,
      env: pythonSourceEnv(config),
      timeout: selfAwarenessBridgeTimeoutMs(process.env, config.timeoutMs),
      maxBuffer: 1024 * 1024,
    })
  );
  const trimmedStdout = stdout.trim();
  if (!trimmedStdout) {
    throw new Error(`Builder source-used recorder returned empty stdout. stderr=${redactText(stderr.trim())}`);
  }
  const payload = JSON.parse(trimmedStdout) as Record<string, unknown>;
  return {
    eventId: String(payload.event_id || ''),
    payload,
  };
}

export function formatAgentBlackBoxReply(payload: unknown): string {
  const root = objectValue(payload);
  const counts = objectValue(root.counts);
  const entries = arrayValue(root.entries).map(objectValue);
  const entryCount = numericValue(counts.entries);
  const blockerEvents = numericValue(counts.blocker_events);
  const memoryCandidates = numericValue(counts.memory_candidates);

  if (!entries.length && entryCount === 0) {
    return [
      'Agent black box has no matching events.',
      '',
      'Review',
      '• No event evidence is visible for this filter.',
      '',
      'Workspace',
      '• Full evidence: `spark-intelligence self black-box --json`'
    ].join('\n');
  }

  const headline = blockerEvents > 0 ? 'Agent black box needs review.' : 'Agent black box is visible.';
  const lines = [
    headline,
    '',
    'State',
    `• ${entryCount || entries.length} events; ${blockerEvents} blocker events; ${memoryCandidates} memory candidates`
  ];
  if (stringValue(root.request_id)) {
    lines.push('• Request filter active');
  }

  if (entries.length) {
    lines.push('', 'Recent');
    for (const entry of entries.slice(0, 4)) {
      const eventType = stringValue(entry.event_type) || 'unknown_event';
      const route = stringValue(entry.route_chosen) || 'unknown_route';
      const blockers = arrayValue(entry.blockers).length;
      lines.push(`• ${eventType}: route ${route}${blockers ? ` (${blockers} blockers)` : ''}`);
    }
  }

  lines.push(
    '',
    'Review',
    '• Event evidence is not permission or memory truth.',
    '• Full details stay in Builder until a trace view is requested.',
    '',
    'Workspace',
    '• Full evidence: `spark-intelligence self black-box --json`'
  );
  return lines.join('\n');
}

export async function runBuilderAgentBlackBox(
  input: BuilderAgentBlackBoxInput
): Promise<BuilderAgentBlackBoxResult> {
  const config = resolveBridgeConfig();
  const bridgeAvailable = await ensureBridgeAvailable(config);
  if (!bridgeAvailable) {
    throw new Error(`Builder bridge unavailable. repo=${config.builderRepo} home=${config.builderHome}`);
  }

  const args = [
    'self',
    'black-box',
    '--home',
    config.builderHome,
    '--limit',
    String(Math.max(1, Math.min(20, Number(input.limit || 12)))),
    '--json',
  ];
  const requestId = String(input.requestId || '').trim();
  if (requestId) {
    args.push('--request-id', requestId);
  }

  const { stdout, stderr } = await execFileAsync(
    config.pythonCommand,
    pythonModuleInvocation(config, 'spark_intelligence.cli', args),
    withHiddenWindows({
      cwd: config.builderRepo,
      env: pythonSourceEnv(config),
      timeout: selfAwarenessBridgeTimeoutMs(process.env, config.timeoutMs),
      maxBuffer: 1024 * 1024,
    })
  );
  const trimmedStdout = stdout.trim();
  if (!trimmedStdout) {
    throw new Error(`Builder agent black box returned empty stdout. stderr=${redactText(stderr.trim())}`);
  }
  const payload = JSON.parse(trimmedStdout) as Record<string, unknown>;
  return {
    payload,
    replyText: formatAgentBlackBoxReply(payload),
  };
}

export function formatRouteProbeReply(payload: Record<string, unknown>): string {
  const route = String(payload.capability_key || 'unknown').trim() || 'unknown';
  const status = String(payload.status || 'unknown').trim() || 'unknown';
  const eventId = String(payload.event_id || '').trim();
  const eventType = String(payload.event_type || '').trim();
  const latency = typeof payload.route_latency_ms === 'number' ? payload.route_latency_ms : null;
  const failure = String(payload.failure_reason || '').trim();
  const summary = String(payload.probe_summary || '').trim();
  const lines = [
    'Route probe',
    `- Route: ${route}`,
    `- Status: ${status}`,
  ];
  if (latency !== null) {
    lines.push(`- Latency: ${latency}ms`);
  }
  if (failure) {
    lines.push(`- Failure: ${failure}`);
  }
  if (summary) {
    lines.push(`- Evidence: ${summary}`);
  }
  if (eventId) {
    lines.push(`- Event: ${eventId}${eventType ? ` (${eventType.replace(/_/g, ' ')})` : ''}`);
  }
  lines.push('', 'Run /aoc to see how this changed Agent Operating Context.');
  return lines.join('\n');
}

export function formatRouteConfidenceGateReply(payload: unknown): string {
  const root = objectValue(payload);
  const decision = stringValue(root.decision) || 'explain';
  const confidence = stringValue(root.confidence) || 'unknown';
  const policy = stringValue(root.safe_reply_policy) || 'explain_missing';
  const provider = stringValue(root.provider);
  const model = stringValue(root.model);
  const freshness = stringValue(root.freshness) || 'unknown';
  const joinedSources = arrayValue(root.joined_sources).map(stringValue).filter(Boolean);
  const missing = arrayValue(root.missing_evidence).map(stringValue).filter(Boolean);
  const nextAction = stringValue(root.human_next_action) || 'Run /board or /diagnose, then ask again.';
  const verification = stringValue(root.verification_command) || 'spark os trace --json';

  if (policy === 'answer_live' && provider) {
    return [
      model
        ? `Latest Spawner job used ${provider} / ${model}.`
        : `Latest Spawner job used ${provider}.`,
      '',
      'Evidence',
      `- Confidence: ${confidence}`,
      `- Freshness: ${freshness}`,
      `- Sources: ${joinedSources.length ? joinedSources.slice(0, 4).join(', ') : 'compiled Spark OS trace'}`,
      '',
      'Inspect',
      `- ${verification}`
    ].join('\n');
  }

  if (decision === 'refuse' || policy === 'refuse_privacy_violation') {
    return [
      'I cannot show that route evidence safely.',
      '',
      'Reason',
      '- The route gate detected private or unsafe evidence in the answer boundary.',
      '',
      'Next',
      `- ${nextAction}`
    ].join('\n');
  }

  return [
    'I cannot prove the latest Spawner provider yet.',
    '',
    'State',
    `- Confidence: ${confidence}`,
    `- Freshness: ${freshness}`,
    missing.length ? `- Missing: ${missing.slice(0, 4).join(', ')}` : '- Missing: source-owned provider evidence',
    '',
    'Next',
    `- ${nextAction}`,
    '',
    'Inspect',
    `- ${verification}`
  ].join('\n');
}

export async function runBuilderRouteConfidenceGate(
  input: BuilderRouteConfidenceGateInput = {}
): Promise<BuilderRouteConfidenceGateResult> {
  const config = resolveBridgeConfig();
  const bridgeAvailable = await ensureBridgeAvailable(config);
  if (!bridgeAvailable) {
    throw new Error(`Builder bridge unavailable. repo=${config.builderRepo} home=${config.builderHome}`);
  }

  const args = [
    'self',
    'route-confidence-gate',
    '--home',
    config.builderHome,
    '--intent',
    input.intent || 'status',
    '--candidate-route',
    input.candidateRoute || 'spawner.latest_job_provider',
    '--json',
  ];
  if (input.latestSpawnerJob && Object.keys(input.latestSpawnerJob).length > 0) {
    args.push('--latest-spawner-job-json', JSON.stringify(input.latestSpawnerJob));
  }
  if (input.routeContext && Object.keys(input.routeContext).length > 0) {
    args.push('--route-context-json', JSON.stringify(sanitizeRouteConfidenceRouteContext(input.routeContext)));
  }

  const { stdout, stderr } = await execFileAsync(
    config.pythonCommand,
    pythonModuleInvocation(config, 'spark_intelligence.cli', args),
    withHiddenWindows({
      cwd: config.builderRepo,
      env: pythonSourceEnv(config),
      timeout: selfAwarenessBridgeTimeoutMs(process.env, config.timeoutMs),
      maxBuffer: 1024 * 1024,
    })
  );
  const trimmedStdout = stdout.trim();
  if (!trimmedStdout) {
    throw new Error(`Builder route confidence gate returned empty stdout. stderr=${redactText(stderr.trim())}`);
  }
  const payload = JSON.parse(trimmedStdout) as Record<string, unknown>;
  return {
    payload,
    replyText: formatRouteConfidenceGateReply(payload),
  };
}

export async function runBuilderRouteProbe(capabilityKey: string): Promise<BuilderRouteProbeResult> {
  const config = resolveBridgeConfig();
  const bridgeAvailable = await ensureBridgeAvailable(config);
  if (!bridgeAvailable) {
    throw new Error(`Builder bridge unavailable. repo=${config.builderRepo} home=${config.builderHome}`);
  }

  const routeKey = String(capabilityKey || '').trim();
  if (!routeKey) {
    throw new Error('Route key is required.');
  }
  const args = [
    'self',
    'route-probe',
    routeKey,
    '--home',
    config.builderHome,
    '--run',
    '--json',
  ];

  let stdout = '';
  let stderr = '';
  let commandError: unknown = null;
  try {
    const result = await execFileAsync(
      config.pythonCommand,
      pythonModuleInvocation(config, 'spark_intelligence.cli', args),
      withHiddenWindows({
        cwd: config.builderRepo,
        env: pythonSourceEnv(config),
        timeout: selfAwarenessBridgeTimeoutMs(process.env, config.timeoutMs),
        maxBuffer: 1024 * 1024,
      })
    );
    stdout = processOutputText(result.stdout);
    stderr = processOutputText(result.stderr);
  } catch (error) {
    const execError = error as { stdout?: unknown; stderr?: unknown };
    stdout = processOutputText(execError.stdout);
    stderr = processOutputText(execError.stderr);
    commandError = error;
  }
  const trimmedStdout = stdout.trim();
  if (!trimmedStdout) {
    if (commandError) {
      throw commandError;
    }
    throw new Error(`Builder route probe returned empty stdout. stderr=${redactText(stderr.trim())}`);
  }
  const payload = JSON.parse(trimmedStdout) as Record<string, unknown>;
  return {
    payload,
    replyText: formatRouteProbeReply(payload),
  };
}

export async function readLatestCapabilityProbeReceipt(
  capabilityKey: string
): Promise<BuilderCapabilityProbeReceipt | null> {
  const config = resolveBridgeConfig();
  const bridgeAvailable = await ensureBridgeAvailable(config);
  if (!bridgeAvailable) {
    return null;
  }

  const routeKey = String(capabilityKey || '').trim();
  if (!routeKey) {
    return null;
  }

  const args = [
    'self',
    'black-box',
    '--home',
    config.builderHome,
    '--limit',
    String(CAPABILITY_PROBE_RECEIPT_BLACK_BOX_LIMIT),
    '--json',
  ];
  const { stdout } = await execFileAsync(
    config.pythonCommand,
    pythonModuleInvocation(config, 'spark_intelligence.cli', args),
    withHiddenWindows({
      cwd: config.builderRepo,
      env: pythonSourceEnv(config),
      timeout: selfAwarenessBridgeTimeoutMs(process.env, config.timeoutMs),
      maxBuffer: 1024 * 1024,
    })
  );
  const payload = JSON.parse(stdout.trim() || '{}') as Record<string, unknown>;
  return extractLatestCapabilityProbeReceiptFromBlackBoxPayload(payload, routeKey);
}

export function extractLatestCapabilityProbeReceiptFromBlackBoxPayload(
  payload: Record<string, unknown>,
  capabilityKey: string
): BuilderCapabilityProbeReceipt | null {
  const routeKey = String(capabilityKey || '').trim();
  if (!routeKey) {
    return null;
  }

  const entries = Array.isArray(payload.entries) ? payload.entries : [];
  for (const item of entries) {
    if (!item || typeof item !== 'object') continue;
    const entry = item as Record<string, unknown>;
    if (String(entry.event_type || '') !== 'capability_probed') continue;
    if (String(entry.route_chosen || '') !== routeKey) continue;
    const blockers = Array.isArray(entry.blockers) ? entry.blockers.map((value) => String(value || '').trim()).filter(Boolean) : [];
    const sources = Array.isArray(entry.sources_used) ? entry.sources_used : [];
    const sourceSummary = sources
      .map((source) => source && typeof source === 'object' ? String((source as Record<string, unknown>).summary || '').trim() : '')
      .find(Boolean) || '';
    const changed = Array.isArray(entry.changed) ? entry.changed.map((value) => String(value || '')) : [];
    const changedStatus = changed
      .map((value) => value.match(/last_probe=([a-z_]+)/i)?.[1] || '')
      .find(Boolean) || '';
    return {
      capabilityKey: routeKey,
      status: blockers.length ? 'failure' : changedStatus || 'unknown',
      failureReason: blockers[0] || '',
      probeSummary: sourceSummary,
      routeLatencyMs: null,
      eventId: String(entry.event_id || '').trim(),
      createdAt: String(entry.created_at || '').trim(),
    };
  }
  return null;
}

function sanitizedPreflightLabel(value: unknown, fallback: string): string {
  const text = String(value || '').trim().toLowerCase().replace(/[^a-z0-9:_-]+/g, '_').replace(/^_+|_+$/g, '');
  return text || fallback;
}

export function buildBuilderAocPreflightCommands(
  input: BuilderAocPreflightInput,
  builderHome: string
): string[][] {
  const selectedRoute = sanitizedPreflightLabel(input.selectedRoute, 'spawner_prd_bridge');
  const userIntent = sanitizedPreflightLabel(input.userIntent, 'telegram_run_request');
  const requestId = String(input.requestId || '').trim();
  const traceRef = String(input.traceRef || '').trim();
  const confidence = sanitizedPreflightLabel(input.confidence || 'high', 'high');
  const reason = String(input.reason || 'Telegram access preflight passed; dispatching to Spawner with shared trace.').trim();
  const common = [
    '--home',
    builderHome,
    '--request-id',
    requestId,
    '--trace-ref',
    traceRef,
    '--session-id',
    'session:telegram:redacted',
    '--human-id',
    'human:telegram:redacted',
    '--actor-id',
    'telegram_aoc_preflight',
    '--json',
  ];
  return [
    [
      'self',
      'route-selection',
      selectedRoute,
      '--user-intent',
      userIntent,
      '--confidence',
      confidence,
      '--reason',
      reason,
      ...common,
    ],
    [
      'self',
      'source-used',
      'telegram_authority_preflight',
      '--role',
      'dispatch_gate',
      '--freshness',
      'live_probed',
      '--source-ref',
      `telegram:/run:${requestId}`,
      '--summary',
      'Telegram access gate passed before Spawner dispatch; chat and user ids are redacted.',
      '--user-intent',
      userIntent,
      '--selected-route',
      selectedRoute,
      '--confidence',
      confidence,
      ...common,
    ],
    [
      'self',
      'source-used',
      'memory_preflight',
      '--role',
      'memory_boundary',
      '--freshness',
      'live_probed',
      '--source-ref',
      `builder:aoc-preflight:${requestId}`,
      '--summary',
      'Memory preflight recorded as metadata only; memory bodies stay inside Builder.',
      '--user-intent',
      userIntent,
      '--selected-route',
      selectedRoute,
      '--confidence',
      confidence,
      ...common,
    ],
  ];
}

export async function runBuilderAocPreflight(input: BuilderAocPreflightInput): Promise<BuilderAocPreflightResult> {
  const config = resolveBridgeConfig();
  const bridgeAvailable = await ensureBridgeAvailable(config);
  if (!bridgeAvailable) {
    throw new Error(`Builder bridge unavailable. repo=${config.builderRepo} home=${config.builderHome}`);
  }

  const payloads: Record<string, unknown>[] = [];
  for (const args of buildBuilderAocPreflightCommands(input, config.builderHome)) {
    const { stdout, stderr } = await execFileAsync(
      config.pythonCommand,
      pythonModuleInvocation(config, 'spark_intelligence.cli', args),
      withHiddenWindows({
        cwd: config.builderRepo,
        env: pythonSourceEnv(config),
        timeout: selfAwarenessBridgeTimeoutMs(process.env, config.timeoutMs),
        maxBuffer: 1024 * 1024,
      })
    );
    const trimmedStdout = stdout.trim();
    if (!trimmedStdout) {
      throw new Error(`Builder AOC preflight returned empty stdout. stderr=${redactText(stderr.trim())}`);
    }
    payloads.push(JSON.parse(trimmedStdout) as Record<string, unknown>);
  }
  return { recorded: payloads.length > 0, payloads };
}

export async function runBuilderWikiStatus(input: { refresh?: boolean } = {}): Promise<BuilderWikiStatusResult> {
  const config = resolveBridgeConfig();
  const bridgeAvailable = await ensureBridgeAvailable(config);
  if (!bridgeAvailable) {
    throw new Error(`Builder bridge unavailable. repo=${config.builderRepo} home=${config.builderHome}`);
  }

  const args = [
    'wiki',
    'status',
    '--home',
    config.builderHome,
    '--json',
  ];
  if (input.refresh !== false) {
    args.push('--refresh');
  }

  let stdout = '';
  let stderr = '';
  try {
    const result = await execFileAsync(
      config.pythonCommand,
      pythonModuleInvocation(config, 'spark_intelligence.cli', args),
      withHiddenWindows({
        cwd: config.builderRepo,
        env: pythonSourceEnv(config),
        timeout: wikiBridgeTimeoutMs(process.env, config.timeoutMs),
        maxBuffer: 1024 * 1024,
      })
    );
    stdout = result.stdout;
    stderr = result.stderr;
  } catch (error) {
    const maybeOutput = error as { stdout?: unknown; stderr?: unknown };
    stdout = typeof maybeOutput.stdout === 'string' ? maybeOutput.stdout : '';
    stderr = typeof maybeOutput.stderr === 'string' ? maybeOutput.stderr : '';
    if (!stdout.trim()) {
      throw error;
    }
  }

  const trimmedStdout = stdout.trim();
  if (!trimmedStdout) {
    throw new Error(`Builder wiki status returned empty stdout. stderr=${redactText(stderr.trim())}`);
  }
  const payload = JSON.parse(trimmedStdout) as Record<string, unknown>;
  return {
    payload,
    replyText: formatWikiStatusReply(payload),
  };
}

export async function runBuilderWikiInventory(input: { refresh?: boolean; limit?: number } = {}): Promise<BuilderWikiInventoryResult> {
  const config = resolveBridgeConfig();
  const bridgeAvailable = await ensureBridgeAvailable(config);
  if (!bridgeAvailable) {
    throw new Error(`Builder bridge unavailable. repo=${config.builderRepo} home=${config.builderHome}`);
  }

  const args = [
    'wiki',
    'inventory',
    '--home',
    config.builderHome,
    '--limit',
    String(input.limit || 12),
    '--json',
  ];
  if (input.refresh !== false) {
    args.push('--refresh');
  }

  const { stdout, stderr } = await execFileAsync(
    config.pythonCommand,
    pythonModuleInvocation(config, 'spark_intelligence.cli', args),
    withHiddenWindows({
      cwd: config.builderRepo,
      env: pythonSourceEnv(config),
      timeout: wikiBridgeTimeoutMs(process.env, config.timeoutMs),
      maxBuffer: 1024 * 1024,
    })
  );
  const trimmedStdout = stdout.trim();
  if (!trimmedStdout) {
    throw new Error(`Builder wiki inventory returned empty stdout. stderr=${redactText(stderr.trim())}`);
  }
  const payload = JSON.parse(trimmedStdout) as Record<string, unknown>;
  return {
    payload,
    replyText: formatWikiInventoryReply(payload),
  };
}

export async function runBuilderWikiQuery(
  input: { query: string; refresh?: boolean; limit?: number }
): Promise<BuilderWikiQueryResult> {
  const config = resolveBridgeConfig();
  const bridgeAvailable = await ensureBridgeAvailable(config);
  if (!bridgeAvailable) {
    throw new Error(`Builder bridge unavailable. repo=${config.builderRepo} home=${config.builderHome}`);
  }

  const args = [
    'wiki',
    'query',
    input.query,
    '--home',
    config.builderHome,
    '--limit',
    String(input.limit || 5),
    '--json',
  ];
  if (input.refresh !== false) {
    args.push('--refresh');
  }

  let stdout = '';
  let stderr = '';
  try {
    const result = await execFileAsync(
      config.pythonCommand,
      pythonModuleInvocation(config, 'spark_intelligence.cli', args),
      withHiddenWindows({
        cwd: config.builderRepo,
        env: pythonSourceEnv(config),
        timeout: wikiBridgeTimeoutMs(process.env, config.timeoutMs),
        maxBuffer: 1024 * 1024,
      })
    );
    stdout = result.stdout;
    stderr = result.stderr;
  } catch (error) {
    const maybeOutput = error as { stdout?: unknown; stderr?: unknown };
    stdout = typeof maybeOutput.stdout === 'string' ? maybeOutput.stdout : '';
    stderr = typeof maybeOutput.stderr === 'string' ? maybeOutput.stderr : '';
    if (!stdout.trim()) {
      throw error;
    }
  }

  const trimmedStdout = stdout.trim();
  if (!trimmedStdout) {
    throw new Error(`Builder wiki query returned empty stdout. stderr=${redactText(stderr.trim())}`);
  }
  const payload = JSON.parse(trimmedStdout) as Record<string, unknown>;
  return {
    payload,
    replyText: formatWikiQueryReply(payload),
  };
}

export async function runBuilderWikiAnswer(
  input: { question: string; refresh?: boolean; limit?: number; userId?: number | string; chatId?: number | string; currentMessage?: string }
): Promise<BuilderWikiAnswerResult> {
  const config = resolveBridgeConfig();
  const bridgeAvailable = await ensureBridgeAvailable(config);
  if (!bridgeAvailable) {
    throw new Error(`Builder bridge unavailable. repo=${config.builderRepo} home=${config.builderHome}`);
  }

  const args = [
    'wiki',
    'answer',
    input.question,
    '--home',
    config.builderHome,
    '--limit',
    String(input.limit || 5),
    '--json',
  ];
  if (input.userId !== undefined && input.userId !== null) {
    const userId = assertTelegramIntegerId(input.userId, 'userId');
    args.push('--human-id', `human:telegram:${userId}`);
  }
  if (input.chatId !== undefined && input.chatId !== null && input.userId !== undefined && input.userId !== null) {
    const userId = assertTelegramIntegerId(input.userId, 'userId');
    const chatId = assertTelegramIntegerId(input.chatId, 'chatId');
    args.push('--session-id', `session:telegram:${chatId}:${userId}`);
  }
  if (input.chatId !== undefined || input.userId !== undefined) {
    args.push('--channel-kind', 'telegram');
  }
  if (input.currentMessage) {
    args.push('--user-message', input.currentMessage);
  }
  if (input.refresh !== false) {
    args.push('--refresh');
  }

  let stdout = '';
  let stderr = '';
  try {
    const result = await execFileAsync(
      config.pythonCommand,
      pythonModuleInvocation(config, 'spark_intelligence.cli', args),
      withHiddenWindows({
        cwd: config.builderRepo,
        env: pythonSourceEnv(config),
        timeout: wikiBridgeTimeoutMs(process.env, config.timeoutMs),
        maxBuffer: 1024 * 1024,
      })
    );
    stdout = result.stdout;
    stderr = result.stderr;
  } catch (error) {
    const maybeOutput = error as { stdout?: unknown; stderr?: unknown };
    stdout = typeof maybeOutput.stdout === 'string' ? maybeOutput.stdout : '';
    stderr = typeof maybeOutput.stderr === 'string' ? maybeOutput.stderr : '';
    if (!stdout.trim()) {
      throw error;
    }
  }

  const trimmedStdout = stdout.trim();
  if (!trimmedStdout) {
    throw new Error(`Builder wiki answer returned empty stdout. stderr=${redactText(stderr.trim())}`);
  }
  const payload = JSON.parse(trimmedStdout) as Record<string, unknown>;
  return {
    payload,
    replyText: formatWikiAnswerReply(payload),
  };
}

export async function runBuilderWikiPromoteImprovement(
  input: {
    title: string;
    summary?: string;
    status?: 'candidate' | 'verified';
    evidenceRefs?: string[];
    sourceRefs?: string[];
    nextProbe?: string;
    invalidationTrigger?: string;
  }
): Promise<BuilderWikiPromotionResult> {
  const config = resolveBridgeConfig();
  const bridgeAvailable = await ensureBridgeAvailable(config);
  if (!bridgeAvailable) {
    throw new Error(`Builder bridge unavailable. repo=${config.builderRepo} home=${config.builderHome}`);
  }

  const args = [
    'wiki',
    'promote-improvement',
    input.title,
    '--home',
    config.builderHome,
    '--status',
    input.status || 'candidate',
    '--json',
  ];
  const summary = stringValue(input.summary || input.title);
  if (summary) {
    args.push('--summary', summary);
  }
  for (const evidenceRef of input.evidenceRefs || []) {
    const value = stringValue(evidenceRef);
    if (value) {
      args.push('--evidence-ref', value);
    }
  }
  for (const sourceRef of input.sourceRefs || []) {
    const value = stringValue(sourceRef);
    if (value) {
      args.push('--source', value);
    }
  }
  if (input.nextProbe) {
    args.push('--next-probe', input.nextProbe);
  }
  if (input.invalidationTrigger) {
    args.push('--invalidation-trigger', input.invalidationTrigger);
  }

  const { stdout, stderr } = await execFileAsync(
    config.pythonCommand,
    pythonModuleInvocation(config, 'spark_intelligence.cli', args),
    withHiddenWindows({
      cwd: config.builderRepo,
      env: pythonSourceEnv(config),
      timeout: wikiBridgeTimeoutMs(process.env, config.timeoutMs),
      maxBuffer: 1024 * 1024,
    })
  );
  const trimmedStdout = stdout.trim();
  if (!trimmedStdout) {
    throw new Error(`Builder wiki promotion returned empty stdout. stderr=${redactText(stderr.trim())}`);
  }
  const payload = JSON.parse(trimmedStdout) as Record<string, unknown>;
  return {
    payload,
    replyText: formatWikiPromotionReply(payload),
  };
}

export async function runBuilderConversationColdContext(
  input: BuilderConversationColdContextInput
): Promise<BuilderConversationColdContextResult> {
  const config = resolveBridgeConfig();
  if (config.mode === 'off') {
    return {
      used: false,
      contextText: '',
      sourceCount: 0,
      bridgeMode: config.mode,
    };
  }

  const bridgeAvailable = await ensureBridgeAvailable(config);
  if (!bridgeAvailable) {
    return {
      used: false,
      contextText: '',
      sourceCount: 0,
      bridgeMode: config.mode,
      error: `Builder bridge unavailable. repo=${config.builderRepo} home=${config.builderHome}`,
    };
  }

  const currentMessage = compactColdMemoryQuery(input.currentMessage);
  if (!currentMessage) {
    return {
      used: false,
      contextText: '',
      sourceCount: 0,
      bridgeMode: config.mode,
    };
  }

  try {
    const userId = assertTelegramIntegerId(input.userId, 'userId');
    const { stdout, stderr } = await execFileAsync(
      config.pythonCommand,
      pythonModuleInvocation(config, 'spark_intelligence.cli', [
        'memory',
        'inspect-capsule',
        '--home',
        config.builderHome,
        '--query',
        currentMessage,
        '--subject',
        `human:telegram:${userId}`,
        '--limit',
        '6',
        '--no-record-activity',
        '--json',
      ]),
      withHiddenWindows({
        cwd: config.builderRepo,
        env: pythonSourceEnv(config),
        timeout: contextBridgeTimeoutMs(process.env, config.timeoutMs),
        maxBuffer: 1024 * 1024,
      })
    );
    const trimmedStdout = stdout.trim();
    if (!trimmedStdout) {
      throw new Error(`Builder memory context returned empty stdout. stderr=${redactText(stderr.trim())}`);
    }
    const formatted = formatConversationColdMemoryContext(JSON.parse(trimmedStdout));
    return {
      used: formatted.sourceCount > 0,
      contextText: formatted.contextText,
      sourceCount: formatted.sourceCount,
      sources: formatted.sources,
      bridgeMode: config.mode,
    };
  } catch (error) {
    console.warn('[BuilderBridge] Cold memory context unavailable:', error);
    return {
      used: false,
      contextText: '',
      sourceCount: 0,
      bridgeMode: config.mode,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

export async function runBuilderTelegramBridge(updatePayload: Record<string, unknown>): Promise<BuilderBridgeReply> {
  const config = resolveBridgeConfig();
  if (config.mode === 'off') {
    return {
      used: false,
      responseText: '',
      decision: '',
      bridgeMode: '',
      routingDecision: '',
    };
  }

  const bridgeAvailable = await ensureBridgeAvailable(config);
  if (!bridgeAvailable) {
    if (config.mode === 'required') {
      console.error(
        `[BuilderBridge] Required bridge unavailable. repo=${config.builderRepo} home=${config.builderHome}`
      );
    }
    return {
      used: false,
      responseText: '',
      decision: '',
      bridgeMode: '',
      routingDecision: '',
    };
  }

  const tempDir = await mkdtemp(path.join(os.tmpdir(), 'spark-builder-telegram-'));
  const updatePath = path.join(tempDir, 'update.json');
  try {
    await writeFile(updatePath, JSON.stringify(updatePayload, null, 2), 'utf-8');

    const { stdout, stderr } = await execFileAsync(
      config.pythonCommand,
      pythonModuleInvocation(config, 'spark_intelligence.cli', [
        'gateway',
        'simulate-telegram-update',
        updatePath,
        '--home',
        config.builderHome,
        '--origin',
        'telegram-runtime',
        '--json',
      ]),
      withHiddenWindows({
        cwd: config.builderRepo,
        env: pythonSourceEnv(config),
        timeout: config.timeoutMs,
        maxBuffer: 1024 * 1024,
      })
    );

    const trimmedStdout = stdout.trim();
    if (!trimmedStdout) {
      throw new Error(`Builder bridge returned empty stdout. stderr=${redactText(stderr.trim())}`);
    }

    const parsed = JSON.parse(trimmedStdout) as {
      decision?: unknown;
      detail?: {
        response_text?: unknown;
        bridge_mode?: unknown;
        routing_decision?: unknown;
        request_id?: unknown;
        trace_ref?: unknown;
        voice_media?: unknown;
        voice_timing?: unknown;
      };
    };

    const detail = parsed.detail || {};
    const bridgeMode = String(detail.bridge_mode || '').trim();
    const routingDecision = String(detail.routing_decision || '').trim();
    const requestId = String(detail.request_id || '').trim();
    const traceRef = String(detail.trace_ref || '').trim();
    let responseText = String(detail.response_text || '').trim();
    const messageContext = telegramBridgeMessageContext(updatePayload);
    if (bridgeMode === 'self_awareness_direct' && messageContext.userId && messageContext.chatId) {
      try {
        const selfAwareness = await runBuilderSelfAwarenessStatus({
          userId: messageContext.userId,
          chatId: messageContext.chatId,
          currentMessage: messageContext.text,
        });
        responseText = selfAwareness.replyText;
      } catch (error) {
        console.warn('[BuilderBridge] Self-awareness reformat unavailable:', error);
        if (isMemoryLackSelfAwarenessQuestion(messageContext.text) || isSelfAwarenessImprovementQuestion(messageContext.text)) {
          try {
            const selfAwareness = await runBuilderSelfAwarenessStatus({
              userId: messageContext.userId,
              chatId: messageContext.chatId,
              currentMessage: messageContext.text,
              refreshWiki: false,
            });
            responseText = selfAwareness.replyText;
          } catch (fallbackError) {
            console.warn('[BuilderBridge] Self-awareness no-wiki fallback unavailable:', fallbackError);
            responseText = formatSelfAwarenessReply({ current_message: messageContext.text });
          }
        }
      }
    }
    return {
      used: true,
      responseText,
      decision: String(parsed.decision || '').trim(),
      bridgeMode,
      routingDecision,
      requestId: requestId || undefined,
      traceRef: traceRef || undefined,
      voiceMedia: parseBuilderBridgeVoiceMedia(detail.voice_media),
      voiceTiming: objectValue(detail.voice_timing),
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    if (config.mode === 'required') {
      console.error('[BuilderBridge] Required bridge failed, degrading gracefully:', errorMessage);
    } else {
      console.warn('[BuilderBridge] Falling back to local conversation path:', errorMessage);
    }
    return {
      used: false,
      responseText: '',
      decision: '',
      bridgeMode: 'bridge_error',
      routingDecision: '',
    };
  } finally {
    await rm(tempDir, { recursive: true, force: true }).catch(() => {});
  }
}

function parseBuilderBridgeVoiceMedia(value: unknown): BuilderBridgeVoiceMedia | undefined {
  if (!value || typeof value !== 'object') {
    return undefined;
  }
  const media = value as Record<string, unknown>;
  const audioBase64 = String(media.audio_base64 || '').trim();
  if (!audioBase64) {
    return undefined;
  }
  return {
    audioBase64,
    mimeType: String(media.mime_type || 'audio/mpeg').trim() || 'audio/mpeg',
    filename: String(media.filename || 'telegram-reply.audio').trim() || 'telegram-reply.audio',
    voiceCompatible: Boolean(media.voice_compatible),
    providerId: String(media.provider_id || '').trim() || undefined,
    voiceId: String(media.voice_id || '').trim() || undefined,
    spokenText: String(media.spoken_text || '').trim() || undefined,
    synthesisMs: Number.isFinite(Number(media.synthesis_ms)) ? Number(media.synthesis_ms) : undefined,
  };
}
