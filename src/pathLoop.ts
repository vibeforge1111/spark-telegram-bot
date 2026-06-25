import { execFile } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdir, readdir, readFile, rm, stat } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import { withHiddenWindows } from './hiddenProcess';
import { resolvePythonCommand } from './pythonCommand';
import { redactText } from './redaction';
import { resolveBuilderRepoPath } from './builderRepoPath';
import { parsePositiveIntegerEnvValue } from './timeoutConfig';

const execFileAsync = promisify(execFile);
const DEFAULT_PATH_LOOP_TIMEOUT_MS = 900000;

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

export interface SpecializationPathBenchmarkResult {
  ok: boolean;
  pathKey: string;
  repoRoot?: string;
  score?: number | null;
  caseCount?: number | null;
  missingEvidenceCount?: number | null;
  outputPath?: string | null;
  stdout?: string;
  stderr?: string;
  error?: string;
}

export interface SpecializationLoopStatus {
  schemaVersion?: string;
  schemaId?: string;
  loopId?: string | null;
  pathId?: string | null;
  pathKey: string;
  pathLabel?: string | null;
  domainChipId?: string | null;
  benchmarkPackId?: string | null;
  stage?: string | null;
  status?: string | null;
  evidenceState?: string | null;
  heldOutStatus?: string | null;
  trapStatus?: string | null;
  decision?: 'improved' | 'held_steady' | 'regressed' | 'unproven' | string | null;
  claimBoundary?: string | null;
  nextMove?: string | null;
  rounds?: {
    completed?: number;
    requested?: number;
    kept?: number;
    reverted?: number;
    stopReason?: string | null;
  } | null;
  comparison?: {
    scoreMetric?: string;
    baselineScore?: number;
    candidateScore?: number;
    delta?: number;
    decision?: string;
  } | null;
  rawArtifactRefs?: Record<string, unknown>;
  workspaceLinks?: Record<string, unknown>;
  updatedAt?: string | null;
  ok?: boolean;
  stdout?: string;
  stderr?: string;
  error?: string;
}

export interface SpecializationLoopPackageResult {
  ok: boolean;
  pathKey: string;
  packagePath?: string | null;
  packet?: {
    packetId?: string | null;
    path?: {
      pathId?: string | null;
      pathKey?: string | null;
      pathLabel?: string | null;
    } | null;
    claim?: {
      decision?: string | null;
      evidenceState?: string | null;
      state?: string | null;
      claimBoundary?: string | null;
      nextMove?: string | null;
    } | null;
    benchmark?: {
      benchmarkPackId?: string | null;
      comparison?: {
        scoreMetric?: string;
        baselineScore?: number;
        candidateScore?: number;
        delta?: number;
        decision?: string;
      } | null;
      heldOutStatus?: string | null;
      trapStatus?: string | null;
    } | null;
    reusableTemplateCandidate?: {
      eligible?: boolean;
      reason?: string | null;
    } | null;
    publication?: {
      state?: string | null;
      published?: boolean;
      networkAbsorbable?: boolean;
      boundary?: string | null;
    } | null;
  } | null;
  status?: SpecializationLoopStatus | null;
  stdout?: string;
  stderr?: string;
  error?: string;
}

