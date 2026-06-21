// MODEL-AS-ROUTER decision - the proven pattern (Claude Code / Codex / Hermes / CaMeL): the MODEL
// decides the route, a deterministic kernel disposes. This REPLACES the regex cascade as the decider
// and makes the separate anti-hijack "veto" and the recall "nudge" UNNECESSARY:
//   - a hijack is simply a turn the model does NOT route to an action (-> chat)
//   - a missed command is simply one the model DOES route (-> dispatch)
// One rule instead of three layers (regex route + veto + nudge).
//
// Input: the model's IntentProposal (from the existing proposer, which reads ONLY the fresh user turn;
// memory/quoted/tool text is data, never a command). Output: dispatch | confirm | chat. Any dispatch
// still goes through the deterministic authority kernel (envelope -> Governor -> ledger) - the model
// proposes, the kernel disposes. Pure + unit-tested; fail-safe unless a fresh deterministic owner
// route already parsed from the latest user turn can carry the fallback without using stale text.

import {
  extractPlainChatMemoryDirective,
  hasLocalOptionReference,
  isDiagnosticsScanRequest,
  isUserMemoryRecallQuestion,
  shouldPreferConversationalIdeation
} from './conversationIntent';
import type { IntentProposal } from './intentProposerShadow';

export type RouteMode = 'dispatch' | 'confirm' | 'chat';

export interface ModelRouteDecision {
  mode: RouteMode;
  route?: string;
  confidence?: number;
  reason: string;
}

export interface DeterministicOwnerRoute {
  route?: string | null;
  confidence?: string | null;
  contextSource?: string | null;
  context_source?: string | null;
  mutationReferent?: string | null;
  mutation_referent?: string | null;
  requiresConfirmation?: boolean | null;
  requires_confirmation?: boolean | null;
  payload?: Record<string, unknown> | null;
}

// High-blast-radius mutations: always confirm before executing even when the model is confident
// (irreversibility-scaled confirmation). Everything else dispatches directly; the kernel still
// authorizes. Reads are not here - they dispatch freely.
export const CONFIRM_ROUTES = new Set<string>([
  'access.change',
  'schedule.delete',
  'recursive.proposal'
]);

// Pure-conversation routes: the model says "this is not a command." -> chat. This is what makes a
// separate anti-hijack veto unnecessary - the router never sends these to a tool.
export const CHAT_ROUTES = new Set<string>([
  'conversation.ideation',
  'plain_chat',
  'abstain'
]);

export interface ModelRouteOptions {
  dispatchMin?: number;        // confidence required to act on an action route
  readDispatchMin?: number;    // confidence required for local read routes
  confirmRoutes?: Set<string>;
  chatRoutes?: Set<string>;
  localReadRoutes?: Set<string>;
  text?: string;
  deterministicRoute?: DeterministicOwnerRoute | null;
}

export const DEFAULT_DISPATCH_MIN_CONFIDENCE = 0.75;
export const DEFAULT_READ_DISPATCH_MIN_CONFIDENCE = 0.65;

// Local owner-backed reads are allowed to use a lower confidence floor than
// mutations because the deterministic kernel still proves the read authority
// and side effects remain blocked. External-network reads are deliberately not
// here; uncertainty around those should still fall back to chat.
export const LOCAL_READ_ROUTES = new Set<string>([
  'access.status',
  'build_context.recall',
  'memory.recall',
  'spawner.board',
  'spark.read_only_state',
  'spark_wiki.answer',
  'spark_wiki.inventory',
  'spark_wiki.query',
  'spark_wiki.status'
]);

// Deterministic owner routes that have already been parsed from the latest user turn
// and have governed tool contracts. These may survive proposer abstention, but only
// when the source is fresh and explicit. Broad build/mission routes stay model-gated.
export const FRESH_DETERMINISTIC_DISPATCH_ROUTES = new Set<string>([
  'access.change',
  'build_context.recall',
  'diagnostics.followup_test',
  'external_research.inspect',
  'memory.write',
  'memory.recall',
  'mission_updates.preference',
  'model.switch',
  'natural_run',
  'operator.safe_action',
  'schedule.create',
  'spawner.board',
  'spark_wiki.answer',
  'spark_wiki.inventory',
  'spark_wiki.query',
  'spark_wiki.status',
  'spark_wiki.promote'
]);

// If the model provider is unavailable and gives no opinion at all, let a small
// set of owner-parsed fresh routes survive so provider health cannot turn clear
// commands into unrelated chat. A model route to plain_chat still wins below,
// so quoted/reported text and source-boundary hijacks stay inert.
const NO_MODEL_FALLBACK_DETERMINISTIC_ROUTES = new Set<string>([
  ...FRESH_DETERMINISTIC_DISPATCH_ROUTES,
  'creator.mission',
  'domain_chip.create',
  'access.change',
  'spawner.build',
  'sparkqa.pause',
  'sparkqa.run'
]);

const NO_MODEL_FALLBACK_PREVIEW_ROUTES = new Set<string>([
  'creator.mission',
  'domain_chip.create',
  'sparkqa.pause'
]);

