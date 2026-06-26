import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import {
  auditControlProofTraceContinuity,
  defaultControlProofEvidenceFiles,
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

function legacyGapCapsule(turnRef = 'turn:sha256:abcdef1234567890'): Record<string, unknown> {
  return {
    schema: 'spark.harness_proof.v1',
    turnRef,
    authority: {
      decision: 'downgraded',
      contract: 'none',
      riskTier: 'read',
      reasonSummary: 'Historical row is inspectable only; it is not fresh Harness authority.'
    },
    governor: {
      decision: 'not_applicable',
      verified: false
    }
  };
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
    assert.equal(routeConfidence?.proofRefPresent, 0);
    assert.equal(builder?.rawIdKeyRows, 1);
    assert.equal(builder?.policyReasonCodeRows, 1);
    assert.equal(voiceRuntime?.requestIdPresent, 1);
    assert.equal(voiceRuntime?.traceRefPresent, 1);
    assert.equal(voiceRuntime?.proofCoveragePresent, 1);
    assert.equal(voiceRuntime?.proofCapsulePresent, 0);
    assert.equal(voiceRuntime?.proofRefPresent, 1);
    assert.equal(result.gapCounts.missingTraceJoin > 0, true);
    assert.equal(result.gapCounts.rawRefLeak > 0, true);
    assert.deepEqual(result.gapPlanes.rawRefLeak, ['telegram_final_answer', 'builder_gateway']);
    assert.equal(result.ok, false);
    assert.equal(result.blockingOk, false);
    assert.equal(result.gapPosture, 'blocking gaps require repair');

    const report = formatControlProofTraceAuditReport(result);
    assert.match(report, /telegram_final_answer/);
    assert.match(report, /voice_runtime_state: .*proof 1\/1 .* proof_ref 1 .* proof_capsule 0/);
    assert.match(report, /Blocking status: blocking gaps found/);
    assert.match(report, /Gap posture: blocking gaps require repair/);
    assert.match(report, /missing trace joins/);
    assert.match(report, /Gap planes:/);
    assert.match(report, /raw ref leaks: telegram_final_answer, builder_gateway/);
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
    assert.equal(plane.proofCoveragePresent, 0);
    assert.equal(plane.proofCapsulePresent, 0);
    assert.equal(plane.proofRefPresent, 0);
    assert.equal(plane.proofNotApplicable, 1);
    assert.equal(plane.proofCapsuleMissing, 0);
    assert.equal(result.gapCounts.missingProofCapsule, 0);
    assert.equal(result.gapCounts.legacyProofGap, 0);
    assert.equal(result.ok, true);
    assert.equal(result.blockingOk, true);
    assert.equal(result.gapPosture, 'clean');
    const report = formatControlProofTraceAuditReport(result);
    assert.match(report, /Gap posture: clean/);
    assert.match(report, /proof_n\/a 1/);
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
    assert.equal(plane.proofCoveragePresent, 0);
    assert.equal(plane.proofCapsulePresent, 0);
    assert.equal(plane.proofRefPresent, 0);
    assert.equal(plane.proofNotApplicable, 0);
    assert.equal(plane.proofGapMarked, 1);
    assert.equal(plane.proofGapCapsulePresent, 0);
    assert.equal(plane.proofGapRefPresent, 0);
    assert.equal(plane.proofGapBackingIncomplete, 1);
    assert.equal(plane.proofGapBacking, 'missing');
    assert.equal(plane.proofCapsuleMissing, 1);
    assert.equal(result.gapCounts.missingProofCapsule, 1);
    assert.equal(result.gapCounts.legacyProofGap, 1);
    assert.equal(result.gapCounts.incompleteLegacyProofGapBacking, 1);
    assert.equal(result.ok, false);
    assert.equal(result.blockingOk, false);
    assert.match(formatControlProofTraceAuditReport(result), /proof_gap 1/);
    assert.match(formatControlProofTraceAuditReport(result), /gap_backing missing/);
    assert.match(formatControlProofTraceAuditReport(result), /incomplete legacy gap backing: 1/);
    assert.match(formatControlProofTraceAuditReport(result), /legacy proof gaps: 1/);
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
        proof_capsule: legacyGapCapsule()
      }
    ]);

    const result = auditControlProofTraceContinuity({
      sparkHome,
      evidenceFiles,
      generatedAt: '2026-06-24T00:00:00.000Z'
    });
    const plane = result.planes[0];
    assert.equal(plane.proofCoveragePresent, 1);
    assert.equal(plane.proofCapsulePresent, 1);
    assert.equal(plane.proofRefPresent, 1);
    assert.equal(plane.proofGapMarked, 1);
    assert.equal(plane.proofGapCapsulePresent, 1);
    assert.equal(plane.proofGapCapsuleValid, 1);
    assert.equal(plane.proofGapRefPresent, 1);
    assert.equal(plane.proofGapBackingIncomplete, 0);
    assert.equal(plane.proofGapBacking, 'complete');
    assert.equal(plane.latestProofGapMarked, true);
    assert.equal(plane.proofCapsuleMissing, 0);
    assert.equal(result.gapCounts.missingProofCapsule, 0);
    assert.equal(result.gapCounts.legacyProofGap, 1);
    assert.equal(result.gapCounts.incompleteLegacyProofGapBacking, 0);
    assert.equal(result.gapCounts.latestProofGap, 1);
    assert.deepEqual(result.gapPlanes.legacyProofGap, ['telegram_route_confidence']);
    assert.deepEqual(result.gapPlanes.latestProofGap, ['telegram_route_confidence']);
    assert.equal(result.ok, false);
    assert.equal(result.blockingOk, true);
    assert.equal(result.gapPosture, 'non-blocking gaps visible');
    assert.match(formatControlProofTraceAuditReport(result), /proof 1\/1/);
    assert.match(formatControlProofTraceAuditReport(result), /proof_gap 1/);
    assert.match(formatControlProofTraceAuditReport(result), /gap_capsule 1/);
    assert.match(formatControlProofTraceAuditReport(result), /gap_capsule_valid 1/);
    assert.match(formatControlProofTraceAuditReport(result), /gap_ref 1/);
    assert.match(formatControlProofTraceAuditReport(result), /gap_backing complete/);
    assert.match(formatControlProofTraceAuditReport(result), /Blocking status: clean/);
    assert.match(formatControlProofTraceAuditReport(result), /Gap posture: non-blocking gaps visible/);
    assert.match(formatControlProofTraceAuditReport(result), /legacy proof gaps: 1/);
    assert.match(formatControlProofTraceAuditReport(result), /latest proof gaps: 1/);
    assert.match(formatControlProofTraceAuditReport(result), /legacy proof gaps: telegram_route_confidence/);
    assert.match(formatControlProofTraceAuditReport(result), /latest proof gaps: telegram_route_confidence/);
  });
});

