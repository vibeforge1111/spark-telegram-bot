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
  inferMissionGoalFromRecentContext,
  isBuildContextRecallQuestion,
  isDiagnosticFollowupTestQuestion,
  isAmbiguousLocalSparkServiceRequest,
  isExternalResearchRequest,
  isExplicitContextualBuildRequest,
  isLocalSparkServiceRequest,
  isMissionExecutionConfirmation,
  isMemoryAcknowledgementReply,
  isLowInformationLlmReply,
  parseMissionUpdatePreferenceIntent,
  parseSpawnerBoardNaturalIntent,
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
  assert.equal(isMissionExecutionConfirmation('sounds good'), true);
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

test('prefers current kanban planning over older completed build memory', () => {
  assert.equal(isBuildContextRecallQuestion('what were we going to build again?'), true);
  const reply = buildRecentBuildContextReply([
    'Completed Spawner mission spark-123 via Codex. Goal: Build Spark Diagnostic Agent. Result: Built the first-pass Spark Diagnostic Agent.',
    'maybe we should build a tiny kanban app, what would be the best first version?',
    'that sounds good',
    'Recent Telegram turns:\n- User: maybe we should build a tiny kanban app, what would be the best first version?\n- User: that sounds good'
  ]);

  assert.ok(reply);
  assert.match(reply, /^We were shaping a tiny kanban app\./);
  assert.match(reply, /tiny kanban app/);
  assert.match(reply, /Backlog, In Progress, and Done/);
  assert.match(reply, /No mission has been started/);
  assert.match(reply, /app\.\n\nThe v1 idea/);
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

test('answers diagnostic follow-up testing questions from mission context', () => {
  assert.equal(isDiagnosticFollowupTestQuestion('lets test it'), true);
  const reply = buildDiagnosticFollowupTestReply(
    'Completed Spawner mission spark-123. Result: Built the first-pass Spark Diagnostic Agent with `spark-intelligence diagnostics scan`.'
  );

  assert.ok(reply);
  assert.match(reply, /fresh diagnostics scan/);
  assert.match(reply, /follow-up Codex mission/);
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

test('keeps tentative kanban-app v1 questions in conversation', () => {
  assert.equal(
    shouldPreferConversationalIdeation(
      'maybe we should build a tiny kanban app, what would be the best first version?'
    ),
    true
  );
});

test('adds domain chip guidance for chip ideation', () => {
  const hint = buildIdeationSystemHint(
    'I want to create a new advanced domain chip with Spark. Help me shape the chip first before creating it.'
  );

  assert.match(hint, /advanced Spark domain chip/);
  assert.match(hint, /Do not start a build/);
});

test('detects empty or generic LLM failures', () => {
  assert.equal(isLowInformationLlmReply(''), true);
  assert.equal(isLowInformationLlmReply("I'm here, but I couldn't generate a response right now."), true);
  assert.equal(isLowInformationLlmReply('Working Memory'), true);
  assert.equal(isLowInformationLlmReply('Spark Researcher returned no concrete guidance for this message.'), true);
  assert.equal(isLowInformationLlmReply('What would you like help with?'), true);
  assert.equal(isLowInformationLlmReply('Nothing active'), true);
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

test('provides a conversational fallback for mission dashboard refinement', () => {
  const reply = buildIdeationFallbackReply(
    'Solo first. I like Mission Control Dashboard, but make it more playful and game-like, not just tasks. What would the first version be?'
  );

  assert.match(reply, /daily command center/);
  assert.match(reply, /not a task list/);
  assert.doesNotMatch(reply, /Nothing active/);
});