const FRESH_DETERMINISTIC_ROUTE_CONTEXT_SOURCES = new Map<string, Set<string>>([
  ['access.change', new Set(['hot_recent_turns'])],
  ['build_context.recall', new Set(['hot_recent_turns'])],
  ['memory.recall', new Set(['cold_memory', 'hot_recent_turns'])],
  ['spark_wiki.answer', new Set(['cold_memory'])],
  ['spark_wiki.query', new Set(['cold_memory'])]
]);

const NO_MODEL_FALLBACK_ROUTE_CONTEXT_SOURCES = new Map<string, Set<string>>([
  ['build_context.recall', new Set(['hot_recent_turns'])],
  ['creator.mission', new Set(['hot_recent_turns'])],
  ['memory.recall', new Set(['cold_memory', 'hot_recent_turns'])],
  ['spark_wiki.answer', new Set(['cold_memory'])],
  ['spark_wiki.query', new Set(['cold_memory'])],
  ['sparkqa.pause', new Set(['hot_recent_turns'])]
]);

function isNonOperatorAccessChange(route: string, payload: Record<string, unknown> | null | undefined): boolean {
  if (route !== 'access.change') return false;
  const level = String(payload?.level || '').toLowerCase().replace(/\s+/g, ' ').trim();
  if (!level) return false;
  return !['5', 'five', 'operator', 'full access', 'level 5', 'access 5'].includes(level);
}

function routeTextBoundary(route: string, text?: string): ModelRouteDecision | null {
  if (!text) return null;
  const normalized = text.toLowerCase().replace(/\s+/g, ' ').trim();
  if (!LOCAL_READ_ROUTES.has(route) && isQuestionFramedActionDiscussion(normalized)) {
    return {
      mode: 'chat',
      route: 'plain_chat',
      reason: 'fresh_text_is_action_discussion_question'
    };
  }
  if (route === 'diagnostics.scan' && !isDiagnosticsScanRequest(text)) {
    return {
      mode: 'chat',
      route,
      reason: 'fresh_text_not_diagnostics_scan_request'
    };
  }
  if (route === 'memory.write' && !extractPlainChatMemoryDirective(text)) {
    return {
      mode: 'chat',
      route,
      reason: 'fresh_text_not_memory_write_request'
    };
  }
  if (route === 'schedule.create' && isScheduleReadRequest(normalized)) {
    return {
      mode: 'chat',
      route,
      reason: 'fresh_text_is_schedule_read_request'
    };
  }
  if (
    (route === 'memory.recall' || route === 'spark.read_only_state') &&
    shouldPreferConversationalIdeation(text) &&
    !isUserMemoryRecallQuestion(text)
  ) {
    return {
      mode: 'chat',
      route: 'conversation.ideation',
      reason: 'fresh_text_is_open_ended_ideation'
    };
  }
  if (!LOCAL_READ_ROUTES.has(route) && hasLocalOptionReference(text)) {
    return {
      mode: 'chat',
      route: 'conversation.ideation',
      reason: 'fresh_text_is_local_option_reference'
    };
  }
  return null;
}

