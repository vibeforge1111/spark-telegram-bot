import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { naturalRouteLedgerPath, type NaturalRouteExecutionRecord } from './naturalRouteLedger';

export const LIVE_TRACE_JOIN_SAFE_PROMPTS = [
  'I am mentioning build and mission, but do not start anything. What is the current Spark risk profile?',
  'I am asking about a bug in mission routing. Do not launch a mission; just explain the likely failure class.',
  'Do not repair anything. Just tell me whether a repair is needed right now, using fresh state.',
  'If memory says Spawner is down but spark live status says it is up, which source wins?'
] as const;

export interface ControlProofTraceJoinOptions {
  sparkHome?: string;
  naturalRouteLedger?: string;
  finalAnswerAudit?: string;
  outboundAudit?: string;
  sampleSize?: number;
  requireLiveEvidence?: boolean;
  minRouteRows?: number;
  generatedAt?: string;
}

export interface ControlProofTraceJoinRow {
  recordedAt: string;
  shadowRoute: string;
  executedRoute: string;
  delivery: string;
  outcome: string;
  requestIdPresent: boolean;
  traceRefPresent: boolean;
  proofRefPresent: boolean;
  replyJoined: boolean;
  proofJoined: boolean;
  actionOrNoActionEvidence: boolean;
  gaps: string[];
}

export interface ControlProofTraceJoinSummary {
  ok: boolean;
  generatedAt: string;
  sparkHome: string;
  naturalRouteLedger: string;
  finalAnswerAudit: string;
  outboundAudit: string;
  totalRouteRows: number;
  sampledRouteRows: number;
  parseErrors: number;
  noRouteEvidence: boolean;
  liveEvidenceRequired: boolean;
  minRouteRows: number;
  liveEvidenceReady: boolean;
  insufficientLiveRouteRows: boolean;
  joinedRows: number;
  gapRows: number;
  missingJoinKeyRows: number;
  missingReplyJoinRows: number;
  missingProofJoinRows: number;
  missingActionEvidenceRows: number;
  routeMismatchRows: number;
  rows: ControlProofTraceJoinRow[];
}

type RefIndex = {
  requestIds: Set<string>;
  traceRefs: Set<string>;
  proofRefs: Set<string>;
};

export function defaultSparkHome(): string {
  return process.env.SPARK_HOME?.trim() || path.join(os.homedir(), '.spark');
}

export function defaultFinalAnswerAuditPath(sparkHome = defaultSparkHome()): string {
  return path.join(sparkHome, 'state', 'spark-telegram-bot', 'final-answer-gate-audit.jsonl');
}

export function defaultOutboundAuditPath(sparkHome = defaultSparkHome()): string {
  return path.join(sparkHome, 'state', 'spark-telegram-bot', 'node-outbound-audit.jsonl');
}

export function auditControlProofTraceJoins(options: ControlProofTraceJoinOptions = {}): ControlProofTraceJoinSummary {
  const sparkHome = path.resolve(options.sparkHome || defaultSparkHome());
  const routeLedgerPath = path.resolve(options.naturalRouteLedger || naturalRouteLedgerPath());
  const finalAnswerAudit = path.resolve(options.finalAnswerAudit || defaultFinalAnswerAuditPath(sparkHome));
  const outboundAudit = path.resolve(options.outboundAudit || defaultOutboundAuditPath(sparkHome));
  const sampleSize = Math.max(1, Math.trunc(options.sampleSize || 100));
  const minRouteRows = Math.max(1, Math.trunc(options.minRouteRows || 1));
  const liveEvidenceRequired = Boolean(options.requireLiveEvidence);
  const routeRead = readJsonl(routeLedgerPath);
  const finalIndex = indexEvidenceRefs(readJsonl(finalAnswerAudit).records);
  const outboundIndex = indexEvidenceRefs(readJsonl(outboundAudit).records);
  const evidenceIndex = mergeRefIndexes(finalIndex, outboundIndex);
  const routeRecords = routeRead.records.filter(isNaturalRouteExecutionRecord);
  const sampled = routeRecords.slice(-sampleSize);
  const rows = sampled.map((record) => summarizeRouteJoin(record, evidenceIndex));
  const gapRows = rows.filter((row) => row.gaps.length > 0).length;
  const liveEvidenceReady = sampled.length >= minRouteRows && gapRows === 0 && routeRead.parseErrors === 0;
  const insufficientLiveRouteRows = liveEvidenceRequired && sampled.length < minRouteRows;

  return {
    ok: routeRead.parseErrors === 0 && sampled.length > 0 && gapRows === 0 && !insufficientLiveRouteRows,
    generatedAt: options.generatedAt || new Date().toISOString(),
    sparkHome,
    naturalRouteLedger: routeLedgerPath,
    finalAnswerAudit,
    outboundAudit,
    totalRouteRows: routeRecords.length,
    sampledRouteRows: sampled.length,
    parseErrors: routeRead.parseErrors,
    noRouteEvidence: sampled.length === 0,
    liveEvidenceRequired,
    minRouteRows,
    liveEvidenceReady,
    insufficientLiveRouteRows,
    joinedRows: rows.length - gapRows,
    gapRows,
    missingJoinKeyRows: rows.filter((row) => row.gaps.includes('missing_join_keys')).length,
    missingReplyJoinRows: rows.filter((row) => row.gaps.includes('missing_reply_join')).length,
    missingProofJoinRows: rows.filter((row) => row.gaps.includes('missing_proof_join')).length,
    missingActionEvidenceRows: rows.filter((row) => row.gaps.includes('missing_action_or_no_action_evidence')).length,
    routeMismatchRows: rows.filter((row) => row.gaps.includes('route_mismatch')).length,
    rows
  };
}

