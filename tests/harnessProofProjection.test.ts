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

function legacyGapCapsule(turnRef: string) {
  return buildHarnessProofCapsule({
    turnRef,
    route: 'legacy.proof_gap',
    owner: 'spark-telegram-bot',
    intent: { kind: 'legacy.proof_gap', confidence: 'medium', noExecution: true },
    authority: {
      decision: 'downgraded',
      contract: 'none',
      riskTier: 'read',
      reasonSummary: 'Historical row is inspectable only; it is not fresh Harness authority.'
    },
    governor: { decision: 'not_applicable', verified: false },
    execution: { status: 'completed', tool: 'legacy.proof_gap', mutationClass: 'read_only' },
    reply: { delivered: false, shape: 'none', rawReasonsHidden: true },
    joins: { telegram: 'joined', spawner: 'joined', builder: 'not_applicable' }
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
    assert.match(projection.panel, /Evidence proof refs: Telegram final/);
    assert.match(projection.panel, /Evidence proof capsules: Telegram final/);
    assert.match(projection.panel, /Evidence missing: .*Builder gateway/);
    assert.match(projection.panel, /Evidence missing: .*Spawner trace/);
    assert.match(projection.panel, /Audit blocking: gaps found/);
    assert.equal(projection.evidenceJoins?.find((join) => join.plane === 'builder_gateway')?.status, 'missing');
    assert.equal(projection.evidenceJoins?.find((join) => join.plane === 'spawner_prd_trace')?.status, 'missing');
    assert.equal(projection.audit?.blockingOk, false);
    assert.doesNotMatch(projection.panel, /raw-request|tool_not_allowed_by_policy|\/Users\/example|trace:builder-raw|trace:spawner-raw/);
  });
});

test('latest proof prefers newest evidence timestamp across planes', () => {
  withTempSparkHome((sparkHome) => {
    const suppressed = proofCapsule('turn:suppressed');
    suppressed.reply.delivered = false;
    suppressed.execution.status = 'blocked';
    const delivered = proofCapsule('turn:delivered');
    delivered.route = 'plain_chat';
    delivered.owner = 'spark-telegram-bot';
    delivered.execution.status = 'completed';
    delivered.execution.tool = 'answer.compose';
    delivered.execution.mutationClass = 'read_only';
    delivered.reply.delivered = true;

    const finalAnswerPath = path.join(sparkHome, 'final-answer.jsonl');
    const outboundPath = path.join(sparkHome, 'outbound.jsonl');
    writeJsonl(finalAnswerPath, [
      {
        ts: '2026-06-24T14:28:08.000Z',
        harness_proof_ref: suppressed.turnRef,
        proof_capsule: suppressed
      }
    ]);
    writeJsonl(outboundPath, [
      {
        ts: '2026-06-24T14:28:18.000Z',
        harness_proof_ref: delivered.turnRef,
        proof_capsule: delivered
      }
    ]);

    const projection = projectHarnessProof({
      sparkHome,
      evidenceFiles: [
        { label: 'telegram_final_answer', filePath: finalAnswerPath, kind: 'jsonl' },
        { label: 'telegram_outbound', filePath: outboundPath, kind: 'jsonl' }
      ]
    });

    assert.equal(projection.ok, true);
    assert.equal(projection.foundRef, delivered.turnRef);
    assert.equal(projection.plane, 'telegram_outbound');
    assert.match(projection.panel, /Execution: completed/);
    assert.match(projection.panel, /Reply: delivered as natural/);
    assert.doesNotMatch(projection.panel, /Execution: blocked|Reply: not delivered/);
  });
});

