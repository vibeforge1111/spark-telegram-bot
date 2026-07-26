import { execFile } from 'node:child_process';
import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import { withHiddenWindows } from './hiddenProcess';
import { resolvePythonCommand } from './pythonCommand';
import { redactText } from './redaction';

const execFileAsync = promisify(execFile);

export interface SparkQaCommand {
  action: 'help' | 'run' | 'status' | 'benchmark' | 'startup';
  specializationPath?: string;
  level?: number;
  prompt?: string;
}

export interface SparkQaAutoloopRoundResult {
  ok: boolean;
  proofRan: boolean;
  repoRoot?: string;
  outputRoot?: string;
  reportPath?: string | null;
  latestManifestPath?: string | null;
  report?: Record<string, any> | null;
  stdout?: string;
  stderr?: string;
  error?: string;
  commandExitCode?: number | null;
}

export interface SparkQaBenchmarkCreatorResult {
  ok: boolean;
  repoRoot?: string;
  outputDir?: string;
  level?: number;
  specializationPath?: string;
  payload?: Record<string, any> | null;
  stdout?: string;
  stderr?: string;
  error?: string;
}

export interface StartupBenchDossierResult {
  ok: boolean;
  repoRoot?: string;
  dossierPath?: string | null;
  dossier?: Record<string, any> | null;
  error?: string;
}

export interface StartupReleaseVerdictResult {
  ok: boolean;
  repoRoot?: string;
  dossierPath?: string | null;
  reportPath?: string | null;
  dossier?: Record<string, any> | null;
  report?: Record<string, any> | null;
  verdict?: {
    localImprovementEvidence: boolean;
    releaseClaimAllowed: boolean;
    publicReady: boolean;
    networkAbsorbable: boolean;
    blockers: string[];
    nextGate: string;
  };
  error?: string;
}

function unique(values: Array<string | null | undefined>): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const value of values) {
    const clean = String(value || '').trim();
    if (!clean || seen.has(clean)) continue;
    seen.add(clean);
    result.push(clean);
  }
  return result;
}

function repoLooksLikeSparkQaOperator(repoRoot: string): boolean {
  return existsSync(path.join(repoRoot, 'specialization-path.json')) &&
    existsSync(path.join(repoRoot, 'src', 'specialization_path_spark_qa_operator'));
}

export function resolveSparkQaOperatorRepo(configuredRepo?: string): string | null {
  const sibling = path.resolve(process.cwd(), '..', 'specialization-path-spark-qa-operator');
  const candidates = unique([
    configuredRepo,
    process.env.SPARK_SWARM_SPECIALIZATION_PATH_SPARK_QA_OPERATOR_REPO,
    process.env.SPARK_QA_OPERATOR_REPO,
    sibling,
    path.join(homedir(), 'Desktop', 'specialization-path-spark-qa-operator'),
  ]);

  for (const candidate of candidates) {
    const repoRoot = path.resolve(candidate);
    if (repoLooksLikeSparkQaOperator(repoRoot)) return repoRoot;
  }
  return null;
}

function timestampId(): string {
  return new Date().toISOString().replace(/[-:.]/g, '').replace('T', 'T').replace('Z', 'Z').slice(0, 16).toLowerCase();
}

function pythonCommand(): string {
  return resolvePythonCommand(process.env.SPARK_QA_OPERATOR_PYTHON || process.env.SPARK_SWARM_BRIDGE_PYTHON || process.env.SPARK_BUILDER_PYTHON || 'python3');
}

function envForRepo(repoRoot: string): NodeJS.ProcessEnv {
  return {
    ...process.env,
    PYTHONIOENCODING: 'utf-8',
    PYTHONPATH: [path.join(repoRoot, 'src'), process.env.PYTHONPATH].filter(Boolean).join(path.delimiter),
    SPARK_QA_OPERATOR_REPO: repoRoot,
    SPARK_SWARM_SPECIALIZATION_PATH_SPARK_QA_OPERATOR_REPO: repoRoot,
  };
}

