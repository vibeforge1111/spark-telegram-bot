import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { naturalRouteLedgerPath, type NaturalRouteExecutionRecord } from './naturalRouteLedger';

export const LIVE_TRACE_JOIN_SAFE_PROMPT_CASES = [
  {
    id: 'risk_profile_no_build',
    prompt: 'I am mentioning build and mission, but do not start anything. What is the current Spark risk profile?',
    route: 'fresh_state.risk_profile',
    action: 'harness_core.risk_profile'
  },
  {
    id: 'mission_routing_explain_only',
    prompt: 'I am asking about a bug in mission routing. Do not launch a mission; just explain the likely failure class.',
    route: 'conversation.mission_routing_failure_class',
    action: 'plain_chat.qa_boundary'
  },
  {
    id: 'repair_status_no_action',
    prompt: 'Do not repair anything. Just tell me whether a repair is needed right now, using fresh state.',
    route: 'fresh_state.read_only_repair_status',
    action: 'harness_core.read_only_state'
  },
  {
    id: 'memory_vs_fresh_state',
    prompt: 'If memory says Spawner is down but spark live status says it is up, which source wins?',
    route: 'fresh_state.authority_answer',
    action: 'harness_core.source_priority'
  }
] as const;

export const LIVE_TRACE_JOIN_SAFE_PROMPTS = LIVE_TRACE_JOIN_SAFE_PROMPT_CASES.map((entry) => entry.prompt);

export interface ControlProofTraceJoinOptions {
  sparkHome?: string;
  naturalRouteLedger?: string;
  finalAnswerAudit?: string;
  outboundAudit?: string;
  sampleSize?: number;
  requireLiveEvidence?: boolean;
  minRouteRows?: number;
  minNoActionRows?: number;
  maxLiveEvidenceAgeMs?: number;
  generatedAt?: string;
}

export interface ControlProofTraceJoinRow {
  recordedAt: string;
  liveEvidenceAgeMs: number | null;
  maxLiveEvidenceAgeMs: number;
  shadowRoute: string;
  executedRoute: string;
  executedAction: string;
  delivery: string;
  outcome: string;
  requestIdPresent: boolean;
  traceRefPresent: boolean;
  proofRefPresent: boolean;
  replyJoined: boolean;
  proofJoined: boolean;
  actionOrNoActionEvidence: boolean;
  noActionEvidence: boolean;
  staleLiveEvidence: boolean;
  gaps: string[];
}

export interface ControlProofTraceJoinSummary {
  ok: boolean;
  generatedAt: string;
  sparkHome: string;
  naturalRouteLedger: string;
  finalAnswerAudit: string;
  outboundAudit: string;
  routeLedgerExists: boolean;
  routeLedgerBytes: number;
  routeLedgerState: 'missing' | 'empty' | 'invalid' | 'ready';
  finalAnswerAuditRows: number;
  outboundAuditRows: number;
  currentEnvLedgerDisabled: boolean;
  totalRouteRows: number;
  sampledRouteRows: number;
  parseErrors: number;
  noRouteEvidence: boolean;
  liveEvidenceRequired: boolean;
  minRouteRows: number;
  minNoActionRows: number;
  liveEvidenceReady: boolean;
  insufficientLiveRouteRows: boolean;
  insufficientNoActionRows: boolean;
  maxLiveEvidenceAgeMs: number;
  structurallyJoinedRows: number;
  joinedRows: number;
  noActionEvidenceRows: number;
  safePromptEvidenceRows: number;
  staleSafePromptEvidenceRows: number;
  safePromptEvidence: string[];
  staleSafePromptEvidence: string[];
  missingSafePromptEvidence: string[];
  staleRouteRows: number;
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
  requestTracePairs: Set<string>;
  requestTraceProofTriples: Set<string>;
};

