import type { NaturalRouteDecision, NaturalRouteOwnerSystem } from './naturalRouteDecision';

export type TelegramIntentKindV2 =
  | 'slash_command'
  | 'answer_improvement_canary'
  | 'status_or_proof_readout'
  | 'advisor_answer'
  | 'memory_write'
  | 'memory_recall'
  | 'schedule_mutation'
  | 'access_status'
  | 'access_help'
  | 'access.level_change'
  | 'build_or_spawner'
  | 'recursive_or_swarm'
  | 'wiki_or_knowledge'
  | 'diagnostic_or_self_awareness'
  | 'creator_or_domain_chip'
  | 'runtime_truth_or_operator'
  | 'conversation_ideation'
  | 'plain_conversation'
  | 'unknown';

export interface TelegramIntentConstraintsV2 {
  noExecution: boolean;
  noPublish: boolean;
  noMerge: boolean;
  noPublicClaim: boolean;
  noNetworkAbsorptionClaim: boolean;
  localOnly: boolean;
}

export interface TelegramIntentCandidateV2 {
  kind: TelegramIntentKindV2;
  route: string;
  owner_system: NaturalRouteOwnerSystem;
  reason: string;
}

export interface TelegramIntentDecisionV2 {
  schema_version: 'spark.telegram.intent_decision.v2';
  kind: TelegramIntentKindV2;
  route: string;
  owner_system: NaturalRouteOwnerSystem;
  action: string;
  confidence: 'explicit' | 'contextual' | 'weak' | 'blocked';
  constraints: TelegramIntentConstraintsV2;
  payload: Record<string, unknown>;
  matched_signals: string[];
  blocked_candidates: TelegramIntentCandidateV2[];
  supporting_routes: string[];
  enforcement: 'enforce_safe' | 'observe' | 'blocked';
  natural_route?: NaturalRouteDecision | null;
}
