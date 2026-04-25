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

export function isMissionExecutionConfirmation(text: string): boolean {
  const trimmed = text.trim();
  if (!trimmed) return false;
  return [
    /^(?:yes|yeah|yep|yup|ok|okay|sure|sounds\s+good|perfect)[\s,!.]*(?:let'?s\s+)?(?:do\s+it|build\s+it|create\s+it|make\s+it|spin\s+it\s+up|kick\s+it\s+off|run\s+it|start\s+it)?\b/i,
    /^(?:let'?s\s+)?(?:do\s+it|build\s+it|create\s+it|make\s+it|spin\s+it\s+up|kick\s+it\s+off|run\s+it|start\s+it)\b/i,
    /\b(?:create|build|make|run|start|spin\s+up|kick\s+off)\s+(?:it|this|that|the\s+mission)\b/i
  ].some((pattern) => pattern.test(trimmed));
}

function isLowSignalPlanningTurn(text: string): boolean {
  const normalized = text.trim().toLowerCase();
  return (
    normalized.length < 5 ||
    /^(?:yes|yeah|yep|yup|ok|okay|sure|sounds good|perfect|nice|cool|go|go ahead|build new|new)$/i.test(normalized)
  );
}

export function inferMissionGoalFromRecentContext(currentText: string, recentMessages: string[]): string | null {
  if (!isMissionExecutionConfirmation(currentText) && !isExplicitContextualBuildRequest(currentText)) return null;

  const usefulTurns = recentMessages
    .map((message) => message.trim())
    .filter((message) => message && !isLowSignalPlanningTurn(message));
  if (usefulTurns.length === 0) return null;

  const context = usefulTurns.join('\n');
  const lower = context.toLowerCase();
  const sparkTopic = /\bspark\b/.test(lower);
  const bugTopic = /\b(?:bug|bugs|diagnos|anomal|failure|failures|health|logs?|monitor|troubleshoot|issue|issues)\b/.test(lower);
  const chipTopic = /\bdomain\s*chip\b|\bchip\b/.test(lower);
  const buildTopic = /\b(?:build|create|make|scaffold|system|agent|monitor)\b/.test(lower);

  if (!(buildTopic || chipTopic) || !(sparkTopic || bugTopic || chipTopic)) {
    return null;
  }

  if ((sparkTopic || chipTopic) && bugTopic) {
    return [
      'Deeply analyze the local Spark stack, including spark-telegram-bot, spark-intelligence-builder, domain-chip-memory, spark-researcher, and spawner-ui.',
      'Then design and scaffold a passive Spark bug-recognition domain chip that identifies recurring bugs, silent failures, degraded health, routing issues, memory failures, and mission-control problems.',
      'The first version should write Obsidian-friendly Markdown diagnostics and include clear setup, usage, and verification steps.',
      `Recent Telegram planning context:\n${context}`
    ].join('\n\n');
  }

  if (chipTopic) {
    return [
      'Create a new Spark domain chip from the recent Telegram planning context.',
      'Analyze the relevant Spark systems first, then produce a concrete v1 chip design, files, setup notes, and tests.',
      `Recent Telegram planning context:\n${context}`
    ].join('\n\n');
  }

  return [
    'Create a Spawner mission from the recent Telegram planning context.',
    'Analyze the relevant Spark systems first, then build the smallest useful v1 and include verification steps.',
    `Recent Telegram planning context:\n${context}`
  ].join('\n\n');
}

export function isExplicitContextualBuildRequest(text: string): boolean {
  const normalized = text.trim().toLowerCase();
  if (!normalized) return false;
  const asksToBuild = /\b(?:build|create|make|scaffold|implement|wire|integrate|improve|expand|upgrade|add)\b/.test(normalized);
  const contextualObject = /\b(?:this|that|it|those|these|integration points?|connectors?|domain chip|diagnostic agent|bug recognition|what we built)\b/.test(normalized);
  const executionHint = /\b(?:via|through|using|with|as)\s+(?:codex|mission|spawner|run)\b|\bmission\b|\bcodex\b/.test(normalized);
  return asksToBuild && contextualObject && executionHint;
}

export function isBuildContextRecallQuestion(text: string): boolean {
  const normalized = text.trim().toLowerCase();
  return (
    /\b(?:do\s+you\s+)?remember\b.*\b(?:build|building|built|making|project|chip|mission)\b/.test(normalized) ||
    /\bwhat\b.*\b(?:did|have)\s+(?:you|we)\s+(?:just\s+)?(?:build|make|create|ship)\b/.test(normalized) ||
    /\bwhat\b.*\b(?:were|was)\s+we\s+(?:gonna|going\s+to|about\s+to)\s+(?:build|make|create)\b/.test(normalized) ||
    /\bwe\s+were\s+(?:gonna|going\s+to|about\s+to)\s+(?:build|make|create)\b/.test(normalized)
  );
}

export function buildRecentBuildContextReply(recentMessages: string[]): string | null {
  const usefulTurns = recentMessages
    .map((message) => message.trim())
    .filter((message) => message && !isLowSignalPlanningTurn(message));
  if (usefulTurns.length === 0) return null;

  const context = usefulTurns.join('\n');
  const lower = context.toLowerCase();
  const sparkTopic = /\bspark\b/.test(lower);
  const bugTopic = /\b(?:bug|bugs|diagnos|anomal|failure|failures|health|logs?|monitor|troubleshoot|issue|issues)\b/.test(lower);
  const chipTopic = /\bdomain\s*chip\b|\bchip\b/.test(lower);
  const completedDiagnosticAgent = /\bcompleted spawner mission\b[\s\S]*\bdiagnostic agent\b|\bbuilt the first-pass spark diagnostic agent\b|\bspark-intelligence diagnostics scan\b/i.test(context);

  if (completedDiagnosticAgent) {
    return [
      'Yes. The latest completed build was the first-pass Spark Diagnostic Agent.',
      'It added `spark-intelligence diagnostics scan`, passive log discovery/classification, recurring bug grouping, and Obsidian-friendly diagnostic notes.',
      'Good next tests: run a fresh diagnostics scan, inspect the generated Markdown, verify it sees Builder/memory/Researcher/Spawner logs, then create a follow-up mission for missing connectors or better integration.'
    ].join('\n');
  }

  if ((sparkTopic || chipTopic) && bugTopic) {
    return [
      'Yes. We were shaping passive Spark bug recognition.',
      'The idea: analyze Spark systems, spot bugs/silent failures/degraded health, and write Obsidian-friendly diagnostic notes.',
      'If it has already run, the next step is testing and improving the diagnostic integration rather than starting from scratch.'
    ].join('\n');
  }

  if (chipTopic) {
    return [
      'Yes. We were shaping a new Spark domain chip.',
      `The latest useful context I have is: ${usefulTurns.slice(-3).join(' | ')}`,
      'Next step: say "yes create it" and I will start the Spawner mission.'
    ].join('\n');
  }

  return null;
}

function hasKnownLocalSparkSurface(text: string): boolean {
  return /\b(?:spawner|mission board|mission control|diagnostic|diagnostics|spark diagnostic|what (?:you|we) just built|thing (?:you|we) built|just built|dashboard|ui)\b/i.test(text);
}

export function isAmbiguousLocalSparkServiceRequest(text: string, context: string = ''): boolean {
  const normalized = text.trim().toLowerCase();
  if (!/\b(?:localhost|local\s*host|local\s+url)\b/.test(normalized)) {
    return false;
  }
  return !hasKnownLocalSparkSurface(normalized) && !hasKnownLocalSparkSurface(context);
}

export function isLocalSparkServiceRequest(text: string, context: string = ''): boolean {
  const normalized = text.trim().toLowerCase();
  const contextText = context.toLowerCase();
  return (
    (/\b(?:localhost|local\s*host|local\s+url)\b/.test(normalized) &&
      (hasKnownLocalSparkSurface(normalized) || hasKnownLocalSparkSurface(contextText))) ||
    (
      /\b(?:browser|open|show|link|ui|dashboard)\b/.test(normalized) &&
      /\b(?:spawner|mission board|mission control|this|it|diagnostic|spark)\b/.test(normalized)
    )
  );
}

export function buildLocalSparkServiceClarificationReply(): string {
  return [
    'Which local Spark surface do you mean?',
    '- Spawner UI / Mission Control: http://127.0.0.1:5173',
    '- Diagnostic notes: `~/.spark/diagnostics`',
    '- Telegram bot health: `/diagnose`',
    '- Full stack check: `spark status`'
  ].join('\n');
}

export function buildLocalSparkServiceReply(spawnerAvailable: boolean): string {
  if (spawnerAvailable) {
    return [
      'Yes. Spawner UI / Mission Control is running here:',
      'http://127.0.0.1:5173',
      '',
      'For this diagnostic-agent work, open the Mission board there. The diagnostic notes are written under `~/.spark/diagnostics`.'
    ].join('\n');
  }

  return [
    'Spawner UI is not reachable from the Telegram gateway right now.',
    'Run `spark start spawner-ui` or `spark start telegram-starter`, then open http://127.0.0.1:5173.',
    'After that, I can use the Spawner API path again through missions.'
  ].join('\n');
}

export function isDiagnosticFollowupTestQuestion(text: string): boolean {
  const normalized = text.trim().toLowerCase();
  return (
    /\b(?:test|try|check|verify|integrated|integration|kick the tires)\b/.test(normalized) &&
    /\b(?:it|this|that|diagnostic|bug recognition|domain chip|agent)\b/.test(normalized)
  );
}

export function buildDiagnosticFollowupTestReply(context: string): string | null {
  const lower = context.toLowerCase();
  if (!/\bdiagnostic agent\b|\bspark-intelligence diagnostics scan\b|\bbug recognition\b/.test(lower)) {
    return null;
  }

  return [
    'Yes. The useful tests are clear now:',
    '- run a fresh diagnostics scan with `spark-intelligence diagnostics scan` and confirm it writes a fresh Obsidian note',
    '- seed fake Builder/memory/Researcher errors and confirm classification catches them',
    '- verify the note links back to the affected Spark subsystem',
    '- create one follow-up Codex mission to wire stronger service discovery/connectors into that diagnostic agent',
    '',
    'If you want me to improve it from here, say "build the diagnostic integration upgrades via Codex" and I will start that as a mission.'
  ].join('\n');
}

export function buildContextualImprovementGoal(currentText: string, recentMessages: string[]): string | null {
  if (!isExplicitContextualBuildRequest(currentText)) return null;
  const context = recentMessages
    .map((message) => message.trim())
    .filter(Boolean)
    .join('\n');
  const lower = context.toLowerCase();

  if (/\bdiagnostic agent\b|\bspark-intelligence diagnostics scan\b|\bbug recognition\b/.test(lower)) {
    return [
      'Improve the recently built Spark Diagnostic Agent instead of starting a separate chip from scratch.',
      'Add integration connectors/service discovery so the diagnostic agent can inspect the local Spark ecosystem more directly: spark-telegram-bot relay/profile health, spawner-ui Mission Control/API health, spark-intelligence-builder runtime/memory bridge status, domain-chip-memory health, and spark-researcher health.',
      'Keep this passive and secure: no secret printing, no destructive commands, no webhook mode, long polling only for Telegram.',
      'Add tests for connector discovery, unavailable-service handling, and Obsidian Markdown output.',
      `Recent Telegram context:\n${context}\n\nLatest user request:\n${currentText}`
    ].join('\n\n');
  }

  return null;
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
    'If the user later says yes, create it, run it, spin it up, or kick it off, the Telegram gateway can start the mission. Do not claim you started it during ideation.',
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

export function extractPlainChatMemoryDirective(text: string): string | null {
  const trimmed = text.trim();
  const patterns = [
    /^(?:please\s+)?(?:can\s+you\s+)?remember\s+that\s+(.+?)[.!?]?$/i,
    /^(?:please\s+)?(?:can\s+you\s+)?remember\s*[:,-]\s*(.+?)[.!?]?$/i,
    /^(?:please\s+)?keep\s+in\s+mind\s+that\s+(.+?)[.!?]?$/i,
    /^(?:please\s+)?note\s+that\s+(.+?)[.!?]?$/i
  ];

  for (const pattern of patterns) {
    const match = trimmed.match(pattern);
    const value = match?.[1]?.trim();
    if (value) {
      return value.replace(/^["']|["']$/g, '').trim();
    }
  }

  return null;
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