const DEFAULT_MAX_LIVE_EVIDENCE_AGE_MS = 4 * 60 * 60 * 1000;

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
  const minNoActionRows = Math.max(0, Math.trunc(
    options.minNoActionRows ?? (liveEvidenceRequired ? minRouteRows : 0)
  ));
  const maxLiveEvidenceAgeMs = Math.max(1, Math.trunc(options.maxLiveEvidenceAgeMs || DEFAULT_MAX_LIVE_EVIDENCE_AGE_MS));
  const generatedAt = options.generatedAt || new Date().toISOString();
  const routeRead = readJsonl(routeLedgerPath);
  const finalRead = readJsonl(finalAnswerAudit);
  const outboundRead = readJsonl(outboundAudit);
  const finalIndex = indexEvidenceRefs(finalRead.records);
  const outboundIndex = indexEvidenceRefs(outboundRead.records);
  const evidenceIndex = mergeRefIndexes(finalIndex, outboundIndex);
  const routeRecords = routeRead.records.filter(isNaturalRouteExecutionRecord);
  const sampled = routeRecords.slice(-sampleSize);
  const rows = sampled.map((record) => summarizeRouteJoin(record, evidenceIndex, {
    liveEvidenceRequired,
    generatedAt,
    maxLiveEvidenceAgeMs
  }));
  const safePromptEvidence = safePromptEvidenceIds(rows);
  const staleSafePromptEvidence = staleSafePromptEvidenceIds(rows);
  const releaseBlockingRows = rows.filter((row) => releaseBlockingGaps(row, safePromptEvidence).length > 0);
  const gapRows = releaseBlockingRows.length;
  const structurallyJoinedRows = rows.filter((row) => row.gaps.every((gap) => gap === 'stale_live_route_evidence')).length;
  const joinedRows = rows.filter((row) => row.gaps.length === 0).length;
  const noActionEvidenceRows = rows.filter((row) => row.noActionEvidence && row.gaps.length === 0).length;
  const safePromptEvidenceList = LIVE_TRACE_JOIN_SAFE_PROMPT_CASES
    .map((signature) => signature.id)
    .filter((id) => safePromptEvidence.has(id));
  const staleSafePromptEvidenceList = LIVE_TRACE_JOIN_SAFE_PROMPT_CASES
    .map((signature) => signature.id)
    .filter((id) => staleSafePromptEvidence.has(id) && !safePromptEvidence.has(id));
  const missingSafePromptEvidence = LIVE_TRACE_JOIN_SAFE_PROMPT_CASES
    .map((signature) => signature.id)
    .filter((id) => !safePromptEvidence.has(id) && !staleSafePromptEvidence.has(id));
  const insufficientLiveRouteRows = liveEvidenceRequired && joinedRows < minRouteRows;
  const insufficientNoActionRows = liveEvidenceRequired && noActionEvidenceRows < minNoActionRows;
  const insufficientSafePromptEvidence = liveEvidenceRequired && safePromptEvidence.size < LIVE_TRACE_JOIN_SAFE_PROMPT_CASES.length;
  const liveEvidenceReady = joinedRows >= minRouteRows &&
    noActionEvidenceRows >= minNoActionRows &&
    !insufficientSafePromptEvidence &&
    gapRows === 0 &&
    routeRead.parseErrors === 0;
  const routeLedgerState = classifyRouteLedgerState(routeRead, routeRecords.length);

  return {
    ok: routeRead.parseErrors === 0 &&
      sampled.length > 0 &&
      gapRows === 0 &&
      !insufficientLiveRouteRows &&
      !insufficientNoActionRows &&
      !insufficientSafePromptEvidence,
    generatedAt,
    sparkHome,
    naturalRouteLedger: routeLedgerPath,
    finalAnswerAudit,
    outboundAudit,
    routeLedgerExists: routeRead.exists,
    routeLedgerBytes: routeRead.bytes,
    routeLedgerState,
    finalAnswerAuditRows: finalRead.totalRows,
    outboundAuditRows: outboundRead.totalRows,
    currentEnvLedgerDisabled: process.env.SPARK_NATURAL_ROUTE_LEDGER === '0',
    totalRouteRows: routeRecords.length,
    sampledRouteRows: sampled.length,
    parseErrors: routeRead.parseErrors,
    noRouteEvidence: sampled.length === 0,
    liveEvidenceRequired,
    minRouteRows,
    minNoActionRows,
    liveEvidenceReady,
    insufficientLiveRouteRows,
    insufficientNoActionRows,
    maxLiveEvidenceAgeMs,
    structurallyJoinedRows,
    joinedRows,
    noActionEvidenceRows,
    safePromptEvidenceRows: safePromptEvidence.size,
    staleSafePromptEvidenceRows: staleSafePromptEvidence.size,
    safePromptEvidence: safePromptEvidenceList,
    staleSafePromptEvidence: staleSafePromptEvidenceList,
    missingSafePromptEvidence,
    staleRouteRows: releaseBlockingRows.filter((row) => row.gaps.includes('stale_live_route_evidence')).length,
    gapRows,
    missingJoinKeyRows: releaseBlockingRows.filter((row) => row.gaps.includes('missing_join_keys')).length,
    missingReplyJoinRows: releaseBlockingRows.filter((row) => row.gaps.includes('missing_reply_join')).length,
    missingProofJoinRows: releaseBlockingRows.filter((row) => row.gaps.includes('missing_proof_join')).length,
    missingActionEvidenceRows: releaseBlockingRows.filter((row) => row.gaps.includes('missing_action_or_no_action_evidence')).length,
    routeMismatchRows: releaseBlockingRows.filter((row) => row.gaps.includes('route_mismatch')).length,
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
    `Route ledger state: ${summary.routeLedgerState} (${summary.routeLedgerExists ? `${summary.routeLedgerBytes} bytes` : 'file missing'})`,
    `Route rows: ${summary.sampledRouteRows}/${summary.totalRouteRows} sampled`,
    `Evidence audits: final answers ${summary.finalAnswerAuditRows} rows, outbound ${summary.outboundAuditRows} rows`,
    '',
    summary.ok ? 'Status: clean' : 'Status: gaps found',
    `Structurally joined rows: ${summary.structurallyJoinedRows}`,
    `Joined rows: ${summary.joinedRows}`,
    `Gap rows: ${summary.gapRows}`,
    `Parse errors: ${summary.parseErrors}`,
    ...(summary.noRouteEvidence ? liveRouteLedgerDiagnosisLines(summary) : []),
    ...(summary.liveEvidenceRequired ? [
      `Live route proof: ${summary.liveEvidenceReady ? 'ready' : 'not ready'} (${summary.joinedRows}/${summary.minRouteRows} minimum joined rows)`,
      `No-action route proof: ${summary.noActionEvidenceRows >= summary.minNoActionRows ? 'ready' : 'not ready'} (${summary.noActionEvidenceRows}/${summary.minNoActionRows} minimum no-action rows)`,
      `Safe prompt proof: ${summary.safePromptEvidenceRows === LIVE_TRACE_JOIN_SAFE_PROMPT_CASES.length ? 'ready' : 'not ready'} (${summary.safePromptEvidenceRows}/${LIVE_TRACE_JOIN_SAFE_PROMPT_CASES.length} required safe prompts)`,
      ...(summary.safePromptEvidence.length ? [`Safe prompt evidence: ${summary.safePromptEvidence.join(', ')}`] : []),
      ...(summary.staleSafePromptEvidence.length ? [`Stale safe prompt evidence: ${summary.staleSafePromptEvidence.join(', ')}`] : []),
      ...(summary.missingSafePromptEvidence.length ? [`Missing safe prompt evidence: ${summary.missingSafePromptEvidence.join(', ')}`] : []),
      ...(summary.liveEvidenceReady ? [] : liveTraceCaptureGuideLines())
    ] : []),
    '',
    'Gap counts:',
    `- missing join keys: ${summary.missingJoinKeyRows}`,
    `- missing reply joins: ${summary.missingReplyJoinRows}`,
    `- missing proof joins: ${summary.missingProofJoinRows}`,
    `- missing action/no-action evidence: ${summary.missingActionEvidenceRows}`,
    `- route mismatches: ${summary.routeMismatchRows}`,
    `- stale live route evidence: ${summary.staleRouteRows}`
  ];
  const cleanSafePromptEvidence = new Set(summary.safePromptEvidence);
  const gapRows = summary.rows.filter((row) => releaseBlockingGaps(row, cleanSafePromptEvidence).length > 0);
  if (gapRows.length > 0) {
    lines.push('', 'Gap samples:');
    for (const row of gapRows.slice(0, 10)) {
      const gaps = releaseBlockingGaps(row, cleanSafePromptEvidence);
      const staleAge = row.gaps.includes('stale_live_route_evidence')
        ? ` | age ${formatDuration(row.liveEvidenceAgeMs)} > max ${formatDuration(row.maxLiveEvidenceAgeMs)}`
        : '';
      lines.push(`- ${row.executedRoute}: ${gaps.join(', ')} | delivery ${row.delivery} | outcome ${row.outcome}${staleAge}`);
    }
  }
  return `${lines.join('\n')}\n`;
}

