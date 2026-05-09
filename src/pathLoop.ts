import { execFile } from 'node:child_process';
import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import { withHiddenWindows } from './hiddenProcess';
import { resolvePythonCommand } from './pythonCommand';
import { redactText } from './redaction';

const execFileAsync = promisify(execFile);

export interface RecursiveStartTarget {
  kind: 'chip' | 'path';
  key: string;
  repoRoot?: string;
  capabilities?: string[];
}

export interface PathLoopResult {
  ok: boolean;
  pathKey: string;
  repoRoot?: string;
  roundsCompleted?: number;
  totalRounds?: number;
  stopReason?: string | null;
  sessionId?: string | null;
  sessionSummaryPath?: string | null;
  payloadPath?: string | null;
  latestCandidatePath?: string | null;
  workspaceSynced?: boolean;
  pathId?: string | null;
  outcomeId?: string | null;
  verdict?: string | null;
  metricName?: string | null;
  metricValue?: number | null;
  summary?: string | null;
  stdout?: string;
  stderr?: string;
  error?: string;
}

interface PathLoopConfig {
  pythonCommand: string;
  builderRepo: string;
  builderHome: string;
  swarmRuntimeRoot: string;
  startupBenchRepo: string;
  timeoutMs: number;
}

export interface WorkspaceSyncHints {
  apiUrl?: string;
  workspaceId?: string;
  accessToken?: string;
}

function resolveConfig(): PathLoopConfig {
  const builderRepo = path.resolve(
    process.env.SPARK_BUILDER_REPO || path.join(process.cwd(), '..', 'spark-intelligence-builder')
  );
  const swarmRuntimeRoot = path.resolve(
    process.env.SPARK_SWARM_RUNTIME_ROOT ||
    process.env.SPARK_SWARM_REPO ||
    path.join(os.homedir(), 'Desktop', 'spark-swarm')
  );
  const startupBenchRepo = path.resolve(
    process.env.SPARK_STARTUP_BENCH_REPO || path.join(os.homedir(), 'Desktop', 'startup-bench')
  );
  return {
    pythonCommand: resolvePythonCommand(process.env.SPARK_BUILDER_PYTHON || process.env.SPARK_SWARM_BRIDGE_PYTHON),
    builderRepo,
    builderHome: path.resolve(
      process.env.SPARK_BUILDER_HOME || path.join(os.homedir(), '.spark', 'state', 'spark-intelligence')
    ),
    swarmRuntimeRoot,
    startupBenchRepo,
    timeoutMs: Number.parseInt(process.env.PATH_LOOP_TIMEOUT_MS || process.env.CHIP_LOOP_TIMEOUT_MS || '900000', 10) || 900000,
  };
}

function normalizeKey(value: string): string {
  return String(value || '').trim().toLowerCase();
}

function normalizeRepoRoot(value: unknown): string | undefined {
  const normalized = String(value || '').trim();
  return normalized || undefined;
}

function recordCapabilities(record: any): string[] {
  return Array.isArray(record?.capabilities) ? record.capabilities.map((item: unknown) => String(item)) : [];
}

export function classifyBuilderAttachmentTargetFromSnapshot(snapshot: any, targetKey: string): RecursiveStartTarget {
  const fallback: RecursiveStartTarget = { kind: 'chip', key: targetKey };
  const normalizedTarget = normalizeKey(targetKey);
  const records = Array.isArray(snapshot?.records) ? snapshot.records : [];

  const pathRecord = records.find((record: any) => (
    normalizeKey(record?.kind) === 'path' && normalizeKey(record?.key) === normalizedTarget
  ));
  if (pathRecord) {
    return {
      kind: 'path',
      key: String(pathRecord.key || targetKey),
      repoRoot: normalizeRepoRoot(pathRecord.repo_root),
      capabilities: recordCapabilities(pathRecord),
    };
  }

  const chipRecord = records.find((record: any) => (
    normalizeKey(record?.kind) === 'chip' && normalizeKey(record?.key) === normalizedTarget
  ));
  if (chipRecord) {
    return {
      kind: 'chip',
      key: String(chipRecord.key || targetKey),
      repoRoot: normalizeRepoRoot(chipRecord.repo_root),
      capabilities: recordCapabilities(chipRecord),
    };
  }

  return fallback;
}

export function resolveLocalSpecializationPathTarget(targetKey: string): RecursiveStartTarget | null {
  const normalizedTarget = String(targetKey || '').trim();
  if (!normalizedTarget) return null;

  const candidates = [
    process.env[specializationRepoEnvVar(normalizedTarget)],
    path.join(os.homedir(), 'Desktop', `specialization-path-${normalizedTarget}`),
  ].filter((candidate): candidate is string => Boolean(candidate));

  for (const candidate of candidates) {
    const repoRoot = path.resolve(candidate);
    if (existsSync(path.join(repoRoot, 'specialization-path.json'))) {
      return {
        kind: 'path',
        key: normalizedTarget,
        repoRoot,
      };
    }
  }
  return null;
}

