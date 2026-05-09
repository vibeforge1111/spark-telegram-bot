import axios from 'axios';
import { execFile } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { mkdtemp, writeFile } from 'node:fs/promises';
import { homedir, tmpdir } from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import type { LoopResult } from './chipLoop';

export type RecursiveDecision = 'approve_local' | 'defer' | 'reject' | 'request_more_eval';

export interface RecursiveCommand {
  action: string;
  id?: string;
  chipKey?: string;
  rounds?: number;
  rationale?: string;
}

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

const DEFAULT_SWARM_API_URL = 'http://127.0.0.1:8787';
const DEFAULT_SWARM_WEB_URL = 'http://127.0.0.1:5173';
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
  if (
    action === 'session' ||
    action === 'report' ||
    action === 'review' ||
    action === 'promote' ||
    action === 'sync' ||
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

export async function recursiveSessions(): Promise<RecursiveSessionListItem[]> {
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
  const snapshot = await loadSparkWorkspaceSnapshot();
  return renderRecursiveWorkspaceReport(snapshot, resolveRecursiveSessionId(snapshot, id));
}

export async function recursiveSessionReview(id: string): Promise<string> {
  const snapshot = await loadSparkWorkspaceSnapshot();
  return renderRecursiveWorkspaceReview(snapshot, resolveRecursiveSessionId(snapshot, id));
}

export async function recursiveSessionReport(id: string): Promise<string> {
  const snapshot = await loadSparkWorkspaceSnapshot();
  return renderRecursiveWorkspaceReport(snapshot, resolveRecursiveSessionId(snapshot, id));
}

export async function recursiveReviewCandidates(): Promise<RecursiveReviewCandidate[]> {
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

export async function queueRecursiveCanvas(id: string): Promise<RecursiveCanvasQueueResult> {
  throw new Error(`Standalone Canvas queueing is retired for ${id}. Use Spark Workspace recursions: ${sparkWorkspaceRecursionsUrl()}`);
}

export async function recursiveTraceView(id: string): Promise<RecursiveTraceView> {
  const snapshot = await loadSparkWorkspaceSnapshot();
  return workspaceTraceView(snapshot, resolveRecursiveSessionId(snapshot, id));
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
  const summary = `Builder chip loop for ${chipLabel} completed ${roundsCompleted}/${totalRounds} round(s).`;
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

function resolveSparkSwarmBridgeSrc(): string | null {
  const explicit = (process.env.SPARK_SWARM_BRIDGE_SRC || '').trim();
  if (explicit) return explicit;
  const sibling = path.resolve(process.cwd(), '..', 'spark-swarm', 'apps', 'bridge', 'src');
  return existsSync(sibling) ? sibling : null;
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
  await writeFile(inputPath, JSON.stringify(buildBuilderChipLoopBridgeInput(result, emittedAt), null, 2), 'utf-8');

  const python = (
    process.env.SPARK_SWARM_BRIDGE_PYTHON ||
    process.env.SPARK_BUILDER_PYTHON ||
    process.env.PYTHON ||
    'python'
  ).trim();
  const bridgeSrc = resolveSparkSwarmBridgeSrc();
  const env: NodeJS.ProcessEnv = {
    ...process.env
  };
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

  const { stdout } = await execFileAsync(
    python,
    args,
    {
      env,
      timeout: 30000,
      windowsHide: true,
      maxBuffer: 1024 * 1024
    }
  );

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
  const pathId = sync?.pathId || `path_builder_chip_${normalizeWorkspaceIdPart(chipKey)}`;
  const finalRound = result.history?.slice(-1)[0] ?? null;
  const lines = [
    `Recursive loop complete: ${chipKey}`,
    `Rounds: ${result.roundsCompleted ?? result.history?.length ?? 0}/${result.totalRounds ?? result.roundsCompleted ?? result.history?.length ?? 0}`
  ];

  if (finalRound) {
    const verdict = finalRound.best_verdict || inferOutcomeVerdict(finalRound.best_verdict, finalRound.best_metric);
    lines.push(`Final verdict: ${verdict}`);
    if (typeof finalRound.best_metric === 'number') {
      lines.push(`Metric: builder chip loop best metric=${formatNumber(finalRound.best_metric)}`);
    }
    lines.push(`Final suggestions: ${finalRound.suggestions_count}`);
  } else {
    lines.push('Final verdict: no rounds recorded');
  }

  if (result.statusPath) lines.push(`Status file: ${result.statusPath}`);

  if (sync) {
    lines.push(
      `Workspace sync: ${sync.synced ? 'ok' : 'skipped'}`,
      `Workspace path: ${sync.pathId}`
    );
    if (sync.outcomeId) lines.push(`Workspace outcome: ${sync.outcomeId}`);
    if (sync.detail) lines.push(`Workspace detail: ${sync.detail}`);
    lines.push(`Workspace: ${sync.workspaceUrl}`);
  } else if (syncError) {
    lines.push(`Workspace sync skipped: ${syncError}`);
  }

  lines.push(`Next: /recursive report ${pathId}`);
  return lines.join('\n');
}

export function renderRecursiveHelp(): string {
  return [
    'Spark Workspace Recursions',
    '',
    'Usage:',
    '/recursive sessions',
    '/recursive paths',
    '/recursive session <id>',
    '/recursive report <id>',
    '/recursive trace <id>',
    '/recursive review [id]',
    '/recursive approve <id> [rationale]',
    '/recursive defer <id> <rationale>',
    '/recursive reject <id> <rationale>',
    '/recursive more-eval <id> <rationale>',
    '/recursive start <chipKey> [rounds <n>]',
    '',
    `Dashboard: ${sparkWorkspaceRecursionsUrl()}`
  ].join('\n');
}

export function renderRecursiveSessions(sessions: RecursiveSessionListItem[]): string {
  if (sessions.length === 0) return 'No recursive sessions found.';
  const ordered = orderedRecursiveSessions(sessions);
  const visible = ordered.slice(0, 5);
  const lines = ['Spark recursive loops'];
  let currentGroup: string | null = null;
  for (const [index, session] of visible.entries()) {
    const group = session.review_required ? 'Needs review' : 'Clear';
    if (group !== currentGroup) {
      lines.push('', group);
      currentGroup = group;
    } else {
      lines.push('');
    }
    const status = session.status && session.status !== 'open' ? ` (${session.status})` : '';
    lines.push(`${index + 1}. ${sessionDisplayTitle(session)}${status}`);
  }
  if (sessions.length > visible.length) lines.push('', `${sessions.length - visible.length} more hidden. Use /recursive paths for lanes.`);
  lines.push('', 'Use', '- /recursive report 1', '- /recursive trace 1', '', 'Workspace', `- ${sparkWorkspaceRecursionsUrl()}`);
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
  const domains = [...new Set(sessions.map((session) => session.domain || session.source_kind).filter(Boolean))].sort();
  if (domains.length === 0) return 'No recursive paths found yet.';
  return ['Spark Workspace Recursive Paths', ...domains.map((domain) => `- ${domain}`)].join('\n');
}

export function renderRecursiveReviewCandidates(candidates: RecursiveReviewCandidate[]): string {
  if (candidates.length === 0) return 'No recursive candidates need review.';
  const lines = ['Spark Workspace Decisions'];
  for (const candidate of candidates.slice(0, 10)) {
    const delta = candidate.score_delta === null ? '' : ` delta=${formatDelta(candidate.score_delta)}`;
    lines.push(`- ${candidate.session_id} risk=${candidate.risk}${delta} - ${truncate(candidate.reason, 96)}`);
  }
  if (candidates.length > 10) lines.push(`...and ${candidates.length - 10} more.`);
  return lines.join('\n');
}

export function renderRecursiveDecision(record: RecursiveDecisionRecord): string {
  const lines = [
    'Recursive review decision routed.',
    `Session: ${record.session_id}`,
    `Decision: ${record.decision}`,
    `Scope: ${record.scope}`,
    `Effect: ${record.effect}`,
  ];
  if (record.target_type && record.target_id) {
    lines.push(`Target: ${record.target_type} ${record.target_id}`);
  }
  if (record.workspace_detail) {
    lines.push(record.workspace_detail);
  }
  lines.push(`Workspace: ${sparkWorkspaceDecisionsUrl()}`);
  return lines.join('\n');
}

export function renderRecursivePromotionPacket(packet: RecursivePromotionPacket): string {
  return [
    'Recursive local promotion packet staged.',
    `Session: ${packet.session_id}`,
    `Packet: ${packet.packet_id}`,
    `State: ${packet.publication_state}`,
    `Effect: ${packet.effect}`,
    `Network absorbable: ${packet.network_absorbable}`,
    'No memory, Swarm, Builder, or source artifacts were mutated.'
  ].join('\n');
}

export function renderRecursiveSwarmPacket(packet: RecursiveSwarmPacket): string {
  return [
    'Recursive Swarm review packet staged.',
    `Session: ${packet.session_id}`,
    `Packet: ${packet.swarm_packet_id}`,
    `Stage: ${packet.stage}`,
    `Effect: ${packet.effect}`,
    `Publication allowed: ${packet.publication_allowed}`,
    `Network absorbable: ${packet.network_absorbable}`,
    `Publication gate: ${packet.publication_gate.status} (${packet.publication_gate.reason})`,
    `Required next command: ${packet.publication_gate.required_next_command}`,
    'No network publication, memory mutation, Builder absorption, or source artifacts were mutated.'
  ].join('\n');
}

export function renderRecursiveCanvasQueue(result: RecursiveCanvasQueueResult): string {
  return [
    'Recursive Canvas load queued.',
    `Pipeline: ${result.load.pipelineId}`,
    `Mission: ${result.load.relay.missionId}`,
    `Nodes: ${result.load.nodes.length}`,
    `Connections: ${result.load.connections.length}`,
    `Canvas: ${result.canvasUrl}`,
    `Effect: ${result.effect}`,
    'Inspect-only: autoRun is false.'
  ].join('\n');
}

export function renderRecursiveTraceView(trace: RecursiveTraceView): string {
  const canvas = trace.spawner.canvas_queue;
  const timeline = trace.timeline.slice(-6).map(formatTraceTimelineItem);
  return [
    `${traceDisplayTitle(trace)} trace`,
    '',
    'Status',
    `- ${trace.status}`,
    trace.review.required ? `- review: ${pluralize(trace.review.decisions.length, 'decision')} waiting` : '- review: clear',
    `- workspace: ${pluralize(trace.spawner.board_entry.taskCount, 'tracked item')}`,
    `- canvas: ${canvas.pending ? 'pending' : canvas.latest ? 'ready' : 'not queued'}`,
    '',
    'Recent',
    ...(timeline.length > 0 ? timeline : ['- no timeline events']),
    '',
    'Workspace',
    `- ${sparkWorkspaceRecursionsUrl()}`,
    trace.review.required ? `- ${sparkWorkspaceDecisionsUrl()}` : null
  ].filter(isRenderableLine).join('\n');
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
  return Math.max(1, Math.min(10, Number.parseInt(raw || '3', 10) || 3));
}

function truncate(value: string, limit: number): string {
  const clean = value.replace(/\s+/g, ' ').trim();
  return clean.length <= limit ? clean : `${clean.slice(0, limit - 1).trim()}...`;
}

function hasSameDisplayedImprovement(value: string | null | undefined): boolean {
  if (!value) return false;
  const number = '-?\\d+(?:\\.\\d+)?';
  return new RegExp(`\\b(?:improved|improving)\\b[\\s\\S]*?\\bfrom\\s+(${number})\\s+to\\s+\\1\\b`, 'i').test(value);
}

function ensureSentence(value: string): string {
  const clean = value.replace(/\s+/g, ' ').trim();
  return /[.!?]$/.test(clean) ? clean : `${clean}.`;
}

function sentenceCaseFirst(value: string): string {
  const clean = value.trim();
  return clean ? `${clean.charAt(0).toUpperCase()}${clean.slice(1)}` : clean;
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
  const acronyms = new Set(['agi', 'api', 'cli', 'db', 'gpt', 'gtm', 'llm', 'qa', 'ui', 'ux', 'yc']);
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
  return truncate(labelFromKey(cleaned || title), 64);
}

function inferOutcomeVerdict(rawVerdict: string | null | undefined, metric: number | null | undefined): 'improved' | 'flat' | 'regressed' {
  const normalized = (rawVerdict || '').toLowerCase();
  if (/\b(regress\w*|worse|failed|revert\w*)\b/.test(normalized)) return 'regressed';
  if (/\b(flat|same|no[_ -]?gain)\b/.test(normalized)) return 'flat';
  if (/\b(improv\w*|kept|keep|accepted|better|pass\w*)\b/.test(normalized)) return 'improved';
  if (typeof metric === 'number' && metric > 0) return 'improved';
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
  const outcomeTimeline = outcomes.length > 0
    ? outcomes.slice(-3).map((item) => ({
      kind: 'outcome',
      title: item.id,
      status: item.verdict,
      summary: [item.summary, formatOutcomeMetric(item)].filter(Boolean).join(' ')
    }))
    : path?.bestOutcomeId
      ? [{
        kind: 'outcome',
        title: path.bestOutcomeId,
        status: 'recorded',
        summary: path.summary
      }]
      : [];
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
      })),
      ...outcomeTimeline,
      ...artifacts.slice(-3).map((item) => ({
        kind: 'artifact',
        title: item.label || item.id,
        status: item.kind,
        summary: item.path || item.url || item.id
      }))
    ]
  };
}

