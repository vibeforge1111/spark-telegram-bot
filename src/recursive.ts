import axios from 'axios';
import { execFile } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { mkdtemp, readdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { homedir, tmpdir } from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import type { LoopResult } from './chipLoop';
import { effectiveLevel5RuntimeEnv } from './level5RuntimeEnv';
import type { PathLoopResult, SpecializationLoopInsights, SpecializationLoopPackageResult, SpecializationLoopStatus } from './pathLoop';
import { redactText } from './redaction';

export type RecursiveDecision = 'approve_local' | 'defer' | 'reject' | 'request_more_eval';

export function recursiveTargetRepairGuidance(error: unknown): string | null {
  const detail = error instanceof Error ? error.message : String(error || '');
  if (!/(?:path|chip|target).*(?:missing|not found|does not exist|unknown)|(?:missing|not found).*(?:path|chip|target)/i.test(detail)) {
    return null;
  }
  return "I couldn’t find that recursive target. Check the available paths with `/recursive paths`; if you meant a new chip, create it with `/chip create` first.";
}

export function recursiveWorkspaceRepairGuidance(error: unknown): string | null {
  const detail = error instanceof Error ? error.message : String(error || '');
  if (!/workspace is not configured|SPARK_SWARM_(?:WORKSPACE_ID|ACCESS_TOKEN)/i.test(detail)) {
    return null;
  }
  return "This recursive command needs Spark Workspace credentials. Ask your Spark admin to configure the workspace, then try again.";
}

export interface RecursiveCommand {
  action: string;
  id?: string;
  chipKey?: string;
  rounds?: number;
  rationale?: string;
  syncKind?: RecursiveArtifactSyncKind;
  syncArgs?: string[];
  proposeArgs?: string[];
}

export type RecursiveArtifactSyncKind = 'prompt-benchmark' | 'domain-chip-lab' | 'domain-autoloop';

export interface RecursiveSessionListItem {
  trace_id: string;
  session_id: string;
  source_kind: string;
  title: string;
  status: string;
  domain: string | null;
  updated_at: string | null;
  kanban_bucket: string;
  review_required: boolean;
}

export interface RecursiveReviewCandidate {
  session_id: string;
  source_kind: string;
  title: string;
  domain: string | null;
  status: string;
  risk: string;
  reason: string;
  gate_ids: string[];
  score_delta: number | null;
}

export interface RecursiveDecisionRecord {
  decision_id: string;
  session_id: string;
  decision: RecursiveDecision;
  scope: 'local' | 'workspace';
  actor: string;
  rationale: string;
  created_at: string;
  effect: 'spark_workspace_review' | 'workspace_route_only';
  target_type?: string;
  target_id?: string;
  workspace_detail?: string;
}

export interface RecursivePromotionPacket {
  packet_id: string;
  session_id: string;
  title: string;
  publication_state: 'staged_local_only';
  effect: 'local_packet_only';
  mutation_allowed: false;
  network_absorbable: false;
  review_decision: {
    decision_id: string;
    decision: 'approve_local';
    actor: string;
  };
}

export interface RecursiveSwarmPacket {
  swarm_packet_id: string;
  session_id: string;
  stage: 'swarm_review_staged';
  effect: 'swarm_packet_staged_only';
  publication_allowed: false;
  network_absorbable: false;
  publication_gate: {
    status: 'blocked';
    reason: string;
    required_next_command: string;
  };
}

export interface RecursiveCanvasQueueResult {
  canvasUrl: string;
  effect: 'spawner_canvas_queue_only';
  pendingLoadPath: string;
  load: {
    pipelineId: string;
    pipelineName: string;
    autoRun: false;
    nodes: unknown[];
    connections: unknown[];
    relay: {
      missionId: string;
      autoRun: false;
    };
  };
}

export interface RecursiveTraceView {
  session_id: string;
  title: string;
  status: string;
  source_kind: string;
  spawner: {
    board_entry: {
      status: string;
      taskCount: number;
    };
    canvas_queue: {
      pipelineId: string;
      pending: boolean;
      latest: boolean;
      autoRun: false;
    };
  };
  review: {
    required: boolean;
    decisions: unknown[];
    local_packets: unknown[];
    swarm_packets: unknown[];
  };
  timeline: Array<{
    kind: string;
    title: string;
    status: string;
    summary: string;
  }>;
}

interface SparkWorkspaceSpecialization {
  id: string;
  key: string;
  label: string;
}

interface SparkWorkspaceEvolutionPath {
  id: string;
  scope: string;
  specializationId: string | null;
  repoLabel?: string | null;
  summary: string;
  status: 'open' | 'expired' | 'resolved' | string;
  bestOutcomeId?: string | null;
  updatedAt: string;
}

interface SparkWorkspaceInsight {
  id: string;
  specializationId?: string | null;
  summary: string;
  confidence?: number | null;
  status?: string | null;
  updatedAt?: string | null;
}

interface SparkWorkspaceMastery {
  id: string;
  specializationScope?: string | null;
  summary: string;
  benchmarkStrength?: number | null;
  liveStrength?: number | null;
  supportCount?: number | null;
  contradictionCount?: number | null;
}

interface SparkWorkspaceOutcome {
  id: string;
  targetType: string;
  targetId: string;
  verdict: string;
  summary: string;
  metricName?: string | null;
  metricValue?: number | null;
  context?: {
    scorecard?: {
      headlineLabel?: string | null;
      headlineValue?: number | null;
      headlineGoal?: string | null;
      modelLabel?: string | null;
      components?: Array<{
        key: string;
        label: string;
        value: number;
        goal: string;
      }>;
      details?: Array<{
        key: string;
        label: string;
        value: string;
      }>;
    } | null;
  } | null;
  createdAt: string;
}

interface SparkWorkspaceArtifactRef {
  id: string;
  kind: string;
  label: string;
  path?: string | null;
  url?: string | null;
}

interface SparkWorkspaceInboxItem {
  id: string;
  kind: string;
  title: string;
  summary: string;
  targetType: string;
  targetId: string;
  specializationId?: string | null;
  repoId?: string | null;
  priority: 'low' | 'medium' | 'high' | string;
  recommendedAction?: string | null;
}

interface SparkWorkspaceSnapshot {
  evolutionPaths: SparkWorkspaceEvolutionPath[];
  insights: SparkWorkspaceInsight[];
  masteries: SparkWorkspaceMastery[];
  outcomes: SparkWorkspaceOutcome[];
  artifactRefs: SparkWorkspaceArtifactRef[];
  specializations: SparkWorkspaceSpecialization[];
  inbox?: {
    items?: SparkWorkspaceInboxItem[];
  };
}

export interface RecursiveWorkspaceSyncResult {
  synced: boolean;
  pathId: string;
  outcomeId: string | null;
  detail: string;
  workspaceUrl: string;
}

export interface RecursiveArtifactSyncInput {
  kind: RecursiveArtifactSyncKind;
  args: string[];
}

export interface RecursiveNetworkProposalResult {
  title?: string | null;
  proposalPath: string | null;
  currentTier: string | null;
  proposedTier: string | null;
  readyForPr: boolean | null;
  missingGates: string[];
  submitted: boolean;
  submitState: string | null;
  submitError: string | null;
}

const AD_HOC_RECURSIVE_PROPOSAL_PREFIX = 'ad-hoc:';

interface RecursiveProposalOptions {
  submit: boolean;
  title?: string;
  riskNotes?: string;
  replayCommand?: string;
}

interface RecursiveProposalDefaults {
  payloadPath: string;
  title?: string;
  riskNotes?: string;
  replayCommand?: string;
}

interface LocalRecursiveLoopStatus {
  session_id: string;
  trace_id: string;
  chip_key: string;
  title: string;
  status: string;
  domain: string;
  updated_at: string | null;
  status_path: string;
  rounds_completed: number | null;
  total_rounds: number | null;
  history: Array<{
    round_index?: number | null;
    suggestions_count?: number | null;
    best_verdict?: string | null;
    best_metric?: number | null;
  }>;
}

const DEFAULT_SWARM_API_URL = 'http://127.0.0.1:8787';
const DEFAULT_SWARM_WEB_URL = 'http://127.0.0.1:4178';
const execFileAsync = promisify(execFile);

const SWARM_API_ENV_NAMES = [
  'SPARK_SWARM_API_URL',
  'SPARK_SWARM_DEPLOYED_API_URL',
  'SPARK_SWARM_BACKEND_URL'
];
const SWARM_WORKSPACE_ENV_NAMES = [
  'SPARK_SWARM_WORKSPACE_ID',
  'SPARK_SWARM_DEPLOYED_WORKSPACE_ID'
];
const SWARM_ACCESS_TOKEN_ENV_NAMES = [
  'SPARK_SWARM_ACCESS_TOKEN',
  'SPARK_SWARM_DEPLOYED_ACCESS_TOKEN',
  'SPARK_SWARM_BEARER_TOKEN'
];
const SWARM_REFRESH_TOKEN_ENV_NAMES = [
  'SPARK_SWARM_REFRESH_TOKEN',
  'SPARK_SWARM_DEPLOYED_REFRESH_TOKEN'
];
const SWARM_AUTH_CLIENT_KEY_ENV_NAMES = [
  'SPARK_SWARM_AUTH_CLIENT_KEY',
  'SPARK_SWARM_DEPLOYED_AUTH_CLIENT_KEY'
];

function firstProcessEnvValue(names: string[]): string | null {
  for (const name of names) {
    const value = (process.env[name] || '').trim();
    if (value) return value;
  }
  return null;
}

function unquoteConfigValue(raw: string): string {
  const trimmed = raw.trim().replace(/\s+#.*$/, '').trim();
  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    return trimmed.slice(1, -1).trim();
  }
  return trimmed;
}

function readEnvFileValue(filePath: string, key: string): string | null {
  try {
    // NOTE: existsSync check then use is a TOCTOU pattern in concurrent code. The file may be deleted between the check and the read. Consider using try/catch ENOENT or async fs.promises.access.
    if (!existsSync(filePath)) return null;
    const prefix = `${key}=`;
    for (const line of readFileSync(filePath, 'utf-8').split(/\r?\n/)) {
      const trimmed = line.trim();
      const normalized = trimmed.startsWith('export ') ? trimmed.slice('export '.length).trim() : trimmed;
      if (normalized.startsWith(prefix)) {
        const value = unquoteConfigValue(normalized.slice(prefix.length));
        if (value) return value;
      }
    }
  } catch {
    return null;
  }
  return null;
}

function normalizedUrl(value: string): string {
  return value.trim().replace(/\/+$/, '');
}

function bridgeSessionFilePath(): string {
  const explicit = (process.env.SPARK_SWARM_BRIDGE_SESSION_FILE || '').trim();
  if (explicit) return explicit;
  return path.join(homedir(), '.spark-swarm', 'bridge-session.json');
}

function bridgeSessionValue(key: string): string | null {
  try {
    const sessionPath = bridgeSessionFilePath();
    if (!existsSync(sessionPath)) return null;
    const parsed = JSON.parse(readFileSync(sessionPath, 'utf-8'));
    const value = parsed?.[key];
    return typeof value === 'string' && value.trim() ? value.trim() : null;
  } catch {
    return null;
  }
}

function bridgeSessionAccessToken(apiUrl: string, workspaceId: string): string | null {
  const sessionWorkspaceId = bridgeSessionValue('workspace_id');
  if (!sessionWorkspaceId || sessionWorkspaceId !== workspaceId) return null;
  const sessionApiUrl = bridgeSessionValue('api_url');
  if (sessionApiUrl && normalizedUrl(sessionApiUrl) !== normalizedUrl(apiUrl)) return null;
  return bridgeSessionValue('cli_token') || bridgeSessionValue('access_token');
}

function builderHome(): string | null {
  const explicitHome = (process.env.SPARK_BUILDER_HOME || '').trim();
  if (explicitHome) return explicitHome;
  const envFile = (process.env.SPARK_BUILDER_ENV_FILE || '').trim();
  return envFile ? path.dirname(envFile) : null;
}

function builderRepo(): string | null {
  const explicitRepo = (process.env.SPARK_BUILDER_REPO || '').trim();
  return explicitRepo || null;
}

function uniquePaths(paths: Array<string | null>): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const candidate of paths) {
    if (!candidate) continue;
    const normalized = path.resolve(candidate);
    if (seen.has(normalized)) continue;
    seen.add(normalized);
    result.push(candidate);
  }
  return result;
}

function builderEnvFilePaths(): string[] {
  const explicitEnvFile = (process.env.SPARK_BUILDER_ENV_FILE || '').trim();
  const home = builderHome();
  const repo = builderRepo();
  return uniquePaths([
    explicitEnvFile || null,
    home ? path.join(home, '.env') : null,
    repo ? path.join(repo, '.env') : null
  ]);
}

function firstBuilderEnvValue(names: string[]): string | null {
  for (const envFile of builderEnvFilePaths()) {
    for (const name of names) {
      const value = readEnvFileValue(envFile, name);
      if (value) return value;
    }
  }
  return null;
}

function builderConfigPaths(): string[] {
  const home = builderHome();
  const repo = builderRepo();
  return uniquePaths([
    home ? path.join(home, 'config.yaml') : null,
    repo ? path.join(repo, 'config.yaml') : null
  ]);
}

function builderSwarmConfigValue(key: string): string | null {
  for (const configPath of builderConfigPaths()) {
    try {
      if (!existsSync(configPath)) continue;
      let inSpark = false;
      let sparkIndent = -1;
      let inSwarm = false;
      let swarmIndent = -1;
      for (const line of readFileSync(configPath, 'utf-8').split(/\r?\n/)) {
        if (!line.trim() || line.trim().startsWith('#')) continue;
        const indent = line.match(/^\s*/)?.[0].length ?? 0;
        const match = line.trim().match(/^([A-Za-z0-9_-]+)\s*:\s*(.*)$/);
        if (!match) continue;
        const [, currentKey, rawValue] = match;

        if (inSwarm && indent <= swarmIndent) inSwarm = false;
        if (inSpark && indent <= sparkIndent) inSpark = false;

        if (currentKey === 'spark') {
          inSpark = rawValue.trim() === '';
          sparkIndent = indent;
          continue;
        }
        if (inSpark && currentKey === 'swarm') {
          inSwarm = rawValue.trim() === '';
          swarmIndent = indent;
          continue;
        }
        if (inSwarm && currentKey === key) {
          const value = unquoteConfigValue(rawValue);
          if (value) return value;
        }
      }
    } catch {
      continue;
    }
  }
  return null;
}

export function sparkWorkspaceApiUrl(): string {
  return (
    firstProcessEnvValue(SWARM_API_ENV_NAMES) ||
    firstBuilderEnvValue(SWARM_API_ENV_NAMES) ||
    builderSwarmConfigValue('api_url') ||
    DEFAULT_SWARM_API_URL
  ).replace(/\/+$/, '');
}

export function sparkWorkspaceWebUrl(): string {
  return (
    process.env.SPARK_SWARM_WEB_URL ||
    process.env.SPARK_SWARM_DEPLOYED_WEB_URL ||
    DEFAULT_SWARM_WEB_URL
  ).replace(/\/+$/, '');
}

export function sparkWorkspaceRecursionsUrl(): string {
  return `${sparkWorkspaceWebUrl()}/runs?tab=recursions`;
}

export function sparkWorkspaceDecisionsUrl(): string {
  return `${sparkWorkspaceWebUrl()}/runs?tab=decisions`;
}

function sparkWorkspaceConfig(): { apiUrl: string; workspaceId: string; accessToken: string } {
  const apiUrl = sparkWorkspaceApiUrl();
  const workspaceId = (
    firstProcessEnvValue(SWARM_WORKSPACE_ENV_NAMES) ||
    firstBuilderEnvValue(SWARM_WORKSPACE_ENV_NAMES) ||
    builderSwarmConfigValue('workspace_id') ||
    ''
  ).trim();
  const accessToken = (
    firstProcessEnvValue(SWARM_ACCESS_TOKEN_ENV_NAMES) ||
    (workspaceId ? bridgeSessionAccessToken(apiUrl, workspaceId) : null) ||
    firstBuilderEnvValue(SWARM_ACCESS_TOKEN_ENV_NAMES) ||
    ''
  ).trim();

  if (!workspaceId || !accessToken) {
    throw new Error('Spark Workspace is not configured. Set SPARK_SWARM_WORKSPACE_ID and SPARK_SWARM_ACCESS_TOKEN, or configure SPARK_BUILDER_HOME with Swarm credentials for Telegram recursive reads.');
  }

  return {
    apiUrl,
    workspaceId,
    accessToken
  };
}