async function loadBuilderAttachmentSnapshot(config: PathLoopConfig): Promise<any> {
  const args = [
    '-m',
    'spark_intelligence.cli',
    'attachments',
    'snapshot',
    '--home',
    config.builderHome,
    '--json',
  ];
  const { stdout } = await execFileAsync(config.pythonCommand, args, withHiddenWindows({
    cwd: config.builderRepo,
    timeout: 60000,
    env: { ...process.env, PYTHONIOENCODING: 'utf-8' },
    maxBuffer: 10 * 1024 * 1024,
  }));
  return JSON.parse(stdout);
}

export async function resolveRecursiveStartTarget(targetKey: string): Promise<RecursiveStartTarget> {
  if (!targetKey) return { kind: 'chip', key: targetKey };
  try {
    const classified = classifyBuilderAttachmentTargetFromSnapshot(await loadBuilderAttachmentSnapshot(resolveConfig()), targetKey);
    if (classified.kind === 'path') return classified;
    return resolveLocalSpecializationPathTarget(targetKey) || classified;
  } catch {
    return resolveLocalSpecializationPathTarget(targetKey) || { kind: 'chip', key: targetKey };
  }
}

function specializationRepoEnvVar(pathKey: string): string {
  return `SPARK_SWARM_SPECIALIZATION_PATH_${String(pathKey || '').trim().toUpperCase().replace(/-/g, '_')}_REPO`;
}

function bridgeSrc(config: PathLoopConfig): string {
  return path.join(config.swarmRuntimeRoot, 'apps', 'bridge', 'src');
}

function bridgeCwd(config: PathLoopConfig): string {
  return path.join(config.swarmRuntimeRoot, 'apps', 'bridge');
}

export function buildSpecializationPathAutoloopBridgeArgs(input: {
  pathKey: string;
  repoRoot: string;
  rounds: number;
  sync?: WorkspaceSyncHints;
}): string[] {
  const args = [
    '-m',
    'spark_swarm_bridge.cli',
    'specialization-path',
    'autoloop',
    input.pathKey,
    input.repoRoot,
    '--rounds',
    String(Math.max(1, Math.min(10, input.rounds || 1))),
  ];
  if (input.sync?.workspaceId && input.sync?.apiUrl && input.sync?.accessToken) {
    args.push('--sync-collective');
    args.push('--workspace-id', input.sync.workspaceId);
    args.push('--api-url', input.sync.apiUrl);
    args.push('--access-token', input.sync.accessToken);
  }
  return args;
}

function parseLabeledLine(stdout: string, label: string): string | null {
  const pattern = new RegExp(`^${label}:\\s*(.+)$`, 'im');
  return stdout.match(pattern)?.[1]?.trim() || null;
}

async function readJsonObject(filePath: string | null): Promise<Record<string, any> | null> {
  if (!filePath || !existsSync(filePath)) return null;
  const parsed = JSON.parse(await readFile(filePath, 'utf-8'));
  return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : null;
}

function sessionSummaryPath(repoRoot: string, pathKey: string, sessionId: string | null): string | null {
  if (!sessionId) return null;
  return path.join(repoRoot, '.spark-swarm', 'specialization-paths', pathKey, 'sessions', sessionId, 'summary.json');
}

function firstArrayItem(payload: Record<string, any> | null, key: string): any | null {
  const items = Array.isArray(payload?.[key]) ? payload?.[key] : [];
  return items[0] || null;
}