export function renderRecursiveWorkspaceReport(snapshot: SparkWorkspaceSnapshot, id: string): string {
  const path = findPath(snapshot, id);
  if (!path) return `Recursive loop not found in Spark Workspace: ${id}\n${sparkWorkspaceRecursionsUrl()}`;
  const spec = specializationForPath(snapshot, path);
  const pathOutcomes = outcomesForPath(snapshot, path);
  const latestOutcome = pathOutcomes.slice().sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')))[0];
  const decisions = inboxForPath(snapshot, path);
  const artifacts = artifactsForPath(snapshot, path);
  const metricLine = latestOutcome ? formatOutcomeMetric(latestOutcome) : null;
  const comparisonLine = latestOutcome ? formatOutcomeComparison(latestOutcome, pathOutcomes, path.bestOutcomeId) : null;
  const label = pathDisplayLabel(path, spec);
  const verdict = latestOutcome?.verdict || (path.bestOutcomeId ? 'recorded' : path.status);
  const sameDisplayedImprovement = latestOutcome ? hasSameDisplayedImprovement(latestOutcome.summary) : false;
  const scoreLines = [
    metricLine ? `- ${metricLine}` : null,
    comparisonLine ? `- ${formatCompareFragment(comparisonLine)}` : null
  ].filter(isRenderableLine);

  return [
    `${outcomeStatusIcon(verdict)} ${workspaceReportHeadline(label, verdict, Boolean(latestOutcome), sameDisplayedImprovement)}`,
    scoreLines.length > 0 ? '' : null,
    scoreLines.length > 0 ? 'Score' : null,
    ...scoreLines,
    decisions.length > 0 ? '' : null,
    decisions.length > 0 ? 'Review' : null,
    decisions.length > 0 ? `- ${pluralize(decisions.length, 'decision')} waiting` : null,
    decisions.length > 0 ? `- ${sparkWorkspaceDecisionsUrl()}` : null,
    '',
    'Workspace',
    artifacts.length > 0 ? `- ${pluralize(artifacts.length, 'saved item')}` : null,
    `- ${sparkWorkspaceRecursionsUrl()}`
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
  const topGroup = groups[0];
  const reasonLines = topGroup ? reviewReasonLines(topGroup) : [];
  const topActions = topGroup ? reviewTelegramActions(topGroup.item) : [];

  return [
    `${targetLabel} review`,
    '',
    'Review',
    `- ${pluralize(items.length, 'decision')} waiting`,
    topGroup ? `- blocker: ${topGroup.item.title}${topGroup.count > 1 ? ` (${pluralize(topGroup.count, 'item')})` : ''}` : null,
    reasonLines.length > 0 ? '' : null,
    reasonLines.length > 0 ? 'Why' : null,
    ...reasonLines.map((reason) => `- ${reason}`),
    topGroup?.item.recommendedAction ? '' : null,
    topGroup?.item.recommendedAction ? 'Move' : null,
    topGroup?.item.recommendedAction ? `- ${ensureSentence(truncate(topGroup.item.recommendedAction, 130))}` : null,
    topActions.length > 0 ? '' : null,
    topActions.length > 0 ? 'Actions' : null,
    ...topActions.map((action, index) => `${index + 1}. ${action}`),
    '',
    'Workspace',
    `- ${sparkWorkspaceDecisionsUrl()}`
  ].filter(isRenderableLine).join('\n');
}

function findPath(snapshot: SparkWorkspaceSnapshot, id: string): SparkWorkspaceEvolutionPath | null {
  const resolvedId = resolveRecursiveSessionId(snapshot, id);
  return snapshot.evolutionPaths.find((path) => path.id === resolvedId || path.specializationId === resolvedId) ?? null;
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
    const key = [artifact.kind, artifact.label, artifact.path || '', artifact.url || ''].join('\n');
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
  if (spec?.label) return spec.label;
  if (path.id.startsWith('path:')) return labelFromKey(path.id.slice('path:'.length));
  const builderChipMatch = /^path_builder_chip_(.+)$/.exec(path.id);
  if (builderChipMatch) return labelFromKey(builderChipMatch[1]);
  const namedPathMatch = /^path_(?:domain_autoloop|domain_chip_lab)_(.+)$/.exec(path.id);
  if (namedPathMatch) return labelFromKey(namedPathMatch[1]);
  const summaryLabel = sessionTitleLabel(path.summary || '');
  if (summaryLabel) return summaryLabel;
  return labelFromKey(path.repoLabel || path.scope || path.id);
}

function workspaceReportHeadline(
  label: string,
  verdict: string | null | undefined,
  hasOutcome: boolean,
  sameDisplayedImprovement = false
): string {
  if (!hasOutcome) return `${label} ${friendlyOutcomeVerb(verdict)}.`;
  if (sameDisplayedImprovement) return `Latest ${label} run improved slightly.`;
  return `Latest ${label} run ${friendlyOutcomeVerb(verdict)}.`;
}

function outcomeStatusIcon(verdict: string | null | undefined): string {
  const normalized = (verdict || '').toLowerCase();
  if (normalized.includes('regress')) return '\u{1F534}';
  if (normalized.includes('improv')) return '\u{1F7E2}';
  if (normalized.includes('flat')) return '\u{26AA}';
  if (normalized.includes('unknown') || normalized.includes('no rounds')) return '\u{1F7E1}';
  return '\u{26AA}';
}

function friendlyOutcomeVerb(verdict: string | null | undefined): string {
  const normalized = (verdict || '').toLowerCase();
  if (normalized.includes('regress')) return 'regressed';
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

function formatOutcomeComparison(
  latestOutcome: SparkWorkspaceOutcome,
  outcomes: SparkWorkspaceOutcome[],
  bestOutcomeId: string | null | undefined
): string | null {
  const bestOutcome = bestComparableOutcome(latestOutcome, outcomes, bestOutcomeId);
  if (!bestOutcome || typeof latestOutcome.metricValue !== 'number' || typeof bestOutcome.metricValue !== 'number') return null;

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
  return line.replace(/^Compare:\s*/i, '').replace(/[.]+$/, '');
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

  const selectedBest = bestOutcomeId
    ? comparable.find((outcome) => outcome.id === bestOutcomeId)
    : null;
  if (selectedBest) return selectedBest;

  const lowerIsBetter = metricGoalPrefersLower(latestOutcome);
  return comparable.slice().sort((a, b) =>
    lowerIsBetter
      ? (a.metricValue as number) - (b.metricValue as number)
      : (b.metricValue as number) - (a.metricValue as number)
  )[0] ?? null;
}

function metricGoalPrefersLower(outcome: SparkWorkspaceOutcome): boolean {
  const scorecardGoal = outcome.context?.scorecard?.headlineGoal || '';
  if (/\b(lower|minimi[sz]e|smaller|less)\b/i.test(scorecardGoal)) return true;
  const componentGoals = outcome.context?.scorecard?.components?.map((component) => component.goal).join(' ') || '';
  return /\b(lower|minimi[sz]e|smaller|less)\b/i.test(componentGoals);
}

function formatOutcomeMetric(outcome: SparkWorkspaceOutcome): string | null {
  if (typeof outcome.metricValue !== 'number') return null;
  return `${formatMetricLabel(outcome.metricName)} ${formatNumber(outcome.metricValue)}`;
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

function reviewReasonLines(group: ReviewItemGroup): string[] {
  if (group.count === 1) return [ensureSentence(truncate(group.summaries[0], 120))];
  const reasons = uniqueReviewReasons(group.summaries).map(friendlyReviewReason);
  if (reasons.length > 0) return reasons.map(ensureSentence);
  return [`${pluralize(group.count, 'related decision')} need the same move.`];
}

function uniqueReviewReasons(summaries: string[]): string[] {
  const reasons = new Set<string>();
  for (const summary of summaries) {
    const match = /Reasons?:\s*(.+)$/i.exec(summary);
    reasons.add((match ? match[1] : summary).replace(/[.]+$/, '').trim());
  }
  return [...reasons].filter(Boolean).slice(0, 4);
}

function friendlyReviewReason(reason: string): string {
  const cleaned = reason.replace(/[.]+$/, '').trim();
  if (/primary message exceeds the network readability limit/i.test(cleaned)) return 'Message is too long for network sharing';
  if (/contains a suspicious long opaque token/i.test(cleaned)) return 'Suspicious long opaque token';
  if (/contains inline code fencing/i.test(cleaned)) return 'Inline code fencing';
  return sentenceCaseFirst(cleaned.replace(/^contains\s+/i, ''));
}

function reviewTelegramActions(item: SparkWorkspaceInboxItem): string[] {
  if (item.kind === 'absorb' && item.targetType === 'insight') {
    return [`Approve: /recursive approve ${item.id} absorb this insight`];
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

function reviewPriorityRank(priority: string | null | undefined): number {
  const normalized = (priority || '').toLowerCase();
  if (normalized === 'high') return 3;
  if (normalized === 'medium') return 2;
  if (normalized === 'low') return 1;
  return 0;
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
  if (item.kind === 'artifact') return `- artifact: ${cleanTraceArtifactTitle(item.title, item.status)}`;
  const title = cleanTraceTimelineTitle(item.title);
  return `- ${item.kind}: ${title} (${item.status})`;
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

function formatMetricLabel(value: string | null | undefined): string {
  return (value || 'metric').replace(/_/g, ' ').replace(/\s*:\s*/g, ' / ');
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