export function sparkWorkspaceBridgeHints(): { apiUrl?: string; workspaceId?: string; accessToken?: string } {
  const apiUrl = sparkWorkspaceApiUrl();
  const workspaceId = (
    firstProcessEnvValue(SWARM_WORKSPACE_ENV_NAMES) ||
    firstBuilderEnvValue(SWARM_WORKSPACE_ENV_NAMES) ||
    builderSwarmConfigValue('workspace_id') ||
    ''
  ).trim();
  const accessToken = (
    firstProcessEnvValue(SWARM_ACCESS_TOKEN_ENV_NAMES) ||
    (workspaceId ? bridgeSessionAccessToken(apiUrl, workspaceId) : null) ||
    firstBuilderEnvValue(SWARM_ACCESS_TOKEN_ENV_NAMES) ||
    ''
  ).trim();

  return {
    apiUrl: apiUrl === DEFAULT_SWARM_API_URL ? undefined : apiUrl,
    workspaceId: workspaceId || undefined,
    accessToken: accessToken || undefined
  };
}

export function sparkWorkspaceConfigured(): boolean {
  const config = sparkWorkspaceBridgeHints();
  return Boolean(config.workspaceId && config.accessToken);
}

async function loadSparkWorkspaceSnapshot(): Promise<SparkWorkspaceSnapshot> {
  const { apiUrl, workspaceId, accessToken } = sparkWorkspaceConfig();
  const res = await axios.get(`${apiUrl}/api/workspaces/${encodeURIComponent(workspaceId)}/collective-snapshot`, {
    timeout: 15000,
    headers: {
      Authorization: `Bearer ${accessToken}`
    }
  });
  return {
    evolutionPaths: Array.isArray(res.data?.evolutionPaths) ? res.data.evolutionPaths : [],
    insights: Array.isArray(res.data?.insights) ? res.data.insights : [],
    masteries: Array.isArray(res.data?.masteries) ? res.data.masteries : [],
    outcomes: Array.isArray(res.data?.outcomes) ? res.data.outcomes : [],
    artifactRefs: Array.isArray(res.data?.artifactRefs) ? res.data.artifactRefs : [],
    specializations: Array.isArray(res.data?.specializations) ? res.data.specializations : [],
    inbox: {
      items: Array.isArray(res.data?.inbox?.items) ? res.data.inbox.items : []
    }
  };
}

export function parseRecursiveCommand(raw: string): RecursiveCommand | null {
  const parts = raw.trim().split(/\s+/).filter(Boolean);
  const action = (parts.shift() || 'help').toLowerCase();

  if (action === 'sessions' || action === 'paths' || action === 'help') return { action };
  if (action === 'sync') {
    const syncKind = normalizeRecursiveArtifactSyncKind(parts[0]);
    if (syncKind) return { action, syncKind, syncArgs: parts.slice(1) };
    return { action, id: parts[0] };
  }
  if (action === 'propose') {
    return { action, id: parts[0], proposeArgs: parts.slice(1) };
  }
  if (
    action === 'session' ||
    action === 'status' ||
    action === 'benchmark' ||
    action === 'compare' ||
    action === 'evidence' ||
    action === 'package' ||
    action === 'report' ||
    action === 'review' ||
    action === 'promote' ||
    action === 'canvas' ||
    action === 'trace'
  ) {
    return { action, id: parts[0] };
  }
  if (action === 'approve' || action === 'defer' || action === 'reject' || action === 'more-eval') {
    const id = parts.shift();
    return { action, id, rationale: parts.join(' ').trim() };
  }
  if (action === 'start') {
    const chipKey = parts.shift();
    const rounds = parseRounds(parts);
    return { action, chipKey, rounds };
  }

  return null;
}

function recursiveLocalStatusRoots(): string[] {
  const explicit = (process.env.SPARK_RECURSIVE_LOCAL_STATUS_ROOTS || '').trim();
  const roots = explicit
    ? explicit.split(path.delimiter).map((entry) => entry.trim()).filter(Boolean)
    : [];
  const home = builderHome();
  return uniquePaths([
    ...roots,
    home ? path.join(home, 'loops') : null,
    path.join(homedir(), '.spark', 'state', 'spark-intelligence', 'loops'),
    path.join(homedir(), '.spark-intelligence', 'loops')
  ]);
}

async function localRecursiveStatusFiles(): Promise<string[]> {
  const files: string[] = [];
  for (const root of recursiveLocalStatusRoots()) {
    try {
      if (!existsSync(root)) continue;
      const entries = await readdir(root, { withFileTypes: true });
      for (const entry of entries) {
        if (!entry.isFile()) continue;
        if (!/\.status\.json$/i.test(entry.name)) continue;
        files.push(path.join(root, entry.name));
      }
    } catch {
      continue;
    }
  }
  return files;
}

