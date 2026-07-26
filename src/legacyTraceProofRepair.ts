import { createHash } from 'node:crypto';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { buildHarnessProofCapsule, type HarnessProofCapsuleV1 } from './harnessProofCapsule';

export type LegacyTraceProofPlane = 'builder_gateway' | 'spawner_prd_trace';

export interface LegacyTraceProofRepairOptions {
  plane: LegacyTraceProofPlane;
  auditPath?: string;
  sparkHome?: string;
  dryRun?: boolean;
  backup?: boolean;
}

export interface LegacyTraceProofRepairResult {
  plane: LegacyTraceProofPlane;
  auditPath: string;
  backupPath: string | null;
  dryRun: boolean;
  rowsRead: number;
  rowsWritten: number;
  parseErrors: number;
  legacyGapCapsulesAdded: number;
  alreadyHadCapsule: number;
  notLegacyGap: number;
  changedRows: number;
}

interface ParsedLine {
  line: string;
  record: Record<string, unknown> | null;
}

function defaultSparkHome(): string {
  return process.env.SPARK_HOME?.trim() || path.join(os.homedir(), '.spark');
}

export function defaultLegacyTraceProofPath(plane: LegacyTraceProofPlane, sparkHome = defaultSparkHome()): string {
  if (plane === 'builder_gateway') {
    return path.join(sparkHome, 'state', 'spark-intelligence', 'logs', 'gateway-trace.jsonl');
  }
  return path.join(sparkHome, 'state', 'spawner-ui', 'prd-auto-trace.jsonl');
}

export function repairLegacyTraceProofGaps(
  options: LegacyTraceProofRepairOptions
): LegacyTraceProofRepairResult {
  const sparkHome = path.resolve(options.sparkHome || defaultSparkHome());
  const auditPath = path.resolve(options.auditPath || defaultLegacyTraceProofPath(options.plane, sparkHome));
  const dryRun = Boolean(options.dryRun);
  const backup = options.backup !== false;
  const lines = fs.existsSync(auditPath) ? fs.readFileSync(auditPath, 'utf8').split(/\r?\n/) : [];
  const parsedLines = lines.filter((line) => line.trim()).map(parseLine);

  let parseErrors = 0;
  let legacyGapCapsulesAdded = 0;
  let alreadyHadCapsule = 0;
  let notLegacyGap = 0;
  let changedRows = 0;
  const repairedLines = parsedLines.map((entry) => {
    if (!entry.record) {
      parseErrors += 1;
      return entry.line;
    }
    const before = stableJson(entry.record);
    const outcome = repairLegacyTraceProofRecord(options.plane, entry.record);
    if (outcome.legacyGapCapsuleAdded) legacyGapCapsulesAdded += 1;
    if (outcome.alreadyHadCapsule) alreadyHadCapsule += 1;
    if (outcome.notLegacyGap) notLegacyGap += 1;
    if (stableJson(outcome.record) !== before) changedRows += 1;
    return JSON.stringify(outcome.record);
  });

  let backupPath: string | null = null;
  if (!dryRun) {
    fs.mkdirSync(path.dirname(auditPath), { recursive: true });
    if (backup && fs.existsSync(auditPath)) {
      backupPath = nextBackupPath(auditPath);
      fs.copyFileSync(auditPath, backupPath);
    }
    fs.writeFileSync(auditPath, repairedLines.length ? `${repairedLines.join('\n')}\n` : '', 'utf8');
  }

  return {
    plane: options.plane,
    auditPath,
    backupPath,
    dryRun,
    rowsRead: parsedLines.length,
    rowsWritten: repairedLines.length,
    parseErrors,
    legacyGapCapsulesAdded,
    alreadyHadCapsule,
    notLegacyGap,
    changedRows
  };
}

function repairLegacyTraceProofRecord(
  plane: LegacyTraceProofPlane,
  record: Record<string, unknown>
): {
  record: Record<string, unknown>;
  legacyGapCapsuleAdded: boolean;
  alreadyHadCapsule: boolean;
  notLegacyGap: boolean;
} {
  const repaired = { ...record };
  if (!isLegacyGapRecord(repaired)) {
    return { record: repaired, legacyGapCapsuleAdded: false, alreadyHadCapsule: false, notLegacyGap: true };
  }
  if (proofCapsuleLike(repaired.proof_capsule) || proofCapsuleLike(repaired.proofCapsule)) {
    return { record: repaired, legacyGapCapsuleAdded: false, alreadyHadCapsule: true, notLegacyGap: false };
  }
  const proofRef = stringField(repaired, 'harness_proof_ref') || stringField(repaired, 'harnessProofRef');
  const proofCapsule = buildLegacyGapCapsule(plane, repaired, proofRef);
  if (hasKey(repaired, 'harness_proof_ref')) repaired.harness_proof_ref = proofCapsule.turnRef;
  else repaired.harnessProofRef = proofCapsule.turnRef;
  if (plane === 'builder_gateway') repaired.proofCapsule = proofCapsule;
  else repaired.proofCapsule = proofCapsule;
  if (!stringField(repaired, 'proofStatus') && !stringField(repaired, 'proof_status')) repaired.proofStatus = 'missing_harness_authority';
  if (!stringField(repaired, 'proofStorage') && !stringField(repaired, 'proof_storage')) repaired.proofStorage = 'legacy_gap_capsule';
  if (!stringField(repaired, 'proofJoinSource') && !stringField(repaired, 'proof_join_source')) {
    repaired.proofJoinSource = plane === 'builder_gateway'
      ? 'builder_gateway_trace_legacy_repair'
      : 'spawner_prd_trace_legacy_repair';
  }
  if (!stringField(repaired, 'privacy')) repaired.privacy = 'metadata_only';
  return { record: repaired, legacyGapCapsuleAdded: true, alreadyHadCapsule: false, notLegacyGap: false };
}

