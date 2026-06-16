import type {
  SparkHarnessMutationClass,
  ToolAuthorizationInput,
  ToolAuthorizationResult,
  TurnIntentEnvelopeV1
} from './harnessContract';
import {
  HARNESS_CORE_WIRE_CONTRACT_VERSION,
  HARNESS_CORE_RISK_ORDER,
  actionTypeForHarnessMutation,
  createHarnessCoreActionEnvelopeVNext,
  createHarnessCoreArtifactRef,
  createHarnessCoreEvidenceRef,
  createHarnessCoreGovernorDecision,
  createHarnessCoreTraceRef,
  finalizeHarnessCoreToolCallLedger,
  riskTierForHarnessMutation,
  safeHarnessCoreId,
  type AuthorizationDecisionV1,
  type GovernorDecisionV1,
  type HarnessCoreArtifactRef,
  type HarnessCoreAuthorityState,
  type HarnessCoreEvidenceRef,
  type HarnessCoreMoveType,
  type HarnessCoreProposedAction,
  type HarnessCoreRedactionClass,
  type HarnessCoreRiskTier,
  type HarnessCoreTraceRef,
  type ToolCallLedgerV1,
  type TurnIntentEnvelopeVNext
} from '@spark/harness-core';

export type {
  AuthorizationDecisionV1,
  GovernorDecisionV1,
  HarnessCoreActionType,
  HarnessCoreArtifactRef,
  HarnessCoreAuthorityState,
  HarnessCoreAuthorizationSchemaVersion,
  HarnessCoreEvidenceKind,
  HarnessCoreEvidenceRef,
  HarnessCoreMoveType,
  HarnessCoreProposedAction,
  HarnessCoreRedactionClass,
  HarnessCoreRiskTier,
  HarnessCoreSchemaVersion,
  HarnessCoreSurface,
  HarnessCoreToolLedgerSchemaVersion,
  HarnessCoreTraceRef,
  ToolCallLedgerV1,
  TurnIntentEnvelopeVNext
} from '@spark/harness-core';

export { createHarnessCoreGovernorDecision };

export interface HarnessCoreActionInput extends ToolAuthorizationInput {
  route: string;
  text: string;
}

export interface HarnessCoreAuthorizationBundle {
  envelope: TurnIntentEnvelopeVNext;
  action: HarnessCoreProposedAction;
  authorization: AuthorizationDecisionV1;
}

const RISK_ORDER = HARNESS_CORE_RISK_ORDER;

function nowIso(): string {
  return new Date().toISOString();
}

function safeId(prefix: string, raw: string): string {
  return safeHarnessCoreId(prefix, raw);
}

function confidenceValue(envelope: TurnIntentEnvelopeV1): number {
  switch (envelope.selectedIntent.confidence) {
    case 'explicit':
      return 0.95;
    case 'contextual':
      return 0.72;
    case 'ambiguous':
      return 0.42;
    case 'blocked':
      return 0;
    default:
      return 0.5;
  }
}

function traceRef(id: string, summary: string, redaction_class: HarnessCoreRedactionClass = 'metadata_only'): HarnessCoreTraceRef {
  return createHarnessCoreTraceRef({ id, redaction_class, summary });
}

function artifactRef(id: string, kind: string, path_or_uri: string, summary: string): HarnessCoreArtifactRef {
  return createHarnessCoreArtifactRef({ id, kind, path_or_uri, summary });
}

function evidenceRef(
  id: string,
  kind: HarnessCoreEvidenceRef['kind'],
  source: string,
  summary: string,
  confidence: number,
  trace_refs: HarnessCoreTraceRef[] = []
): HarnessCoreEvidenceRef {
  return createHarnessCoreEvidenceRef({ id, kind, source, summary, confidence, trace_refs });
}

function riskTierForAction(action: HarnessCoreActionInput): HarnessCoreRiskTier {
  return riskTierForHarnessMutation({
    mutationClass: action.mutationClass,
    publishes: action.publishes,
    externalNetwork: action.externalNetwork
  });
}

