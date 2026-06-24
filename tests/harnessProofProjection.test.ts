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
    writeJsonl(path.join(sparkHome, 'state', 'spark-intelligence', 'logs', 'gateway-trace.jsonl'), [
      {
        request_id: 'raw-request-latest',
        trace_ref: 'trace:builder-raw',
        reason: 'tool_not_allowed_by_policy',
        artifact_path: '/Users/example/private/builder.log'
      }
    ]);
    writeJsonl(path.join(sparkHome, 'state', 'spawner-ui', 'prd-auto-trace.jsonl'), [
      {
        requestId: 'raw-request-latest',
        traceRef: 'trace:spawner-raw',
        resultArtifact: '/Users/example/private/spawner.json'
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
    assert.match(projection.panel, /Evidence joined: Telegram final/);
    assert.match(projection.panel, /Evidence missing: .*Builder gateway/);
    assert.match(projection.panel, /Evidence missing: .*Spawner trace/);
    assert.equal(projection.evidenceJoins?.find((join) => join.plane === 'builder_gateway')?.status, 'missing');
    assert.equal(projection.evidenceJoins?.find((join) => join.plane === 'spawner_prd_trace')?.status, 'missing');
    assert.doesNotMatch(projection.panel, /raw-request|tool_not_allowed_by_policy|\/Users\/example|trace:builder-raw|trace:spawner-raw/);
  });
});

test('marks future Builder and Spawner rows joined when they carry a redacted proof ref', () => {
  withTempSparkHome((sparkHome) => {
    const latest = proofCapsule('turn:latest');
    writeJsonl(path.join(sparkHome, 'state', 'spark-telegram-bot', 'final-answer-gate-audit.jsonl'), [
      {
        harness_proof_ref: latest.turnRef,
        proof_capsule: latest
      }
    ]);
    writeJsonl(path.join(sparkHome, 'state', 'spark-intelligence', 'logs', 'gateway-trace.jsonl'), [
      {
        request_id: 'raw-request-latest',
        nested: { harness_proof_ref: latest.turnRef },
        artifact_path: '/Users/example/private/builder.log'
      }
    ]);
    writeJsonl(path.join(sparkHome, 'state', 'spawner-ui', 'prd-auto-trace.jsonl'), [
      {
        requestId: 'raw-request-latest',
        harnessProofRef: latest.turnRef,
        resultArtifact: '/Users/example/private/spawner.json'
      }
    ]);

    const projection = projectHarnessProof({
      sparkHome,
      proofRef: latest.turnRef
    });

    assert.equal(projection.ok, true);
    assert.equal(projection.evidenceJoins?.find((join) => join.plane === 'builder_gateway')?.status, 'joined');
    assert.equal(projection.evidenceJoins?.find((join) => join.plane === 'spawner_prd_trace')?.status, 'joined');
    assert.match(projection.panel, /Evidence joined: .*Builder gateway/);
    assert.match(projection.panel, /Evidence joined: .*Spawner trace/);
    assert.doesNotMatch(projection.panel, /raw-request|\/Users\/example/);
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

test('reports ref-only Builder evidence when the proof capsule is missing', () => {
  withTempSparkHome((sparkHome) => {
    const proofRef = 'turn:sha256:0000000000000001';
    writeJsonl(path.join(sparkHome, 'state', 'spark-intelligence', 'logs', 'gateway-trace.jsonl'), [
      {
        request_id: 'raw-request-builder-ref-only',
        trace_ref: 'trace:builder-raw',
        harnessProofRef: proofRef,
        artifact_path: '/Users/example/private/builder.log'
      }
    ]);

    const projection = projectHarnessProof({
      sparkHome,
      proofRef
    });

    assert.equal(projection.ok, false);
    assert.equal(projection.foundRef, null);
    assert.match(projection.panel, /Status: proof capsule missing/);
    assert.match(projection.panel, /Evidence joined: Builder gateway/);
    assert.match(projection.panel, /Evidence missing: .*Telegram final/);
    assert.equal(projection.evidenceJoins?.find((join) => join.plane === 'builder_gateway')?.status, 'joined');
    assert.doesNotMatch(projection.panel, /raw-request|trace:builder-raw|\/Users\/example/);
  });
});

test('reports trace-only evidence with an explicit proof gap marker', () => {
  withTempSparkHome((sparkHome) => {
    const traceRef = 'trace:spawner-prd:mission-proof-gap';
    writeJsonl(path.join(sparkHome, 'state', 'spawner-ui', 'prd-auto-trace.jsonl'), [
      {
        requestId: 'raw-request-proof-gap',
        traceRef,
        proofStatus: 'missing_harness_proof',
        resultArtifact: '/Users/example/private/spawner.json'
      }
    ]);

    const projection = projectHarnessProof({
      sparkHome,
      traceRef
    });

    assert.equal(projection.ok, false);
    assert.equal(projection.requestedTraceRef, traceRef);
    assert.equal(projection.foundRef, null);
    assert.match(projection.panel, /Status: proof capsule missing/);
    assert.match(projection.panel, /Evidence proof gaps: Spawner trace/);
    assert.equal(projection.evidenceJoins?.find((join) => join.plane === 'spawner_prd_trace')?.status, 'proof_gap');
    assert.doesNotMatch(projection.panel, /mission-proof-gap|raw-request-proof-gap|\/Users\/example/);
  });
});

test('finds a proof capsule by trace ref and preserves proof-gap evidence joins', () => {
  withTempSparkHome((sparkHome) => {
    const traceRef = 'trace:spawner-prd:mission-with-proof';
    const latest = proofCapsule('turn:latest');
    writeJsonl(path.join(sparkHome, 'state', 'spark-telegram-bot', 'final-answer-gate-audit.jsonl'), [
      {
        trace_ref: traceRef,
        harness_proof_ref: latest.turnRef,
        proof_capsule: latest
      }
    ]);
    writeJsonl(path.join(sparkHome, 'state', 'spawner-ui', 'prd-auto-trace.jsonl'), [
      {
        requestId: 'raw-request-with-proof',
        traceRef,
        proofStatus: 'missing_harness_proof',
        resultArtifact: '/Users/example/private/spawner.json'
      }
    ]);

    const projection = projectHarnessProof({
      sparkHome,
      traceRef
    });

    assert.equal(projection.ok, true);
    assert.equal(projection.foundRef, latest.turnRef);
    assert.equal(projection.evidenceJoins?.find((join) => join.plane === 'telegram_final_answer')?.status, 'joined');
    assert.equal(projection.evidenceJoins?.find((join) => join.plane === 'spawner_prd_trace')?.status, 'proof_gap');
    assert.match(projection.panel, /Evidence proof gaps: Spawner trace/);
    assert.doesNotMatch(projection.panel, /mission-with-proof|raw-request-with-proof|\/Users\/example/);
  });
});
