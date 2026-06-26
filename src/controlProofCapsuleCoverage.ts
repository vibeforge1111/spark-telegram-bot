import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { buildTelegramLegacyAuthorityInventory } from './legacyAuthorityInventory';
import type { LegacyAuthorityPlaneV1, LegacyAuthorityRisk } from '@spark/harness-core';

export type ProofCapsulePathKind = 'direct_capsule' | 'joined_capsule' | 'explicit_no_action';

export interface ProofCapsuleCoveragePolicy {
  planeId: string;
  proofPath: {
    kind: ProofCapsulePathKind;
    summary: string;
  };
  requiredSourceMarkers: string[];
}

export interface ProofCapsuleCoverageGap {
  planeId: string;
  reason: 'missing_policy' | 'extra_policy' | 'ambiguous_policy' | 'missing_source' | 'missing_marker';
  detail: string;
}

export interface ProofCapsuleCoverageResult {
  ok: boolean;
  checkedPlanes: number;
  policyCount: number;
  gaps: ProofCapsuleCoverageGap[];
}

export const ACTION_PROOF_CAPSULE_POLICIES: ProofCapsuleCoveragePolicy[] = [
  {
    planeId: 'legacy-plane:telegram-turn-intent-v1-envelope',
    proofPath: {
      kind: 'joined_capsule',
      summary: 'TurnIntent V1 is route evidence; downstream Telegram delivery proof creates the single user-visible capsule.'
    },
    requiredSourceMarkers: ['buildTelegramTurnIntentEnvelope', 'authorizeToolCallFromEnvelope']
  },
  {
    planeId: 'legacy-plane:telegram-action-authority',
    proofPath: {
      kind: 'explicit_no_action',
      summary: 'Action authority records a Harness Core ledger for allowed and blocked decisions before owner execution.'
    },
    requiredSourceMarkers: ['recordHarnessCoreAuthorizationLedger', 'createHarnessCoreGovernorDecision']
  },
  {
    planeId: 'legacy-plane:telegram-command-authority',
    proofPath: {
      kind: 'joined_capsule',
      summary: 'Slash commands convert into the same Telegram action authority path and inherit its ledger/proof chain.'
    },
    requiredSourceMarkers: ['buildTelegramCommandActionEnvelope', 'authorizeTelegramActionFromEnvelope']
  },
  {
    planeId: 'legacy-plane:telegram-media-authority',
    proofPath: {
      kind: 'joined_capsule',
      summary: 'Media inputs convert into Telegram action authority, then Builder/Telegram delivery emits the capsule.'
    },
    requiredSourceMarkers: ['buildTelegramMediaActionEnvelope', 'authorizeTelegramActionFromEnvelope']
  },
  {
    planeId: 'legacy-plane:telegram-index-natural-dispatch',
    proofPath: {
      kind: 'direct_capsule',
      summary: 'Top-level dispatch records Harness Core execution ledgers and attaches Telegram delivery proof capsules.'
    },
    requiredSourceMarkers: ['recordTelegramHarnessCoreExecution', 'buildTelegramDeliveryProofCapsule']
  },
  {
    planeId: 'legacy-plane:telegram-spawner-creator-bridge',
    proofPath: {
      kind: 'joined_capsule',
      summary: 'Spawner and creator bridge calls preserve Governor executionAuthority for downstream mission proof.'
    },
    requiredSourceMarkers: ['executionAuthority', 'createHarnessCoreAuthorizedGovernorDecision']
  },
  {
    planeId: 'legacy-plane:telegram-builder-bridge',
    proofPath: {
      kind: 'joined_capsule',
      summary: 'Builder bridge responses are joined back to Telegram delivery proof rather than minting a second capsule.'
    },
    requiredSourceMarkers: ['source_ledger', 'metadata']
  },
  {
    planeId: 'legacy-plane:telegram-memory-wiki-bridge',
    proofPath: {
      kind: 'direct_capsule',
      summary: 'Memory and wiki mutations go through top-level Telegram authority and delivery proof capsules.'
    },
    requiredSourceMarkers: ['recordTelegramHarnessCoreExecution', 'memory.write']
  },
  {
    planeId: 'legacy-plane:telegram-schedule-access-operator',
    proofPath: {
      kind: 'direct_capsule',
      summary: 'Schedule, access, and operator branches record Harness Core execution and reply proof at dispatch.'
    },
    requiredSourceMarkers: ['recordTelegramHarnessCoreExecution', 'schedule']
  },
  {
    planeId: 'legacy-plane:telegram-recursive-sparkqa-startup',
    proofPath: {
      kind: 'direct_capsule',
      summary: 'Recursive, Spark QA, startup, and self-improvement routes record execution ledgers before replies.'
    },
    requiredSourceMarkers: ['recordTelegramHarnessCoreExecution', 'recursive']
  },
  {
    planeId: 'legacy-plane:telegram-pending-state-followups',
    proofPath: {
      kind: 'explicit_no_action',
      summary: 'Pending state is evidence only until a fresh branch authority creates a new authorized action envelope.'
    },
    requiredSourceMarkers: ['telegramBranchActionAuthorityDecision', 'pending']
  }
];

