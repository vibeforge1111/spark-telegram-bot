import { createHash } from 'node:crypto';
import type { SparkHarnessConfidence, SparkHarnessMutationClass, TurnIntentEnvelopeV1 } from './harnessContract';

export const HARNESS_PROOF_CAPSULE_SCHEMA = 'spark.harness_proof.v1' as const;

export type HarnessProofAuthorityDecision = 'allowed' | 'blocked' | 'downgraded';
export type HarnessProofGovernorDecision = 'allow' | 'deny' | 'read_only' | 'not_applicable';
export type HarnessProofRiskTier = 'none' | 'read' | 'write' | 'execute' | 'publish' | 'external';
export type HarnessProofExecutionStatus = 'not_started' | 'started' | 'completed' | 'failed' | 'blocked';
export type HarnessProofReplyShape = 'natural' | 'card' | 'queue' | 'raw_detail' | 'none';
export type HarnessProofJoinStatus = 'joined' | 'missing' | 'not_applicable';

export interface HarnessProofIntentSummary {
  kind: string;
  confidence: SparkHarnessConfidence | 'high' | 'medium' | 'low';
  noExecution: boolean;
}

export interface HarnessProofAuthoritySummary {
  decision: HarnessProofAuthorityDecision;
  contract: 'spark.turn_intent.v1' | 'machine_origin_policy' | 'none';
  riskTier: HarnessProofRiskTier;
  reasonSummary: string;
}

export interface HarnessProofGovernorSummary {
  decision: HarnessProofGovernorDecision;
  verified: boolean;
}

export interface HarnessProofExecutionSummary {
  status: HarnessProofExecutionStatus;
  tool: string;
  mutationClass: SparkHarnessMutationClass | 'unknown';
}

export interface HarnessProofReplySummary {
  delivered: boolean;
  shape: HarnessProofReplyShape;
  rawReasonsHidden: boolean;
}

export interface HarnessProofJoinSummary {
  telegram: HarnessProofJoinStatus;
  builder: HarnessProofJoinStatus;
  spawner: HarnessProofJoinStatus;
  provider: HarnessProofJoinStatus;
  memory: HarnessProofJoinStatus;
  voice: HarnessProofJoinStatus;
}

export interface HarnessProofCapsuleV1 {
  schema: typeof HARNESS_PROOF_CAPSULE_SCHEMA;
  turnRef: string;
  route: string;
  owner: string;
  intent: HarnessProofIntentSummary;
  authority: HarnessProofAuthoritySummary;
  governor: HarnessProofGovernorSummary;
  execution: HarnessProofExecutionSummary;
  reply: HarnessProofReplySummary;
  joins: HarnessProofJoinSummary;
}

export interface BuildHarnessProofCapsuleInput {
  turnRef: string;
  route: string;
  owner: string;
  intent: HarnessProofIntentSummary;
  authority: HarnessProofAuthoritySummary;
  governor: HarnessProofGovernorSummary;
  execution: HarnessProofExecutionSummary;
  reply: HarnessProofReplySummary;
  joins?: Partial<HarnessProofJoinSummary>;
}

const DEFAULT_JOINS: HarnessProofJoinSummary = {
  telegram: 'not_applicable',
  builder: 'not_applicable',
  spawner: 'not_applicable',
  provider: 'not_applicable',
  memory: 'not_applicable',
  voice: 'not_applicable'
};

export function buildHarnessProofCapsule(input: BuildHarnessProofCapsuleInput): HarnessProofCapsuleV1 {
  return {
    schema: HARNESS_PROOF_CAPSULE_SCHEMA,
    turnRef: redactedProofRef('turn', input.turnRef),
    route: safeToken(input.route, 'unknown'),
    owner: safeToken(input.owner, 'unknown'),
    intent: {
      kind: safeToken(input.intent.kind, 'unknown'),
      confidence: input.intent.confidence,
      noExecution: Boolean(input.intent.noExecution)
    },
    authority: {
      decision: input.authority.decision,
      contract: input.authority.contract,
      riskTier: input.authority.riskTier,
      reasonSummary: sanitizeReasonSummary(input.authority.reasonSummary)
    },
    governor: {
      decision: input.governor.decision,
      verified: Boolean(input.governor.verified)
    },
    execution: {
      status: input.execution.status,
      tool: safeToken(input.execution.tool, 'none'),
      mutationClass: input.execution.mutationClass
    },
    reply: {
      delivered: Boolean(input.reply.delivered),
      shape: input.reply.shape,
      rawReasonsHidden: Boolean(input.reply.rawReasonsHidden)
    },
    joins: {
      ...DEFAULT_JOINS,
      ...(input.joins || {})
    }
  };
}

