import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

export type ControlProofEvidenceKind = 'jsonl' | 'json';

export interface ControlProofEvidenceFile {
  label: string;
  filePath: string;
  kind: ControlProofEvidenceKind;
}

export interface ControlProofTraceAuditOptions {
  sparkHome?: string;
  sampleSize?: number;
  evidenceFiles?: ControlProofEvidenceFile[];
  generatedAt?: string;
}

export interface ControlProofTracePlaneSummary {
  label: string;
  filePath: string;
  missing: boolean;
  totalRows: number;
  sampledRows: number;
  parseErrors: number;
  requestIdPresent: number;
  requestIdMissing: number;
  traceRefPresent: number;
  traceRefMissing: number;
  proofCoveragePresent: number;
  proofCapsulePresent: number;
  proofRefPresent: number;
  proofNotApplicable: number;
  proofGapMarked: number;
  proofGapCapsulePresent: number;
  proofGapCapsuleValid: number;
  proofGapRefPresent: number;
  proofGapBackingIncomplete: number;
  proofGapBacking: 'n/a' | 'complete' | 'partial' | 'invalid' | 'missing';
  latestProofGapMarked: boolean;
  latestRecordAt: string | null;
  proofCapsuleMissing: number;
  rawIdKeyRows: number;
  rawPathLikeRows: number;
  policyReasonCodeRows: number;
  stackLikeRows: number;
  topLevelKeys: string[];
}

export interface ControlProofGapCounts {
  missingEvidence: number;
  missingTraceJoin: number;
  missingProofCapsule: number;
  legacyProofGap: number;
  incompleteLegacyProofGapBacking: number;
  latestProofGap: number;
  rawRefLeak: number;
  roboticFailureReply: number;
  stackLikeLeak: number;
}

export interface ControlProofTraceAuditResult {
  ok: boolean;
  blockingOk: boolean;
  generatedAt: string;
  sampleSize: number;
  sparkHome: string;
  planes: ControlProofTracePlaneSummary[];
  gapCounts: ControlProofGapCounts;
  gapPlanes: Record<keyof ControlProofGapCounts, string[]>;
}

const REQUEST_ID_KEYS = ['request_id', 'requestId', 'requestID', 'request_ref', 'requestRef'];
const TRACE_REF_KEYS = ['trace_ref', 'traceRef', 'trace_id', 'traceId'];
const PROOF_CAPSULE_KEYS = [
  'harness_proof',
  'harnessProof',
  'proof_capsule',
  'proofCapsule'
];
const PROOF_REF_KEYS = [
  'harness_proof_ref',
  'harnessProofRef'
];