function readJsonFromText(text: string): Record<string, any> | null {
  const clean = text.trim();
  if (!clean) return null;
  try {
    const parsed = JSON.parse(clean);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : null;
  } catch {
    const firstBrace = clean.indexOf('{');
    const lastBrace = clean.lastIndexOf('}');
    if (firstBrace < 0 || lastBrace <= firstBrace) return null;
    try {
      const parsed = JSON.parse(clean.slice(firstBrace, lastBrace + 1));
      return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : null;
    } catch {
      return null;
    }
  }
}

async function readJsonFile(filePath: string | null | undefined): Promise<Record<string, any> | null> {
  if (!filePath || !existsSync(filePath)) return null;
  const parsed = JSON.parse(await readFile(filePath, 'utf-8'));
  return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : null;
}

function startupBenchBoundDossierIsClaimReady(dossier: Record<string, any> | null): boolean {
  const promotionDossier = dossier?.promotionDossier || {};
  const proofGateBundle = dossier?.proofGateBundle || {};
  return (
    dossier?.scoreClaimAllowed === true &&
    dossier?.improvementClaimAllowed === true &&
    promotionDossier.scoreClaimAllowed === true &&
    promotionDossier.improvementClaimAllowed === true &&
    promotionDossier.public_ready !== true &&
    promotionDossier.network_absorbable !== true &&
    typeof proofGateBundle.bundleId === 'string' &&
    proofGateBundle.status === 'ready'
  );
}