function numberOrNull(value: unknown): number | null {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function localStatusId(chipKey: string): string {
  return `path_builder_chip_${normalizeWorkspaceIdPart(chipKey)}`;
}

function isLatestRecursiveId(id: string): boolean {
  return /^(?:latest|last|recent|current)$/i.test(id.trim());
}

async function readLocalRecursiveStatus(filePath: string): Promise<LocalRecursiveLoopStatus | null> {
  try {
    const parsed = JSON.parse(await readFile(filePath, 'utf-8'));
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null;
    const fallbackKey = path.basename(filePath).replace(/\.status\.json$/i, '');
    const chipKey = String(parsed.chip_key || parsed.chipKey || parsed.chip || parsed.key || fallbackKey).trim();
    if (!chipKey) return null;
    const fileStat = await stat(filePath);
    const history = Array.isArray(parsed.history) ? parsed.history : [];
    const updatedAt = typeof parsed.updated_at === 'string'
      ? parsed.updated_at
      : typeof parsed.updatedAt === 'string'
        ? parsed.updatedAt
        : fileStat.mtime.toISOString();
    const title = `${labelFromKey(chipKey)} local Builder loop`;
    return {
      session_id: localStatusId(chipKey),
      trace_id: localStatusId(chipKey),
      chip_key: chipKey,
      title,
      status: String(parsed.status || 'open'),
      domain: 'spark-intelligence-builder',
      updated_at: updatedAt,
      status_path: filePath,
      rounds_completed: numberOrNull(parsed.rounds_completed ?? parsed.roundsCompleted),
      total_rounds: numberOrNull(parsed.total_rounds ?? parsed.totalRounds),
      history: history.map((round: any) => ({
        round_index: numberOrNull(round?.round_index ?? round?.roundIndex),
        suggestions_count: numberOrNull(round?.suggestions_count ?? round?.suggestionsCount),
        best_verdict: typeof round?.best_verdict === 'string' ? round.best_verdict : typeof round?.bestVerdict === 'string' ? round.bestVerdict : null,
        best_metric: numberOrNull(round?.best_metric ?? round?.bestMetric)
      }))
    };
  } catch {
    return null;
  }
}

async function localRecursiveStatuses(): Promise<LocalRecursiveLoopStatus[]> {
  const statuses = await Promise.all((await localRecursiveStatusFiles()).map(readLocalRecursiveStatus));
  return statuses
    .filter((status): status is LocalRecursiveLoopStatus => Boolean(status))
    .sort((a, b) => String(b.updated_at || '').localeCompare(String(a.updated_at || '')));
}

async function localRecursiveSessionItems(): Promise<RecursiveSessionListItem[]> {
  return (await localRecursiveStatuses()).map((status) => ({
    trace_id: status.trace_id,
    session_id: status.session_id,
    source_kind: 'local_builder_chip_loop',
    title: status.title,
    status: status.status,
    domain: status.domain,
    updated_at: status.updated_at,
    kanban_bucket: 'local',
    review_required: false
  }));
}

async function resolveLocalRecursiveStatus(id: string): Promise<LocalRecursiveLoopStatus | null> {
  const statuses = await localRecursiveStatuses();
  const trimmed = id.trim();
  if (isLatestRecursiveId(trimmed)) return statuses[0] ?? null;
  if (/^\d+$/.test(trimmed)) return statuses[Number.parseInt(trimmed, 10) - 1] ?? null;
  const normalized = normalizeWorkspaceIdPart(trimmed.replace(/^path:/i, ''));
  return statuses.find((status) => {
    const candidates = [
      status.session_id,
      status.trace_id,
      status.chip_key,
      localStatusId(status.chip_key),
      path.basename(status.status_path).replace(/\.status\.json$/i, '')
    ];
    return candidates.some((candidate) =>
      candidate === trimmed ||
      normalizeWorkspaceIdPart(candidate.replace(/^path:/i, '')) === normalized
    );
  }) ?? null;
}

function latestLocalRound(status: LocalRecursiveLoopStatus): LocalRecursiveLoopStatus['history'][number] | null {
  return status.history.slice(-1)[0] ?? null;
}

function localLoopVerdict(status: LocalRecursiveLoopStatus): 'improved' | 'flat' | 'regressed' | 'defer' {
  const round = latestLocalRound(status);
  return inferOutcomeVerdict(round?.best_verdict, round?.best_metric);
}

function localRoundCount(status: LocalRecursiveLoopStatus): string {
  const completed = status.rounds_completed ?? status.history.length;
  const total = status.total_rounds ?? completed;
  return `${completed}/${total}`;
}

function roundProgressPhrase(completed: number, total: number): string {
  return `${completed}/${total} ${total === 1 ? 'round' : 'rounds'}`;
}

function loopCandidateSignalSentence(finalRound: { suggestions_count?: number | null; best_metric?: number | null } | null, label = 'this workflow'): string {
  if (!finalRound) return 'No candidate scores were recorded yet.';
  if (typeof finalRound.best_metric === 'number') {
    return 'Spark drafted a possible improvement for this private workflow helper. It has not been used, approved, or shared.';
  }
  if (typeof finalRound.suggestions_count === 'number') return 'Spark checked the candidates it found. Nothing is ready to apply yet.';
  return 'No candidate scores were recorded yet.';
}

function loopProofBoundarySentence(verdict: string | null | undefined): string {
  const normalized = (verdict || '').toLowerCase();
  if (normalized.includes('regress')) {
    return 'Treat this as a rollback signal until separated judges explain what broke.';
  }
  if (normalized.includes('defer')) {
    return 'I kept it private and made no changes.';
  }
  return 'This only proves Spark can compare draft versions in a private run; real self-improvement still needs a separate review on a multi-round trend.';
}

function readableReportCommand(_chipKey: string): string {
  return '/recursive report latest';
}

function loopCompletionHeadline(label: string, completed: number, total: number, verdict: string | null | undefined, local = false): string {
  const normalized = (verdict || '').toLowerCase();
  if (normalized.includes('defer')) {
    return `I finished checking ${label}${local ? ' locally' : ''}.`;
  }
  return `${outcomeStatusIcon(verdict)} ${label} finished ${roundProgressPhrase(completed, total)}${local ? ' locally' : ''} and ${friendlyOutcomeVerb(verdict)}.`;
}

function renderLocalRecursiveReport(status: LocalRecursiveLoopStatus): string {
  const label = labelFromKey(status.chip_key);
  const verdict = localLoopVerdict(status);
  const round = latestLocalRound(status);
  const completed = status.rounds_completed ?? status.history.length;
  const total = status.total_rounds ?? completed;
  const lines = [
    loopCompletionHeadline(label, completed, total, verdict, true),
    '',
    loopCandidateSignalSentence(round, label),
    '',
    loopProofBoundarySentence(verdict)
  ];
  lines.push('', 'Saved locally. Keep it private until the review gates pass.');
  return lines.join('\n');
}

function renderLocalRecursiveTrace(status: LocalRecursiveLoopStatus): string {
  const label = labelFromKey(status.chip_key);
  const recent = status.history.slice(-5).map((round, index) => {
    const verdict = inferOutcomeVerdict(round.best_verdict, round.best_metric);
    const roundNumber = round.round_index ?? index + 1;
    const score = typeof round.best_metric === 'number' ? `, best score ${formatNumber(round.best_metric)}` : '';
    const suggestions = typeof round.suggestions_count === 'number' ? `, ${pluralize(round.suggestions_count, 'suggestion')}` : '';
    return `• round ${roundNumber}: ${friendlyOutcomeVerb(verdict)}${score}${suggestions}`;
  });
  return [
    `${label} local trace`,
    '',
    'Status',
    `• ${status.status}`,
    `• updated ${formatUpdatedAt(status.updated_at)}`,
    `• ${localRoundCount(status)} rounds`,
    '',
    'Recent',
    ...(recent.length > 0 ? recent : ['• no rounds recorded']),
    '',
    'Local',
    `• ${status.status_path}`
  ].join('\n');
}

export async function recursiveSessions(): Promise<RecursiveSessionListItem[]> {
  if (!sparkWorkspaceConfigured()) return localRecursiveSessionItems();
  return workspaceSessions(await loadSparkWorkspaceSnapshot());
}

function resolveRecursiveSessionId(snapshot: SparkWorkspaceSnapshot, id: string): string {
  const trimmed = id.trim();
  if (isLatestRecursiveId(trimmed)) {
    return orderedRecursiveSessions(workspaceSessions(snapshot))[0]?.session_id || id;
  }
  if (!/^\d+$/.test(trimmed)) return id;
  const index = Number.parseInt(trimmed, 10) - 1;
  const session = orderedRecursiveSessions(workspaceSessions(snapshot))[index];
  return session?.session_id || id;
}

export async function recursiveSessionStatus(id: string): Promise<string> {
  if (!sparkWorkspaceConfigured()) {
    const local = await resolveLocalRecursiveStatus(id);
    return local ? renderLocalRecursiveReport(local) : `Recursive loop not found locally: ${id}`;
  }
  const snapshot = await loadSparkWorkspaceSnapshot();
  return renderRecursiveWorkspaceReport(snapshot, resolveRecursiveSessionId(snapshot, id));
}

export async function recursiveSessionReview(id: string): Promise<string> {
  if (!sparkWorkspaceConfigured()) {
    const local = await resolveLocalRecursiveStatus(id);
    const label = local ? labelFromKey(local.chip_key) : id;
    return [
      `${label} review`,
      '',
      'Status',
      '• local-only mode',
      '• no Workspace review queue is connected yet',
      '',
      'Next',
      `• /recursive report ${id}`,
      `• /recursive trace ${id}`
    ].join('\n');
  }
  const snapshot = await loadSparkWorkspaceSnapshot();
  return renderRecursiveWorkspaceReview(snapshot, resolveRecursiveSessionId(snapshot, id));
}

export async function recursiveSessionReport(id: string): Promise<string> {
  if (!sparkWorkspaceConfigured()) {
    const local = await resolveLocalRecursiveStatus(id);
    return local ? renderLocalRecursiveReport(local) : `Recursive loop not found locally: ${id}`;
  }
  const snapshot = await loadSparkWorkspaceSnapshot();
  return renderRecursiveWorkspaceReport(snapshot, resolveRecursiveSessionId(snapshot, id));
}

export async function recursiveReviewCandidates(): Promise<RecursiveReviewCandidate[]> {
  if (!sparkWorkspaceConfigured()) return [];
  return workspaceReviewCandidates(await loadSparkWorkspaceSnapshot());
}

export async function recordRecursiveDecision(input: {
  id: string;
  action: 'approve' | 'defer' | 'reject' | 'more-eval';
  actor: string;
  rationale?: string;
}): Promise<RecursiveDecisionRecord> {
  const applied = await applySparkWorkspaceDecision(input);
  return {
    decision_id: `workspace-route-${Date.now()}`,
    session_id: input.id,
    decision: decisionForAction(input.action),
    scope: applied.applied ? 'workspace' : 'local',
    actor: input.actor,
    rationale: input.rationale || '',
    created_at: new Date().toISOString(),
    effect: applied.applied ? 'spark_workspace_review' : 'workspace_route_only',
    target_type: applied.targetType,
    target_id: applied.targetId,
    workspace_detail: applied.detail
  };
}

export async function stageRecursivePromotionPacket(id: string): Promise<RecursivePromotionPacket> {
  throw new Error(`Standalone local promotion packets are retired. Review ${id} in Spark Workspace: ${sparkWorkspaceRecursionsUrl()}`);
}

export async function stageRecursiveSwarmPacket(id: string): Promise<RecursiveSwarmPacket> {
  throw new Error(`Standalone Swarm staging packets are retired. Sync recursive evidence through Spark Workspace collective sync: ${sparkWorkspaceRecursionsUrl()}`);
}

export async function syncRecursiveArtifactToWorkspace(input: RecursiveArtifactSyncInput): Promise<RecursiveWorkspaceSyncResult> {
  const config = sparkWorkspaceBridgeHints();
  const tempDir = await mkdtemp(path.join(tmpdir(), `spark-recursive-${input.kind}-`));
  const payloadPath = path.join(tempDir, 'collective-sync.json');
  const python = (
    process.env.SPARK_SWARM_BRIDGE_PYTHON ||
    process.env.SPARK_BUILDER_PYTHON ||
    process.env.PYTHON ||
    'python'
  ).trim();
  const bridgeSrc = resolveSparkSwarmBridgeSrc();
  const env: NodeJS.ProcessEnv = effectiveLevel5RuntimeEnv({ ...process.env });
  if (config.apiUrl) env.SPARK_SWARM_API_URL = config.apiUrl;
  if (config.workspaceId) env.SPARK_SWARM_WORKSPACE_ID = config.workspaceId;
  if (config.accessToken) env.SPARK_SWARM_ACCESS_TOKEN = config.accessToken;
  if (bridgeSrc) {
    env.PYTHONPATH = env.PYTHONPATH ? `${bridgeSrc}${path.delimiter}${env.PYTHONPATH}` : bridgeSrc;
  }

  const bridgeArgs = buildRecursiveArtifactBridgeArgs(input, {
    payloadPath,
    apiUrl: config.apiUrl,
    workspaceId: config.workspaceId,
    accessToken: config.accessToken
  });
  let stdout: string;
  try {
    ({ stdout } = await execFileAsync(
      python,
      bridgeArgs,
      {
        env,
        timeout: 30000,
        windowsHide: true,
        maxBuffer: 1024 * 1024
      }
    ));
  } finally {
    // Clean the per-run scratch directory so /tmp does not grow unbounded over many syncs.
    await rm(tempDir, { recursive: true, force: true }).catch(() => undefined);
  }

  return {
    synced: true,
    pathId: parseBridgeLine(stdout, 'Path') || 'unknown',
    outcomeId: parseBridgeLine(stdout, 'Outcome'),
    detail: `${input.kind} artifact synced through Spark Swarm bridge.`,
    workspaceUrl: sparkWorkspaceRecursionsUrl()
  };
}

function localProposalRoots(): string[] {
  const explicit = (process.env.SPARK_RECURSIVE_PROPOSAL_ROOTS || '').trim();
  const roots = explicit
    ? explicit.split(path.delimiter).map((entry) => entry.trim()).filter(Boolean)
    : [];
  roots.push(path.join(homedir(), 'Desktop'));
  return [...new Set(roots)];
}

function isAdHocRecursiveProposalTarget(value: string): boolean {
  return value.startsWith(AD_HOC_RECURSIVE_PROPOSAL_PREFIX);
}

function adHocRecursiveProposalTargetLabel(value: string): string {
  const target = value.slice(AD_HOC_RECURSIVE_PROPOSAL_PREFIX.length).trim();
  return labelFromKey(target || 'spark-improvement-proposal');
}

function adHocRecursiveProposalPayloadPath(value: string): string {
  const target = value.slice(AD_HOC_RECURSIVE_PROPOSAL_PREFIX.length).trim() || 'spark-improvement-proposal';
  const slug = normalizeWorkspaceIdPart(target);
  const root = path.join(tmpdir(), 'spark-recursive-natural-proposals', slug);
  mkdirSync(root, { recursive: true });
  const payloadPath = path.join(root, 'collective-sync.json');
  const emittedAt = new Date().toISOString();
  const pathId = `path_natural_proposal_${slug}`;
  const outcomeId = `outcome_natural_proposal_${slug}_${compactTimestamp(emittedAt)}`;
  const label = adHocRecursiveProposalTargetLabel(value);
  const payload = {
    workspaceId: 'telegram-natural-recursive-proposal',
    agentId: 'agent:spark-telegram-bot',
    runtimeSource: {
      kind: 'spark_telegram_natural_proposal',
      version: 'telegram-recursive-proposal.v1',
      sourceInstanceId: 'agent:spark-telegram-bot',
      sourceRunId: `spark-telegram:natural-recursive-proposal:${slug}:${emittedAt}`,
      chipKey: target,
      chipLabel: label
    },
    specialization: null,
    runtimePulse: {
      agentId: 'agent:spark-telegram-bot',
      repoId: null,
      runtimeState: 'idle',
      passNumber: 0,
      stageKey: 'natural_recursive_proposal',
      stageLabel: 'Natural Recursive Proposal',
      blocker: null,
      recommendation: `Review and shape the proposed Spark improvement for ${label}.`,
      lastUpdatedAt: emittedAt,
      intelligencePulse: null
    },
    intelligencePulse: null,
    evolutionPaths: [{
      id: pathId,
      scope: 'workspace',
      specializationId: null,
      repoId: null,
      repoLabel: 'spark-telegram-bot',
      summary: `Natural Telegram request proposed an improvement to ${label}.`,
      status: 'open',
      assignedAgentId: 'agent:spark-telegram-bot',
      bestOutcomeId: outcomeId,
      expiresAt: null,
      createdAt: emittedAt,
      updatedAt: emittedAt
    }],
    insights: [],
    masteries: [],
    masteryReviews: [],
    contradictions: [],
    upgrades: [],
    upgradeDeliveries: [],
    outcomes: [{
      id: outcomeId,
      targetType: 'evolution_path',
      targetId: pathId,
      evidenceLane: 'telegram_natural_request',
      verdict: 'candidate',
      summary: `Prepare a governed recursive review proposal for ${label}.`,
      metricName: null,
      metricValue: null,
      context: {
        requestedTarget: target,
        sourceLane: 'fresh_telegram_turn'
      },
      createdAt: emittedAt
    }],
    artifactRefs: [],
    emittedAt
  };
  writeFileSync(payloadPath, JSON.stringify(payload, null, 2), 'utf-8');
  return payloadPath;
}

export function resolveRecursiveProposalPayloadPath(input: string): string {
  const value = (input || '').trim();
  if (!value) throw new Error('Usage: /recursive propose <path-or-key> [submit]');
  if (isAdHocRecursiveProposalTarget(value)) return adHocRecursiveProposalPayloadPath(value);
  if (existsSync(value)) return value;
  const normalized = value.replace(/^path:/i, '').replace(/^domain-chip-/i, '');
  const repoNames = [
    value,
    `domain-chip-${normalized}`,
    `specialization-path-${normalized}`,
    `benchmark-${normalized}`
  ];
  for (const root of localProposalRoots()) {
    for (const repoName of repoNames) {
      const candidate = path.join(root, repoName, '.spark-swarm', 'collective-sync.json');
      if (existsSync(candidate)) return candidate;
    }
  }
  return value;
}

function proposalArtifactPath(payload: Record<string, any>, kind: string): string | null {
  const refs = Array.isArray(payload.artifactRefs) ? payload.artifactRefs : [];
  const ref = refs.find((item: any) => item && item.kind === kind && typeof item.path === 'string' && item.path.trim());
  return ref?.path?.trim() || null;
}

function inferRecursiveProposalDefaults(input: string, payloadPath: string): RecursiveProposalDefaults {
  const defaults: RecursiveProposalDefaults = { payloadPath };
  try {
    const payload = JSON.parse(readFileSync(payloadPath, 'utf-8'));
    const runtimeSource = payload?.runtimeSource && typeof payload.runtimeSource === 'object' ? payload.runtimeSource : {};
    const label = String(runtimeSource.chipLabel || runtimeSource.autoloopId || runtimeSource.chipKey || input || '').trim();
    if (label) defaults.title = labelFromKey(label);
    defaults.riskNotes = 'Private workspace evidence only; review benchmark evidence, privacy, and rollback before sharing.';
    if (isAdHocRecursiveProposalTarget(input)) {
      defaults.riskNotes = 'Natural Telegram improvement proposal; review source-lane evidence, owner boundaries, and rollback before sharing.';
      defaults.replayCommand = `Review Spark improvement target: ${adHocRecursiveProposalTargetLabel(input)}`;
    }

    if (runtimeSource.sourceKind === 'domain_autoloop') {
      const manifest = proposalArtifactPath(payload, 'manifest');
      const state = proposalArtifactPath(payload, 'state');
      const policy = proposalArtifactPath(payload, 'policy');
      const journal = proposalArtifactPath(payload, 'journal');
      const laneReport = proposalArtifactPath(payload, 'lane_report');
      if (manifest && state) {
        defaults.replayCommand = [
          'spark-swarm domain-autoloop',
          `--manifest ${manifest}`,
          `--state ${state}`,
          policy ? `--policy ${policy}` : '',
          journal ? `--journal ${journal}` : '',
          laneReport ? `--lane-report ${laneReport}` : '',
          '--sync-collective'
        ].filter(Boolean).join(' ');
      }
    }
  } catch {
    return defaults;
  }
  return defaults;
}

export function parseRecursiveProposalOptions(args: string[]): RecursiveProposalOptions {
  const options: RecursiveProposalOptions = { submit: false };
  const fieldFor = (value: string): keyof Omit<RecursiveProposalOptions, 'submit'> | null => {
    const normalized = value.toLowerCase();
    if (normalized === 'title' || normalized === '--title') return 'title';
    if (normalized === 'risk' || normalized === 'risks' || normalized === 'risk-notes' || normalized === '--risk-notes') return 'riskNotes';
    if (normalized === 'replay' || normalized === 'replay-command' || normalized === '--replay-command') return 'replayCommand';
    return null;
  };
  const stopWords = new Set(['submit', '--submit', 'title', '--title', 'risk', 'risks', 'risk-notes', '--risk-notes', 'replay', 'replay-command', '--replay-command']);

  for (let index = 0; index < args.length;) {
    const token = args[index];
    if (!token) {
      index += 1;
      continue;
    }
    const normalized = token.toLowerCase();
    if (normalized === 'submit' || normalized === '--submit') {
      options.submit = true;
      index += 1;
      continue;
    }
    const field = fieldFor(token);
    if (!field) {
      index += 1;
      continue;
    }
    const values: string[] = [];
    index += 1;
    while (index < args.length && !stopWords.has(args[index].toLowerCase())) {
      values.push(args[index]);
      index += 1;
    }
    const value = values.join(' ').trim();
    if (value) options[field] = value;
  }

  return options;
}

export async function proposeRecursiveWorkspaceEvidence(
  payloadPathOrKey: string,
  args: string[] = []
): Promise<RecursiveNetworkProposalResult> {
  if (!payloadPathOrKey?.trim()) throw new Error('Usage: /recursive propose <path-or-key> [submit]');
  const payloadPath = resolveRecursiveProposalPayloadPath(payloadPathOrKey);
  const options = parseRecursiveProposalOptions(args);
  const defaults = inferRecursiveProposalDefaults(payloadPathOrKey, payloadPath);
  const title = options.title || defaults.title;
  const riskNotes = options.riskNotes || defaults.riskNotes;
  const replayCommand = options.replayCommand || defaults.replayCommand;
  const config = sparkWorkspaceBridgeHints();
  const python = (
    process.env.SPARK_SWARM_BRIDGE_PYTHON ||
    process.env.SPARK_BUILDER_PYTHON ||
    process.env.PYTHON ||
    'python'
  ).trim();
  const bridgeSrc = resolveSparkSwarmBridgeSrc();
  const env: NodeJS.ProcessEnv = effectiveLevel5RuntimeEnv({ ...process.env });
  if (config.apiUrl) env.SPARK_SWARM_API_URL = config.apiUrl;
  if (config.workspaceId) env.SPARK_SWARM_WORKSPACE_ID = config.workspaceId;
  if (config.accessToken) env.SPARK_SWARM_ACCESS_TOKEN = config.accessToken;
  if (bridgeSrc) {
    env.PYTHONPATH = env.PYTHONPATH ? `${bridgeSrc}${path.delimiter}${env.PYTHONPATH}` : bridgeSrc;
  }

  const { stdout } = await execFileAsync(
    python,
    [
      '-m',
      'spark_swarm_bridge.cli',
      'network',
      'propose',
      '--from-payload',
      payloadPath,
      ...(title ? ['--title', title] : []),
      ...(riskNotes ? ['--risk-notes', riskNotes] : []),
      ...(replayCommand ? ['--replay-command', replayCommand] : [])
    ],
    {
      env,
      timeout: 30000,
      windowsHide: true,
      maxBuffer: 1024 * 1024
    }
  );
  const proposalPath = parseBridgeLine(stdout, 'Proposal');
  const result: RecursiveNetworkProposalResult = {
    title: title || null,
    proposalPath,
    currentTier: parseBridgeLine(stdout, 'Current tier'),
    proposedTier: parseBridgeLine(stdout, 'Proposed tier'),
    readyForPr: parseBridgeLine(stdout, 'Ready for PR') === 'yes',
    missingGates: (parseBridgeLine(stdout, 'Missing gates') || '')
      .split(',')
      .map((gate) => gate.trim())
      .filter(Boolean),
    submitted: false,
    submitState: null,
    submitError: null
  };

  if (!options.submit || !proposalPath) return result;

  try {
    const submitResult = await execFileAsync(
      python,
      ['-m', 'spark_swarm_bridge.cli', 'network', 'submit', '--proposal', proposalPath],
      {
        env,
        timeout: 30000,
        windowsHide: true,
        maxBuffer: 1024 * 1024
      }
    );
    result.submitted = parseBridgeLine(submitResult.stdout, 'Accepted') === 'yes';
    result.submitState = parseBridgeLine(submitResult.stdout, 'State');
  } catch (error: any) {
    result.submitError = redactText(error?.stdout || error?.stderr || error?.message || String(error));
  }

  return result;
}

export async function queueRecursiveCanvas(id: string): Promise<RecursiveCanvasQueueResult> {
  throw new Error(`Standalone Canvas queueing is retired for ${id}. Use Spark Workspace recursions: ${sparkWorkspaceRecursionsUrl()}`);
}

export async function recursiveTraceView(id: string): Promise<RecursiveTraceView> {
  const snapshot = await loadSparkWorkspaceSnapshot();
  return workspaceTraceView(snapshot, resolveRecursiveSessionId(snapshot, id));
}

export async function recursiveTraceReply(id: string): Promise<string> {
  if (!sparkWorkspaceConfigured()) {
    const local = await resolveLocalRecursiveStatus(id);
    return local ? renderLocalRecursiveTrace(local) : `Recursive loop not found locally: ${id}`;
  }
  return renderRecursiveTraceView(await recursiveTraceView(id));
}

export function buildBuilderChipLoopWorkspacePayload(input: {
  workspaceId: string;
  chipKey: string;
  roundsCompleted?: number;
  totalRounds?: number;
  history?: LoopResult['history'];
  statusPath?: string;
  emittedAt?: string;
}): { payload: Record<string, unknown>; pathId: string; outcomeId: string | null } {
  const emittedAt = input.emittedAt || new Date().toISOString();
  const chipKey = input.chipKey.trim();
  const chipSlug = normalizeWorkspaceIdPart(chipKey);
  const chipLabel = labelFromKey(chipKey);
  const agentId = `agent:${input.workspaceId}`;
  const pathId = `path_builder_chip_${chipSlug}`;
  const outcomeId = `outcome_builder_chip_${chipSlug}_${compactTimestamp(emittedAt)}`;
  const roundsCompleted = input.roundsCompleted ?? input.history?.length ?? 0;
  const totalRounds = input.totalRounds ?? roundsCompleted;
  const finalRound = input.history?.slice(-1)[0] ?? null;
  const verdict = inferOutcomeVerdict(finalRound?.best_verdict, finalRound?.best_metric);
  const metricValue = typeof finalRound?.best_metric === 'number' ? finalRound.best_metric : null;
  const summary = `Builder chip loop for ${chipLabel} completed ${roundProgressPhrase(roundsCompleted, totalRounds)}.`;
  const artifactRefs = input.statusPath ? [{
    id: `artifact_builder_chip_${chipSlug}_${compactTimestamp(emittedAt)}`,
    kind: 'run_trace',
    label: `${chipLabel} chip-loop status`,
    path: input.statusPath,
    url: null,
    hash: null
  }] : [];

  return {
    pathId,
    outcomeId,
    payload: {
      workspaceId: input.workspaceId,
      agentId,
      runtimeSource: {
        kind: 'spark_researcher',
        version: 'telegram-builder-chip-loop.v1',
        loopKind: 'chip',
        sourceInstanceId: agentId,
        sourceRunId: `spark-researcher:builder-chip-loop:${chipSlug}:${emittedAt}`,
        chipKey,
        chipLabel
      },
      specialization: null,
      runtimePulse: {
        agentId,
        repoId: null,
        runtimeState: 'idle',
        passNumber: roundsCompleted,
        stageKey: 'builder_chip_loop',
        stageLabel: 'Builder Chip Loop',
        blocker: null,
        recommendation: 'Review the workspace recursion path and attach benchmark evidence before promoting reusable mastery.',
        lastUpdatedAt: emittedAt,
        intelligencePulse: null
      },
      intelligencePulse: null,
      evolutionPaths: [{
        id: pathId,
        scope: 'workspace',
        specializationId: null,
        repoId: null,
        repoLabel: 'spark-intelligence-builder',
        summary,
        status: 'open',
        assignedAgentId: agentId,
        bestOutcomeId: outcomeId,
        expiresAt: null,
        createdAt: emittedAt,
        updatedAt: emittedAt
      }],
      insights: [],
      masteries: [],
      masteryReviews: [],
      contradictions: [],
      upgrades: [],
      upgradeDeliveries: [],
      outcomes: [{
        id: outcomeId,
        targetType: 'evolution_path',
        targetId: pathId,
        evidenceLane: 'live_evidence',
        verdict,
        summary: finalRound
          ? `${summary} Final round best verdict: ${finalRound.best_verdict ?? 'unknown'}.`
          : summary,
        metricName: 'builder_chip_loop_best_metric',
        metricValue,
        context: {
          scorecard: {
            headlineLabel: 'Best metric',
            headlineValue: metricValue,
            headlineGoal: 'higher',
            modelLabel: chipLabel,
            components: metricValue === null ? [] : [{
              key: 'best_metric',
              label: 'Best metric',
              value: metricValue,
              goal: 'higher'
            }],
            details: [
              { key: 'rounds', label: 'Rounds', value: `${roundsCompleted}/${totalRounds}` },
              { key: 'suggestions', label: 'Final suggestions', value: String(finalRound?.suggestions_count ?? 0) }
            ]
          }
        },
        createdAt: emittedAt
      }],
      artifactRefs,
      emittedAt
    }
  };
}

export function buildBuilderChipLoopBridgeInput(result: LoopResult, emittedAt: string): Record<string, unknown> {
  return {
    chipKey: result.chipKey,
    roundsCompleted: result.roundsCompleted,
    totalRounds: result.totalRounds,
    history: result.history || [],
    statusPath: result.statusPath,
    emittedAt
  };
}

function looksLikeBridgeSrc(candidate: string): boolean {
  return existsSync(path.join(candidate, 'spark_swarm_bridge', 'cli.py'));
}

export function resolveSparkSwarmBridgeSrc(): string | null {
  const explicit = (process.env.SPARK_SWARM_BRIDGE_SRC || '').trim();
  if (explicit) return explicit;
  const repoOverride = (process.env.SPARK_SWARM_REPO || '').trim();
  const candidates = [
    repoOverride ? path.join(repoOverride, 'apps', 'bridge', 'src') : '',
    path.resolve(process.cwd(), '..', 'spark-swarm', 'apps', 'bridge', 'src'),
    path.join(homedir(), 'Desktop', 'spark-swarm', 'apps', 'bridge', 'src'),
    path.join(homedir(), '.spark', 'modules', 'spark-swarm', 'source', 'apps', 'bridge', 'src'),
    path.join(homedir(), '.spark', 'modules', 'spark-swarm', 'apps', 'bridge', 'src')
  ].filter(Boolean);
  return candidates.find(looksLikeBridgeSrc) || null;
}

function parseBridgeLine(stdout: string, label: string): string | null {
  const pattern = new RegExp(`^${label}:\\s*(.+)$`, 'im');
  return stdout.match(pattern)?.[1]?.trim() || null;
}

async function syncBuilderChipLoopViaBridge(
  result: LoopResult,
  config: { apiUrl?: string; workspaceId?: string; accessToken?: string }
): Promise<RecursiveWorkspaceSyncResult | null> {
  if (process.env.SPARK_SWARM_DISABLE_BRIDGE_SYNC === '1') return null;
  const emittedAt = new Date().toISOString();
  const tempDir = await mkdtemp(path.join(tmpdir(), 'spark-builder-chip-'));
  const inputPath = path.join(tempDir, 'chip-loop-result.json');
  const payloadPath = path.join(tempDir, 'collective-sync.json');
  try {
    await writeFile(inputPath, JSON.stringify(buildBuilderChipLoopBridgeInput(result, emittedAt), null, 2), 'utf-8');
  } catch (writeError) {
    await rm(tempDir, { recursive: true, force: true }).catch(() => undefined);
    throw writeError;
  }

  const python = (
    process.env.SPARK_SWARM_BRIDGE_PYTHON ||
    process.env.SPARK_BUILDER_PYTHON ||
    process.env.PYTHON ||
    'python'
  ).trim();
  const bridgeSrc = resolveSparkSwarmBridgeSrc();
  const env: NodeJS.ProcessEnv = effectiveLevel5RuntimeEnv({ ...process.env });
  if (config.apiUrl) env.SPARK_SWARM_API_URL = config.apiUrl;
  if (config.workspaceId) env.SPARK_SWARM_WORKSPACE_ID = config.workspaceId;
  if (config.accessToken) env.SPARK_SWARM_ACCESS_TOKEN = config.accessToken;
  const refreshToken = firstProcessEnvValue(SWARM_REFRESH_TOKEN_ENV_NAMES) || firstBuilderEnvValue(SWARM_REFRESH_TOKEN_ENV_NAMES);
  const authClientKey = firstProcessEnvValue(SWARM_AUTH_CLIENT_KEY_ENV_NAMES) || firstBuilderEnvValue(SWARM_AUTH_CLIENT_KEY_ENV_NAMES);
  if (refreshToken) env.SPARK_SWARM_REFRESH_TOKEN = refreshToken;
  if (authClientKey) env.SPARK_SWARM_AUTH_CLIENT_KEY = authClientKey;
  if (bridgeSrc) {
    env.PYTHONPATH = env.PYTHONPATH ? `${bridgeSrc}${path.delimiter}${env.PYTHONPATH}` : bridgeSrc;
  }

  const args = [
    '-m',
    'spark_swarm_bridge.cli',
    'builder-chip-loop',
    '--input',
    inputPath,
    '--payload',
    payloadPath,
    '--sync-collective'
  ];
  if (config.workspaceId) args.push('--workspace-id', config.workspaceId);
  if (config.apiUrl) args.push('--api-url', config.apiUrl);
  if (config.accessToken) args.push('--access-token', config.accessToken);

  let stdout: string;
  try {
    ({ stdout } = await execFileAsync(
      python,
      args,
      {
        env,
        timeout: 30000,
        windowsHide: true,
        maxBuffer: 1024 * 1024
      }
    ));
  } finally {
    // Clean the per-run scratch directory so /tmp does not grow unbounded over many syncs.
    await rm(tempDir, { recursive: true, force: true }).catch(() => undefined);
  }

  return {
    synced: true,
    pathId: parseBridgeLine(stdout, 'Path') || `path_builder_chip_${normalizeWorkspaceIdPart(result.chipKey || 'chip')}`,
    outcomeId: parseBridgeLine(stdout, 'Outcome'),
    detail: 'Builder chip loop synced through Spark Swarm bridge.',
    workspaceUrl: sparkWorkspaceRecursionsUrl()
  };
}

export async function syncBuilderChipLoopToWorkspace(result: LoopResult): Promise<RecursiveWorkspaceSyncResult> {
  if (!result.ok || !result.chipKey) {
    throw new Error('Builder chip loop did not complete successfully; no Workspace payload was synced.');
  }
  try {
    const bridgeSync = await syncBuilderChipLoopViaBridge(result, sparkWorkspaceBridgeHints());
    if (bridgeSync) return bridgeSync;
  } catch {
    // Keep Telegram usable while the local bridge command rolls out across operator machines.
  }

  const config = sparkWorkspaceConfig();
  const built = buildBuilderChipLoopWorkspacePayload({
    workspaceId: config.workspaceId,
    chipKey: result.chipKey,
    roundsCompleted: result.roundsCompleted,
    totalRounds: result.totalRounds,
    history: result.history,
    statusPath: result.statusPath
  });
  await axios.post(
    `${config.apiUrl}/api/workspaces/${encodeURIComponent(config.workspaceId)}/collective/sync`,
    built.payload,
    {
      timeout: 15000,
      headers: {
        Authorization: `Bearer ${config.accessToken}`
      }
    }
  );
  return {
    synced: true,
    pathId: built.pathId,
    outcomeId: built.outcomeId,
    detail: 'Builder chip loop synced into Spark Workspace.',
    workspaceUrl: sparkWorkspaceRecursionsUrl()
  };
}

export function renderBuilderChipLoopCompletion(
  result: LoopResult,
  sync: RecursiveWorkspaceSyncResult | null = null,
  syncError: string | null = null
): string {
  const chipKey = result.chipKey || 'unknown-chip';
  const finalRound = result.history?.slice(-1)[0] ?? null;
  const completed = result.roundsCompleted ?? result.history?.length ?? 0;
  const total = result.totalRounds ?? result.roundsCompleted ?? result.history?.length ?? 0;
  const verdict = finalRound
    ? finalRound.best_verdict || inferOutcomeVerdict(finalRound.best_verdict, finalRound.best_metric)
    : 'no rounds recorded';
  const label = labelFromKey(chipKey);
  const lines = [
    loopCompletionHeadline(label, completed, total, verdict),
    '',
    loopCandidateSignalSentence(finalRound, label),
    '',
    loopProofBoundarySentence(verdict)
  ];

  if (sync) {
    lines.push(
      '',
      sync.synced
        ? `Workspace is updated: ${sync.workspaceUrl}`
        : `Workspace update skipped: ${sync.workspaceUrl}`
    );
  } else if (syncError) {
    lines.push('', `Workspace update skipped: ${truncateAtWord(syncError, 120)}`);
  } else if (!String(verdict || '').toLowerCase().includes('defer')) {
    lines.push('', 'Saved locally and kept private.');
  }

  lines.push(
    '',
    'To open the private draft, send:',
    readableReportCommand(chipKey),
    'This only opens the private draft.',
    '',
    'After you read it, you can ignore it, ask for changes, or ask me to run another review.'
  );
  return lines.join('\n');
}

export function renderSpecializationPathLoopCompletion(result: PathLoopResult): string {
  const pathKey = result.pathKey || 'unknown-path';
  const pathId = result.pathId || `path_${normalizeWorkspaceIdPart(pathKey)}`;
  const label = labelFromKey(pathKey);
  const verdict = result.verdict || 'recorded';
  const metricLine = result.metricName && typeof result.metricValue === 'number'
    ? `${formatMetricLabel(result.metricName)} ${formatNumber(result.metricValue)}`
    : null;
  const lines = [
    `${outcomeStatusIcon(verdict)} Latest ${label} run ${friendlyOutcomeVerb(verdict)}.`,
    '',
    'Score',
    `• ${result.roundsCompleted ?? 0}/${result.totalRounds ?? result.roundsCompleted ?? 0} rounds`
  ];

  if (metricLine) lines.push(`• ${metricLine}`);

  if (result.workspaceSynced) {
    lines.push(
      '',
      'Workspace',
      '• updated',
      `• ${sparkWorkspaceRecursionsUrl()}`
    );
  } else {
    lines.push('', 'Local', '• saved on this machine');
  }

  lines.push('', 'Report', `• /recursive report ${pathId}`, `• /recursive trace ${pathId}`);
  return lines.join('\n');
}

function loopDecisionIcon(decision: string | null | undefined): string {
  if (decision === 'improved') return '🟢';
  if (decision === 'regressed') return '🔴';
  if (decision === 'held_steady') return '⚪';
  return '🟡';
}

function friendlyLoopDecision(decision: string | null | undefined): string {
  if (decision === 'improved') return 'has benchmark-backed improvement evidence';
  if (decision === 'regressed') return 'has regression evidence';
  if (decision === 'held_steady') return 'held steady';
  return 'is not proven improved yet';
}

function friendlyProofStatus(value: string | null | undefined): string {
  return String(value || 'unknown').replace(/[_-]+/g, ' ').trim().toLowerCase() || 'unknown';
}

export function renderSpecializationLoopStatus(
  status: SpecializationLoopStatus,
  options: { style?: 'card' | 'conversational' } = {}
): string {
  const label = status.pathLabel || labelFromKey(status.pathKey || 'specialization path');
  if (status.ok === false) {
    return [
      `⚠️ I could not read ${label} loop status yet.`,
      '',
      'Why',
      `• ${status.error || 'status packet unavailable'}`,
    ].join('\n');
  }

  const decision = status.decision || 'unproven';
  const comparison = status.comparison;
  const rounds = status.rounds;
  const metricLine = comparison && typeof comparison.baselineScore === 'number' && typeof comparison.candidateScore === 'number'
    ? `${formatMetricLabel(comparison.scoreMetric || 'score')} ${formatNumber(comparison.baselineScore)} → ${formatNumber(comparison.candidateScore)}`
    : null;
  const heldOut = status.heldOutStatus ? labelFromKey(status.heldOutStatus) : null;
  const trap = status.trapStatus ? labelFromKey(status.trapStatus) : null;

  if (options.style === 'conversational') {
    const scorePhrase = comparison && typeof comparison.baselineScore === 'number' && typeof comparison.candidateScore === 'number'
      ? ` ${sentenceCaseFirst(formatMetricLabel(comparison.scoreMetric || 'score'))} moved from ${formatNumber(comparison.baselineScore)} to ${formatNumber(comparison.candidateScore)}.`
      : '';
    const proofPhrase = heldOut || trap
      ? /not configured/i.test(heldOut || '') && /not configured/i.test(trap || '')
        ? ' Held-out and trap checks are not configured yet.'
        : /passed/i.test(heldOut || '') && /passed/i.test(trap || '')
          ? ' Held-out and trap checks both passed.'
          : ` Held-out is ${heldOut || 'unknown'}, and trap is ${trap || 'unknown'}.`
      : '';
    const nextMove = status.nextMove
      ? ` I'd ${ensureSentence(status.nextMove).replace(/\.$/, '').replace(/^(Run|Review|Complete|Try|Keep|Inspect|Package)\b/, (match) => match.toLowerCase())}.`
      : '';

    if (decision === 'improved') {
      return `${label} has benchmark-backed improvement evidence.${scorePhrase}${proofPhrase}${nextMove}`.trim();
    }
    if (decision === 'regressed') {
      return `${label} looks regressed from the current evidence.${scorePhrase}${proofPhrase}${nextMove}`.trim();
    }
    if (decision === 'held_steady') {
      return `${label} held steady in the latest proof I can read.${scorePhrase}${proofPhrase}${nextMove}`.trim();
    }

    const missing = status.claimBoundary
      ? ensureSentence(status.claimBoundary)
      : 'I do not have the completed baseline, candidate, comparison, and held-out/trap proof yet.';
    return `${label} is not proven improved yet. ${missing}${proofPhrase} I would not call it better from this evidence yet.${nextMove}`.trim();
  }

  const lines = [
    `${loopDecisionIcon(decision)} ${label} ${friendlyLoopDecision(decision)}.`,
    '',
    'State',
    `• ${labelFromKey(status.stage || 'unknown')}`,
    `• evidence: ${labelFromKey(status.evidenceState || 'unknown')}`,
  ];
  if (rounds && (typeof rounds.completed === 'number' || typeof rounds.requested === 'number')) {
    lines.push(`• rounds: ${rounds.completed ?? 0}/${rounds.requested ?? rounds.completed ?? 0}`);
  }
  if (metricLine) lines.push('', 'Score', `• ${metricLine}`);
  if (status.heldOutStatus || status.trapStatus) {
    lines.push(
      '',
      'Proof checks',
      `• held-out: ${labelFromKey(status.heldOutStatus || 'unknown')}`,
      `• trap: ${labelFromKey(status.trapStatus || 'unknown')}`
    );
  }
  if (status.claimBoundary) {
    lines.push('', 'Boundary', `• ${ensureSentence(status.claimBoundary)}`);
  }
  if (status.nextMove) {
    lines.push('', 'Move', `• ${ensureSentence(status.nextMove)}`);
  }
  return lines.join('\n');
}

function compactCandidateSummary(summary: string): string {
  return summary
    .replace(/^YC doctrine stack \([^)]*\):\s*/i, '')
    .replace(/^primary=/i, '')
    .replace(/\s*\(packet [^)]+\)\.?$/i, '')
    .trim();
}