function isNaturalRouteExecutionRecord(record: unknown): record is NaturalRouteExecutionRecord {
  if (!record || typeof record !== 'object' || Array.isArray(record)) return false;
  const candidate = record as Record<string, unknown>;
  return candidate.schema_version === 'spark.nlp.route_execution.v1' &&
    typeof candidate.recorded_at === 'string' &&
    typeof candidate.shadow_route === 'string' &&
    typeof candidate.executed_route === 'string';
}

export function formatControlProofTraceJoinReport(summary: ControlProofTraceJoinSummary): string {
  const lines = [
    'Control-proof trace join checker',
    `Generated: ${summary.generatedAt}`,
    `Spark home: ${redactPath(summary.sparkHome)}`,
    `Route ledger: ${redactPath(summary.naturalRouteLedger)}`,
    `Route rows: ${summary.sampledRouteRows}/${summary.totalRouteRows} sampled`,
    '',
    summary.ok ? 'Status: clean' : 'Status: gaps found',
    `Joined rows: ${summary.joinedRows}`,
    `Gap rows: ${summary.gapRows}`,
    `Parse errors: ${summary.parseErrors}`,
    ...(summary.noRouteEvidence ? ['No route evidence sampled; run a Telegram text turn with the route ledger enabled before claiming trace-join proof.'] : []),
    ...(summary.liveEvidenceRequired ? [
      `Live route proof: ${summary.liveEvidenceReady ? 'ready' : 'not ready'} (${summary.sampledRouteRows}/${summary.minRouteRows} minimum joined rows)`,
      ...(summary.liveEvidenceReady ? [] : liveTraceCaptureGuideLines())
    ] : []),
    '',
    'Gap counts:',
    `- missing join keys: ${summary.missingJoinKeyRows}`,
    `- missing reply joins: ${summary.missingReplyJoinRows}`,
    `- missing proof joins: ${summary.missingProofJoinRows}`,
    `- missing action/no-action evidence: ${summary.missingActionEvidenceRows}`,
    `- route mismatches: ${summary.routeMismatchRows}`
  ];
  const gapRows = summary.rows.filter((row) => row.gaps.length > 0);
  if (gapRows.length > 0) {
    lines.push('', 'Gap samples:');
    for (const row of gapRows.slice(0, 10)) {
      lines.push(`- ${row.executedRoute}: ${row.gaps.join(', ')} | delivery ${row.delivery} | outcome ${row.outcome}`);
    }
  }
  return `${lines.join('\n')}\n`;
}

function liveTraceCaptureGuideLines(): string[] {
  return [
    'Live route evidence incomplete; capture real SparkRecursive_bot Telegram text turns before claiming live trace-join proof.',
    'Safe SparkRecursive_bot prompts:',
    ...LIVE_TRACE_JOIN_SAFE_PROMPTS.map((prompt, index) => `${index + 1}. ${prompt}`),
    'After Spark replies to all four, rerun: npm run control:proof:live-trace'
  ];
}