test('blocks legacy proof gaps when backing capsule is not a downgrade capsule', () => {
  withTempSparkHome((sparkHome) => {
    const evidenceFiles = [
      {
        label: 'builder_gateway',
        filePath: path.join(sparkHome, 'gateway-trace.jsonl'),
        kind: 'jsonl' as const
      }
    ];
    writeJsonl(evidenceFiles[0].filePath, [
      {
        requestId: 'req-partial-gap',
        traceRef: 'trace-partial-gap',
        harnessProofRef: 'turn:sha256:abcdef1234567890',
        proofStatus: 'missing_harness_authority',
        proofStorage: 'legacy_gap_capsule',
        proofCapsule: {
          schema: 'spark.harness_proof.v1',
          turnRef: 'turn:sha256:abcdef1234567890'
        }
      }
    ]);

    const result = auditControlProofTraceContinuity({
      sparkHome,
      evidenceFiles,
      generatedAt: '2026-06-24T00:00:00.000Z'
    });
    const plane = result.planes[0];
    assert.equal(plane.proofCoveragePresent, 1);
    assert.equal(plane.proofCapsuleMissing, 0);
    assert.equal(plane.proofGapBackingIncomplete, 1);
    assert.equal(plane.proofGapCapsuleValid, 0);
    assert.equal(plane.proofGapBacking, 'invalid');
    assert.equal(result.gapCounts.missingProofCapsule, 0);
    assert.equal(result.gapCounts.incompleteLegacyProofGapBacking, 1);
    assert.equal(result.blockingOk, false);
    assert.match(formatControlProofTraceAuditReport(result), /gap_capsule_valid 0/);
    assert.match(formatControlProofTraceAuditReport(result), /gap_backing invalid/);
    assert.match(formatControlProofTraceAuditReport(result), /incomplete legacy gap backing: 1/);
    assert.match(formatControlProofTraceAuditReport(result), /incomplete legacy gap backing: builder_gateway/);
  });
});

