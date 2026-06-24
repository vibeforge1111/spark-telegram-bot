import { createHash } from 'node:crypto';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { redactedProofRef, type HarnessProofCapsuleV1 } from './harnessProofCapsule';

export interface OutboundTraceRepairOptions {
  outboundPath?: string;
  finalAnswerPath?: string;
  sparkHome?: string;
  dryRun?: boolean;
  backup?: boolean;
}

export interface OutboundTraceRepairResult {
  outboundPath: string;
  finalAnswerPath: string;
  backupPath: string | null;
  dryRun: boolean;
  rowsRead: number;
  rowsWritten: number;
  parseErrors: number;
  finalAnswerRowsRead: number;
  finalAnswerParseErrors: number;
  deliveryLocalMarked: number;
  proofJoined: number;
  proofGapMarked: number;
  changedRows: number;
}

interface ParsedLine {
  line: string;
  record: Record<string, unknown> | null;
}

interface ProofJoinRecord {
  requestId?: string;
  traceRef?: string;
  proofRef?: string;
  proofCapsule?: HarnessProofCapsuleV1;
}

interface ProofIndex {
  byRequestId: Map<string, ProofJoinRecord>;
  byTraceRef: Map<string, ProofJoinRecord>;
  rowsRead: number;
  parseErrors: number;
}

function defaultSparkHome(): string {
  return process.env.SPARK_HOME?.trim() || path.join(os.homedir(), '.spark');
}

export function defaultOutboundTraceAuditPath(sparkHome = defaultSparkHome()): string {
  return path.join(sparkHome, 'state', 'spark-telegram-bot', 'node-outbound-audit.jsonl');
}

export function defaultFinalAnswerAuditPath(sparkHome = defaultSparkHome()): string {
  return path.join(sparkHome, 'state', 'spark-telegram-bot', 'final-answer-gate-audit.jsonl');
}

export function repairOutboundTraceAudit(options: OutboundTraceRepairOptions = {}): OutboundTraceRepairResult {
  const sparkHome = path.resolve(options.sparkHome || defaultSparkHome());
  const outboundPath = path.resolve(options.outboundPath || defaultOutboundTraceAuditPath(sparkHome));
  const finalAnswerPath = path.resolve(options.finalAnswerPath || defaultFinalAnswerAuditPath(sparkHome));
  const dryRun = Boolean(options.dryRun);
  const backup = options.backup !== false;
  const proofIndex = readProofIndex(finalAnswerPath);
  const outboundLines = fs.existsSync(outboundPath)
    ? fs.readFileSync(outboundPath, 'utf8').split(/\r?\n/)
    : [];
  const parsedLines = outboundLines.filter((line) => line.trim()).map(parseLine);

  let deliveryLocalMarked = 0;
  let proofJoined = 0;
  let proofGapMarked = 0;
  let changedRows = 0;
  let parseErrors = 0;
  const repairedLines = parsedLines.map((entry) => {
    if (!entry.record) {
      parseErrors += 1;
      return entry.line;
    }
    const before = stableJson(entry.record);
    const outcome = repairOutboundRecord(entry.record, proofIndex);
    if (outcome.deliveryLocalMarked) deliveryLocalMarked += 1;
    if (outcome.proofJoined) proofJoined += 1;
    if (outcome.proofGapMarked) proofGapMarked += 1;
    if (stableJson(outcome.record) !== before) changedRows += 1;
    return JSON.stringify(outcome.record);
  });

  let backupPath: string | null = null;
  if (!dryRun) {
    fs.mkdirSync(path.dirname(outboundPath), { recursive: true });
    if (backup && fs.existsSync(outboundPath)) {
      backupPath = nextBackupPath(outboundPath);
      fs.copyFileSync(outboundPath, backupPath);
    }
    fs.writeFileSync(outboundPath, repairedLines.length ? `${repairedLines.join('\n')}\n` : '', 'utf8');
  }

  return {
    outboundPath,
    finalAnswerPath,
    backupPath,
    dryRun,
    rowsRead: parsedLines.length,
    rowsWritten: repairedLines.length,
    parseErrors,
    finalAnswerRowsRead: proofIndex.rowsRead,
    finalAnswerParseErrors: proofIndex.parseErrors,
    deliveryLocalMarked,
    proofJoined,
    proofGapMarked,
    changedRows
  };
}

