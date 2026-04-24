const COLLABORATIVE_IDEA_PATTERNS = [
  /\bhelp\s+me\s+(?:shape|think|figure|explore|brainstorm|develop)\b/i,
  /\b(?:shape|explore|brainstorm|develop)\s+(?:an?\s+)?idea\b/i,
  /\bi\s+(?:do\s+not|don't|dont)\s+know\s+(?:exactly\s+)?(?:what|yet)\b/i,
  /\bbefore\s+(?:building|we\s+build|creating|we\s+create|making|we\s+make)\b/i,
  /\bwhat\s+would\s+you\s+(?:build|make|create|suggest)\b/i,
  /\b(?:converse|talk|think)\s+(?:with\s+me\s+)?(?:about|through)\b/i,
  /\btogether\b.*\b(?:idea|shape|plan|concept|build)\b/i,
  /\b(?:idea|concept)\s+together\b/i
];

const HARD_EXECUTION_PATTERNS = [
  /^\s*\/(?:run|build|mission)\b/i,
  /\b(?:build|create|make|ship|scaffold|generate)\s+(?:this\s+)?(?:at|in|into)\s+[A-Z]:[\\/]/i,
  /\buse\s+(?:advanced\s+prd|direct\s+build)\s+mode\b/i,
  /\bfiles:\s*[\w.-]+\./i
];

export function shouldPreferConversationalIdeation(text: string): boolean {
  const trimmed = text.trim();
  if (!trimmed) return false;
  if (HARD_EXECUTION_PATTERNS.some((pattern) => pattern.test(trimmed))) {
    return false;
  }
  return COLLABORATIVE_IDEA_PATTERNS.some((pattern) => pattern.test(trimmed));
}

export function buildIdeationSystemHint(text: string): string {
  const domainChip = /\bdomain\s*chip\b/i.test(text);
  const missionControl = /\bmission\s+control\b/i.test(text);

  const modeLine = domainChip
    ? 'The user is exploring an advanced Spark domain chip. Help shape the chip before proposing files or execution.'
    : missionControl
      ? 'The user is exploring a mission-control style idea. Help shape the idea before invoking Mission Control.'
      : 'The user is exploring a build idea. Help shape the concept before turning it into a build request.';

  return [
    modeLine,
    'Do not start a build, canvas, mission, or PRD yet.',
    'Reply like a collaborative product partner: propose 2-4 directions, ask one or two useful questions, and offer a next step.',
    'Keep it concise and natural for Telegram.'
  ].join('\n');
}
