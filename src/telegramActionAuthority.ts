import {
  authorizeToolCallFromEnvelope,
  type ToolAuthorizationInput,
  type ToolAuthorizationResult,
  type TurnIntentEnvelopeV1
} from './harnessContract';
import {
  authorizeHarnessCoreTelegramAction,
  type AuthorizationDecisionV1,
  type GovernorDecisionV1,
  type HarnessCoreProposedAction,
  type ToolCallLedgerV1,
  type TurnIntentEnvelopeVNext
} from './harnessCoreVNext';
import {
  createHarnessCoreGovernorDecision,
  verifyHarnessCoreGovernorToolAuthority,
  type HarnessCoreGovernorConsumerVerification,
  verifyHarnessCoreGovernorExecutionAuthority
} from '@spark/harness-core';
import { governorHmacKey, governorHmacKeyId, signGovernorDecisionIfConfigured } from './governorSignature';
import { recordHarnessCoreAuthorizationLedger } from './harnessCoreLedger';
import type { DeterministicRouteId } from './routeTypes';

export interface RouteEvidenceVerdict {
  allow: boolean;
  reason: 'envelope_selected_route' | 'route_not_selected_by_turn_envelope';
  confidence: 'explicit' | 'blocked';
}

export interface TelegramActionAuthorityInput extends ToolAuthorizationInput {
  route: DeterministicRouteId;
  text: string;
}

export interface TelegramActionAuthorityResult {
  allow: boolean;
  legacyEnvelope?: TurnIntentEnvelopeV1;
  routeVerdict: RouteEvidenceVerdict;
  toolAuthorization: ToolAuthorizationResult;
  harnessCore?: {
    envelope: TurnIntentEnvelopeVNext;
    action: HarnessCoreProposedAction;
    authorization: AuthorizationDecisionV1;
  };
  harnessCoreLedger?: ToolCallLedgerV1;
  governorDecision?: GovernorDecisionV1;
  consumerVerification?: HarnessCoreGovernorConsumerVerification;
  reasonCodes: string[];
}

const ROUTE_ALIASES: Record<string, string[]> = {
  'recursive.proposal': ['recursive.propose'],
  'spawner.board': [
    'spawner.board/active_missions',
    'spawner.board/latest_failure',
    'spawner.board/latest_failed_provider',
    'spawner.board/latest_mission',
    'spawner.board/latest_on_kanban',
    'spawner.board/latest_project_preview',
    'spawner.board/latest_provider',
    'spawner.active_missions',
    'spawner.latest_failure',
    'spawner.latest_failed_provider',
    'spawner.latest_mission',
    'spawner.latest_on_kanban',
    'spawner.latest_project_preview',
    'spawner.latest_provider'
  ],
  'spawner.local_service': ['local_service.clarify', 'local_service.open'],
  'spawner.external_research': ['external_research.inspect'],
  'spark.wiki': ['spark_wiki.promote', 'spark_wiki.status', 'spark_wiki.inventory', 'spark_wiki.query', 'spark_wiki.answer'],
};

function routeMatchesCandidate(inputRoute: string, candidateRoute: string): boolean {
  if (inputRoute === candidateRoute) return true;
  if (inputRoute === 'spawner.board' && candidateRoute.startsWith('spawner.board/')) return true;
  return (ROUTE_ALIASES[inputRoute] || []).includes(candidateRoute);
}

function envelopeSelectedRoute(envelope: TurnIntentEnvelopeV1 | null | undefined, inputRoute: string): boolean {
  if (!envelope) return false;
  const selectedAction = envelope.selectedIntent.action;
  if (selectedAction && routeMatchesCandidate(inputRoute, selectedAction)) return true;
  const selectedRoute = envelope.candidates[0]?.route;
  if (selectedRoute && routeMatchesCandidate(inputRoute, selectedRoute)) return true;
  return false;
}

function governorSignatureVerificationOptions(): {
  governor_hmac_key: string | null;
  governor_hmac_key_id: string | null;
  require_signature: boolean;
} {
  const key = governorHmacKey();
  return {
    governor_hmac_key: key || null,
    governor_hmac_key_id: key ? governorHmacKeyId() : null,
    require_signature: Boolean(key)
  };
}

