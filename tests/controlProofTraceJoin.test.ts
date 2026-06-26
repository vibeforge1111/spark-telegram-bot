import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import {
  auditControlProofTraceJoins,
  formatControlProofTraceJoinReport
} from '../src/controlProofTraceJoin';

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

function withTempRoot(fn: (root: string) => void): void {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'spark-trace-join-'));
  try {
    fn(root);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
}

function routeRow(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    schema_version: 'spark.nlp.route_execution.v1',
    recorded_at: '2026-06-26T00:00:00.000Z',
    request_id: 'turn:joined',
    trace_ref: 'trace:joined',
    harness_proof_ref: 'turn:sha256:abcdef1234567890',
    profile: 'primary',
    user_id: 'user_1111111111111111',
    chat_id: 'chat_1111111111111111',
    chat_type: 'private',
    admin: true,
    shadow_route: 'plain_chat',
    shadow_owner: 'none',
    shadow_confidence: 'weak',
    shadow_context_source: 'none',
    shadow_requires_confirmation: false,
    shadow_signals: [],
    shadow_blocked_by: [],
    executed_route: 'plain_chat',
    executed_owner: 'spark-telegram-bot',
    executed_action: 'answer',
    outcome: 'matched',
    delivery: 'delivered',
    ...overrides
  };
}

const SAFE_PROMPT_SIGNATURES = [
  ['fresh_state.risk_profile', 'harness_core.risk_profile'],
  ['conversation.mission_routing_failure_class', 'plain_chat.qa_boundary'],
  ['fresh_state.read_only_repair_status', 'harness_core.read_only_state'],
  ['fresh_state.authority_answer', 'harness_core.source_priority']
] as const;

function safePromptRows(): Record<string, unknown>[] {
  return SAFE_PROMPT_SIGNATURES.map(([executedRoute, executedAction], index) => routeRow({
    request_id: `turn:safe-${index}`,
    trace_ref: `trace:safe-${index}`,
    harness_proof_ref: `turn:sha256:safe${index}`,
    shadow_route: executedRoute,
    executed_route: executedRoute,
    executed_action: executedAction,
    delivery: 'selected'
  }));
}

function proofRowsFor(rows: Record<string, unknown>[]): Record<string, unknown>[] {
  return rows.map((row) => ({
    request_id: row.request_id,
    trace_ref: row.trace_ref,
    harness_proof_ref: row.harness_proof_ref,
    proof_capsule: { schema: 'spark.harness_proof.v1', turnRef: row.harness_proof_ref }
  }));
}

test('joins natural route decisions to reply and proof evidence', () => {
  withTempRoot((root) => {
    const routeLedger = path.join(root, 'route-ledger.jsonl');
    const finalAnswer = path.join(root, 'final-answer.jsonl');
    const outbound = path.join(root, 'outbound.jsonl');
    writeJsonl(routeLedger, [routeRow()]);
    writeJsonl(finalAnswer, [{
      request_id: 'turn:joined',
      trace_ref: 'trace:joined',
      harness_proof_ref: 'turn:sha256:abcdef1234567890',
      proof_capsule: { schema: 'spark.harness_proof.v1', turnRef: 'turn:sha256:abcdef1234567890' }
    }]);
    writeJsonl(outbound, []);

    const result = auditControlProofTraceJoins({
      sparkHome: root,
      naturalRouteLedger: routeLedger,
      finalAnswerAudit: finalAnswer,
      outboundAudit: outbound,
      generatedAt: '2026-06-26T00:00:00.000Z'
    });

    assert.equal(result.ok, true);
    assert.equal(result.joinedRows, 1);
    assert.equal(result.gapRows, 0);
    assert.equal(result.rows[0].replyJoined, true);
    assert.equal(result.rows[0].proofJoined, true);
    assert.equal(result.rows[0].noActionEvidence, true);
    assert.equal(result.rows[0].staleLiveEvidence, false);
    assert.match(formatControlProofTraceJoinReport(result), /Status: clean/);
  });
});