const RAW_PATH_PATTERN = /\/Users\/|\/var\/folders\/|[A-Za-z]:\\|file:\/\//;
const POLICY_REASON_PATTERN = /tool_not_allowed_by_policy|owner_mismatch|route_not_selected_by_turn_envelope|governor_outcome_deny|harness_core/i;
const STACK_LIKE_PATTERN = /Traceback \(most recent call last\)|\n\s+at\s+\S+\s+\(/;
const RAW_ID_KEY_PATTERN = /^(chat_id|chatId|user_id|userId|from_id|fromId)$/;

export function defaultControlProofEvidenceFiles(sparkHome = defaultSparkHome()): ControlProofEvidenceFile[] {
  return [
    {
      label: 'telegram_final_answer',
      filePath: path.join(sparkHome, 'state', 'spark-telegram-bot', 'final-answer-gate-audit.jsonl'),
      kind: 'jsonl'
    },
    {
      label: 'telegram_outbound',
      filePath: path.join(sparkHome, 'state', 'spark-telegram-bot', 'node-outbound-audit.jsonl'),
      kind: 'jsonl'
    },
    {
      label: 'telegram_route_confidence',
      filePath: path.join(sparkHome, 'state', 'spark-telegram-bot', 'route-confidence-audit.jsonl'),
      kind: 'jsonl'
    },
    {
      label: 'builder_gateway',
      filePath: path.join(sparkHome, 'state', 'spark-intelligence', 'logs', 'gateway-trace.jsonl'),
      kind: 'jsonl'
    },
    {
      label: 'spawner_prd_trace',
      filePath: path.join(sparkHome, 'state', 'spawner-ui', 'prd-auto-trace.jsonl'),
      kind: 'jsonl'
    },
    {
      label: 'system_trace_index',
      filePath: path.join(sparkHome, 'state', 'system-map', 'trace-index.json'),
      kind: 'json'
    },
    {
      label: 'memory_movement_index',
      filePath: path.join(sparkHome, 'state', 'system-map', 'memory-movement-index.json'),
      kind: 'json'
    },
    {
      label: 'voice_surface_view',
      filePath: path.join(sparkHome, 'state', 'system-map', 'voice-surface-view.json'),
      kind: 'json'
    },
    {
      label: 'voice_runtime_state',
      filePath: path.join(sparkHome, 'state', 'spark-voice-comms', 'voice-runtime-state.json'),
      kind: 'json'
    }
  ];
}

export function defaultSparkHome(): string {
  return process.env.SPARK_HOME?.trim() || path.join(os.homedir(), '.spark');
}

export function auditControlProofTraceContinuity(options: ControlProofTraceAuditOptions = {}): ControlProofTraceAuditResult {
  const sparkHome = path.resolve(options.sparkHome || defaultSparkHome());
  const sampleSize = Math.max(1, Math.trunc(options.sampleSize || 100));
  const evidenceFiles = options.evidenceFiles || defaultControlProofEvidenceFiles(sparkHome);
  const planes = evidenceFiles.map((file) => summarizeEvidenceFile(file, sampleSize));
  const gapCounts = summarizeGapCounts(planes);
  const gapPlanes = summarizeGapPlanes(planes);
  const ok = Object.values(gapCounts).every((count) => count === 0);
  const blockingOk = releaseBlockingGapCounts(gapCounts).every((count) => count === 0);
  return {
    ok,
    blockingOk,
    generatedAt: options.generatedAt || new Date().toISOString(),
    sampleSize,
    sparkHome,
    planes,
    gapCounts,
    gapPlanes
  };
}

export function formatControlProofTraceAuditReport(result: ControlProofTraceAuditResult): string {
  const lines = [
    'Control-proof trace continuity audit',
    `Generated: ${result.generatedAt}`,
    `Spark home: ${redactPath(result.sparkHome)}`,
    `Sample size: ${result.sampleSize}`,
    '',
    result.ok ? 'Status: clean' : 'Status: gaps found',
    result.blockingOk ? 'Blocking status: clean' : 'Blocking status: blocking gaps found',
    '',
    'Planes:'
  ];
  for (const plane of result.planes) {
    if (plane.missing) {
      lines.push(`- ${plane.label}: missing evidence file`);
      continue;
    }
    lines.push(
      [
        `- ${plane.label}: ${plane.sampledRows}/${plane.totalRows} sampled`,
        `request ${plane.requestIdPresent}/${plane.sampledRows}`,
        `trace ${plane.traceRefPresent}/${plane.sampledRows}`,
        `proof ${plane.proofCoveragePresent}/${plane.sampledRows}`,
        `proof_ref ${plane.proofRefPresent}`,
        `proof_capsule ${plane.proofCapsulePresent}`,
        `proof_n/a ${plane.proofNotApplicable}`,
        `proof_gap ${plane.proofGapMarked}`,
        `gap_capsule ${plane.proofGapCapsulePresent}`,
        `gap_capsule_valid ${plane.proofGapCapsuleValid}`,
        `gap_ref ${plane.proofGapRefPresent}`,
        `gap_backing ${plane.proofGapBacking}`,
        `latest_gap ${plane.latestProofGapMarked ? 'yes' : 'no'}`,
        `raw_refs ${plane.rawPathLikeRows}`,
        `raw_id_keys ${plane.rawIdKeyRows}`,
        `reason_codes ${plane.policyReasonCodeRows}`,
        `parse_errors ${plane.parseErrors}`
      ].join(' | ')
    );
  }
  lines.push(
    '',
    'Gap counts:',
    `- missing evidence: ${result.gapCounts.missingEvidence}`,
    `- missing trace joins: ${result.gapCounts.missingTraceJoin}`,
    `- missing proof capsules: ${result.gapCounts.missingProofCapsule}`,
    `- legacy proof gaps: ${result.gapCounts.legacyProofGap}`,
    `- incomplete legacy gap backing: ${result.gapCounts.incompleteLegacyProofGapBacking}`,
    `- latest proof gaps: ${result.gapCounts.latestProofGap}`,
    `- raw ref leaks: ${result.gapCounts.rawRefLeak}`,
    `- robotic failure reasons: ${result.gapCounts.roboticFailureReply}`,
    `- stack-like leaks: ${result.gapCounts.stackLikeLeak}`
  );
  const gapDetails = formatGapPlaneDetails(result.gapPlanes);
  if (gapDetails.length > 0) {
    lines.push('', 'Gap planes:', ...gapDetails);
  }
  return `${lines.join('\n')}\n`;
}

function summarizeEvidenceFile(file: ControlProofEvidenceFile, sampleSize: number): ControlProofTracePlaneSummary {
  if (!fs.existsSync(file.filePath)) {
    return emptySummary(file, true);
  }
  try {
    const { records, totalRows, parseErrors } = readEvidenceRecords(file);
    return summarizeRecords(file, records, totalRows, parseErrors, sampleSize);
  } catch {
    return {
      ...emptySummary(file, false),
      parseErrors: 1
    };
  }
}

function readEvidenceRecords(file: ControlProofEvidenceFile): { records: unknown[]; totalRows: number; parseErrors: number } {
  const content = fs.readFileSync(file.filePath, 'utf8');
  if (file.kind === 'jsonl') {
    const lines = content.split(/\r?\n/).filter(Boolean);
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
  const parsed = JSON.parse(content);
  return {
    records: Array.isArray(parsed) ? parsed : [parsed],
    totalRows: Array.isArray(parsed) ? parsed.length : 1,
    parseErrors: 0
  };
}

function summarizeRecords(
  file: ControlProofEvidenceFile,
  records: unknown[],
  totalRows: number,
  parseErrors: number,
  sampleSize: number
): ControlProofTracePlaneSummary {
  const sampled = records.slice(-sampleSize);
  let requestIdPresent = 0;
  let traceRefPresent = 0;
  let proofCapsulePresent = 0;
  let proofRefPresent = 0;
  let proofCoveredRows = 0;
  let proofNotApplicable = 0;
  let proofGapMarked = 0;
  let proofGapCapsulePresent = 0;
  let proofGapCapsuleValid = 0;
  let proofGapRefPresent = 0;
  let proofGapBackingIncomplete = 0;
  let rawIdKeyRows = 0;
  let rawPathLikeRows = 0;
  let policyReasonCodeRows = 0;
  let stackLikeRows = 0;
  for (const record of sampled) {
    if (hasAnyKey(record, REQUEST_ID_KEYS)) requestIdPresent += 1;
    if (hasAnyKey(record, TRACE_REF_KEYS)) traceRefPresent += 1;
    const hasProofCapsule = hasAnyKey(record, PROOF_CAPSULE_KEYS) || isHarnessProofCapsuleRecord(record);
    const hasProofRef = hasAnyKey(record, PROOF_REF_KEYS);
    if (isProofGapMarkedRecord(record)) {
      const hasValidLegacyGapCapsule = hasValidLegacyProofGapCapsule(record);
      proofGapMarked += 1;
      if (hasProofCapsule) proofGapCapsulePresent += 1;
      if (hasValidLegacyGapCapsule) proofGapCapsuleValid += 1;
      if (hasProofRef) proofGapRefPresent += 1;
      if (!hasProofCapsule || !hasProofRef || !hasValidLegacyGapCapsule) proofGapBackingIncomplete += 1;
    }
    if (hasProofCapsule || hasProofRef) {
      proofCoveredRows += 1;
    }
    if (hasProofCapsule) {
      proofCapsulePresent += 1;
    }
    if (hasProofRef) {
      proofRefPresent += 1;
    } else if (!hasProofCapsule && isProofNotApplicableRecord(record)) {
      proofNotApplicable += 1;
    }
    if (hasKeyPattern(record, RAW_ID_KEY_PATTERN)) rawIdKeyRows += 1;
    const raw = safeStringify(record);
    if (RAW_PATH_PATTERN.test(raw)) rawPathLikeRows += 1;
    if (POLICY_REASON_PATTERN.test(raw)) policyReasonCodeRows += 1;
    if (STACK_LIKE_PATTERN.test(raw)) stackLikeRows += 1;
  }
  const latestRecord = records[records.length - 1];
  const topLevelKeys = topLevelKeysFor(latestRecord);
  return {
    label: file.label,
    filePath: file.filePath,
    missing: false,
    totalRows,
    sampledRows: sampled.length,
    parseErrors,
    requestIdPresent,
    requestIdMissing: sampled.length - requestIdPresent,
    traceRefPresent,
    traceRefMissing: sampled.length - traceRefPresent,
    proofCoveragePresent: proofCoveredRows,
    proofCapsulePresent,
    proofRefPresent,
    proofNotApplicable,
    proofGapMarked,
    proofGapCapsulePresent,
    proofGapCapsuleValid,
    proofGapRefPresent,
    proofGapBackingIncomplete,
    proofGapBacking: legacyProofGapBacking(proofGapMarked, proofGapCapsulePresent, proofGapCapsuleValid, proofGapRefPresent),
    latestProofGapMarked: isProofGapMarkedRecord(latestRecord),
    latestRecordAt: recordTimestampString(latestRecord),
    proofCapsuleMissing: Math.max(0, sampled.length - proofCoveredRows - proofNotApplicable),
    rawIdKeyRows,
    rawPathLikeRows,
    policyReasonCodeRows,
    stackLikeRows,
    topLevelKeys
  };
}

function isHarnessProofCapsuleRecord(value: unknown): boolean {
  return Boolean(
    value &&
    typeof value === 'object' &&
    !Array.isArray(value) &&
    (value as Record<string, unknown>).schema === 'spark.harness_proof.v1'
  );
}

function isProofNotApplicableRecord(value: unknown): boolean {
  return hasKeyValue(value, /^(proof_status|proofStatus|proof_storage|proofStorage)$/, (entry) => {
    const normalized = String(entry || '').trim().toLowerCase();
    return normalized === 'not_execution_proof' || normalized === 'not_applicable';
  });
}

function isProofGapMarkedRecord(value: unknown): boolean {
  return hasKeyValue(value, /^(proof_status|proofStatus|proof_storage|proofStorage)$/, (entry) => {
    const normalized = String(entry || '').trim().toLowerCase();
    return normalized === 'missing_harness_proof' || normalized === 'missing_harness_authority';
  });
}

function hasValidLegacyProofGapCapsule(value: unknown): boolean {
  const capsule = firstObjectForKeys(value, PROOF_CAPSULE_KEYS);
  if (!capsule && isHarnessProofCapsuleRecord(value)) return isValidLegacyProofGapCapsule(value);
  return isValidLegacyProofGapCapsule(capsule);
}

function isValidLegacyProofGapCapsule(value: unknown): boolean {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const record = value as Record<string, unknown>;
  if (record.schema !== 'spark.harness_proof.v1') return false;
  const authority = objectField(record.authority);
  const governor = objectField(record.governor);
  return (
    normalizedString(authority.decision) === 'downgraded' &&
    normalizedString(authority.contract) === 'none' &&
    normalizedString(governor.decision) === 'not_applicable' &&
    governor.verified === false
  );
}

function recordTimestampString(value: unknown): string | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  for (const key of ['ts', 'timestamp', 'recorded_at', 'generatedAt', 'generated_at', 'createdAt', 'created_at']) {
    const candidate = record[key];
    if (typeof candidate === 'string' && candidate.trim()) return candidate.trim();
  }
  return null;
}

function legacyProofGapBacking(
  proofGapMarked: number,
  proofGapCapsulePresent: number,
  proofGapCapsuleValid: number,
  proofGapRefPresent: number
): ControlProofTracePlaneSummary['proofGapBacking'] {
  if (proofGapMarked === 0) return 'n/a';
  if (proofGapCapsuleValid === proofGapMarked && proofGapRefPresent === proofGapMarked) return 'complete';
  if (proofGapCapsulePresent === proofGapMarked && proofGapRefPresent === proofGapMarked) return 'invalid';
  if (proofGapCapsulePresent > 0 || proofGapRefPresent > 0) return 'partial';
  return 'missing';
}

function summarizeGapCounts(planes: ControlProofTracePlaneSummary[]): ControlProofGapCounts {
  return {
    missingEvidence: planes.filter((plane) => plane.missing).length,
    missingTraceJoin: planes.filter((plane) => !plane.missing && (plane.requestIdMissing > 0 || plane.traceRefMissing > 0)).length,
    missingProofCapsule: planes.filter((plane) => !plane.missing && plane.proofCapsuleMissing > 0).length,
    legacyProofGap: planes.filter((plane) => !plane.missing && plane.proofGapMarked > 0).length,
    incompleteLegacyProofGapBacking: planes.filter((plane) => !plane.missing && plane.proofGapBackingIncomplete > 0).length,
    latestProofGap: planes.filter((plane) => !plane.missing && plane.latestProofGapMarked).length,
    rawRefLeak: planes.filter((plane) => plane.rawPathLikeRows > 0 || plane.rawIdKeyRows > 0).length,
    roboticFailureReply: planes.filter((plane) => plane.policyReasonCodeRows > 0).length,
    stackLikeLeak: planes.filter((plane) => plane.stackLikeRows > 0).length
  };
}

function summarizeGapPlanes(planes: ControlProofTracePlaneSummary[]): Record<keyof ControlProofGapCounts, string[]> {
  return {
    missingEvidence: planes.filter((plane) => plane.missing).map((plane) => plane.label),
    missingTraceJoin: planes
      .filter((plane) => !plane.missing && (plane.requestIdMissing > 0 || plane.traceRefMissing > 0))
      .map((plane) => plane.label),
    missingProofCapsule: planes
      .filter((plane) => !plane.missing && plane.proofCapsuleMissing > 0)
      .map((plane) => plane.label),
    legacyProofGap: planes
      .filter((plane) => !plane.missing && plane.proofGapMarked > 0)
      .map((plane) => plane.label),
    incompleteLegacyProofGapBacking: planes
      .filter((plane) => !plane.missing && plane.proofGapBackingIncomplete > 0)
      .map((plane) => plane.label),
    latestProofGap: planes
      .filter((plane) => !plane.missing && plane.latestProofGapMarked)
      .map((plane) => plane.label),
    rawRefLeak: planes
      .filter((plane) => plane.rawPathLikeRows > 0 || plane.rawIdKeyRows > 0)
      .map((plane) => plane.label),
    roboticFailureReply: planes
      .filter((plane) => plane.policyReasonCodeRows > 0)
      .map((plane) => plane.label),
    stackLikeLeak: planes
      .filter((plane) => plane.stackLikeRows > 0)
      .map((plane) => plane.label)
  };
}

function formatGapPlaneDetails(gapPlanes: Record<keyof ControlProofGapCounts, string[]>): string[] {
  return (Object.entries(gapPlanes) as Array<[keyof ControlProofGapCounts, string[]]>)
    .filter(([, planes]) => planes.length > 0)
    .map(([key, planes]) => `- ${gapCountLabel(key)}: ${planes.join(', ')}`);
}

function gapCountLabel(key: keyof ControlProofGapCounts): string {
  return {
    missingEvidence: 'missing evidence',
    missingTraceJoin: 'missing trace joins',
    missingProofCapsule: 'missing proof capsules',
    legacyProofGap: 'legacy proof gaps',
    incompleteLegacyProofGapBacking: 'incomplete legacy gap backing',
    latestProofGap: 'latest proof gaps',
    rawRefLeak: 'raw ref leaks',
    roboticFailureReply: 'robotic failure reasons',
    stackLikeLeak: 'stack-like leaks'
  }[key];
}

function releaseBlockingGapCounts(gapCounts: ControlProofGapCounts): number[] {
  return [
    gapCounts.missingEvidence,
    gapCounts.missingTraceJoin,
    gapCounts.missingProofCapsule,
    gapCounts.incompleteLegacyProofGapBacking,
    gapCounts.rawRefLeak,
    gapCounts.roboticFailureReply,
    gapCounts.stackLikeLeak
  ];
}

function emptySummary(file: ControlProofEvidenceFile, missing: boolean): ControlProofTracePlaneSummary {
  return {
    label: file.label,
    filePath: file.filePath,
    missing,
    totalRows: 0,
    sampledRows: 0,
    parseErrors: 0,
    requestIdPresent: 0,
    requestIdMissing: 0,
    traceRefPresent: 0,
    traceRefMissing: 0,
    proofCoveragePresent: 0,
    proofCapsulePresent: 0,
    proofRefPresent: 0,
    proofNotApplicable: 0,
    proofGapMarked: 0,
    proofGapCapsulePresent: 0,
    proofGapCapsuleValid: 0,
    proofGapRefPresent: 0,
    proofGapBackingIncomplete: 0,
    proofGapBacking: 'n/a',
    latestProofGapMarked: false,
    latestRecordAt: null,
    proofCapsuleMissing: 0,
    rawIdKeyRows: 0,
    rawPathLikeRows: 0,
    policyReasonCodeRows: 0,
    stackLikeRows: 0,
    topLevelKeys: []
  };
}

function hasAnyKey(value: unknown, keys: string[]): boolean {
  const wanted = new Set(keys);
  return walkObjects(value, (entryKey) => wanted.has(entryKey));
}

function hasKeyPattern(value: unknown, pattern: RegExp): boolean {
  return walkObjects(value, (entryKey) => pattern.test(entryKey));
}

function hasKeyValue(value: unknown, keyPattern: RegExp, predicate: (value: unknown) => boolean): boolean {
  const queue: unknown[] = [value];
  while (queue.length > 0) {
    const current = queue.shift();
    if (!current || typeof current !== 'object') continue;
    if (Array.isArray(current)) {
      queue.push(...current);
      continue;
    }
    for (const [key, child] of Object.entries(current as Record<string, unknown>)) {
      if (keyPattern.test(key) && predicate(child)) return true;
      if (child && typeof child === 'object') queue.push(child);
    }
  }
  return false;
}

function firstObjectForKeys(value: unknown, keys: string[]): Record<string, unknown> | null {
  const wanted = new Set(keys);
  const queue: unknown[] = [value];
  while (queue.length > 0) {
    const current = queue.shift();
    if (!current || typeof current !== 'object') continue;
    if (Array.isArray(current)) {
      queue.push(...current);
      continue;
    }
    for (const [key, child] of Object.entries(current as Record<string, unknown>)) {
      if (wanted.has(key) && child && typeof child === 'object' && !Array.isArray(child)) {
        return child as Record<string, unknown>;
      }
      if (child && typeof child === 'object') queue.push(child);
    }
  }
  return null;
}

function walkObjects(value: unknown, predicate: (key: string) => boolean): boolean {
  const queue: unknown[] = [value];
  while (queue.length > 0) {
    const current = queue.shift();
    if (!current || typeof current !== 'object') continue;
    if (Array.isArray(current)) {
      queue.push(...current);
      continue;
    }
    for (const [key, child] of Object.entries(current as Record<string, unknown>)) {
      if (predicate(key)) return true;
      if (child && typeof child === 'object') queue.push(child);
    }
  }
  return false;
}

function objectField(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function normalizedString(value: unknown): string {
  return typeof value === 'string' ? value.trim().toLowerCase() : '';
}

function topLevelKeysFor(value: unknown): string[] {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return [];
  return Object.keys(value as Record<string, unknown>).slice(0, 12);
}

function safeStringify(value: unknown): string {
  try {
    return JSON.stringify(value) || '';
  } catch {
    return '';
  }
}

function redactPath(value: string): string {
  const home = os.homedir();
  return value.replace(home, '<home>');
}