async function buildPathLoopResult(input: {
  ok: boolean;
  pathKey: string;
  repoRoot: string;
  rounds: number;
  stdout: string;
  stderr: string;
  error?: string;
  workspaceSynced?: boolean;
}): Promise<PathLoopResult> {
  const sessionId = parseLabeledLine(input.stdout, 'Session id');
  const payloadPath = parseLabeledLine(input.stdout, 'Collective payload');
  const latestCandidatePath = parseLabeledLine(input.stdout, 'Latest candidate');
  const summaryPath = sessionSummaryPath(input.repoRoot, input.pathKey, sessionId);
  const sessionSummary = await readJsonObject(summaryPath);
  const collectivePayload = await readJsonObject(payloadPath);
  const outcome = firstArrayItem(collectivePayload, 'outcomes');
  const evolutionPath = firstArrayItem(collectivePayload, 'evolutionPaths');

  return {
    ok: input.ok,
    pathKey: input.pathKey,
    repoRoot: input.repoRoot,
    roundsCompleted: Number.isFinite(Number(sessionSummary?.completedRounds))
      ? Number(sessionSummary?.completedRounds)
      : undefined,
    totalRounds: Number.isFinite(Number(sessionSummary?.requestedRoundsTotal))
      ? Number(sessionSummary?.requestedRoundsTotal)
      : input.rounds,
    stopReason: typeof sessionSummary?.stopReason === 'string' ? sessionSummary.stopReason : null,
    sessionId,
    sessionSummaryPath: summaryPath,
    payloadPath,
    latestCandidatePath,
    workspaceSynced: Boolean(input.workspaceSynced),
    pathId: typeof evolutionPath?.id === 'string' ? evolutionPath.id : typeof outcome?.targetId === 'string' ? outcome.targetId : null,
    outcomeId: typeof outcome?.id === 'string' ? outcome.id : null,
    verdict: typeof outcome?.verdict === 'string' ? outcome.verdict : null,
    metricName: typeof outcome?.metricName === 'string' ? outcome.metricName : null,
    metricValue: typeof outcome?.metricValue === 'number' ? outcome.metricValue : null,
    summary: typeof outcome?.summary === 'string'
      ? outcome.summary
      : typeof evolutionPath?.summary === 'string'
        ? evolutionPath.summary
        : null,
    stdout: input.stdout,
    stderr: input.stderr,
    error: input.error,
  };
}

export async function runSpecializationPathAutoloop(
  target: RecursiveStartTarget,
  rounds: number,
  sync?: WorkspaceSyncHints
): Promise<PathLoopResult> {
  const pathKey = target.key;
  const repoRoot = target.repoRoot;
  if (!pathKey) return { ok: false, pathKey, error: 'empty specialization path key' };
  if (!repoRoot) return { ok: false, pathKey, error: `specialization path ${pathKey} has no attached repo root` };

  const config = resolveConfig();
  const cwd = bridgeCwd(config);
  const src = bridgeSrc(config);
  if (!existsSync(cwd) || !existsSync(src)) {
    return { ok: false, pathKey, repoRoot, error: 'Specialization path loops need the local path runner. This public install can still run local Builder chip loops with /recursive start <chipKey> rounds 1.' };
  }

  const args = buildSpecializationPathAutoloopBridgeArgs({
    pathKey,
    repoRoot,
    rounds,
    sync,
  });
  const env: NodeJS.ProcessEnv = { ...process.env, PYTHONIOENCODING: 'utf-8' };
  const pythonPathEntries = [src];
  const startupBenchSrc = path.join(config.startupBenchRepo, 'src');
  const specializationPathSrc = path.join(repoRoot, 'src');
  if (existsSync(startupBenchSrc)) pythonPathEntries.push(startupBenchSrc);
  if (existsSync(specializationPathSrc)) pythonPathEntries.push(specializationPathSrc);
  if (env.PYTHONPATH) pythonPathEntries.push(env.PYTHONPATH);
  env.PYTHONPATH = pythonPathEntries.join(path.delimiter);
  env.SPARK_SWARM_STATE_DIR = path.join(config.swarmRuntimeRoot, '.state');
  env[specializationRepoEnvVar(pathKey)] = repoRoot;
  if (existsSync(config.startupBenchRepo)) env.SPARK_STARTUP_BENCH_REPO = config.startupBenchRepo;
  const researcherRepo = path.resolve(config.swarmRuntimeRoot, '..', 'spark-researcher');
  if (existsSync(researcherRepo)) env.SPARK_RESEARCHER_REPO = researcherRepo;

  try {
    const { stdout, stderr } = await execFileAsync(config.pythonCommand, args, withHiddenWindows({
      cwd,
      timeout: config.timeoutMs,
      env,
      maxBuffer: 20 * 1024 * 1024,
    }));
    return await buildPathLoopResult({
      ok: true,
      pathKey,
      repoRoot,
      rounds,
      stdout,
      stderr,
      workspaceSynced: Boolean(sync?.workspaceId && sync?.apiUrl && sync?.accessToken),
    });
  } catch (err: any) {
    const stdout = redactText(typeof err?.stdout === 'string' ? err.stdout : '');
    const stderr = redactText(typeof err?.stderr === 'string' ? err.stderr : '');
    const message = redactText(err?.message ? String(err.message) : '');
    return await buildPathLoopResult({
      ok: false,
      pathKey,
      repoRoot,
      rounds,
      stdout,
      stderr,
      error: message ? `${message}${stderr ? ': ' + stderr.slice(-400) : ''}` : 'specialization path autoloop failed',
      workspaceSynced: Boolean(sync?.workspaceId && sync?.apiUrl && sync?.accessToken),
    });
  }
}