export function renderSpecializationLoopInsights(insights: SpecializationLoopInsights): string {
  const label = insights.pathLabel || labelFromKey(insights.pathKey || 'specialization path');
  if (!insights.ok) {
    if (insights.status) return renderSpecializationLoopStatus(insights.status);
    return `I could not read the latest ${label} loop yet. ${ensureSentence(insights.error || 'No session summary is available.')}`;
  }

  const start = typeof insights.startScore === 'number' ? insights.startScore : null;
  const current = typeof insights.currentScore === 'number' ? insights.currentScore : null;
  const best = typeof insights.bestScore === 'number' ? insights.bestScore : current;
  const improved = typeof start === 'number' && typeof best === 'number' && best > start + 0.0001;
  const headline = improved
    ? `${label} found a small benchmark-backed gain, but I would still keep it in review.`
    : `${label} explored the loop, but I would not call it improved yet.`;

  const lines = [
    headline,
    '',
    'Score',
    `• ${insights.completedRounds ?? 0}/${insights.requestedRounds ?? insights.completedRounds ?? 0} rounds`,
  ];
  if (typeof start === 'number' && typeof current === 'number') {
    lines.push(`• active score ${formatNumber(start)} → ${formatNumber(current)}`);
  } else if (typeof current === 'number') {
    lines.push(`• active score ${formatNumber(current)}`);
  }
  if (typeof insights.keptRounds === 'number' || typeof insights.revertedRounds === 'number') {
    lines.push(`• ${insights.keptRounds ?? 0} kept, ${insights.revertedRounds ?? 0} reverted`);
  }

  const kept = (insights.keptCandidateSummaries || [])
    .map(compactCandidateSummary)
    .filter(Boolean)
    .slice(0, 3);
  if (kept.length > 0) {
    lines.push('', 'What stuck', ...kept.map((item) => `• ${ensureSentence(item)}`));
  }

  const nextMove = improved
    ? 'Add held-out/trap checks before calling this a real specialization upgrade.'
    : 'Try a narrower candidate and inspect the weak benchmark lanes.';
  lines.push('', 'Move', `• ${nextMove}`);
  return lines.join('\n');
}