export function formatLiveTraceSafePromptGuide(): string {
  return [
    'SparkRecursive_bot live trace safe prompts',
    '',
    'Copy each block into SparkRecursive_bot private chat. These prompts are read-only/no-action checks for the live trace-join gate.',
    '',
    ...LIVE_TRACE_JOIN_SAFE_PROMPT_CASES.flatMap((entry, index) => [
      `${index + 1}. ${entry.id}`,
      `Expected proof: ${entry.route} -> ${entry.action}`,
      '```text',
      entry.prompt,
      '```',
      ''
    ]),
    'After Spark replies to all four, rerun:',
    '',
    '```bash',
    'npm run control:proof:live-trace',
    '```'
  ].join('\n');
}

function classifyRouteLedgerState(
  read: JsonlReadResult,
  routeRecordCount: number
): ControlProofTraceJoinSummary['routeLedgerState'] {
  if (!read.exists) return 'missing';
  if (read.totalRows === 0) return 'empty';
  if (read.parseErrors > 0 || routeRecordCount === 0) return 'invalid';
  return 'ready';
}

function liveRouteLedgerDiagnosisLines(summary: ControlProofTraceJoinSummary): string[] {
  const lines = [
    'No route evidence sampled; run a Telegram text turn with the route ledger enabled before claiming trace-join proof.',
    'Route ledger diagnosis:'
  ];
  if (summary.routeLedgerState === 'missing') {
    lines.push('- route ledger file is missing at the expected Spark state path');
  } else if (summary.routeLedgerState === 'empty') {
    lines.push('- route ledger file exists but has no rows');
  } else if (summary.routeLedgerState === 'invalid') {
    lines.push('- route ledger file exists but has no valid natural-route rows');
  }
  if (summary.finalAnswerAuditRows > 0 || summary.outboundAuditRows > 0) {
    lines.push('- Telegram reply/proof audit rows exist, so this is specifically a route-ledger capture gap');
  }
  if (summary.currentEnvLedgerDisabled) {
    lines.push('- current checker environment has SPARK_NATURAL_ROUTE_LEDGER=0; live runtime must not use that setting for proof capture');
  }
  lines.push('- verify the live relay is running the current built source, then send the safe prompts below');
  return lines;
}

