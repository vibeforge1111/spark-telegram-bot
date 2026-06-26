import * as fs from 'node:fs';
import {
  auditControlProofTraceContinuity,
  defaultControlProofEvidenceFiles,
  defaultSparkHome,
  type ControlProofEvidenceFile
} from './controlProofTraceAudit';
import {
  redactedProofRef,
  summarizeHarnessProofCapsule,
  validateHarnessProofCapsuleV1,
  type HarnessProofCapsuleV1
} from './harnessProofCapsule';

export interface HarnessProofProjectionOptions {
  sparkHome?: string;
  proofRef?: string;
  traceRef?: string;
  evidenceFiles?: ControlProofEvidenceFile[];
}

export type HarnessProofEvidenceJoinStatus = 'joined' | 'missing' | 'proof_gap' | 'non_execution';

export interface HarnessProofEvidenceJoin {
  plane: string;
  displayName: string;
  status: HarnessProofEvidenceJoinStatus;
  proofRefJoined: boolean;
  proofCapsuleJoined: boolean;
  traceJoined: boolean;
}

export interface HarnessProofProjection {
  ok: boolean;
  generatedAt: string;
  requestedRef: string | null;
  requestedTraceRef: string | null;
  foundRef: string | null;
  plane: string | null;
  panel: string;
  evidenceJoins?: HarnessProofEvidenceJoin[];
  audit?: HarnessProofAuditSummary;
  capsule?: HarnessProofCapsuleV1;
}

export interface HarnessProofAuditSummary {
  actionableStatus: 'clean' | 'non-blocking gaps visible' | 'repair required';
  blockingOk: boolean;
  freshStrictOk: boolean;
  gapPosture: string;
  legacyProofGapPlanes: number;
  legacyProofGapPlaneLabels: string[];
  latestProofGapPlanes: number;
  latestProofGapPlaneLabels: string[];
  missingEvidencePlanes: number;
  missingEvidencePlaneLabels: string[];
  missingTraceJoinPlanes: number;
  missingTraceJoinPlaneLabels: string[];
  missingProofCapsulePlanes: number;
  missingProofCapsulePlaneLabels: string[];
  incompleteLegacyGapBackingPlanes: number;
  incompleteLegacyGapBackingPlaneLabels: string[];
  rawRefLeakPlanes: number;
  rawRefLeakPlaneLabels: string[];
  roboticFailureReplyPlanes: number;
  roboticFailureReplyPlaneLabels: string[];
  stackLikeLeakPlanes: number;
  stackLikeLeakPlaneLabels: string[];
}

const PROOF_CAPSULE_KEYS = ['proof_capsule', 'proofCapsule', 'harness_proof', 'harnessProof'];
const PROOF_REF_KEYS = ['harness_proof_ref', 'harnessProofRef'];
const TRACE_REF_KEYS = ['trace_ref', 'traceRef', 'trace_id', 'traceId'];
const PANEL_EVIDENCE_PLANES = new Set([
  'telegram_final_answer',
  'telegram_outbound',
  'telegram_route_confidence',
  'builder_gateway',
  'spawner_prd_trace'
]);
const EVIDENCE_PLANE_DISPLAY_NAMES: Record<string, string> = {
  telegram_final_answer: 'Telegram final',
  telegram_outbound: 'Telegram outbound',
  telegram_route_confidence: 'Route confidence',
  builder_gateway: 'Builder gateway',
  spawner_prd_trace: 'Spawner trace',
  system_trace_index: 'System trace index',
  memory_movement_index: 'Memory movement',
  voice_surface_view: 'Voice surface',
  voice_runtime_state: 'Voice runtime'
};

function displayNameForEvidencePlane(plane: string): string {
  return EVIDENCE_PLANE_DISPLAY_NAMES[plane] || plane;
}

