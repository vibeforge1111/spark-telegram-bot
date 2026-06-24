import * as fs from 'node:fs';
import {
  defaultControlProofEvidenceFiles,
  defaultSparkHome,
  type ControlProofEvidenceFile
} from './controlProofTraceAudit';
import {
  summarizeHarnessProofCapsule,
  validateHarnessProofCapsuleV1,
  type HarnessProofCapsuleV1
} from './harnessProofCapsule';

export interface HarnessProofProjectionOptions {
  sparkHome?: string;
  proofRef?: string;
  evidenceFiles?: ControlProofEvidenceFile[];
}

export type HarnessProofEvidenceJoinStatus = 'joined' | 'missing';

export interface HarnessProofEvidenceJoin {
  plane: string;
  displayName: string;
  status: HarnessProofEvidenceJoinStatus;
}

export interface HarnessProofProjection {
  ok: boolean;
  generatedAt: string;
  requestedRef: string | null;
  foundRef: string | null;
  plane: string | null;
  panel: string;
  evidenceJoins?: HarnessProofEvidenceJoin[];
  capsule?: HarnessProofCapsuleV1;
}

const PROOF_CAPSULE_KEYS = ['proof_capsule', 'proofCapsule', 'harness_proof', 'harnessProof'];
const PROOF_REF_KEYS = ['harness_proof_ref', 'harnessProofRef'];
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

export function projectHarnessProof(options: HarnessProofProjectionOptions = {}): HarnessProofProjection {
  const sparkHome = options.sparkHome || defaultSparkHome();
  const evidenceFiles = options.evidenceFiles || defaultControlProofEvidenceFiles(sparkHome);
  const requestedRef = cleanRef(options.proofRef);
  const match = findHarnessProofCapsule(evidenceFiles, requestedRef);
  if (!match) {
    const panel = [
      'Harness Proof',
      requestedRef ? `Proof ref: ${requestedRef}` : 'Proof ref: latest',
      'Status: not found',
      'Gaps: proof capsule missing from sampled evidence'
    ].join('\n');
    return {
      ok: false,
      generatedAt: new Date().toISOString(),
      requestedRef,
      foundRef: null,
      plane: null,
      panel
    };
  }
  const evidenceJoins = summarizeEvidenceJoins(evidenceFiles, match.capsule.turnRef);
  const panel = [
    summarizeHarnessProofCapsule(match.capsule),
    `Proof ref: ${match.capsule.turnRef}`,
    `Plane: ${match.plane}`,
    renderEvidenceJoinSummary(evidenceJoins)
  ].join('\n');
  return {
    ok: true,
    generatedAt: new Date().toISOString(),
    requestedRef,
    foundRef: match.capsule.turnRef,
    plane: match.plane,
    panel,
    evidenceJoins,
    capsule: match.capsule
  };
}

function findHarnessProofCapsule(
  evidenceFiles: ControlProofEvidenceFile[],
  requestedRef: string | null
): { plane: string; capsule: HarnessProofCapsuleV1 } | null {
  for (const file of evidenceFiles) {
    const records = readEvidenceRecordsNewestFirst(file);
    for (const record of records) {
      const capsule = extractHarnessProofCapsule(record);
      if (!capsule) continue;
      if (requestedRef && !recordMatchesProofRef(capsule, requestedRef)) continue;
      return {
        plane: file.label,
        capsule
      };
    }
  }
  return null;
}

function summarizeEvidenceJoins(
  evidenceFiles: ControlProofEvidenceFile[],
  proofRef: string
): HarnessProofEvidenceJoin[] {
  return evidenceFiles.map((file) => {
    const records = readEvidenceRecordsNewestFirst(file);
    const status = records.some((record) => recordContainsProofRef(record, proofRef)) ? 'joined' : 'missing';
    return {
      plane: file.label,
      displayName: EVIDENCE_PLANE_DISPLAY_NAMES[file.label] || file.label,
      status
    };
  });
}

function renderEvidenceJoinSummary(joins: HarnessProofEvidenceJoin[]): string {
  const visibleJoins = joins.filter((join) => PANEL_EVIDENCE_PLANES.has(join.plane) || join.status === 'joined');
  const joined = visibleJoins.filter((join) => join.status === 'joined').map((join) => join.displayName);
  const missing = visibleJoins.filter((join) => join.status === 'missing').map((join) => join.displayName);
  return [
    `Evidence joined: ${joined.length ? joined.join(', ') : 'none'}`,
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
  const capsule = extractHarnessProofCapsule(record);
  if (capsule?.turnRef === requestedRef) return true;
  return recordHasProofRefKey(record, requestedRef);
}

function recordHasProofRefKey(record: unknown, requestedRef: string): boolean {
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
      if (PROOF_REF_KEYS.includes(key) && value === requestedRef) return true;
      if (value && typeof value === 'object') queue.push(value);
    }
  }
  return false;
}

function cleanRef(value: string | null | undefined): string | null {
  const ref = String(value || '').trim();
  return ref || null;
}