function liveTraceCaptureGuideLines(): string[] {
  return [
    'Live route evidence incomplete; capture real SparkRecursive_bot Telegram text turns before claiming live trace-join proof.',
    'Prompt guide: npm run control:proof:live-trace:prompts',
    'Safe SparkRecursive_bot prompts:',
    ...LIVE_TRACE_JOIN_SAFE_PROMPT_CASES.map((entry, index) => `${index + 1}. ${entry.prompt}`),
    'After Spark replies to all four, rerun: npm run control:proof:live-trace'
  ];
}

function safePromptEvidenceIds(rows: ControlProofTraceJoinRow[]): Set<string> {
  const ids = new Set<string>();
  for (const row of rows) {
    if (row.gaps.length > 0 || !row.noActionEvidence) continue;
    addSafePromptEvidenceId(ids, row);
  }
  return ids;
}

function releaseBlockingGaps(row: ControlProofTraceJoinRow, cleanSafePromptEvidence: Set<string>): string[] {
  if (row.gaps.length === 1 && row.gaps[0] === 'stale_live_route_evidence') {
    const safeId = safePromptEvidenceId(row);
    if (safeId && cleanSafePromptEvidence.has(safeId)) return [];
  }
  return row.gaps;
}

function staleSafePromptEvidenceIds(rows: ControlProofTraceJoinRow[]): Set<string> {
  const ids = new Set<string>();
  for (const row of rows) {
    if (!row.noActionEvidence || !row.gaps.includes('stale_live_route_evidence')) continue;
    if (row.gaps.some((gap) => gap !== 'stale_live_route_evidence')) continue;
    addSafePromptEvidenceId(ids, row);
  }
  return ids;
}