test('distinguishes historical legacy proof gaps from the latest clean producer row', () => {
  withTempSparkHome((sparkHome) => {
    const evidenceFiles = [
      {
        label: 'builder_gateway',
        filePath: path.join(sparkHome, 'gateway-trace.jsonl'),
        kind: 'jsonl' as const
      }
    ];
    writeJsonl(evidenceFiles[0].filePath, [
      {
        timestamp: '2026-06-24T12:00:00.000Z',
        requestId: 'req-old',
        traceRef: 'trace-old',
        harnessProofRef: 'turn:sha256:abcdef1234567890',
        proofStatus: 'missing_harness_authority',
        proofStorage: 'source_gap_capsule',
        proofCapsule: legacyGapCapsule()
      },
      {
        timestamp: '2026-06-24T12:05:00.000Z',
        requestId: 'req-new',
        traceRef: 'trace-new',
        harnessProofRef: 'turn:sha256:fedcba9876543210',
        proofCapsule: {
          schema: 'spark.harness_proof.v1',
          turnRef: 'turn:sha256:fedcba9876543210'
        }
      }
    ]);

    const result = auditControlProofTraceContinuity({
      sparkHome,
      evidenceFiles,
      generatedAt: '2026-06-24T00:00:00.000Z'
    });
    const plane = result.planes[0];
    assert.equal(plane.proofGapMarked, 1);
    assert.equal(plane.proofGapCapsulePresent, 1);
    assert.equal(plane.proofGapCapsuleValid, 1);
    assert.equal(plane.proofGapRefPresent, 1);
    assert.equal(plane.proofGapBackingIncomplete, 0);
    assert.equal(plane.proofGapBacking, 'complete');
    assert.equal(plane.latestProofGapMarked, false);
    assert.equal(plane.latestRecordAt, '2026-06-24T12:05:00.000Z');
    assert.equal(result.gapCounts.legacyProofGap, 1);
    assert.equal(result.gapCounts.latestProofGap, 0);
    assert.deepEqual(result.gapPlanes.latestProofGap, []);
    assert.equal(result.gapPosture, 'backed legacy gaps only; no blocking or latest proof gaps');
    const report = formatControlProofTraceAuditReport(result);
    assert.match(report, /builder_gateway: .*proof_gap 1 .* gap_capsule 1 .* gap_capsule_valid 1 .* gap_ref 1 .* gap_backing complete .* latest_gap no/);
    assert.match(report, /Gap posture: backed legacy gaps only; no blocking or latest proof gaps/);
    assert.match(report, /latest proof gaps: 0/);
  });
});

test('CLI JSON includes machine-readable gap posture', () => {
  withTempSparkHome((sparkHome) => {
    for (const file of defaultControlProofEvidenceFiles(sparkHome)) {
      const row = {
        request_ref: 'request:sha256:nonexecution',
        trace_ref: 'trace:sha256:nonexecution',
        proof_status: 'not_execution_proof'
      };
      if (file.kind === 'jsonl') {
        writeJsonl(file.filePath, [row]);
      } else {
        writeJson(file.filePath, row);
      }
    }

    const jsonAudit = spawnSync(
      process.execPath,
      [
        path.resolve(__dirname, '../node_modules/ts-node/dist/bin.js'),
        'ops/controlProofTraceAudit.ts',
        '--spark-home',
        sparkHome,
        '--json'
      ],
      { cwd: path.resolve(__dirname, '..'), encoding: 'utf8' }
    );
    assert.equal(jsonAudit.status, 0, jsonAudit.stderr);
    const parsed = JSON.parse(jsonAudit.stdout) as { gapPosture?: string };
    assert.equal(parsed.gapPosture, 'clean');
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
    assert.equal(result.blockingOk, true);
    assert.equal(result.gapCounts.missingTraceJoin, 0);
    assert.equal(result.gapCounts.rawRefLeak, 0);
    assert.equal(result.gapCounts.latestProofGap, 0);
  });
});