test('latest proof keeps user-visible outbound ahead of newer background evidence', () => {
  withTempSparkHome((sparkHome) => {
    const delivered = proofCapsule('turn:delivered');
    delivered.route = 'plain_chat';
    delivered.owner = 'spark-telegram-bot';
    delivered.execution.status = 'completed';
    delivered.execution.tool = 'answer.compose';
    delivered.execution.mutationClass = 'read_only';
    delivered.reply.delivered = true;
    const background = proofCapsule('turn:background');

    const outboundPath = path.join(sparkHome, 'outbound.jsonl');
    const finalAnswerPath = path.join(sparkHome, 'final-answer.jsonl');
    writeJsonl(outboundPath, [
      {
        ts: '2026-06-24T14:28:18.000Z',
        harness_proof_ref: delivered.turnRef,
        proof_capsule: delivered
      }
    ]);
    writeJsonl(finalAnswerPath, [
      {
        ts: '2026-06-24T14:32:26.000Z',
        harness_proof_ref: background.turnRef,
        proof_capsule: background
      }
    ]);

    const projection = projectHarnessProof({
      sparkHome,
      evidenceFiles: [
        { label: 'telegram_final_answer', filePath: finalAnswerPath, kind: 'jsonl' },
        { label: 'telegram_outbound', filePath: outboundPath, kind: 'jsonl' }
      ]
    });

    assert.equal(projection.ok, true);
    assert.equal(projection.foundRef, delivered.turnRef);
    assert.equal(projection.plane, 'telegram_outbound');
    assert.match(projection.panel, /Execution: completed/);
    assert.match(projection.panel, /Reply: delivered as natural/);
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
    assert.equal(projection.evidenceJoins?.find((join) => join.plane === 'builder_gateway')?.proofRefJoined, true);
    assert.equal(projection.evidenceJoins?.find((join) => join.plane === 'builder_gateway')?.proofCapsuleJoined, false);
    assert.equal(projection.evidenceJoins?.find((join) => join.plane === 'spawner_prd_trace')?.proofRefJoined, true);
    assert.equal(projection.evidenceJoins?.find((join) => join.plane === 'spawner_prd_trace')?.proofCapsuleJoined, false);
    assert.match(projection.panel, /Evidence joined: .*Builder gateway/);
    assert.match(projection.panel, /Evidence joined: .*Spawner trace/);
    assert.match(projection.panel, /Evidence proof refs: .*Builder gateway/);
    assert.match(projection.panel, /Evidence proof refs: .*Spawner trace/);
    assert.match(projection.panel, /Evidence proof capsules: Telegram final/);
    assert.match(projection.panel, /Audit blocking: gaps found/);
    assert.doesNotMatch(projection.panel, /raw-request|\/Users\/example/);
  });
});