function addSafePromptEvidenceId(ids: Set<string>, row: ControlProofTraceJoinRow): void {
  const id = safePromptEvidenceId(row);
  if (id) ids.add(id);
}

function safePromptEvidenceId(row: ControlProofTraceJoinRow): string | null {
  const route = row.executedRoute.toLowerCase();
  const action = row.executedAction.toLowerCase();
  const signature = LIVE_TRACE_JOIN_SAFE_PROMPT_CASES.find((entry) => (
    entry.route === route &&
    entry.action === action
  ));
  return signature?.id || null;
}

function summarizeRouteJoin(
  record: NaturalRouteExecutionRecord,
  index: RefIndex,
  options: { liveEvidenceRequired: boolean; generatedAt: string; maxLiveEvidenceAgeMs: number }
): ControlProofTraceJoinRow {
  const requestId = stringField(record, 'request_id');
  const traceRef = stringField(record, 'trace_ref');
  const proofRef = stringField(record, 'harness_proof_ref');
  const hasJoinKeys = Boolean(requestId && traceRef);
  const replyJoined = hasJoinKeys && index.requestTracePairs.has(joinPairKey(requestId, traceRef));
  const proofJoined = Boolean(
    proofRef &&
    hasJoinKeys &&
    index.requestTraceProofTriples.has(joinTripleKey(requestId, traceRef, proofRef))
  );
  const actionOrNoActionEvidence = Boolean(record.executed_action && record.delivery && record.delivery !== 'unknown');
  const noActionEvidence = actionOrNoActionEvidence && isNoActionRouteEvidence(record);
  const routeMatched = record.outcome !== 'mismatch';
  const liveEvidenceAgeMs = liveRouteEvidenceAgeMs(record.recorded_at, options.generatedAt);
  const staleLiveEvidence = options.liveEvidenceRequired && (
    liveEvidenceAgeMs === null ||
    liveEvidenceAgeMs > options.maxLiveEvidenceAgeMs ||
    liveEvidenceAgeMs < -60_000
  );
  const gaps: string[] = [];
  if (!hasJoinKeys) gaps.push('missing_join_keys');
  if (!replyJoined) gaps.push('missing_reply_join');
  if (!proofJoined) gaps.push('missing_proof_join');
  if (!actionOrNoActionEvidence) gaps.push('missing_action_or_no_action_evidence');
  if (!routeMatched) gaps.push('route_mismatch');
  if (staleLiveEvidence) gaps.push('stale_live_route_evidence');
  return {
    recordedAt: record.recorded_at || '',
    liveEvidenceAgeMs,
    maxLiveEvidenceAgeMs: options.maxLiveEvidenceAgeMs,
    shadowRoute: record.shadow_route || 'unknown',
    executedRoute: record.executed_route || 'unknown',
    executedAction: record.executed_action || 'unknown',
    delivery: record.delivery || 'unknown',
    outcome: record.outcome || 'unknown',
    requestIdPresent: Boolean(requestId),
    traceRefPresent: Boolean(traceRef),
    proofRefPresent: Boolean(proofRef),
    replyJoined,
    proofJoined,
    actionOrNoActionEvidence,
    noActionEvidence,
    staleLiveEvidence,
    gaps
  };
}

function liveRouteEvidenceAgeMs(recordedAt: string, generatedAt: string): number | null {
  const recorded = Date.parse(recordedAt);
  const generated = Date.parse(generatedAt);
  if (!Number.isFinite(recorded) || !Number.isFinite(generated)) return null;
  return generated - recorded;
}

function formatDuration(valueMs: number | null): string {
  if (valueMs === null) return 'unknown';
  const sign = valueMs < 0 ? '-' : '';
  const absoluteMs = Math.abs(valueMs);
  const totalMinutes = Math.round(absoluteMs / 60_000);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours > 0) return `${sign}${hours}h${minutes ? ` ${minutes}m` : ''}`;
  return `${sign}${minutes}m`;
}