test('reports missing join keys and reply/proof joins without raw ids', () => {
  withTempRoot((root) => {
    const routeLedger = path.join(root, 'route-ledger.jsonl');
    const finalAnswer = path.join(root, 'final-answer.jsonl');
    const outbound = path.join(root, 'outbound.jsonl');
    writeJsonl(routeLedger, [
      routeRow({ request_id: undefined, trace_ref: undefined, harness_proof_ref: undefined })
    ]);
    writeJsonl(finalAnswer, []);
    writeJsonl(outbound, []);

    const result = auditControlProofTraceJoins({
      sparkHome: root,
      naturalRouteLedger: routeLedger,
      finalAnswerAudit: finalAnswer,
      outboundAudit: outbound,
      generatedAt: '2026-06-26T00:00:00.000Z'
    });
    const report = formatControlProofTraceJoinReport(result);

    assert.equal(result.ok, false);
    assert.equal(result.missingJoinKeyRows, 1);
    assert.equal(result.missingReplyJoinRows, 1);
    assert.equal(result.missingProofJoinRows, 1);
    assert.match(report, /missing_join_keys, missing_reply_join, missing_proof_join/);
    assert.doesNotMatch(report, /user_1111111111111111|chat_1111111111111111|turn:joined|trace:joined/);
  });
});

test('requires request and trace refs to join on the same reply evidence row', () => {
  withTempRoot((root) => {
    const routeLedger = path.join(root, 'route-ledger.jsonl');
    const finalAnswer = path.join(root, 'final-answer.jsonl');
    const outbound = path.join(root, 'outbound.jsonl');
    writeJsonl(routeLedger, [routeRow()]);
    writeJsonl(finalAnswer, [
      {
        request_id: 'turn:joined',
        trace_ref: 'trace:other',
        harness_proof_ref: 'turn:sha256:abcdef1234567890',
        proof_capsule: { schema: 'spark.harness_proof.v1', turnRef: 'turn:sha256:abcdef1234567890' }
      },
      {
        request_id: 'turn:other',
        trace_ref: 'trace:joined'
      }
    ]);
    writeJsonl(outbound, []);

    const result = auditControlProofTraceJoins({
      sparkHome: root,
      naturalRouteLedger: routeLedger,
      finalAnswerAudit: finalAnswer,
      outboundAudit: outbound,
      generatedAt: '2026-06-26T00:00:00.000Z'
    });

    assert.equal(result.ok, false);
    assert.equal(result.rows[0].requestIdPresent, true);
    assert.equal(result.rows[0].traceRefPresent, true);
    assert.equal(result.rows[0].replyJoined, false);
    assert.equal(result.rows[0].proofJoined, true);
    assert.deepEqual(result.rows[0].gaps, ['missing_reply_join']);
    assert.equal(result.missingReplyJoinRows, 1);
  });
});

test('reports route mismatches and missing action evidence', () => {
  withTempRoot((root) => {
    const routeLedger = path.join(root, 'route-ledger.jsonl');
    const finalAnswer = path.join(root, 'final-answer.jsonl');
    const outbound = path.join(root, 'outbound.jsonl');
    writeJsonl(routeLedger, [
      routeRow({
        executed_route: 'spawner.build',
        executed_action: '',
        outcome: 'mismatch',
        delivery: 'unknown'
      })
    ]);
    writeJsonl(finalAnswer, [{
      request_id: 'turn:joined',
      trace_ref: 'trace:joined',
      harness_proof_ref: 'turn:sha256:abcdef1234567890'
    }]);
    writeJsonl(outbound, []);

    const result = auditControlProofTraceJoins({
      sparkHome: root,
      naturalRouteLedger: routeLedger,
      finalAnswerAudit: finalAnswer,
      outboundAudit: outbound,
      generatedAt: '2026-06-26T00:00:00.000Z'
    });

    assert.equal(result.ok, false);
    assert.equal(result.routeMismatchRows, 1);
    assert.equal(result.missingActionEvidenceRows, 1);
    assert.deepEqual(result.rows[0].gaps, ['missing_action_or_no_action_evidence', 'route_mismatch']);
  });
});

