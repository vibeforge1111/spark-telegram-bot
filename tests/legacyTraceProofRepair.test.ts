import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import {
  repairLegacyTraceProofGaps,
  type LegacyTraceProofRepairResult
} from '../src/legacyTraceProofRepair';

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
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'spark-legacy-proof-repair-'));
  try {
    fn(root);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
}

test('adds compact legacy proof capsules to Builder gateway ref-only gap rows', () => {
  withTempRoot((root) => {
    const auditPath = path.join(root, 'gateway-trace.jsonl');
    writeJsonl(auditPath, [
      {
        recorded_at: '2026-06-24T00:00:00.000Z',
        event: 'telegram_update_processed',
        routing_decision: 'plain_chat',
        request_id: 'request:sha256:abc123abc123abcd',
        trace_ref: '<path>',
        harnessProofRef: 'turn:sha256:1111111111111111',
        proofStatus: 'missing_harness_authority',
        proofStorage: 'legacy_gap_capsule',
        delivery_ok: true,
        telegram_user_ref: 'telegram_user:sha256:redacted'
      },
      {
        recorded_at: '2026-06-24T00:00:01.000Z',
        event: 'telegram_update_processed',
        harnessProofRef: 'turn:sha256:2222222222222222',
        proofCapsule: { schema: 'spark.harness_proof.v1' },
        proofStatus: 'missing_harness_authority',
        proofStorage: 'legacy_gap_capsule'
      },
      {
        recorded_at: '2026-06-24T00:00:02.000Z',
        event: 'telegram_update_processed',
        harnessProofRef: 'turn:sha256:3333333333333333'
      }
    ]);

    const result = repairLegacyTraceProofGaps({ plane: 'builder_gateway', auditPath, backup: false });
    const rows = readJsonl(auditPath);
    const repaired = rows[0] as any;

    assert.deepEqual(pickResult(result), {
      rowsRead: 3,
      rowsWritten: 3,
      parseErrors: 0,
      legacyGapCapsulesAdded: 1,
      alreadyHadCapsule: 1,
      notLegacyGap: 1,
      changedRows: 1
    });
    assert.equal(repaired.harnessProofRef, 'turn:sha256:1111111111111111');
    assert.equal(repaired.proofCapsule.turnRef, 'turn:sha256:1111111111111111');
    assert.equal(repaired.proofCapsule.schema, 'spark.harness_proof.v1');
    assert.equal(repaired.proofCapsule.owner, 'spark-intelligence-builder');
    assert.equal(repaired.proofCapsule.authority.contract, 'none');
    assert.equal(repaired.proofCapsule.authority.decision, 'downgraded');
    assert.equal(repaired.proofCapsule.governor.verified, false);
    assert.equal(repaired.proofCapsule.execution.tool, 'builder.gateway');
    assert.equal(repaired.proofCapsule.execution.mutationClass, 'read_only');
    assert.equal(repaired.proofCapsule.reply.delivered, true);
    assert.equal(repaired.proofCapsule.joins.builder, 'joined');
    assert.equal(repaired.proofCapsule.joins.telegram, 'joined');
    assert.doesNotMatch(JSON.stringify(repaired.proofCapsule), /\/Users\/|raw prompt|tool_not_allowed_by_policy/);
  });
});

test('adds compact legacy proof capsules to Spawner PRD ref-only gap rows', () => {
  withTempRoot((root) => {
    const auditPath = path.join(root, 'prd-auto-trace.jsonl');
    writeJsonl(auditPath, [
      {
        ts: '2026-06-24T00:00:00.000Z',
        event: 'brief_enriched',
        requestId: 'tg-build-redacted',
        traceRef: 'trace:spawner-prd:redacted',
        harnessProofRef: 'turn:sha256:aaaaaaaaaaaaaaaa',
        proofStatus: 'missing_harness_authority',
        proofStorage: 'legacy_gap_capsule'
      }
    ]);

    const result = repairLegacyTraceProofGaps({ plane: 'spawner_prd_trace', auditPath, backup: false });
    const [repaired] = readJsonl(auditPath) as any[];

    assert.equal(result.legacyGapCapsulesAdded, 1);
    assert.equal(repaired.harnessProofRef, 'turn:sha256:aaaaaaaaaaaaaaaa');
    assert.equal(repaired.proofCapsule.turnRef, 'turn:sha256:aaaaaaaaaaaaaaaa');
    assert.equal(repaired.proofCapsule.owner, 'spawner-ui');
    assert.equal(repaired.proofCapsule.route, 'spawner.prd_bridge');
    assert.equal(repaired.proofCapsule.authority.decision, 'downgraded');
    assert.equal(repaired.proofCapsule.execution.tool, 'spawner.prd_bridge.write');
    assert.equal(repaired.proofCapsule.execution.mutationClass, 'writes_files');
    assert.equal(repaired.proofCapsule.joins.spawner, 'joined');
    assert.equal(repaired.proofCapsule.joins.telegram, 'missing');
    assert.equal(repaired.privacy, 'metadata_only');
  });
});

test('legacy proof repair dry-run leaves trace file unchanged', () => {
  withTempRoot((root) => {
    const auditPath = path.join(root, 'gateway-trace.jsonl');
    writeJsonl(auditPath, [
      {
        recorded_at: '2026-06-24T00:00:00.000Z',
        harnessProofRef: 'turn:sha256:bbbbbbbbbbbbbbbb',
        proofStatus: 'missing_harness_authority',
        proofStorage: 'legacy_gap_capsule'
      }
    ]);
    const before = fs.readFileSync(auditPath, 'utf8');
    const result = repairLegacyTraceProofGaps({ plane: 'builder_gateway', auditPath, backup: false, dryRun: true });
    const after = fs.readFileSync(auditPath, 'utf8');

    assert.equal(result.legacyGapCapsulesAdded, 1);
    assert.equal(result.changedRows, 1);
    assert.equal(result.dryRun, true);
    assert.equal(after, before);
  });
});

function pickResult(result: LegacyTraceProofRepairResult): Record<string, unknown> {
  return {
    rowsRead: result.rowsRead,
    rowsWritten: result.rowsWritten,
    parseErrors: result.parseErrors,
    legacyGapCapsulesAdded: result.legacyGapCapsulesAdded,
    alreadyHadCapsule: result.alreadyHadCapsule,
    notLegacyGap: result.notLegacyGap,
    changedRows: result.changedRows
  };
}