export function projectHarnessProof(options: HarnessProofProjectionOptions = {}): HarnessProofProjection {
  const sparkHome = options.sparkHome || defaultSparkHome();
  const evidenceFiles = options.evidenceFiles || defaultControlProofEvidenceFiles(sparkHome);
  const requestedRef = cleanRef(options.proofRef);
  const requestedTraceRef = cleanRef(options.traceRef);
  const audit = summarizeCurrentAudit(sparkHome, evidenceFiles);
  const match = findHarnessProofCapsule(evidenceFiles, requestedRef, requestedTraceRef);
  if (!match) {
    const evidenceJoins = requestedRef || requestedTraceRef
      ? summarizeEvidenceJoins(evidenceFiles, requestedRef || null, requestedTraceRef || null)
      : [];
    const hasJoinedEvidence = evidenceJoins.some((join) => join.status === 'joined' || join.status === 'proof_gap' || join.status === 'non_execution');
    const hasOnlyNonExecutionEvidence = hasJoinedEvidence && evidenceJoins.every((join) => join.status === 'missing' || join.status === 'non_execution');
    const panel = [
      'Harness Proof',
      requestedRef ? `Proof ref: ${displayRef('turn', requestedRef)}` : 'Proof ref: latest',
      ...(requestedTraceRef ? [`Trace ref: ${displayRef('trace', requestedTraceRef)}`] : []),
      hasOnlyNonExecutionEvidence ? 'Status: non-execution evidence only' : hasJoinedEvidence ? 'Status: proof capsule missing' : 'Status: not found',
      hasOnlyNonExecutionEvidence ? 'Gaps: no execution proof capsule expected from non-execution evidence' : 'Gaps: proof capsule missing from sampled evidence',
      ...(hasJoinedEvidence ? [renderEvidenceJoinSummary(evidenceJoins)] : []),
      renderAuditSummary(audit)
    ].join('\n');
    return {
      ok: false,
      generatedAt: new Date().toISOString(),
      requestedRef,
      requestedTraceRef,
      foundRef: null,
      plane: null,
      panel,
      audit,
      ...(hasJoinedEvidence ? { evidenceJoins } : {})
    };
  }
  const evidenceJoins = summarizeEvidenceJoins(evidenceFiles, match.capsule.turnRef, requestedTraceRef || match.traceRef || null);
  const panel = [
    summarizeHarnessProofCapsule(match.capsule),
    `Proof ref: ${match.capsule.turnRef}`,
    ...(requestedTraceRef ? [`Trace ref: ${displayRef('trace', requestedTraceRef)}`] : []),
    `Plane: ${match.plane}`,
    renderEvidenceJoinSummary(evidenceJoins),
    renderAuditSummary(audit)
  ].join('\n');
  return {
    ok: true,
    generatedAt: new Date().toISOString(),
    requestedRef,
    requestedTraceRef,
    foundRef: match.capsule.turnRef,
    plane: match.plane,
    panel,
    evidenceJoins,
    audit,
    capsule: match.capsule
  };
}

function summarizeCurrentAudit(
  sparkHome: string,
  evidenceFiles: ControlProofEvidenceFile[]
): HarnessProofAuditSummary {
  const result = auditControlProofTraceContinuity({ sparkHome, evidenceFiles });
  return {
    actionableStatus: result.freshStrictOk
      ? 'clean'
      : result.blockingOk
        ? 'non-blocking gaps visible'
        : 'repair required',
    blockingOk: result.blockingOk,
    freshStrictOk: result.freshStrictOk,
    gapPosture: result.gapPosture,
    legacyProofGapPlanes: result.gapCounts.legacyProofGap,
    legacyProofGapPlaneLabels: result.gapPlanes.legacyProofGap.map(displayNameForEvidencePlane),
    latestProofGapPlanes: result.planes.filter((plane) => !plane.missing && plane.latestProofGapMarked).length,
    latestProofGapPlaneLabels: result.planes
      .filter((plane) => !plane.missing && plane.latestProofGapMarked)
      .map((plane) => displayNameForEvidencePlane(plane.label)),
    missingEvidencePlanes: result.gapCounts.missingEvidence,
    missingEvidencePlaneLabels: result.gapPlanes.missingEvidence.map(displayNameForEvidencePlane),
    missingTraceJoinPlanes: result.gapCounts.missingTraceJoin,
    missingTraceJoinPlaneLabels: result.gapPlanes.missingTraceJoin.map(displayNameForEvidencePlane),
    missingProofCapsulePlanes: result.gapCounts.missingProofCapsule,
    missingProofCapsulePlaneLabels: result.gapPlanes.missingProofCapsule.map(displayNameForEvidencePlane),
    incompleteLegacyGapBackingPlanes: result.gapCounts.incompleteLegacyProofGapBacking,
    incompleteLegacyGapBackingPlaneLabels: result.gapPlanes.incompleteLegacyProofGapBacking.map(displayNameForEvidencePlane),
    rawRefLeakPlanes: result.gapCounts.rawRefLeak,
    rawRefLeakPlaneLabels: result.gapPlanes.rawRefLeak.map(displayNameForEvidencePlane),
    roboticFailureReplyPlanes: result.gapCounts.roboticFailureReply,
    roboticFailureReplyPlaneLabels: result.gapPlanes.roboticFailureReply.map(displayNameForEvidencePlane),
    stackLikeLeakPlanes: result.gapCounts.stackLikeLeak,
    stackLikeLeakPlaneLabels: result.gapPlanes.stackLikeLeak.map(displayNameForEvidencePlane)
  };
}

