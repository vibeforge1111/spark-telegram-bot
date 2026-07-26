export function isRouteConfidenceDefinitionQuestion(text: string): boolean {
  const normalized = text.toLowerCase().replace(/\s+/g, ' ').trim();
  if (!/\broute confidence\b/.test(normalized)) return false;
  if (/\b(?:build|create|make|scaffold|generate|ship|implement|improve|upgrade|repair|design|plan|scope|domain[-\s]*chip|system)\b/.test(normalized)) {
    return false;
  }
  return (
    /\bwhat\s+(?:is|does)\s+route confidence\b/.test(normalized) ||
    /\bwhat\s+does\s+route confidence\s+mean\b/.test(normalized) ||
    /\bdefine\s+route confidence\b/.test(normalized) ||
    /\bexplain\s+route confidence\b/.test(normalized) ||
    /\bmeaning\s+of\s+route confidence\b/.test(normalized)
  );
}
