import type { TelegramIntentDecisionV2, TelegramIntentKindV2 } from './intentContract';
import type { NaturalRouteOwnerSystem } from './naturalRouteDecision';
import type { DeterministicRouteId } from './routeTypes';
import {
  buildTelegramTurnIntentEnvelope,
  type SparkHarnessConversationKind,
  type SparkHarnessMutationClass,
  type TurnIntentEnvelopeV1
} from './harnessContract';
import {
  authorizeTelegramActionFromEnvelope,
  type TelegramActionAuthorityResult
} from './telegramActionAuthority';

export interface TelegramMediaActionAuthorityInput {
  route: DeterministicRouteId;
  text: string;
  toolName: string;
  ownerSystem: NaturalRouteOwnerSystem;
  mutationClass: SparkHarnessMutationClass;
  userRef: string;
  chatRef: string;
  accessProfile: string;
  conversationKind?: SparkHarnessConversationKind;
  action?: string;
  kind?: TelegramIntentKindV2;
  externalNetwork?: boolean;
}

export function mediaIngestStopBoundary(text: string): boolean {
  const normalized = text.toLowerCase().replace(/\s+/g, ' ').trim();
  return (
    /\b(?:do not|don't|dont|please don't|please dont|no need to)\s+(?:analy[sz]e|inspect|read|describe|process|transcribe|listen(?:\s+to)?)\b/.test(normalized) ||
    /\b(?:no|not)\s+(?:image|photo|screenshot|voice|audio)?\s*(?:analysis|inspection|description|transcription|listening|processing)\b/.test(normalized)
  );
}

function mediaDecision(input: TelegramMediaActionAuthorityInput): TelegramIntentDecisionV2 {
  const noExecution = mediaIngestStopBoundary(input.text);
  const action = input.action || input.route;
  return {
    schema_version: 'spark.telegram.intent_decision.v2',
    kind: input.kind || 'runtime_truth_or_operator',
    route: input.route,
    owner_system: input.ownerSystem,
    action,
    confidence: noExecution ? 'blocked' : 'explicit',
    constraints: {
      noExecution,
      noPublish: false,
      noMerge: false,
      noPublicClaim: false,
      noNetworkAbsorptionClaim: false,
      localOnly: false
    },
    payload: {
      selectedBy: 'telegram_media_input'
    },
    matched_signals: [
      'telegram_media_input',
      action,
      ...(noExecution ? ['media_ingest_stop_boundary'] : [])
    ],
    blocked_candidates: [],
    supporting_routes: [],
    enforcement: noExecution ? 'blocked' : 'observe',
    natural_route: null
  };
}

export function buildTelegramMediaActionEnvelope(input: TelegramMediaActionAuthorityInput): TurnIntentEnvelopeV1 {
  return buildTelegramTurnIntentEnvelope({
    text: input.text,
    decision: mediaDecision(input),
    userRef: input.userRef,
    chatRef: input.chatRef,
    accessProfile: input.accessProfile,
    conversationKind: input.conversationKind || 'dm'
  });
}

export function authorizeTelegramMediaAction(input: TelegramMediaActionAuthorityInput): TelegramActionAuthorityResult {
  const envelope = buildTelegramMediaActionEnvelope(input);
  return authorizeTelegramActionFromEnvelope(envelope, {
    route: input.route,
    text: input.text,
    toolName: input.toolName,
    ownerSystem: input.ownerSystem,
    mutationClass: input.mutationClass,
    externalNetwork: input.externalNetwork
  });
}