test('live evidence mode rejects stale joined route rows', () => {
  withTempRoot((root) => {
    const routeLedger = path.join(root, 'route-ledger.jsonl');
    const finalAnswer = path.join(root, 'final-answer.jsonl');
    const outbound = path.join(root, 'outbound.jsonl');
    writeJsonl(routeLedger, [routeRow({ recorded_at: '2026-06-26T00:00:00.000Z' })]);
    writeJsonl(finalAnswer, [{
      request_id: 'turn:joined',
      trace_ref: 'trace:joined',
      harness_proof_ref: 'turn:sha256:abcdef1234567890',
      proof_capsule: { schema: 'spark.harness_proof.v1', turnRef: 'turn:sha256:abcdef1234567890' }
    }]);
    writeJsonl(outbound, []);

    const result = auditControlProofTraceJoins({
      sparkHome: root,
      naturalRouteLedger: routeLedger,
      finalAnswerAudit: finalAnswer,
      outboundAudit: outbound,
      requireLiveEvidence: true,
      minRouteRows: 1,
      minNoActionRows: 1,
      maxLiveEvidenceAgeMs: 60 * 60 * 1000,
      generatedAt: '2026-06-26T02:30:00.000Z'
    });
    const report = formatControlProofTraceJoinReport(result);

    assert.equal(result.ok, false);
    assert.equal(result.staleRouteRows, 1);
    assert.equal(result.rows[0].staleLiveEvidence, true);
    assert.deepEqual(result.rows[0].gaps, ['stale_live_route_evidence']);
    assert.match(report, /stale live route evidence: 1/);
  });
});

test('treats empty route evidence as not proven', () => {
  withTempRoot((root) => {
    const routeLedger = path.join(root, 'route-ledger.jsonl');
    const finalAnswer = path.join(root, 'final-answer.jsonl');
    const outbound = path.join(root, 'outbound.jsonl');
    writeJsonl(routeLedger, []);
    writeJsonl(finalAnswer, []);
    writeJsonl(outbound, []);

    const result = auditControlProofTraceJoins({
      sparkHome: root,
      naturalRouteLedger: routeLedger,
      finalAnswerAudit: finalAnswer,
      outboundAudit: outbound,
      generatedAt: '2026-06-26T00:00:00.000Z'
    });

    assert.equal(result.ok, false);
    assert.equal(result.noRouteEvidence, true);
    assert.equal(result.routeLedgerExists, true);
    assert.equal(result.routeLedgerState, 'empty');
    assert.match(formatControlProofTraceJoinReport(result), /No route evidence sampled/);
    assert.match(formatControlProofTraceJoinReport(result), /Route ledger state: empty/);
    assert.match(formatControlProofTraceJoinReport(result), /route ledger file exists but has no rows/);
  });
});

test('diagnoses missing route ledger separately from reply proof audits', () => {
  withTempRoot((root) => {
    const routeLedger = path.join(root, 'missing-route-ledger.jsonl');
    const finalAnswer = path.join(root, 'final-answer.jsonl');
    const outbound = path.join(root, 'outbound.jsonl');
    writeJsonl(finalAnswer, [{
      request_id: 'turn:joined',
      trace_ref: 'trace:joined',
      harness_proof_ref: 'turn:sha256:abcdef1234567890',
      proof_capsule: { schema: 'spark.harness_proof.v1', turnRef: 'turn:sha256:abcdef1234567890' }
    }]);
    writeJsonl(outbound, [{
      request_id: 'turn:joined',
      trace_ref: 'trace:joined',
      harness_proof_ref: 'turn:sha256:abcdef1234567890'
    }]);

    const result = auditControlProofTraceJoins({
      sparkHome: root,
      naturalRouteLedger: routeLedger,
      finalAnswerAudit: finalAnswer,
      outboundAudit: outbound,
      requireLiveEvidence: true,
      minRouteRows: 4,
      generatedAt: '2026-06-26T00:00:00.000Z'
    });
    const report = formatControlProofTraceJoinReport(result);

    assert.equal(result.ok, false);
    assert.equal(result.routeLedgerExists, false);
    assert.equal(result.routeLedgerBytes, 0);
    assert.equal(result.routeLedgerState, 'missing');
    assert.equal(result.finalAnswerAuditRows, 1);
    assert.equal(result.outboundAuditRows, 1);
    assert.match(report, /Route ledger state: missing \(file missing\)/);
    assert.match(report, /Evidence audits: final answers 1 rows, outbound 1 rows/);
    assert.match(report, /route ledger file is missing at the expected Spark state path/);
    assert.match(report, /Telegram reply\/proof audit rows exist, so this is specifically a route-ledger capture gap/);
    assert.match(report, /verify the live relay is running the current built source/);
  });
});