function hasHighAgencyRisk(risk: LegacyAuthorityRisk): boolean {
  return Object.values(risk).some(Boolean);
}

function actionCapablePlanes(planes: LegacyAuthorityPlaneV1[]): LegacyAuthorityPlaneV1[] {
  return planes.filter((plane) => hasHighAgencyRisk(plane.authority_risk));
}

function policyForPlane(policies: ProofCapsuleCoveragePolicy[], planeId: string): ProofCapsuleCoveragePolicy[] {
  return policies.filter((policy) => policy.planeId === planeId);
}

function readPlaneSource(repoRoot: string, plane: LegacyAuthorityPlaneV1): string | null {
  const sourcePath = plane.source_ref.path_or_uri;
  if (!sourcePath || /^https?:\/\//i.test(sourcePath)) return null;
  const fullPath = path.join(repoRoot, sourcePath);
  if (!existsSync(fullPath)) return null;
  return readFileSync(fullPath, 'utf-8');
}

export function checkProofCapsuleCoverage(input: {
  repoRoot?: string;
  policies?: ProofCapsuleCoveragePolicy[];
} = {}): ProofCapsuleCoverageResult {
  const repoRoot = input.repoRoot || process.cwd();
  const policies = input.policies || ACTION_PROOF_CAPSULE_POLICIES;
  const inventory = buildTelegramLegacyAuthorityInventory();
  const planes = actionCapablePlanes(inventory.planes);
  const planeIds = new Set(planes.map((plane) => plane.plane_id));
  const gaps: ProofCapsuleCoverageGap[] = [];

  for (const plane of planes) {
    const matches = policyForPlane(policies, plane.plane_id);
    if (matches.length === 0) {
      gaps.push({ planeId: plane.plane_id, reason: 'missing_policy', detail: 'Action-capable inventory plane has no proof-capsule policy.' });
      continue;
    }
    if (matches.length > 1) {
      gaps.push({ planeId: plane.plane_id, reason: 'ambiguous_policy', detail: 'Action-capable inventory plane has more than one proof-capsule policy.' });
      continue;
    }

    const source = readPlaneSource(repoRoot, plane);
    if (source === null) {
      gaps.push({ planeId: plane.plane_id, reason: 'missing_source', detail: `Source ${plane.source_ref.path_or_uri} could not be read.` });
      continue;
    }

    for (const marker of matches[0].requiredSourceMarkers) {
      if (!source.includes(marker)) {
        gaps.push({ planeId: plane.plane_id, reason: 'missing_marker', detail: `Source is missing proof marker ${marker}.` });
      }
    }
  }

  for (const policy of policies) {
    if (!planeIds.has(policy.planeId)) {
      gaps.push({ planeId: policy.planeId, reason: 'extra_policy', detail: 'Proof-capsule policy is not backed by an action-capable inventory plane.' });
    }
  }

  return {
    ok: gaps.length === 0,
    checkedPlanes: planes.length,
    policyCount: policies.length,
    gaps
  };
}

export function formatProofCapsuleCoverageReport(result: ProofCapsuleCoverageResult): string {
  const lines = [
    'Control-proof capsule coverage',
    `Status: ${result.ok ? 'clean' : 'gaps found'}`,
    `Action-capable planes checked: ${result.checkedPlanes}`,
    `Proof policies: ${result.policyCount}`,
    `Gaps: ${result.gaps.length}`
  ];
  if (result.gaps.length) {
    lines.push('', 'Gap samples:');
    for (const gap of result.gaps.slice(0, 12)) {
      lines.push(`- ${gap.planeId}: ${gap.reason} | ${gap.detail}`);
    }
  }
  return lines.join('\n');
}