async function findLatestBoundStartupBenchDossier(repoRoot: string): Promise<{ path: string; dossier: Record<string, any> } | null> {
  const runsRoot = path.join(repoRoot, '.spark-swarm', 'autoloop', 'runs');
  if (!existsSync(runsRoot)) return null;
  const { readdir, stat } = await import('node:fs/promises');
  const candidates: Array<{ path: string; dossier: Record<string, any>; claimReady: boolean; mtimeMs: number }> = [];
  for (const entry of await readdir(runsRoot, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const dossierPath = path.join(runsRoot, entry.name, 'startup_bench_proof_report.bound.json');
    if (!existsSync(dossierPath)) continue;
    const dossier = await readJsonFile(dossierPath);
    if (!dossier) continue;
    const info = await stat(dossierPath);
    candidates.push({
      path: dossierPath,
      dossier,
      claimReady: startupBenchBoundDossierIsClaimReady(dossier),
      mtimeMs: info.mtimeMs,
    });
  }
  candidates.sort((a, b) => Number(b.claimReady) - Number(a.claimReady) || b.mtimeMs - a.mtimeMs);
  const latest = candidates[0];
  return latest ? { path: latest.path, dossier: latest.dossier } : null;
}

export function buildSparkQaAutoloopRoundArgs(input: {
  outputRoot: string;
  timeoutSeconds?: number;
}): string[] {
  return [
    '-m',
    'specialization_path_spark_qa_operator.cli',
    'autoloop-round',
    '--output-root',
    input.outputRoot,
    '--timeout-seconds',
    String(Math.max(1, input.timeoutSeconds || 180)),
  ];
}

export async function runSparkQaAutoloopRound(options: {
  repoRoot?: string;
  outputRoot?: string;
  timeoutSeconds?: number;
} = {}): Promise<SparkQaAutoloopRoundResult> {
  const repoRoot = resolveSparkQaOperatorRepo(options.repoRoot);
  if (!repoRoot) {
    return {
      ok: false,
      proofRan: false,
      error: 'Spark QA Operator repo is not configured. Set SPARK_QA_OPERATOR_REPO to the specialization-path-spark-qa-operator repo.',
    };
  }

  const outputRoot = path.resolve(
    repoRoot,
    options.outputRoot || path.join('.spark-swarm', 'autoloop', 'runs', `telegram-${timestampId()}`)
  );
  const args = buildSparkQaAutoloopRoundArgs({
    outputRoot,
    timeoutSeconds: options.timeoutSeconds,
  });

  try {
    const { stdout, stderr } = await execFileAsync(pythonCommand(), args, withHiddenWindows({
      cwd: repoRoot,
      env: envForRepo(repoRoot),
      timeout: Number.parseInt(process.env.SPARK_QA_OPERATOR_TIMEOUT_MS || '900000', 10) || 900000,
      maxBuffer: 30 * 1024 * 1024,
    }));
    const report = readJsonFromText(stdout);
    return {
      ok: true,
      proofRan: Boolean(report),
      repoRoot,
      outputRoot,
      reportPath: report ? path.join(outputRoot, 'autoloop_round_report.json') : null,
      latestManifestPath: typeof report?.latestRunManifestPath === 'string' ? report.latestRunManifestPath : null,
      report,
      stdout,
      stderr,
      commandExitCode: 0,
    };
  } catch (err: any) {
    const stdout = redactText(typeof err?.stdout === 'string' ? err.stdout : '');
    const stderr = redactText(typeof err?.stderr === 'string' ? err.stderr : '');
    const report = readJsonFromText(stdout);
    if (report?.schemaVersion === 'spark-qa-autoloop-round-report.v1') {
      return {
        ok: true,
        proofRan: true,
        repoRoot,
        outputRoot,
        reportPath: path.join(outputRoot, 'autoloop_round_report.json'),
        latestManifestPath: typeof report.latestRunManifestPath === 'string' ? report.latestRunManifestPath : null,
        report,
        stdout,
        stderr,
        commandExitCode: typeof err?.code === 'number' ? err.code : null,
      };
    }
    const message = redactText(err?.message ? String(err.message) : String(err));
    return {
      ok: false,
      proofRan: false,
      repoRoot,
      outputRoot,
      stdout,
      stderr,
      error: message || 'Spark QA autoloop command failed before producing a proof report.',
      commandExitCode: typeof err?.code === 'number' ? err.code : null,
    };
  }
}

export async function readLatestSparkQaAutoloopRound(repoRootOverride?: string): Promise<SparkQaAutoloopRoundResult> {
  const repoRoot = resolveSparkQaOperatorRepo(repoRootOverride);
  if (!repoRoot) {
    return {
      ok: false,
      proofRan: false,
      error: 'Spark QA Operator repo is not configured. Set SPARK_QA_OPERATOR_REPO to the specialization-path-spark-qa-operator repo.',
    };
  }
  const latestManifestPath = path.join(repoRoot, '.spark-swarm', 'autoloop', 'latest_run.json');
  const manifest = await readJsonFile(latestManifestPath);
  const reportPath = typeof manifest?.reportPath === 'string' ? manifest.reportPath : null;
  const report = await readJsonFile(reportPath);
  if (!report) {
    return {
      ok: false,
      proofRan: false,
      repoRoot,
      latestManifestPath,
      reportPath,
      error: 'No Spark QA autoloop proof report is available yet. Run /sparkqa run first.',
    };
  }
  return {
    ok: true,
    proofRan: true,
    repoRoot,
    outputRoot: typeof manifest?.outputRoot === 'string' ? manifest.outputRoot : undefined,
    reportPath,
    latestManifestPath,
    report,
  };
}

export async function readLatestStartupBenchDossier(repoRootOverride?: string): Promise<StartupBenchDossierResult> {
  const repoRoot = resolveSparkQaOperatorRepo(repoRootOverride);
  if (!repoRoot) {
    return {
      ok: false,
      error: 'Spark QA Operator repo is not configured. Set SPARK_QA_OPERATOR_REPO to the specialization-path-spark-qa-operator repo.',
    };
  }
  const latest = await findLatestBoundStartupBenchDossier(repoRoot);
  if (!latest) {
    return {
      ok: false,
      repoRoot,
      dossierPath: null,
      error: 'No bound Startup Bench promotion dossier is available yet. Refresh the Spark QA proof bundle before reading startup status.',
    };
  }
  return {
    ok: true,
    repoRoot,
    dossierPath: latest.path,
    dossier: latest.dossier,
  };
}

function num(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function formatNumber(value: number | null): string {
  if (value === null) return 'unknown';
  return Number.isInteger(value) ? String(value) : value.toFixed(3).replace(/0+$/, '').replace(/\.$/, '');
}

function claimAllowed(report: Record<string, any> | null | undefined): boolean {
  return report?.promotionDossier?.scoreClaimAllowed === true;
}

function blockerSummary(report: Record<string, any> | null | undefined): string {
  const blockers = Array.isArray(report?.promotionDossier?.blockers)
    ? report?.promotionDossier?.blockers.map((item: unknown) => String(item))
    : [];
  if (blockers.some((item: string) => /sidecar/i.test(item))) return 'sidecar review is still pending';
  if (blockers.some((item: string) => /wrapper/i.test(item))) return 'wrapper/raw reconciliation is still pending';
  if (blockers.some((item: string) => /score_reconciliation|score claim/i.test(item))) return 'score reconciliation is still pending';
  if (blockers.some((item: string) => /hidden|heldout/i.test(item))) return 'held-out proof still needs review';
  return blockers[0] ? blockers[0].replace(/[_-]+/g, ' ') : 'promotion gates are still blocked';
}

function humanBlocker(value: string): string {
  if (/sidecar/i.test(value)) return 'sidecar review';
  if (/wall.?clock|stability/i.test(value)) return 'stability';
  if (/repeated/i.test(value)) return 'repeated stability';
  if (/score.?reconciliation|score.?claim/i.test(value)) return 'score reconciliation';
  if (/wrapper/i.test(value)) return 'wrapper/raw reconciliation';
  if (/hidden|heldout/i.test(value)) return 'held-out proof';
  return value.replace(/[_-]+/g, ' ');
}

function blockerList(dossier: Record<string, any> | null | undefined): string[] {
  const raw = Array.isArray(dossier?.promotionDossier?.blockers) ? dossier?.promotionDossier?.blockers : [];
  return unique(raw.map((item: unknown) => humanBlocker(String(item))));
}

function autoloopBlockerList(report: Record<string, any> | null | undefined): string[] {
  const raw = Array.isArray(report?.promotionDossier?.blockers) ? report?.promotionDossier?.blockers : [];
  return unique(raw.map((item: unknown) => humanBlocker(String(item))));
}

function startupDossierClaimAllowed(dossier: Record<string, any> | null | undefined): boolean {
  return (
    (dossier?.promotionDossier?.scoreClaimAllowed === true || dossier?.scoreClaimAllowed === true) &&
    (dossier?.promotionDossier?.improvementClaimAllowed === true || dossier?.improvementClaimAllowed === true)
  );
}

function startupDossierHasMovement(dossier: Record<string, any> | null | undefined): boolean {
  const summary = dossier?.privateScoreSummary || {};
  const baseline = num(summary.baseline?.scenarioScore);
  const candidate = num(summary.candidate?.scenarioScore);
  const delta = num(summary.comparison?.candidateMinusBaseline);
  return baseline !== null && candidate !== null && (delta === null ? candidate > baseline : delta > 0);
}

function releaseFlag(record: Record<string, any> | null | undefined, key: string): boolean {
  return record?.promotionDossier?.[key] === true || record?.[key] === true;
}

export async function readStartupReleaseVerdict(repoRootOverride?: string): Promise<StartupReleaseVerdictResult> {
  const dossierResult = await readLatestStartupBenchDossier(repoRootOverride);
  const autoloopResult = await readLatestSparkQaAutoloopRound(dossierResult.repoRoot || repoRootOverride);
  if (!dossierResult.ok || !dossierResult.dossier) {
    return {
      ok: false,
      repoRoot: dossierResult.repoRoot,
      dossierPath: dossierResult.dossierPath,
      reportPath: autoloopResult.reportPath,
      report: autoloopResult.report || null,
      error: dossierResult.error || 'No bound Startup Bench dossier is available yet.',
    };
  }

  const dossier = dossierResult.dossier;
  const report = autoloopResult.report || null;
  const dossierBlockers = blockerList(dossier);
  const autoloopBlockers = autoloopResult.ok && report ? autoloopBlockerList(report) : [];
  const blockers = unique([...dossierBlockers, ...autoloopBlockers]);
  const dossierAllowed = startupDossierClaimAllowed(dossier);
  const autoloopAllowed = autoloopResult.ok && report ? claimAllowed(report) : true;
  const localImprovementEvidence = startupDossierHasMovement(dossier) && dossierAllowed;
  const releaseClaimAllowed = localImprovementEvidence && autoloopAllowed && blockers.length === 0;
  const nextGate = releaseClaimAllowed
    ? 'publication review'
    : blockers[0] || 'complete the canonical proof verdict gates';

  return {
    ok: true,
    repoRoot: dossierResult.repoRoot,
    dossierPath: dossierResult.dossierPath,
    reportPath: autoloopResult.reportPath,
    dossier,
    report,
    verdict: {
      localImprovementEvidence,
      releaseClaimAllowed,
      publicReady: releaseClaimAllowed && releaseFlag(dossier, 'public_ready') && releaseFlag(report, 'public_ready'),
      networkAbsorbable: releaseClaimAllowed && releaseFlag(dossier, 'network_absorbable') && releaseFlag(report, 'network_absorbable'),
      blockers,
      nextGate,
    },
  };
}

export function renderStartupReleaseVerdict(result: StartupReleaseVerdictResult): string {
  if (!result.ok || !result.dossier || !result.verdict) {
    return `I cannot read the canonical Startup Operator release verdict yet. ${result.error || 'The bound proof is missing.'}`;
  }

  const dossier = result.dossier;
  const summary = dossier.privateScoreSummary || {};
  const baseline = num(summary.baseline?.scenarioScore);
  const candidate = num(summary.candidate?.scenarioScore);
  const comparison = summary.comparison || {};
  const delta = num(comparison.candidateMinusBaseline);
  const movement = baseline !== null && candidate !== null
    ? `Startup Bench shows local movement: baseline ${formatNumber(baseline)}, candidate ${formatNumber(candidate)}${delta !== null ? ` (${delta > 0 ? '+' : ''}${formatNumber(delta)})` : ''}.`
    : 'Startup Bench has a bound dossier, but the score movement is incomplete.';
  const verdict = result.verdict;

  if (verdict.releaseClaimAllowed) {
    return [
      `${movement}`,
      '',
      'The canonical release verdict allows the bounded local improvement claim. Public-ready and network-absorbable are still separate explicit decisions.',
      `Public-ready: ${verdict.publicReady ? 'true' : 'false'}. Network-absorbable: ${verdict.networkAbsorbable ? 'true' : 'false'}.`,
      result.dossierPath ? 'Inspect: available in the local Spark QA proof bundle.' : '',
    ].filter(Boolean).join('\n');
  }

  return [
    `${movement}`,
    '',
    verdict.localImprovementEvidence
      ? 'I would call this local improvement evidence, not a promoted or network-absorbable upgrade yet.'
      : 'I would not call this improved yet from the canonical release verdict.',
    `Remaining blockers: ${verdict.blockers.length ? verdict.blockers.join(', ') : 'promotion gates'}.`,
    `Next: ${verdict.nextGate}.`,
    'Public-ready: false. Network-absorbable: false.',
    result.dossierPath ? 'Inspect: available in the local Spark QA proof bundle.' : '',
  ].filter(Boolean).join('\n');
}

export function renderStartupBenchDossier(result: StartupBenchDossierResult): string {
  if (!result.ok || !result.dossier) {
    return `I cannot read the bound Startup Bench dossier yet. ${result.error || 'The proof bundle is missing.'}`;
  }

  const dossier = result.dossier;
  const summary = dossier.privateScoreSummary || {};
  const baseline = num(summary.baseline?.scenarioScore);
  const candidate = num(summary.candidate?.scenarioScore);
  const comparison = summary.comparison || {};
  const delta = num(comparison.candidateMinusBaseline);
  const scoreClaimAllowed = dossier.promotionDossier?.scoreClaimAllowed === true || dossier.scoreClaimAllowed === true;
  const improvementClaimAllowed = dossier.promotionDossier?.improvementClaimAllowed === true || dossier.improvementClaimAllowed === true;
  const blockers = blockerList(dossier);
  const nextGate = typeof dossier.promotionDossier?.nextGate === 'string'
    ? humanBlocker(dossier.promotionDossier.nextGate)
    : '';
  const movement = baseline !== null && candidate !== null
    ? `The startup candidate moved in the private runner: baseline ${formatNumber(baseline)}, candidate ${formatNumber(candidate)}${delta !== null ? ` (${delta > 0 ? '+' : ''}${formatNumber(delta)})` : ''}.`
    : 'The bound Startup Bench dossier is present, but the private score movement is incomplete.';

  if (scoreClaimAllowed && improvementClaimAllowed) {
    return [
      `${movement}`,
      '',
      `The promotion dossier allows the improvement claim for this bound candidate. Next: ${nextGate || 'ready for publication review'}.`,
      'Public-ready and network-absorbable are still separate release decisions.',
      result.dossierPath ? 'Inspect: available in the local Spark QA proof bundle.' : '',
    ].filter(Boolean).join('\n');
  }

  return [
    `${movement}`,
    '',
    `I cannot call it improved yet. scoreClaimAllowed=false and improvementClaimAllowed=false. Remaining blockers: ${blockers.length ? blockers.join(', ') : 'promotion gates'}.`,
    `Next: ${nextGate || blockers[0] || 'refresh or complete the bound proof gates'}.`,
    result.dossierPath ? 'Inspect: available in the local Spark QA proof bundle.' : '',
  ].filter(Boolean).join('\n');
}

export function renderSparkQaAutoloopRound(result: SparkQaAutoloopRoundResult): string {
  if (!result.ok || !result.report) {
    return `I could not run the Spark QA benchmark/autoloop proof yet. ${result.error || 'No proof report came back.'}`;
  }

  const report = result.report;
  const comparison = report.baselineCandidateDelta || {};
  const baseline = num(comparison.baselineScore);
  const candidate = num(comparison.candidateScore);
  const delta = num(comparison.delta);
  const replay = report.captureReplay || {};
  const evidence = report.evidenceBenchmark || {};
  const ticketCount = Number(report.failureQueue?.ticketCount ?? 0);
  const privateMovement = baseline !== null && candidate !== null
    ? ` Candidate replay moved ${formatNumber(baseline)} -> ${formatNumber(candidate)}${delta !== null ? ` (${delta > 0 ? '+' : ''}${formatNumber(delta)})` : ''}.`
    : '';
  const replayLine = typeof replay.passedCount === 'number' && typeof replay.caseCount === 'number'
    ? ` Replay passed ${replay.passedCount}/${replay.caseCount}.`
    : '';
  const evidenceLine = typeof evidence.overallScore === 'number'
    ? ` Private evidence benchmark coverage is ${formatNumber(evidence.overallScore)}; this is not a promotion score.`
    : '';

  if (claimAllowed(report)) {
    return `Spark QA Operator cleared the benchmark/autoloop score gate.${privateMovement}${replayLine}${evidenceLine}`;
  }

  return `Spark QA Operator ran the benchmark/autoloop proof, but I would not claim an upgrade yet.${privateMovement}${replayLine}${evidenceLine} The dossier is blocked because ${blockerSummary(report)}.${ticketCount > 0 ? ` I queued ${ticketCount} improvement ticket${ticketCount === 1 ? '' : 's'} for the next loop.` : ''}`;
}

export function buildSparkQaBenchmarkCreatorArgs(input: {
  specializationPath: string;
  level: number;
  outputDir: string;
  prompt?: string;
}): string[] {
  return [
    '-m',
    'specialization_path_spark_qa_operator.cli',
    'benchmark-creator-prd',
    '--specialization-path',
    input.specializationPath,
    '--level',
    String(input.level),
    '--prompt',
    input.prompt || '',
    '--output-dir',
    input.outputDir,
  ];
}

export async function runSparkQaBenchmarkCreator(input: {
  specializationPath: string;
  level: number;
  prompt?: string;
  repoRoot?: string;
  outputDir?: string;
}): Promise<SparkQaBenchmarkCreatorResult> {
  const repoRoot = resolveSparkQaOperatorRepo(input.repoRoot);
  if (!repoRoot) {
    return {
      ok: false,
      level: input.level,
      specializationPath: input.specializationPath,
      error: 'Spark QA Operator repo is not configured. Set SPARK_QA_OPERATOR_REPO to the specialization-path-spark-qa-operator repo.',
    };
  }
  const outputDir = path.resolve(
    repoRoot,
    input.outputDir || path.join('.spark-swarm', 'benchmark-creator', `telegram-level-${input.level}-${timestampId()}`)
  );
  const args = buildSparkQaBenchmarkCreatorArgs({
    specializationPath: input.specializationPath,
    level: input.level,
    prompt: input.prompt,
    outputDir,
  });
  try {
    const { stdout, stderr } = await execFileAsync(pythonCommand(), args, withHiddenWindows({
      cwd: repoRoot,
      env: envForRepo(repoRoot),
      timeout: Number.parseInt(process.env.SPARK_QA_OPERATOR_TIMEOUT_MS || '900000', 10) || 900000,
      maxBuffer: 30 * 1024 * 1024,
    }));
    return {
      ok: true,
      repoRoot,
      outputDir,
      level: input.level,
      specializationPath: input.specializationPath,
      payload: readJsonFromText(stdout),
      stdout,
      stderr,
    };
  } catch (err: any) {
    return {
      ok: false,
      repoRoot,
      outputDir,
      level: input.level,
      specializationPath: input.specializationPath,
      stdout: redactText(typeof err?.stdout === 'string' ? err.stdout : ''),
      stderr: redactText(typeof err?.stderr === 'string' ? err.stderr : ''),
      error: redactText(err?.message ? String(err.message) : String(err)),
    };
  }
}

export function renderSparkQaBenchmarkCreator(result: SparkQaBenchmarkCreatorResult): string {
  if (!result.ok) {
    return `I could not create the Spark QA benchmark packet yet. ${result.error || 'The creator command did not finish.'}`;
  }
  const level = result.level ?? 10;
  const profile = result.payload?.prd?.benchmarkLevel || result.payload?.benchmarkLevel || {};
  const name = typeof profile.name === 'string' ? profile.name.replace(/[_-]+/g, ' ') : level === 10 ? 'lab swarm research' : 'benchmark';
  const timeBudget = typeof profile.timeBudget === 'string' ? ` It is scoped for ${profile.timeBudget}.` : '';
  return `Benchmark creator packet is staged for ${result.specializationPath || 'Spark QA Operator'} at level ${level} (${name}).${timeBudget} It stays local/private until the review and promotion gates clear.`;
}

export function parseSparkQaCommand(raw: string): SparkQaCommand | null {
  const text = raw.trim();
  if (!text || /^help$/i.test(text)) return { action: 'help' };
  if (/^(?:run|start|go|autoloop|auto\s+loop)(?:\s+proof|\s+benchmark|\s+round)?$/i.test(text)) {
    return { action: 'run' };
  }
  if (/^(?:startup|startup\s+status|startup[-\s]+bench|startup[-\s]+bench\s+status)$/i.test(text)) {
    return { action: 'startup' };
  }
  if (/^(?:status|score|scores|report|latest|where\s+are\s+we|what'?s\s+next)$/i.test(text)) {
    return { action: 'status' };
  }
  const benchmarkMatch = /^(?:benchmark|create\s+benchmark|benchmark\s+creator)\b([\s\S]*)$/i.exec(text);
  if (benchmarkMatch) {
    const rest = benchmarkMatch[1].trim();
    const levelMatch = /\blevel\s*(10|[1-9])\b/i.exec(rest);
    if (/\blevel\s*\d+\b/i.test(rest) && !levelMatch) return null;
    const bareLevelMatch = /^(10|[1-9])(?:\s+|$)/.exec(rest);
    if (/^\d+(?:\s+|$)/.test(rest) && !bareLevelMatch) return null;
    const level = Number(levelMatch?.[1] || bareLevelMatch?.[1] || 10);
    const withoutLevel = rest
      .replace(/\blevel\s*(10|[1-9])\b/i, '')
      .replace(/^(10|[1-9])(?:\s+|$)/, '')
      .replace(/\bfor\b/i, '')
      .trim();
    return {
      action: 'benchmark',
      level,
      specializationPath: withoutLevel || 'Spark QA Operator',
      prompt: rest,
    };
  }
  return null;
}

export function renderSparkQaHelp(): string {
  return [
    'Spark QA Operator',
    '',
    '/sparkqa run - run the benchmark/autoloop proof',
    '/sparkqa status - read the latest proof dossier',
    '/sparkqa startup - read the bound Startup Bench promotion dossier',
    '/sparkqa benchmark <specialization path> level <1-10> - create a benchmark packet',
    '',
    'Scores stay blocked unless the promotion dossier says scoreClaimAllowed=true.',
  ].join('\n');
}

export function isSparkQaOperatorKey(value: string | null | undefined): boolean {
  const normalized = String(value || '').trim().replace(/^path:/i, '').toLowerCase();
  return normalized === 'spark-qa-operator';
}
