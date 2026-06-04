const DESTRUCTIVE_RUN_PATTERNS: RegExp[] = [
  /\brm\s+-rf\b/,
  /\bformat\s+(?:the\s+)?(?:disk|drive|c:)\b/,
  /\b(?:delete|remove|wipe|destroy|purge|uninstall|drop)\b[^.]{0,80}\b(?:all|every|database|db|repo|repository|workspace|production|prod|secrets?)\b/,
  /\b(?:delete|remove|wipe|destroy)\s+everything\b/,
  /\breset\s+(?:production|prod)\b/,
  /\bnuke\b/,
  /\bobliterate\b/,
];

export function isDestructiveRunGoal(goal: string): boolean {
  const normalized = goal.trim().toLowerCase().replace(/\s+/g, ' ');
  if (!normalized) {
    return false;
  }
  return DESTRUCTIVE_RUN_PATTERNS.some((pattern) => pattern.test(normalized));
}

export function isDestructiveRunConfirmationText(text: string): boolean {
  const normalized = text.trim().toLowerCase().replace(/\s+/g, ' ');
  return (
    /^yes,\s*run\s+destructive$/.test(normalized) ||
    /^confirm\s+destructive\s+run$/.test(normalized) ||
    /^(?:yes[,\s]+)?(?:run|confirm|proceed)\s+(?:the\s+)?destructive(?:\s+run)?$/.test(normalized)
  );
}

export function renderDestructiveRunConfirmationPrompt(goal: string): string {
  const preview = goal.length > 120 ? `${goal.slice(0, 117)}...` : goal;
  return [
    'This /run goal looks destructive and needs confirmation before I start a mission.',
    '',
    'Goal',
    `• ${preview}`,
    '',
    'Next',
    '• Reply `yes, run destructive` to confirm.',
    '• Or send a safer goal if this was accidental.'
  ].join('\n');
}
