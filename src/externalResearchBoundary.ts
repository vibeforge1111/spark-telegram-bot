export function renderExternalResearchBoundaryReply(text: string): string {
  const normalized = text.toLowerCase().replace(/\s+/g, ' ').trim();
  if (isExplicitDomainChipCreationRequest(normalized)) return '';
  const asksResearch = /\b(?:research|look\s+up|search|browse|web|docs?|documentation|current|latest)\b/.test(normalized);
  const blocksNow = /\b(?:do\s+not|don't|dont|without|not)\s+(?:browse|search|research|use|open|call|run)\b/.test(normalized) || /\bdo\s+not\s+browse\s+yet\b/.test(normalized);
  const blocksMission = externalResearchNoMissionClarification(text);
  const asksBoundary = /\b(?:permission|source|boundary|applies|allowed|authorize|authorization)\b/.test(normalized);
  if (asksResearch && blocksMission) {
    return [
      'I will not start a mission from this.',
      '',
      'A current web check needs an external research action with proof. From this turn I can either wait for you to confirm a direct web check, or you can allow a research mission if you want the fuller route.'
    ].join('\n');
  }
  if (!asksResearch || !blocksNow || !asksBoundary) return '';
  return [
    'I can explain the boundary without browsing.',
    '',
    'For current docs, fresh web research needs a clear browse/research request and should use the current public source directly, not memory. Since you said not to browse yet, this turn stays read-only: no external network call, no provider switch, and no stored claim that I checked the docs.'
  ].join('\n');
}

function isExplicitDomainChipCreationRequest(normalized: string): boolean {
  const mentionsDomainChip = /\bdomain[-\s]*chip\b/.test(normalized);
  const asksCreate = /\b(?:build|create|make|scaffold|generate)\b/.test(normalized);
  const negatesCreation =
    /\b(?:do\s+not|don't|dont|no)\s+(?:build|create|make|scaffold|generate)\b.{0,40}\bdomain[-\s]*chip\b/.test(normalized) ||
    /\bdomain[-\s]*chip\b.{0,40}\b(?:do\s+not|don't|dont|no)\s+(?:build|create|make|scaffold|generate)\b/.test(normalized);
  return mentionsDomainChip && asksCreate && !negatesCreation;
}

export function externalResearchNoMissionClarification(text: string): boolean {
  const normalized = text.toLowerCase().replace(/\s+/g, ' ').trim();
  const asksCurrentWeb =
    /\b(?:current|latest|fresh|today|now|web|internet|online|public)\b/.test(normalized) &&
    /\b(?:check|research|look\s+up|search|find|browse|inspect)\b/.test(normalized);
  const blocksMission = /\b(?:do not|don't|dont|without|no)\s+(?:start|run|launch|kick\s+off)\b.{0,40}\bmission\b/.test(normalized) ||
    /\bno\s+(?:mission|spawner)\b/.test(normalized);
  return asksCurrentWeb && blocksMission;
}
