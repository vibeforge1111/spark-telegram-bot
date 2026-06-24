import type { SparkHarnessMutationClass, TurnIntentEnvelopeV1 } from './harnessContract';
import {
  buildHarnessProofCapsule,
  harnessProofCapsuleFromTurnIntentEnvelope,
  type HarnessProofAuthorityDecision,
  type HarnessProofCapsuleV1,
  type HarnessProofExecutionStatus,
  type HarnessProofGovernorDecision,
  type HarnessProofJoinSummary,
  type HarnessProofReplyShape
} from './harnessProofCapsule';
import type { TelegramActionAuthorityResult } from './telegramActionAuthority';

export type TelegramDeliveryProofInput = {
  turnRef: string;
  route: string;
  owner: string;
  tool: string;
  mutationClass: SparkHarnessMutationClass | 'unknown';
  executionStatus: HarnessProofExecutionStatus;
  replyDelivered: boolean;
  replyShape: HarnessProofReplyShape;
  authorization?: TelegramActionAuthorityResult | null;
  envelope?: TurnIntentEnvelopeV1 | null;
  authorityDecision?: HarnessProofAuthorityDecision;
  governorDecision?: HarnessProofGovernorDecision;
  reasonSummary?: string;
  joins?: Partial<HarnessProofJoinSummary>;
};

function proofGovernorDecisionForAuthorization(
  authorization: TelegramActionAuthorityResult | null | undefined,
  authorityDecision: HarnessProofAuthorityDecision
): HarnessProofGovernorDecision {
  const raw = authorization?.governorDecision as Record<string, unknown> | null | undefined;
  const decision = String(raw?.decision || raw?.outcome || raw?.verdict || '').toLowerCase();
  if (decision.includes('deny') || decision.includes('block')) return 'deny';
  if (decision.includes('read')) return 'read_only';
  if (decision.includes('allow')) return 'allow';
  if (authorization?.allow || authorityDecision === 'allowed') return 'allow';
  if (authorityDecision === 'downgraded') return 'read_only';
  return 'deny';
}

export function buildTelegramDeliveryProofCapsule(input: TelegramDeliveryProofInput): HarnessProofCapsuleV1 {
  const authorization = input.authorization || null;
  const envelope = authorization?.legacyEnvelope || input.envelope || null;
  const authorityDecision = input.authorityDecision || (authorization ? (authorization.allow ? 'allowed' : 'blocked') : 'allowed');
  const governorDecision = input.governorDecision || proofGovernorDecisionForAuthorization(authorization, authorityDecision);
  const governorVerified = Boolean(authorization?.governorDecision || !authorization) && governorDecision !== 'deny';

  if (envelope) {
    const capsule = harnessProofCapsuleFromTurnIntentEnvelope({
      envelope,
      authorityDecision,
      governorDecision,
      governorVerified,
      executionStatus: input.executionStatus,
      tool: input.tool,
      mutationClass: input.mutationClass,
      replyDelivered: input.replyDelivered,
      replyShape: input.replyShape,
      joins: input.joins,
      reasonSummary: input.reasonSummary || (
        authorityDecision === 'allowed'
          ? 'Fresh Harness authority allowed this Telegram action.'
          : 'Fresh Harness authority blocked this Telegram action.'
      )
    });
    return input.route
      ? { ...capsule, route: input.route, intent: { ...capsule.intent, kind: input.route } }
      : capsule;
  }

  return buildHarnessProofCapsule({
    turnRef: input.turnRef,
    route: input.route,
    owner: input.owner,
    intent: {
      kind: input.route,
      confidence: authorityDecision === 'blocked' ? 'blocked' : 'explicit',
      noExecution: authorityDecision !== 'allowed'
    },
    authority: {
      decision: authorityDecision,
      contract: 'machine_origin_policy',
      riskTier: input.mutationClass === 'launches_mission'
        ? 'execute'
        : input.mutationClass === 'external_network'
          ? 'external'
          : input.mutationClass === 'read_only'
            ? 'read'
            : input.mutationClass === 'none'
              ? 'none'
              : 'write',
      reasonSummary: input.reasonSummary || 'Telegram delivery carried redacted proof metadata.'
    },
    governor: {
      decision: governorDecision,
      verified: governorVerified
    },
    execution: {
      status: input.executionStatus,
      tool: input.tool,
      mutationClass: input.mutationClass
    },
    reply: {
      delivered: input.replyDelivered,
      shape: input.replyShape,
      rawReasonsHidden: true
    },
    joins: input.joins
  });
}
