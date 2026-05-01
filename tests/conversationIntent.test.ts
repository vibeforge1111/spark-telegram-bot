import assert from 'node:assert/strict';
import {
  buildIdeationFallbackReply,
  buildIdeationSystemHint,
  buildContextualImprovementGoal,
  buildProjectImprovementGoal,
  buildDiagnosticFollowupTestReply,
  buildExternalResearchGoal,
  buildLocalSparkServiceClarificationReply,
  buildLocalSparkServiceReply,
  buildMemoryBridgeUnavailableReply,
  buildRecentBuildContextReply,
  extractSparkSelfImprovementGoal,
  extractSparkWikiAnswerQuestion,
  extractSparkWikiPromotionIntent,
  extractPlainChatMemoryDirective,
  extractSparkWikiQuery,
  formatMissionUpdatePreferenceAcknowledgement,
  hasRecentAccessConversation,
  hasLocalOptionReference,
  inferRecentConversationFocus,
  inferDefaultBuildFromRecentScoping,
  inferMissionGoalFromRecentContext,
  isAccessHelpQuestion,
  isAccessStatusQuestion,
  isBuildContextRecallQuestion,
  isDiagnosticFollowupTestQuestion,
  isDiagnosticsScanRequest,
  isAmbiguousLocalSparkServiceRequest,
  isExternalResearchRequest,
  isExplicitContextualBuildRequest,
  isSparkWikiInventoryQuestion,
  isSparkWikiStatusQuestion,
  isProjectImprovementRequest,
  isLocalSparkServiceRequest,
  isMissionExecutionConfirmation,
  isMemoryAcknowledgementReply,
  isLowInformationLlmReply,
  parseContextualAccessChangeIntent,
  parseNaturalAccessChangeIntent,
  parseNaturalChipCreateIntent,
  parseMissionUpdatePreferenceIntent,
  parseSpawnerBoardNaturalIntent,
  renderChatRuntimeFailureReply,
  shouldSuppressBuilderReplyForPlainChat,
  shouldPreferConversationalIdeation
} from '../src/conversationIntent';
import { buildConversationFrame } from '../src/conversationFrame';

function test(name: string, fn: () => void): void {
  try {
    fn();
    console.log(`ok - ${name}`);
  } catch (error) {
    console.error(`not ok - ${name}`);
    throw error;
  }
}

test('routes collaborative mission wording to conversation instead of command help', () => {
  assert.equal(
    shouldPreferConversationalIdeation(
      "I want to build something fun with Spark, but I don't know exactly what yet. I like playful tools, tiny games, and things that feel like a mission dashboard. Can you help me shape an idea before building?"
    ),
    true
  );
});

test('keeps explicit build specs on the build path', () => {
  assert.equal(
    shouldPreferConversationalIdeation(
      'Build this at C:\\Users\\USER\\Desktop\\spark-thing: Files: index.html, app.js. No build step.'
    ),
    false
  );
});

test('detects execution confirmation without treating every reply as a mission', () => {
  assert.equal(isMissionExecutionConfirmation("yes let's do it create it after analyzing our systems deeply please"), true);
  assert.equal(isMissionExecutionConfirmation('spin it up'), true);
  assert.equal(isMissionExecutionConfirmation('sure'), false);
  assert.equal(isMissionExecutionConfirmation('sounds good'), false);
  assert.equal(isMissionExecutionConfirmation('what do you think about this?'), false);
});

test('infers Spark bug-recognition mission from recent planning context', () => {
  const goal = inferMissionGoalFromRecentContext(
    "Yes, let's do it create it after analyzing our systems deeply please",
    [
      "let's build something together shall we",
      'a new domain chip',
      'build new',
      "let's build something that can be helpful in recognizing the bugs happening in the systems of Spark",
      'I do not know where the logs live. All systems. Passive. Obsidian for the logs.'
    ]
  );

  assert.ok(goal);
  assert.match(goal, /passive Spark bug-recognition domain chip/);
  assert.match(goal, /Obsidian-friendly Markdown/);
  assert.match(goal, /spark-telegram-bot/);
});

test('does not infer mission from low-context agreement', () => {
  assert.equal(inferMissionGoalFromRecentContext('yes sounds good', ['nice', 'cool']), null);
  assert.equal(inferMissionGoalFromRecentContext('what happened?', ['new domain chip']), null);
});

