import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import {
  summarizeControlProofCanaryObservations,
  type ControlProofCanaryObservationTemplate,
  type ControlProofCanaryObservationSummary
} from './controlProofLiveCanaryPack';

export interface CapabilityEvidencePolicy {
  capabilityKey: string;
  label: string;
  successCaseIds: string[];
  failureOrBoundaryCaseIds: string[];
  requiresPublishHandoff?: boolean;
}

export interface CapabilityEvidenceRecord {
  capabilityKey: string;
  label: string;
  lastSuccessAt: string | null;
  lastSuccessCaseIds: string[];
  lastFailureOrBoundaryAt: string | null;
  lastFailureOrBoundaryCaseIds: string[];
  publishHandoffEvidence: boolean;
}

export interface CapabilityEvidenceGap {
  capabilityKey: string;
  caseId?: string;
  reason:
    | 'missing_success_policy'
    | 'missing_failure_policy'
    | 'missing_case'
    | 'case_not_passed'
    | 'missing_capture'
    | 'overlapping_policy_case'
    | 'missing_publish_handoff';
  detail: string;
}

export interface CapabilityEvidenceResult {
  ok: boolean;
  observationPath: string;
  capabilityCount: number;
  evidenceCollectedAt: string | null;
  records: CapabilityEvidenceRecord[];
  gaps: CapabilityEvidenceGap[];
}

export const CAPABILITY_EVIDENCE_POLICIES: CapabilityEvidencePolicy[] = [
  {
    capabilityKey: 'telegram_no_action_boundary',
    label: 'Telegram no-action and route-hijack boundary',
    successCaseIds: ['cp-noaction-001', 'cp-noaction-004'],
    failureOrBoundaryCaseIds: ['cp-noaction-002', 'cp-noaction-003']
  },
  {
    capabilityKey: 'fresh_authority_status',
    label: 'Fresh runtime and authority status',
    successCaseIds: ['cp-authority-001', 'cp-authority-002'],
    failureOrBoundaryCaseIds: ['cp-noaction-004']
  },
  {
    capabilityKey: 'proof_panel',
    label: 'Harness proof panel',
    successCaseIds: ['cp-proof-001'],
    failureOrBoundaryCaseIds: ['cp-proof-002']
  },
  {
    capabilityKey: 'builder_gateway',
    label: 'Builder gateway and memory diagnostic boundary',
    successCaseIds: ['cp-builder-001'],
    failureOrBoundaryCaseIds: ['cp-builder-002']
  },
  {
    capabilityKey: 'streaming_rich_messages',
    label: 'Telegram streaming and Rich Messages',
    successCaseIds: ['cp-streaming-002'],
    failureOrBoundaryCaseIds: ['cp-streaming-001']
  },
  {
    capabilityKey: 'memory',
    label: 'Memory recall and Memory Doctor',
    successCaseIds: ['cp-memory-001'],
    failureOrBoundaryCaseIds: ['cp-memory-002']
  },
  {
    capabilityKey: 'access',
    label: 'Access state and runner capability',
    successCaseIds: ['cp-access-001'],
    failureOrBoundaryCaseIds: ['cp-access-002']
  },
  {
    capabilityKey: 'model_switch',
    label: 'Model and mission-provider switching',
    successCaseIds: ['cp-model-002'],
    failureOrBoundaryCaseIds: ['cp-model-001']
  },
  {
    capabilityKey: 'web_research',
    label: 'External research boundary',
    successCaseIds: ['cp-web-002'],
    failureOrBoundaryCaseIds: ['cp-web-001']
  },
  {
    capabilityKey: 'spawner_build',
    label: 'Spawner build route',
    successCaseIds: ['cp-spawner-002'],
    failureOrBoundaryCaseIds: ['cp-spawner-001']
  },
  {
    capabilityKey: 'mission_launch',
    label: 'Mission launch and no-edit probe route',
    successCaseIds: ['cp-mission-001'],
    failureOrBoundaryCaseIds: ['cp-noaction-001', 'cp-noaction-002']
  },
  {
    capabilityKey: 'media_voice_audio',
    label: 'Image, voice, and audio media boundary',
    successCaseIds: ['cp-media-002', 'cp-voice-001', 'cp-audio-001'],
    failureOrBoundaryCaseIds: ['cp-media-001']
  },
  {
    capabilityKey: 'publish_registry',
    label: 'Publish and registry drift boundary',
    successCaseIds: ['cp-publish-001'],
    failureOrBoundaryCaseIds: [],
    requiresPublishHandoff: true
  }
];

