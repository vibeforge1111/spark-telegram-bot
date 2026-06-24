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

export interface HarnessProofProjection {
  ok: boolean;
  generatedAt: string;
  requestedRef: string | null;
  foundRef: string | null;
  plane: string | null;
  panel: string;
  capsule?: HarnessProofCapsuleV1;
}

const PROOF_CAPSULE_KEYS = ['proof_capsule', 'proofCapsule', 'harness_proof', 'harnessProof'];
const PROOF_REF_KEYS = ['harness_proof_ref', 'harnessProofRef'];

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
  const panel = [
    summarizeHarnessProofCapsule(match.capsule),
    `Proof ref: ${match.capsule.turnRef}`,
    `Plane: ${match.plane}`
  ].join('\n');
  return {
    ok: true,
    generatedAt: new Date().toISOString(),
    requestedRef,
    foundRef: match.capsule.turnRef,
    plane: match.plane,
    panel,
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
      if (requestedRef && !recordMatchesProofRef(record, capsule, requestedRef)) continue;
      return {
        plane: file.label,
        capsule
      };
    }
  }
  return null;
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

function recordMatchesProofRef(record: unknown, capsule: HarnessProofCapsuleV1, requestedRef: string): boolean {
  if (capsule.turnRef === requestedRef) return true;
  if (!record || typeof record !== 'object' || Array.isArray(record)) return false;
  const obj = record as Record<string, unknown>;
  return PROOF_REF_KEYS.some((key) => obj[key] === requestedRef);
}

function cleanRef(value: string | null | undefined): string | null {
  const ref = String(value || '').trim();
  return ref || null;
}