test('does not launch a mission from bare agreement after memory dashboard scoping', () => {
  const goal = inferMissionGoalFromRecentContext('sure', [
    "let's build a memory quality dashboard makes sense, but let's pin the scope before building.",
    'it would show recall accuracy over time, failure modes, and latency within spawner-ui.',
    'all data sources that make sense',
    'everything'
  ]);

  assert.equal(goal, null);
});

test('infers recommended browser maze build when user asks Spark to decide after scoping', () => {
  const build = inferDefaultBuildFromRecentScoping("i don't know you decide", [
    'let’s build a maze game',
    'lets do a browser based one'
  ]);

  assert.ok(build);
  assert.equal(build.projectName, 'Browser Maze Game');
  assert.match(build.prd, /HTML Canvas/);
  assert.match(build.prd, /procedurally generated levels/);
});

test('does not infer default build from you decide without build context', () => {
  assert.equal(inferDefaultBuildFromRecentScoping('you decide', ['memory quality eval', 'favorite color is blue']), null);
});

test('answers what we were going to build from recent context', () => {
  assert.equal(isBuildContextRecallQuestion('we were gonna build something do you remember what it was'), true);
  const reply = buildRecentBuildContextReply([
    'a new domain chip',
    "let's build something that can be helpful in recognizing the bugs happening in the systems of Spark",
    'All systems. Passive. Obsidian for the logs.'
  ]);

  assert.ok(reply);
  assert.match(reply, /passive Spark bug recognition/);
  assert.match(reply, /Obsidian-friendly diagnostic notes/);
});

test('answers what was just built from completed diagnostic mission notes', () => {
  assert.equal(isBuildContextRecallQuestion('do you remember what you just built btw'), true);
  const reply = buildRecentBuildContextReply([
    'Completed Spawner mission spark-123 via Codex. Goal: Build Spark Diagnostic Agent. Result: Built the first-pass Spark Diagnostic Agent.',
    'CLI entry point: `spark-intelligence diagnostics scan`'
  ]);

  assert.ok(reply);
  assert.match(reply, /first-pass Spark Diagnostic Agent/);
  assert.match(reply, /diagnostics scan/);
  assert.match(reply, /^The latest completed build/);
  assert.match(reply, /Agent\.\n\nIt added/);
  assert.doesNotMatch(reply, /say "yes create it"/);
});

test('prefers current Spawner Kanban and Canvas planning over older completed build memory', () => {
  assert.equal(isBuildContextRecallQuestion('what were we going to build again?'), true);
  const reply = buildRecentBuildContextReply([
    'Completed Spawner mission spark-123 via Codex. Goal: Build Spark Diagnostic Agent. Result: Built the first-pass Spark Diagnostic Agent.',
    'maybe we should improve the existing Spawner Kanban and Canvas flow, what would be the best first version?',
    'that sounds good',
    'Recent Telegram turns:\n- User: maybe we should improve the existing Spawner Kanban and Canvas flow, what would be the best first version?\n- User: that sounds good'
  ]);

  assert.ok(reply);
  assert.match(reply, /^We were shaping improvements to the existing Spawner Kanban and Canvas\./);
  assert.match(reply, /Canvas execution should map cleanly to Kanban status/);
  assert.match(reply, /No new product needs to be invented/);
  assert.match(reply, /Kanban visibility, Canvas execution state, or Telegram relay messaging/);
  assert.doesNotMatch(reply, /Diagnostic Agent/);
});

test('recognizes local Spark service URL requests', () => {
  assert.equal(
    isLocalSparkServiceRequest(
      'can you run the localhost for me',
      'Completed Spawner mission spark-123. Result: Built the first-pass Spark Diagnostic Agent.'
    ),
    true
  );
  assert.match(buildLocalSparkServiceReply(true), /http:\/\/127\.0\.0\.1:3333/);
  assert.match(buildLocalSparkServiceReply(false), /spark start spawner-ui/);
});

test('does not confuse mission-control ideation with opening the local UI', () => {
  const prompt = 'can you help me think through whether we should build a mission control dashboard before we touch the canvas?';

  assert.equal(shouldPreferConversationalIdeation(prompt), true);
  assert.equal(
    isLocalSparkServiceRequest(
      prompt,
      'Completed Spawner mission spark-123. Result: Built the first-pass Spark Diagnostic Agent.'
    ),
    false
  );
});

