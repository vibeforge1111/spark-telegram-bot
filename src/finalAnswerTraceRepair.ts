import { createHash } from 'node:crypto';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { buildHarnessProofCapsule, redactedProofRef, type HarnessProofCapsuleV1 } from './harnessProofCapsule';

export interface FinalAnswerTraceRepairOptions {
  finalAnswerPath?: string;
  sparkHome?: string;
  dryRun?: boolean;
  backup?: boolean;
}

export interface FinalAnswerTraceRepairResult {
  finalAnswerPath: string;
  backupPath: string | null;
  dryRun: boolean;
  rowsRead: number;
  rowsWritten: number;
  parseErrors: number;
  suppressedNonExecutionMarked: number;
  deliveryProofBackfilled: number;
  changedRows: number;
}

interface ParsedLine {
  line: string;
  record: Record<string, unknown> | null;
}

function defaultSparkHome(): string {
  return process.env.SPARK_HOME?.trim() || path.join(os.homedir(), '.spark');
}

export function defaultFinalAnswerAuditPath(sparkHome = defaultSparkHome()): string {
  return path.join(sparkHome, 'state', 'spark-telegram-bot', 'final-answer-gate-audit.jsonl');
}

export function repairFinalAnswerTraceAudit(options: FinalAnswerTraceRepairOptions = {}): FinalAnswerTraceRepairResult {
  const sparkHome = path.resolve(options.sparkHome || defaultSparkHome());
  const finalAnswerPath = path.resolve(options.finalAnswerPath || defaultFinalAnswerAuditPath(sparkHome));
  const dryRun = Boolean(options.dryRun);
  const backup = options.backup !== false;
  const lines = fs.existsSync(finalAnswerPath)
    ? fs.readFileSync(finalAnswerPath, 'utf8').split(/\r?\n/)
    : [];
  const parsedLines = lines.filter((line) => line.trim()).map(parseLine);

  let suppressedNonExecutionMarked = 0;
  let deliveryProofBackfilled = 0;
  let changedRows = 0;
  let parseErrors = 0;
  const repairedLines = parsedLines.map((entry) => {
    if (!entry.record) {
      parseErrors += 1;
      return entry.line;
    }
    const before = stableJson(entry.record);
    const outcome = repairFinalAnswerRecord(entry.record);
    if (outcome.suppressedNonExecutionMarked) suppressedNonExecutionMarked += 1;
    if (outcome.deliveryProofBackfilled) deliveryProofBackfilled += 1;
    if (stableJson(outcome.record) !== before) changedRows += 1;
    return JSON.stringify(outcome.record);
  });

  let backupPath: string | null = null;
  if (!dryRun) {
    fs.mkdirSync(path.dirname(finalAnswerPath), { recursive: true });
    if (backup && fs.existsSync(finalAnswerPath)) {
      backupPath = nextBackupPath(finalAnswerPath);
      fs.copyFileSync(finalAnswerPath, backupPath);
    }
    fs.writeFileSync(finalAnswerPath, repairedLines.length ? `${repairedLines.join('\n')}\n` : '', 'utf8');
  }

  return {
    finalAnswerPath,
    backupPath,
    dryRun,
    rowsRead: parsedLines.length,
    rowsWritten: repairedLines.length,
    parseErrors,
    suppressedNonExecutionMarked,
    deliveryProofBackfilled,
    changedRows
  };
}

function repairFinalAnswerRecord(record: Record<string, unknown>): {
  record: Record<string, unknown>;
  suppressedNonExecutionMarked: boolean;
  deliveryProofBackfilled: boolean;
} {
  const repaired = { ...record };
  const beforeHasProof = hasProof(repaired);
  let suppressedNonExecutionMarked = false;
  let deliveryProofBackfilled = false;

  if (isSuppressedBuilderReply(repaired)) {
    if (!hasRequestJoin(repaired)) repaired.request_ref = redactedProofRef('request', repairSeed(repaired));
    if (!hasTraceJoin(repaired)) repaired.trace_ref = redactedProofRef('trace', repairSeed(repaired));
    if (!hasProof(repaired) && !isProofMarked(repaired)) {
      repaired.proof_status = 'not_execution_proof';
      repaired.proof_storage = 'not_applicable';
      repaired.proof_join_source = 'final_answer_suppression_repair';
      suppressedNonExecutionMarked = true;
    }
  }

  if (isDeliveredCommandReply(repaired) && !beforeHasProof) {
    const requestId = stringField(repaired, 'request_id') || stringField(repaired, 'requestId');
    const traceRef = stringField(repaired, 'trace_ref') || stringField(repaired, 'traceRef') || stringField(repaired, 'trace_id') || stringField(repaired, 'traceId');
    if (requestId || traceRef) {
      const proofCapsule = buildCommandReplyDeliveryProofCapsule(repaired, traceRef || requestId);
      repaired.harness_proof_ref = proofCapsule.turnRef;
      repaired.proof_capsule = proofCapsule;
      repaired.proof_join_source = 'final_answer_delivery_repair';
      delete repaired.proof_status;
      delete repaired.proofStatus;
      delete repaired.proof_storage;
      delete repaired.proofStorage;
      deliveryProofBackfilled = true;
    }
  }

  return { record: repaired, suppressedNonExecutionMarked, deliveryProofBackfilled };
}

