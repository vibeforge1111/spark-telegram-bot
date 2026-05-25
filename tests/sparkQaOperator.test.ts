import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import {
  buildSparkQaAutoloopRoundArgs,
  buildSparkQaBenchmarkCreatorArgs,
  isSparkQaOperatorKey,
  parseSparkQaCommand,
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

async function main(): Promise<void> {
  await test('parses Spark QA commands and keeps level selection explicit', () => {
  assert.deepEqual(parseSparkQaCommand('run'), { action: 'run' });
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