test('does not intercept build-quality review requests as local UI links', () => {
  assert.equal(
    isLocalSparkServiceRequest(
      'Review the quality of the /memory-quality build in spawner-ui.',
      'Completed Spawner mission spark-123. Result: Built the first-pass Spark Diagnostic Agent.'
    ),
    false
  );
});

test('asks for clarification on cold localhost requests', () => {
  assert.equal(isAmbiguousLocalSparkServiceRequest('can you run the localhost for me', ''), true);
  assert.equal(isLocalSparkServiceRequest('can you run the localhost for me', ''), false);
  assert.match(buildLocalSparkServiceClarificationReply(), /Which local Spark surface/);
});

test('routes natural Spawner board questions to board reads', () => {
  assert.equal(parseSpawnerBoardNaturalIntent('show me the current Spawner/Kanban board'), 'board');
  assert.equal(parseSpawnerBoardNaturalIntent('did the latest canvas run show up on kanban?'), 'latest_on_kanban');
  assert.equal(parseSpawnerBoardNaturalIntent('which LLM took the latest Spawner job?'), 'latest_provider');
  assert.equal(parseSpawnerBoardNaturalIntent('no the localhost for the beauty centre'), 'latest_project_preview');
  assert.equal(isLocalSparkServiceRequest('no the localhost for the beauty centre', 'Completed Spawner mission spark-123'), false);
  assert.equal(
    parseSpawnerBoardNaturalIntent('the canvas event stream looked good, can you check whether the kanban side saw the same mission?'),
    'latest_on_kanban'
  );
  assert.equal(parseSpawnerBoardNaturalIntent('maybe we should build a tiny kanban app'), null);
});

test('keeps memory quality dashboard scoping in conversation instead of board reads', () => {
  const prompt = [
    "let's build a memory quality dashboard makes sense, but let's pin the scope before building.",
    'it would show: recall accuracy over time, failure modes (confabulation vs. omission vs. drift), and latency.',
    'All within spawner-ui, not a separate thing.',
    'it should be connected to our live memory system for our own monitoring'
  ].join('\n');

  assert.equal(shouldPreferConversationalIdeation(prompt), true);
  assert.equal(parseSpawnerBoardNaturalIntent(prompt), null);
});

test('answers diagnostic follow-up testing questions from mission context', () => {
  assert.equal(isDiagnosticFollowupTestQuestion('lets test it'), true);
  const reply = buildDiagnosticFollowupTestReply(
    'Completed Spawner mission spark-123. Result: Built the first-pass Spark Diagnostic Agent with `spark-intelligence diagnostics scan`.'
  );

  assert.ok(reply);
  assert.match(reply, /fresh diagnostics scan/);
  assert.match(reply, /follow-up Codex mission/);
});

test('recognizes natural diagnostics scan requests', () => {
  assert.equal(isDiagnosticsScanRequest('run a fresh diagnostics scan'), true);
  assert.equal(isDiagnosticsScanRequest('spark-intelligence diagnostics scan'), true);
  assert.equal(isDiagnosticsScanRequest('Actually, my current plan is run a fresh diagnostics scan.'), false);
});

test('does not treat explicit current-plan memory saves as diagnostic follow-up tests', () => {
  assert.equal(
    isDiagnosticFollowupTestQuestion(
      'Memory update: my current plan is Neon Harbor Telegram memory test. Please save this as my current plan.'
    ),
    false
  );
});

test('does not treat context survival verification as diagnostic follow-up tests', () => {
  assert.equal(
    isDiagnosticFollowupTestQuestion(
      'Before we close this, verify whether my focus, plan, latest diagnostics, and maintenance summary survive across a new conversation turn without being collapsed into done.'
    ),
    false
  );
});

test('does not treat persistent memory quality plans as diagnostic follow-up tests', () => {
  assert.equal(
    isDiagnosticFollowupTestQuestion(
      'Good. Give me a concrete evaluation plan for persistent memory quality in Telegram. It should test natural recall, stale context avoidance, current-state priority, and whether you can explain what memory sources you used.'
    ),
    false
  );
});

test('turns explicit contextual improvement requests into diagnostic integration missions', () => {
  const text = 'build these integration points as another mission via codex';
  assert.equal(isExplicitContextualBuildRequest(text), true);
  const goal = buildContextualImprovementGoal(text, [
    'Completed Spawner mission spark-123. Result: Built the first-pass Spark Diagnostic Agent.',
    'It added `spark-intelligence diagnostics scan`.'
  ]);

  assert.ok(goal);
  assert.match(goal, /Improve the recently built Spark Diagnostic Agent/);
  assert.match(goal, /service discovery/);
  assert.match(goal, /no secret printing/);
});

