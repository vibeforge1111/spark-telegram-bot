import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import {
  repairRouteConfidenceTraceAudit,
  type RouteConfidenceTraceRepairResult
} from '../src/routeConfidenceTraceRepair';

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
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'spark-route-confidence-repair-'));
  try {
    fn(root);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
}

test('adds legacy gap proof capsules to historical route-confidence action rows', () => {
  withTempRoot((root) => {
    const auditPath = path.join(root, 'route-confidence-audit.jsonl');
    writeJsonl(auditPath, [
      {
        schema_version: 'spark.telegram_route_confidence_audit.v1',
        recorded_at: '2026-06-24T00:00:00.000Z',
        route: 'spawner.build',
        decision: 'act',
        outcome: 'acted',
        request_ref: 'request:sha256:abcdef1234567890',
        trace_ref: 'trace:sha256:1234567890abcdef',
        safe_reply_policy: null,
        privacy: 'metadata_only'
      },
      {
        schema_version: 'spark.telegram_route_confidence_audit.v1',
        recorded_at: '2026-06-24T00:00:01.000Z',
        route: 'spawner.build',
        decision: 'refuse',
        outcome: 'blocked',
        request_ref: 'request:sha256:2222222222222222',
        trace_ref: 'trace:sha256:3333333333333333',
        harness_proof_ref: 'turn:sha256:4444444444444444',
        proof_capsule: { schema: 'spark.harness_proof.v1' },
        privacy: 'metadata_only'
      }
    ]);

    const result = repairRouteConfidenceTraceAudit({ auditPath, backup: false });
    const rows = readJsonl(auditPath);
    const first = rows[0] as any;
    const second = rows[1] as any;

    assert.deepEqual(pickResult(result), {
      rowsRead: 2,
      rowsWritten: 2,
      parseErrors: 0,
      legacyGapCapsulesAdded: 1,
      alreadyHadProof: 1,
      changedRows: 1
    });
    assert.equal(first.harness_proof_ref, first.proof_capsule.turnRef);
    assert.equal(first.proof_status, 'missing_harness_authority');
    assert.equal(first.proof_storage, 'legacy_gap_capsule');
    assert.equal(first.proof_capsule.schema, 'spark.harness_proof.v1');
    assert.equal(first.proof_capsule.authority.contract, 'none');
    assert.equal(first.proof_capsule.authority.decision, 'downgraded');
    assert.equal(first.proof_capsule.governor.verified, false);
    assert.equal(first.proof_capsule.execution.tool, 'builder.route_confidence_gate');
    assert.equal(first.proof_capsule.reply.delivered, false);
    assert.equal(first.proof_capsule.joins.telegram, 'joined');
    assert.equal(first.proof_capsule.joins.builder, 'missing');
    assert.equal(second.harness_proof_ref, 'turn:sha256:4444444444444444');
    assert.doesNotMatch(JSON.stringify(rows), /8319079055|raw prompt|\/Users\//);
  });
});

test('route-confidence repair dry-run leaves audit file unchanged', () => {
  withTempRoot((root) => {
    const auditPath = path.join(root, 'route-confidence-audit.jsonl');
    writeJsonl(auditPath, [
      {
        schema_version: 'spark.telegram_route_confidence_audit.v1',
        recorded_at: '2026-06-24T00:00:00.000Z',
        route: 'spawner.build',
        decision: 'act',
        outcome: 'acted',
        request_ref: 'request:sha256:abcdef1234567890',
        trace_ref: 'trace:sha256:1234567890abcdef',
        privacy: 'metadata_only'
      }
    ]);
    const before = fs.readFileSync(auditPath, 'utf8');
    const result = repairRouteConfidenceTraceAudit({ auditPath, backup: false, dryRun: true });
    const after = fs.readFileSync(auditPath, 'utf8');

    assert.equal(result.legacyGapCapsulesAdded, 1);
    assert.equal(result.changedRows, 1);
    assert.equal(result.dryRun, true);
    assert.equal(after, before);
  });
});

function pickResult(result: RouteConfidenceTraceRepairResult): Record<string, unknown> {
  return {
    rowsRead: result.rowsRead,
    rowsWritten: result.rowsWritten,
    parseErrors: result.parseErrors,
    legacyGapCapsulesAdded: result.legacyGapCapsulesAdded,
    alreadyHadProof: result.alreadyHadProof,
    changedRows: result.changedRows
  };
}
