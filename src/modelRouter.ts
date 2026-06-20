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
// proposes, the kernel disposes. Pure + unit-tested; fail-safe (no model opinion -> chat, never invents
// an action).

import type { IntentProposal } from './intentProposerShadow';

export type RouteMode = 'dispatch' | 'confirm' | 'chat';

export interface ModelRouteDecision {
  mode: RouteMode;
  route?: string;
  confidence?: number;
  reason: string;
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
}

export const DEFAULT_DISPATCH_MIN_CONFIDENCE = 0.75;
export const DEFAULT_READ_DISPATCH_MIN_CONFIDENCE = 0.65;

// Local owner-backed reads are allowed to use a lower confidence floor than
// mutations because the deterministic kernel still proves the read authority
// and side effects remain blocked. External-network reads are deliberately not
// here; uncertainty around those should still fall back to chat.
export const LOCAL_READ_ROUTES = new Set<string>([
  'access.status',
  'memory.recall',
  'spawner.board',
  'spark.read_only_state',
  'spark_wiki.answer'
]);

export function decideModelRoute(
  proposal: IntentProposal | null,
  opts: ModelRouteOptions = {}
): ModelRouteDecision {
  const dispatchMin = opts.dispatchMin ?? DEFAULT_DISPATCH_MIN_CONFIDENCE;
  const readDispatchMin = opts.readDispatchMin ?? DEFAULT_READ_DISPATCH_MIN_CONFIDENCE;
  const confirmRoutes = opts.confirmRoutes ?? CONFIRM_ROUTES;
  const chatRoutes = opts.chatRoutes ?? CHAT_ROUTES;
  const localReadRoutes = opts.localReadRoutes ?? LOCAL_READ_ROUTES;

  // No model opinion (provider down / unparseable) or explicit abstain -> chat. Fail-safe: the router
  // never fabricates an action it could not read. (A high-blast action attempted via a down provider
  // would simply not route; the user can restate it - safe, not silently executed.)
  if (!proposal) return { mode: 'chat', reason: 'no_model_opinion' };
  if (proposal.abstain) return { mode: 'chat', reason: 'model_abstained' };

  const top = proposal.candidates[0];
  if (!top) return { mode: 'chat', reason: 'no_candidate' };

  // The model read it as conversation (or a hijack it correctly refused to treat as a command).
  if (chatRoutes.has(top.route)) {
    return { mode: 'chat', route: top.route, confidence: top.confidence, reason: 'model_routed_to_chat' };
  }
  if (localReadRoutes.has(top.route)) {
    if (top.confidence < readDispatchMin) {
      return { mode: 'chat', route: top.route, confidence: top.confidence, reason: 'below_read_dispatch_confidence' };
    }
    return { mode: 'dispatch', route: top.route, confidence: top.confidence, reason: 'model_routed_to_local_read' };
  }
  // It looks like an action but the model is not confident enough to act -> chat (clarify in prose).
  if (top.confidence < dispatchMin) {
    return { mode: 'chat', route: top.route, confidence: top.confidence, reason: 'below_dispatch_confidence' };
  }
  // High-blast-radius mutation -> one explicit confirm before the kernel executes it.
  if (confirmRoutes.has(top.route)) {
    return { mode: 'confirm', route: top.route, confidence: top.confidence, reason: 'high_blast_radius_confirm' };
  }
  // Reads + low-blast mutations -> dispatch (the kernel still authorizes).
  return { mode: 'dispatch', route: top.route, confidence: top.confidence, reason: 'model_routed_to_action' };
}
