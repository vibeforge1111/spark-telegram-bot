import type { TelegramIntentDecisionV2, TelegramIntentKindV2 } from './intentContract';
import type { NaturalRouteOwnerSystem } from './naturalRouteDecision';
import type { DeterministicRouteId } from './routeTypes';
import {
  buildTelegramTurnIntentEnvelope,
  type SparkHarnessConversationKind,
  type TurnIntentEnvelopeV1
} from './harnessContract';
import {
  authorizeTelegramActionFromEnvelope,
  type TelegramActionAuthorityInput,
  type TelegramActionAuthorityResult
} from './telegramActionAuthority';

export interface TelegramCommandActionAuthorityInput extends TelegramActionAuthorityInput {
  commandName: string;
  userRef: string;
  chatRef: string;
  accessProfile: string;
  conversationKind?: SparkHarnessConversationKind;
  action?: string;
  kind?: TelegramIntentKindV2;
}

function commandExecutionStopBoundary(text: string, action = ''): boolean {
  const normalized = text.toLowerCase().replace(/\s+/g, ' ').trim();
  const stopsExecution =
    /\b(?:do not|don't|dont|please don't|please dont|no need to)\s+(?:run|start|launch|execute|queue|dispatch|kick\s+off|schedule|change|set|switch|raise|lower|enable|disable|promote|improve|upgrade|fix|repair|reflect|process|probe|test|check|install|configure|setup|set\s+up|onboard|prepare|connect)\b/.test(normalized) ||
    /\b(?:no|not)\s+(?:run|execution|launch|schedule|scheduling|access\s+change|setup|set\s+up|onboarding|installing|configuration|enable|disable|reflection|processing|probing|testing|checking)(?:\s+(?:yet|for\s+now|right\s+now))?\b/.test(normalized);
  const stopsCreation =
    /\b(?:do not|don't|dont|please don't|please dont|no need to)\s+(?:build|create|make|scaffold|generate)\s+(?:yet|for\s+now|anything|something|new\s+work|a\s+mission|a\s+build|a\s+project|a\s+domain[-\s]*chip|a\s+chip|the\s+mission|the\s+build|the\s+project|the\s+domain[-\s]*chip|the\s+chip|it|this|that)\b/.test(normalized) ||
    /\b(?:no|not)\s+(?:build|create|creation|scaffold|generation)(?:ing)?\s+(?:yet|for\s+now|right\s+now)\b/.test(normalized);
  const stopsMemoryWrite =
    /\b(?:do not|don't|dont|please don't|please dont|no need to)\s+(?:save|write|remember|store|forget|delete)\s+(?:memory|this|that|anything|something)\b/.test(normalized) ||
    /\b(?:no|not)\s+(?:memory\s+write|memory\s+save|memory\s+delete|remembering|saving|forgetting|deleting)(?:\s+(?:yet|for\s+now|right\s+now))?\b/.test(normalized);
  const stopsPlanning =
    /\b(?:do not|don't|dont|please don't|please dont|no need to)\s+(?:plan|stage|prepare)\b/.test(normalized);
  const planOnlyAction = /\b(?:plan|stage|prepare)\b/i.test(action);

  return Boolean(
    stopsCreation ||
    stopsMemoryWrite ||
    stopsPlanning ||
    (stopsExecution && !(planOnlyAction && !stopsPlanning))
  );
}

function commandPublishBoundary(text: string): boolean {
  return /\b(?:do not|don't|dont|please don't|please dont|no need to)\s+(?:publish|share|ship|deploy|release)\b/i.test(text) ||
    /\b(?:local[-\s]*only|private|no\s+public|not\s+public)\b/i.test(text);
}

function commandLocalOnlyBoundary(text: string): boolean {
  return /\b(?:local[-\s]*only|private|offline|no\s+network|without\s+network|do not use external network)\b/i.test(text);
}

function commandDecision(input: TelegramCommandActionAuthorityInput): TelegramIntentDecisionV2 {
  const kind = input.kind || 'slash_command';
  const action = input.action || input.route;
  const noExecution = commandExecutionStopBoundary(input.text, action);
  const noPublish = commandPublishBoundary(input.text);
  const localOnly = commandLocalOnlyBoundary(input.text);
  return {
    schema_version: 'spark.telegram.intent_decision.v2',
    kind,
    route: input.route,
    owner_system: input.ownerSystem as NaturalRouteOwnerSystem,
    action,
    confidence: noExecution ? 'blocked' : 'explicit',
    constraints: {
      noExecution,
      noPublish,
      noMerge: false,
      noPublicClaim: noPublish,
      noNetworkAbsorptionClaim: noPublish,
      localOnly
    },
    payload: {
      selectedBy: 'telegram_slash_command',
      commandName: input.commandName,
      ...(input.externalNetwork ? { externalNetwork: true } : {})
    },
    matched_signals: [
      'telegram_slash_command',
      `${input.commandName.replace(/^\/+/, '')}:${action}`,
      ...(noExecution ? ['slash_command_execution_stop_boundary'] : []),
      ...(noPublish ? ['slash_command_publish_boundary'] : []),
      ...(localOnly ? ['slash_command_local_only_boundary'] : [])
    ],
    blocked_candidates: [],
    supporting_routes: [],
    enforcement: noExecution ? 'blocked' : 'observe',
    natural_route: null
  };
}

export function buildTelegramCommandActionEnvelope(
  input: TelegramCommandActionAuthorityInput
): TurnIntentEnvelopeV1 {
  return buildTelegramTurnIntentEnvelope({
    text: input.text,
    decision: commandDecision(input),
    userRef: input.userRef,
    chatRef: input.chatRef,
    accessProfile: input.accessProfile,
    conversationKind: input.conversationKind || 'command'
  });
}

export function authorizeTelegramCommandAction(
  input: TelegramCommandActionAuthorityInput
): TelegramActionAuthorityResult {
  const envelope = buildTelegramCommandActionEnvelope(input);
  return authorizeTelegramActionFromEnvelope(envelope, input);
}

export function commandRouteForRunVariant(input: {
  commandName: string;
  isBuild: boolean;
}): DeterministicRouteId {
  return input.isBuild ? 'spawner.build' : 'natural_run';
}