function formatSignedDelta(value: number): string {
  const formatted = formatNumber(Math.abs(value));
  if (value > 0) return `+${formatted}`;
  if (value < 0) return `-${formatted}`;
  return '0';
}

function numericComparison(status: SpecializationLoopStatus): {
  baseline: number | null;
  candidate: number | null;
  delta: number | null;
  metric: string;
} {
  const comparison = status.comparison || {};
  const baseline = typeof comparison.baselineScore === 'number' ? comparison.baselineScore : null;
  const candidate = typeof comparison.candidateScore === 'number' ? comparison.candidateScore : null;
  const delta = typeof comparison.delta === 'number'
    ? comparison.delta
    : typeof baseline === 'number' && typeof candidate === 'number'
      ? candidate - baseline
      : null;
  return {
    baseline,
    candidate,
    delta,
    metric: formatMetricLabel(comparison.scoreMetric || 'score')
  };
}

export function renderSpecializationLoopComparison(status: SpecializationLoopStatus): string {
  const label = status.pathLabel || labelFromKey(status.pathKey || 'specialization path');
  if (status.ok === false) {
    return `I could not compare the latest ${label} loop yet. ${ensureSentence(status.error || 'Status packet unavailable.')}`;
  }

  const { baseline, candidate, delta, metric } = numericComparison(status);
  const decision = status.decision || 'unproven';
  const headline = decision === 'improved'
    ? `${label} has a benchmark-backed candidate gain in the latest status packet.`
    : decision === 'regressed'
      ? `${label}'s latest candidate regressed, so I would keep the upgrade blocked.`
      : decision === 'held_steady'
        ? `${label} held steady in the canonical loop status. The latest candidate did not stick.`
        : `${label} is still unproven in the canonical loop status.`;

  const lines = [
    headline,
    '',
    'Compare',
  ];
  if (typeof baseline === 'number') lines.push(`• baseline ${formatNumber(baseline)}`);
  if (typeof candidate === 'number') lines.push(`• candidate ${formatNumber(candidate)}${typeof delta === 'number' ? ` (${formatSignedDelta(delta)})` : ''}`);
  if (metric && (typeof baseline === 'number' || typeof candidate === 'number')) lines.push(`• metric ${metric}`);
  lines.push(
    '',
    'Loop',
    `• ${status.rounds?.completed ?? 0}/${status.rounds?.requested ?? status.rounds?.completed ?? 0} rounds`,
    `• ${status.rounds?.kept ?? 0} kept, ${status.rounds?.reverted ?? 0} reverted`,
    '',
    'Move',
    `• ${ensureSentence(status.nextMove || 'Use the status packet before making an improvement claim.')}`
  );
  return lines.join('\n');
}

export function renderSpecializationLoopEvidence(status: SpecializationLoopStatus): string {
  const label = status.pathLabel || labelFromKey(status.pathKey || 'specialization path');
  if (status.ok === false) {
    return `I could not read the latest ${label} evidence yet. ${ensureSentence(status.error || 'Status packet unavailable.')}`;
  }

  const decision = status.decision || 'unproven';
  const hasImprovementClaim = decision === 'improved';
  const lines = [
    hasImprovementClaim
      ? `${label} has benchmark-backed evidence for an improvement claim.`
      : `${label} has benchmark evidence, but I would not call it upgraded yet.`,
    '',
    'Evidence',
    `• ${status.rounds?.completed ?? 0}/${status.rounds?.requested ?? status.rounds?.completed ?? 0} rounds completed`,
    `• ${status.rounds?.kept ?? 0} candidate${(status.rounds?.kept ?? 0) === 1 ? '' : 's'} kept`,
    `• ${status.rounds?.reverted ?? 0} candidate${(status.rounds?.reverted ?? 0) === 1 ? '' : 's'} reverted`,
  ];

  lines.push(
    '',
    'Proof checks',
    `• held-out: ${friendlyProofStatus(status.heldOutStatus)}`,
    `• trap: ${friendlyProofStatus(status.trapStatus)}`
  );

  lines.push(
    '',
    'Boundary',
    `• ${ensureSentence(status.claimBoundary || (hasImprovementClaim ? 'Improvement still needs review before reuse.' : 'Useful run history, but not proof of improvement yet.'))}`
  );
  return lines.join('\n');
}

export function renderSpecializationLoopPackage(result: SpecializationLoopPackageResult): string {
  const packet = result.packet || {};
  const pathInfo = packet.path || {};
  const claim = packet.claim || {};
  const benchmark = packet.benchmark || {};
  const publication = packet.publication || {};
  const reusable = packet.reusableTemplateCandidate || {};
  const label = pathInfo.pathLabel || labelFromKey(pathInfo.pathKey || result.pathKey || 'specialization path');

  if (!result.ok) {
    return [
      `⚠️ I could not package ${label} yet.`,
      '',
      'Why',
      `• ${result.error || 'local package command did not return a saved packet'}`,
    ].join('\n');
  }

  const comparison = benchmark.comparison;
  const metricLine = comparison && typeof comparison.baselineScore === 'number' && typeof comparison.candidateScore === 'number'
    ? `${formatMetricLabel(comparison.scoreMetric || 'score')} ${formatNumber(comparison.baselineScore)} → ${formatNumber(comparison.candidateScore)}`
    : null;
  const decision = String(claim.decision || 'unproven');
  const claimState = String(claim.state || '');
  const isBenchmarkBacked = decision === 'improved' && claimState === 'benchmark_backed_candidate';
  const heldOut = labelFromKey(benchmark.heldOutStatus || 'unknown').toLowerCase();
  const trap = labelFromKey(benchmark.trapStatus || 'unknown').toLowerCase();
  const proofCheckLine = benchmark.heldOutStatus || benchmark.trapStatus
    ? heldOut === 'passed' && trap === 'passed'
      ? 'with held-out and trap checks both passed'
      : `with held-out ${heldOut}, trap ${trap}`
    : null;
  const proofBits = [
    isBenchmarkBacked ? 'benchmark-backed improvement' : labelFromKey(decision),
    metricLine,
    proofCheckLine
  ].filter(Boolean);
  const templateLine = reusable.eligible
    ? 'It is ready for private template review.'
    : 'I would keep it private until the proof is complete.';
  const boundary = publication.published
    ? 'It is marked published, so review the packet before sharing it further.'
    : 'Nothing was published or shared.';
  const nextMove = claim.nextMove ? ` ${ensureSentence(claim.nextMove)}` : '';
  return [
    `✨ I packaged ${label}'s ${isBenchmarkBacked ? 'proof' : 'current evidence'} locally. ${boundary}`,
    '',
    `${sentenceCaseFirst(proofBits.join(': ').replace(': with ', ', with '))}. ${templateLine}${nextMove}`,
  ].join('\n');
}

export function renderRecursiveArtifactSyncCompletion(result: RecursiveWorkspaceSyncResult): string {
  const lines = [
    `${result.synced ? '🟢' : '🟡'} Recursive artifact sync finished.`,
    '',
    'Workspace',
    result.synced ? '• updated' : '• update skipped'
  ];
  lines.push(
    `• ${result.workspaceUrl}`,
    '',
    'Report',
    `• /recursive report ${result.pathId}`,
    `• /recursive trace ${result.pathId}`
  );
  return lines.join('\n');
}

function friendlyProposalGate(gate: string): string {
  const normalized = gate.trim();
  const labels: Record<string, string> = {
    benchmarkEvidence: 'add benchmark proof',
    replayCommand: 'replay step',
    riskNotes: 'review note',
    sourceProvenance: 'source proof',
    schemaValidation: 'schema check'
  };
  return labels[normalized] || labelFromKey(normalized);
}

export function renderRecursiveNetworkProposal(result: RecursiveNetworkProposalResult): string {
  const ready = result.readyForPr && result.missingGates.length === 0;
  const title = result.title ? labelFromKey(result.title) : 'Review packet';
  const isSent = result.submitted;
  const subject = result.title ? title : 'Review packet';
  const lines = [
    isSent
      ? `${ready ? '🟢' : '🟡'} ${subject} sent for review.`
      : `${ready ? '🟢' : '🟡'} ${subject} is ready for review.`,
    '',
    'Status',
    ready ? '• ready for a human reviewer' : '• private for now'
  ];
  if (result.missingGates.length > 0) {
    lines.push('', 'Before sharing', ...result.missingGates.map((gate) => `• ${friendlyProposalGate(gate)}`));
  }
  lines.push('', 'Workspace', result.proposalPath ? '• saved locally' : '• not saved');
  if (isSent) {
    if (result.submitted && result.submitState) lines.push(`• review state: ${labelFromKey(result.submitState)}`);
    lines.push(result.submitError ? `• ${result.submitError}` : `• ${sparkWorkspaceDecisionsUrl()}`);
  } else if (result.submitError) {
    lines.push('', 'Submit', `• ${result.submitError}`);
  }
  return lines.join('\n');
}

export function renderRecursiveHelp(): string {
  const lines = [
    'Spark Recursive Loops',
    '',
    'Start here:',
    '/recursive sessions - recent loops and next action',
    '/recursive status <path> - proof-backed loop state',
    '/recursive compare <path> - baseline vs candidate evidence',
    '/recursive evidence <path> - latest proof readout',
    '/recursive package <path> - save a local/private insight packet',
    '/recursive report <id> - readable result summary',
    '/recursive start <targetKey> rounds <n> - run an attached specialization path, with Builder chip fallback',
    '',
    'When something needs you:',
    '/recursive review [id] - decisions waiting',
    '/recursive approve <id> [rationale]',
    '/recursive defer <id> <rationale>',
    '/recursive reject <id> <rationale>',
    '/recursive more-eval <id> <rationale>',
    '',
    'Deep cuts:',
    '/recursive paths - specialization lanes',
    '/recursive trace <id> - detailed timeline',
    '/recursive propose <chip-or-path-name> [submit]',
    '/recursive sync prompt-benchmark <runJson> [report <reportPath>]',
    '/recursive sync domain-chip-lab <telemetryJson> <chipKey> [chip-path <path>] [packet <path>]',
    '/recursive sync domain-autoloop <manifestJson> <stateJson> [policy <path>] [journal <path>] [lane-report <path>]',
  ];
  if (sparkWorkspaceConfigured()) {
    lines.push('', `Open: Recursions ${sparkWorkspaceRecursionsUrl()}`);
  } else {
    lines.push('', 'Local mode: reports come from status files on this machine. Workspace sync appears when connected.');
  }
  return lines.join('\n');
}

export function renderRecursiveSessions(sessions: RecursiveSessionListItem[]): string {
  if (sessions.length === 0) return 'No recursive sessions found.';
  const ordered = orderedRecursiveSessions(sessions);
  const visible = ordered.slice(0, 5);
  const isLocalOnly = sessions.every((session) => session.source_kind === 'local_builder_chip_loop');
  const lines = ['Spark recursive loops'];
  let currentGroup: string | null = null;
  for (const session of visible) {
    const group = session.review_required ? 'Needs review' : 'Clear';
    if (group !== currentGroup) {
      lines.push('', group);
      currentGroup = group;
    } else {
      lines.push('');
    }
    const icon = session.review_required ? '🟡' : '⚪';
    const status = session.status && session.status !== 'open' ? ` · ${labelFromKey(session.status)}` : '';
    lines.push(`${icon} ${sessionDisplayTitle(session)}${status}`);
  }
  if (sessions.length > visible.length) lines.push('', `${sessions.length - visible.length} more hidden. Use /recursive paths for lanes.`);
  const firstTitle = visible[0] ? sessionDisplayTitle(visible[0]) : null;
  if (firstTitle) lines.push('', `Ask: show ${firstTitle} report.`);
  if (!isLocalOnly) {
    lines.push('', 'Workspace', sparkWorkspaceRecursionsUrl());
  } else {
    lines.push('', 'Local', 'status files on this machine');
  }
  return lines.join('\n');
}

export function orderedRecursiveSessions(sessions: RecursiveSessionListItem[]): RecursiveSessionListItem[] {
  return sessions
    .slice()
    .sort((a, b) =>
      Number(b.review_required) - Number(a.review_required) ||
      String(b.updated_at || '').localeCompare(String(a.updated_at || ''))
    );
}

export function renderRecursivePaths(sessions: RecursiveSessionListItem[]): string {
  const isLocalOnly = sessions.length > 0 && sessions.every((session) => session.source_kind === 'local_builder_chip_loop');
  const pathGroups = new Map<string, RecursiveSessionListItem[]>();
  for (const session of sessions) {
    const domain = session.domain || labelFromKey(session.source_kind);
    const group = pathGroups.get(domain) ?? [];
    group.push(session);
    pathGroups.set(domain, group);
  }
  const summaries = [...pathGroups.entries()].map(([domain, group]) => {
    const latest = group
      .slice()
      .sort((a, b) => String(b.updated_at || '').localeCompare(String(a.updated_at || '')))[0];
    return {
      domain,
      latest,
      reviewCount: group.filter((session) => session.review_required).length
    };
  }).sort((a, b) =>
    b.reviewCount - a.reviewCount ||
    String(b.latest?.updated_at || '').localeCompare(String(a.latest?.updated_at || '')) ||
    a.domain.localeCompare(b.domain)
  );
  const domains = summaries.map((summary) => summary.domain);
  if (domains.length === 0) return 'No recursive paths found yet.';
  const lines = ['Spark recursive paths'];
  for (const domain of domains.slice(0, 8)) {
    const group = pathGroups.get(domain) ?? [];
    const reviewCount = group.filter((session) => session.review_required).length;
    const icon = reviewCount > 0 ? '🟡' : '⚪';
    const review = reviewCount > 0 ? `${pluralize(reviewCount, 'loop')} need review` : 'clear';
    lines.push('', `${icon} ${labelFromKey(domain)}`, `${pluralize(group.length, 'loop')} · ${review}`);
  }
  if (domains.length > 8) {
    lines.push('', isLocalOnly
      ? `${domains.length - 8} more paths hidden. Use /recursive sessions for the latest loops.`
      : `${domains.length - 8} more paths hidden. Open Workspace for the full list.`);
  }
  lines.push('', 'Pick a path by name.');
  if (!isLocalOnly) lines.push('', 'Workspace', sparkWorkspaceRecursionsUrl());
  return lines.join('\n');
}

export function renderRecursiveReviewCandidates(candidates: RecursiveReviewCandidate[]): string {
  if (candidates.length === 0) return 'No recursive candidates need review.';
  const lines = ['Spark decisions needing review'];
  const visible = candidates.slice(0, 5);
  for (const candidate of visible) {
    lines.push(
      '',
      `🟡 ${reviewCandidateTitle(candidate)}`,
      `${plainLabel(candidate.risk)} risk`,
      ...(candidate.score_delta === null ? [] : [`score change ${formatDelta(candidate.score_delta)}`]),
      ensureSentence(truncateAtWord(candidate.reason, 96)),
      `review: /recursive review ${candidate.session_id}`
    );
  }
  if (candidates.length > visible.length) lines.push('', `${candidates.length - visible.length} more in Workspace.`);
  lines.push('', 'Workspace', sparkWorkspaceDecisionsUrl());
  return lines.join('\n');
}

function reviewCandidateTitle(candidate: RecursiveReviewCandidate): string {
  const title = sessionTitleLabel(candidate.title || '');
  if (title && !/^creator mission$/i.test(title)) return title;
  if (candidate.domain) return labelFromKey(candidate.domain);
  return labelFromKey(candidate.session_id);
}

function plainLabel(value: string | null | undefined): string {
  return (value || 'unknown').replace(/[_-]+/g, ' ').trim();
}

function decisionStatusIcon(decision: RecursiveDecision): string {
  if (decision === 'approve_local') return '🟢';
  if (decision === 'request_more_eval' || decision === 'defer') return '🟡';
  if (decision === 'reject') return '🔴';
  return '⚪';
}

export function renderRecursiveDecision(record: RecursiveDecisionRecord): string {
  const applied = record.effect === 'spark_workspace_review';
  const action = friendlyDecisionLabel(record.decision);
  const lines = [
    `${decisionStatusIcon(record.decision)} Recursive review ${action}.`,
    '',
    'Result',
    applied ? '• Workspace review updated.' : '• Telegram recorded the decision route.'
  ];
  if (record.workspace_detail) {
    lines.push(`• ${ensureSentence(truncateAtWord(friendlyWorkspaceDecisionDetail(record.workspace_detail), 140))}`);
  }
  lines.push('', 'Workspace', `• ${sparkWorkspaceDecisionsUrl()}`);
  return lines.join('\n');
}

export function renderRecursivePromotionPacket(packet: RecursivePromotionPacket): string {
  return [
    '🟡 Local promotion packet staged.',
    '',
    'Status',
    '• private only',
    '• not shared with the network',
    '',
    'Safety',
    '• No memory, Swarm, Builder, or source artifacts were changed.'
  ].join('\n');
}

