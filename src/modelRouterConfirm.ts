// Pending-confirm for high-blast model-routed actions. Closes the two hijack holes the audit found:
//
//  (1) FRAME-RESOLVED: a bare "operator" / "yes" that would bind to a prior turn never reaches an
//      action, because the model routes a bare token to plain_chat -> mode=chat -> noExecution. (That
//      is handled by the router itself; this module covers the other half.)
//  (2) CONFIRM-ECHO: a high-blast command does NOT execute on first sight. The router returns
//      mode=confirm; we stage a SINGLE-USE pending bound to {route, turnId} and ask. Only a matching
//      confirmation on the NEXT turn runs it. A stray "yes" with no pending does nothing.
//
// Pure + unit-tested. The store is in-memory (process-local); a lost pending just means the user
// restates - safe, never a wrong execution.

export interface PendingConfirm {
  route: string;
  label: string;
  turnId: string;
  text: string;       // the ORIGINAL command text, so the confirmed dispatch keeps its args (not "yes")
  createdAt: number;
}

const PENDING = new Map<string, PendingConfirm>();
const TTL_MS = 10 * 60 * 1000;

export function pendingConfirmKey(chatId: unknown, userId: unknown): string {
  return `${String(chatId)}:${String(userId)}`;
}

export function stagePendingConfirm(key: string, p: { route: string; label: string; turnId: string; text: string }, now: number = Date.now()): void {
  PENDING.set(key, { ...p, createdAt: now });
}

export function getPendingConfirm(key: string, now: number = Date.now()): PendingConfirm | null {
  const p = PENDING.get(key);
  if (!p) return null;
  if (now - p.createdAt > TTL_MS) { PENDING.delete(key); return null; }
  return p;
}

export function clearPendingConfirm(key: string): void {
  PENDING.delete(key);
}

const CONFIRM_RE = /^(?:yes|yep|yeah|yup|ok|okay|do it|go ahead|confirm|confirmed|proceed|sure|please do|go for it)\b/i;
const NEGATE_RE = /\b(?:no|nope|don'?t|do not|cancel|stop|never|nah|abort)\b/i;

// A fresh confirmation: starts with an affirmative and is not a negation. Deliberately strict so an
// arbitrary message does not count as a confirm.
export function isConfirmText(text: string): boolean {
  const t = (text || '').trim();
  if (!t) return false;
  if (NEGATE_RE.test(t)) return false;
  return CONFIRM_RE.test(t);
}

// Decide whether a fresh turn consumes a staged confirm. Consumes ONLY when there is a pending and the
// text is a confirmation; otherwise no-op (the pending is left for its TTL or a later explicit yes/no).
export function shouldConsumeConfirm(
  pending: PendingConfirm | null,
  text: string
): { consume: boolean; route?: string; label?: string } {
  if (!pending) return { consume: false };
  if (!isConfirmText(text)) return { consume: false };
  return { consume: true, route: pending.route, label: pending.label };
}

// One-line prompt shown when a high-blast action is staged for confirmation.
export function confirmPromptMessage(label: string): string {
  const safe = (label || 'that action').trim() || 'that action';
  return `That looks like a high-impact action: "${safe}". Reply "yes" to confirm and I will run it, or "no" to cancel.`;
}