test('shows clean blocking audit while keeping legacy proof gaps visible', () => {
  withTempSparkHome((sparkHome) => {
    const traceRef = 'trace:sha256:legacyvisible';
    const latest = proofCapsule('turn:latest');
    const legacyGap = legacyGapCapsule(latest.turnRef);
    const finalAnswerPath = path.join(sparkHome, 'final-answer.jsonl');
    const spawnerPath = path.join(sparkHome, 'spawner.jsonl');
    writeJsonl(finalAnswerPath, [
      {
        request_ref: 'request:sha256:latest',
        trace_ref: traceRef,
        harness_proof_ref: latest.turnRef,
        proof_capsule: latest
      }
    ]);
    writeJsonl(spawnerPath, [
      {
        request_ref: 'request:sha256:latest',
        trace_ref: traceRef,
        harness_proof_ref: latest.turnRef,
        proof_status: 'missing_harness_authority',
        proof_storage: 'legacy_gap_capsule',
        proof_capsule: legacyGap
      },
      {
        request_ref: 'request:sha256:latest-clean',
        trace_ref: traceRef,
        harness_proof_ref: latest.turnRef,
        proof_capsule: latest
      }
    ]);

    const projection = projectHarnessProof({
      sparkHome,
      proofRef: latest.turnRef,
      traceRef,
      evidenceFiles: [
        { label: 'telegram_final_answer', filePath: finalAnswerPath, kind: 'jsonl' },
        { label: 'spawner_prd_trace', filePath: spawnerPath, kind: 'jsonl' }
      ]
    });

    assert.equal(projection.ok, true);
    assert.equal(projection.audit?.blockingOk, true);
    assert.equal(projection.audit?.legacyProofGapPlanes, 1);
    assert.deepEqual(projection.audit?.legacyProofGapPlaneLabels, ['Spawner trace']);
    assert.equal(projection.audit?.latestProofGapPlanes, 0);
    assert.deepEqual(projection.audit?.latestProofGapPlaneLabels, []);
    assert.match(projection.panel, /Audit blocking: clean/);
    assert.match(projection.panel, /Legacy proof gaps visible: 1 \(Spawner trace\)/);
    assert.match(projection.panel, /Latest proof gaps: none/);
    assert.match(projection.panel, /Evidence joined: .*Spawner trace/);
    assert.match(projection.panel, /Evidence proof refs: .*Spawner trace/);
    assert.match(projection.panel, /Evidence proof capsules: .*Spawner trace/);
    assert.match(projection.panel, /Evidence proof gaps: none/);
    assert.doesNotMatch(projection.panel, /legacyvisible|request:sha256:latest/);
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
    assert.match(projection.panel, /Evidence proof refs: Builder gateway/);
    assert.match(projection.panel, /Evidence proof capsules: none/);
    assert.match(projection.panel, /Evidence missing: .*Telegram final/);
    assert.equal(projection.evidenceJoins?.find((join) => join.plane === 'builder_gateway')?.status, 'joined');
    assert.equal(projection.evidenceJoins?.find((join) => join.plane === 'builder_gateway')?.proofRefJoined, true);
    assert.equal(projection.evidenceJoins?.find((join) => join.plane === 'builder_gateway')?.proofCapsuleJoined, false);
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

test('reports trace-only joins separately from proof refs', () => {
  withTempSparkHome((sparkHome) => {
    const traceRef = 'trace:builder:trace-only';
    writeJsonl(path.join(sparkHome, 'state', 'spark-intelligence', 'logs', 'gateway-trace.jsonl'), [
      {
        requestId: 'raw-request-trace-only',
        traceRef,
        artifact_path: '/Users/example/private/builder.log'
      }
    ]);

    const projection = projectHarnessProof({
      sparkHome,
      traceRef
    });

    assert.equal(projection.ok, false);
    assert.equal(projection.evidenceJoins?.find((join) => join.plane === 'builder_gateway')?.status, 'joined');
    assert.equal(projection.evidenceJoins?.find((join) => join.plane === 'builder_gateway')?.traceJoined, true);
    assert.equal(projection.evidenceJoins?.find((join) => join.plane === 'builder_gateway')?.proofRefJoined, false);
    assert.equal(projection.evidenceJoins?.find((join) => join.plane === 'builder_gateway')?.proofCapsuleJoined, false);
    assert.match(projection.panel, /Evidence trace-only: Builder gateway/);
    assert.match(projection.panel, /Evidence proof refs: none/);
    assert.match(projection.panel, /Evidence proof capsules: none/);
    assert.doesNotMatch(projection.panel, /raw-request-trace-only|\/Users\/example/);
  });
});

test('separates non-execution memory and voice evidence from execution proof joins', () => {
  withTempSparkHome((sparkHome) => {
    const traceRef = 'trace:sha256:nonevidenceonly';
    fs.mkdirSync(path.join(sparkHome, 'state', 'system-map'), { recursive: true });
    fs.writeFileSync(path.join(sparkHome, 'state', 'system-map', 'memory-movement-index.json'), JSON.stringify({
      schema_version: 'spark.memory_movement_trace_continuity.v1',
      request_ref: 'request:sha256:memorytrace',
      trace_ref: traceRef,
      trace_continuity: {
        trace_ref: traceRef,
        proof_status: 'not_execution_proof',
        raw_memory_exported: false
      },
      raw_memory_body: 'private memory row should stay hidden'
    }), 'utf8');
    fs.mkdirSync(path.join(sparkHome, 'state', 'spark-voice-comms'), { recursive: true });
    fs.writeFileSync(path.join(sparkHome, 'state', 'spark-voice-comms', 'voice-runtime-state.json'), JSON.stringify({
      schema_version: 'spark.voice_runtime_state.v1',
      request_ref: 'request:sha256:voicetrace',
      trace_ref: traceRef,
      trace_continuity: {
        trace_ref: traceRef,
        proof_status: 'not_execution_proof',
        raw_audio_exported: false
      },
      transcript_body: 'private transcript should stay hidden'
    }), 'utf8');

    const projection = projectHarnessProof({
      sparkHome,
      traceRef
    });

    assert.equal(projection.ok, false);
    assert.equal(projection.foundRef, null);
    assert.match(projection.panel, /Status: non-execution evidence only/);
    assert.match(projection.panel, /Gaps: no execution proof capsule expected from non-execution evidence/);
    assert.match(projection.panel, /Evidence joined: none/);
    assert.match(projection.panel, /Evidence trace-only: none/);
    assert.match(projection.panel, /Evidence non-execution: Memory movement, Voice runtime/);
    assert.equal(projection.evidenceJoins?.find((join) => join.plane === 'memory_movement_index')?.status, 'non_execution');
    assert.equal(projection.evidenceJoins?.find((join) => join.plane === 'voice_runtime_state')?.status, 'non_execution');
    assert.doesNotMatch(projection.panel, /nonevidenceonly|private memory row|private transcript/);
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
