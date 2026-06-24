export function renderExternalResearchBoundaryReply(text: string): string {
  const normalized = text.toLowerCase().replace(/\s+/g, ' ').trim();
  const asksResearch = /\b(?:research|look\s+up|search|browse|web|docs?|documentation|current|latest)\b/.test(normalized);
  const blocksNow = /\b(?:do\s+not|don't|dont|without|not)\s+(?:browse|search|research|use|open|call|run)\b/.test(normalized) || /\bdo\s+not\s+browse\s+yet\b/.test(normalized);
  const asksBoundary = /\b(?:permission|source|boundary|applies|allowed|authorize|authorization)\b/.test(normalized);
  if (!asksResearch || !blocksNow || !asksBoundary) return '';
  return [
    'I can explain the boundary without browsing.',
    '',
    'For current docs, fresh web research needs a clear browse/research request and should use the current public source directly, not memory. Since you said not to browse yet, this turn stays read-only: no external network call, no provider switch, and no stored claim that I checked the docs.'
  ].join('\n');
}