function moveForEnvelope(
  envelope: TurnIntentEnvelopeV1,
  action: HarnessCoreActionInput | null,
  legacyAllowed: boolean,
  riskTier: HarnessCoreRiskTier
): HarnessCoreMoveType {
  const safeReadOnlyAction = action &&
    (action.mutationClass === 'none' || action.mutationClass === 'read_only') &&
    !action.publishes &&
    !action.externalNetwork;
  if (safeReadOnlyAction && legacyAllowed && envelope.directive.mode !== 'deny') return 'read_current_state';
  if (!action || envelope.directive.noExecution || !legacyAllowed) {
    if (envelope.directive.mode === 'plan') return 'chat_plan';
    if (envelope.directive.mode === 'inspect') return 'read_current_state';
    return 'chat_explain';
  }
  if (RISK_ORDER[riskTier] >= RISK_ORDER.high) return 'confirm_action';
  if (action.mutationClass === 'none' || action.mutationClass === 'read_only') return 'read_current_state';
  return 'execute_action';
}

function authorityStateForMove(move: HarnessCoreMoveType): HarnessCoreAuthorityState {
  if (move.startsWith('chat_')) return 'chat_only';
  if (move === 'read_current_state') return 'read_only';
  if (move === 'prepare_action') return 'prepare_allowed';
  if (move === 'confirm_action') return 'confirmation_required';
  if (move === 'execute_action') return 'executable';
  return 'none';
}

function routeEvidence(envelope: TurnIntentEnvelopeV1): HarnessCoreEvidenceRef[] {
  const confidence = confidenceValue(envelope);
  const trace = traceRef(envelope.traceId, 'Telegram TurnIntent V1 trace evidence.');
  const evidence: HarnessCoreEvidenceRef[] = [
    evidenceRef(
      `${envelope.turnId}:fresh`,
      'fresh_user_intent',
      'spark-telegram-bot',
      `Fresh Telegram turn selected ${envelope.selectedIntent.kind}/${envelope.selectedIntent.action || envelope.directive.mode}.`,
      confidence,
      [trace]
    ),
    evidenceRef(
      `${envelope.turnId}:route`,
      'route_candidate',
      String(envelope.selectedIntent.ownerSystem || 'spark-telegram-bot'),
      `Route candidate ${envelope.selectedIntent.kind} from ${envelope.selectedIntent.source}.`,
      confidence,
      [trace]
    )
  ];
  if (envelope.directive.quotedOrMetaLanguage) {
    evidence.push(evidenceRef(`${envelope.turnId}:meta`, 'meta_language', 'spark-telegram-bot', 'Turn contains quoted or meta-language action words.', 0.95, [trace]));
  }
  if (envelope.directive.noExecution) {
    evidence.push(evidenceRef(`${envelope.turnId}:negative`, 'negative_intent', 'spark-telegram-bot', 'Fresh turn blocks execution authority.', 0.98, [trace]));
  }
  if (envelope.contextRefs.memoryRefs.length) {
    evidence.push(evidenceRef(`${envelope.turnId}:memory`, 'memory', 'domain-chip-memory', 'Memory refs are evidence only.', 0.7, [trace]));
  }
  if (envelope.contextRefs.pendingState) {
    evidence.push(evidenceRef(`${envelope.turnId}:pending`, 'pending_state', 'spark-telegram-bot', 'Pending state is scoped as evidence only.', 0.7, [trace]));
  }
  return evidence;
}

export function buildHarnessCoreAction(input: HarnessCoreActionInput, turnId: string): HarnessCoreProposedAction {
  const actionType = actionTypeForHarnessMutation(input.mutationClass, input.publishes);
  const riskTier = riskTierForAction(input);
  const actionEnvelope = createHarnessCoreActionEnvelopeVNext({
    surface: 'telegram',
    ownerSystem: String(input.ownerSystem || 'spark-telegram-bot'),
    toolName: input.toolName,
    mutationClass: input.mutationClass,
    source: input.route,
    reason: `Telegram proposed ${actionType} via ${input.toolName} for route ${input.route}.`,
    requestId: turnId,
    actorIdRef: 'telegram-human',
    target: input.route,
    riskTier,
    publishes: input.publishes,
    externalNetwork: input.externalNetwork,
    requiresHumanConfirmation: RISK_ORDER[riskTier] >= RISK_ORDER.high
  });
  return actionEnvelope.proposed_actions[0];
}

