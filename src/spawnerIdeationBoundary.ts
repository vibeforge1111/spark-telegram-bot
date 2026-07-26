function normalize(text: string): string {
  return text.toLowerCase().replace(/\s+/g, ' ').trim();
}

function extractProjectName(text: string): string {
  const match = text.match(/\bproject\s+(?:called|named)\s+(.+?)(?=\s+(?:with|that|but|and\s+do|do\s+not|don't|dont)\b|[.!?;]|$)/i);
  const name = match?.[1]?.replace(/["'`]+/g, '').replace(/\s+/g, ' ').trim();
  return name || 'this project';
}

export function renderSpawnerIdeationBoundaryReply(text: string): string {
  const normalized = normalize(text);
  const asksProjectDesign = /\b(?:help\s+me\s+)?(?:design|shape|plan)\s+(?:a\s+)?project\b/.test(normalized) ||
    /\bproject\s+(?:called|named)\b/.test(normalized);
  const blocksBuild = /\bdo\s+not\s+(?:build|start|launch|run|create)\s+yet\b/.test(normalized) ||
    /\b(?:don't|dont)\s+(?:build|start|launch|run|create)\s+yet\b/.test(normalized) ||
    /\bno\s+(?:build|launch|mission|execution)\s+yet\b/.test(normalized);
  const asksFirstProductQuestions = /\bask\s+me\s+(?:the\s+)?first\s+(?:two|2)\s+product\s+questions?\b/.test(normalized) ||
    /\bfirst\s+(?:two|2)\s+product\s+questions?\b/.test(normalized);
  if (!asksProjectDesign || !blocksBuild || !asksFirstProductQuestions) return '';

  const projectName = extractProjectName(text);
  return [
    `I won't build ${projectName} yet.`,
    '',
    '1. Who is it for first: Spark operators proving agent work, founders proving customer work, or builders proving project readiness?',
    '2. What should one "proof" contain in v1: a checklist, a trace panel, a before/after artifact, or a signed-off decision?'
  ].join('\n');
}
