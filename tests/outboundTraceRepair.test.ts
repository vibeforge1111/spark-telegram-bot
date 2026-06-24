import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { buildHarnessProofCapsule } from '../src/harnessProofCapsule';
import {
  repairOutboundTraceAudit,
  type OutboundTraceRepairResult
} from '../src/outboundTraceRepair';

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

function readJsonl(filePath: string): Array<Record<string, unknown>> {
  return fs.readFileSync(filePath, 'utf8').trim().split(/\r?\n/).filter(Boolean).map((line) => JSON.parse(line));
}

function withTempRoot(fn: (root: string) => void): void {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'spark-outbound-trace-repair-'));
  try {
    fn(root);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
}

function fixtureProofCapsule(turnRef: string) {
  return buildHarnessProofCapsule({
    turnRef,
    route: 'plain_chat',
    owner: 'spark-telegram-bot',
    intent: {
      kind: 'plain_chat',
      confidence: 'explicit',
      noExecution: true
    },
    authority: {
      decision: 'downgraded',
      contract: 'spark.turn_intent.v1',
      riskTier: 'read',
      reasonSummary: 'Telegram delivered a no-execution reply.'
    },
    governor: {
      decision: 'read_only',
      verified: true
    },
    execution: {
      status: 'completed',
      tool: 'answer.compose',
      mutationClass: 'read_only'
    },
    reply: {
      delivered: true,
      shape: 'natural',
      rawReasonsHidden: true
    },
    joins: {
      telegram: 'joined',
      builder: 'not_applicable',
      spawner: 'not_applicable',
      provider: 'not_applicable',
      memory: 'not_applicable',
      voice: 'not_applicable'
    }
  });
}

test('repairs outbound rows by joining final-answer proof without fabricating delivery-local proof', () => {
  withTempRoot((root) => {
    const outboundPath = path.join(root, 'node-outbound-audit.jsonl');
    const finalAnswerPath = path.join(root, 'final-answer-gate-audit.jsonl');
    const capsule = fixtureProofCapsule('turn:sha256:abcdef1234567890');
    writeJsonl(finalAnswerPath, [
      {
        event: 'telegram_final_answer',
        request_id: 'turn-final-1',
        trace_ref: 'trace-final-1',
        harness_proof_ref: capsule.turnRef,
        proof_capsule: capsule
      }
    ]);
    writeJsonl(outboundPath, [
      {
        ts: '2026-06-24T00:00:00.000Z',
        event: 'telegram_node_delivered',
        privacy: 'metadata_only',
        chat_ref: 'chat:sha256:aaa',
        text_length: 42,
        trace_context_present: false
      },
      {
        ts: '2026-06-24T00:00:01.000Z',
        event: 'telegram_node_delivered',
        privacy: 'metadata_only',
        chat_ref: 'chat:sha256:bbb',
        text_length: 50,
        request_id: 'turn-final-1',
        trace_ref: 'trace-final-1',
        trace_context_present: true
      },
      {
        ts: '2026-06-24T00:00:02.000Z',
        event: 'telegram_node_delivered',
        privacy: 'metadata_only',
        chat_ref: 'chat:sha256:ccc',
        text_length: 60,
        request_id: 'turn-unmatched',
        trace_ref: 'trace-unmatched',
        trace_context_present: true
      }
    ]);

    const result = repairOutboundTraceAudit({
      outboundPath,
      finalAnswerPath,
      backup: false
    });
    const rows = readJsonl(outboundPath);

    assert.deepEqual(
      pickResult(result),
      {
        rowsRead: 3,
        rowsWritten: 3,
        parseErrors: 0,
        deliveryLocalMarked: 1,
        proofJoined: 1,
        proofGapMarked: 1,
        changedRows: 3
      }
    );
    assert.match(String(rows[0].request_ref), /^request:sha256:[a-f0-9]{16}$/);
    assert.match(String(rows[0].trace_ref), /^trace:sha256:[a-f0-9]{16}$/);
    assert.equal(rows[0].proof_status, 'not_execution_proof');
    assert.equal(rows[0].proof_storage, 'not_applicable');
    assert.equal(rows[0].trace_context_scope, 'delivery_local');
    assert.equal(rows[1].harness_proof_ref, capsule.turnRef);
    assert.deepEqual(rows[1].proof_capsule, capsule);
    assert.equal(rows[1].proof_join_source, 'telegram_final_answer');
    assert.equal(rows[2].proof_status, 'missing_harness_proof');
    assert.equal(rows[2].proof_storage, 'missing');
    assert.equal(Object.prototype.hasOwnProperty.call(rows[2], 'proof_capsule'), false);
    assert.doesNotMatch(JSON.stringify(rows), /raw message body|8319079055/);
  });
});

test('dry-run reports repairs without rewriting outbound audit', () => {
  withTempRoot((root) => {
    const outboundPath = path.join(root, 'node-outbound-audit.jsonl');
    const finalAnswerPath = path.join(root, 'final-answer-gate-audit.jsonl');
    writeJsonl(finalAnswerPath, []);
    writeJsonl(outboundPath, [
      {
        ts: '2026-06-24T00:00:00.000Z',
        event: 'telegram_node_delivered',
        privacy: 'metadata_only',
        chat_ref: 'chat:sha256:aaa',
        text_length: 42,
        trace_context_present: false
      }
    ]);
    const before = fs.readFileSync(outboundPath, 'utf8');
    const result = repairOutboundTraceAudit({
      outboundPath,
      finalAnswerPath,
      backup: false,
      dryRun: true
    });
    const after = fs.readFileSync(outboundPath, 'utf8');

    assert.equal(result.changedRows, 1);
    assert.equal(result.dryRun, true);
    assert.equal(after, before);
  });
});

function pickResult(result: OutboundTraceRepairResult): Record<string, unknown> {
  return {
    rowsRead: result.rowsRead,
    rowsWritten: result.rowsWritten,
    parseErrors: result.parseErrors,
    deliveryLocalMarked: result.deliveryLocalMarked,
    proofJoined: result.proofJoined,
    proofGapMarked: result.proofGapMarked,
    changedRows: result.changedRows
  };
}