export function buildTurnIntentEnvelopeVNextFromTelegram(
  envelope: TurnIntentEnvelopeV1,
  action: HarnessCoreActionInput | null = null,
  legacyAllowed = false
): TurnIntentEnvelopeVNext {
  const riskTier = action ? riskTierForAction(action) : envelope.executionPolicy.canLaunchMission ? 'medium' : 'none';
  const move = moveForEnvelope(envelope, action, legacyAllowed, riskTier);
  const actionEnvelope = action && !move.startsWith('chat_')
    ? createHarnessCoreActionEnvelopeVNext({
        surface: 'telegram',
        ownerSystem: String(action.ownerSystem || 'spark-telegram-bot'),
        toolName: action.toolName,
        mutationClass: action.mutationClass,
        source: action.route,
        reason: `Telegram proposed ${actionTypeForHarnessMutation(action.mutationClass, action.publishes)} via ${action.toolName} for route ${action.route}.`,
        requestId: envelope.turnId,
        actorIdRef: envelope.user.userRef,
        target: action.route,
        confidence: confidenceValue(envelope),
        riskTier,
        publishes: action.publishes,
        externalNetwork: action.externalNetwork,
        requiresHumanConfirmation: RISK_ORDER[riskTier] >= RISK_ORDER.high
      })
    : null;
  const proposedAction = actionEnvelope?.proposed_actions[0] || null;
  const evidence = routeEvidence(envelope);
  const freshUserIntentRef = evidence.find((item) => item.kind === 'fresh_user_intent') || null;
  const authorityState = authorityStateForMove(move);

  return {
    schema_version: 'turn-intent-envelope-vnext',
    turn_id: actionEnvelope?.turn_id || safeId('turn', envelope.turnId),
    created_at: actionEnvelope?.created_at || nowIso(),
    surface: 'telegram',
    actor: {
      kind: 'human',
      id_ref: envelope.user.userRef,
      redaction_class: 'metadata_only'
    },
    raw_turn_ref: traceRef(envelope.traceId, `Telegram turn summary: ${envelope.selectedIntent.kind}/${envelope.selectedIntent.action || envelope.directive.mode}.`, 'private'),
    selected_move: move,
    intent_summary: `Telegram selected ${move} for ${envelope.selectedIntent.kind}; route evidence remains subordinate to fresh user intent.`,
    freshness: {
      fresh_user_intent_present: true,
      fresh_user_intent_ref: freshUserIntentRef,
      stale_state_used_as_authority: false,
      memory_used_as_instruction: false,
      pending_state_used_as_authority: false
    },
    evidence: actionEnvelope ? [...evidence, ...actionEnvelope.evidence] : evidence,
    action_authority: {
      state: authorityState,
      risk_tier: riskTier,
      confidence: confidenceValue(envelope),
      requires_human_confirmation: authorityState === 'confirmation_required',
      reason: authorityState === 'executable'
        ? 'Fresh Telegram intent, Harness Core authorization, and Governor consumer verification authorize execution.'
        : 'Telegram route evidence does not grant direct execution authority.'
    },
    proposed_actions: proposedAction ? [proposedAction] : [],
    blocked_routes: envelope.blockedCandidates.map((blocked, index) => ({
      route_id: safeId('route', `${blocked.route}:${index}`),
      reason: blocked.reason,
      evidence: evidenceRef(`${envelope.turnId}:blocked:${index}`, 'route_candidate', String(blocked.ownerSystem), blocked.reason, 0.85)
    })),
    context_policy: {
      raw_private_text_in_context: false,
      store_raw_turn: false,
      summary_required: true,
      offload_artifacts: []
    },
    trace: traceRef(envelope.traceId, 'Harness Core VNext envelope derived from Telegram evidence.')
  };
}

export function authorizeHarnessCoreAction(
  envelope: TurnIntentEnvelopeVNext,
  action: HarnessCoreProposedAction,
  input: HarnessCoreActionInput,
  legacyAuthorization: ToolAuthorizationResult,
  routeAllowed: boolean
): AuthorizationDecisionV1 {
  const highRisk = RISK_ORDER[action.risk_tier] >= RISK_ORDER.high;
  let verdict: AuthorizationDecisionV1['verdict'] = 'allow';
  const reasons: string[] = [];
  if (!routeAllowed) {
    verdict = 'deny';
    reasons.push('route_evidence_rejected');
  }
  if (legacyAuthorization.verdict !== 'allowed') {
    verdict = 'deny';
    reasons.push(...legacyAuthorization.reasonCodes);
  }
  const readOnlyAllowed = envelope.action_authority.state === 'read_only' && action.action_type === 'read';
  if (envelope.action_authority.state !== 'executable' && !readOnlyAllowed) {
    verdict = envelope.action_authority.state === 'confirmation_required' ? 'interrupt' : 'deny';
    reasons.push(`authority_state_${envelope.action_authority.state}`);
  }
  if (highRisk && verdict === 'allow') {
    verdict = 'interrupt';
    reasons.push('explicit_approval_required_for_high_risk_action');
  }

  const approvalRequired = verdict === 'interrupt' || highRisk;
  return {
    schema_version: 'authorization-decision-v1',
    wire_contract_version: HARNESS_CORE_WIRE_CONTRACT_VERSION,
    decision_id: safeId('decision', `${envelope.turn_id}:${action.action_id}`),
    created_at: nowIso(),
    turn_id: envelope.turn_id,
    action_id: action.action_id,
    capability_id: action.capability_id,
    verdict,
    risk_tier: action.risk_tier,
    reasons: reasons.length ? reasons : ['harness_core_authorized'],
    evidence: envelope.evidence,
    approval: {
      required: approvalRequired,
      status: approvalRequired ? 'requested' : 'not_required'
    },
    restrictions: {
      network_allowed: Boolean(input.externalNetwork) && verdict === 'allow',
      write_allowed: ['writes_files', 'writes_memory', 'creates_chip', 'creates_schedule', 'deletes_schedule'].includes(input.mutationClass) && verdict === 'allow',
      publish_allowed: Boolean(input.publishes) && verdict === 'allow'
    },
    trace: traceRef(envelope.trace.id, 'Harness Core authorization decision for Telegram action.')
  };
}

