import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import {
  buildSparkQaAutoloopRoundArgs,
  buildSparkQaBenchmarkCreatorArgs,
  isSparkQaOperatorKey,
  parseSparkQaCommand,
  readLatestStartupBenchDossier,
  readStartupReleaseVerdict,
  renderStartupBenchDossier,
  renderStartupReleaseVerdict,
  renderSparkQaAutoloopRound,
  renderSparkQaBenchmarkCreator,
  resolveSparkQaOperatorRepo,
  runSparkQaAutoloopRound,
} from '../src/sparkQaOperator';

async function test(name: string, fn: () => Promise<void> | void): Promise<void> {
  try {
    await fn();
    console.log(`ok - ${name}`);
  } catch (error) {
    console.error(`not ok - ${name}`);
    throw error;
  }
}

function makeFakeSparkQaRepo(): string {
  const root = mkdtempSync(path.join(tmpdir(), 'spark-qa-operator-repo-'));
  const moduleDir = path.join(root, 'src', 'specialization_path_spark_qa_operator');
  mkdirSync(moduleDir, { recursive: true });
  writeFileSync(path.join(root, 'specialization-path.json'), JSON.stringify({ key: 'spark-qa-operator' }), 'utf-8');
  writeFileSync(path.join(moduleDir, '__init__.py'), '', 'utf-8');
  writeFileSync(path.join(moduleDir, 'cli.py'), [
    'from __future__ import annotations',
    'import argparse, json, pathlib, sys',
    'parser = argparse.ArgumentParser()',
    'parser.add_argument("hook")',
    'parser.add_argument("--output-root", default="")',
    'parser.add_argument("--timeout-seconds", default="180")',
    'parser.add_argument("--specialization-path", default="Spark QA Operator")',
    'parser.add_argument("--level", default="10")',
    'parser.add_argument("--prompt", default="")',
    'parser.add_argument("--output-dir", default="")',
    'args = parser.parse_args()',
    'if args.hook == "autoloop-round":',
    '    out = pathlib.Path(args.output_root)',
    '    out.mkdir(parents=True, exist_ok=True)',
    '    report = {',
    '        "schemaVersion": "spark-qa-autoloop-round-report.v1",',
    '        "run": {"status": "blocked"},',
    '        "baselineCandidateDelta": {"baselineScore": 0.0, "candidateScore": 1.0, "delta": 1.0, "scoreClaimAllowed": False},',
    '        "captureReplay": {"passedCount": 4, "caseCount": 4},',
    '        "evidenceBenchmark": {"overallScore": 1.0},',
    '        "failureQueue": {"ticketCount": 8},',
    '        "promotionDossier": {"scoreClaimAllowed": False, "public_ready": False, "network_absorbable": False, "blockers": ["sidecar_review_not_clean"]},',
    '        "latestRunManifestPath": str(out.parent.parent / "latest_run.json")',
    '    }',
    '    (out / "autoloop_round_report.json").write_text(json.dumps(report), encoding="utf-8")',
    '    (out.parent.parent / "latest_run.json").write_text(json.dumps({"reportPath": str(out / "autoloop_round_report.json"), "outputRoot": str(out)}), encoding="utf-8")',
    '    print(json.dumps(report))',
    '    sys.exit(1)',
    'if args.hook == "benchmark-creator-prd":',
    '    out = pathlib.Path(args.output_dir)',
    '    out.mkdir(parents=True, exist_ok=True)',
    '    payload = {"success": True, "benchmarkLevel": {"level": int(args.level), "name": "lab_swarm_research", "timeBudget": "hours to days"}}',
    '    print(json.dumps(payload))',
    '    sys.exit(0)',
    'raise SystemExit(2)',
    '',
  ].join('\n'), 'utf-8');
  return root;
}

function writeBoundStartupBenchDossier(repo: string, options: {
  runId?: string;
  claimReady?: boolean;
} = {}): string {
  const claimReady = options.claimReady === true;
  const dossierPath = path.join(
    repo,
    '.spark-swarm',
    'autoloop',
    'runs',
    options.runId || 'telegram-20260530t1008274',
    'startup_bench_proof_report.bound.json'
  );
  mkdirSync(path.dirname(dossierPath), { recursive: true });
  writeFileSync(dossierPath, JSON.stringify({
    schemaVersion: 'spark-startup-bench-proof-adapter.v1',
    status: claimReady ? 'score_claim_ready' : 'runner_proof_ready',
    scoreClaimAllowed: claimReady,
    improvementClaimAllowed: claimReady,
    privateScoreSummary: {
      baseline: { scenarioScore: 0.6408 },
      candidate: { scenarioScore: 0.8657 },
      comparison: {
        metric: 'scenario_score',
        candidateMinusBaseline: 0.2249,
        candidateBeatsBaseline: true,
      },
    },
    promotionDossier: {
      status: claimReady ? 'score_claim_ready' : 'blocked',
      scoreClaimAllowed: claimReady,
      improvementClaimAllowed: claimReady,
      public_ready: false,
      network_absorbable: false,
      blockers: claimReady ? [] : ['sidecar_review_pending', 'wall_clock_stability_window_missing', 'score_reconciliation_missing'],
      nextGate: claimReady ? 'ready_for_publication_review' : 'clear_startup_bench_proof_blockers',
    },
    proofGateBundle: {
      bundleId: claimReady ? 'startup-bench-proof-c110f7a53c05-a898c828a760' : 'startup-bench-proof-unit',
      manifestPath: path.join(path.dirname(dossierPath), 'startup_bench_proof_gates.json'),
      status: claimReady ? 'ready' : 'blocked',
    },
  }), 'utf-8');
  return dossierPath;
}