test('live evidence mode requires enough joined route rows', () => {
  withTempRoot((root) => {
    const routeLedger = path.join(root, 'route-ledger.jsonl');
    const finalAnswer = path.join(root, 'final-answer.jsonl');
    const outbound = path.join(root, 'outbound.jsonl');
    writeJsonl(routeLedger, [routeRow()]);
    writeJsonl(finalAnswer, [{
      request_id: 'turn:joined',
      trace_ref: 'trace:joined',
      harness_proof_ref: 'turn:sha256:abcdef1234567890',
      proof_capsule: { schema: 'spark.harness_proof.v1', turnRef: 'turn:sha256:abcdef1234567890' }
    }]);
    writeJsonl(outbound, []);

    const result = auditControlProofTraceJoins({
      sparkHome: root,
      naturalRouteLedger: routeLedger,
      finalAnswerAudit: finalAnswer,
      outboundAudit: outbound,
      requireLiveEvidence: true,
      minRouteRows: 4,
      generatedAt: '2026-06-26T00:00:00.000Z'
    });
    const report = formatControlProofTraceJoinReport(result);

    assert.equal(result.ok, false);
    assert.equal(result.liveEvidenceRequired, true);
    assert.equal(result.liveEvidenceReady, false);
    assert.equal(result.insufficientLiveRouteRows, true);
    assert.equal(result.insufficientNoActionRows, true);
    assert.equal(result.noActionEvidenceRows, 1);
    assert.match(report, /Live route proof: not ready \(1\/4 minimum joined rows\)/);
    assert.match(report, /No-action route proof: not ready \(1\/4 minimum no-action rows\)/);
    assert.match(report, /capture real SparkRecursive_bot Telegram text turns/);
    assert.match(report, /Safe SparkRecursive_bot prompts:/);
    assert.match(report, /1\. I am mentioning build and mission, but do not start anything/);
    assert.match(report, /4\. If memory says Spawner is down but spark live status says it is up, which source wins\?/);
    assert.match(report, /After Spark replies to all four, rerun: npm run control:proof:live-trace/);
  });
});

test('live evidence mode requires joined no-action route rows, not only joined action rows', () => {
  withTempRoot((root) => {
    const routeLedger = path.join(root, 'route-ledger.jsonl');
    const finalAnswer = path.join(root, 'final-answer.jsonl');
    const outbound = path.join(root, 'outbound.jsonl');
    const rows = Array.from({ length: 4 }, (_, index) => routeRow({
      request_id: `turn:action-${index}`,
      trace_ref: `trace:action-${index}`,
      harness_proof_ref: `turn:sha256:action${index}`,
      executed_route: 'mission.launch',
      executed_action: 'launch_mission',
      delivery: 'selected'
    }));
    writeJsonl(routeLedger, rows);
    writeJsonl(finalAnswer, rows.map((row) => ({
      request_id: row.request_id,
      trace_ref: row.trace_ref,
      harness_proof_ref: row.harness_proof_ref,
      proof_capsule: { schema: 'spark.harness_proof.v1', turnRef: row.harness_proof_ref }
    })));
    writeJsonl(outbound, []);

    const result = auditControlProofTraceJoins({
      sparkHome: root,
      naturalRouteLedger: routeLedger,
      finalAnswerAudit: finalAnswer,
      outboundAudit: outbound,
      requireLiveEvidence: true,
      minRouteRows: 4,
      generatedAt: '2026-06-26T00:00:00.000Z'
    });
    const report = formatControlProofTraceJoinReport(result);

    assert.equal(result.ok, false);
    assert.equal(result.joinedRows, 4);
    assert.equal(result.gapRows, 0);
    assert.equal(result.insufficientLiveRouteRows, false);
    assert.equal(result.noActionEvidenceRows, 0);
    assert.equal(result.insufficientNoActionRows, true);
    assert.match(report, /Live route proof: not ready \(4\/4 minimum joined rows\)/);
    assert.match(report, /No-action route proof: not ready \(0\/4 minimum no-action rows\)/);
  });
});