function isNoActionRouteEvidence(record: NaturalRouteExecutionRecord): boolean {
  const action = stringField(record, 'executed_action').toLowerCase();
  const route = stringField(record, 'executed_route').toLowerCase();
  const delivery = stringField(record, 'delivery').toLowerCase();
  if (!delivery || delivery === 'unknown') return false;
  if (action === 'answer' || action === 'no_action') return true;
  if (/^(?:plain_chat|conversation|fresh_state)\b/.test(action)) return true;
  if (/^harness_core\.(?:risk_profile|read_only_state|source_priority)\b/.test(action)) return true;
  if (/^(?:plain_chat|conversation|fresh_state)\b/.test(route)) return true;
  return false;
}

interface JsonlReadResult {
  records: unknown[];
  totalRows: number;
  parseErrors: number;
  exists: boolean;
  bytes: number;
}

function readJsonl(filePath: string): JsonlReadResult {
  if (!fs.existsSync(filePath)) return { records: [], totalRows: 0, parseErrors: 0, exists: false, bytes: 0 };
  const stat = fs.statSync(filePath);
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
  return { records, totalRows: lines.length, parseErrors, exists: true, bytes: stat.size };
}

function indexEvidenceRefs(records: unknown[]): RefIndex {
  const index: RefIndex = {
    requestIds: new Set(),
    traceRefs: new Set(),
    proofRefs: new Set(),
    requestTracePairs: new Set(),
    requestTraceProofTriples: new Set()
  };
  for (const record of records) {
    const requestId = stringField(record, 'request_id') || stringField(record, 'requestId') || stringField(record, 'request_ref');
    const traceRef = stringField(record, 'trace_ref') || stringField(record, 'traceRef') || stringField(record, 'trace_id');
    addRef(index.requestIds, requestId);
    addRef(index.traceRefs, traceRef);
    addJoinPair(index.requestTracePairs, requestId, traceRef);
    addRef(index.proofRefs, stringField(record, 'harness_proof_ref') || stringField(record, 'harnessProofRef'));
    const row = objectField(record);
    const capsule = row
      ? objectField(row.proof_capsule) || objectField(row.proofCapsule) || objectField(row.harness_proof) || objectField(row.harnessProof)
      : null;
    addRef(index.proofRefs, stringField(capsule, 'turnRef'));
    addJoinTriple(
      index.requestTraceProofTriples,
      requestId,
      traceRef,
      stringField(record, 'harness_proof_ref') || stringField(record, 'harnessProofRef')
    );
    addJoinTriple(index.requestTraceProofTriples, requestId, traceRef, stringField(capsule, 'turnRef'));
  }
  return index;
}

function mergeRefIndexes(...indexes: RefIndex[]): RefIndex {
  const merged: RefIndex = {
    requestIds: new Set(),
    traceRefs: new Set(),
    proofRefs: new Set(),
    requestTracePairs: new Set(),
    requestTraceProofTriples: new Set()
  };
  for (const index of indexes) {
    for (const value of index.requestIds) merged.requestIds.add(value);
    for (const value of index.traceRefs) merged.traceRefs.add(value);
    for (const value of index.proofRefs) merged.proofRefs.add(value);
    for (const value of index.requestTracePairs) merged.requestTracePairs.add(value);
    for (const value of index.requestTraceProofTriples) merged.requestTraceProofTriples.add(value);
  }
  return merged;
}

function addRef(set: Set<string>, value: string): void {
  const trimmed = value.trim();
  if (trimmed) set.add(trimmed);
}

function addJoinPair(set: Set<string>, requestId: string, traceRef: string): void {
  const key = joinPairKey(requestId, traceRef);
  if (key) set.add(key);
}

function addJoinTriple(set: Set<string>, requestId: string, traceRef: string, proofRef: string): void {
  const key = joinTripleKey(requestId, traceRef, proofRef);
  if (key) set.add(key);
}

function joinPairKey(requestId: string, traceRef: string): string {
  const request = requestId.trim();
  const trace = traceRef.trim();
  return request && trace ? `${request}\u0000${trace}` : '';
}

function joinTripleKey(requestId: string, traceRef: string, proofRef: string): string {
  const pair = joinPairKey(requestId, traceRef);
  const proof = proofRef.trim();
  return pair && proof ? `${pair}\u0000${proof}` : '';
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