export interface SpecializationLoopInsights {
  ok: boolean;
  pathKey: string;
  pathLabel?: string | null;
  status?: SpecializationLoopStatus | null;
  sessionId?: string | null;
  completedRounds?: number;
  requestedRounds?: number;
  keptRounds?: number;
  revertedRounds?: number;
  startScore?: number | null;
  currentScore?: number | null;
  bestScore?: number | null;
  bestRoundOrdinal?: number | null;
  bestCandidateSummary?: string | null;
  keptCandidateSummaries?: string[];
  stopReason?: string | null;
  sessionSummaryPath?: string | null;
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
  const builderRepo = resolveBuilderRepoPath({ configuredRepo: process.env.SPARK_BUILDER_REPO });
  const swarmRuntimeRoot = path.resolve(
    process.env.SPARK_SWARM_RUNTIME_ROOT ||
    process.env.SPARK_SWARM_REPO ||
    path.join(os.homedir(), 'Desktop', 'spark-swarm')
  );
  const startupBenchRepo = path.resolve(
    process.env.SPARK_STARTUP_BENCH_REPO || path.join(os.homedir(), 'Desktop', 'startup-bench')
  );
  return {
    pythonCommand: resolvePythonCommand(process.env.SPARK_SWARM_BRIDGE_PYTHON || process.env.SPARK_BUILDER_PYTHON),
    builderRepo,
    builderHome: path.resolve(
      process.env.SPARK_BUILDER_HOME || path.join(os.homedir(), '.spark', 'state', 'spark-intelligence')
    ),
    swarmRuntimeRoot,
    startupBenchRepo,
    timeoutMs: parsePositiveIntegerEnvValue(
      process.env.PATH_LOOP_TIMEOUT_MS,
      parsePositiveIntegerEnvValue(process.env.CHIP_LOOP_TIMEOUT_MS, DEFAULT_PATH_LOOP_TIMEOUT_MS)
    ),
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
  const normalizedTarget = String(targetKey || '').trim().replace(/^path:/i, '');
  if (!normalizedTarget) return null;

  const candidates = [
    process.env[specializationRepoEnvVar(normalizedTarget)],
    normalizedTarget === 'spark-qa-operator' ? process.env.SPARK_QA_OPERATOR_REPO : undefined,
    path.resolve(process.cwd(), '..', `specialization-path-${normalizedTarget}`),
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
  try {
    return JSON.parse(stdout);
  } catch (err) {
    console.error('[pathLoop] Failed to parse attachment snapshot:', err);
    return {};
  }
}

export async function resolveRecursiveStartTarget(targetKey: string): Promise<RecursiveStartTarget> {
  if (!targetKey) return { kind: 'chip', key: targetKey };
  const localPathTarget = resolveLocalSpecializationPathTarget(targetKey);
  try {
    const classified = classifyBuilderAttachmentTargetFromSnapshot(await loadBuilderAttachmentSnapshot(resolveConfig()), targetKey);
    if (classified.kind === 'path') return localPathTarget || classified;
    return localPathTarget || classified;
  } catch {
    return localPathTarget || { kind: 'chip', key: targetKey };
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
    String(Math.max(1, Math.min(50, input.rounds || 1))),
  ];
  if (input.sync?.workspaceId && input.sync?.apiUrl && input.sync?.accessToken) {
    args.push('--sync-collective');
    args.push('--workspace-id', input.sync.workspaceId);
    args.push('--api-url', input.sync.apiUrl);
    args.push('--access-token', input.sync.accessToken);
  }
  return args;
}

export function buildSpecializationPathStatusBridgeArgs(input: {
  pathKey: string;
  repoRoot: string;
}): string[] {
  return [
    '-m',
    'spark_swarm_bridge.cli',
    'specialization-path',
    'status',
    input.pathKey,
    input.repoRoot,
    '--json',
  ];
}

export function buildSpecializationPathPackageBridgeArgs(input: {
  pathKey: string;
  repoRoot: string;
}): string[] {
  return [
    '-m',
    'spark_swarm_bridge.cli',
    'specialization-path',
    'package',
    input.pathKey,
    input.repoRoot,
    '--json',
  ];
}

export function buildSpecializationPathEvidenceBenchmarkArgs(input: {
  casesPath: string;
  evidenceRoot: string;
  outputPath: string;
}): string[] {
  return [
    '-m',
    'specialization_path_spark_qa_operator.cli',
    'evidence-benchmark',
    '--cases',
    input.casesPath,
    '--evidence-root',
    input.evidenceRoot,
    '--output',
    input.outputPath,
  ];
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

async function readBenchmarkCaseCount(casesPath: string): Promise<number | null> {
  const parsed = await readJsonObject(casesPath);
  return Array.isArray(parsed?.cases) ? parsed.cases.length : null;
}

export async function runSpecializationPathBenchmark(
  target: RecursiveStartTarget
): Promise<SpecializationPathBenchmarkResult> {
  const pathKey = target.key;
  const repoRoot = target.repoRoot;
  if (!pathKey) return { ok: false, pathKey, error: 'empty specialization path key' };
  if (!repoRoot) return { ok: false, pathKey, error: `specialization path ${pathKey} has no attached repo root` };

  const config = resolveConfig();
  const casesPath = path.join(repoRoot, 'benchmarks', 'evidence', 'mac_lab_cases.json');
  const evidenceRoot = path.join(repoRoot, 'benchmarks', 'evidence', 'runs', 'latest');
  const outputPath = path.join(repoRoot, '.spark-swarm', 'evidence-benchmark', 'latest-from-telegram.json');
  await mkdir(path.dirname(outputPath), { recursive: true });
  await rm(outputPath, { force: true });

  const args = buildSpecializationPathEvidenceBenchmarkArgs({ casesPath, evidenceRoot, outputPath });
  const env: NodeJS.ProcessEnv = { ...process.env, PYTHONIOENCODING: 'utf-8' };
  const specializationPathSrc = path.join(repoRoot, 'src');
  env.PYTHONPATH = [specializationPathSrc, env.PYTHONPATH].filter(Boolean).join(path.delimiter);

  try {
    const { stdout, stderr } = await execFileAsync(config.pythonCommand, args, withHiddenWindows({
      cwd: repoRoot,
      timeout: 120000,
      env,
      maxBuffer: 10 * 1024 * 1024,
    }));
    const parsed = await readJsonObject(outputPath);
    if (!parsed) {
      return { ok: false, pathKey, repoRoot, outputPath, stdout, stderr, error: 'benchmark runner did not write a score artifact' };
    }
    const expectedCaseCount = await readBenchmarkCaseCount(casesPath);
    const caseCount = typeof parsed.caseCount === 'number' ? parsed.caseCount : null;
    if (expectedCaseCount !== null && caseCount !== expectedCaseCount) {
      return {
        ok: false,
        pathKey,
        repoRoot,
        score: typeof parsed.overallScore === 'number' ? parsed.overallScore : null,
        caseCount,
        missingEvidenceCount: typeof parsed.missingEvidenceCount === 'number' ? parsed.missingEvidenceCount : null,
        outputPath,
        stdout,
        stderr,
        error: `benchmark runner caseCount ${caseCount} does not match the benchmark case pack count ${expectedCaseCount}`,
      };
    }
    const score = typeof parsed.overallScore === 'number' ? parsed.overallScore : null;
    const missingEvidenceCount = typeof parsed.missingEvidenceCount === 'number' ? parsed.missingEvidenceCount : null;
    const pass = parsed.pass === true && (missingEvidenceCount === null || missingEvidenceCount === 0);
    return {
      ok: pass,
      pathKey,
      repoRoot,
      score,
      caseCount,
      missingEvidenceCount,
      outputPath,
      stdout,
      stderr,
      error: pass ? undefined : 'benchmark runner did not pass evidence gates',
    };
  } catch (err: any) {
    const stdout = redactText(typeof err?.stdout === 'string' ? err.stdout : '');
    const stderr = redactText(typeof err?.stderr === 'string' ? err.stderr : '');
    const message = redactText(err?.message ? String(err.message) : '');
    return {
      ok: false,
      pathKey,
      repoRoot,
      outputPath,
      stdout,
      stderr,
      error: message ? `${message}${stderr ? ': ' + stderr.slice(-400) : ''}` : 'benchmark runner failed',
    };
  }
}

function sessionSummaryPath(repoRoot: string, pathKey: string, sessionId: string | null): string | null {
  if (!sessionId) return null;
  return path.join(repoRoot, '.spark-swarm', 'specialization-paths', pathKey, 'sessions', sessionId, 'summary.json');
}

function sessionsRoot(repoRoot: string, pathKey: string): string {
  return path.join(repoRoot, '.spark-swarm', 'specialization-paths', pathKey, 'sessions');
}

async function latestSessionSummaryPath(repoRoot: string, pathKey: string): Promise<string | null> {
  const root = sessionsRoot(repoRoot, pathKey);
  if (!existsSync(root)) return null;
  const entries = await readdir(root, { withFileTypes: true });
  const dirs = await Promise.all(entries
    .filter((entry) => entry.isDirectory())
    .map(async (entry) => {
      const dirPath = path.join(root, entry.name);
      const summaryPath = path.join(dirPath, 'summary.json');
      if (!existsSync(summaryPath)) return null;
      const info = await stat(summaryPath);
      return { summaryPath, mtimeMs: info.mtimeMs };
    }));
  const newest = dirs
    .filter((entry): entry is { summaryPath: string; mtimeMs: number } => Boolean(entry))
    .sort((a, b) => b.mtimeMs - a.mtimeMs)[0];
  return newest?.summaryPath || null;
}

function firstRoundBaselineScore(rounds: any[]): number | null {
  const first = rounds.find((round) => typeof round?.baselineScore === 'number');
  return typeof first?.baselineScore === 'number' ? first.baselineScore : null;
}

function bestKeptRound(rounds: any[]): any | null {
  const kept = rounds.filter((round) => round?.decision === 'kept');
  if (kept.length === 0) return null;
  return kept
    .slice()
    .sort((a, b) => Number(b?.resultingScore ?? b?.candidateScore ?? -Infinity) - Number(a?.resultingScore ?? a?.candidateScore ?? -Infinity))[0];
}

export async function readSpecializationPathLoopInsights(target: RecursiveStartTarget): Promise<SpecializationLoopInsights> {
  const pathKey = target.key;
  const repoRoot = target.repoRoot;
  if (!pathKey) return { ok: false, pathKey, error: 'empty specialization path key' };
  if (!repoRoot) return { ok: false, pathKey, error: `specialization path ${pathKey} has no attached repo root` };

  try {
    const summaryPath = await latestSessionSummaryPath(repoRoot, pathKey);
    const summary = await readJsonObject(summaryPath);
    if (!summary) return { ok: false, pathKey, error: 'No specialization loop session summary found yet.' };
    const rounds = Array.isArray(summary.rounds) ? summary.rounds : [];
    const bestRound = bestKeptRound(rounds);
    return {
      ok: true,
      pathKey,
      pathLabel: typeof summary?.path?.label === 'string' ? summary.path.label : null,
      sessionId: typeof summary.sessionId === 'string' ? summary.sessionId : null,
      completedRounds: Number.isFinite(Number(summary.completedRounds)) ? Number(summary.completedRounds) : undefined,
      requestedRounds: Number.isFinite(Number(summary.requestedRoundsTotal)) ? Number(summary.requestedRoundsTotal) : undefined,
      keptRounds: Number.isFinite(Number(summary.keptRounds)) ? Number(summary.keptRounds) : undefined,
      revertedRounds: Number.isFinite(Number(summary.revertedRounds)) ? Number(summary.revertedRounds) : undefined,
      startScore: firstRoundBaselineScore(rounds),
      currentScore: typeof summary.currentScore === 'number' ? summary.currentScore : null,
      bestScore: typeof summary.bestScore === 'number' ? summary.bestScore : null,
      bestRoundOrdinal: typeof bestRound?.ordinal === 'number' ? bestRound.ordinal : null,
      bestCandidateSummary: typeof bestRound?.candidateSummary === 'string' ? bestRound.candidateSummary : null,
      keptCandidateSummaries: rounds
        .filter((round) => round?.decision === 'kept' && typeof round?.candidateSummary === 'string')
        .map((round) => String(round.candidateSummary)),
      stopReason: typeof summary.stopReason === 'string' ? summary.stopReason : null,
      sessionSummaryPath: summaryPath,
    };
  } catch (err: any) {
    return { ok: false, pathKey, error: redactText(err?.message ? String(err.message) : String(err)) };
  }
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
  const pythonDir = path.dirname(config.pythonCommand);
  if (pythonDir && pythonDir !== '.') {
    env.PATH = [pythonDir, env.PATH].filter(Boolean).join(path.delimiter);
  }
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

export async function readSpecializationPathLoopStatus(
  target: RecursiveStartTarget
): Promise<SpecializationLoopStatus> {
  const pathKey = target.key;
  const repoRoot = target.repoRoot;
  if (!pathKey) return { ok: false, pathKey, error: 'empty specialization path key' };
  if (!repoRoot) return { ok: false, pathKey, error: `specialization path ${pathKey} has no attached repo root` };

  const config = resolveConfig();
  const cwd = bridgeCwd(config);
  const src = bridgeSrc(config);
  if (!existsSync(cwd) || !existsSync(src)) {
    return { ok: false, pathKey, error: 'Specialization path status needs the local Spark Swarm bridge.' };
  }

  const args = buildSpecializationPathStatusBridgeArgs({ pathKey, repoRoot });
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

  try {
    const { stdout, stderr } = await execFileAsync(config.pythonCommand, args, withHiddenWindows({
      cwd,
      timeout: 60000,
      env,
      maxBuffer: 10 * 1024 * 1024,
    }));
    const parsed = JSON.parse(stdout);
    return {
      ok: true,
      ...(parsed && typeof parsed === 'object' ? parsed : {}),
      pathKey,
      stdout,
      stderr,
    };
  } catch (err: any) {
    const stdout = redactText(typeof err?.stdout === 'string' ? err.stdout : '');
    const stderr = redactText(typeof err?.stderr === 'string' ? err.stderr : '');
    const message = redactText(err?.message ? String(err.message) : '');
    try {
      const parsed = JSON.parse(stdout);
      if (parsed && typeof parsed === 'object') {
        return {
          ok: true,
          ...parsed,
          pathKey,
          stdout,
          stderr,
        };
      }
    } catch {
      // Fall through to the unavailable-status reply below.
    }
    return {
      ok: false,
      pathKey,
      stdout,
      stderr,
      error: message ? `${message}${stderr ? ': ' + stderr.slice(-400) : ''}` : 'specialization path status failed',
    };
  }
}

export async function packageSpecializationPathLoop(
  target: RecursiveStartTarget
): Promise<SpecializationLoopPackageResult> {
  const pathKey = target.key;
  const repoRoot = target.repoRoot;
  if (!pathKey) return { ok: false, pathKey, error: 'empty specialization path key' };
  if (!repoRoot) return { ok: false, pathKey, error: `specialization path ${pathKey} has no attached repo root` };

  const config = resolveConfig();
  const cwd = bridgeCwd(config);
  const src = bridgeSrc(config);
  if (!existsSync(cwd) || !existsSync(src)) {
    return { ok: false, pathKey, error: 'Specialization path packaging needs the local Spark Swarm bridge.' };
  }

  const args = buildSpecializationPathPackageBridgeArgs({ pathKey, repoRoot });
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

  try {
    const { stdout, stderr } = await execFileAsync(config.pythonCommand, args, withHiddenWindows({
      cwd,
      timeout: 60000,
      env,
      maxBuffer: 10 * 1024 * 1024,
    }));
    const parsed = JSON.parse(stdout);
    return {
      ok: Boolean(parsed?.ok),
      ...(parsed && typeof parsed === 'object' ? parsed : {}),
      pathKey,
      stdout,
      stderr,
    };
  } catch (err: any) {
    const stdout = redactText(typeof err?.stdout === 'string' ? err.stdout : '');
    const stderr = redactText(typeof err?.stderr === 'string' ? err.stderr : '');
    const message = redactText(err?.message ? String(err.message) : '');
    try {
      const parsed = JSON.parse(stdout);
      if (parsed && typeof parsed === 'object') {
        return {
          ok: Boolean(parsed.ok),
          ...parsed,
          pathKey,
          stdout,
          stderr,
        };
      }
    } catch {
      // Fall through to the unavailable-package reply below.
    }
    return {
      ok: false,
      pathKey,
      stdout,
      stderr,
      error: message ? `${message}${stderr ? ': ' + stderr.slice(-400) : ''}` : 'specialization path packaging failed',
    };
  }
}