test('live evidence mode counts only clean joined rows toward readiness', () => {
  withTempRoot((root) => {
    const routeLedger = path.join(root, 'route-ledger.jsonl');
    const finalAnswer = path.join(root, 'final-answer.jsonl');
    const outbound = path.join(root, 'outbound.jsonl');
    const rows = Array.from({ length: 4 }, (_, index) => routeRow({
      request_id: `turn:route-${index}`,
      trace_ref: `trace:route-${index}`,
      harness_proof_ref: `turn:sha256:joined${index}`,
      executed_action: 'answer',
      delivery: 'delivered'
    }));
    writeJsonl(routeLedger, rows);
    writeJsonl(finalAnswer, rows.slice(0, 2).map((row) => ({
      request_id: row.request_id,
      trace_ref: row.trace_ref,
      harness_proof_ref: row.harness_proof_ref,
      proof_capsule: { schema: 'spark.harness_proof.v1', turnRef: row.harness_proof_ref }
    })));
    writeJsonl(outbound, []);

    const result = auditControlProofTraceJoins({
      sparkHome: root,
      naturalRouteLedger: routeLedger,
      finalAnswerAudit: finalAnswer,
      outboundAudit: outbound,
      requireLiveEvidence: true,
      minRouteRows: 4,
      minNoActionRows: 4,
      generatedAt: '2026-06-26T00:00:00.000Z'
    });
    const report = formatControlProofTraceJoinReport(result);

    assert.equal(result.ok, false);
    assert.equal(result.sampledRouteRows, 4);
    assert.equal(result.joinedRows, 2);
    assert.equal(result.noActionEvidenceRows, 2);
    assert.equal(result.insufficientLiveRouteRows, true);
    assert.equal(result.insufficientNoActionRows, true);
    assert.match(report, /Live route proof: not ready \(2\/4 minimum joined rows\)/);
    assert.match(report, /No-action route proof: not ready \(2\/4 minimum no-action rows\)/);
  });
});

test('live evidence mode requires the distinct safe prompt signatures', () => {
  withTempRoot((root) => {
    const routeLedger = path.join(root, 'route-ledger.jsonl');
    const finalAnswer = path.join(root, 'final-answer.jsonl');
    const outbound = path.join(root, 'outbound.jsonl');
    const rows = Array.from({ length: 4 }, (_, index) => routeRow({
      request_id: `turn:generic-${index}`,
      trace_ref: `trace:generic-${index}`,
      harness_proof_ref: `turn:sha256:generic${index}`,
      executed_action: 'answer',
      delivery: 'delivered'
    }));
    writeJsonl(routeLedger, rows);
    writeJsonl(finalAnswer, proofRowsFor(rows));
    writeJsonl(outbound, []);

    const result = auditControlProofTraceJoins({
      sparkHome: root,
      naturalRouteLedger: routeLedger,
      finalAnswerAudit: finalAnswer,
      outboundAudit: outbound,
      requireLiveEvidence: true,
      minRouteRows: 4,
      minNoActionRows: 4,
      generatedAt: '2026-06-26T00:00:00.000Z'
    });
    const report = formatControlProofTraceJoinReport(result);

    assert.equal(result.ok, false);
    assert.equal(result.joinedRows, 4);
    assert.equal(result.noActionEvidenceRows, 4);
    assert.equal(result.safePromptEvidenceRows, 0);
    assert.deepEqual(result.safePromptEvidence, []);
    assert.deepEqual(result.missingSafePromptEvidence, [
      'risk_profile_no_build',
      'mission_routing_explain_only',
      'repair_status_no_action',
      'memory_vs_fresh_state'
    ]);
    assert.match(report, /Safe prompt proof: not ready \(0\/4 required safe prompts\)/);
    assert.match(report, /Missing safe prompt evidence: risk_profile_no_build/);
  });
});

