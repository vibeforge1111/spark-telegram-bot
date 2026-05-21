```
import axios from 'axios';
import { execFile } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { mkdtemp, readdir, readFile, stat, writeFile } from 'node:fs/promises';
import { homedir, tmpdir } from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import type { LoopResult } from './chipLoop';
import type { PathLoopResult, SpecializationLoopInsights, SpecializationLoopPackageResult, SpecializationLoopStatus } from './pathLoop';
import { redactText } from './redaction';

export type RecursiveDecision = 'approve_local' | 'defer' | 'reject' | 'request_more_eval';

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

function localLoopVerdict(status: LocalRecursiveLoopStatus): 'improved' | 'flat' | 'regressed' {
  const round = latestLocalRound(status);
  return inferOutcomeVerdict(round?.best_verdict, round?.best_metric);
}

function localRoundCount(status: LocalRecursiveLoopStatus): string {
  const completed = status.rounds_completed ?? status.history.length;
  const total = status.total_rounds ?? completed;
  return `${completed}/${total}`;
}

function renderLocalRecursiveWorkspaceHint(): string {
  return [
    'Workspace',
    '• local-only mode',
    '• connect Spark Workspace later for reviews, decisions, and network sharing'
  ].join('\n');
}

function renderLocalRecursiveReport(status: LocalRecursiveLoopStatus): string {
  const label = labelFromKey(status.chip_key);
  const verdict = localLoopVerdict(status);
  const round = latestLocalRound(status);
  const lines = [
    `${outcomeStatusIcon(verdict)} Latest ${label} local run ${friendlyOutcomeVerb(verdict)}.`,
    '',
    'Score',
    `• ${localRoundCount(status)} rounds`
  ];
  if (typeof round?.best_metric === 'number') lines.push(`• best score ${formatNumber(round.best_metric)}`);
  if (typeof round?.suggestions_count === 'number') lines.push(`• ${pluralize(round.suggestions_count, 'suggestion')} reviewed`);
  lines.push('', 'Local', '• status file saved', '', renderLocalRecursiveWorkspaceHint());
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
  const env: NodeJS.ProcessEnv = { ...process.env };
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
  const { stdout } = await execFileAsync(
    python,
    bridgeArgs,
    {
      env,
      timeout: 30000,
      windowsHide: true,
      maxBuffer: 1024 * 1024
    }
  );

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

export function resolveRecursiveProposalPayloadPath(input: string): string {
  const value = (input || '').trim();
  if (!value) throw new Error('Usage: /recursive propose <path-or-key> [submit]');
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

function proposalArtifactPath(payload: Record<string, any