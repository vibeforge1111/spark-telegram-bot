export function isNaturalHarnessProofInspectRequest(text: string): boolean {
  const normalized = text.toLowerCase().replace(/\s+/g, ' ').trim();
  if (!normalized) return false;
  const mentionsHarnessProof =
    /\b(?:harness\s+proof|proof\s+(?:panel|capsules?|status|join|evidence)|last\s+action\s+has\s+proof)\b/.test(normalized);
  if (!mentionsHarnessProof) return false;
  const asksToInspect = /\b(?:show|check|inspect|verify|tell\s+me|whether|has|have|does|latest|last|current)\b/.test(normalized);
  const scopedToExistingTurn =
    /\b(?:last|latest|current|previous|prior|existing|already|without\s+(?:running|starting|doing)|do\s+not\s+(?:run|start|execute)|don't\s+(?:run|start|execute)|dont\s+(?:run|start|execute)|inspect[-\s]*only|read[-\s]*only)\b/.test(normalized);
  const asksForConcept = /\b(?:what\s+does|what\s+is|define|explain\s+(?:what|why|how)|mean(?:s|ing)?)\b/.test(normalized);
  return asksToInspect && scopedToExistingTurn && !asksForConcept;
}