export function renderRecursiveSwarmPacket(packet: RecursiveSwarmPacket): string {
  return [
    '🟡 Swarm review packet staged.',
    '',
    'Status',
    '• private until review passes',
    '• network sharing blocked',
    '',
    'Why',
    `• ${ensureSentence(sentenceCaseFirst(labelFromKey(packet.publication_gate.reason).toLowerCase()))}`,
    '',
    'Safety',
    '• No network publication, memory mutation, Builder absorption, or source artifacts were changed.'
  ].join('\n');
}

export function renderRecursiveCanvasQueue(result: RecursiveCanvasQueueResult): string {
  return [
    '🟡 Recursive Canvas is ready.',
    '',
    'Canvas',
    `• ${result.canvasUrl}`,
    '',
    'Plan',
    `• ${pluralize(result.load.nodes.length, 'node')}`,
    '• inspect only'
  ].join('\n');
}

export function renderRecursiveTraceView(trace: RecursiveTraceView): string {
  const canvas = trace.spawner.canvas_queue;
  const timeline = dedupeRenderedTraceLines(trace.timeline.slice(-6).map(formatTraceTimelineItem));
  const statusLines = [
    shouldShowTraceStatus(trace.status) ? friendlyTraceStatus(trace.status) : null,
    canvas.pending ? 'canvas pending' : null
  ].filter((line): line is string => Boolean(line));
  return [
    `${traceDisplayTitle(trace)} trace`,
    trace.review.required ? '' : null,
    trace.review.required ? 'Review' : null,
    trace.review.required ? `${pluralize(trace.review.decisions.length, 'decision')} waiting` : null,
    statusLines.length > 0 ? '' : null,
    statusLines.length > 0 ? 'Status' : null,
    ...statusLines,
    '',
    ...(timeline.length > 0 ? timeline : ['- no timeline events']),
    '',
    'Workspace',
    sparkWorkspaceRecursionsUrl(),
    trace.review.required ? sparkWorkspaceDecisionsUrl() : null
  ].filter((line): line is string => line !== null).join('\n');
}

function shouldShowTraceStatus(status: string): boolean {
  return !/^(open|unknown|workspace)$/i.test((status || '').trim());
}

function friendlyTraceStatus(status: string): string {
  const normalized = (status || '').trim().toLowerCase();
  if (normalized === 'completed' || normalized === 'complete') return 'completed';
  if (normalized === 'failed') return 'failed';
  if (normalized === 'paused') return 'paused';
  return normalized.replace(/[_-]+/g, ' ') || status;
}

function dedupeRenderedTraceLines(lines: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const line of lines) {
    const key = line.replace(/\s+/g, ' ').trim().toLowerCase();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    result.push(line);
  }
  return result;
}

function decisionForAction(action: 'approve' | 'defer' | 'reject' | 'more-eval'): RecursiveDecision {
  if (action === 'approve') return 'approve_local';
  if (action === 'more-eval') return 'request_more_eval';
  return action;
}

function workspaceDecisionForAction(action: 'approve' | 'defer' | 'reject' | 'more-eval'): 'approve' | 'defer' | 'reject' {
  if (action === 'approve') return 'approve';
  if (action === 'reject') return 'reject';
  return 'defer';
}

function parseRounds(parts: string[]): number {
  const roundIndex = parts.findIndex((part) => part.toLowerCase() === 'rounds');
  const raw = roundIndex >= 0 ? parts[roundIndex + 1] : parts[0];
  return Math.max(1, Math.min(50, Number.parseInt(raw || '3', 10) || 3));
}

function normalizeRecursiveArtifactSyncKind(value: string | undefined): RecursiveArtifactSyncKind | null {
  const normalized = (value || '').toLowerCase().replace(/_/g, '-');
  if (normalized === 'prompt-benchmark' || normalized === 'benchmark') return 'prompt-benchmark';
  if (normalized === 'domain-chip-lab' || normalized === 'domain-chip-lab-loop' || normalized === 'chip-lab') return 'domain-chip-lab';
  if (normalized === 'domain-autoloop' || normalized === 'autoloop') return 'domain-autoloop';
  return null;
}

function optionValue(tokens: string[], names: string[]): string | null {
  const normalizedNames = new Set(names.map((name) => name.toLowerCase()));
  for (let index = 0; index < tokens.length - 1; index += 1) {
    if (normalizedNames.has(tokens[index].toLowerCase())) return tokens[index + 1];
  }
  return null;
}

function repeatedOptionValues(tokens: string[], names: string[]): string[] {
  const normalizedNames = new Set(names.map((name) => name.toLowerCase()));
  const values: string[] = [];
  for (let index = 0; index < tokens.length - 1; index += 1) {
    if (normalizedNames.has(tokens[index].toLowerCase())) values.push(tokens[index + 1]);
  }
  return values;
}

function positionalTokens(tokens: string[]): string[] {
  const optionNames = new Set([
    'report',
    'report-path',
    '--report-path',
    'chip-key',
    '--chip-key',
    'chip-path',
    '--chip-path',
    'packet',
    '--packet',
    'policy',
    '--policy',
    'journal',
    '--journal',
    'lane-report',
    '--lane-report'
  ]);
  const values: string[] = [];
  for (let index = 0; index < tokens.length; index += 1) {
    const token = tokens[index];
    if (optionNames.has(token.toLowerCase()) && index < tokens.length - 1) {
      index += 1;
      continue;
    }
    values.push(token);
  }
  return values;
}

export function buildRecursiveArtifactBridgeArgs(
  input: RecursiveArtifactSyncInput,
  options: {
    payloadPath: string;
    apiUrl?: string;
    workspaceId?: string;
    accessToken?: string;
  }
): string[] {
  const positionals = positionalTokens(input.args);
  const args = ['-m', 'spark_swarm_bridge.cli'];

  if (input.kind === 'prompt-benchmark') {
    const runJson = positionals[0];
    if (!runJson) throw new Error('Usage: /recursive sync prompt-benchmark <runJson> [report <reportPath>]');
    args.push('prompt-benchmark', '--input', runJson);
    const reportPath = optionValue(input.args, ['report', 'report-path', '--report-path']);
    if (reportPath) args.push('--report-path', reportPath);
  } else if (input.kind === 'domain-chip-lab') {
    const telemetryJson = positionals[0];
    const chipKey = optionValue(input.args, ['chip-key', '--chip-key']) || positionals[1];
    if (!telemetryJson || !chipKey) {
      throw new Error('Usage: /recursive sync domain-chip-lab <telemetryJson> <chipKey> [chip-path <path>] [packet <path>]');
    }
    args.push('domain-chip-lab-loop', '--telemetry', telemetryJson, '--chip-key', chipKey);
    const chipPath = optionValue(input.args, ['chip-path', '--chip-path']);
    if (chipPath) args.push('--chip-path', chipPath);
    for (const packet of repeatedOptionValues(input.args, ['packet', '--packet'])) args.push('--packet', packet);
  } else {
    const manifestJson = positionals[0];
    const stateJson = positionals[1];
    if (!manifestJson || !stateJson) {
      throw new Error('Usage: /recursive sync domain-autoloop <manifestJson> <stateJson> [policy <path>] [journal <path>] [lane-report <path>]');
    }
    args.push('domain-autoloop', '--manifest', manifestJson, '--state', stateJson);
    const policyPath = optionValue(input.args, ['policy', '--policy']);
    const journalPath = optionValue(input.args, ['journal', '--journal']);
    if (policyPath) args.push('--policy', policyPath);
    if (journalPath) args.push('--journal', journalPath);
    for (const laneReport of repeatedOptionValues(input.args, ['lane-report', '--lane-report'])) args.push('--lane-report', laneReport);
  }

  args.push('--payload', options.payloadPath, '--sync-collective');
  if (options.workspaceId) args.push('--workspace-id', options.workspaceId);
  if (options.apiUrl) args.push('--api-url', options.apiUrl);
  if (options.accessToken) args.push('--access-token', options.accessToken);
  return args;
}

function truncate(value: string, limit: number): string {
  const clean = normalizeKnownAcronyms(value.replace(/\s+/g, ' ').trim());
  return clean.length <= limit ? clean : `${clean.slice(0, limit - 3).trim()}...`;
}

function formatBestSignal(value: string): string {
  const clean = formatOutcomeSummary(value);
  const firstSentence = /^(.+?[.!?])(?:\s|$)/.exec(clean)?.[1];
  return truncateAtWord(firstSentence || clean, 180);
}

function hasSameDisplayedImprovement(value: string | null | undefined): boolean {
  if (!value) return false;
  const number = '-?\\d+(?:\\.\\d+)?';
  return new RegExp(`\\b(?:improved|improving)\\b[\\s\\S]*?\\bfrom\\s+(${number})\\s+to\\s+\\1\\b`, 'i').test(value);
}

function formatOutcomeSummary(value: string): string {
  let clean = value.replace(/\s+/g, ' ').trim();
  const number = '-?\\d+(?:\\.\\d+)?';
  const direct = new RegExp(`^(.+?)\\s+improved\\s+from\\s+(${number})\\s+to\\s+\\2(.*)$`, 'i');
  clean = clean.replace(direct, (_match, prefix: string, score: string, suffix: string) => (
    `${prefix} registered a tiny improvement${suffix} (score still rounds to ${score}).`
  ));
  const inline = new RegExp(`,?\\s+improving\\s+[A-Za-z0-9_:/ -]+\\s+from\\s+(${number})\\s+to\\s+\\1\\.?`, 'i');
  clean = clean.replace(inline, (_match, score: string) => `; score still rounds to ${score}.`);
  return clean;
}

function formatMasteryLine(mastery: SparkWorkspaceMastery): string {
  const summary = sentenceCaseFirst(formatBestSignal(mastery.summary).replace(/\bmastery candidate\b/i, 'candidate'));
  const evidence = formatMasteryEvidence(mastery);
  return `Mastery: ${ensureSentence(summary)}${evidence ? ` ${evidence}` : ''}`;
}

function formatUpdatedAt(value: string | null | undefined): string {
  if (!value) return 'unknown';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  const month = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][date.getUTCMonth()];
  const hour = String(date.getUTCHours()).padStart(2, '0');
  const minute = String(date.getUTCMinutes()).padStart(2, '0');
  return `${month} ${date.getUTCDate()}, ${date.getUTCFullYear()}, ${hour}:${minute} UTC`;
}

function formatMasteryEvidence(mastery: SparkWorkspaceMastery): string | null {
  const parts = [
    typeof mastery.benchmarkStrength === 'number' ? `benchmark ${formatNumber(mastery.benchmarkStrength)}` : null,
    typeof mastery.liveStrength === 'number' ? `live ${formatNumber(mastery.liveStrength)}` : null,
    typeof mastery.supportCount === 'number' ? pluralize(mastery.supportCount, 'support') : null,
    typeof mastery.contradictionCount === 'number' && mastery.contradictionCount > 0
      ? pluralize(mastery.contradictionCount, 'contradiction')
      : null
  ].filter((part): part is string => Boolean(part));
  return parts.length > 0 ? `Evidence: ${parts.join(', ')}.` : null;
}

function ensureSentence(value: string): string {
  const clean = value.replace(/\s+/g, ' ').trim();
  return /[.!?]$/.test(clean) ? clean : `${clean}.`;
}

function sentenceCaseFirst(value: string): string {
  const clean = value.trim();
  return clean ? `${clean.charAt(0).toUpperCase()}${clean.slice(1)}` : clean;
}

function truncateAtWord(value: string, limit: number): string {
  const clean = normalizeKnownAcronyms(value.replace(/\s+/g, ' ').trim());
  if (clean.length <= limit) return clean;
  const clipped = clean.slice(0, limit - 3);
  const lastSpace = clipped.lastIndexOf(' ');
  const prefix = lastSpace > Math.floor(limit * 0.6) ? clipped.slice(0, lastSpace) : clipped;
  return `${prefix.trim()}...`;
}

function normalizeKnownAcronyms(value: string): string {
  return value
    .replace(/\bAgi\b/g, 'AGI')
    .replace(/\bApi\b/g, 'API')
    .replace(/\bB2c\b/g, 'B2C')
    .replace(/\bCli\b/g, 'CLI')
    .replace(/\bDb\b/g, 'DB')
    .replace(/\bGpt\b/g, 'GPT')
    .replace(/\bGtm\b/g, 'GTM')
    .replace(/\bLlm\b/g, 'LLM')
    .replace(/\bUi\b/g, 'UI')
    .replace(/\bUx\b/g, 'UX')
    .replace(/\bYc\b/g, 'YC');
}

function formatDelta(value: number): string {
  const rounded = Math.round(value * 1000) / 1000;
  return `${rounded > 0 ? '+' : ''}${rounded}`;
}

function normalizeWorkspaceIdPart(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '') || 'chip';
}

function compactTimestamp(iso: string): string {
  return iso.replace(/[^0-9A-Za-z]+/g, '').slice(0, 18) || String(Date.now());
}

function labelFromKey(value: string): string {
  const acronyms = new Set(['agi', 'api', 'b2c', 'cli', 'db', 'gpt', 'gtm', 'llm', 'qa', 'r30', 'ui', 'ux', 'yc']);
  return value
    .split(/[-_\s]+/)
    .filter(Boolean)
    .map((part) => {
      const lower = part.toLowerCase();
      return acronyms.has(lower) ? lower.toUpperCase() : part.charAt(0).toUpperCase() + part.slice(1);
    })
    .join(' ') || value;
}

function sessionDisplayTitle(session: RecursiveSessionListItem): string {
  const id = session.session_id || '';
  const pathMatch = /^path:(.+)$/.exec(id);
  if (pathMatch) return labelFromKey(pathMatch[1]);
  const knownPathMatch = /^path_(?:builder_chip|benchmark_prompt_engineer|domain_autoloop|domain_chip_lab)_(.+)$/.exec(id);
  const title = session.title ? sessionTitleLabel(session.title) : null;
  if (knownPathMatch) {
    if (/^\d/.test(knownPathMatch[1]) && title) return title;
    return labelFromKey(knownPathMatch[1]);
  }
  if (title) return title;
  return id || 'Recursive loop';
}

function sessionTitleLabel(title: string): string {
  const cleaned = title
    .replace(/\bcompleted\b[\s\S]*$/i, '')
    .replace(/\bstatus=.*$/i, '')
    .replace(/[.]+$/, '')
    .trim();
  return truncateAtWord(labelFromKey(cleaned || title), 64);
}

function inferOutcomeVerdict(rawVerdict: string | null | undefined, metric: number | null | undefined): 'improved' | 'flat' | 'regressed' | 'defer' {
  const normalized = (rawVerdict || '').toLowerCase();
  if (/\b(regress\w*|worse|failed|revert\w*)\b/.test(normalized)) return 'regressed';
  if (/\b(defer\w*|deferred|hold|review)\b/.test(normalized)) return 'defer';
  if (/\b(flat|same|no[_ -]?gain)\b/.test(normalized)) return 'flat';
  if (/\b(improv\w*|kept|keep|accepted|better|pass\w*)\b/.test(normalized)) return 'improved';
  return 'flat';
}

export function workspaceSessions(snapshot: SparkWorkspaceSnapshot): RecursiveSessionListItem[] {
  return snapshot.evolutionPaths.map((path) => {
    const spec = specializationForPath(snapshot, path);
    return {
      trace_id: path.id,
      session_id: path.id,
      source_kind: 'spark_workspace_evolution_path',
      title: path.summary,
      status: path.status,
      domain: spec?.key || path.repoLabel || path.scope || null,
      updated_at: path.updatedAt || null,
      kanban_bucket: path.status === 'open' ? 'active' : path.status,
      review_required: inboxForPath(snapshot, path).length > 0
    };
  });
}

export function workspaceReviewCandidates(snapshot: SparkWorkspaceSnapshot): RecursiveReviewCandidate[] {
  const items = snapshot.inbox?.items ?? [];
  return items.map((item) => {
    const spec = item.specializationId
      ? snapshot.specializations.find((entry) => entry.id === item.specializationId)
      : undefined;
    return {
      session_id: item.targetId || item.id,
      source_kind: 'spark_workspace_decision',
      title: item.title,
      domain: spec?.key || item.repoId || item.targetType || null,
      status: item.kind,
      risk: item.priority,
      reason: item.recommendedAction || item.summary,
      gate_ids: [item.kind],
      score_delta: null
    };
  });
}