function repairOutboundRecord(
  record: Record<string, unknown>,
  proofIndex: ProofIndex
): {
  record: Record<string, unknown>;
  deliveryLocalMarked: boolean;
  proofJoined: boolean;
  proofGapMarked: boolean;
} {
  const repaired = { ...record };
  const requestId = stringField(repaired, 'request_id') || stringField(repaired, 'requestId');
  const traceRef = stringField(repaired, 'trace_ref') || stringField(repaired, 'traceRef') || stringField(repaired, 'trace_id') || stringField(repaired, 'traceId');
  const proof = hasProof(repaired) ? null : findProofJoin(proofIndex, requestId, traceRef);
  let proofJoined = false;
  let proofGapMarked = false;
  let deliveryLocalMarked = false;

  if (proof && !hasProof(repaired)) {
    if (!requestId && proof.requestId) repaired.request_id = proof.requestId;
    if (!traceRef && proof.traceRef) repaired.trace_ref = proof.traceRef;
    if (proof.proofRef) repaired.harness_proof_ref = proof.proofRef;
    if (proof.proofCapsule) repaired.proof_capsule = proof.proofCapsule;
    repaired.proof_join_source = 'telegram_final_answer';
    delete repaired.proof_status;
    delete repaired.proofStatus;
    delete repaired.proof_storage;
    delete repaired.proofStorage;
    proofJoined = true;
  }

  const repairedRequestId = stringField(repaired, 'request_id') || stringField(repaired, 'requestId');
  const repairedTraceRef = stringField(repaired, 'trace_ref') || stringField(repaired, 'traceRef') || stringField(repaired, 'trace_id') || stringField(repaired, 'traceId');
  const requestRef = stringField(repaired, 'request_ref') || stringField(repaired, 'requestRef');
  const hasRealContext = Boolean(repairedRequestId || repairedTraceRef);
  const hasAnyRequest = Boolean(repairedRequestId || requestRef);
  const hasAnyTrace = Boolean(repairedTraceRef);

  if (!hasAnyRequest) {
    repaired.request_ref = redactedProofRef('request', repairSeed(repaired));
  }
  if (!hasAnyTrace) {
    repaired.trace_ref = redactedProofRef('trace', repairSeed(repaired));
  }

  if (!hasProof(repaired) && !isProofMarked(repaired)) {
    if (hasRealContext) {
      repaired.proof_status = 'missing_harness_proof';
      repaired.proof_storage = 'missing';
      proofGapMarked = true;
    } else {
      repaired.proof_status = 'not_execution_proof';
      repaired.proof_storage = 'not_applicable';
      deliveryLocalMarked = true;
    }
  }

  if (!stringField(repaired, 'trace_context_scope')) {
    const finalRequestId = stringField(repaired, 'request_id') || stringField(repaired, 'requestId');
    const finalTraceRef = stringField(repaired, 'trace_ref') || stringField(repaired, 'traceRef') || stringField(repaired, 'trace_id') || stringField(repaired, 'traceId');
    repaired.trace_context_scope = finalRequestId && finalTraceRef
      ? 'turn_or_action'
      : hasRealContext
        ? 'partial_turn_delivery_local'
        : 'delivery_local';
  }
  if (typeof repaired.trace_context_present !== 'boolean') {
    repaired.trace_context_present = hasRealContext;
  }
  if (!stringField(repaired, 'privacy')) {
    repaired.privacy = 'metadata_only';
  }

  return {
    record: repaired,
    deliveryLocalMarked,
    proofJoined,
    proofGapMarked
  };
}