export function authorizeHarnessCoreTelegramAction(
  legacyEnvelope: TurnIntentEnvelopeV1,
  input: HarnessCoreActionInput,
  legacyAuthorization: ToolAuthorizationResult,
  routeAllowed: boolean
): HarnessCoreAuthorizationBundle {
  const legacyAllowed = routeAllowed && legacyAuthorization.verdict === 'allowed';
  const envelope = buildTurnIntentEnvelopeVNextFromTelegram(legacyEnvelope, input, legacyAllowed);
  const action = envelope.proposed_actions[0] || buildHarnessCoreAction(input, legacyEnvelope.turnId);
  const authorization = authorizeHarnessCoreAction(envelope, action, input, legacyAuthorization, routeAllowed);
  return { envelope, action, authorization };
}

export function recordHarnessCoreToolLedger(input: {
  envelope: TurnIntentEnvelopeVNext;
  action: HarnessCoreProposedAction;
  authorization: AuthorizationDecisionV1;
  toolName: string;
  status: ToolCallLedgerV1['result']['status'];
  summary: string;
}): ToolCallLedgerV1 {
  const createdAt = nowIso();
  const authorizeVerdict = input.authorization.verdict === 'allow'
    ? 'passed'
    : input.authorization.verdict === 'interrupt'
      ? 'pending'
      : 'failed';
  const outputRef = artifactRef(
    `${input.envelope.turn_id}:result:${input.toolName}`,
    'tool_output',
    `telegram://turns/${encodeURIComponent(input.envelope.turn_id)}/tool-output/${encodeURIComponent(input.toolName)}`,
    input.summary
  );
  const ledger: ToolCallLedgerV1 = {
    schema_version: 'tool-call-ledger-v1',
    wire_contract_version: HARNESS_CORE_WIRE_CONTRACT_VERSION,
    ledger_id: safeId('ledger', `${input.envelope.turn_id}:${input.action.action_id}:${input.toolName}`),
    created_at: createdAt,
    turn_id: input.envelope.turn_id,
    action_id: input.action.action_id,
    capability_id: input.action.capability_id,
    tool_name: input.toolName,
    lifecycle: [
      { stage: 'propose', at: input.envelope.created_at, verdict: 'passed', summary: 'Action was proposed through Harness Core evidence.' },
      { stage: 'authorize', at: input.authorization.created_at, verdict: authorizeVerdict, summary: input.authorization.reasons.join(', ') },
      { stage: 'execute', at: createdAt, verdict: 'skipped', summary: input.status === 'not_started' ? input.summary : 'Execution has not started before finalization.' }
    ],
    authorization: input.authorization,
    arguments: {
      schema_valid: true,
      raw_ref: input.action.args_ref,
      sanitized_ref: input.action.args_ref
    },
    result: {
      status: 'not_started',
      summary: input.status === 'not_started' ? input.summary : 'Tool execution has not started yet.',
      sanitized_output_ref: outputRef
    },
    trace: traceRef(input.envelope.trace.id, 'Harness Core tool ledger for Telegram action.')
  };
  if (input.status === 'not_started') return ledger;
  return finalizeHarnessCoreToolCallLedger({
    ledger,
    status: input.status,
    summary: input.summary,
    output_ref: outputRef,
    now: createdAt
  });
}
