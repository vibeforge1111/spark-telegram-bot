import {
  CONTROL_PROOF_LIVE_CANARY_CASES,
  type ControlProofCanaryAuthorityExpectation,
  type ControlProofCanaryCategory,
  type ControlProofCanaryCase,
  type ControlProofCanaryMutationClass,
  type ControlProofCanaryRisk
} from './controlProofLiveCanaryPack';

export interface ReliabilityEvalRequirement {
  id: string;
  label: string;
  requiredCaseIds: string[];
  allowedCategories?: ControlProofCanaryCategory[];
  promptPattern?: RegExp;
  routePattern?: RegExp;
  allowedRisks?: ControlProofCanaryRisk[];
  allowedAuthorities?: ControlProofCanaryAuthorityExpectation[];
  allowedMutationClasses?: ControlProofCanaryMutationClass[];
  allowedReplyShapes?: Array<ControlProofCanaryCase['expectedReplyShape']>;
  requiredCaptures?: Array<keyof ControlProofCanaryCase['capture']>;
}

export interface ReliabilityEvalCoverageGap {
  requirementId: string;
  caseId?: string;
  reason:
    | 'missing_case'
    | 'category_mismatch'
    | 'prompt_mismatch'
    | 'route_mismatch'
    | 'risk_mismatch'
    | 'authority_mismatch'
    | 'mutation_mismatch'
    | 'reply_shape_mismatch'
    | 'capture_mismatch'
    | 'missing_requirement_cases'
    | 'missing_requirement_policy';
  detail: string;
}

export interface ReliabilityEvalCoverageResult {
  ok: boolean;
  requirementCount: number;
  checkedCaseCount: number;
  gaps: ReliabilityEvalCoverageGap[];
}

export const RELIABILITY_EVAL_REQUIREMENTS: ReliabilityEvalRequirement[] = [
  {
    id: 'do_not_run',
    label: '`do not run` and equivalent no-execution boundaries',
    requiredCaseIds: ['cp-noaction-001', 'cp-noaction-004'],
    allowedCategories: ['no_action'],
    promptPattern: /\bdo not (?:start|repair)|do not run|do not.*anything/i,
    routePattern: /plain_chat|fresh_state/,
    allowedRisks: ['safe'],
    allowedAuthorities: ['chat_only'],
    allowedMutationClasses: ['none'],
    allowedReplyShapes: ['natural'],
    requiredCaptures: ['observedReply', 'sideEffects', 'proofPanel', 'userConfirmation']
  },
  {
    id: 'just_explain',
    label: '`just explain` without mission launch',
    requiredCaseIds: ['cp-noaction-002'],
    allowedCategories: ['no_action'],
    promptPattern: /just explain/i,
    routePattern: /plain_chat/,
    allowedRisks: ['safe'],
    allowedAuthorities: ['chat_only'],
    allowedMutationClasses: ['none'],
    allowedReplyShapes: ['natural'],
    requiredCaptures: ['observedReply', 'sideEffects', 'proofPanel', 'userConfirmation']
  },
  {
    id: 'build_mission_mentions',
    label: 'build/mission wording without accidental execution',
    requiredCaseIds: ['cp-noaction-001', 'cp-spawner-001'],
    allowedCategories: ['no_action', 'spawner_build'],
    promptPattern: /\bbuild|mission\b/i,
    routePattern: /plain_chat|spawner_build\.ideation_boundary/,
    allowedRisks: ['safe'],
    allowedAuthorities: ['chat_only'],
    allowedMutationClasses: ['none'],
    allowedReplyShapes: ['natural'],
    requiredCaptures: ['observedReply', 'sideEffects', 'proofPanel', 'userConfirmation']
  },
  {
    id: 'images',
    label: 'image/media text remains evidence-only unless authorized',
    requiredCaseIds: ['cp-media-001', 'cp-media-002'],
    allowedCategories: ['media'],
    promptPattern: /image|photo/i,
    routePattern: /media\.image/,
    allowedRisks: ['manual_media'],
    allowedAuthorities: ['media_evidence_only'],
    allowedMutationClasses: ['media_read'],
    allowedReplyShapes: ['natural', 'media_reply'],
    requiredCaptures: ['observedReply', 'sideEffects', 'proofPanel', 'screenshot', 'userConfirmation']
  },
  {
    id: 'audio',
    label: 'audio and voice evidence boundaries',
    requiredCaseIds: ['cp-audio-001', 'cp-voice-001'],
    allowedCategories: ['audio', 'voice'],
    promptPattern: /audio|voice/i,
    routePattern: /media\.(?:audio|voice)/,
    allowedRisks: ['manual_media'],
    allowedAuthorities: ['media_evidence_only'],
    allowedMutationClasses: ['media_read'],
    allowedReplyShapes: ['media_reply'],
    requiredCaptures: ['observedReply', 'sideEffects', 'proofPanel', 'screenshot', 'userConfirmation']
  },
  {
    id: 'stale_memory_conflicts',
    label: 'fresh runtime truth wins over stale memory',
    requiredCaseIds: ['cp-authority-001', 'cp-memory-001'],
    allowedCategories: ['authority', 'memory'],
    promptPattern: /memory/i,
    routePattern: /fresh_state|memory/,
    allowedRisks: ['safe', 'inspect_only'],
    allowedAuthorities: ['read_only_allowed'],
    allowedMutationClasses: ['read_only'],
    allowedReplyShapes: ['natural'],
    requiredCaptures: ['observedReply', 'sideEffects', 'proofPanel', 'userConfirmation']
  },
  {
    id: 'streaming_rich_messages',
    label: 'streaming and rich-message runtime proof',
    requiredCaseIds: ['cp-streaming-001', 'cp-streaming-002'],
    allowedCategories: ['streaming', 'rich_messages'],
    promptPattern: /streaming|rich-message|rich/i,
    routePattern: /streaming\.status|rich_message/,
    allowedRisks: ['inspect_only'],
    allowedAuthorities: ['read_only_allowed'],
    allowedMutationClasses: ['read_only'],
    allowedReplyShapes: ['compact_card', 'natural'],
    requiredCaptures: ['observedReply', 'sideEffects', 'screenshot', 'userConfirmation']
  },
  {
    id: 'publish_handoffs',
    label: 'release-ready versus publish-not-ready handoff shape',
    requiredCaseIds: ['cp-publish-001'],
    allowedCategories: ['publish'],
    promptPattern: /registry|release|publish/i,
    routePattern: /registry_drift/,
    allowedRisks: ['inspect_only'],
    allowedAuthorities: ['read_only_allowed'],
    allowedMutationClasses: ['read_only'],
    allowedReplyShapes: ['natural'],
    requiredCaptures: ['observedReply', 'sideEffects', 'screenshot', 'userConfirmation']
  }
];