test('turns natural shipped project feedback into an iteration mission', () => {
  const project = {
    chatId: '8319079055',
    userId: '1278511160',
    projectName: 'Founder Signal Room',
    projectPath: 'C:/Users/USER/Desktop/founder-signal-room',
    previewUrl: 'http://127.0.0.1:5555/preview/founder/index.html',
    missionId: 'mission-founder',
    iteration: 1,
    summary: 'Built the first strategy room.',
    shippedAt: '2026-05-01T00:00:00Z',
    updatedAt: '2026-05-01T00:00:00Z'
  };

  assert.equal(isProjectImprovementRequest('make this more Spark colored', project), true);
  assert.equal(isExplicitContextualBuildRequest('make this more Spark colored'), false);

  const goal = buildProjectImprovementGoal('make this more Spark colored', project, [
    'Spark shipped Founder Signal Room.',
    'User is reviewing the preview now.'
  ]);

  assert.ok(goal);
  assert.match(goal, /Improve the existing shipped project "Founder Signal Room"/);
  assert.match(goal, /C:\/Users\/USER\/Desktop\/founder-signal-room/);
  assert.match(goal, /not a new scaffold/);
  assert.match(goal, /make this more Spark colored/);
  assert.match(goal, /Parent mission: mission-founder/);
});

test('does not treat preview link questions as project improvement requests', () => {
  const project = {
    chatId: '8319079055',
    userId: '1278511160',
    projectName: 'Founder Signal Room',
    projectPath: 'C:/Users/USER/Desktop/founder-signal-room',
    previewUrl: 'http://127.0.0.1:5555/preview/founder/index.html',
    missionId: 'mission-founder',
    iteration: 1,
    shippedAt: '2026-05-01T00:00:00Z',
    updatedAt: '2026-05-01T00:00:00Z'
  };

  assert.equal(isProjectImprovementRequest('give me the localhost for this app', project), false);
  assert.equal(buildProjectImprovementGoal('give me the localhost for this app', project), null);
});

test('detects public GitHub inspection requests for agent access routing', () => {
  assert.equal(
    isExternalResearchRequest('https://github.com/vibeforge1111/spark-character can you visit this'),
    true
  );
  assert.equal(isExternalResearchRequest('I like this repo idea but no link yet'), false);

  const goal = buildExternalResearchGoal(
    'https://github.com/vibeforge1111/spark-character can you visit this',
    ['we were talking about Spark character self-improvement']
  );
  assert.match(goal, /Inspect the public GitHub\/web target/);
  assert.match(goal, /Do not print secrets/);
  assert.match(goal, /spark-character/);
});

test('parses natural mission update preferences', () => {
  assert.deepEqual(parseMissionUpdatePreferenceIntent('for missions only send start and end updates'), {
    verbosity: 'minimal'
  });
  assert.deepEqual(parseMissionUpdatePreferenceIntent('include board and canvas links for missions'), {
    links: 'both'
  });
  assert.deepEqual(parseMissionUpdatePreferenceIntent('include kanban and canvas links for missions'), {
    links: 'both'
  });
  assert.deepEqual(parseMissionUpdatePreferenceIntent('telegram only, no links for mission updates'), {
    links: 'none'
  });
  assert.deepEqual(parseMissionUpdatePreferenceIntent('send detailed progress too and the mission board link'), {
    verbosity: 'verbose',
    links: 'board'
  });
  assert.equal(parseMissionUpdatePreferenceIntent('what do you think about this idea'), null);
  assert.equal(
    parseMissionUpdatePreferenceIntent('please help me design a project called Relay Workshop with kanban and canvas, but do not build yet'),
    null
  );
  assert.equal(
    parseMissionUpdatePreferenceIntent(`Build this at C:\\Users\\USER\\Desktop\\terminal-chef-clock: a vanilla-JS static app called Terminal Chef Clock. Files: index.html, styles.css, app.js, README.md. No build step.

Make it a playful dark terminal-style cooking timer for developers who cook.

First screen:
- A full-screen terminal dashboard with a huge monospace countdown.
- A tiny “cook log” panel that records timer starts, pauses, resets, and completions.

Behavior:
- Countdown updates every second.
- State persists in localStorage under key terminal-chef-clock:v1.`),
    null
  );
  assert.equal(parseMissionUpdatePreferenceIntent('go now and start the mission with canvas links'), null);
  assert.equal(parseMissionUpdatePreferenceIntent('let us run the build now with board and canvas'), null);
  assert.equal(parseMissionUpdatePreferenceIntent('start it, include the canvas when ready'), null);
  assert.deepEqual(
    parseMissionUpdatePreferenceIntent('go now and start the mission with canvas links', { allowExecutionLanguage: true }),
    { links: 'canvas' }
  );
  assert.deepEqual(
    parseMissionUpdatePreferenceIntent('let us run the build now with board and canvas', { allowExecutionLanguage: true }),
    { links: 'both' }
  );
});