test('blocking strict CLI allows visible legacy proof gaps but strict still fails them', () => {
  withTempSparkHome((sparkHome) => {
    for (const file of defaultControlProofEvidenceFiles(sparkHome)) {
      if (file.label === 'telegram_route_confidence') continue;
      const row = {
        request_ref: 'request:sha256:nonexecution',
        trace_ref: 'trace:sha256:nonexecution',
        proof_status: 'not_execution_proof'
      };
      if (file.kind === 'jsonl') {
        writeJsonl(file.filePath, [row]);
      } else {
        writeJson(file.filePath, row);
      }
    }
    writeJsonl(path.join(sparkHome, 'state', 'spark-telegram-bot', 'route-confidence-audit.jsonl'), [
      {
        request_ref: 'request:sha256:abcdef1234567890',
        trace_ref: 'trace:sha256:abcdef1234567890',
        harness_proof_ref: 'turn:sha256:abcdef1234567890',
        proof_status: 'missing_harness_authority',
        proof_storage: 'legacy_gap_capsule',
        proof_capsule: {
          ...legacyGapCapsule(),
          turnRef: 'turn:sha256:abcdef1234567890',
          route: 'legacy.route_confidence',
          owner: 'spark-telegram-bot',
          intent: { kind: 'chat', confidence: 'heuristic', noExecution: true },
          execution: { status: 'not_started', mutationClass: 'none' },
          reply: { delivered: false, shape: 'none', rawReasonsHidden: true },
          joins: { telegram: 'joined' }
        }
      }
    ]);

    const blockingStrict = spawnSync(
      process.execPath,
      [
        path.resolve(__dirname, '../node_modules/ts-node/dist/bin.js'),
        'ops/controlProofTraceAudit.ts',
        '--spark-home',
        sparkHome,
        '--blocking-strict'
      ],
      { cwd: path.resolve(__dirname, '..'), encoding: 'utf8' }
    );
    assert.equal(blockingStrict.status, 0, blockingStrict.stderr);
    assert.match(blockingStrict.stdout, /Status: gaps found/);
    assert.match(blockingStrict.stdout, /Blocking status: clean/);
    assert.match(blockingStrict.stdout, /legacy proof gaps: 1/);
    assert.match(blockingStrict.stdout, /latest proof gaps: 1/);
    assert.match(blockingStrict.stdout, /legacy proof gaps: telegram_route_confidence/);
    assert.match(blockingStrict.stdout, /latest proof gaps: telegram_route_confidence/);

    const absoluteStrict = spawnSync(
      process.execPath,
      [
        path.resolve(__dirname, '../node_modules/ts-node/dist/bin.js'),
        'ops/controlProofTraceAudit.ts',
        '--spark-home',
        sparkHome,
        '--strict'
      ],
      { cwd: path.resolve(__dirname, '..'), encoding: 'utf8' }
    );
    assert.equal(absoluteStrict.status, 1);
    assert.match(absoluteStrict.stdout, /Status: gaps found/);
    assert.match(absoluteStrict.stdout, /Blocking status: clean/);
  });
});

