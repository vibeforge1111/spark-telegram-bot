import { createHash } from 'node:crypto';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { buildHarnessProofCapsule, type HarnessProofCapsuleV1 } from './harnessProofCapsule';

export interface RouteConfidenceTraceRepairOptions {
  auditPath?: string;
  sparkHome?: string;
  dryRun?: boolean;
  backup?: boolean;
}

export interface RouteConfidenceTraceRepairResult {
  auditPath: string;
  backupPath: string | null;
  dryRun: boolean;
  rowsRead: number;
  rowsWritten: number;
  parseErrors: number;
  legacyGapCapsulesAdded: number;
  alreadyHadProof: number;
  changedRows: number;
}

interface ParsedLine {
  line: string;
  record: Record<string, unknown> | null;
}

function defaultSparkHome(): string {
  return process.env.SPARK_HOME?.trim() || path.join(os.homedir(), '.spark');
}

export function defaultRouteConfidenceAuditPath(sparkHome = defaultSparkHome()): string {
  return path.join(sparkHome, 'state', 'spark-telegram-bot', 'route-confidence-audit.jsonl');
}

export function repairRouteConfidenceTraceAudit(
  options: RouteConfidenceTraceRepairOptions = {}
): RouteConfidenceTraceRepairResult {
  const sparkHome = path.resolve(options.sparkHome || defaultSparkHome());
  const auditPath = path.resolve(options.auditPath || defaultRouteConfidenceAuditPath(sparkHome));
  const dryRun = Boolean(options.dryRun);
  const backup = options.backup !== false;
  const lines = fs.existsSync(auditPath) ? fs.readFileSync(auditPath, 'utf8').split(/\r?\n/) : [];
  const parsedLines = lines.filter((line) => line.trim()).map(parseLine);

  let parseErrors = 0;
  let legacyGapCapsulesAdded = 0;
  let alreadyHadProof = 0;
  let changedRows = 0;
  const repairedLines = parsedLines.map((entry) => {
    if (!entry.record) {
      parseErrors += 1;
      return entry.line;
    }
    const before = stableJson(entry.record);
    const outcome = repairRouteConfidenceRecord(entry.record);
    if (outcome.alreadyHadProof) alreadyHadProof += 1;
    if (outcome.legacyGapCapsuleAdded) legacyGapCapsulesAdded += 1;
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
    auditPath,
    backupPath,
    dryRun,
    rowsRead: parsedLines.length,
    rowsWritten: repairedLines.length,
    parseErrors,
    legacyGapCapsulesAdded,
    alreadyHadProof,
    changedRows
  };
}

function repairRouteConfidenceRecord(record: Record<string, unknown>): {
  record: Record<string, unknown>;
  legacyGapCapsuleAdded: boolean;
  alreadyHadProof: boolean;
} {
  const repaired = { ...record };
  if (hasProof(repaired)) {
    return { record: repaired, legacyGapCapsuleAdded: false, alreadyHadProof: true };
  }
  const proofCapsule = buildLegacyRouteConfidenceGapCapsule(repaired);
  repaired.harness_proof_ref = proofCapsule.turnRef;
  repaired.proof_capsule = proofCapsule;
  repaired.proof_status = 'missing_harness_authority';
  repaired.proof_storage = 'legacy_gap_capsule';
  repaired.proof_join_source = 'route_confidence_legacy_repair';
  if (!stringField(repaired, 'privacy')) repaired.privacy = 'metadata_only';
  return { record: repaired, legacyGapCapsuleAdded: true, alreadyHadProof: false };
}

function buildLegacyRouteConfidenceGapCapsule(record: Record<string, unknown>): HarnessProofCapsuleV1 {
  const route = stringField(record, 'route') || 'spawner.build';
  const outcome = stringField(record, 'outcome') || 'unknown';
  const decision = stringField(record, 'decision') || 'unknown';
  const policy = stringField(record, 'safe_reply_policy');
  const turnSeed = [
    stringField(record, 'trace_ref') || stringField(record, 'traceRef'),
    stringField(record, 'request_ref') || stringField(record, 'requestRef'),
    stringField(record, 'recorded_at'),
    route,
    decision,
    outcome
  ].filter(Boolean).join(':') || stableJson(record);
  return buildHarnessProofCapsule({
    turnRef: turnSeed,
    route,
    owner: 'spark-intelligence-builder',
    intent: {
      kind: route,
      confidence: decision === 'act' ? 'high' : decision === 'refuse' ? 'blocked' : 'medium',
      noExecution: outcome !== 'acted'
    },
    authority: {
      decision: 'downgraded',
      contract: 'none',
      riskTier: route === 'spawner.build' ? 'execute' : 'read',
      reasonSummary: [
        'Historical route-confidence audit row predates Harness proof.',
        'The recorded gate outcome is inspectable, but fresh Harness authority cannot be reconstructed from this row.',
        policy ? `Policy note: ${policy}` : ''
      ].filter(Boolean).join(' ')
    },
    governor: {
      decision: 'not_applicable',
      verified: false
    },
    execution: {
      status: outcome === 'failed_closed' ? 'failed' : outcome === 'blocked' ? 'blocked' : 'completed',
      tool: 'builder.route_confidence_gate',
      mutationClass: 'read_only'
    },
    reply: {
      delivered: false,
      shape: 'none',
      rawReasonsHidden: true
    },
    joins: {
      telegram: 'joined',
      builder: 'missing',
      spawner: outcome === 'acted' ? 'missing' : 'not_applicable',
      provider: 'not_applicable',
      memory: 'not_applicable',
      voice: 'not_applicable'
    }
  });
}

function hasProof(record: Record<string, unknown>): boolean {
  return Boolean(
    stringField(record, 'harness_proof_ref') ||
    stringField(record, 'harnessProofRef') ||
    proofCapsuleLike(record.proof_capsule) ||
    proofCapsuleLike(record.proofCapsule)
  );
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
  const base = `${filePath}.raw-backup`;
  if (!fs.existsSync(base)) return base;
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const digest = createHash('sha256').update(`${filePath}:${stamp}`).digest('hex').slice(0, 8);
  return `${base}-${stamp}-${digest}`;
}
