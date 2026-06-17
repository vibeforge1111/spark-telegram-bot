// Phase 2 (scoped enforcement) - the calibrated mid-band, decision-only.
//
// Shadow measurement (live Telegram + a 20-case QA batch) showed the proposer recovers real tool
// intents the regex cascade drops to chat (regex 7/20 vs proposer 19/20). This converts the
// highest-confidence, proven recall holes from "silent plain_chat" into a one-line nudge the user
// can confirm - the mid tier of high->route / mid->clarify / low->chat. It is deliberately SCOPED:
//
//   it fires ONLY when (a) the regex chose a no-action/chat route, (b) the proposer's top route is
//   in a small allowlist of proven recall wins, (c) confidence clears a high bar, and (d) the
//   proposer did not abstain.
//
// It NEVER fires on a turn the regex already routed to an action (so it cannot fight a real route),
// and it NEVER itself executes - it returns a suggestion string; execution still requires a fresh
// user turn through the deterministic kernel. This is pure and unit-tested; the live handler wiring
// is env-gated (SPARK_INTENT_PROPOSER_ENFORCE) and applied only on chat-bound turns.

import type { IntentProposal } from './intentProposerShadow';

// Routes where the bot would otherwise just talk (no tool). Only these are eligible for a nudge.
export const NO_ACTION_ROUTES = new Set<string>([
  'plain_chat',
  'chat_plan',
  'conversation.builder_chat',
  'conversation.local_chat',
  'conversation.ideation',
  'conversation.provider_fallback_chat'
]);

// The proven, unambiguous recall wins to start with. Expand only after a route-id reconciliation
// pass + more corpus (e.g. external research uses two different ids in the tree today).
export const DEFAULT_ENFORCE_ALLOWLIST = new Set<string>([
  'diagnostics.scan',
  'memory.write',
  // Expanded 2026-06-17 after the 39-case corpus showed the proposer recovers these recall holes
  // at high confidence while the regex drops them to chat. All still nudge-only (no execution).
  'memory.delete',
  'model.switch',
  'schedule.create',
  'schedule.delete'
]);

export const DEFAULT_MIN_CONFIDENCE = 0.9;

// A route-specific one-line nudge. Tells the user the intent we detected and how to actually run it,
// so a missed tool becomes a visible, confirmable next step instead of a silent chat reply.
const NUDGE: Record<string, string> = {
  'diagnostics.scan': "It looks like you wanted a diagnostics run, which I did not start. Reply \"run a diagnostics scan\" or send /diagnose and I will.",
  'memory.write': "It sounds like you want me to save that to memory, which I have not done durably. Reply \"remember that <fact>\" and I will save it.",
  'memory.delete': "It sounds like you want me to forget something I stored, which I have not done. Reply \"forget <topic>\" and I will remove it.",
  'model.switch': "It looks like you want to switch the chat model, which I have not changed. Reply \"switch the model to <name>\" and I will.",
  'schedule.create': "It sounds like you want to schedule a recurring job, which I have not created. Reply \"schedule <task> at <time>\" and I will set it up.",
  'schedule.delete': "It sounds like you want to delete a scheduled job, which I have not done. Reply \"delete the <name> schedule\" and I will."
};

export interface EnforcementDecision {
  mode: 'none' | 'suggest';
  route?: string;
  confidence?: number;
  message?: string;
}

export interface EnforcementOptions {
  allowlist?: Set<string>;
  minConfidence?: number;
}

export function decideProposerEnforcement(
  regexRoute: string,
  proposal: IntentProposal | null,
  opts: EnforcementOptions = {}
): EnforcementDecision {
  const allowlist = opts.allowlist || DEFAULT_ENFORCE_ALLOWLIST;
  const minConfidence = opts.minConfidence ?? DEFAULT_MIN_CONFIDENCE;
  if (!proposal || proposal.abstain) return { mode: 'none' };
  // Only act when the regex would otherwise just chat - never override or fight a real route.
  if (!NO_ACTION_ROUTES.has(regexRoute)) return { mode: 'none' };
  const top = proposal.candidates[0];
  if (!top) return { mode: 'none' };
  if (!allowlist.has(top.route)) return { mode: 'none' };
  if (top.confidence < minConfidence) return { mode: 'none' };
  const message = NUDGE[top.route];
  if (!message) return { mode: 'none' };
  return { mode: 'suggest', route: top.route, confidence: top.confidence, message };
}