test('spaces mission preference acknowledgements for Telegram scanning', () => {
  assert.equal(
    formatMissionUpdatePreferenceAcknowledgement([
      'Links: both - Mission updates include both the Mission board/Kanban and canvas links.'
    ]),
    [
      'Done, I updated how I narrate missions.',
      '',
      'I will include both the Mission board and project canvas links.'
    ].join('\n')
  );
});

test('keeps build flow language from becoming access changes', () => {
  assert.equal(parseNaturalAccessChangeIntent('change my access level to 4'), '4');
  assert.equal(parseNaturalAccessChangeIntent('set this chat to full access'), 'full access');
  assert.equal(
    parseNaturalAccessChangeIntent('let us build the appointment system with full access to the project brief'),
    null
  );
  assert.equal(
    parseContextualAccessChangeIntent('let us do it', ['Done - I changed this chat to Level 4 - Full Access.']),
    null
  );
  assert.equal(
    parseContextualAccessChangeIntent('level 3', ['Done - I changed this chat to Level 4 - Full Access.']),
    '3'
  );

  const frame = buildConversationFrame('let us do it', [
    { role: 'assistant', text: 'Done - I changed this chat to Level 4 - Full Access.' }
  ]);
  assert.equal(frame.referenceResolution.kind, 'none');
});

test('keeps explicit design-only project prompts in conversation', () => {
  const prompt = 'please help me design a project called Relay Workshop with kanban and canvas, but do not build yet';

  assert.equal(shouldPreferConversationalIdeation(prompt), true);
  assert.equal(parseMissionUpdatePreferenceIntent(prompt), null);
});

test('keeps mission-control product refinement in conversation', () => {
  assert.equal(
    shouldPreferConversationalIdeation(
      'Solo first. I like Mission Control Dashboard, but make it more playful and game-like, not just tasks. Maybe it should turn daily goals into little missions with status, energy, streaks, and a launch sequence. What would the first version be?'
    ),
    true
  );
});

test('keeps tentative Spawner Kanban and Canvas improvement questions in conversation', () => {
  assert.equal(
    shouldPreferConversationalIdeation(
      'maybe we should improve the existing Spawner Kanban and Canvas flow, what would be the best first version?'
    ),
    true
  );
});

test('ideation hint assumes existing Spawner Kanban and Canvas routes', () => {
  const hint = buildIdeationSystemHint(
    'maybe we should improve the existing Spawner Kanban and Canvas flow, what would be the best first version?'
  );

  assert.match(hint, /Assume Kanban and Canvas already exist inside spawner-ui/);
  assert.match(hint, /Do not suggest building a standalone Kanban app/);
  assert.match(hint, /existing spawner-ui routes, state, and relay behavior/);
});

test('keeps local numbered-option follow-ups in conversation', () => {
  const prompt = 'no.1 could be handy - how would you think of the no2?';

  assert.equal(hasLocalOptionReference(prompt), true);
  assert.equal(hasLocalOptionReference('The second'), true);
  assert.equal(hasLocalOptionReference('option two'), true);
  assert.equal(hasLocalOptionReference('go with the 3rd path'), true);
  assert.equal(hasLocalOptionReference('Let\'s do two'), true);
  assert.equal(hasLocalOptionReference('please pick option three'), true);
  assert.equal(hasLocalOptionReference('the first one'), true);
  assert.equal(hasLocalOptionReference('the last one'), true);
  assert.equal(hasLocalOptionReference('I would take the final path'), true);
  assert.equal(hasLocalOptionReference('the latter'), true);
  assert.equal(hasLocalOptionReference('that option'), true);
  assert.equal(hasLocalOptionReference('let us build a page where the first screen should show the dashboard'), false);
  assert.equal(shouldPreferConversationalIdeation(prompt), true);
  assert.equal(shouldPreferConversationalIdeation('Let\'s do two'), true);
  assert.equal(inferMissionGoalFromRecentContext(prompt, [
    "I don't know what should we be building",
    'A few directions: 1. Spark Command Palette 2. Domain Chip Workbench'
  ]), null);
});