async function applySparkWorkspaceDecision(input: {
  id: string;
  action: 'approve' | 'defer' | 'reject' | 'more-eval';
  rationale?: string;
}): Promise<{
  applied: boolean;
  targetType?: string;
  targetId?: string;
  detail: string;
}> {
  const config = sparkWorkspaceConfig();
  const snapshot = await loadSparkWorkspaceSnapshot();
  const item = findInboxItemForDecision(snapshot, input.id);
  const reason = input.rationale?.trim() || `Telegram /recursive ${input.action}`;

  if (!item) {
    return {
      applied: false,
      detail: `No matching Workspace inbox item was found; open Workspace Decisions before mutating: ${sparkWorkspaceDecisionsUrl()}`
    };
  }

  if (item.kind === 'absorb' && item.targetType === 'insight') {
    if (input.action !== 'approve') {
      return {
        applied: false,
        targetType: item.targetType,
        targetId: item.targetId,
        detail: 'Insight inbox items only support approve/absorb from Telegram right now.'
      };
    }
    await postSparkWorkspaceMutation(config, `/insights/${encodeURIComponent(item.targetId)}/absorb`, { reason });
    return {
      applied: true,
      targetType: item.targetType,
      targetId: item.targetId,
      detail: 'Workspace insight absorb request submitted.'
    };
  }

  if (item.kind === 'review_mastery' && item.targetType === 'mastery') {
    const decision = workspaceDecisionForAction(input.action);
    await postSparkWorkspaceMutation(config, `/masteries/${encodeURIComponent(item.targetId)}/review`, {
      decision,
      reason,
      recommendedNextStep: input.action === 'more-eval' ? reason : null,
      rollbackCondition: decision === 'approve' ? 'Reopen review if follow-up evidence contradicts this mastery.' : null
    });
    return {
      applied: true,
      targetType: item.targetType,
      targetId: item.targetId,
      detail: `Workspace mastery review submitted as ${decision}.`
    };
  }

  return {
    applied: false,
    targetType: item.targetType,
    targetId: item.targetId,
    detail: `Workspace item ${item.kind} needs Workspace Decisions; Telegram did not mutate it. Open: ${sparkWorkspaceDecisionsUrl()}`
  };
}

async function postSparkWorkspaceMutation(
  config: { apiUrl: string; workspaceId: string; accessToken: string },
  relativePath: string,
  body: unknown
): Promise<void> {
  await axios.post(
    `${config.apiUrl}/api/workspaces/${encodeURIComponent(config.workspaceId)}${relativePath}`,
    body,
    {
      timeout: 15000,
      headers: {
        Authorization: `Bearer ${config.accessToken}`
      }
    }
  );
}

export function workspaceTraceView(snapshot: SparkWorkspaceSnapshot, id: string): RecursiveTraceView {
  const path = findPath(snapshot, id);
  const spec = path ? specializationForPath(snapshot, path) : null;
  const insights = spec ? snapshot.insights.filter((item) => item.specializationId === spec.id) : [];
  const masteries = spec ? snapshot.masteries.filter((item) => item.specializationScope === spec.key) : [];
  const outcomes = path ? outcomesForPath(snapshot, path) : [];
  const decisions = path ? inboxForPath(snapshot, path) : [];
  const artifacts = path ? artifactsForPath(snapshot, path) : [];
  const recentOutcomes = outcomes
    .slice()
    .sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')))
    .slice(0, 3);
  const outcomeTimeline = outcomes.length > 0
    ? dedupeOutcomeTraceItems(recentOutcomes.map((item, index) => ({
      kind: 'outcome',
      title: outcomeTraceTitle(item, index),
      status: item.verdict,
      summary: [item.summary, formatOutcomeMetric(item)].filter(Boolean).join(' ')
    })))
    : path?.bestOutcomeId
      ? [{
        kind: 'outcome',
        title: path.bestOutcomeId,
        status: 'recorded',
        summary: path.summary
      }]
      : [];
  const supportingTimeline = outcomeTimeline.length > 0
    ? []
    : [
      ...insights.slice(-3).map((item) => ({
        kind: 'insight',
        title: item.id,
        status: item.status || 'observed',
        summary: item.summary
      })),
      ...masteries.slice(-3).map((item) => ({
        kind: 'mastery',
        title: item.id,
        status: 'workspace',
        summary: item.summary
      }))
    ];
  return {
    session_id: path?.id || id,
    title: path?.summary || spec?.label || id,
    status: path?.status || 'unknown',
    source_kind: 'spark_workspace_evolution_path',
    spawner: {
      board_entry: {
        status: path?.status || 'workspace',
        taskCount: insights.length + masteries.length + outcomes.length + decisions.length + artifacts.length
      },
      canvas_queue: {
        pipelineId: 'spark-workspace-recursions',
        pending: false,
        latest: true,
        autoRun: false
      }
    },
    review: {
      required: decisions.length > 0,
      decisions,
      local_packets: [],
      swarm_packets: []
    },
    timeline: [
      ...outcomeTimeline,
      ...supportingTimeline,
      ...(outcomeTimeline.length > 0
        ? []
        : artifacts.slice(-1).map((item) => ({
          kind: 'artifact',
          title: item.label || item.id,
          status: item.kind,
          summary: item.path || item.url || item.id
        })))
    ]
  };
}

export function renderRecursiveWorkspaceReport(snapshot: SparkWorkspaceSnapshot, id: string): string {
  const path = findPath(snapshot, id);
  if (!path) return `Recursive loop not found in Spark Workspace: ${id}\n${sparkWorkspaceRecursionsUrl()}`;
  const spec = specializationForPath(snapshot, path);
  const insights = spec ? snapshot.insights.filter((item) => item.specializationId === spec.id) : [];
  const pathOutcomes = outcomesForPath(snapshot, path);
  const latestOutcome = pathOutcomes.slice().sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')))[0];
  const decisions = inboxForPath(snapshot, path);
  const metricLine = latestOutcome ? formatOutcomeMetric(latestOutcome) : null;
  const comparisonLine = latestOutcome ? formatOutcomeComparison(latestOutcome, pathOutcomes, path.bestOutcomeId) : null;
  const label = pathDisplayLabel(path, spec);
  const verdict = latestOutcome?.verdict || (path.bestOutcomeId ? 'recorded' : path.status);
  const sameDisplayedImprovement = latestOutcome ? hasSameDisplayedImprovement(latestOutcome.summary) : false;
  const scoreLines = [
    metricLine ? `• ${metricLine}` : null,
    comparisonLine ? `• ${formatCompareFragment(comparisonLine)}` : null
  ].filter(isRenderableLine);

  return [
    `${outcomeStatusIcon(verdict)} ${workspaceReportHeadline(label, verdict, Boolean(latestOutcome), sameDisplayedImprovement)}`,
    scoreLines.length > 0 ? '' : null,
    scoreLines.length > 0 ? 'Score' : null,
    ...scoreLines,
    decisions.length > 0 ? '' : null,
    decisions.length > 0 ? 'Review' : null,
    decisions.length > 0 ? `• ${pluralize(decisions.length, 'decision')} waiting` : null,
    decisions.length > 0 ? `• ${sparkWorkspaceDecisionsUrl()}` : null,
    '',
    'Workspace',
    `• ${sparkWorkspaceRecursionsUrl()}`,
  ].filter(isRenderableLine).join('\n');
}

export function renderRecursiveWorkspaceReview(snapshot: SparkWorkspaceSnapshot, id: string): string {
  const path = findPath(snapshot, id);
  const spec = path ? specializationForPath(snapshot, path) : null;
  const items = (path ? inboxForPath(snapshot, path) : (snapshot.inbox?.items ?? []).filter((item) => item.id === id || item.targetId === id))
    .slice()
    .sort((a, b) => reviewPriorityRank(b.priority) - reviewPriorityRank(a.priority));
  if (items.length === 0) return `No Spark Workspace decisions found for ${id}.`;
  const groups = groupReviewItems(items);
  const targetLabel = path ? pathDisplayLabel(path, spec) : labelFromKey(id);
  const scopeLine = path ? `Scope: ${friendlyReviewScope(path.scope)}` : null;
  const networkLine = path ? `Network: ${friendlyReviewNetwork(path.scope)}` : null;
  const topGroup = groups[0];
  const topActions = topGroup ? reviewTelegramActions(topGroup.item) : [];
  const reasonLines = topGroup ? reviewReasonLines(topGroup) : [];

  return [
    `${targetLabel} review`,
    '',
    'Review',
    `• ${pluralize(items.length, 'decision')} waiting`,
    topGroup ? `• blocker: ${topGroup.item.title}${topGroup.count > 1 ? ` (${pluralize(topGroup.count, 'item')})` : ''}` : null,
    scopeLine || networkLine ? '' : null,
    scopeLine || networkLine ? 'Sharing' : null,
    scopeLine ? `• ${scopeLine.replace(/^Scope:\s*/, '')}` : null,
    networkLine ? `• ${networkLine.replace(/^Network:\s*/, '')}` : null,
    reasonLines.length > 0 ? '' : null,
    reasonLines.length > 0 ? 'Why' : null,
    ...reasonLines.map((reason) => `• ${reason}`),
    topGroup?.item.recommendedAction ? '' : null,
    topGroup?.item.recommendedAction ? 'Move' : null,
    topGroup?.item.recommendedAction ? `• ${ensureSentence(truncate(topGroup.item.recommendedAction, 130))}` : null,
    topActions.length > 0 ? '' : null,
    topActions.length > 0 ? 'Actions' : null,
    ...topActions.map((action, index) => `${index + 1}. ${action}`),
    '',
    'Workspace',
    `• ${sparkWorkspaceDecisionsUrl()}`
  ].filter(isRenderableLine).join('\n');
}

function findPath(snapshot: SparkWorkspaceSnapshot, id: string): SparkWorkspaceEvolutionPath | null {
  const trimmed = id.trim();
  const normalized = normalizeWorkspaceIdPart(trimmed.replace(/^path:/i, ''));
  return snapshot.evolutionPaths.find((path) => {
    if (path.id === trimmed || path.specializationId === trimmed) return true;
    const builderChipMatch = /^path_builder_chip_(.+)$/.exec(path.id);
    if (builderChipMatch && normalizeWorkspaceIdPart(builderChipMatch[1]) === normalized) return true;
    const simplePathMatch = /^path_(.+)$/.exec(path.id);
    if (simplePathMatch && normalizeWorkspaceIdPart(simplePathMatch[1]) === normalized) return true;
    return false;
  }) ?? null;
}

function specializationForPath(snapshot: SparkWorkspaceSnapshot, path: SparkWorkspaceEvolutionPath): SparkWorkspaceSpecialization | null {
  return path.specializationId
    ? snapshot.specializations.find((entry) => entry.id === path.specializationId) ?? null
    : null;
}

function inboxForPath(snapshot: SparkWorkspaceSnapshot, path: SparkWorkspaceEvolutionPath): SparkWorkspaceInboxItem[] {
  const spec = specializationForPath(snapshot, path);
  return (snapshot.inbox?.items ?? []).filter((item) =>
    item.targetId === path.id ||
    (spec && item.specializationId === spec.id)
  );
}

function outcomesForPath(snapshot: SparkWorkspaceSnapshot, path: SparkWorkspaceEvolutionPath): SparkWorkspaceOutcome[] {
  return snapshot.outcomes.filter((outcome) =>
    (outcome.targetType === 'evolution_path' && outcome.targetId === path.id) ||
    (path.bestOutcomeId !== null && outcome.id === path.bestOutcomeId)
  );
}

function artifactsForPath(snapshot: SparkWorkspaceSnapshot, path: SparkWorkspaceEvolutionPath): SparkWorkspaceArtifactRef[] {
  const latestOutcome = outcomesForPath(snapshot, path)
    .sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')))[0];
  const pathKey = normalizeWorkspaceIdPart(path.id);
  const pathSourceSuffix = pathKey.replace(
    /^path_(?:builder_chip|benchmark_prompt_engineer|domain_autoloop|domain_chip_lab)_/,
    ''
  );
  const matchKeys = [
    pathKey,
    pathKey.replace(/^path_/, ''),
    pathSourceSuffix,
    normalizeWorkspaceIdPart(path.repoLabel || ''),
    normalizeWorkspaceIdPart(latestOutcome?.id || path.bestOutcomeId || '')
  ].filter((key) => key.length > 3);

  return uniqueArtifactRefs(snapshot.artifactRefs.filter((artifact) =>
    matchKeys.some((key) =>
      normalizeWorkspaceIdPart(`${artifact.id} ${artifact.label} ${artifact.path || ''} ${artifact.url || ''}`).includes(key)
    )
  ));
}

function uniqueArtifactRefs(artifacts: SparkWorkspaceArtifactRef[]): SparkWorkspaceArtifactRef[] {
  const seen = new Set<string>();
  const unique: SparkWorkspaceArtifactRef[] = [];
  for (const artifact of artifacts) {
    const key = [
      artifact.kind,
      artifact.label,
      artifact.path || '',
      artifact.url || ''
    ].join('\n');
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(artifact);
  }
  return unique;
}

function isRenderableLine(line: string | null): line is string {
  return line !== null;
}

function pathDisplayLabel(path: SparkWorkspaceEvolutionPath, spec: SparkWorkspaceSpecialization | null): string {
  return spec?.label || labelFromKey(path.repoLabel || path.scope || path.id);
}

function recursiveStartTargetForPath(path: SparkWorkspaceEvolutionPath, spec: SparkWorkspaceSpecialization | null): string | null {
  if (spec?.key) return spec.key;
  if (path.id.startsWith('path:')) return path.id.slice('path:'.length);
  const builderChipMatch = /^path_builder_chip_(.+)$/.exec(path.id);
  if (builderChipMatch) return builderChipMatch[1].replace(/_/g, '-');
  const simplePathMatch = /^path_(.+)$/.exec(path.id);
  if (simplePathMatch) return simplePathMatch[1].replace(/_/g, '-');
  return null;
}

function outcomeHeadline(label: string, verdict: string | null | undefined): string {
  return `${label} ${friendlyOutcomeVerb(verdict)}.`;
}

function workspaceReportHeadline(
  label: string,
  verdict: string | null | undefined,
  hasOutcome: boolean,
  sameDisplayedImprovement = false
): string {
  if (!hasOutcome) return outcomeHeadline(label, verdict);
  if (sameDisplayedImprovement) return `Latest ${label} run improved slightly.`;
  return `Latest ${label} run ${friendlyOutcomeVerb(verdict)}.`;
}

function outcomeStatusIcon(verdict: string | null | undefined): string {
  const normalized = (verdict || '').toLowerCase();
  if (normalized.includes('regress')) return '🔴';
  if (normalized.includes('improv')) return '🟢';
  if (normalized.includes('flat')) return '⚪';
  if (normalized.includes('unknown') || normalized.includes('no rounds')) return '🟡';
  return '⚪';
}

function friendlyOutcomeVerb(verdict: string | null | undefined): string {
  const normalized = (verdict || '').toLowerCase();
  if (normalized.includes('regress')) return 'regressed';
  if (normalized.includes('defer')) return 'was deferred';
  if (normalized.includes('improv')) return 'improved';
  if (normalized.includes('flat')) return 'held steady';
  if (normalized.includes('record')) return 'was recorded';
  if (normalized.includes('open')) return 'is open';
  if (normalized.includes('resolved') || normalized.includes('completed')) return 'is complete';
  if (normalized.includes('expired')) return 'expired';
  if (normalized.includes('unknown')) return 'needs more signal';
  if (normalized.includes('no rounds')) return 'has no rounds yet';
  return normalized || 'is recorded';
}

function friendlyDecisionLabel(decision: RecursiveDecision): string {
  if (decision === 'approve_local') return 'approved';
  if (decision === 'request_more_eval') return 'more eval requested';
  if (decision === 'defer') return 'deferred';
  if (decision === 'reject') return 'rejected';
  return decision;
}

function friendlyWorkspaceDecisionDetail(detail: string): string {
  if (/No matching Workspace inbox item/i.test(detail)) {
    return 'No matching decision was found. Open Decisions and refresh the queue.';
  }
  if (/only support approve\/absorb/i.test(detail)) {
    return 'This item only supports approve from Telegram.';
  }
  if (/Workspace insight absorb request submitted/i.test(detail)) {
    return 'Insight absorb request submitted.';
  }
  const masteryMatch = /Workspace mastery review submitted as ([^.]+)\./i.exec(detail);
  if (masteryMatch) return `Mastery review submitted as ${masteryMatch[1]}.`;
  if (/needs Workspace Decisions|Telegram did not mutate it/i.test(detail)) {
    return 'This item has to be handled in Workspace Decisions.';
  }
  return detail;
}

function decisionReportTarget(record: RecursiveDecisionRecord): string | null {
  if (record.target_type === 'evolution_path' && record.target_id) return record.target_id;
  if (/^path[:_]/.test(record.session_id)) return record.session_id;
  return null;
}

interface ReviewItemGroup {
  item: SparkWorkspaceInboxItem;
  count: number;
  summaries: string[];
}

function groupReviewItems(items: SparkWorkspaceInboxItem[]): ReviewItemGroup[] {
  const groups = new Map<string, ReviewItemGroup>();
  for (const item of items) {
    const key = [
      item.kind,
      item.title,
      item.priority,
      item.recommendedAction || '',
      reviewTelegramActions(item).length > 0 ? item.id : 'dashboard-only'
    ].join('\n');
    const existing = groups.get(key);
    if (existing) {
      existing.count += 1;
      if (!existing.summaries.includes(item.summary)) existing.summaries.push(item.summary);
    } else {
      groups.set(key, { item, count: 1, summaries: [item.summary] });
    }
  }
  return [...groups.values()];
}