export function harnessProofCapsuleFromTurnIntentEnvelope(input: {
  envelope: TurnIntentEnvelopeV1;
  authorityDecision: HarnessProofAuthorityDecision;
  governorDecision?: HarnessProofGovernorDecision;
  governorVerified?: boolean;
  executionStatus?: HarnessProofExecutionStatus;
  tool?: string;
  mutationClass?: SparkHarnessMutationClass | 'unknown';
  replyDelivered?: boolean;
  replyShape?: HarnessProofReplyShape;
  joins?: Partial<HarnessProofJoinSummary>;
  reasonSummary?: string;
}): HarnessProofCapsuleV1 {
  const envelope = input.envelope;
  return buildHarnessProofCapsule({
    turnRef: envelope.turnId || envelope.traceId,
    route: envelope.selectedIntent.kind,
    owner: envelope.selectedIntent.ownerSystem,
    intent: {
      kind: envelope.selectedIntent.kind,
      confidence: envelope.selectedIntent.confidence,
      noExecution: envelope.directive.noExecution
    },
    authority: {
      decision: input.authorityDecision,
      contract: envelope.schema,
      riskTier: riskTierForEnvelope(envelope),
      reasonSummary: input.reasonSummary || defaultReasonSummary(input.authorityDecision, envelope.directive.noExecution)
    },
    governor: {
      decision: input.governorDecision || (input.authorityDecision === 'allowed' ? 'allow' : 'deny'),
      verified: input.governorVerified ?? input.authorityDecision === 'allowed'
    },
    execution: {
      status: input.executionStatus || (input.authorityDecision === 'allowed' ? 'started' : 'blocked'),
      tool: input.tool || 'none',
      mutationClass: input.mutationClass || 'unknown'
    },
    reply: {
      delivered: input.replyDelivered ?? false,
      shape: input.replyShape || 'none',
      rawReasonsHidden: true
    },
    joins: input.joins
  });
}

export function validateHarnessProofCapsuleV1(value: unknown): value is HarnessProofCapsuleV1 {
  if (!value || typeof value !== 'object') return false;
  const capsule = value as Partial<HarnessProofCapsuleV1>;
  return capsule.schema === HARNESS_PROOF_CAPSULE_SCHEMA &&
    typeof capsule.turnRef === 'string' &&
    /^turn:sha256:[a-f0-9]{16}$/.test(capsule.turnRef) &&
    typeof capsule.route === 'string' &&
    typeof capsule.owner === 'string' &&
    Boolean(capsule.intent && typeof capsule.intent.kind === 'string') &&
    Boolean(capsule.authority && typeof capsule.authority.reasonSummary === 'string') &&
    Boolean(capsule.governor && typeof capsule.governor.verified === 'boolean') &&
    Boolean(capsule.execution && typeof capsule.execution.tool === 'string') &&
    Boolean(capsule.reply && typeof capsule.reply.rawReasonsHidden === 'boolean') &&
    Boolean(capsule.joins && typeof capsule.joins.telegram === 'string');
}

export function summarizeHarnessProofCapsule(capsule: HarnessProofCapsuleV1): string {
  const gaps = Object.entries(capsule.joins)
    .filter(([, status]) => status === 'missing')
    .map(([plane]) => plane);
  return [
    'Harness Proof',
    `Intent: ${capsule.intent.kind}`,
    `Authority: ${capsule.authority.decision} by ${capsule.authority.contract}`,
    `Governor: ${capsule.governor.decision}${capsule.governor.verified ? ', verified' : ''}`,
    `Execution: ${capsule.execution.status}`,
    `Reply: ${capsule.reply.delivered ? `delivered as ${capsule.reply.shape}` : 'not delivered'}`,
    `Trace joins: ${joinSummary(capsule.joins)}`,
    `Gaps: ${gaps.length ? gaps.join(', ') : 'none'}`
  ].join('\n');
}

export function redactedProofRef(label: string, value: string): string {
  const safeLabel = safeToken(label, 'ref');
  const digest = createHash('sha256').update(String(value || 'unknown')).digest('hex').slice(0, 16);
  return `${safeLabel}:sha256:${digest}`;
}

function riskTierForEnvelope(envelope: TurnIntentEnvelopeV1): HarnessProofRiskTier {
  if (envelope.executionPolicy.canPublish) return 'publish';
  if (envelope.executionPolicy.canUseExternalNetwork) return 'external';
  if (envelope.executionPolicy.canLaunchMission) return 'execute';
  if (envelope.executionPolicy.canMutateFiles || envelope.executionPolicy.canWriteMemory) return 'write';
  if (envelope.directive.mode === 'inspect' || envelope.toolPolicy.mutationClassesAllowed.includes('read_only')) return 'read';
  return 'none';
}

function defaultReasonSummary(decision: HarnessProofAuthorityDecision, noExecution: boolean): string {
  if (decision === 'allowed') return 'Fresh Harness authority allowed this action.';
  if (noExecution) return 'Fresh turn requested no execution.';
  if (decision === 'downgraded') return 'Harness downgraded this turn to a safer mode.';
  return 'Harness did not authorize this action.';
}

function sanitizeReasonSummary(value: string): string {
  return String(value || 'No reason summary provided.')
    .replace(/\/Users\/\S+/g, '<path>')
    .replace(/[A-Za-z]:\\\S+/g, '<path>')
    .replace(/\b(?:tool_not_allowed_by_policy|owner_mismatch|route_not_selected_by_turn_envelope|governor_outcome_deny|harness_core:[A-Za-z0-9_-]+)\b/gi, 'internal policy reason')
    .slice(0, 240)
    .trim();
}

function safeToken(value: string, fallback: string): string {
  const token = String(value || '').trim();
  if (!token) return fallback;
  return token.replace(/[^A-Za-z0-9_.:-]+/g, '_').slice(0, 120) || fallback;
}

function joinSummary(joins: HarnessProofJoinSummary): string {
  return Object.entries(joins)
    .filter(([, status]) => status !== 'not_applicable')
    .map(([plane, status]) => `${plane} ${status}`)
    .join(', ') || 'not applicable';
}
