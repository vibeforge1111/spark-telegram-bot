export function isProtectedJuryPreflightRequest(text: string): boolean {
  const normalized = text.trim().toLowerCase().replace(/\s+/g, ' ');
  if (!normalized) return false;
  const requestsPreflight =
    /\b(?:run|execute|perform)\b.{0,160}\b(?:protected\s+)?review[-\s]*control\s+preflight\b/.test(normalized);
  const exactHead = /\bexact\s+(?:head|commit)\s+[a-f0-9]{40}\b/.test(normalized);
  const namedStatus = /\bspark[-_]jury[-_]approval\b.{0,60}\bstatus\b/.test(normalized);
  const passGate = /\bif\s+and\s+only\s+if\b.{0,700}\ball\s+pass\b.{0,180}\bpublish\b/.test(normalized);
  const failureGuard = /\bif\s+any\s+gate\s+fails\b.{0,120}\bdo\s+not\s+publish\b/.test(normalized);
  const protectionBoundary = /\bdo\s+not\s+bypass\s+protection\b/.test(normalized);
  const blanketExecutionStop =
    /\b(?:do\s+not|don't|dont|please\s+don't|please\s+dont)\s+(?:run|start|execute|launch)\b/.test(normalized);
  return requestsPreflight && exactHead && namedStatus && passGate && failureGuard && protectionBoundary && !blanketExecutionStop;
}

export function protectedJuryPreflightHandoffReply(): string {
  return [
    '⚠️ I can’t issue the protected Jury status from this Telegram/Spawner runtime.',
    'It doesn’t own the protected review-control signer or durable replay store, so nothing was published; run the sealed preflight on the equipped review-control host and bring the receipt back here.'
  ].join(' ');
}