test('fresh strict CLI fails on blocking gaps and latest producer proof gaps', () => {
  withTempSparkHome((sparkHome) => {
    for (const file of defaultControlProofEvidenceFiles(sparkHome)) {
      if (file.label === 'builder_gateway') continue;
      const row = {
        request_ref: 'request:sha256:nonexecution',
        trace_ref: 'trace:sha256:nonexecution',
        proof_status: 'not_execution_proof'
      };
      if (file.kind === 'jsonl') {
        writeJsonl(file.filePath, [row]);
      } else {
        writeJson(file.filePath, row);
      }
    }
    const tracePath = path.join(sparkHome, 'state', 'spark-intelligence', 'logs', 'gateway-trace.jsonl');
    writeJsonl(tracePath, [
      {
        requestId: 'req-old',
        traceRef: 'trace-old',
        harnessProofRef: 'turn:sha256:abcdef1234567890',
        proofStatus: 'missing_harness_authority',
        proofCapsule: legacyGapCapsule()
      },
      {
        requestId: 'req-new',
        traceRef: 'trace-new',
        harnessProofRef: 'turn:sha256:fedcba9876543210',
        proofCapsule: { schema: 'spark.harness_proof.v1', turnRef: 'turn:sha256:fedcba9876543210' }
      }
    ]);

    const freshStrictClean = spawnSync(
      process.execPath,
      [
        path.resolve(__dirname, '../node_modules/ts-node/dist/bin.js'),
        'ops/controlProofTraceAudit.ts',
        '--spark-home',
        sparkHome,
        '--sample',
        '10',
        '--fresh-strict'
      ],
      { cwd: path.resolve(__dirname, '..'), encoding: 'utf8' }
    );
    assert.equal(freshStrictClean.status, 0, freshStrictClean.stderr);
    assert.match(freshStrictClean.stdout, /Gap posture: backed legacy gaps only; no blocking or latest proof gaps/);
    assert.match(freshStrictClean.stdout, /legacy proof gaps: 1/);
    assert.match(freshStrictClean.stdout, /latest proof gaps: 0/);
    assert.match(freshStrictClean.stdout, /latest_gap no/);

    const finalAnswerPath = path.join(sparkHome, 'state', 'spark-telegram-bot', 'final-answer-gate-audit.jsonl');
    writeJsonl(finalAnswerPath, [
      {
        request_ref: 'request:sha256:blocking-gap',
        proof_status: 'not_execution_proof'
      }
    ]);

    const freshStrictBlockingGap = spawnSync(
      process.execPath,
      [
        path.resolve(__dirname, '../node_modules/ts-node/dist/bin.js'),
        'ops/controlProofTraceAudit.ts',
        '--spark-home',
        sparkHome,
        '--sample',
        '10',
        '--fresh-strict'
      ],
      { cwd: path.resolve(__dirname, '..'), encoding: 'utf8' }
    );
    assert.equal(freshStrictBlockingGap.status, 1);
    assert.match(freshStrictBlockingGap.stdout, /Blocking status: blocking gaps found/);
    assert.match(freshStrictBlockingGap.stdout, /Gap posture: blocking gaps require repair/);
    assert.match(freshStrictBlockingGap.stdout, /missing trace joins: 1/);

    writeJsonl(finalAnswerPath, [
      {
        request_ref: 'request:sha256:nonexecution',
        trace_ref: 'trace:sha256:nonexecution',
        proof_status: 'not_execution_proof'
      }
    ]);

    writeJsonl(tracePath, [
      {
        requestId: 'req-latest-gap',
        traceRef: 'trace-latest-gap',
        harnessProofRef: 'turn:sha256:1111111111111111',
        proofStatus: 'missing_harness_authority',
        proofCapsule: legacyGapCapsule('turn:sha256:1111111111111111')
      }
    ]);

    const freshStrictGap = spawnSync(
      process.execPath,
      [
        path.resolve(__dirname, '../node_modules/ts-node/dist/bin.js'),
        'ops/controlProofTraceAudit.ts',
        '--spark-home',
        sparkHome,
        '--sample',
        '10',
        '--fresh-strict'
      ],
      { cwd: path.resolve(__dirname, '..'), encoding: 'utf8' }
    );
    assert.equal(freshStrictGap.status, 1);
    assert.match(freshStrictGap.stdout, /latest_gap yes/);
    assert.match(freshStrictGap.stdout, /latest proof gaps: 1/);
  });
});
