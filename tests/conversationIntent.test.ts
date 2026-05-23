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
  extractAgentDoctrinePreference,
  formatAgentDoctrinePreferenceAcknowledgement,
  formatAgentDoctrinePreferenceForBuilderSync,
  formatAgentDoctrinePreferenceStatus,
  formatGlobalAgentDoctrineRequestReply,
  extractSparkSelfImprovementGoal,
  extractSparkWikiAnswerQuestion,
  extractSparkWikiPromotionIntent,
  extractPlainChatMemoryDirective,
  extractSparkWikiQuery,
  formatMissionUpdatePreferenceAcknowledgement,
  hasRecentAccessCapabilityMismatch,
  hasRecentAccessConversation,
  hasLocalOptionReference,
  inferRecentConversationFocus,
  inferDefaultBuildFromRecentScoping,
  inferMissionFromRecentContext,
  inferMissionGoalFromRecentContext,
  isAccessCapabilityMismatchQuestion,
  isContextualAccessCapabilityMismatchQuestion,
  isAccessHelpQuestion,
  isAccessStatusQuestion,
  builderReplySuppressionReason,
  isBuildContextRecallQuestion,
  isDiagnosticFollowupTestQuestion,
  isDiagnosticsScanRequest,
  isAmbiguousLocalSparkServiceRequest,
  isExternalResearchRequest,
  isExplicitContextualBuildRequest,
  isSparkChipStatusOverclaimQuestion,
  isSparkWorkflowBugHuntRequest,
  isSparkThreadQaGoldenCaseRequest,
  renderSparkThreadQaGoldenCaseReply,
  isSparkWikiInventoryQuestion,
  isSparkWikiStatusQuestion,
  isProjectImprovementRequest,
  isLocalSparkServiceRequest,
  isMissionExecutionConfirmation,
  isMemoryAcknowledgementReply,
  isMemoryDoctorRequest,
  isNoExecutionBoundary,
  isLowInformationLlmReply,
  isAgentDoctrinePreferenceStatusQuestion,
  isGlobalAgentDoctrineRequest,
  isStandaloneAgentDoctrinePreference,
  isUserMemoryRecallQuestion,
  parseContextualAccessChangeIntent,
  parseNaturalAccessChangeIntent,
  parseNaturalChipCreateIntent,
  parseNaturalCreatorMissionIntent,
  parseNaturalRecursiveCommandIntent,
  parseMissionUpdatePreferenceIntent,
  parseContextualSpawnerBoardNaturalIntent,
  parseSpawnerBoardNaturalIntent,
  renderChatRuntimeFailureReply,
  shouldSuppressBuilderReplyForPlainChat,
  shouldUseBuilderReplyForMemoryDirective,
  shouldPreferConversationalIdeation
} from '../src/conversationIntent';
import { buildConversationFrame } from '../src/conversationFrame';
import {
  buildMemoryDoctorEvidencePrompt,
  isMemoryDoctorBridgeDetourReply,
  renderMemoryDoctorEvidenceFallback,
  selectMemoryDoctorEvidenceTurns,
  shouldPreferMemoryDoctorEvidenceFallback,
  shouldAttachMemoryDoctorEvidence
} from '../src/memoryDoctorBridge';

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
  assert.equal(
    shouldPreferConversationalIdeation('how do we make setup automatic without making the bot run a command instantly?'),
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

test('detects no-execution boundaries before pending builds can launch', () => {
  assert.equal(isNoExecutionBoundary('no need we can talk here'), true);
  assert.equal(isNoExecutionBoundary('do not start a mission; just explain the failure class'), true);
  assert.equal(isNoExecutionBoundary('not now, maybe later'), true);
  assert.equal(isNoExecutionBoundary('we can discuss here for now'), true);
  assert.equal(isNoExecutionBoundary('go ahead and build it'), false);
});

test('infers Spark bug-recognition mission from recent planning context', () => {
  const mission = inferMissionFromRecentContext(
    "Yes, let's do it create it after analyzing our systems deeply please",
    [
      "let's build something together shall we",
      'a new domain chip',
      'build new',
      "let's build something that can be helpful in recognizing the bugs happening in the systems of Spark",
      'I do not know where the logs live. All systems. Passive. Obsidian for the logs.'
    ]
  );

  assert.ok(mission);
  assert.equal(mission.missionName, 'Spark Bug Recognition Domain Chip');
  const goal = mission.goal;
  assert.ok(goal);
  assert.match(goal, /passive Spark bug-recognition domain chip/);
  assert.match(goal, /Obsidian-friendly Markdown/);
  assert.match(goal, /spark-telegram-bot/);
  assert.equal(
    inferMissionGoalFromRecentContext("Yes, let's do it create it after analyzing our systems deeply please", [
      "let's build something together shall we",
      'a new domain chip',
      'build new',
      "let's build something that can be helpful in recognizing the bugs happening in the systems of Spark",
      'I do not know where the logs live. All systems. Passive. Obsidian for the logs.'
    ]),
    goal
  );
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

test('separates user memory recall from build context recall', () => {
  assert.equal(isUserMemoryRecallQuestion('what do you remember about how I like mission updates?'), true);
  assert.equal(isBuildContextRecallQuestion('what do you remember about how I like mission updates?'), false);
  assert.equal(
    isUserMemoryRecallQuestion('what do you know about how I like to work, and what is only recent context?'),
    true
  );
  assert.equal(
    isUserMemoryRecallQuestion('Use memory only as context: what did we decide about Railway testing? Keep it short and do not run anything.'),
    true
  );
  assert.equal(
    isBuildContextRecallQuestion('Use memory only as context: what did we decide about Railway testing? Keep it short and do not run anything.'),
    false
  );
  assert.equal(isBuildContextRecallQuestion('we were gonna build something do you remember what it was'), true);
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
  assert.equal(parseSpawnerBoardNaturalIntent('what is currently running or paused in Mission Control? keep it short and do not start anything.'), 'active_missions');
  assert.equal(parseSpawnerBoardNaturalIntent('did the latest canvas run show up on kanban?'), 'latest_on_kanban');
  assert.equal(parseSpawnerBoardNaturalIntent('which LLM took the latest Spawner job?'), 'latest_provider');
  assert.equal(parseSpawnerBoardNaturalIntent('which model handled the latest failed Spawner job? Do not start anything.'), 'latest_failed_provider');
  assert.equal(parseSpawnerBoardNaturalIntent('who handled the broken one? Do not start anything.'), 'latest_failed_provider');
  assert.equal(parseSpawnerBoardNaturalIntent('who took that one? Do not start anything.'), null);
  assert.equal(
    parseContextualSpawnerBoardNaturalIntent('who took that one? Do not start anything.', [
      'which model handled the latest failed Spawner job? Do not start anything.'
    ]),
    'latest_failed_provider'
  );
  assert.equal(
    parseContextualSpawnerBoardNaturalIntent('who took that one? Do not start anything.', [
      'which LLM took the latest Spawner job?'
    ]),
    'latest_provider'
  );
  assert.equal(parseSpawnerBoardNaturalIntent('what blocked that one? Do not start anything.'), null);
  assert.equal(
    parseContextualSpawnerBoardNaturalIntent('what blocked that one? Do not start anything.', [
      'which model handled the latest failed Spawner job? Do not start anything.'
    ]),
    'latest_failure'
  );
  assert.equal(
    parseContextualSpawnerBoardNaturalIntent('what blocked that one? Do not start anything.', [
      'which LLM took the latest Spawner job?'
    ]),
    null
  );
  assert.equal(parseSpawnerBoardNaturalIntent('can I open that one? Do not start anything.'), null);
  assert.equal(
    parseContextualSpawnerBoardNaturalIntent('can I open that one? Do not start anything.', [
      'what failed most recently in Spawner? Do not start anything.'
    ]),
    'latest_failure'
  );
  assert.equal(
    parseContextualSpawnerBoardNaturalIntent('can I open that one? Do not start anything.', [
      'which LLM took the latest Spawner job?'
    ]),
    null
  );
  assert.equal(parseSpawnerBoardNaturalIntent('what was the mission?'), 'latest_mission');
  assert.equal(parseSpawnerBoardNaturalIntent('which mission was that?'), 'latest_mission');
  assert.equal(parseSpawnerBoardNaturalIntent('what happened'), 'latest_failure');
  assert.equal(parseSpawnerBoardNaturalIntent('why did the latest mission fail?'), 'latest_failure');
  assert.equal(parseSpawnerBoardNaturalIntent('what failed most recently in Spawner? Do not start anything.'), 'latest_failure');
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

test('does not treat route hijack audit wording as diagnostic follow-up tests', () => {
  assert.equal(
    isDiagnosticFollowupTestQuestion(
      'also words like build access and some other things hijack the chat instantly, can you check whether we fixed that'
    ),
    false
  );
});

test('does not turn product-memory mission boundary questions into workflow bug hunt cards', () => {
  assert.equal(
    isSparkWorkflowBugHuntRequest(
      'If I ask about Spark Thread QA product polish, when should you mention Mission Control state?'
    ),
    false
  );
  assert.equal(
    isSparkWorkflowBugHuntRequest(
      'What is the difference between product-memory context and current mission state?'
    ),
    false
  );
});

test('recognizes H70 Thread QA golden-case requests as conversation fixtures', () => {
  const prompt = 'Do not build anything. Turn the H70 Orbit Proof interruption into a golden Thread QA test case. Keep it natural and short.';
  assert.equal(isSparkThreadQaGoldenCaseRequest(prompt), true);
  assert.equal(isSparkWorkflowBugHuntRequest(prompt), false);

  const reply = renderSparkThreadQaGoldenCaseReply(prompt);
  assert.match(reply, /golden Thread QA case, not a build/);
  assert.match(reply, /H70 Orbit Proof canvas update intrudes/);
  assert.match(reply, /Mission Control state only appears if the user asks/);
  assert.doesNotMatch(reply, /Runtime health|Degraded surfaces|Active loops/i);
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

test('does not treat Spark memory and self-awareness diagnostics as latest project polish', () => {
  const project = {
    chatId: '8319079055',
    userId: '1278511160',
    projectName: 'Loop Lantern',
    projectPath: 'C:/Users/USER/Desktop/loop-lantern',
    previewUrl: 'http://127.0.0.1:5555/preview/loop-lantern/index.html',
    missionId: 'mission-loop',
    iteration: 2,
    shippedAt: '2026-05-01T00:00:00Z',
    updatedAt: '2026-05-01T00:00:00Z'
  };

  const memoryLackPrompt = 'Where does your memory still lack right now, and how would we improve it?';
  const selfAwarenessPrompt = 'Can you improve where you lack in self-awareness?';

  assert.equal(isProjectImprovementRequest(memoryLackPrompt, project), false);
  assert.equal(buildProjectImprovementGoal(memoryLackPrompt, project), null);
  assert.equal(isProjectImprovementRequest(selfAwarenessPrompt, project), false);
  assert.equal(buildProjectImprovementGoal(selfAwarenessPrompt, project), null);
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
  assert.equal(parseNaturalAccessChangeIntent('set this chat to level 5'), '5');
  assert.equal(parseNaturalAccessChangeIntent('switch Spark access to sandboxed local'), 'sandboxed local');
  assert.equal(
    parseNaturalAccessChangeIntent('let us build the appointment system with full access to the project brief'),
    null
  );
  assert.equal(
    parseContextualAccessChangeIntent('let us do it', ['Done - I changed this chat to Access level 4.']),
    null
  );
  assert.equal(
    parseContextualAccessChangeIntent('level 3', ['Done - I changed this chat to Access level 4.']),
    '3'
  );

  const frame = buildConversationFrame('let us do it', [
    { role: 'assistant', text: 'Done - I changed this chat to Access level 4.' }
  ]);
  assert.equal(frame.referenceResolution.kind, 'none');
});

test('keeps explicit design-only project prompts in conversation', () => {
  const prompt = 'please help me design a project called Relay Workshop with kanban and canvas, but do not build yet';

  assert.equal(shouldPreferConversationalIdeation(prompt), true);
  assert.equal(parseMissionUpdatePreferenceIntent(prompt), null);

  const hint = buildIdeationSystemHint(prompt);
  assert.match(hint, /explicitly asked not to build yet/);
  assert.match(hint, /small starter scaffold/);
  assert.match(hint, /do not only ask the user to pick a direction/i);
  assert.match(hint, /Do not scold the user/);
});

test('keeps access and build bug reports out of deterministic route menus', () => {
  const keywordAudit = 'words like build access and other things hijack chat instantly, can you check whether we fixed that';
  assert.equal(isAccessStatusQuestion(keywordAudit), false);
  assert.equal(isAccessHelpQuestion(keywordAudit), false);
  assert.equal(parseNaturalAccessChangeIntent(keywordAudit), null);

  const mismatch = 'how is this read only when we are at access level 4';
  assert.equal(isAccessCapabilityMismatchQuestion(mismatch), true);
  assert.equal(isAccessStatusQuestion(mismatch), false);
  assert.equal(isAccessHelpQuestion(mismatch), false);
  assert.equal(parseNaturalAccessChangeIntent(mismatch), null);

  const report = 'when access level 4 was saying full access, the mac only had read-only access and could not do anything';
  assert.equal(isAccessCapabilityMismatchQuestion(report), true);
  assert.equal(parseNaturalAccessChangeIntent(report), null);
});

test('detects contextual access capability mismatch follow-ups', () => {
  const recent = [
    'Access: Level 4 allowed',
    'Current runner: read-only',
    'Writable route: required via Spawner/Codex mission'
  ];

  assert.equal(hasRecentAccessCapabilityMismatch(recent), true);
  assert.equal(isContextualAccessCapabilityMismatchQuestion('is the access level problem?', recent), true);
  assert.equal(isContextualAccessCapabilityMismatchQuestion('how is this read only i dont get it', recent), true);
  assert.equal(isContextualAccessCapabilityMismatchQuestion('is the access level problem?', ['what should we build next?']), false);
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
  assert.equal(
    parseNaturalChipCreateIntent('make me a chip that turns meeting notes into action items'),
    'turns meeting notes into action items'
  );
  assert.equal(
    parseNaturalChipCreateIntent('domain-chip named Spark Memory Watcher for memory drift'),
    'Spark Memory Watcher for memory drift'
  );
  assert.equal(
    parseNaturalChipCreateIntent('I want to create a new advanced domain chip with Spark. Help me shape the chip first before creating it.'),
    null
  );
  assert.equal(
    parseNaturalChipCreateIntent('do not build yet, help me think through a domain chip for route confidence'),
    null
  );
  assert.equal(parseNaturalChipCreateIntent('which chips are active?'), null);
});

test('extracts natural creator mission requests for QA Operator benchmark work', () => {
  const intent = parseNaturalCreatorMissionIntent(
    'make the QA tester better by creating better benchmarks and autoloops for Spark Telegram and Workspace'
  );
  assert.equal(intent?.privacyMode, 'local_only');
  assert.equal(intent?.riskLevel, 'medium');
  assert.match(intent?.brief || '', /Improve Spark QA Operator/);
  assert.match(intent?.brief || '', /richer benchmark packs/);
  assert.match(intent?.brief || '', /Telegram natural-language QA flows/);
  assert.match(intent?.brief || '', /Spark Swarm Workspace sync/);
  assert.match(intent?.brief || '', /Canonical target domain: spark-qa-operator/);
  assert.match(intent?.brief || '', /benchmark lanes and product QA surfaces under Spark QA Operator/);
  assert.match(intent?.brief || '', /domain-chip-spark-qa-operator/);
  assert.equal(
    parseNaturalCreatorMissionIntent('do not build yet, help me think through a domain chip for route confidence'),
    null
  );

  assert.equal(
    parseNaturalCreatorMissionIntent('show me the Spark QA Operator report'),
    null
  );
  assert.equal(
    parseNaturalCreatorMissionIntent('create a private benchmarked specialization path with an autoloop for AI security questionnaires')?.privacyMode,
    'local_only'
  );
  const stagedPath = parseNaturalCreatorMissionIntent(
    'stage a private benchmarked specialization path with a domain chip, benchmark pack, and autoloop policy for Telegram tool usage'
  );
  assert.equal(stagedPath?.privacyMode, 'local_only');
  assert.equal(stagedPath?.riskLevel, 'medium');
  assert.match(stagedPath?.brief || '', /creator-intent\.json/);
  assert.match(stagedPath?.brief || '', /domain-chip\/, benchmark\/, specialization-path\/, autoloop\/policy\.json/);
  assert.match(stagedPath?.brief || '', /before\/after gain/);
  assert.match(stagedPath?.brief || '', /swarm\/contribution_packet\.json before any publish or share step/);
  assert.match(stagedPath?.brief || '', /publication\.network_absorbable=false/);

  const stageOnlyPath = parseNaturalCreatorMissionIntent(
    'stage a Startup YC specialization path with a domain chip, benchmark pack, autoloop policy, and Telegram flow. Do not run it or publish it yet.'
  );
  assert.equal(stageOnlyPath?.privacyMode, 'local_only');
  assert.equal(stageOnlyPath?.riskLevel, 'medium');
  assert.match(stageOnlyPath?.brief || '', /Startup YC specialization path/i);
  assert.match(stageOnlyPath?.brief || '', /before\/after gain/);
  assert.match(stageOnlyPath?.brief || '', /network_absorbable=false/);

  const localInsightPacket = parseNaturalCreatorMissionIntent(
    'create a shareable insight packet for Startup YC. Do not publish it.'
  );
  assert.equal(localInsightPacket?.privacyMode, 'local_only');
  assert.equal(localInsightPacket?.riskLevel, 'medium');
  assert.match(localInsightPacket?.brief || '', /shareable insight packet/i);
  assert.match(localInsightPacket?.brief || '', /network_absorbable=false/);
});

test('keeps Memory Doctor and answer-audit requests out of stale creator context', () => {
  const context = {
    recentMessages: [
      'Planning Spark QA Operator benchmark path creator mission...',
      'Creator plan ready. Build Spark QA Operator with a domain chip, benchmark pack, specialization path, and autoloop policy.'
    ]
  };

  for (const prompt of [
    'run memory doctor for last request',
    'audit previous turn',
    'diagnose last answer',
    'you went blank and lost context, what happened?'
  ]) {
    assert.equal(isMemoryDoctorRequest(prompt), true, `${prompt} should be recognized as a Memory Doctor request`);
    assert.equal(parseNaturalCreatorMissionIntent(prompt, context), null, `${prompt} should not plan a creator mission`);
  }
});

test('builds recent-turn evidence for contextual Memory Doctor requests', () => {
  assert.equal(shouldAttachMemoryDoctorEvidence('audit previous turn'), true);
  assert.equal(shouldAttachMemoryDoctorEvidence('diagnose last answer'), true);
  assert.equal(shouldAttachMemoryDoctorEvidence('run memory doctor'), false);

  const prompt = buildMemoryDoctorEvidencePrompt('audit previous turn', [
    { role: 'user', text: 'do not build yet, help me think through a domain chip for route confidence' },
    { role: 'assistant', text: 'Good problem to formalize. Route confidence is currently implicit in Builder.' }
  ]);

  assert.match(prompt, /^audit previous turn/);
  assert.match(prompt, /Route: memory\.doctor/);
  assert.match(prompt, /Do not ask the user to paste the previous turn unless no recent turns are listed\./);
  assert.match(prompt, /- user: do not build yet, help me think through a domain chip for route confidence/);
  assert.match(prompt, /- assistant: Good problem to formalize\./);
});

test('selects immediate prior turns for contextual Memory Doctor evidence', () => {
  const turns = selectMemoryDoctorEvidenceTurns('run memory doctor for last request', [
    { role: 'user', text: 'all your chips work, right?' },
    { role: 'assistant', text: 'Spark chip status needs live probes.' },
    { role: 'user', text: 'what is route confidence in one sentence' },
    { role: 'assistant', text: 'Route confidence is evidence-backed route selection.' },
    { role: 'user', text: 'run memory doctor for last request' }
  ]);

  assert.deepEqual(turns, [
    { role: 'user', text: 'what is route confidence in one sentence' },
    { role: 'assistant', text: 'Route confidence is evidence-backed route selection.' }
  ]);
});

test('renders local fallback for Memory Doctor tool detours', () => {
  assert.equal(isMemoryDoctorBridgeDetourReply('Both Spark MCP tools need permission to run.'), true);
  assert.equal(isMemoryDoctorBridgeDetourReply('Still hitting the permissions gate. Approve `mcpsparkspark_reflect`.'), true);
  assert.equal(isMemoryDoctorBridgeDetourReply('I do not have visibility into what happened.'), true);
  assert.equal(isMemoryDoctorBridgeDetourReply('The previous turn was routed correctly.'), false);

  const reply = renderMemoryDoctorEvidenceFallback('run memory doctor for last request', [
    { role: 'user', text: 'run memory doctor for last request' },
    { role: 'assistant', text: 'Both Spark MCP tools need permission to run.' }
  ]);

  assert.match(reply, /Memory Doctor/);
  assert.match(reply, /without MCP\/tool approval/);
  assert.match(reply, /detoured into MCP\/tool permission/);
  assert.equal(
    shouldPreferMemoryDoctorEvidenceFallback('you went blank and lost context, what happened?', [
      { role: 'user', text: 'run memory doctor for last request' },
      { role: 'assistant', text: 'Both Spark MCP tools need permission to run.' }
    ]),
    true
  );
  assert.equal(
    shouldPreferMemoryDoctorEvidenceFallback('run memory doctor for last request', [
      { role: 'assistant', text: 'Both Spark MCP tools need permission to run.' }
    ]),
    false
  );
});

test('uses recent working context for ambiguous creator-system follow-ups', () => {
  const context = {
    recentMessages: [
      'We are building Spark QA Operator for Telegram and Workspace quality.',
      'It should improve recursive reports, creator missions, auth pairing, Canvas, and Kanban checks.'
    ]
  };
  const intent = parseNaturalCreatorMissionIntent(
    'make this better with benchmarks, specialization path, and autoloops',
    context
  );
  assert.equal(intent?.privacyMode, 'local_only');
  assert.match(intent?.brief || '', /Improve Spark QA Operator/);
  assert.match(intent?.brief || '', /Canonical target domain: spark-qa-operator/);
  assert.match(intent?.brief || '', /Telegram natural-language QA flows/);

  assert.equal(
    parseNaturalCreatorMissionIntent('make this better with benchmarks and autoloops'),
    null
  );

  const generic = parseNaturalCreatorMissionIntent(
    'turn this into a benchmark pack and autoloop policy',
    {
      recentMessages: [
        'We are discussing a personal AI security questionnaire operator.',
        'The operator should answer vendor security forms with evidence and review gates.'
      ]
    }
  );
  assert.match(generic?.brief || '', /Recent working context: We are discussing a personal AI security questionnaire operator/);
  assert.match(generic?.reason || '', /artifact manifests/);
});

test('extracts natural recursive commands for QA Operator loops', () => {
  assert.deepEqual(
    parseNaturalRecursiveCommandIntent('show me the QA tester report'),
    {
      rawCommand: 'report path:spark-qa-operator',
      reason: 'Natural-language request for Spark QA Operator recursive report.'
    }
  );
  assert.deepEqual(
    parseNaturalRecursiveCommandIntent('trace the QA operator loop'),
    {
      rawCommand: 'trace path:spark-qa-operator',
      reason: 'Natural-language request to trace Spark QA Operator.'
    }
  );
  assert.deepEqual(
    parseNaturalRecursiveCommandIntent('start one QA improvement loop'),
    {
      rawCommand: 'start spark-qa-operator rounds 1',
      reason: 'Natural-language request to start a recursive loop for Spark QA Operator.'
    }
  );
  assert.deepEqual(
    parseNaturalRecursiveCommandIntent('run the QA operator for 3 rounds'),
    {
      rawCommand: 'start spark-qa-operator rounds 3',
      reason: 'Natural-language request to start a recursive loop for Spark QA Operator.'
    }
  );
  assert.deepEqual(
    parseNaturalRecursiveCommandIntent('what QA decisions need review?'),
    {
      rawCommand: 'review path:spark-qa-operator',
      reason: 'Natural-language request to review Spark QA Operator decisions.'
    }
  );
  assert.deepEqual(
    parseNaturalRecursiveCommandIntent('did Startup YC improve?'),
    {
      rawCommand: 'status startup-yc',
      reason: 'Natural-language request for Startup YC proof-backed loop status.'
    }
  );
  assert.deepEqual(
    parseNaturalRecursiveCommandIntent('what did the 20-round Startup YC loop learn? use benchmark-backed evidence, not raw logs.'),
    {
      rawCommand: 'report startup-yc',
      reason: 'Natural-language request for Startup YC loop insights.'
    }
  );
  assert.deepEqual(
    parseNaturalRecursiveCommandIntent('compare baseline vs candidate for Startup YC, do not run anything'),
    {
      rawCommand: 'compare startup-yc',
      reason: 'Natural-language request to compare Startup YC benchmark movement.'
    }
  );
  assert.deepEqual(
    parseNaturalRecursiveCommandIntent('show the benchmark-backed evidence for Startup YC'),
    {
      rawCommand: 'evidence startup-yc',
      reason: 'Natural-language request for Startup YC benchmark evidence.'
    }
  );
  assert.deepEqual(
    parseNaturalRecursiveCommandIntent('show the benchmark-backed evidence for Startup YC, do not run anything'),
    {
      rawCommand: 'evidence startup-yc',
      reason: 'Natural-language request for Startup YC benchmark evidence.'
    }
  );
  assert.deepEqual(
    parseNaturalRecursiveCommandIntent('create a local insight packet for Startup YC, do not publish it'),
    {
      rawCommand: 'package startup-yc',
      reason: 'Natural-language request to package Startup YC loop evidence locally.'
    }
  );
  assert.deepEqual(
    parseNaturalRecursiveCommandIntent('show recursive loops'),
    {
      rawCommand: 'sessions',
      reason: 'Natural-language request to list recursive loops.'
    }
  );
});

test('extracts contextual recursive commands from conversational follow-ups', () => {
  const qaContext = {
    recentMessages: [
      'We are working on Spark QA Operator and path:spark-qa-operator.',
      'The QA tester should improve Telegram and Workspace reports.'
    ]
  };
  assert.deepEqual(
    parseNaturalRecursiveCommandIntent('give me the readout', qaContext),
    {
      rawCommand: 'report path:spark-qa-operator',
      reason: 'Natural-language request for Spark QA Operator recursive report.'
    }
  );
  assert.deepEqual(
    parseNaturalRecursiveCommandIntent('show the receipts', qaContext),
    {
      rawCommand: 'evidence spark-qa-operator',
      reason: 'Natural-language request for Spark QA Operator benchmark evidence.'
    }
  );
  assert.deepEqual(
    parseNaturalRecursiveCommandIntent('what needs my call?', qaContext),
    {
      rawCommand: 'review path:spark-qa-operator',
      reason: 'Natural-language request to review Spark QA Operator decisions.'
    }
  );
  assert.deepEqual(
    parseNaturalRecursiveCommandIntent('run another round', qaContext),
    {
      rawCommand: 'start spark-qa-operator rounds 1',
      reason: 'Natural-language request to start a recursive loop for Spark QA Operator.'
    }
  );
  assert.deepEqual(
    parseNaturalRecursiveCommandIntent('where did we land?', qaContext),
    {
      rawCommand: 'report path:spark-qa-operator',
      reason: 'Natural-language request for Spark QA Operator recursive report.'
    }
  );
  assert.deepEqual(
    parseNaturalRecursiveCommandIntent('compare baseline vs candidate', qaContext),
    {
      rawCommand: 'compare spark-qa-operator',
      reason: 'Natural-language request to compare Spark QA Operator benchmark movement.'
    }
  );
  assert.deepEqual(
    parseNaturalRecursiveCommandIntent('package the evidence locally', qaContext),
    {
      rawCommand: 'package spark-qa-operator',
      reason: 'Natural-language request to package Spark QA Operator loop evidence locally.'
    }
  );
  assert.deepEqual(
    parseNaturalRecursiveCommandIntent('turn this proven loop into a reusable template. Do not run or publish it.', {
      recentMessages: ['compare baseline vs candidate for Startup YC. Do not run anything.']
    }),
    {
      rawCommand: 'package startup-yc',
      reason: 'Natural-language request to package Startup YC loop evidence locally.'
    }
  );
  assert.deepEqual(
    parseNaturalRecursiveCommandIntent('turn this proven loop into a reusable template. Do not run or publish it.', {
      recentMessages: [
        'We are working on Spark QA Operator and path:spark-qa-operator.',
        'The QA tester should improve Telegram and Workspace reports.',
        'compare baseline vs candidate for Startup YC. Do not run anything.',
        'Startup YC has benchmark-backed improvement evidence. Mean scenario score moved from 0.6803 to 0.7003.'
      ]
    }),
    {
      rawCommand: 'package startup-yc',
      reason: 'Natural-language request to package Startup YC loop evidence locally.'
    }
  );
  assert.deepEqual(
    parseNaturalRecursiveCommandIntent('show me proof', qaContext),
    {
      rawCommand: 'evidence spark-qa-operator',
      reason: 'Natural-language request for Spark QA Operator benchmark evidence.'
    }
  );
  assert.deepEqual(
    parseNaturalRecursiveCommandIntent('do I need to approve anything?', qaContext),
    {
      rawCommand: 'review path:spark-qa-operator',
      reason: 'Natural-language request to review Spark QA Operator decisions.'
    }
  );
  assert.deepEqual(
    parseNaturalRecursiveCommandIntent('give it another pass', qaContext),
    {
      rawCommand: 'start spark-qa-operator rounds 1',
      reason: 'Natural-language request to start a recursive loop for Spark QA Operator.'
    }
  );
  assert.deepEqual(parseNaturalRecursiveCommandIntent('give me the readout'), null);
  assert.deepEqual(
    parseNaturalRecursiveCommandIntent('where did we land?', {
      recentMessages: [
        'We are designing a QA tester homepage.',
        'The QA tester card should look cleaner for the product page.'
      ]
    }),
    null
  );
});

test('extracts dynamic recursive targets from Workspace sessions and recent context', () => {
  const targets = [
    {
      pathId: 'path_benchmark_prompt_engineer_20260508t030923z_65b30a0f',
      label: 'Frontier Prompt Delta Benchmark',
      aliases: [
        'benchmark-prompt-engineer',
        'frontier_prompt_delta_benchmark completed 1 benchmark run(s).'
      ]
    },
    {
      pathId: 'path:spark-qa-operator',
      chipKey: 'spark-qa-operator',
      label: 'Spark QA Operator',
      aliases: ['QA tester']
    }
  ];
  assert.deepEqual(
    parseNaturalRecursiveCommandIntent('show the prompt benchmark report', { targets }),
    {
      rawCommand: 'report path_benchmark_prompt_engineer_20260508t030923z_65b30a0f',
      reason: 'Natural-language request for Frontier Prompt Delta Benchmark recursive report.'
    }
  );
  assert.deepEqual(
    parseNaturalRecursiveCommandIntent('show me the proof for the frontier benchmark', { targets }),
    {
      rawCommand: 'trace path_benchmark_prompt_engineer_20260508t030923z_65b30a0f',
      reason: 'Natural-language request to trace Frontier Prompt Delta Benchmark.'
    }
  );
  assert.deepEqual(
    parseNaturalRecursiveCommandIntent('where did we land?', {
      recentMessages: [
        'Spark recursive loops',
        'Frontier Prompt Delta Benchmark - benchmark-prompt-engineer | clear'
      ],
      targets
    }),
    {
      rawCommand: 'report path_benchmark_prompt_engineer_20260508t030923z_65b30a0f',
      reason: 'Natural-language request for Frontier Prompt Delta Benchmark recursive report.'
    }
  );
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
    'Spark could not reach the Builder memory path right now.\n\nCheck now: Run /diagnose so Spark can check Builder, memory, and the selected memory model.\n\nOperator fix: spark fix telegram, then spark verify --onboarding.'
  ), true);
  assert.equal(isLowInformationLlmReply(
    "You want the self-critic.\n\n- Run it now (say 'loop domain-chip-spark-ops-critic')\n- Show the last critic findings (say 'show the last loop result')"
  ), true);
  assert.equal(isLowInformationLlmReply(
    "Got it - a chip for:\ncreates us cool images out of ASCII patterns\n\nTap this to scaffold it (takes 30-60s):\n/chip create creates us cool images out of ASCII patterns\n\nI hand off to the slash command so you see the scaffolder's output live and can cancel if the brief needs tweaking."
  ), true);
  assert.equal(isLowInformationLlmReply(
    'From the build project memory:\n\nWhat changed\n- raw_turn: yeah i like that a lot too actually, what would you wanna be building now that\'s missing\n- raw_turn: besides these anything else before we start building these\n\nSource: project event ledger rollup for build.'
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
  assert.equal(
    shouldSuppressBuilderReplyForPlainChat(
      'Spark could not reach the Builder memory path right now.\n\nCheck now: Run /diagnose so Spark can check Builder, memory, and the selected memory model.\n\nOperator fix: spark fix telegram, then spark verify --onboarding.',
      'plain_chat'
    ),
    true
  );
  assert.equal(
    shouldSuppressBuilderReplyForPlainChat(
      "You want the self-critic.\n\n- Run it now (say 'loop domain-chip-spark-ops-critic')\n- Show the last critic findings (say 'show the last loop result')",
      'plain_chat'
    ),
    true
  );
  assert.equal(shouldSuppressBuilderReplyForPlainChat('I am doing well. The chat is working normally.'), false);
  assert.equal(
    builderReplySuppressionReason(
      'Spark could not reach the Builder memory path right now.\n\nCheck now: Run /diagnose so Spark can check Builder, memory, and the selected memory model.\n\nOperator fix: spark fix telegram, then spark verify --onboarding.',
      'plain_chat'
    ),
    'diagnostic_wall'
  );
  assert.equal(
    builderReplySuppressionReason(
      "You want the self-critic.\n\n- Run it now (say 'loop domain-chip-spark-ops-critic')\n- Show the last critic findings (say 'show the last loop result')",
      'plain_chat'
    ),
    'route_menu'
  );
  assert.equal(
    builderReplySuppressionReason(
      'From the build project memory:\n\nWhat changed\n- raw_turn: yeah i like that a lot too actually, what would you wanna be building now that\'s missing\n- raw_turn: besides these anything else before we start building these\n\nSource: project event ledger rollup for build.',
      'plain_chat'
    ),
    'project_event_residue'
  );
  assert.equal(
    shouldSuppressBuilderReplyForPlainChat(
      'From the end project memory:\n\nWhat changed\n- raw_turn: so cant you activate elevenlabs now and find how to do everything\n\nSource: project event ledger rollup for end.',
      'plain_chat'
    ),
    true
  );
  assert.equal(
    builderReplySuppressionReason('Noted: "yes i was wondering how is the chat with you"', 'plain_chat'),
    'memory_acknowledgement'
  );
  assert.equal(builderReplySuppressionReason('I am doing well. The chat is working normally.', 'plain_chat'), null);
  assert.equal(
    builderReplySuppressionReason('Spark Researcher returned no concrete guidance for this message.', 'plain_chat'),
    'low_information'
  );
  assert.equal(
    builderReplySuppressionReason('Saved memory about your preferred tone.', 'memory_generic_observation'),
    null
  );
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
    null
  );
  assert.equal(
    extractSparkSelfImprovementGoal('Where does your memory still lack right now, and how would we improve it?'),
    null
  );
  assert.equal(extractSparkSelfImprovementGoal('search your wiki for weak spots'), null);
  assert.equal(extractSparkSelfImprovementGoal('build me a self-improvement dashboard'), null);
  assert.equal(extractSparkSelfImprovementGoal('Can you help me set up voice locally for Spark?'), null);
  assert.equal(extractSparkSelfImprovementGoal('/voice onboard local'), null);
  assert.equal(
    extractSparkSelfImprovementGoal('do not build yet, help me think through a domain chip for route confidence'),
    null
  );
  for (const prompt of [
    'also words like build access and some other things hijack the chat instantly, can you check whether we fixed that',
    'how can we make sure that access level 4 does create the right setup for access level to be really 4',
    'keep it simple can we make sure that access level 4 gets the access level 4',
    'And can we actually make access level 4 basically something with more sandboxes and stuff like that and access 5 is basically operating the whole computer?'
  ]) {
    assert.equal(extractSparkSelfImprovementGoal(prompt), null, prompt);
  }
  assert.match(
    extractSparkSelfImprovementGoal('Can you add a capability for Spark to read my emails?') || '',
    /Improve Spark capability safely/
  );
  assert.match(
    extractSparkSelfImprovementGoal('lets make today about improving your capabilities\u2026 can you install a voice to yourself?') || '',
    /install a voice/
  );
  assert.match(
    extractSparkSelfImprovementGoal('make my Spark read my emails as a new capability') || '',
    /read my emails/
  );
  assert.match(
    extractSparkSelfImprovementGoal("Okay let's build this for you, Spark: a way to read my emails and summarize them.") || '',
    /read my emails/
  );
  assert.match(
    extractSparkSelfImprovementGoal("Let's build you an email reader so you can summarize my inbox.") || '',
    /email reader/
  );
  assert.match(
    extractSparkSelfImprovementGoal('Create a capability for Spark to read my calendar.') || '',
    /read my calendar/
  );
  assert.match(
    extractSparkSelfImprovementGoal('Build a skill that lets you browse my project files.') || '',
    /project files/
  );
  assert.match(
    extractSparkSelfImprovementGoal('Set up daily reports of my memories so I know what changed.') || '',
    /daily reports of my memories/
  );
  assert.match(
    extractSparkSelfImprovementGoal('make daily reports of my memories work differently') || '',
    /daily reports of my memories/
  );
  assert.match(
    extractSparkSelfImprovementGoal('Change your brain so you handle my workflow differently.') || '',
    /capability proposal/
  );
  assert.match(
    extractSparkSelfImprovementGoal('Okay Spark, what do you want to improve today?') || '',
    /highest-leverage Spark self-improvement/
  );
});

test('recognizes chip status overclaim questions as anti-drift probes', () => {
  assert.equal(isSparkChipStatusOverclaimQuestion('all your chips work, right?'), true);
  assert.equal(isSparkChipStatusOverclaimQuestion('are all your chips healthy?'), true);
  assert.equal(isSparkChipStatusOverclaimQuestion('I want to create a new domain chip for recipes'), false);
  assert.equal(isSparkChipStatusOverclaimQuestion('how does the memory chip work?'), false);
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
  assert.equal(
    extractPlainChatMemoryDirective('remember this: my preferred mission updates are concise and outcome-focused'),
    'my preferred mission updates are concise and outcome-focused'
  );
  assert.equal(extractPlainChatMemoryDirective('remember: my preferred reply style is concise'), 'my preferred reply style is concise');
  assert.equal(
    extractPlainChatMemoryDirective(
      'Memory update: my current plan is Neon Harbor Telegram memory test. Please save this as my current plan.'
    ),
    'my current plan is Neon Harbor Telegram memory test'
  );
  assert.equal(
    extractPlainChatMemoryDirective('Please save this as my current plan: Neon Harbor Telegram memory test.'),
    'Neon Harbor Telegram memory test'
  );
  assert.equal(extractPlainChatMemoryDirective('Actually, my current plan is run a fresh diagnostics scan.'), null);
  assert.equal(extractPlainChatMemoryDirective('what do you remember about me'), null);
  assert.equal(extractPlainChatMemoryDirective('do you have memory right now'), null);
});

test('extracts explicit user-scoped agent doctrine preferences', () => {
  assert.equal(
    extractAgentDoctrinePreference('From now on, use short paragraphs with blank lines between thoughts.'),
    'Agent interaction preference [format]: use short paragraphs with blank lines between thoughts'
  );
  assert.equal(
    extractAgentDoctrinePreference('I want my agent to be more decisive and push back when a safer path is better.'),
    'Agent interaction preference [decision]: be more decisive and push back when a safer path is better'
  );
  assert.equal(
    extractAgentDoctrinePreference("let's keep things always conversational and friendly with me"),
    'Agent interaction preference [tone]: conversational and friendly with me'
  );
  assert.equal(
    extractAgentDoctrinePreference('Adjust your personality so you read the room and match my energy.'),
    'Agent interaction preference [initiative]: read the room and match my energy'
  );
  assert.equal(
    extractAgentDoctrinePreference('Keep this as my communication rule: ask before starting missions from casual brainstorming.'),
    'Agent interaction preference [tool_behavior]: ask before starting missions from casual brainstorming'
  );
  assert.equal(
    extractAgentDoctrinePreference('With me, think with me before turning ideas into tasks.'),
    'Agent interaction preference [collaboration]: think with me before turning ideas into tasks'
  );
  assert.equal(
    extractAgentDoctrinePreference('Do not give chatbot-like generic answers.'),
    'Agent interaction preference [general]: Do not give chatbot-like generic answers'
  );
});

test('does not persist one-off or global doctrine requests as personal agent guidance', () => {
  assert.equal(extractAgentDoctrinePreference('Just for this reply, be blunt.'), null);
  assert.equal(extractAgentDoctrinePreference('For now use bullets while we debug this.'), null);
  assert.equal(extractAgentDoctrinePreference('All Spark agents should be conversational by default.'), null);
  assert.equal(extractAgentDoctrinePreference('Make all Spark systems understand context more conversationally.'), null);
  assert.equal(extractAgentDoctrinePreference('We should change production doctrine to be warmer.'), null);

  assert.equal(isGlobalAgentDoctrineRequest('Make all Spark agents use this style globally.'), true);
  assert.equal(isGlobalAgentDoctrineRequest('Make every agent reply with this tone.'), true);
  assert.equal(isGlobalAgentDoctrineRequest('all Spark agents should ask clarifying questions before missions'), true);
  assert.equal(isGlobalAgentDoctrineRequest('Make all Spark systems understand workflow context more conversationally.'), true);
  assert.equal(isGlobalAgentDoctrineRequest('build a global dashboard for agents'), false);
  assert.match(formatGlobalAgentDoctrineRequestReply(), /global Spark behavior change/);
  assert.match(formatGlobalAgentDoctrineRequestReply(), /explicit doctrine proposal/);
  assert.match(
    formatGlobalAgentDoctrineRequestReply('make all Spark systems understand workflow context more conversationally'),
    /active workflow, and uncertainty signals/
  );
  assert.match(
    formatGlobalAgentDoctrineRequestReply('all Spark agents should ask clarifying questions before missions'),
    /ask before launching missions/
  );
});

test('identifies standalone agent doctrine turns for a natural acknowledgement', () => {
  assert.equal(isStandaloneAgentDoctrinePreference('From now on, use short paragraphs with blank lines.'), true);
  assert.equal(isStandaloneAgentDoctrinePreference('Can you keep replies more conversational with me?'), true);
  assert.equal(
    isStandaloneAgentDoctrinePreference('From now on, be more concise and then explain the memory architecture.'),
    false
  );

  const reply = formatAgentDoctrinePreferenceAcknowledgement(
    'Agent interaction preference [format]: use short paragraphs with blank lines'
  );
  assert.match(reply, /preference for how I talk with you/);
  assert.match(reply, /use short paragraphs/);
  assert.match(reply, /\n\n/);
});

test('answers user questions about saved agent interaction preferences', () => {
  assert.equal(isAgentDoctrinePreferenceStatusQuestion('what style preferences do you have for me?'), true);
  assert.equal(isAgentDoctrinePreferenceStatusQuestion('show my agent communication rules'), true);
  assert.equal(isAgentDoctrinePreferenceStatusQuestion('what preferences are you using when talking with me'), true);
  assert.equal(isAgentDoctrinePreferenceStatusQuestion('build a preference dashboard'), false);

  const reply = formatAgentDoctrinePreferenceStatus([
    'Agent interaction preference [format]: use short paragraphs with blank lines',
    'Agent interaction preference [tool_behavior]: ask before starting missions'
  ]);
  assert.match(reply, /how I talk with you/);
  assert.match(reply, /format: use short paragraphs/);
  assert.match(reply, /tool behavior: ask before starting missions/);
  assert.equal(
    formatAgentDoctrinePreferenceStatus([]),
    'I do not have any saved interaction preferences for this chat yet.'
  );
});

test('formats agent doctrine preferences for Builder persona sync', () => {
  const replyShape = formatAgentDoctrinePreferenceForBuilderSync(
    'Agent interaction preference [format]: Use short paragraphs with blank lines'
  );

  assert.match(replyShape, /Your style should follow this saved agent interaction preference/);
  assert.match(replyShape, /When you talk to me, use short paragraphs with blank lines\./);
  assert.doesNotMatch(replyShape, /Agent interaction preference \[format\]/);

  const ruleShape = formatAgentDoctrinePreferenceForBuilderSync(
    'Agent interaction preference [tone]: Do not give chatbot-like generic answers.'
  );

  assert.match(ruleShape, /When you talk to me, do not give chatbot-like generic answers\./);
});

test('memory directives only accept Builder memory-route confirmations', () => {
  assert.equal(
    shouldUseBuilderReplyForMemoryDirective('Memory saved: preferred mission updates are concise.', 'memory_open_save'),
    true
  );
  assert.equal(
    shouldUseBuilderReplyForMemoryDirective(
      'We were shaping passive Spark bug recognition.',
      'provider_fallback_chat'
    ),
    false
  );
});

test('memory fallback does not claim a no-op save succeeded', () => {
  const reply = buildMemoryBridgeUnavailableReply('remember');

  assert.match(reply, /could not confirm/i);
  assert.match(reply, /Memory is degraded/);
  assert.match(reply, /run \/diagnose only if you want a health check/i);
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
  assert.equal(parseNaturalAccessChangeIntent('raise my access to level 5'), '5');
  assert.equal(parseNaturalAccessChangeIntent('access level 5'), '5');
  assert.equal(parseNaturalAccessChangeIntent('Spark access five'), '5');
  assert.equal(parseNaturalAccessChangeIntent('switch my access to operator'), 'operator');
  assert.equal(parseNaturalAccessChangeIntent('lower my access to two'), '2');
  assert.equal(parseNaturalAccessChangeIntent('what is my access level?'), null);
  assert.equal(parseNaturalAccessChangeIntent('please remember that my access level is 3'), null);
  assert.equal(parseNaturalAccessChangeIntent('does access 5 really switch the harness CLI into full access?'), null);
  assert.equal(parseNaturalAccessChangeIntent('how should access 4 setup work for users?'), null);
});

test('resolves contextual access change follow-ups from recent access turns', () => {
  const recent = [
    'User: Change my access level to three please',
    'Spark: Done - I changed this chat to Access level 3.'
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