function writeLatestAutoloopReport(repo: string, options: {
  claimReady?: boolean;
  blockers?: string[];
} = {}): string {
  const claimReady = options.claimReady === true;
  const out = path.join(repo, '.spark-swarm', 'autoloop', 'runs', 'latest-autoloop');
  const reportPath = path.join(out, 'autoloop_round_report.json');
  mkdirSync(out, { recursive: true });
  const report = {
    schemaVersion: 'spark-qa-autoloop-round-report.v1',
    baselineCandidateDelta: { baselineScore: 0, candidateScore: 1, delta: 1 },
    captureReplay: { passedCount: 4, caseCount: 4 },
    evidenceBenchmark: { overallScore: 1 },
    promotionDossier: {
      scoreClaimAllowed: claimReady,
      public_ready: false,
      network_absorbable: false,
      blockers: options.blockers || (claimReady ? [] : ['sidecar_review_pending', 'score_reconciliation_missing']),
    },
  };
  writeFileSync(reportPath, JSON.stringify(report), 'utf-8');
  writeFileSync(
    path.join(repo, '.spark-swarm', 'autoloop', 'latest_run.json'),
    JSON.stringify({ reportPath, outputRoot: out }),
    'utf-8'
  );
  return reportPath;
}

async function main(): Promise<void> {
  await test('parses Spark QA commands and keeps level selection explicit', () => {
  assert.deepEqual(parseSparkQaCommand('run'), { action: 'run' });
  assert.deepEqual(parseSparkQaCommand('startup'), { action: 'startup' });
  assert.deepEqual(parseSparkQaCommand('startup-bench status'), { action: 'startup' });
  assert.deepEqual(parseSparkQaCommand('score'), { action: 'status' });
  assert.deepEqual(parseSparkQaCommand('benchmark Spark QA Operator level 10'), {
    action: 'benchmark',
    level: 10,
    specializationPath: 'Spark QA Operator',
    prompt: 'Spark QA Operator level 10',
  });
  assert.equal(parseSparkQaCommand('benchmark Spark QA Operator level 11'), null);
  assert.equal(isSparkQaOperatorKey('path:spark-qa-operator'), true);
  });

  await test('builds conductor and benchmark creator argv without shell strings', () => {
  assert.deepEqual(buildSparkQaAutoloopRoundArgs({ outputRoot: '/tmp/run', timeoutSeconds: 5 }), [
    '-m',
    'specialization_path_spark_qa_operator.cli',
    'autoloop-round',
    '--output-root',
    '/tmp/run',
    '--timeout-seconds',
    '5',
  ]);
  assert.deepEqual(buildSparkQaBenchmarkCreatorArgs({
    specializationPath: 'Spark QA Operator',
    level: 10,
    outputDir: '/tmp/creator',
    prompt: 'level 10',
  }), [
    '-m',
    'specialization_path_spark_qa_operator.cli',
    'benchmark-creator-prd',
    '--specialization-path',
    'Spark QA Operator',
    '--level',
    '10',
    '--prompt',
    'level 10',
    '--output-dir',
    '/tmp/creator',
  ]);
  });

  await test('treats blocked autoloop proof exit as real evidence without claiming a score', async () => {
  const repo = makeFakeSparkQaRepo();
  const oldRepo = process.env.SPARK_QA_OPERATOR_REPO;
  const oldPython = process.env.SPARK_QA_OPERATOR_PYTHON;
  try {
    process.env.SPARK_QA_OPERATOR_REPO = repo;
    process.env.SPARK_QA_OPERATOR_PYTHON = 'python3';
    assert.equal(resolveSparkQaOperatorRepo(), repo);
    const result = await runSparkQaAutoloopRound({ outputRoot: path.join(repo, '.spark-swarm', 'autoloop', 'runs', 'test') });
    assert.equal(result.ok, true);
    assert.equal(result.commandExitCode, 1);
    assert.equal(result.report?.promotionDossier?.scoreClaimAllowed, false);
    const reply = renderSparkQaAutoloopRound(result);
    assert.match(reply, /ran the benchmark\/autoloop proof/);
    assert.match(reply, /would not claim an upgrade yet/);
    assert.match(reply, /Candidate replay moved 0 -> 1/);
    assert.doesNotMatch(reply, /cleared the benchmark\/autoloop score gate/);
  } finally {
    if (oldRepo === undefined) delete process.env.SPARK_QA_OPERATOR_REPO;
    else process.env.SPARK_QA_OPERATOR_REPO = oldRepo;
    if (oldPython === undefined) delete process.env.SPARK_QA_OPERATOR_PYTHON;
    else process.env.SPARK_QA_OPERATOR_PYTHON = oldPython;
    rmSync(repo, { recursive: true, force: true });
  }
  });

  await test('renders bound Startup Bench dossier as blocked read-only startup status', async () => {
  const repo = makeFakeSparkQaRepo();
  const dossierPath = writeBoundStartupBenchDossier(repo);
  const oldRepo = process.env.SPARK_QA_OPERATOR_REPO;
  try {
    process.env.SPARK_QA_OPERATOR_REPO = repo;
    const result = await readLatestStartupBenchDossier();
    assert.equal(result.ok, true);
    assert.equal(result.dossierPath, dossierPath);
    const reply = renderStartupBenchDossier(result);
    assert.match(reply, /startup candidate moved in the private runner/i);
    assert.match(reply, /baseline 0\.641, candidate 0\.866 \(\+0\.225\)/);
    assert.match(reply, /cannot call it improved yet/i);
    assert.match(reply, /scoreClaimAllowed=false and improvementClaimAllowed=false/);
    assert.match(reply, /sidecar review/);
    assert.match(reply, /stability/);
    assert.match(reply, /score reconciliation/);
    assert.match(reply, /Inspect:/);
    assert.doesNotMatch(reply, /cleared|allows the improvement claim/i);
  } finally {
    if (oldRepo === undefined) delete process.env.SPARK_QA_OPERATOR_REPO;
    else process.env.SPARK_QA_OPERATOR_REPO = oldRepo;
    rmSync(repo, { recursive: true, force: true });
  }
  });

  await test('prefers a claim-ready bound Startup Bench dossier over newer stale blockers', async () => {
  const repo = makeFakeSparkQaRepo();
  const readyPath = writeBoundStartupBenchDossier(repo, { runId: 'clean-target-fe9718-seeds12-window2', claimReady: true });
  writeBoundStartupBenchDossier(repo, { runId: 'newer-stale-blocked-run', claimReady: false });
  const oldRepo = process.env.SPARK_QA_OPERATOR_REPO;
  try {
    process.env.SPARK_QA_OPERATOR_REPO = repo;
    const result = await readLatestStartupBenchDossier();
    assert.equal(result.ok, true);
    assert.equal(result.dossierPath, readyPath);
    const reply = renderStartupBenchDossier(result);
    assert.match(reply, /baseline 0\.641, candidate 0\.866 \(\+0\.225\)/);
    assert.match(reply, /allows the improvement claim/);
    assert.match(reply, /Public-ready and network-absorbable are still separate release decisions/);
    assert.doesNotMatch(reply, /sidecar 0\/1|wall-clock waiting|Score claim is still blocked/);
  } finally {
    if (oldRepo === undefined) delete process.env.SPARK_QA_OPERATOR_REPO;
    else process.env.SPARK_QA_OPERATOR_REPO = oldRepo;
    rmSync(repo, { recursive: true, force: true });
  }
  });

  await test('canonical startup release verdict combines bound dossier movement with autoloop blockers', async () => {
  const repo = makeFakeSparkQaRepo();
  writeBoundStartupBenchDossier(repo, { runId: 'clean-target-fe9718-seeds12-window2', claimReady: true });
  writeLatestAutoloopReport(repo, { claimReady: false, blockers: ['sidecar_review_pending', 'score_reconciliation_missing'] });
  const oldRepo = process.env.SPARK_QA_OPERATOR_REPO;
  try {
    process.env.SPARK_QA_OPERATOR_REPO = repo;
    const result = await readStartupReleaseVerdict();
    assert.equal(result.ok, true);
    assert.equal(result.verdict?.localImprovementEvidence, true);
    assert.equal(result.verdict?.releaseClaimAllowed, false);
    const reply = renderStartupReleaseVerdict(result);
    assert.match(reply, /local improvement evidence/i);
    assert.match(reply, /not a promoted or network-absorbable upgrade yet/i);
    assert.match(reply, /sidecar review/);
    assert.match(reply, /score reconciliation/);
    assert.match(reply, /Public-ready: false\. Network-absorbable: false\./);
    assert.doesNotMatch(reply, /allows the bounded local improvement claim/i);
  } finally {
    if (oldRepo === undefined) delete process.env.SPARK_QA_OPERATOR_REPO;
    else process.env.SPARK_QA_OPERATOR_REPO = oldRepo;
    rmSync(repo, { recursive: true, force: true });
  }
  });

  await test('renders benchmark creator levels as private gated packets', () => {
  const reply = renderSparkQaBenchmarkCreator({
    ok: true,
    level: 10,
    specializationPath: 'Spark QA Operator',
    payload: {
      benchmarkLevel: {
        name: 'lab_swarm_research',
        timeBudget: 'hours to days',
      },
    },
  });
  assert.match(reply, /level 10/);
  assert.match(reply, /lab swarm research/);
  assert.match(reply, /local\/private/);
  assert.match(reply, /promotion gates/);
  });
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