function caseById(cases: ControlProofCanaryCase[]): Map<string, ControlProofCanaryCase> {
  return new Map(cases.map((entry) => [entry.id, entry]));
}

export function checkReliabilityEvalCoverage(input: {
  cases?: ControlProofCanaryCase[];
  requirements?: ReliabilityEvalRequirement[];
} = {}): ReliabilityEvalCoverageResult {
  const cases = input.cases || CONTROL_PROOF_LIVE_CANARY_CASES;
  const requirements = input.requirements || RELIABILITY_EVAL_REQUIREMENTS;
  const byId = caseById(cases);
  const gaps: ReliabilityEvalCoverageGap[] = [];
  const checkedCaseIds = new Set<string>();

  for (const requirement of requirements) {
    if (requirement.requiredCaseIds.length === 0) {
      gaps.push({
        requirementId: requirement.id,
        reason: 'missing_requirement_cases',
        detail: 'Reliability requirement must name at least one canary case.'
      });
    }
    if (!requirement.promptPattern) {
      gaps.push({
        requirementId: requirement.id,
        reason: 'missing_requirement_policy',
        detail: 'Reliability requirement must define a prompt pattern so coverage cannot drift to unrelated prompts.'
      });
    }
    if (!requirement.routePattern) {
      gaps.push({
        requirementId: requirement.id,
        reason: 'missing_requirement_policy',
        detail: 'Reliability requirement must define a route pattern so coverage stays at the real route boundary.'
      });
    }
    if (!requirement.allowedCategories?.length) {
      gaps.push({
        requirementId: requirement.id,
        reason: 'missing_requirement_policy',
        detail: 'Reliability requirement must define allowed canary categories.'
      });
    }
    if (!requirement.allowedRisks?.length) {
      gaps.push({
        requirementId: requirement.id,
        reason: 'missing_requirement_policy',
        detail: 'Reliability requirement must define allowed risk classes.'
      });
    }
    if (!requirement.allowedAuthorities?.length) {
      gaps.push({
        requirementId: requirement.id,
        reason: 'missing_requirement_policy',
        detail: 'Reliability requirement must define allowed authority expectations.'
      });
    }
    if (!requirement.allowedMutationClasses?.length) {
      gaps.push({
        requirementId: requirement.id,
        reason: 'missing_requirement_policy',
        detail: 'Reliability requirement must define allowed mutation classes.'
      });
    }
    if (!requirement.allowedReplyShapes?.length) {
      gaps.push({
        requirementId: requirement.id,
        reason: 'missing_requirement_policy',
        detail: 'Reliability requirement must define allowed reply shapes.'
      });
    }
    for (const capture of ['observedReply', 'sideEffects'] as const) {
      if (!requirement.requiredCaptures?.includes(capture)) {
        gaps.push({
          requirementId: requirement.id,
          reason: 'missing_requirement_policy',
          detail: `Reliability requirement must require ${capture} capture.`
        });
      }
    }

    for (const caseId of requirement.requiredCaseIds) {
      const entry = byId.get(caseId);
      if (!entry) {
        gaps.push({ requirementId: requirement.id, caseId, reason: 'missing_case', detail: 'Required canary case is missing.' });
        continue;
      }
      checkedCaseIds.add(caseId);
      if (requirement.promptPattern && !requirement.promptPattern.test(entry.prompt)) {
        gaps.push({ requirementId: requirement.id, caseId, reason: 'prompt_mismatch', detail: `Prompt no longer covers ${requirement.label}.` });
      }
      if (requirement.allowedCategories && !requirement.allowedCategories.includes(entry.category)) {
        gaps.push({
          requirementId: requirement.id,
          caseId,
          reason: 'category_mismatch',
          detail: `Canary category ${entry.category} no longer covers ${requirement.label}.`
        });
      }
      if (requirement.routePattern && !requirement.routePattern.test(entry.expectedRoute)) {
        gaps.push({ requirementId: requirement.id, caseId, reason: 'route_mismatch', detail: `Expected route ${entry.expectedRoute} no longer covers ${requirement.label}.` });
      }
      if (requirement.allowedRisks && !requirement.allowedRisks.includes(entry.risk)) {
        gaps.push({
          requirementId: requirement.id,
          caseId,
          reason: 'risk_mismatch',
          detail: `Risk ${entry.risk} no longer covers ${requirement.label}.`
        });
      }
      if (requirement.allowedAuthorities && !requirement.allowedAuthorities.includes(entry.expectedAuthority)) {
        gaps.push({
          requirementId: requirement.id,
          caseId,
          reason: 'authority_mismatch',
          detail: `Authority ${entry.expectedAuthority} no longer covers ${requirement.label}.`
        });
      }
      if (requirement.allowedMutationClasses && !requirement.allowedMutationClasses.includes(entry.expectedMutationClass)) {
        gaps.push({
          requirementId: requirement.id,
          caseId,
          reason: 'mutation_mismatch',
          detail: `Mutation class ${entry.expectedMutationClass} no longer covers ${requirement.label}.`
        });
      }
      if (requirement.allowedReplyShapes && !requirement.allowedReplyShapes.includes(entry.expectedReplyShape)) {
        gaps.push({
          requirementId: requirement.id,
          caseId,
          reason: 'reply_shape_mismatch',
          detail: `Reply shape ${entry.expectedReplyShape} no longer covers ${requirement.label}.`
        });
      }
      for (const capture of requirement.requiredCaptures || []) {
        if (!entry.capture[capture]) {
          gaps.push({
            requirementId: requirement.id,
            caseId,
            reason: 'capture_mismatch',
            detail: `Canary case no longer requires ${capture} capture for ${requirement.label}.`
          });
        }
      }
    }
  }

  return {
    ok: gaps.length === 0,
    requirementCount: requirements.length,
    checkedCaseCount: checkedCaseIds.size,
    gaps
  };
}

export function formatReliabilityEvalCoverageReport(result: ReliabilityEvalCoverageResult): string {
  const lines = [
    'Control-proof reliability eval coverage',
    `Status: ${result.ok ? 'clean' : 'gaps found'}`,
    `Requirements: ${result.requirementCount}`,
    `Unique canary cases checked: ${result.checkedCaseCount}`,
    `Gaps: ${result.gaps.length}`
  ];
  if (result.gaps.length) {
    lines.push('', 'Gap samples:');
    for (const gap of result.gaps.slice(0, 12)) {
      lines.push(`- ${gap.requirementId}${gap.caseId ? `/${gap.caseId}` : ''}: ${gap.reason} | ${gap.detail}`);
    }
  }
  return lines.join('\n');
}