function readProofIndex(finalAnswerPath: string): ProofIndex {
  const byRequestId = new Map<string, ProofJoinRecord>();
  const byTraceRef = new Map<string, ProofJoinRecord>();
  let rowsRead = 0;
  let parseErrors = 0;
  if (!fs.existsSync(finalAnswerPath)) {
    return { byRequestId, byTraceRef, rowsRead, parseErrors };
  }
  const lines = fs.readFileSync(finalAnswerPath, 'utf8').split(/\r?\n/).filter((line) => line.trim());
  for (const line of lines) {
    rowsRead += 1;
    const parsed = parseLine(line);
    if (!parsed.record) {
      parseErrors += 1;
      continue;
    }
    const proof = proofJoinRecord(parsed.record);
    if (!proof) continue;
    if (proof.requestId) byRequestId.set(proof.requestId, proof);
    if (proof.traceRef) byTraceRef.set(proof.traceRef, proof);
  }
  return { byRequestId, byTraceRef, rowsRead, parseErrors };
}

function proofJoinRecord(record: Record<string, unknown>): ProofJoinRecord | null {
  const proofCapsule = compactProofCapsule(record.proof_capsule || record.proofCapsule);
  const proofRef = stringField(record, 'harness_proof_ref') || stringField(record, 'harnessProofRef') || proofCapsule?.turnRef;
  if (!proofRef && !proofCapsule) return null;
  const requestId = stringField(record, 'request_id') || stringField(record, 'requestId');
  const traceRef = stringField(record, 'trace_ref') || stringField(record, 'traceRef') || stringField(record, 'trace_id') || stringField(record, 'traceId');
  if (!requestId && !traceRef) return null;
  return {
    requestId,
    traceRef,
    proofRef,
    proofCapsule: proofCapsule || undefined
  };
}

function compactProofCapsule(value: unknown): HarnessProofCapsuleV1 | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  if (record.schema !== 'spark.harness_proof.v1') return null;
  return {
    schema: 'spark.harness_proof.v1',
    turnRef: String(record.turnRef || ''),
    route: String(record.route || 'unknown'),
    owner: String(record.owner || 'unknown'),
    intent: objectField(record, 'intent') as unknown as HarnessProofCapsuleV1['intent'],
    authority: objectField(record, 'authority') as unknown as HarnessProofCapsuleV1['authority'],
    governor: objectField(record, 'governor') as unknown as HarnessProofCapsuleV1['governor'],
    execution: objectField(record, 'execution') as unknown as HarnessProofCapsuleV1['execution'],
    reply: objectField(record, 'reply') as unknown as HarnessProofCapsuleV1['reply'],
    joins: objectField(record, 'joins') as unknown as HarnessProofCapsuleV1['joins']
  };
}

function findProofJoin(index: ProofIndex, requestId: string, traceRef: string): ProofJoinRecord | null {
  if (requestId && index.byRequestId.has(requestId)) return index.byRequestId.get(requestId)!;
  if (traceRef && index.byTraceRef.has(traceRef)) return index.byTraceRef.get(traceRef)!;
  return null;
}

function hasProof(record: Record<string, unknown>): boolean {
  return Boolean(
    compactProofCapsule(record.proof_capsule || record.proofCapsule) ||
    stringField(record, 'harness_proof_ref') ||
    stringField(record, 'harnessProofRef')
  );
}

function isProofMarked(record: Record<string, unknown>): boolean {
  const status = [
    stringField(record, 'proof_status'),
    stringField(record, 'proofStatus'),
    stringField(record, 'proof_storage'),
    stringField(record, 'proofStorage')
  ].join(' ').toLowerCase();
  return /\b(?:not_execution_proof|not_applicable|missing_harness_proof|missing_harness_authority)\b/.test(status);
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

function objectField(record: Record<string, unknown>, key: string): Record<string, unknown> {
  const value = record[key];
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function stringField(record: Record<string, unknown>, key: string): string {
  const value = record[key];
  return typeof value === 'string' ? value.trim() : '';
}

function repairSeed(record: Record<string, unknown>): string {
  return JSON.stringify({
    event: stringField(record, 'event'),
    ts: stringField(record, 'ts'),
    chat_ref: stringField(record, 'chat_ref') || stringField(record, 'chatRef'),
    text_length: record.text_length,
    route: stringField(record, 'route'),
    command: stringField(record, 'command'),
    reply_kind: stringField(record, 'reply_kind') || stringField(record, 'replyKind')
  });
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
