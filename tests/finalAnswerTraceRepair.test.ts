import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { repairFinalAnswerTraceAudit } from '../src/finalAnswerTraceRepair';

function tempDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'spark-final-answer-repair-'));
}

function writeJsonl(filePath: string, records: Record<string, unknown>[]): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${records.map((record) => JSON.stringify(record)).join('\n')}\n`, 'utf8');
}

async function test(name: string, fn: () => Promise<void> | void): Promise<void> {
  try {
    await fn();
    console.log(`ok - ${name}`);
  } catch (error) {
    console.error(`not ok - ${name}`);
    throw error;
  }
}

test('repairs final-answer command replies with delivery proof from existing trace context', () => {
  const root = tempDir();
  const finalAnswerPath = path.join(root, 'final-answer-gate-audit.jsonl');
  writeJsonl(finalAnswerPath, [
    {
      ts: '2026-06-26T00:00:00.000Z',
      event: 'telegram_command_reply',
      outcome: 'command_reply_delivered',
      command: 'run',
      reply_kind: 'build_ack',
      request_id: 'req-build',
      trace_ref: 'trace-build'
    }
  ]);

  const result = repairFinalAnswerTraceAudit({ finalAnswerPath, dryRun: false, backup: false });
  const rows = fs.readFileSync(finalAnswerPath, 'utf8').trim().split('\n').map((line) => JSON.parse(line));

  assert.equal(result.deliveryProofBackfilled, 1);
  assert.equal(result.suppressedNonExecutionMarked, 0);
  assert.equal(rows[0].request_id, 'req-build');
  assert.equal(rows[0].trace_ref, 'trace-build');
  assert.equal(rows[0].harness_proof_ref, rows[0].proof_capsule.turnRef);
  assert.equal(rows[0].proof_capsule.schema, 'spark.harness_proof.v1');
  assert.equal(rows[0].proof_capsule.route, 'spawner.build');
  assert.equal(rows[0].proof_capsule.reply.delivered, true);
  assert.equal(rows[0].proof_join_source, 'final_answer_delivery_repair');
});

test('marks contextless suppressed Builder rows as non-execution proof with synthetic joins', () => {
  const root = tempDir();
  const finalAnswerPath = path.join(root, 'final-answer-gate-audit.jsonl');
  writeJsonl(finalAnswerPath, [
    {
      ts: '2026-06-26T00:00:00.000Z',
      event: 'final_answer_checked',
      outcome: 'suppressed_builder_reply',
      chat_ref: 'chat_safe',
      user_ref: 'user_safe',
      suppression_reason: 'route_menu',
      builder_routing_decision: 'disambiguation_shortcircuit',
      builder_bridge_mode: 'disambiguation_shortcircuit',
      builder_reply_length: 100
    }
  ]);

  const result = repairFinalAnswerTraceAudit({ finalAnswerPath, dryRun: false, backup: false });
  const rows = fs.readFileSync(finalAnswerPath, 'utf8').trim().split('\n').map((line) => JSON.parse(line));

  assert.equal(result.deliveryProofBackfilled, 0);
  assert.equal(result.suppressedNonExecutionMarked, 1);
  assert.match(rows[0].request_ref, /^request:sha256:[a-f0-9]{16}$/);
  assert.match(rows[0].trace_ref, /^trace:sha256:[a-f0-9]{16}$/);
  assert.equal(rows[0].proof_status, 'not_execution_proof');
  assert.equal(rows[0].proof_storage, 'not_applicable');
  assert.equal(rows[0].proof_join_source, 'final_answer_suppression_repair');
});