function renderAuditSummary(audit: HarnessProofAuditSummary): string {
  const legacyGapDetail = audit.legacyProofGapPlaneLabels.length > 0
    ? ` (${audit.legacyProofGapPlaneLabels.join(', ')})`
    : '';
  const latestGapDetail = audit.latestProofGapPlaneLabels.length > 0
    ? audit.latestProofGapPlaneLabels.join(', ')
    : 'none';
  const blockingGapDetails = [
    blockingGapDetail('missing evidence', audit.missingEvidencePlaneLabels),
    blockingGapDetail('missing trace joins', audit.missingTraceJoinPlaneLabels),
    blockingGapDetail('missing proof capsules', audit.missingProofCapsulePlaneLabels),
    blockingGapDetail('incomplete legacy gap backing', audit.incompleteLegacyGapBackingPlaneLabels),
    blockingGapDetail('raw ref leaks', audit.rawRefLeakPlaneLabels),
    blockingGapDetail('robotic failure reasons', audit.roboticFailureReplyPlaneLabels),
    blockingGapDetail('stack-like leaks', audit.stackLikeLeakPlaneLabels)
  ].filter(Boolean);
  return [
    `Audit actionable: ${audit.actionableStatus}`,
    `Audit blocking: ${audit.blockingOk ? 'clean' : 'gaps found'}`,
    `Audit fresh-strict: ${audit.freshStrictOk ? 'clean' : 'not ready'}`,
    `Audit posture: ${audit.gapPosture}`,
    `Blocking gap planes: ${blockingGapDetails.length ? blockingGapDetails.join('; ') : 'none'}`,
    `Legacy proof gaps visible: ${audit.legacyProofGapPlanes}${legacyGapDetail}`,
    `Latest proof gaps: ${latestGapDetail}`
  ].join('\n');
}

function blockingGapDetail(label: string, planes: string[]): string {
  return planes.length > 0 ? `${label}: ${planes.join(', ')}` : '';
}

function findHarnessProofCapsule(
  evidenceFiles: ControlProofEvidenceFile[],
  requestedRef: string | null,
  requestedTraceRef: string | null
): { plane: string; capsule: HarnessProofCapsuleV1; traceRef?: string | null } | null {
  if (!requestedRef && !requestedTraceRef) {
    return findLatestHarnessProofCapsule(evidenceFiles);
  }
  for (const file of evidenceFiles) {
    const records = readEvidenceRecordsNewestFirst(file);
    for (const record of records) {
      const capsule = extractHarnessProofCapsule(record);
      if (!capsule) continue;
      if (requestedRef && !recordMatchesProofRef(capsule, requestedRef)) continue;
      if (!requestedRef && requestedTraceRef && !recordContainsTraceRef(record, requestedTraceRef)) continue;
      return {
        plane: file.label,
        capsule,
        traceRef: requestedTraceRef
      };
    }
  }
  return null;
}

function findLatestHarnessProofCapsule(
  evidenceFiles: ControlProofEvidenceFile[]
): { plane: string; capsule: HarnessProofCapsuleV1; traceRef?: string | null } | null {
  const latestOutbound = findLatestHarnessProofCapsuleInPlane(evidenceFiles, 'telegram_outbound');
  if (latestOutbound) return latestOutbound;
  let best: { plane: string; capsule: HarnessProofCapsuleV1; traceRef?: string | null; sortMs: number; order: number } | null = null;
  let order = 0;
  for (const file of evidenceFiles) {
    const records = readEvidenceRecordsNewestFirst(file);
    for (const record of records) {
      const capsule = extractHarnessProofCapsule(record);
      if (!capsule) {
        order += 1;
        continue;
      }
      const sortMs = recordTimestampMs(record) ?? 0;
      if (!best || sortMs > best.sortMs || (sortMs === best.sortMs && order < best.order)) {
        best = { plane: file.label, capsule, traceRef: null, sortMs, order };
      }
      order += 1;
    }
  }
  return best ? { plane: best.plane, capsule: best.capsule, traceRef: best.traceRef } : null;
}

