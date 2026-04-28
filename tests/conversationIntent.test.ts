import assert from 'node:assert/strict';
import {
  buildIdeationFallbackReply,
  buildIdeationSystemHint,
  buildContextualImprovementGoal,
  buildDiagnosticFollowupTestReply,
  buildExternalResearchGoal,
  buildLocalSparkServiceClarificationReply,
  buildLocalSparkServiceReply,
  buildMemoryBridgeUnavailableReply,
  buildRecentBuildContextReply,
  extractPlainChatMemoryDirective,
  formatMissionUpdatePreferenceAcknowledgement,
  hasLocalOptionReference,
  inferDefaultBuildFromRecentScoping,
  inferMissionGoalFromRecentContext,
  isBuildContextRecallQuestion,
  isDiagnosticFollowupTestQuestion,
  isDiagnosticsScanRequest,
  isAmbiguousLocalSparkServiceRequest,
  isExternalResearchRequest,
  isExplicitContextualBuildRequest,
  isLocalSparkServiceRequest,
  isMissionExecutionConfirmation,
  isMemoryAcknowledgementReply,
  isLowInformationLlmReply,
  parseNaturalChipCreateIntent,
  parseMissionUpdatePreferenceIntent,
  parseSpawnerBoardNaturalIntent,
  renderChatRuntimeFailureReply,
  shouldSuppressBuilderReplyForPlainChat,
  shouldPreferConversationalIdeation
} from '../src/conversationIntent';

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
  assert.match(buildLocalSparkServiceReply(true), /http:\/\/127\.0\.0\.1:5173/);
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

test('asks for clarification on cold localhost requests', () => {
  assert.equal(isAmbiguousLocalSparkServiceRequest('can you run the localhost for me', ''), true);
  assert.equal(isLocalSparkServiceRequest('can you run the localhost for me', ''), false);
  assert.match(buildLocalSparkServiceClarificationReply(), /Which local Spark surface/);
});

test('routes natural Spawner board questions to board reads', () => {
  assert.equal(parseSpawnerBoardNaturalIntent('show me the current Spawner/Kanban board'), 'board');
  assert.equal(parseSpawnerBoardNaturalIntent('did the latest canvas run show up on kanban?'), 'latest_on_kanban');
  assert.equal(parseSpawnerBoardNaturalIntent('which LLM took the latest Spawner job?'), 'latest_provider');
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
});

test('spaces mission preference acknowledgements for Telegram scanning', () => {
  assert.equal(
    formatMissionUpdatePreferenceAcknowledgement([
      'Links: both - Mission updates include both the Mission board/Kanban and canvas links.'
    ]),
    [
      'Saved your mission update preference.',
      '',
      'Links: both - Mission updates include both the Mission board/Kanban and canvas links.'
    ].join('\n')
  );
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
  assert.equal(shouldPreferConversationalIdeation(prompt), true);
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
});

test('extracts explicit plain-chat memory directives', () => {
  assert.equal(
    extractPlainChatMemoryDirective('can you remember that you are a QA agent'),
    'you are a QA agent'
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

test('provides a conversational fallback for mission dashboard refinement', () => {
  const reply = buildIdeationFallbackReply(
    'Solo first. I like Mission Control Dashboard, but make it more playful and game-like, not just tasks. What would the first version be?'
  );

  assert.match(reply, /daily command center/);
  assert.match(reply, /not a task list/);
  assert.doesNotMatch(reply, /Nothing active/);
});
