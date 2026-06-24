import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { buildHarnessProofCapsule } from '../src/harnessProofCapsule';
import { projectHarnessProof } from '../src/harnessProofProjection';

function test(name: string, fn: () => void): void {
  try {
    fn();
    console.log(`ok - ${name}`);
  } catch (error) {
    console.error(`not ok - ${name}`);
    throw error;
  }
}

function withTempSparkHome(fn: (sparkHome: string) => void): void {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'spark-harness-proof-panel-'));
  try {
    fn(root);
  } finally {
    const resolved = path.resolve(root);
    if (!resolved.includes('spark-harness-proof-panel-')) {
      throw new Error(`Refusing to clean unexpected temp root: ${resolved}`);
    }
    fs.rmSync(resolved, { recursive: true, force: true });
  }
}

function writeJsonl(filePath: string, rows: unknown[]): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${rows.map((row) => JSON.stringify(row)).join('\n')}\n`, 'utf8');
}

function proofCapsule(turnRef: string) {
  return buildHarnessProofCapsule({
    turnRef,
    route: 'spawner.build',
    owner: 'spawner-ui',
    intent: { kind: 'spawner.build', confidence: 'explicit', noExecution: false },
    authority: {
      decision: 'allowed',
      contract: 'spark.turn_intent.v1',
      riskTier: 'execute',
      reasonSummary: 'tool_not_allowed_by_policy /Users/example/private'
    },
    governor: { decision: 'allow', verified: true },
    execution: { status: 'started', tool: 'spawner.run', mutationClass: 'launches_mission' },
    reply: { delivered: true, shape: 'natural', rawReasonsHidden: true },
    joins: { telegram: 'joined', spawner: 'joined', builder: 'missing' }
  });
}

test('renders the latest redacted Harness Proof panel without raw trace rows', () => {
  withTempSparkHome((sparkHome) => {
    const older = proofCapsule('turn:older');
    const latest = proofCapsule('turn:latest');
    writeJsonl(path.join(sparkHome, 'state', 'spark-telegram-bot', 'final-answer-gate-audit.jsonl'), [
      {
        request_id: 'raw-request-older',
        harness_proof_ref: older.turnRef,
        proof_capsule: older
      },
      {
        request_id: 'raw-request-latest',
        harness_proof_ref: latest.turnRef,
        proof_capsule: latest
      }
    ]);

    const projection = projectHarnessProof({
      sparkHome,
      proofRef: latest.turnRef
    });

    assert.equal(projection.ok, true);
    assert.equal(projection.foundRef, latest.turnRef);
    assert.equal(projection.plane, 'telegram_final_answer');
    assert.match(projection.panel, /Harness Proof/);
    assert.match(projection.panel, /Gaps: builder/);
    assert.doesNotMatch(projection.panel, /raw-request|tool_not_allowed_by_policy|\/Users\/example/);
  });
});

test('reports a missing proof ref without exposing evidence files', () => {
  withTempSparkHome((sparkHome) => {
    const projection = projectHarnessProof({
      sparkHome,
      proofRef: 'turn:sha256:0000000000000000'
    });

    assert.equal(projection.ok, false);
    assert.match(projection.panel, /Status: not found/);
    assert.doesNotMatch(projection.panel, /spark-harness-proof-panel-/);
  });
});