test('adds domain chip guidance for chip ideation', () => {
  const hint = buildIdeationSystemHint(
    'I want to create a new advanced domain chip with Spark. Help me shape the chip first before creating it.'
  );

  assert.match(hint, /advanced Spark domain chip/);
  assert.match(hint, /Do not start a build/);
  assert.match(hint, /most recent list/);
});

test('keeps hyphenated domain-chip repo references in conversation', () => {
  const text = "it's alchemist-content-lab on desktop works with domain-chip-xcontent";

  assert.equal(shouldPreferConversationalIdeation(text), true);
  assert.match(buildIdeationSystemHint(text), /advanced Spark domain chip/);
});

test('extracts natural domain chip create requests without slash-command handoff', () => {
  assert.equal(
    parseNaturalChipCreateIntent("let's build a domain-chip that creates us cool images out of ASCII patterns"),
    'creates us cool images out of ASCII patterns'
  );
  assert.equal(
    parseNaturalChipCreateIntent('build a domain-chip for Telegram memory routing'),
    'Telegram memory routing'
  );
  assert.equal(parseNaturalChipCreateIntent('which chips are active?'), null);
});

test('detects empty or generic LLM failures', () => {
  assert.equal(isLowInformationLlmReply(''), true);
  assert.equal(isLowInformationLlmReply("I'm here, but I couldn't generate a response right now."), true);
  assert.equal(isLowInformationLlmReply('Working Memory'), true);
  assert.equal(isLowInformationLlmReply('Spark Researcher returned no concrete guidance for this message.'), true);
  assert.equal(isLowInformationLlmReply('What would you like help with?'), true);
  assert.equal(isLowInformationLlmReply('Nothing active'), true);
  assert.equal(isLowInformationLlmReply('Access is not authorized for this channel. Ask the operator to review access.'), true);
  assert.equal(isLowInformationLlmReply(
    "I caught 'mission' in there.\n\nOptions:\n- Show the mission board (say 'what's running')\n- Start a new mission (say 'run <goal>' or use /run)\n\nWhich?"
  ), true);
  assert.equal(isLowInformationLlmReply('No prior list or options to match "the second" against in this conversation.'), true);
  assert.equal(isLowInformationLlmReply(
    "I caught 'chip' in there but I'm not sure what you want.\n\nOptions I can actually do:\n- Run a loop on a specific chip (say 'loop <chip-key>')\n- List active chips (say 'which chips are active')"
  ), true);
  assert.equal(isLowInformationLlmReply(
    "Got it - a chip for:\ncreates us cool images out of ASCII patterns\n\nTap this to scaffold it (takes 30-60s):\n/chip create creates us cool images out of ASCII patterns\n\nI hand off to the slash command so you see the scaffolder's output live and can cancel if the brief needs tweaking."
  ), true);
  assert.equal(isLowInformationLlmReply('Here is a real idea.'), false);
});

test('suppresses memory acknowledgements for normal chat replies', () => {
  assert.equal(isMemoryAcknowledgementReply('Noted: "yes i was wondering how is the chat with you"'), true);
  assert.equal(
    isMemoryAcknowledgementReply('I have saved memory about preferred Spark reply style: "concise but warm"'),
    true
  );
  assert.equal(shouldSuppressBuilderReplyForPlainChat('Noted: "yes i was wondering how is the chat with you"'), true);
  assert.equal(
    shouldSuppressBuilderReplyForPlainChat(
      "I'll remember that your current plan is to run a fresh diagnostics scan.",
      'memory_generic_observation'
    ),
    false
  );
  assert.equal(
    shouldSuppressBuilderReplyForPlainChat('Spark Researcher returned no concrete guidance for this message.'),
    true
  );
  assert.equal(shouldSuppressBuilderReplyForPlainChat('I am doing well. The chat is working normally.'), false);
  assert.equal(
    shouldSuppressBuilderReplyForPlainChat(
      [
        'Spark self-awareness',
        '',
        'Where Spark lacks',
        '- Registry visibility does not prove recent invocation.',
        '',
        'LLM wiki',
        '- retrieval: supported (3 wiki hits)',
      ].join('\n'),
      'self_awareness_direct'
    ),
    false
  );
});

