import { CONTROL_PROOF_LIVE_CANARY_CASES, type ControlProofCanaryCase } from './controlProofLiveCanaryPack';

export interface ReliabilityEvalRequirement {
  id: string;
  label: string;
  requiredCaseIds: string[];
  promptPattern?: RegExp;
  routePattern?: RegExp;
}

export interface ReliabilityEvalCoverageGap {
  requirementId: string;
  caseId?: string;
  reason: 'missing_case' | 'prompt_mismatch' | 'route_mismatch';
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
    promptPattern: /\bdo not (?:start|repair)|do not run|do not.*anything/i,
    routePattern: /plain_chat|fresh_state/
  },
  {
    id: 'just_explain',
    label: '`just explain` without mission launch',
    requiredCaseIds: ['cp-noaction-002'],
    promptPattern: /just explain/i,
    routePattern: /plain_chat/
  },
  {
    id: 'build_mission_mentions',
    label: 'build/mission wording without accidental execution',
    requiredCaseIds: ['cp-noaction-001', 'cp-spawner-001'],
    promptPattern: /\bbuild|mission\b/i,
    routePattern: /plain_chat|spawner_build\.ideation_boundary/
  },
  {
    id: 'images',
    label: 'image/media text remains evidence-only unless authorized',
    requiredCaseIds: ['cp-media-001', 'cp-media-002'],
    promptPattern: /image|photo/i,
    routePattern: /media\.image/
  },
  {
    id: 'audio',
    label: 'audio and voice evidence boundaries',
    requiredCaseIds: ['cp-audio-001', 'cp-voice-001'],
    promptPattern: /audio|voice/i,
    routePattern: /media\.(?:audio|voice)/
  },
  {
    id: 'stale_memory_conflicts',
    label: 'fresh runtime truth wins over stale memory',
    requiredCaseIds: ['cp-authority-001', 'cp-memory-001'],
    promptPattern: /memory/i,
    routePattern: /fresh_state|memory/
  },
  {
    id: 'streaming_rich_messages',
    label: 'streaming and rich-message runtime proof',
    requiredCaseIds: ['cp-streaming-001', 'cp-streaming-002'],
    promptPattern: /streaming|rich-message|rich/i,
    routePattern: /streaming\.status|rich_message/
  },
  {
    id: 'publish_handoffs',
    label: 'release-ready versus publish-not-ready handoff shape',
    requiredCaseIds: ['cp-publish-001'],
    promptPattern: /registry|release|publish/i,
    routePattern: /registry_drift/
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
      if (requirement.routePattern && !requirement.routePattern.test(entry.expectedRoute)) {
        gaps.push({ requirementId: requirement.id, caseId, reason: 'route_mismatch', detail: `Expected route ${entry.expectedRoute} no longer covers ${requirement.label}.` });
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