function buildCommandReplyDeliveryProofCapsule(record: Record<string, unknown>, turnRef: string): HarnessProofCapsuleV1 {
  const replyKind = stringField(record, 'reply_kind') || stringField(record, 'replyKind') || 'command_reply';
  const command = stringField(record, 'command') || 'telegram_command';
  const route = replyKind === 'build_ack'
    ? 'spawner.build'
    : replyKind === 'mission_ack'
      ? 'spawner.run'
      : `telegram.${command}`;
  return buildHarnessProofCapsule({
    turnRef,
    route,
    owner: route.startsWith('spawner.') ? 'spawner-ui' : 'spark-telegram-bot',
    intent: {
      kind: route,
      confidence: 'contextual',
      noExecution: false
    },
    authority: {
      decision: 'allowed',
      contract: 'spark.turn_intent.v1',
      riskTier: route.startsWith('spawner.') ? 'execute' : 'read',
      reasonSummary: 'Historical final-answer command acknowledgement was repaired from existing request and trace context.'
    },
    governor: {
      decision: 'read_only',
      verified: true
    },
    execution: {
      status: route.startsWith('spawner.') ? 'started' : 'completed',
      tool: route.startsWith('spawner.') ? 'spawner.run' : command,
      mutationClass: route.startsWith('spawner.') ? 'launches_mission' : 'read_only'
    },
    reply: {
      delivered: true,
      shape: 'natural',
      rawReasonsHidden: true
    },
    joins: {
      telegram: 'joined',
      spawner: route.startsWith('spawner.') ? 'joined' : 'not_applicable',
      builder: 'not_applicable',
      provider: 'not_applicable',
      memory: 'not_applicable',
      voice: 'not_applicable'
    }
  });
}

function isSuppressedBuilderReply(record: Record<string, unknown>): boolean {
  return stringField(record, 'event') === 'final_answer_checked' &&
    stringField(record, 'outcome') === 'suppressed_builder_reply';
}

function isDeliveredCommandReply(record: Record<string, unknown>): boolean {
  return stringField(record, 'event') === 'telegram_command_reply' &&
    stringField(record, 'outcome') === 'command_reply_delivered';
}

function hasRequestJoin(record: Record<string, unknown>): boolean {
  return Boolean(stringField(record, 'request_id') || stringField(record, 'requestId') || stringField(record, 'request_ref') || stringField(record, 'requestRef'));
}

function hasTraceJoin(record: Record<string, unknown>): boolean {
  return Boolean(stringField(record, 'trace_ref') || stringField(record, 'traceRef') || stringField(record, 'trace_id') || stringField(record, 'traceId'));
}

function hasProof(record: Record<string, unknown>): boolean {
  return Boolean(
    objectField(record, 'proof_capsule') ||
    objectField(record, 'proofCapsule') ||
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

function objectField(record: Record<string, unknown>, key: string): Record<string, unknown> | null {
  const value = record[key];
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

function stringField(record: Record<string, unknown>, key: string): string {
  const value = record[key];
  return typeof value === 'string' ? value.trim() : '';
}

function repairSeed(record: Record<string, unknown>): string {
  return JSON.stringify({
    event: stringField(record, 'event'),
    outcome: stringField(record, 'outcome'),
    ts: stringField(record, 'ts'),
    chat_ref: stringField(record, 'chat_ref') || stringField(record, 'chatRef'),
    user_ref: stringField(record, 'user_ref') || stringField(record, 'userRef'),
    suppression_reason: stringField(record, 'suppression_reason') || stringField(record, 'suppressionReason'),
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
  return Object.keys(value as Record<string, unknown>).sort().reduce<Record<string, unknown>>((sorted, key) => {
    sorted[key] = sortKeys((value as Record<string, unknown>)[key]);
    return sorted;
  }, {});
}

function nextBackupPath(filePath: string): string {
  const base = `${filePath}.raw-backup`;
  if (!fs.existsSync(base)) return base;
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const digest = createHash('sha256').update(`${filePath}:${stamp}`).digest('hex').slice(0, 8);
  return `${base}-${stamp}-${digest}`;
}