export function governorOutcomeAllowsTelegramAction(
  governorDecision: GovernorDecisionV1 | null | undefined,
  action: HarnessCoreProposedAction | null | undefined,
  toolName?: string
): boolean {
  if (!action) return false;
  return verifyHarnessCoreGovernorExecutionAuthority({
    governor_decision: governorDecision ?? null,
    expected_capability_id: action.capability_id,
    expected_action_type: action.action_type,
    tool_name: toolName,
    action_id: action.action_id,
    allow_read_only: action.action_type === 'read',
    ...governorSignatureVerificationOptions()
  }).allowed;
}

export function authorizeTelegramActionFromEnvelope(
  envelope: TurnIntentEnvelopeV1 | null | undefined,
  input: TelegramActionAuthorityInput
): TelegramActionAuthorityResult {
  const routeSelectedByEnvelope = envelopeSelectedRoute(envelope, input.route);
  const routeVerdict: RouteEvidenceVerdict = routeSelectedByEnvelope
    ? { allow: true, reason: 'envelope_selected_route', confidence: 'explicit' }
    : { allow: false, reason: 'route_not_selected_by_turn_envelope', confidence: 'blocked' };
  const routeAuthorizedByTurn = routeSelectedByEnvelope;
  const rawToolAuthorization = authorizeToolCallFromEnvelope(envelope, {
    toolName: input.toolName,
    ownerSystem: input.ownerSystem,
    mutationClass: input.mutationClass,
    publishes: input.publishes,
    externalNetwork: input.externalNetwork
  });
  const toolAuthorization: ToolAuthorizationResult = routeAuthorizedByTurn
    ? rawToolAuthorization
    : {
        verdict: 'blocked',
        reasonCodes: Array.from(new Set([
          'route_not_selected_by_turn_envelope',
          ...rawToolAuthorization.reasonCodes
        ]))
      };
  const harnessCore = envelope
    ? authorizeHarnessCoreTelegramAction(
        envelope,
        input,
        toolAuthorization,
        routeAuthorizedByTurn
      )
    : null;
  const preliminaryAllow =
    routeAuthorizedByTurn &&
    toolAuthorization.verdict === 'allowed' &&
    harnessCore?.authorization.verdict === 'allow';
  const harnessCoreLedger = harnessCore
    ? recordHarnessCoreAuthorizationLedger({
        bundle: harnessCore,
        toolName: input.toolName,
        allowed: preliminaryAllow
      })
    : null;
  const governorDecision = harnessCore
    ? signGovernorDecisionIfConfigured(createHarnessCoreGovernorDecision({
        envelope: harnessCore.envelope,
        authorizations: [harnessCore.authorization],
        tool_ledgers: harnessCoreLedger ? [harnessCoreLedger] : []
      }))
    : null;
  const consumerVerification = harnessCore?.action
    ? verifyHarnessCoreGovernorToolAuthority({
        governor_decision: governorDecision,
        owner_system: input.ownerSystem,
        tool_name: input.toolName,
        action_type: harnessCore.action.action_type,
        action_id: harnessCore.action.action_id,
        allow_read_only: harnessCore.action.action_type === 'read',
        require_pre_execution_ledger: true,
        ...governorSignatureVerificationOptions()
      })
    : null;
  const allow = consumerVerification?.allowed === true;
  const reasonCodes = Array.from(new Set([
    ...(routeAuthorizedByTurn ? [] : ['route_not_selected_by_turn_envelope']),
    ...toolAuthorization.reasonCodes,
    ...(!allow && envelope?.directive.noExecution ? ['no_execution_boundary'] : []),
    ...(harnessCore && harnessCore.authorization.verdict !== 'allow'
      ? harnessCore.authorization.reasons.map((reason) => `harness_core:${reason}`)
      : []),
    ...(consumerVerification && !consumerVerification.allowed
      ? consumerVerification.reason_codes.map((reason) => `governor:${reason}`)
      : []),
    ...(harnessCore ? [] : ['harness_core:missing_or_invalid_envelope'])
  ]));

  return {
    allow,
    ...(envelope ? { legacyEnvelope: envelope } : {}),
    routeVerdict,
    toolAuthorization,
    ...(harnessCore ? { harnessCore } : {}),
    ...(harnessCoreLedger ? { harnessCoreLedger } : {}),
    ...(governorDecision ? { governorDecision } : {}),
    ...(consumerVerification ? { consumerVerification } : {}),
    reasonCodes
  };
}
