import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import {
  auditControlProofTraceContinuity,
  formatControlProofTraceAuditReport
} from '../src/controlProofTraceAudit';

function test(name: string, fn: () => void): void {
  try {
    fn();
    console.log(`ok - ${name}`);
  } catch (error) {
    console.error(`not ok - ${name}`);
    throw error;
  }
}

function writeJsonl(filePath: string, rows: unknown[]): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${rows.map((row) => JSON.stringify(row)).join('\n')}\n`, 'utf8');
}

function writeJson(filePath: string, value: unknown): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(value, null, 2), 'utf8');
}

function withTempSparkHome(fn: (sparkHome: string) => void): void {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'spark-control-proof-audit-'));
  try {
    fn(root);
  } finally {
    const resolved = path.resolve(root);
    if (!resolved.includes('spark-control-proof-audit-')) {
      throw new Error(`Refusing to clean unexpected temp root: ${resolved}`);
    }
    fs.rmSync(resolved, { recursive: true, force: true });
  }
}

test('summarizes trace joins and raw-ref gaps without printing raw rows', () => {
  withTempSparkHome((sparkHome) => {
    writeJsonl(path.join(sparkHome, 'state', 'spark-telegram-bot', 'final-answer-gate-audit.jsonl'), [
      {
        request_id: 'req-1',
        trace_ref: 'trace-1',
        harness_proof: { decision: 'allowed' },
        reply_kind: 'natural'
      },
      {
        request_id: 'req-2',
        trace_ref: '/Users/example/private-trace.json',
        reply_kind: 'natural'
      }
    ]);
    writeJsonl(path.join(sparkHome, 'state', 'spark-telegram-bot', 'node-outbound-audit.jsonl'), [
      { text_kind: 'reply' },
      { request_id: 'req-2', trace_ref: 'trace-2' }
    ]);
    writeJsonl(path.join(sparkHome, 'state', 'spark-telegram-bot', 'route-confidence-audit.jsonl'), [
      {
        request_ref: 'request:sha256:abc123',
        trace_ref: 'trace:sha256:def456',
        proof_capsule: { schema: 'spark.harness_proof.v1' }
      }
    ]);
    writeJsonl(path.join(sparkHome, 'state', 'spark-intelligence', 'logs', 'gateway-trace.jsonl'), [
      {
        requestId: 'req-1',
        traceRef: 'trace-1',
        chatId: 123,
        reason: 'tool_not_allowed_by_policy'
      }
    ]);
    writeJson(path.join(sparkHome, 'state', 'system-map', 'memory-movement-index.json'), {
      schema_version: 'memory.index.v1',
      authority: 'evidence_only'
    });
    writeJson(path.join(sparkHome, 'state', 'spark-voice-comms', 'voice-runtime-state.json'), {
      schema_version: 'spark.voice_runtime_state.v1',
      request_id: 'turn:voice-runtime',
      trace_ref: 'trace:voice-runtime',
      harness_proof_ref: 'turn:sha256:abcdef1234567890',
      trace_continuity: {
        request_joined: true,
        trace_joined: true,
        proof_joined: true,
        proof_storage: 'redacted_ref_only'
      }
    });

    const result = auditControlProofTraceContinuity({
      sparkHome,
      sampleSize: 100,
      generatedAt: '2026-06-24T00:00:00.000Z'
    });
    const finalAnswer = result.planes.find((plane) => plane.label === 'telegram_final_answer');
    const outbound = result.planes.find((plane) => plane.label === 'telegram_outbound');
    const routeConfidence = result.planes.find((plane) => plane.label === 'telegram_route_confidence');
    const builder = result.planes.find((plane) => plane.label === 'builder_gateway');
    const voiceRuntime = result.planes.find((plane) => plane.label === 'voice_runtime_state');
    assert.equal(finalAnswer?.requestIdPresent, 2);
    assert.equal(finalAnswer?.traceRefPresent, 2);
    assert.equal(finalAnswer?.proofCapsulePresent, 1);
    assert.equal(finalAnswer?.proofNotApplicable, 0);
    assert.equal(finalAnswer?.proofGapMarked, 0);
    assert.equal(finalAnswer?.rawPathLikeRows, 1);
    assert.equal(outbound?.requestIdMissing, 1);
    assert.equal(routeConfidence?.requestIdPresent, 1);
    assert.equal(routeConfidence?.traceRefPresent, 1);
    assert.equal(routeConfidence?.proofCapsulePresent, 1);
    assert.equal(builder?.rawIdKeyRows, 1);
    assert.equal(builder?.policyReasonCodeRows, 1);
    assert.equal(voiceRuntime?.requestIdPresent, 1);
    assert.equal(voiceRuntime?.traceRefPresent, 1);
    assert.equal(voiceRuntime?.proofCapsulePresent, 1);
    assert.equal(result.gapCounts.missingTraceJoin > 0, true);
    assert.equal(result.gapCounts.rawRefLeak > 0, true);
    assert.equal(result.ok, false);

    const report = formatControlProofTraceAuditReport(result);
    assert.match(report, /telegram_final_answer/);
    assert.match(report, /missing trace joins/);
    assert.doesNotMatch(report, /private-trace|123|tool_not_allowed_by_policy/);
  });
});

test('treats explicit non-execution continuity as proof not applicable', () => {
  withTempSparkHome((sparkHome) => {
    const evidenceFiles = [
      {
        label: 'non_execution_system_map',
        filePath: path.join(sparkHome, 'non-execution-system-map.json'),
        kind: 'json' as const
      }
    ];
    writeJson(evidenceFiles[0].filePath, {
      schema_version: 'spark.system_map.non_execution.v1',
      request_ref: 'request:sha256:abcdef1234567890',
      trace_ref: 'trace:sha256:abcdef1234567890',
      authority: 'observability_non_authoritative',
      trace_continuity: {
        proof_status: 'not_execution_proof',
        proof_storage: 'missing',
        raw_audio_exported: false,
        raw_memory_exported: false
      }
    });

    const result = auditControlProofTraceContinuity({
      sparkHome,
      evidenceFiles,
      generatedAt: '2026-06-24T00:00:00.000Z'
    });
    const plane = result.planes[0];
    assert.equal(plane.proofCapsulePresent, 0);
    assert.equal(plane.proofNotApplicable, 1);
    assert.equal(plane.proofCapsuleMissing, 0);
    assert.equal(result.gapCounts.missingProofCapsule, 0);
    assert.equal(result.ok, true);
    assert.match(formatControlProofTraceAuditReport(result), /proof_n\/a 1/);
  });
});

test('counts explicit missing Harness proof markers without treating them as proof', () => {
  withTempSparkHome((sparkHome) => {
    const evidenceFiles = [
      {
        label: 'spawner_prd_trace',
        filePath: path.join(sparkHome, 'prd-auto-trace.jsonl'),
        kind: 'jsonl' as const
      }
    ];
    writeJsonl(evidenceFiles[0].filePath, [
      {
        requestId: 'tg-build-proof-gap',
        traceRef: 'trace:spawner-prd:mission-proof-gap',
        proofStatus: 'missing_harness_proof',
        event: 'request_written'
      }
    ]);

    const result = auditControlProofTraceContinuity({
      sparkHome,
      evidenceFiles,
      generatedAt: '2026-06-24T00:00:00.000Z'
    });
    const plane = result.planes[0];
    assert.equal(plane.proofCapsulePresent, 0);
    assert.equal(plane.proofNotApplicable, 0);
    assert.equal(plane.proofGapMarked, 1);
    assert.equal(plane.proofCapsuleMissing, 1);
    assert.equal(result.gapCounts.missingProofCapsule, 1);
    assert.equal(result.ok, false);
    assert.match(formatControlProofTraceAuditReport(result), /proof_gap 1/);
  });
});

test('counts legacy gap proof capsules as proof coverage and keeps the gap visible', () => {
  withTempSparkHome((sparkHome) => {
    const evidenceFiles = [
      {
        label: 'telegram_route_confidence',
        filePath: path.join(sparkHome, 'route-confidence-audit.jsonl'),
        kind: 'jsonl' as const
      }
    ];
    writeJsonl(evidenceFiles[0].filePath, [
      {
        request_ref: 'request:sha256:abcdef1234567890',
        trace_ref: 'trace:sha256:abcdef1234567890',
        harness_proof_ref: 'turn:sha256:abcdef1234567890',
        proof_status: 'missing_harness_authority',
        proof_storage: 'legacy_gap_capsule',
        proof_capsule: {
          schema: 'spark.harness_proof.v1',
          authority: { contract: 'none' },
          governor: { verified: false }
        }
      }
    ]);

    const result = auditControlProofTraceContinuity({
      sparkHome,
      evidenceFiles,
      generatedAt: '2026-06-24T00:00:00.000Z'
    });
    const plane = result.planes[0];
    assert.equal(plane.proofCapsulePresent, 1);
    assert.equal(plane.proofGapMarked, 1);
    assert.equal(plane.proofCapsuleMissing, 0);
    assert.equal(result.gapCounts.missingProofCapsule, 1);
    assert.equal(result.ok, false);
    assert.match(formatControlProofTraceAuditReport(result), /proof 1\/1/);
    assert.match(formatControlProofTraceAuditReport(result), /proof_gap 1/);
  });
});

test('reports clean when every configured plane is joined and redacted', () => {
  withTempSparkHome((sparkHome) => {
    const joined = {
      request_id: 'req-ok',
      trace_ref: 'trace-ok',
      harness_proof: { decision: 'allowed' }
    };
    const evidenceFiles = [
      {
        label: 'joined_plane',
        filePath: path.join(sparkHome, 'joined.jsonl'),
        kind: 'jsonl' as const
      }
    ];
    writeJsonl(evidenceFiles[0].filePath, [joined]);
    const result = auditControlProofTraceContinuity({
      sparkHome,
      evidenceFiles,
      generatedAt: '2026-06-24T00:00:00.000Z'
    });
    assert.equal(result.ok, true);
    assert.equal(result.gapCounts.missingTraceJoin, 0);
    assert.equal(result.gapCounts.rawRefLeak, 0);
  });
});