function summarizeRouteJoin(record: NaturalRouteExecutionRecord, index: RefIndex): ControlProofTraceJoinRow {
  const requestId = stringField(record, 'request_id');
  const traceRef = stringField(record, 'trace_ref');
  const proofRef = stringField(record, 'harness_proof_ref');
  const hasJoinKeys = Boolean(requestId && traceRef);
  const replyJoined = Boolean(
    (requestId && index.requestIds.has(requestId)) ||
    (traceRef && index.traceRefs.has(traceRef)) ||
    (proofRef && index.proofRefs.has(proofRef))
  );
  const proofJoined = Boolean(proofRef && index.proofRefs.has(proofRef));
  const actionOrNoActionEvidence = Boolean(record.executed_action && record.delivery && record.delivery !== 'unknown');
  const routeMatched = record.outcome !== 'mismatch';
  const gaps: string[] = [];
  if (!hasJoinKeys) gaps.push('missing_join_keys');
  if (!replyJoined) gaps.push('missing_reply_join');
  if (!proofJoined) gaps.push('missing_proof_join');
  if (!actionOrNoActionEvidence) gaps.push('missing_action_or_no_action_evidence');
  if (!routeMatched) gaps.push('route_mismatch');
  return {
    recordedAt: record.recorded_at || '',
    shadowRoute: record.shadow_route || 'unknown',
    executedRoute: record.executed_route || 'unknown',
    delivery: record.delivery || 'unknown',
    outcome: record.outcome || 'unknown',
    requestIdPresent: Boolean(requestId),
    traceRefPresent: Boolean(traceRef),
    proofRefPresent: Boolean(proofRef),
    replyJoined,
    proofJoined,
    actionOrNoActionEvidence,
    gaps
  };
}

function readJsonl(filePath: string): { records: unknown[]; totalRows: number; parseErrors: number } {
  if (!fs.existsSync(filePath)) return { records: [], totalRows: 0, parseErrors: 0 };
  const lines = fs.readFileSync(filePath, 'utf8').split(/\r?\n/).filter(Boolean);
  const records: unknown[] = [];
  let parseErrors = 0;
  for (const line of lines) {
    try {
      records.push(JSON.parse(line));
    } catch {
      parseErrors += 1;
    }
  }
  return { records, totalRows: lines.length, parseErrors };
}

function indexEvidenceRefs(records: unknown[]): RefIndex {
  const index: RefIndex = { requestIds: new Set(), traceRefs: new Set(), proofRefs: new Set() };
  for (const record of records) {
    addRef(index.requestIds, stringField(record, 'request_id') || stringField(record, 'requestId') || stringField(record, 'request_ref'));
    addRef(index.traceRefs, stringField(record, 'trace_ref') || stringField(record, 'traceRef') || stringField(record, 'trace_id'));
    addRef(index.proofRefs, stringField(record, 'harness_proof_ref') || stringField(record, 'harnessProofRef'));
    const row = objectField(record);
    const capsule = row
      ? objectField(row.proof_capsule) || objectField(row.proofCapsule) || objectField(row.harness_proof) || objectField(row.harnessProof)
      : null;
    addRef(index.proofRefs, stringField(capsule, 'turnRef'));
  }
  return index;
}

function mergeRefIndexes(...indexes: RefIndex[]): RefIndex {
  const merged: RefIndex = { requestIds: new Set(), traceRefs: new Set(), proofRefs: new Set() };
  for (const index of indexes) {
    for (const value of index.requestIds) merged.requestIds.add(value);
    for (const value of index.traceRefs) merged.traceRefs.add(value);
    for (const value of index.proofRefs) merged.proofRefs.add(value);
  }
  return merged;
}

function addRef(set: Set<string>, value: string): void {
  const trimmed = value.trim();
  if (trimmed) set.add(trimmed);
}

function stringField(record: unknown, key: string): string {
  if (!record || typeof record !== 'object' || Array.isArray(record)) return '';
  const value = (record as Record<string, unknown>)[key];
  return typeof value === 'string' ? value.trim() : '';
}

function objectField(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

function redactPath(value: string): string {
  const home = os.homedir();
  return value.replace(home, '<home>');
}