function readObservations(observationPath: string): ControlProofCanaryObservationTemplate {
  return JSON.parse(readFileSync(observationPath, 'utf8')) as ControlProofCanaryObservationTemplate;
}

function repoObservationPath(repoRoot: string): string {
  return path.join(repoRoot, 'outputs', 'live-canary-full', 'live-canary-observations.json');
}

function caseSummaryById(summary: ControlProofCanaryObservationSummary): Map<string, ControlProofCanaryObservationSummary['cases'][number]> {
  return new Map(summary.cases.map((entry) => [entry.id, entry]));
}

function checkCaseIds(
  policy: CapabilityEvidencePolicy,
  caseIds: string[],
  byId: Map<string, ControlProofCanaryObservationSummary['cases'][number]>,
  kind: 'success' | 'failure'
): CapabilityEvidenceGap[] {
  const gaps: CapabilityEvidenceGap[] = [];
  if (caseIds.length === 0) {
    gaps.push({
      capabilityKey: policy.capabilityKey,
      reason: kind === 'success' ? 'missing_success_policy' : 'missing_failure_policy',
      detail: `Capability has no ${kind === 'success' ? 'last-success' : 'last-failure/boundary'} evidence policy.`
    });
    return gaps;
  }

  for (const caseId of caseIds) {
    const entry = byId.get(caseId);
    if (!entry) {
      gaps.push({ capabilityKey: policy.capabilityKey, caseId, reason: 'missing_case', detail: 'Required canary evidence case is missing.' });
      continue;
    }
    if (entry.verdict !== 'pass') {
      gaps.push({ capabilityKey: policy.capabilityKey, caseId, reason: 'case_not_passed', detail: `Required canary evidence case verdict is ${entry.verdict}.` });
    }
    if (entry.missingCaptures.length) {
      gaps.push({ capabilityKey: policy.capabilityKey, caseId, reason: 'missing_capture', detail: `Required canary evidence case is missing captures: ${entry.missingCaptures.join(', ')}.` });
    }
  }
  return gaps;
}

function casesHaveCompletePassingEvidence(
  caseIds: string[],
  byId: Map<string, ControlProofCanaryObservationSummary['cases'][number]>
): boolean {
  return caseIds.length > 0 && caseIds.every((caseId) => {
    const entry = byId.get(caseId);
    return entry?.verdict === 'pass' && entry.missingCaptures.length === 0;
  });
}