function isScheduleReadRequest(normalized: string): boolean {
  const mentionsSchedule = /\b(?:schedule|schedules|scheduled\s+(?:jobs?|tasks?|reminders?|automations?)|recurring\s+(?:jobs?|tasks?|reminders?|automations?))\b/.test(normalized);
  if (!mentionsSchedule) return false;
  return /\b(?:show|list|view|display|see|check|read|what(?:'s|\s+is|\s+are)?|which|current|active|existing)\b/.test(normalized);
}

function isQuestionFramedActionDiscussion(normalized: string): boolean {
  if (!normalized) return false;
  const explicitRequest =
    /^(?:please\s+|go\s+ahead(?:\s+and)?\s+|actually\s+|now\s+)?(?:build|create|make|run|start|launch|execute|delete|cancel|remove|schedule|switch|change|set|remember|forget|research|open)\b/.test(normalized) ||
    /^(?:can|could|would)\s+you\s+(?:please\s+)?(?:build|create|make|run|start|launch|execute|delete|cancel|remove|schedule|switch|change|set|remember|forget|research|open)\b/.test(normalized);
  if (explicitRequest) return false;
  return (
    /^(?:how|why|what|when|whether)\b/.test(normalized) ||
    /^(?:should|would)\s+(?:i|we|you|spark|it|that|this)\b/.test(normalized) ||
    /^what\s+if\b/.test(normalized) ||
    /^(?:is|are|do|does|did)\b.{0,90}\b(?:good\s+idea|safe|allowed|possible|should|would|could|happen)\b/.test(normalized)
  );
}

function freshDeterministicDecision(
  deterministicRoute: DeterministicOwnerRoute | null | undefined,
  confirmRoutes: Set<string>,
  allowedRoutes: Set<string> = FRESH_DETERMINISTIC_DISPATCH_ROUTES,
  allowedContextSources: Set<string> = new Set(['latest_message']),
  confirmationBypassRoutes: Set<string> = new Set(),
  routeContextSources: Map<string, Set<string>> = new Map()
): ModelRouteDecision | null {
  if (!deterministicRoute) return null;
  const route = deterministicRoute.route || null;
  if (!route) return null;
  const contextSource = deterministicRoute.contextSource || deterministicRoute.context_source || 'latest_message';
  const mutationReferent = deterministicRoute.mutationReferent || deterministicRoute.mutation_referent || 'fresh_turn';
  const requiresConfirmation = Boolean(deterministicRoute.requiresConfirmation ?? deterministicRoute.requires_confirmation);
  const routeAllowedContextSources = routeContextSources.get(route);
  const allowedByPayload = route === 'spawner.build' && deterministicRoute.payload?.noEditProbe === true;
  if (!allowedContextSources.has(contextSource) && !routeAllowedContextSources?.has(contextSource)) return null;
  const isRouteScopedContextual = deterministicRoute.confidence === 'contextual' && routeAllowedContextSources?.has(contextSource);
  if (deterministicRoute.confidence !== 'explicit' && !isRouteScopedContextual) return null;
  if (mutationReferent !== 'fresh_turn') return null;
  const bypassConfirmation = confirmationBypassRoutes.has(route) || isNonOperatorAccessChange(route, deterministicRoute.payload);
  if ((requiresConfirmation && !bypassConfirmation) || (confirmRoutes.has(route) && !bypassConfirmation)) {
    return null;
  }
  if (!allowedRoutes.has(route) && !allowedByPayload) {
    return null;
  }
  return {
    mode: 'dispatch',
    route,
    reason: 'fresh_deterministic_owner_route'
  };
}

export function decideModelRoute(
  proposal: IntentProposal | null,
  opts: ModelRouteOptions = {}
): ModelRouteDecision {
  const dispatchMin = opts.dispatchMin ?? DEFAULT_DISPATCH_MIN_CONFIDENCE;
  const readDispatchMin = opts.readDispatchMin ?? DEFAULT_READ_DISPATCH_MIN_CONFIDENCE;
  const confirmRoutes = opts.confirmRoutes ?? CONFIRM_ROUTES;
  const chatRoutes = opts.chatRoutes ?? CHAT_ROUTES;
  const localReadRoutes = opts.localReadRoutes ?? LOCAL_READ_ROUTES;
  const deterministicDecision = freshDeterministicDecision(
    opts.deterministicRoute,
    confirmRoutes,
    FRESH_DETERMINISTIC_DISPATCH_ROUTES,
    new Set(['latest_message']),
    new Set(),
    FRESH_DETERMINISTIC_ROUTE_CONTEXT_SOURCES
  );
  const noModelFallbackDecision = freshDeterministicDecision(
    opts.deterministicRoute,
    confirmRoutes,
    NO_MODEL_FALLBACK_DETERMINISTIC_ROUTES,
    new Set(['latest_message', 'visible_exact_artifact']),
    NO_MODEL_FALLBACK_PREVIEW_ROUTES,
    NO_MODEL_FALLBACK_ROUTE_CONTEXT_SOURCES
  );

  // No model opinion (provider down / unparseable) or explicit abstain -> chat. Fail-safe: the router
  // never fabricates an action it could not read. (A high-blast action attempted via a down provider
  // would simply not route; the user can restate it - safe, not silently executed.)
  if (!proposal) return noModelFallbackDecision || { mode: 'chat', reason: 'no_model_opinion' };
  if (proposal.abstain) return deterministicDecision || { mode: 'chat', reason: 'model_abstained' };

  const top = proposal.candidates[0];
  if (!top) return deterministicDecision || { mode: 'chat', reason: 'no_candidate' };

  // The model read it as conversation (or a hijack it correctly refused to treat as a command).
  if (chatRoutes.has(top.route)) {
    return deterministicDecision || { mode: 'chat', route: top.route, confidence: top.confidence, reason: 'model_routed_to_chat' };
  }
  const textBoundary = routeTextBoundary(top.route, opts.text);
  if (textBoundary) return deterministicDecision || { ...textBoundary, confidence: top.confidence };
  if (localReadRoutes.has(top.route)) {
    if (top.confidence < readDispatchMin) {
      return deterministicDecision || { mode: 'chat', route: top.route, confidence: top.confidence, reason: 'below_read_dispatch_confidence' };
    }
    return { mode: 'dispatch', route: top.route, confidence: top.confidence, reason: 'model_routed_to_local_read' };
  }
  // It looks like an action but the model is not confident enough to act -> chat (clarify in prose).
  if (top.confidence < dispatchMin) {
    return deterministicDecision || { mode: 'chat', route: top.route, confidence: top.confidence, reason: 'below_dispatch_confidence' };
  }
  // High-blast-radius mutation -> one explicit confirm before the kernel executes it.
  if (confirmRoutes.has(top.route)) {
    return { mode: 'confirm', route: top.route, confidence: top.confidence, reason: 'high_blast_radius_confirm' };
  }
  // Reads + low-blast mutations -> dispatch (the kernel still authorizes).
  return { mode: 'dispatch', route: top.route, confidence: top.confidence, reason: 'model_routed_to_action' };
}
