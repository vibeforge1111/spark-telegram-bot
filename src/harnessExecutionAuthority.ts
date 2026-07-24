import {
  verifyHarnessCoreGovernorToolAuthority,
  type GovernorDecisionV1,
  type HarnessCoreActionType
} from '@spark/harness-core';

export interface HarnessExecutionAuthorityExpectation {
  toolName: string;
  ownerSystem: string;
  actionType: HarnessCoreActionType;
  actionId?: string;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

function asGovernorDecision(value: unknown): GovernorDecisionV1 | null {
  if (!isObject(value)) return null;
  if (value.schema_version !== 'governor-decision-v1') return null;
  if (!Array.isArray(value.authorizations)) return null;
  if (!Array.isArray(value.tool_ledgers)) return null;
  if (!isObject(value.execution_boundary)) return null;
  if (!isObject(value.envelope) || !Array.isArray(value.envelope.proposed_actions)) return null;
  return value as unknown as GovernorDecisionV1;
}

export function harnessExecutionAuthorityFailureReason(
  value: unknown,
  expected: HarnessExecutionAuthorityExpectation | HarnessExecutionAuthorityExpectation[]
): string | null {
  const governorDecision = asGovernorDecision(value);
  if (!governorDecision) return 'missing_or_malformed_governor_decision';

  const expectations = Array.isArray(expected) ? expected : [expected];
  const failures: string[] = [];
  for (const expectation of expectations) {
    const verification = verifyHarnessCoreGovernorToolAuthority({
      governor_decision: governorDecision,
      tool_name: expectation.toolName,
      owner_system: expectation.ownerSystem,
      action_type: expectation.actionType,
      action_id: expectation.actionId,
      allow_read_only: expectation.actionType === 'read',
      require_pre_execution_ledger: true
    });
    if (verification.allowed) return null;
    failures.push(`${expectation.toolName}:${verification.reason_codes.join(',')}`);
  }

  return failures.join('|') || 'governor_verification_failed';
}