export function checkCapabilityEvidence(input: {
  repoRoot?: string;
  observationPath?: string;
  observations?: ControlProofCanaryObservationTemplate;
  policies?: CapabilityEvidencePolicy[];
} = {}): CapabilityEvidenceResult {
  const repoRoot = input.repoRoot || process.cwd();
  const observationPath = input.observationPath || repoObservationPath(repoRoot);
  if (!input.observations && !existsSync(observationPath)) {
    return {
      ok: false,
      observationPath,
      capabilityCount: 0,
      evidenceCollectedAt: null,
      records: [],
      gaps: [{
        capabilityKey: 'capability_evidence',
        reason: 'missing_case',
        detail: `Observation packet is missing: ${observationPath}.`
      }]
    };
  }

  const observations = input.observations || readObservations(observationPath);
  const summary = summarizeControlProofCanaryObservations(observations, {
    now: observations.evidence?.collectedAt || observations.generatedAt
  });
  const byId = caseSummaryById(summary);
  const policies = input.policies || CAPABILITY_EVIDENCE_POLICIES;
  const gaps: CapabilityEvidenceGap[] = [];
  const records: CapabilityEvidenceRecord[] = [];

  for (const policy of policies) {
    const overlappingCaseIds = policy.successCaseIds.filter((caseId) => policy.failureOrBoundaryCaseIds.includes(caseId));
    for (const caseId of overlappingCaseIds) {
      gaps.push({
        capabilityKey: policy.capabilityKey,
        caseId,
        reason: 'overlapping_policy_case',
        detail: 'Capability policy cannot use the same canary case as both last-success and last-failure/boundary evidence.'
      });
    }

    gaps.push(...checkCaseIds(policy, policy.successCaseIds, byId, 'success'));
    if (policy.failureOrBoundaryCaseIds.length > 0) {
      gaps.push(...checkCaseIds(policy, policy.failureOrBoundaryCaseIds, byId, 'failure'));
    } else if (!policy.requiresPublishHandoff) {
      gaps.push({
        capabilityKey: policy.capabilityKey,
        reason: 'missing_failure_policy',
        detail: 'Capability has no last-failure/boundary evidence policy.'
      });
    }

    const hasPublishHandoffEvidence = Boolean(
      policy.requiresPublishHandoff &&
      summary.publishHandoffs &&
      Object.keys(summary.publishHandoffs).length > 0 &&
      !summary.readyForPublish
    );
    if (policy.requiresPublishHandoff && !hasPublishHandoffEvidence) {
      gaps.push({
        capabilityKey: policy.capabilityKey,
        reason: 'missing_publish_handoff',
        detail: 'Capability requires publish-not-ready handoff evidence, but none is present.'
      });
    }

    records.push({
      capabilityKey: policy.capabilityKey,
      label: policy.label,
      lastSuccessAt: casesHaveCompletePassingEvidence(policy.successCaseIds, byId)
        ? summary.runtimeEvidenceCollectedAt
        : null,
      lastSuccessCaseIds: [...policy.successCaseIds],
      lastFailureOrBoundaryAt: (
        casesHaveCompletePassingEvidence(policy.failureOrBoundaryCaseIds, byId) ||
        hasPublishHandoffEvidence
      )
        ? summary.runtimeEvidenceCollectedAt
        : null,
      lastFailureOrBoundaryCaseIds: [...policy.failureOrBoundaryCaseIds],
      publishHandoffEvidence: hasPublishHandoffEvidence
    });
  }

  return {
    ok: gaps.length === 0,
    observationPath,
    capabilityCount: policies.length,
    evidenceCollectedAt: summary.runtimeEvidenceCollectedAt,
    records,
    gaps
  };
}

export function formatCapabilityEvidenceReport(result: CapabilityEvidenceResult): string {
  const lines = [
    'Control-proof capability evidence',
    `Status: ${result.ok ? 'clean' : 'gaps found'}`,
    `Observation packet: ${result.observationPath}`,
    `Evidence collected: ${result.evidenceCollectedAt || 'missing'}`,
    `Capabilities checked: ${result.capabilityCount}`,
    `Gaps: ${result.gaps.length}`
  ];

  if (result.records.length) {
    lines.push('', 'Evidence records:');
    for (const record of result.records.slice(0, 16)) {
      const failureSource = record.publishHandoffEvidence
        ? 'publish handoff'
        : record.lastFailureOrBoundaryCaseIds.join(', ');
      lines.push(`- ${record.capabilityKey}: success ${record.lastSuccessAt || 'missing'} via ${record.lastSuccessCaseIds.join(', ')} | failure/boundary ${record.lastFailureOrBoundaryAt || 'missing'} via ${failureSource || 'missing'}`);
    }
  }

  if (result.gaps.length) {
    lines.push('', 'Gap samples:');
    for (const gap of result.gaps.slice(0, 12)) {
      lines.push(`- ${gap.capabilityKey}${gap.caseId ? `/${gap.caseId}` : ''}: ${gap.reason} | ${gap.detail}`);
    }
  }

  return lines.join('\n');
}