test('detects natural Spark LLM wiki status questions without stealing build prompts', () => {
  assert.equal(isSparkWikiStatusQuestion('is your LLM wiki active right now?'), true);
  assert.equal(isSparkWikiStatusQuestion('can you check whether the Spark knowledge base is retrievable?'), true);
  assert.equal(isSparkWikiStatusQuestion('show me the Obsidian vault status'), true);
  assert.equal(isSparkWikiStatusQuestion('build me a wiki app for my team'), false);
  assert.equal(isSparkWikiStatusQuestion('what is a wiki?'), false);
});

test('detects natural Spark LLM wiki inventory questions separately from status', () => {
  assert.equal(isSparkWikiInventoryQuestion('what pages are in your LLM wiki?'), true);
  assert.equal(isSparkWikiInventoryQuestion('list the Spark knowledge base contents'), true);
  assert.equal(isSparkWikiInventoryQuestion('show me the Obsidian vault status'), false);
  assert.equal(isSparkWikiInventoryQuestion('build me a wiki app for my team'), false);
});

test('extracts natural Spark LLM wiki retrieval queries without stealing status or inventory', () => {
  assert.equal(extractSparkWikiQuery('search your wiki for recursive self-improvement loops'), 'recursive self-improvement loops');
  assert.equal(extractSparkWikiQuery('what does the Spark knowledge base say about route tracing?'), 'route tracing');
  assert.equal(extractSparkWikiQuery('from your LLM wiki, how should memory promotion work?'), 'should memory promotion work');
  assert.equal(extractSparkWikiQuery('show me the Obsidian vault status'), null);
  assert.equal(extractSparkWikiQuery('what pages are in your LLM wiki?'), null);
  assert.equal(extractSparkWikiQuery('build me a wiki app for my team'), null);
});

test('extracts natural Spark LLM wiki answer questions separately from query/status/inventory', () => {
  assert.equal(
    extractSparkWikiAnswerQuestion('answer from your LLM wiki how should route tracing work?'),
    'how should route tracing work'
  );
  assert.equal(
    extractSparkWikiAnswerQuestion('can you explain memory promotion using the Spark knowledge base'),
    'memory promotion'
  );
  assert.equal(extractSparkWikiAnswerQuestion('search your wiki for memory promotion'), null);
  assert.equal(extractSparkWikiAnswerQuestion('what pages are in your LLM wiki?'), null);
  assert.equal(extractSparkWikiAnswerQuestion('build me a wiki app'), null);
});

test('extracts natural Spark self-improvement goals without stealing builds or wiki queries', () => {
  assert.equal(
    extractSparkSelfImprovementGoal('Spark improve your weak spots around route confidence'),
    'improve your weak spots around route confidence'
  );
  assert.equal(
    extractSparkSelfImprovementGoal('Can you improve where you lack in self-awareness?'),
    'improve where you lack in self-awareness'
  );
  assert.equal(extractSparkSelfImprovementGoal('search your wiki for weak spots'), null);
  assert.equal(extractSparkSelfImprovementGoal('build me a self-improvement dashboard'), null);
});

test('extracts safe Spark wiki improvement promotion intents', () => {
  assert.deepEqual(
    extractSparkWikiPromotionIntent(
      'save this as a wiki improvement: Spark should separate route registration from recent invocation evidence'
    ),
    {
      title: 'Spark should separate route registration from recent invocation evidence',
      summary: 'Spark should separate route registration from recent invocation evidence',
      status: 'candidate'
    }
  );
  assert.deepEqual(
    extractSparkWikiPromotionIntent(
      'promote verified wiki note: route confidence improved after pytest evidence confirmed the trace path'
    ),
    {
      title: 'route confidence improved after pytest evidence confirmed the trace path',
      summary: 'route confidence improved after pytest evidence confirmed the trace path',
      status: 'verified'
    }
  );
  assert.equal(extractSparkWikiPromotionIntent('what pages are in your LLM wiki?'), null);
  assert.equal(extractSparkWikiPromotionIntent('build me a wiki notes app'), null);
});