function findLatestHarnessProofCapsuleInPlane(
  evidenceFiles: ControlProofEvidenceFile[],
  plane: string
): { plane: string; capsule: HarnessProofCapsuleV1; traceRef?: string | null } | null {
  const file = evidenceFiles.find((candidate) => candidate.label === plane);
  if (!file) return null;
  const records = readEvidenceRecordsNewestFirst(file);
  for (const record of records) {
    const capsule = extractHarnessProofCapsule(record);
    if (capsule) return { plane: file.label, capsule, traceRef: null };
  }
  return null;
}

function recordTimestampMs(record: unknown): number | null {
  if (!record || typeof record !== 'object' || Array.isArray(record)) return null;
  const obj = record as Record<string, unknown>;
  for (const key of ['ts', 'timestamp', 'generatedAt', 'generated_at']) {
    const value = obj[key];
    if (typeof value !== 'string' || !value.trim()) continue;
    const parsed = Date.parse(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
}

function summarizeEvidenceJoins(
  evidenceFiles: ControlProofEvidenceFile[],
  proofRef: string | null,
  traceRef: string | null = null
): HarnessProofEvidenceJoin[] {
  return evidenceFiles.map((file) => {
    const records = readEvidenceRecordsNewestFirst(file);
    const proofRefJoined = proofRef ? records.some((record) => recordHasProofRefKey(record, proofRef)) : false;
    const proofCapsuleJoined = proofRef ? records.some((record) => recordContainsProofCapsuleRef(record, proofRef)) : false;
    const proofJoined = proofRefJoined || proofCapsuleJoined;
    const traceRecords = traceRef ? records.filter((record) => recordContainsTraceRef(record, traceRef)) : [];
    const traceJoined = traceRecords.length > 0;
    const proofGap = traceRecords.some(isProofGapMarkedRecord);
    const nonExecution = traceRecords.some(isProofNotApplicableRecord);
    const status: HarnessProofEvidenceJoinStatus = proofJoined
      ? 'joined'
      : proofGap
        ? 'proof_gap'
        : traceJoined && nonExecution
          ? 'non_execution'
          : traceJoined
            ? 'joined'
            : 'missing';
    return {
      plane: file.label,
      displayName: EVIDENCE_PLANE_DISPLAY_NAMES[file.label] || file.label,
      status,
      proofRefJoined,
      proofCapsuleJoined,
      traceJoined
    };
  });
}

function renderEvidenceJoinSummary(joins: HarnessProofEvidenceJoin[]): string {
  const visibleJoins = joins.filter((join) => PANEL_EVIDENCE_PLANES.has(join.plane) || join.status === 'joined' || join.status === 'non_execution');
  const joined = visibleJoins
    .filter((join) => join.status === 'joined' && (join.proofRefJoined || join.proofCapsuleJoined))
    .map((join) => join.displayName);
  const proofRefs = visibleJoins.filter((join) => join.proofRefJoined).map((join) => join.displayName);
  const proofCapsules = visibleJoins.filter((join) => join.proofCapsuleJoined).map((join) => join.displayName);
  const traceOnly = visibleJoins
    .filter((join) => join.status === 'joined' && join.traceJoined && !join.proofRefJoined && !join.proofCapsuleJoined)
    .map((join) => join.displayName);
  const proofGaps = visibleJoins.filter((join) => join.status === 'proof_gap').map((join) => join.displayName);
  const nonExecution = visibleJoins.filter((join) => join.status === 'non_execution').map((join) => join.displayName);
  const missing = visibleJoins.filter((join) => join.status === 'missing').map((join) => join.displayName);
  return [
    `Evidence joined: ${joined.length ? joined.join(', ') : 'none'}`,
    `Evidence proof refs: ${proofRefs.length ? proofRefs.join(', ') : 'none'}`,
    `Evidence proof capsules: ${proofCapsules.length ? proofCapsules.join(', ') : 'none'}`,
    `Evidence trace-only: ${traceOnly.length ? traceOnly.join(', ') : 'none'}`,
    `Evidence proof gaps: ${proofGaps.length ? proofGaps.join(', ') : 'none'}`,
    `Evidence non-execution: ${nonExecution.length ? nonExecution.join(', ') : 'none'}`,
    `Evidence missing: ${missing.length ? missing.join(', ') : 'none'}`
  ].join('\n');
}

function readEvidenceRecordsNewestFirst(file: ControlProofEvidenceFile): unknown[] {
  if (!fs.existsSync(file.filePath)) return [];
  try {
    const content = fs.readFileSync(file.filePath, 'utf8');
    if (file.kind === 'jsonl') {
      return content
        .split(/\r?\n/)
        .filter(Boolean)
        .map((line) => {
          try {
            return JSON.parse(line) as unknown;
          } catch {
            return null;
          }
        })
        .filter((record): record is unknown => record !== null)
        .reverse();
    }
    const parsed = JSON.parse(content);
    return (Array.isArray(parsed) ? parsed : [parsed]).reverse();
  } catch {
    return [];
  }
}

function extractHarnessProofCapsule(record: unknown): HarnessProofCapsuleV1 | null {
  if (validateHarnessProofCapsuleV1(record)) return record;
  if (!record || typeof record !== 'object' || Array.isArray(record)) return null;
  const obj = record as Record<string, unknown>;
  for (const key of PROOF_CAPSULE_KEYS) {
    const value = obj[key];
    if (validateHarnessProofCapsuleV1(value)) return value;
  }
  return null;
}

function recordMatchesProofRef(capsule: HarnessProofCapsuleV1, requestedRef: string): boolean {
  return capsule.turnRef === requestedRef;
}

function recordContainsProofRef(record: unknown, requestedRef: string): boolean {
  return recordContainsProofCapsuleRef(record, requestedRef) || recordHasProofRefKey(record, requestedRef);
}

function recordContainsProofCapsuleRef(record: unknown, requestedRef: string): boolean {
  const capsule = extractHarnessProofCapsule(record);
  if (capsule?.turnRef === requestedRef) return true;
  return false;
}

function recordContainsTraceRef(record: unknown, requestedRef: string): boolean {
  return recordHasKeyValue(record, TRACE_REF_KEYS, requestedRef);
}

function recordHasProofRefKey(record: unknown, requestedRef: string): boolean {
  return recordHasKeyValue(record, PROOF_REF_KEYS, requestedRef);
}

function recordHasKeyValue(record: unknown, keys: string[], requestedRef: string): boolean {
  const queue: unknown[] = [record];
  while (queue.length > 0) {
    const current = queue.shift();
    if (!current || typeof current !== 'object') continue;
    if (Array.isArray(current)) {
      queue.push(...current);
      continue;
    }
    const obj = current as Record<string, unknown>;
    for (const [key, value] of Object.entries(obj)) {
      if (keys.includes(key) && value === requestedRef) return true;
      if (value && typeof value === 'object') queue.push(value);
    }
  }
  return false;
}

function isProofGapMarkedRecord(record: unknown): boolean {
  return recordHasProofGapKey(record, /^(proof_status|proofStatus|proof_storage|proofStorage)$/);
}

function isProofNotApplicableRecord(record: unknown): boolean {
  return recordHasProofNotApplicableKey(record, /^(proof_status|proofStatus|proof_storage|proofStorage)$/);
}

function recordHasProofGapKey(record: unknown, keyPattern: RegExp): boolean {
  const queue: unknown[] = [record];
  while (queue.length > 0) {
    const current = queue.shift();
    if (!current || typeof current !== 'object') continue;
    if (Array.isArray(current)) {
      queue.push(...current);
      continue;
    }
    for (const [key, value] of Object.entries(current as Record<string, unknown>)) {
      const normalized = String(value || '').trim().toLowerCase();
      if (
        keyPattern.test(key) &&
        (normalized === 'missing_harness_proof' || normalized === 'missing_harness_authority')
      ) {
        return true;
      }
      if (value && typeof value === 'object') queue.push(value);
    }
  }
  return false;
}

function recordHasProofNotApplicableKey(record: unknown, keyPattern: RegExp): boolean {
  const queue: unknown[] = [record];
  while (queue.length > 0) {
    const current = queue.shift();
    if (!current || typeof current !== 'object') continue;
    if (Array.isArray(current)) {
      queue.push(...current);
      continue;
    }
    for (const [key, value] of Object.entries(current as Record<string, unknown>)) {
      const normalized = String(value || '').trim().toLowerCase();
      if (
        keyPattern.test(key) &&
        (normalized === 'not_execution_proof' || normalized === 'not_applicable')
      ) {
        return true;
      }
      if (value && typeof value === 'object') queue.push(value);
    }
  }
  return false;
}

function cleanRef(value: string | null | undefined): string | null {
  const ref = String(value || '').trim();
  return ref || null;
}

function displayRef(label: 'turn' | 'trace', value: string): string {
  const ref = cleanRef(value);
  if (!ref) return 'latest';
  if (new RegExp(`^${label}:sha256:[a-f0-9]{16}$`).test(ref)) return ref;
  return redactedProofRef(label, ref);
}