function renderReviewGroup(group: ReviewItemGroup, index: number): string[] {
  const item = group.item;
  const suffix = group.count > 1 ? ` (${pluralize(group.count, 'item')})` : '';
  const lines = [
    `${index}. ${item.title}${suffix}`,
    `Type: ${reviewKindLabel(item.kind)}, priority ${item.priority}.`,
    `Why: ${ensureSentence(reviewGroupSummary(group))}`
  ];
  if (item.recommendedAction) {
    lines.push(`Suggested: ${ensureSentence(truncate(item.recommendedAction, 140))}`);
  }

  const actions = reviewTelegramActions(item);
  if (actions.length > 0) {
    lines.push('Telegram actions:', ...actions.map((action) => `- ${action}`));
  } else {
    lines.push(
      'Workspace',
      `- ${sparkWorkspaceDecisionsUrl()}`
    );
  }
  return ['', ...lines];
}

function reviewGroupSummary(group: ReviewItemGroup): string {
  if (group.count === 1) return truncate(group.summaries[0], 160);
  const reasons = uniqueReviewReasons(group.summaries);
  if (reasons.length > 0) {
    return `${pluralize(group.count, 'related decision')} need the same move. Reasons: ${truncate(reasons.join('; '), 150)}`;
  }
  return `${pluralize(group.count, 'related decision')} need the same move.`;
}

function reviewReasonLines(group: ReviewItemGroup): string[] {
  if (group.count === 1) return [ensureSentence(truncate(group.summaries[0], 120))];
  const reasons = uniqueReviewReasons(group.summaries).map(friendlyReviewReason);
  if (reasons.length > 0) return reasons.map(ensureSentence);
  return [`${pluralize(group.count, 'related decision')} need the same move.`];
}

function friendlyReviewReason(reason: string): string {
  const cleaned = reason.replace(/[.]+$/, '').trim();
  if (/primary message exceeds the network readability limit/i.test(cleaned)) return 'Message is too long for network sharing';
  if (/contains a suspicious long opaque token/i.test(cleaned)) return 'Suspicious long opaque token';
  if (/contains inline code fencing/i.test(cleaned)) return 'Inline code fencing';
  return sentenceCaseFirst(cleaned.replace(/^contains\s+/i, ''));
}

function uniqueReviewReasons(summaries: string[]): string[] {
  const reasons = new Set<string>();
  for (const summary of summaries) {
    const match = /Reasons?:\s*(.+)$/i.exec(summary);
    reasons.add((match ? match[1] : summary).replace(/[.]+$/, '').trim());
  }
  return [...reasons].filter(Boolean).slice(0, 4);
}

function reviewTelegramActions(item: SparkWorkspaceInboxItem): string[] {
  if (item.kind === 'absorb' && item.targetType === 'insight') {
    return [
      `Approve: /recursive approve ${item.id} absorb this insight`
    ];
  }
  if (item.kind === 'review_mastery' && item.targetType === 'mastery') {
    return [
      `Approve: /recursive approve ${item.id} evidence is strong enough`,
      `More eval: /recursive more-eval ${item.id} needs another benchmark pass`,
      `Defer: /recursive defer ${item.id} hold for later`,
      `Reject: /recursive reject ${item.id} evidence is not strong enough`
    ];
  }
  return [];
}

function reviewKindLabel(kind: string): string {
  const normalized = kind.toLowerCase();
  if (normalized === 'review_mastery') return 'Review mastery';
  if (normalized === 'review_outcome') return 'Review outcome';
  if (normalized === 'absorb') return 'Absorb insight';
  return labelFromKey(kind);
}

function reviewPriorityRank(priority: string | null | undefined): number {
  const normalized = (priority || '').toLowerCase();
  if (normalized === 'high') return 3;
  if (normalized === 'medium') return 2;
  if (normalized === 'low') return 1;
  return 0;
}

function friendlyReviewScope(scope: string | null | undefined): string {
  const normalized = (scope || '').toLowerCase();
  if (normalized.includes('public') || normalized.includes('network')) return 'public network';
  if (normalized.includes('specialization')) return 'specialization path';
  if (normalized.includes('workspace') || normalized.includes('private') || normalized.includes('local')) return 'private workspace';
  return scope || 'workspace';
}

function friendlyReviewNetwork(scope: string | null | undefined): string {
  const normalized = (scope || '').toLowerCase();
  if (normalized.includes('public') || normalized.includes('network')) return 'official path';
  if (normalized.includes('specialization')) return 'review required';
  return 'not submitted';
}

function traceDisplayTitle(trace: RecursiveTraceView): string {
  const id = trace.session_id || '';
  if (id.startsWith('path:')) return labelFromKey(id.slice('path:'.length));
  const builderChipMatch = /^path_builder_chip_(.+)$/.exec(id);
  if (builderChipMatch) return labelFromKey(builderChipMatch[1]);
  const simplePathMatch = /^path_(.+)$/.exec(id);
  if (simplePathMatch) return labelFromKey(simplePathMatch[1]);
  const title = (trace.title || '').trim();
  if (title && title.length <= 80) return title.replace(/[.]+$/, '');
  return id || 'Recursive loop';
}

function formatTraceTimelineItem(item: RecursiveTraceView['timeline'][number]): string {
  if (item.kind === 'artifact') return cleanTraceArtifactTitle(item.title, item.status);
  if (item.kind === 'outcome') {
    const detail = traceTimelineDetail(item);
    return `${outcomeStatusIcon(item.status)} ${cleanTraceTimelineTitle(item.title)} ${traceOutcomeStatusLabel(item.status)}${detail ? ` - ${detail}` : ''}`;
  }
  const title = cleanTraceTimelineTitle(item.title);
  const detail = traceTimelineDetail(item);
  return `- ${item.kind}: ${title} (${item.status})${detail ? ` - ${detail}` : ''}`;
}

function traceOutcomeStatusLabel(status: string): string {
  const normalized = status.toLowerCase();
  if (normalized === 'improved') return 'improved';
  if (normalized === 'flat') return 'held steady';
  if (normalized === 'regressed') return 'regressed';
  return normalized || 'recorded';
}

function outcomeTraceTitle(outcome: SparkWorkspaceOutcome, index: number): string {
  if (/(^|[:_])baseline$/i.test(outcome.id)) return 'baseline';
  if (index === 0) return 'latest run';
  if (index === 1) return 'previous run';
  if (index === 2) return '2 runs back';
  return `${index} runs back`;
}

function traceTimelineDetail(item: RecursiveTraceView['timeline'][number]): string | null {
  if (item.kind !== 'outcome') return null;
  const metricMatch = /(overall score|scenario score|builder chip loop best metric|average composite score|autoloop cycle count|domain chip quality score)\s+[-+]?\d+(?:\.\d+)?/i.exec(item.summary);
  if (metricMatch) return metricMatch[0].toLowerCase().replace(/^overall score\b/, 'current run');
  return null;
}

function dedupeOutcomeTraceItems(
  items: Array<RecursiveTraceView['timeline'][number]>
): Array<RecursiveTraceView['timeline'][number]> {
  const groups: Array<{ item: RecursiveTraceView['timeline'][number]; count: number; key: string }> = [];
  for (const item of items) {
    const detail = traceTimelineDetail(item) || '';
    const key = `${item.title}|${item.status}|${detail}`;
    const previous = groups[groups.length - 1];
    if (previous && previous.key === key && item.title !== 'latest run') {
      previous.count += 1;
      previous.item = {
        ...previous.item,
        title: repeatedOutcomeTraceTitle(previous.item.title, previous.count)
      };
      continue;
    }
    groups.push({ item, count: 1, key });
  }
  return groups.map((group) => group.item);
}

function repeatedOutcomeTraceTitle(title: string, count: number): string {
  if (title === 'previous run' || title === 'previous round') return `${count} previous runs`;
  if (title === 'baseline') return `${count} baseline runs`;
  return `${count} ${title}`;
}

function cleanTraceArtifactTitle(title: string, status: string): string {
  if (/candidate score/i.test(title)) return 'candidate score saved';
  if (/baseline trace/i.test(title)) return 'baseline trace saved';
  if (/candidate trace/i.test(title)) return 'candidate trace saved';
  const cleaned = cleanTraceTimelineTitle(title)
    .replace(/\b\d{8}T\d{6,}\w*\b/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  return cleaned || labelFromKey(status);
}

function cleanTraceTimelineTitle(title: string): string {
  const outcomeMatch = /^outcome[:_][^:_]+[:_](.+)$/i.exec(title);
  const cleaned = (outcomeMatch ? outcomeMatch[1] : title)
    .replace(/^round[:_]/i, 'round ')
    .replace(/[_:]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (/^round\s+\d{8}T\d+/i.test(cleaned)) return 'previous round';
  return cleaned || title;
}

function formatOutcomeMetric(outcome: SparkWorkspaceOutcome): string | null {
  if (typeof outcome.metricValue !== 'number') return null;
  return `${formatMetricLabel(outcome.metricName)} ${formatNumber(outcome.metricValue)}`;
}

function formatOutcomeComparison(
  latestOutcome: SparkWorkspaceOutcome,
  outcomes: SparkWorkspaceOutcome[],
  bestOutcomeId: string | null | undefined
): string | null {
  const bestOutcome = bestComparableOutcome(latestOutcome, outcomes, bestOutcomeId);
  if (typeof latestOutcome.metricValue !== 'number') return null;

  const previousOutcome = previousComparableOutcome(latestOutcome, outcomes);
  if (previousOutcome && typeof previousOutcome.metricValue === 'number') {
    const previousDelta = latestOutcome.metricValue - previousOutcome.metricValue;
    if (Math.abs(previousDelta) < 0.000001 && /flat|steady|held/i.test(latestOutcome.verdict || '')) {
      return 'Change: unchanged from previous run.';
    }
    if (Math.abs(previousDelta) >= 0.000001) {
      const lowerIsBetter = metricGoalPrefersLower(latestOutcome);
      const latestIsBetter = lowerIsBetter ? previousDelta < 0 : previousDelta > 0;
      if (latestIsBetter && /improved/i.test(latestOutcome.verdict || '')) {
        return `Change: improved from ${formatNumber(previousOutcome.metricValue)}.`;
      }
      if (!latestIsBetter && /regressed/i.test(latestOutcome.verdict || '')) {
        return `Change: regressed from ${formatNumber(previousOutcome.metricValue)}.`;
      }
    }
  }

  if (!bestOutcome || typeof bestOutcome.metricValue !== 'number') return null;

  const delta = latestOutcome.metricValue - bestOutcome.metricValue;
  if (Math.abs(delta) < 0.000001) return 'Compare: current best for this path.';

  const lowerIsBetter = metricGoalPrefersLower(latestOutcome);
  const latestIsBetter = lowerIsBetter ? delta < 0 : delta > 0;
  const direction = latestIsBetter
    ? 'beats current best by'
    : lowerIsBetter
      ? 'above current best by'
      : 'below current best by';
  return `Compare: ${direction} ${formatNumber(Math.abs(delta))} (best ${formatNumber(bestOutcome.metricValue)}).`;
}

function formatCompareFragment(line: string): string {
  return line.replace(/^(Compare|Change):\s*/i, '').replace(/[.]+$/, '');
}

function bestComparableOutcome(
  latestOutcome: SparkWorkspaceOutcome,
  outcomes: SparkWorkspaceOutcome[],
  bestOutcomeId: string | null | undefined
): SparkWorkspaceOutcome | null {
  if (typeof latestOutcome.metricValue !== 'number') return null;
  const comparable = outcomes.filter((outcome) =>
    outcome.metricName === latestOutcome.metricName &&
    typeof outcome.metricValue === 'number'
  );
  if (comparable.length === 0) return null;

  const lowerIsBetter = metricGoalPrefersLower(latestOutcome);

  const selectedBest = bestOutcomeId
    ? comparable.find((outcome) => outcome.id === bestOutcomeId)
    : null;
  if (selectedBest) {
    const bestMetric = selectedBest.metricValue as number;
    const isActuallyBest = lowerIsBetter
      ? comparable.every((o) => (o.metricValue as number) >= bestMetric)
      : comparable.every((o) => (o.metricValue as number) <= bestMetric);
    if (isActuallyBest) return selectedBest;
  }
  return comparable.slice().sort((a, b) =>
    lowerIsBetter
      ? (a.metricValue as number) - (b.metricValue as number)
      : (b.metricValue as number) - (a.metricValue as number)
  )[0] ?? null;
}

function previousComparableOutcome(
  latestOutcome: SparkWorkspaceOutcome,
  outcomes: SparkWorkspaceOutcome[]
): SparkWorkspaceOutcome | null {
  if (typeof latestOutcome.metricValue !== 'number') return null;
  const latestCreatedAt = String(latestOutcome.createdAt || '');
  const comparable = outcomes.filter((outcome) =>
    outcome.id !== latestOutcome.id &&
    outcome.metricName === latestOutcome.metricName &&
    typeof outcome.metricValue === 'number'
  );
  if (comparable.length === 0) return null;

  const earlier = latestCreatedAt
    ? comparable.filter((outcome) => String(outcome.createdAt || '') < latestCreatedAt)
    : comparable;
  const candidates = earlier.length > 0 ? earlier : comparable;
  return candidates.slice().sort((a, b) =>
    String(b.createdAt || '').localeCompare(String(a.createdAt || ''))
  )[0] ?? null;
}

function metricGoalPrefersLower(outcome: SparkWorkspaceOutcome): boolean {
  const scorecardGoal = outcome.context?.scorecard?.headlineGoal || '';
  if (/\b(lower|minimi[sz]e|smaller|less)\b/i.test(scorecardGoal)) return true;
  const componentGoals = outcome.context?.scorecard?.components?.map((component) => component.goal).join(' ') || '';
  return /\b(lower|minimi[sz]e|smaller|less)\b/i.test(componentGoals);
}

function formatOutcomeScorecard(outcome: SparkWorkspaceOutcome): string | null {
  const scorecard = outcome.context?.scorecard;
  if (!scorecard) return null;
  const headline = typeof scorecard.headlineValue === 'number'
    ? `${scorecard.headlineLabel || formatMetricLabel(outcome.metricName)} ${formatNumber(scorecard.headlineValue)}`
    : null;
  const goal = scorecard.headlineGoal ? `goal=${scorecard.headlineGoal}` : null;
  const model = scorecard.modelLabel ? `model=${normalizeKnownAcronyms(scorecard.modelLabel)}` : null;
  const details = (scorecard.details || [])
    .slice(0, 2)
    .map((detail) => normalizeKnownAcronyms(`${detail.label}: ${detail.value}`));
  return [headline, goal, model, ...details].filter(Boolean).join('; ') || null;
}

function formatArtifactRefs(artifacts: SparkWorkspaceArtifactRef[]): string {
  if (artifacts.length === 0) return 'Evidence: none saved yet.';
  const highlights = uniqueArtifactLabels(artifacts).slice(0, 3);
  if (artifacts.length === 1) {
    const label = highlights[0];
    return `Evidence: saved ${friendlyArtifactKind(artifacts[0].kind)}${label ? ` - ${label}` : ''}.`;
  }
  const highlightLine = highlights.length > 0 ? ` Highlights: ${highlights.join('; ')}.` : '';
  return `Evidence: ${pluralize(artifacts.length, 'saved item')}.${highlightLine}`;
}

function uniqueArtifactLabels(artifacts: SparkWorkspaceArtifactRef[]): string[] {
  const labels: string[] = [];
  for (const artifact of artifacts) {
    const label = truncate((artifact.label || artifact.id || '').replace(/[_:]+/g, ' ').trim(), 60);
    if (label && !labels.includes(label)) labels.push(label);
  }
  return labels;
}

function friendlyArtifactKind(kind: string | null | undefined): string {
  const normalized = (kind || '').toLowerCase();
  if (normalized === 'run_trace') return 'run trace';
  if (normalized === 'benchmark_run') return 'benchmark run';
  if (normalized === 'loop_telemetry') return 'loop telemetry';
  return formatMetricLabel(normalized || 'artifact');
}

function formatMetricLabel(value: string | null | undefined): string {
  const normalized = (value || 'metric').replace(/_/g, ' ').replace(/\s*:\s*/g, ' / ');
  if (normalized === 'overall score' || normalized.startsWith('overall score / ')) return 'current run';
  return normalized;
}

function formatNumber(value: number): string {
  return Number.isInteger(value) ? String(value) : String(Math.round(value * 10000) / 10000);
}

function pluralize(count: number, singular: string, plural = `${singular}s`): string {
  return `${count} ${count === 1 ? singular : plural}`;
}

function findInboxItemForDecision(snapshot: SparkWorkspaceSnapshot, id: string): SparkWorkspaceInboxItem | null {
  const items = snapshot.inbox?.items ?? [];
  const exact = items.find((item) => item.id === id || item.targetId === id);
  if (exact) return exact;

  const path = findPath(snapshot, id);
  if (!path) return null;
  return inboxForPath(snapshot, path)[0] ?? null;
}