test('extracts explicit plain-chat memory directives', () => {
  assert.equal(
    extractPlainChatMemoryDirective('can you remember that you are a QA agent'),
    'you are a QA agent'
  );
  assert.equal(
    extractPlainChatMemoryDirective('Please remember this session test code word: aurora mango.'),
    'this session test code word: aurora mango'
  );
  assert.equal(extractPlainChatMemoryDirective('remember: my preferred reply style is concise'), 'my preferred reply style is concise');
  assert.equal(extractPlainChatMemoryDirective('what do you remember about me'), null);
  assert.equal(extractPlainChatMemoryDirective('do you have memory right now'), null);
});

test('memory fallback does not claim a no-op save succeeded', () => {
  const reply = buildMemoryBridgeUnavailableReply('remember');

  assert.match(reply, /could not confirm/i);
  assert.match(reply, /spark verify --deep/);
  assert.doesNotMatch(reply, /remember:/i);
  assert.doesNotMatch(reply, /got it/i);
});

test('chat runtime failure replies give operators a useful next step', () => {
  const adminReply = renderChatRuntimeFailureReply(true, true);
  const userReply = renderChatRuntimeFailureReply(false, false);

  assert.match(adminReply, /reasoning path is not healthy/);
  assert.match(adminReply, /Run \/diagnose/);
  assert.match(adminReply, /chat provider/);
  assert.match(userReply, /chat model is not healthy/);
  assert.match(userReply, /ask the operator/);
});

test('recognizes natural access status questions', () => {
  assert.equal(isAccessStatusQuestion('what is my access level?'), true);
  assert.equal(isAccessStatusQuestion("What's my access level right now?"), true);
  assert.equal(isAccessStatusQuestion('can you show my Spark access status'), true);
  assert.equal(isAccessStatusQuestion('which access level are we on right now'), true);
  assert.equal(isAccessStatusQuestion('change my access level to full access'), false);
  assert.equal(isAccessStatusQuestion('please remember that my access level is important'), false);
});

test('parses natural access change requests', () => {
  assert.equal(parseNaturalAccessChangeIntent('can you change my access level to access 3?'), '3');
  assert.equal(parseNaturalAccessChangeIntent('Change my access level to three please'), '3');
  assert.equal(parseNaturalAccessChangeIntent('please switch Spark access to full access'), 'full access');
  assert.equal(parseNaturalAccessChangeIntent('raise my access to level 4'), '4');
  assert.equal(parseNaturalAccessChangeIntent('lower my access to two'), '2');
  assert.equal(parseNaturalAccessChangeIntent('what is my access level?'), null);
  assert.equal(parseNaturalAccessChangeIntent('please remember that my access level is 3'), null);
});

test('resolves contextual access change follow-ups from recent access turns', () => {
  const recent = [
    'User: Change my access level to three please',
    'Spark: Done - I changed this chat to Level 3 - Research + Build.'
  ];

  assert.equal(hasRecentAccessConversation(recent), true);
  assert.equal(inferRecentConversationFocus(recent), 'access');
  assert.equal(parseContextualAccessChangeIntent('Change it to 4', recent), '4');
  assert.equal(parseContextualAccessChangeIntent('Actually make it four', recent), '4');
  assert.equal(parseContextualAccessChangeIntent('4', recent), '4');
  assert.equal(parseContextualAccessChangeIntent('do four instead', recent), '4');
  assert.equal(parseContextualAccessChangeIntent('Change it to 4', ['User: I like the fourth design']), null);
  assert.equal(inferRecentConversationFocus(['User: I like the fourth design']), null);
  assert.equal(parseContextualAccessChangeIntent('Remember that I like level 4', recent), null);
});

test('recognizes fuzzy access system help questions', () => {
  assert.equal(isAccessHelpQuestion('does Spark have access levels or something like that?'), true);
  assert.equal(isAccessHelpQuestion('what access tiers unlock local files?'), true);
  assert.equal(isAccessHelpQuestion('is there a permission management surface for this chat?'), true);
  assert.equal(isAccessHelpQuestion('please remember that access levels matter to me'), false);
  assert.equal(isAccessHelpQuestion('I like access to clean design tools'), false);
});

test('provides a conversational fallback for mission dashboard refinement', () => {
  const reply = buildIdeationFallbackReply(
    'Solo first. I like Mission Control Dashboard, but make it more playful and game-like, not just tasks. What would the first version be?'
  );

  assert.match(reply, /daily command center/);
  assert.match(reply, /not a task list/);
  assert.doesNotMatch(reply, /Nothing active/);
});