function buildLegacyGapCapsule(
  plane: LegacyTraceProofPlane,
  record: Record<string, unknown>,
  proofRef: string
): HarnessProofCapsuleV1 {
  const seed = proofRef || [
    stringField(record, 'trace_ref') || stringField(record, 'traceRef'),
    stringField(record, 'request_id') || stringField(record, 'requestId') || stringField(record, 'request_ref') || stringField(record, 'requestRef'),
    stringField(record, 'recorded_at') || stringField(record, 'ts'),
    plane
  ].filter(Boolean).join(':') || stableJson(record);
  const capsule = plane === 'builder_gateway'
    ? buildHarnessProofCapsule({
        turnRef: seed,
        route: stringField(record, 'routing_decision') || 'builder.gateway',
        owner: 'spark-intelligence-builder',
        intent: {
          kind: stringField(record, 'routing_decision') || 'builder.gateway',
          confidence: 'medium',
          noExecution: true
        },
        authority: {
          decision: 'downgraded',
          contract: 'none',
          riskTier: 'read',
          reasonSummary: 'Builder gateway trace row has request and trace continuity, but no fresh Harness proof metadata. Treat this as an inspectable proof gap, not authorization.'
        },
        governor: {
          decision: 'not_applicable',
          verified: false
        },
        execution: {
          status: 'completed',
          tool: 'builder.gateway',
          mutationClass: 'read_only'
        },
        reply: {
          delivered: Boolean(record.delivery_ok),
          shape: record.delivery_ok ? 'natural' : 'none',
          rawReasonsHidden: true
        },
        joins: {
          telegram: 'joined',
          builder: 'joined',
          spawner: 'not_applicable',
          provider: 'not_applicable',
          memory: 'not_applicable',
          voice: 'not_applicable'
        }
      })
    : buildHarnessProofCapsule({
        turnRef: seed,
        route: 'spawner.prd_bridge',
        owner: 'spawner-ui',
        intent: {
          kind: 'spawner.prd_bridge',
          confidence: 'medium',
          noExecution: false
        },
        authority: {
          decision: 'downgraded',
          contract: 'none',
          riskTier: 'execute',
          reasonSummary: 'Spawner PRD trace row has request and trace continuity, but no fresh Harness proof metadata. Treat this as an inspectable proof gap, not authorization.'
        },
        governor: {
          decision: 'not_applicable',
          verified: false
        },
        execution: {
          status: 'completed',
          tool: 'spawner.prd_bridge.write',
          mutationClass: 'writes_files'
        },
        reply: {
          delivered: false,
          shape: 'none',
          rawReasonsHidden: true
        },
        joins: {
          telegram: 'missing',
          builder: 'not_applicable',
          spawner: 'joined',
          provider: 'not_applicable',
          memory: 'not_applicable',
          voice: 'not_applicable'
        }
      });
  return proofRef && /^turn:sha256:[a-f0-9]{16}$/i.test(proofRef)
    ? { ...capsule, turnRef: proofRef.toLowerCase() }
    : capsule;
}

function isLegacyGapRecord(record: Record<string, unknown>): boolean {
  return ['proof_status', 'proofStatus', 'proof_storage', 'proofStorage'].some((key) => {
    const normalized = stringField(record, key).toLowerCase();
    return normalized === 'missing_harness_authority' || normalized === 'missing_harness_proof' || normalized === 'legacy_gap_capsule';
  });
}

function hasKey(record: Record<string, unknown>, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(record, key);
}

function proofCapsuleLike(value: unknown): boolean {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value) && (value as Record<string, unknown>).schema === 'spark.harness_proof.v1');
}

function parseLine(line: string): ParsedLine {
  try {
    const parsed = JSON.parse(line);
    return {
      line,
      record: parsed && typeof parsed === 'object' && !Array.isArray(parsed)
        ? parsed as Record<string, unknown>
        : null
    };
  } catch {
    return { line, record: null };
  }
}

function stringField(record: Record<string, unknown>, key: string): string {
  const value = record[key];
  return typeof value === 'string' ? value.trim() : '';
}

function stableJson(value: unknown): string {
  return JSON.stringify(sortKeys(value));
}

function sortKeys(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortKeys);
  if (!value || typeof value !== 'object') return value;
  return Object.keys(value as Record<string, unknown>).sort().reduce<Record<string, unknown>>((record, key) => {
    record[key] = sortKeys((value as Record<string, unknown>)[key]);
    return record;
  }, {});
}

function nextBackupPath(filePath: string): string {
  const base = `${filePath}.proof-backup`;
  if (!fs.existsSync(base)) return base;
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const digest = createHash('sha256').update(`${filePath}:${stamp}`).digest('hex').slice(0, 8);
  return `${base}-${stamp}-${digest}`;
}
