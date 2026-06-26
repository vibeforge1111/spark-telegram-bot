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
    assert.match(formatControlProofTraceJoinReport(result), /No route evidence sampled/);
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