test('live evidence mode accepts clean joined rows for all safe prompt signatures', () => {
  withTempRoot((root) => {
    const routeLedger = path.join(root, 'route-ledger.jsonl');
    const finalAnswer = path.join(root, 'final-answer.jsonl');
    const outbound = path.join(root, 'outbound.jsonl');
    const rows = safePromptRows();
    writeJsonl(routeLedger, rows);
    writeJsonl(finalAnswer, proofRowsFor(rows));
    writeJsonl(outbound, []);

    const result = auditControlProofTraceJoins({
      sparkHome: root,
      naturalRouteLedger: routeLedger,
      finalAnswerAudit: finalAnswer,
      outboundAudit: outbound,
      requireLiveEvidence: true,
      minRouteRows: 4,
      minNoActionRows: 4,
      generatedAt: '2026-06-26T00:00:00.000Z'
    });
    const report = formatControlProofTraceJoinReport(result);

    assert.equal(result.ok, true);
    assert.equal(result.liveEvidenceReady, true);
    assert.equal(result.joinedRows, 4);
    assert.equal(result.noActionEvidenceRows, 4);
    assert.equal(result.safePromptEvidenceRows, 4);
    assert.deepEqual(result.safePromptEvidence, [
      'risk_profile_no_build',
      'mission_routing_explain_only',
      'repair_status_no_action',
      'memory_vs_fresh_state'
    ]);
    assert.deepEqual(result.missingSafePromptEvidence, []);
    assert.match(report, /Safe prompt proof: ready \(4\/4 required safe prompts\)/);
    assert.match(report, /Safe prompt evidence: risk_profile_no_build, mission_routing_explain_only, repair_status_no_action, memory_vs_fresh_state/);
  });
});

test('trace join CLI fails strict mode on gaps', () => {
  withTempRoot((root) => {
    const routeLedger = path.join(root, 'route-ledger.jsonl');
    const finalAnswer = path.join(root, 'final-answer.jsonl');
    const outbound = path.join(root, 'outbound.jsonl');
    writeJsonl(routeLedger, [routeRow({ request_id: undefined, trace_ref: undefined, harness_proof_ref: undefined })]);
    writeJsonl(finalAnswer, []);
    writeJsonl(outbound, []);

    const result = spawnSync(process.execPath, [
      '-r',
      'ts-node/register',
      path.join(__dirname, '..', 'ops', 'controlProofTraceJoin.ts'),
      '--strict',
      '--spark-home',
      root,
      '--natural-route-ledger',
      routeLedger,
      '--final-answer-audit',
      finalAnswer,
      '--outbound-audit',
      outbound
    ], {
      cwd: path.join(__dirname, '..'),
      encoding: 'utf8'
    });

    assert.equal(result.status, 1);
    assert.match(result.stdout, /Status: gaps found/);
    assert.match(result.stdout, /missing join keys: 1/);
  });
});

test('trace join CLI fails live evidence mode when route rows are below the minimum', () => {
  withTempRoot((root) => {
    const routeLedger = path.join(root, 'route-ledger.jsonl');
    const finalAnswer = path.join(root, 'final-answer.jsonl');
    const outbound = path.join(root, 'outbound.jsonl');
    writeJsonl(routeLedger, [routeRow()]);
    writeJsonl(finalAnswer, [{
      request_id: 'turn:joined',
      trace_ref: 'trace:joined',
      harness_proof_ref: 'turn:sha256:abcdef1234567890',
      proof_capsule: { schema: 'spark.harness_proof.v1', turnRef: 'turn:sha256:abcdef1234567890' }
    }]);
    writeJsonl(outbound, []);

    const result = spawnSync(process.execPath, [
      '-r',
      'ts-node/register',
      path.join(__dirname, '..', 'ops', 'controlProofTraceJoin.ts'),
      '--strict',
      '--require-live-evidence',
      '--min-route-rows',
      '4',
      '--max-live-age-minutes',
      '1000000',
      '--spark-home',
      root,
      '--natural-route-ledger',
      routeLedger,
      '--final-answer-audit',
      finalAnswer,
      '--outbound-audit',
      outbound
    ], {
      cwd: path.join(__dirname, '..'),
      encoding: 'utf8'
    });

    assert.equal(result.status, 1);
    assert.match(result.stdout, /Live route proof: not ready \(1\/4 minimum joined rows\)/);
    assert.match(result.stdout, /No-action route proof: not ready \(1\/4 minimum no-action rows\)/);
    assert.match(result.stdout, /Safe SparkRecursive_bot prompts:/);
    assert.match(result.stdout, /After Spark replies to all four, rerun: npm run control:proof:live-trace/);
  });
});
