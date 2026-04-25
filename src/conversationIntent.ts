const COLLABORATIVE_IDEA_PATTERNS = [
  /\bhelp\s+me\s+(?:shape|think|figure|explore|brainstorm|develop)\b/i,
  /\b(?:shape|explore|brainstorm|develop)\s+(?:an?\s+)?idea\b/i,
  /\bi\s+(?:do\s+not|don't|dont)\s+know\s+(?:exactly\s+)?(?:what|yet)\b/i,
  /\bbefore\s+(?:building|we\s+build|creating|we\s+create|making|we\s+make)\b/i,
  /\bwhat\s+would\s+you\s+(?:build|make|create|suggest)\b/i,
  /\bwhat\s+would\s+(?:the\s+)?(?:first\s+version|mvp|v1)\s+be\b/i,
  /\b(?:first\s+version|mvp|v1)\b.*\b(?:be|look|feel|include|work)\b/i,
  /\b(?:make|feel)\s+it\s+(?:more\s+)?(?:playful|game-like|fun|alive)\b/i,
  /\b(?:i\s+like|i\s+love)\s+.+\b(?:idea|dashboard|tool|game|chip)\b/i,
  /\b(?:not\s+just|more\s+than)\s+tasks\b/i,
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

export function isLowInformationLlmReply(reply: string): boolean {
  const normalized = reply.trim().toLowerCase();
  return (
    !normalized ||
    normalized === 'working memory' ||
    normalized === 'nothing active' ||
    normalized === 'no concrete guidance' ||
    normalized === 'spark researcher returned no concrete guidance for this message.' ||
    normalized === 'what would you like help with?' ||
    normalized === 'how can i help?' ||
    normalized === 'how can i help you?' ||
    normalized === "i'm here, but i couldn't generate a response right now." ||
    normalized === "i'm having trouble thinking right now. try again in a moment." ||
    normalized.includes('working memory') ||
    normalized.includes('returned no concrete guidance') ||
    normalized.includes('what would you like help with') ||
    normalized.includes("couldn't generate") ||
    normalized.includes('having trouble thinking')
  );
}

export function isMemoryAcknowledgementReply(reply: string): boolean {
  const normalized = reply.trim().toLowerCase();
  return (
    /^noted\s*[:.]/i.test(reply.trim()) ||
    /^saved\s*[:.]/i.test(reply.trim()) ||
    /^remembered\s*[:.]/i.test(reply.trim()) ||
    normalized.startsWith('i have saved memory about ') ||
    normalized.startsWith('saved memory about ') ||
    normalized.startsWith('memory saved') ||
    normalized.startsWith('got it, i will remember')
  );
}

export function shouldSuppressBuilderReplyForPlainChat(reply: string): boolean {
  return isLowInformationLlmReply(reply) || isMemoryAcknowledgementReply(reply);
}

export function buildMemoryBridgeUnavailableReply(action: 'remember' | 'recall' | 'about'): string {
  if (action === 'remember') {
    return 'I could not confirm that through Spark memory yet. Please run /diagnose, or ask the operator to run `spark fix telegram` and `spark verify --deep`.';
  }
  if (action === 'recall') {
    return 'I could not get a useful memory answer yet. Please run /diagnose, or ask the operator to run `spark fix telegram` and `spark verify --deep`.';
  }
  return 'I could not inspect Spark memory yet. Please run /diagnose, or ask the operator to run `spark fix telegram` and `spark verify --deep`.';
}

export function buildIdeationFallbackReply(text: string): string {
  if (/\bdomain\s*chip\b/i.test(text)) {
    return [
      'Yes. I would shape this as a real domain chip first, not jump straight into files.',
      '',
      'First version: a chip that knows its purpose, when to activate, what advice it is allowed to give, what patterns to avoid, and how to verify its own usefulness.',
      '',
      'I would start with three parts: the chip identity, the practical playbook, and a few example situations where Spark should invoke it.',
      '',
      'Quick question: should this chip be more builder-focused, research-focused, or taste/strategy-focused?'
    ].join('\n');
  }

  if (/\bmission\s+control\b/i.test(text) || /\bmission\s+dashboard\b/i.test(text)) {
    return [
      'Yes, the first version should feel like a tiny daily command center with game feel, not a task list in a costume.',
      '',
      'I would make v1 around three daily missions. Each mission gets a status, energy cost, streak impact, and a launch/debrief moment. The main screen shows your current flight state: Ready, In Orbit, Low Energy, or Mission Complete.',
      '',
      'The fun part: completing a mission triggers a small launch animation and updates your streak/history, so the day feels like progress through a little campaign.',
      '',
      'For v1, I would keep it solo and lightweight: no accounts, no backend, just a polished browser app with local persistence. Want it to feel more space-ops, arcade RPG, or cozy sci-fi?'
    ].join('\n');
  }

  return [
    'Yes. I would keep this in idea-shaping mode for one more step before building.',
    '',
    'A strong first version should have one clear loop: choose a tiny goal, interact with it in a playful way, get satisfying feedback, and come back later because progress is saved.',
    '',
    'I would explore three directions: a mini quest tracker, a playful mission dashboard, or a creative prompt machine. Which one feels most alive to you?'
  ].join('\n');
}
