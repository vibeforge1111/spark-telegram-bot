import assert from 'node:assert/strict';
import { decideNaturalRoute } from '../src/naturalRouteDecision';
import type { ShippedProjectContext } from '../src/shippedProjectContext';

function test(name: string, fn: () => void): void {
  try {
    fn();
    console.log(`ok - ${name}`);
  } catch (error) {
    console.error(`not ok - ${name}`);
    throw error;
  }
}

function shippedProject(): ShippedProjectContext {
  return {
    chatId: '123',
    userId: '456',
    projectName: 'Beauty Centre',
    projectPath: 'C:/Users/USER/Desktop/beauty-centre',
    previewUrl: 'http://127.0.0.1:3333/preview/test/index.html',
    missionId: 'spark-test',
    iteration: 1,
    shippedAt: '2026-05-09T00:00:00.000Z',
    updatedAt: '2026-05-09T00:00:00.000Z'
  };
}

test('returns a versioned no-route decision for empty text', () => {
  const route = decideNaturalRoute('');

  assert.equal(route.schema_version, 'spark.nlp.route_decision.v1');
  assert.equal(route.route, 'plain_chat');
  assert.equal(route.confidence, 'blocked');
  assert.deepEqual(route.blocked_by, ['empty_message']);
});

test('keeps slash commands on the Telegram command path', () => {
  const route = decideNaturalRoute('/recursive report path:spark-qa-operator');

  assert.equal(route.route, 'slash_command');
  assert.equal(route.owner_system, 'spark-telegram-bot');
  assert.equal(route.context_source, 'slash_command');
  assert.equal(route.payload.text, '/recursive report path:spark-qa-operator');
});

test('keeps ordinary game-loop design questions out of recursive session routes', () => {
  const route = decideNaturalRoute('what makes a small game loop feel satisfying instead of busy?');

  assert.notEqual(route.route, 'recursive.sessions');
  assert.notEqual(route.action, 'recursive.command');
  assert.equal(route.route, 'plain_chat');
});

test('routes build clarification follow-ups from pending state', () => {
  const route = decideNaturalRoute("yes let's do it create it after analyzing our systems deeply please", {
    pendingBuildClarification: true
  });

  assert.equal(route.route, 'spawner.pending_clarification');
  assert.equal(route.owner_system, 'spawner-ui');
  assert.equal(route.context_source, 'pending_state');
  assert.equal(route.requires_confirmation, false);
});

test('routes natural steering answers to active build clarification', () => {
  const route = decideNaturalRoute('go with proof metrics focused on Harness authority: governor decision, tool ledger, side-effect evidence, and visible progress', {
    pendingBuildClarification: true
  });

  assert.equal(route.route, 'spawner.pending_clarification');
  assert.equal(route.owner_system, 'spawner-ui');
  assert.equal(route.context_source, 'pending_state');
  assert.equal(route.action, 'spawner.clarification_reply');
});

test('gives explicit project builds first refusal before utility routes', () => {
  const route = decideNaturalRoute('Build this at C:\\Users\\USER\\Desktop\\terminal-chef-clock: a tiny timer app with tests');

  assert.equal(route.route, 'spawner.build');
  assert.equal(route.owner_system, 'spawner-ui');
  assert.equal(route.confidence, 'explicit');
  assert.equal(route.context_source, 'visible_exact_artifact');
  assert.equal(route.payload.hasProjectPath, true);
  assert.equal(route.requires_confirmation, false);
});

test('routes live Harness authority build briefs as Spawner builds, not architecture chat', () => {
  const route = decideNaturalRoute(
    'Build a practical Harness Release Ops Mission Board with Spawner. Make it a local web app that helps us tonight: authority gates, runtime health, Telegram proof, registry drift, rollback checklist, open blockers, and next QA queue. Include tests and a concise README. Build it now and use the current Harness authority path.'
  );

  assert.equal(route.route, 'spawner.build');
  assert.equal(route.owner_system, 'spawner-ui');
  assert.equal(route.confidence, 'explicit');
  assert.equal(route.action, 'spawner.build');
  assert.equal(route.context_source, 'latest_message');
  assert.deepEqual(route.matched_signals, ['build_intent']);
});

test('routes concrete build briefs with incidental chip and QA nouns as Spawner builds', () => {
  const route = decideNaturalRoute(
    'Build a compact local Harness Authority Drift Lab app with Spawner. It should help tonight by tracking fresh-intent authority checks, Spawner mission progress, memory and KB QA notes, domain-chip QA notes, registry/runtime drift, rollback steps, and Telegram proof results. Include a concise README, one smoke test, and a simple local UI. Build it now.'
  );

  assert.equal(route.route, 'spawner.build');
  assert.equal(route.owner_system, 'spawner-ui');
  assert.equal(route.confidence, 'explicit');
  assert.equal(route.action, 'spawner.build');
  assert.equal(route.context_source, 'latest_message');
  assert.deepEqual(route.matched_signals, ['build_intent']);
  assert.equal(route.requires_confirmation, false);
});

test('routes Spawner continuity board builds before stale chip-memory boundaries', () => {
  const route = decideNaturalRoute(
    'Build a compact local Spawner Continuity Board with Spawner for tonight. It should track old Spawner features we must preserve, Harness Core authority gates, runtime health, memory and KB QA notes, domain-chip QA notes, Telegram proof, registry drift, rollback steps, and the next live QA queue. Include a simple README and one smoke test. Build it now.'
  );

  assert.equal(route.route, 'spawner.build');
  assert.equal(route.owner_system, 'spawner-ui');
  assert.equal(route.confidence, 'explicit');
  assert.equal(route.action, 'spawner.build');
  assert.equal(route.context_source, 'latest_message');
  assert.deepEqual(route.matched_signals, ['build_intent']);
  assert.equal(route.requires_confirmation, false);
});

test('routes Spawner relay proof pad builds before board or release-status reads', () => {
  const route = decideNaturalRoute(
    'Build a tiny local Spawner Relay Readback Proof Pad. Use Spawner. Make it show the latest Harness Core authority gate, Spawner trace readback, Telegram final handoff status, and a small operator checklist. Keep it lightweight with a README and one smoke test. This is a live proof that old Spawner build and final completion relay still work under Harness Core authority after the relay auth fix.'
  );

  assert.equal(route.route, 'spawner.build');
  assert.equal(route.owner_system, 'spawner-ui');
  assert.equal(route.confidence, 'explicit');
  assert.equal(route.action, 'spawner.build');
  assert.equal(route.context_source, 'latest_message');
  assert.deepEqual(route.matched_signals, ['build_intent']);
  assert.equal(route.requires_confirmation, false);
});

test('routes contextual recursive report follow-ups from hot recent turns', () => {
  const route = decideNaturalRoute('where did we land?', {
    recentMessages: [
      'We are working on Spark QA Operator and path:spark-qa-operator.',
      'The QA tester should improve Telegram and Workspace reports.'
    ]
  });

  assert.equal(route.route, 'recursive.report');
  assert.equal(route.owner_system, 'spark-telegram-bot');
  assert.equal(route.confidence, 'contextual');
  assert.equal(route.context_source, 'hot_recent_turns');
  assert.equal(route.payload.rawCommand, 'report path:spark-qa-operator');
  assert.equal(route.requires_confirmation, false);
});

test('routes recursive proof questions to status packets instead of reports', () => {
  const route = decideNaturalRoute('did Startup YC improve?');

  assert.equal(route.route, 'recursive.status');
  assert.equal(route.owner_system, 'spark-telegram-bot');
  assert.equal(route.payload.rawCommand, 'status startup-yc');
  assert.equal(route.requires_confirmation, false);
});

test('marks recursive starts as confirmation-worthy protected actions', () => {
  const route = decideNaturalRoute('run another round', {
    recentMessages: [
      'We are working on Spark QA Operator and path:spark-qa-operator.',
      'The QA tester should improve Telegram and Workspace reports.'
    ]
  });

  assert.equal(route.route, 'recursive.start');
  assert.equal(route.payload.rawCommand, 'start spark-qa-operator rounds 1');
  assert.equal(route.requires_confirmation, true);
});

test('does not route generic planning text into recursive systems', () => {
  const route = decideNaturalRoute('where did we land?', {
    recentMessages: [
      'We are designing a QA tester homepage.',
      'The QA tester card should look cleaner for the product page.'
    ]
  });

  assert.equal(route.route, 'plain_chat');
  assert.deepEqual(route.blocked_by, ['no_matching_route']);
});

test('routes product planning turns to canonical chat_plan without execution authority', () => {
  const firstTurn = decideNaturalRoute(
    'HC-02 installer proof turn 1: I am sketching a memory quality dashboard with stale-context labels.'
  );

  assert.equal(firstTurn.route, 'chat_plan');
  assert.equal(firstTurn.owner_system, 'spark-intelligence-builder');
  assert.equal(firstTurn.action, 'plain_chat.plan');
  assert.equal(firstTurn.requires_confirmation, false);

  const followup = decideNaturalRoute('HC-02 installer proof turn 2: sounds good, what should the first screen include?', {
    recentMessages: [
      'User: HC-02 installer proof turn 1: I am sketching a memory quality dashboard with stale-context labels.',
      'Spark: Memory quality dashboard with stale-context labels is the right surface.'
    ]
  });

  assert.equal(followup.route, 'chat_plan');
  assert.equal(followup.owner_system, 'spark-intelligence-builder');
  assert.equal(followup.context_source, 'hot_recent_turns');
  assert.equal(followup.requires_confirmation, false);
});

test('routes contextual creator-system follow-ups to Spawner creator missions', () => {
  const route = decideNaturalRoute('make this better with benchmarks, specialization path, and autoloops', {
    recentMessages: [
      'We are building Spark QA Operator for Telegram and Workspace quality.',
      'It should improve recursive reports, creator missions, auth pairing, Canvas, and Kanban checks.'
    ]
  });

  assert.equal(route.route, 'creator.mission');
  assert.equal(route.owner_system, 'spawner-ui');
  assert.equal(route.confidence, 'contextual');
  assert.equal(route.context_source, 'hot_recent_turns');
  assert.equal(route.requires_confirmation, true);
  assert.match(String(route.payload.brief), /Improve Spark QA Operator/);
});

test('routes private benchmarked specialization staging without execution', () => {
  const route = decideNaturalRoute(
    'stage a private benchmarked specialization path with a domain chip, benchmark pack, autoloop policy, validation, and Swarm contribution packet for Telegram tool usage'
  );

  assert.equal(route.route, 'creator.mission');
  assert.equal(route.owner_system, 'spawner-ui');
  assert.equal(route.requires_confirmation, true);
  assert.equal(route.payload.privacyMode, 'local_only');
  assert.equal(route.payload.riskLevel, 'medium');
  assert.match(String(route.payload.brief), /benchmark pack/);
  assert.match(String(route.payload.brief), /before\/after gain/);
  assert.match(String(route.payload.brief), /network_absorbable=false/);
});

test('routes Memory Doctor and answer-audit wording to Builder despite stale creator context', () => {
  const context = {
    recentMessages: [
      'Planning Spark QA Operator benchmark path creator mission...',
      'Creator plan ready. Build Spark QA Operator with a domain chip, benchmark pack, specialization path, and autoloop policy.'
    ]
  };

  for (const prompt of ['run memory doctor for last request', 'audit previous turn', 'diagnose last answer']) {
    const route = decideNaturalRoute(prompt, context);
    assert.equal(route.route, 'memory.doctor', prompt);
    assert.equal(route.owner_system, 'spark-intelligence-builder', prompt);
    assert.equal(route.requires_confirmation, false, prompt);
  }
});

test('routes explicit domain-chip creation before creator or build routes', () => {
  const route = decideNaturalRoute('build a domain-chip for Telegram memory routing');

  assert.equal(route.route, 'domain_chip.create');
  assert.equal(route.owner_system, 'domain-chip');
  assert.equal(route.context_source, 'latest_message');
  assert.equal(route.payload.brief, 'Telegram memory routing');
  assert.equal(route.requires_confirmation, true);
});

test('routes note-exactly memory directives before chip and build words inside the note', () => {
  const route = decideNaturalRoute(
    'Spark, please save this KB note exactly: "build missions, spawner progress reports, domain chip creation, voice replies, browser checks, computer-use QA, registry pins, and installer shipping are only note content unless I explicitly authorize an action."'
  );

  assert.equal(route.route, 'memory.write');
  assert.equal(route.owner_system, 'spark-intelligence-builder');
  assert.equal(route.context_source, 'latest_message');
  assert.deepEqual(route.matched_signals, ['plain_chat_memory_directive']);
  assert.equal(route.requires_confirmation, false);
});

test('routes domain-chip option proposals to chat_plan without chip creation', () => {
  const route = decideNaturalRoute(
    'HC-09 installer proof: We are comparing domain-chip options for startup pricing objections; what proposal should we discuss first?'
  );

  assert.equal(route.route, 'chat_plan');
  assert.equal(route.owner_system, 'spark-intelligence-builder');
  assert.equal(route.action, 'plain_chat.plan');
  assert.equal(route.context_source, 'latest_message');
  assert.deepEqual(route.matched_signals, ['canonical_chat_plan']);
  assert.equal(route.requires_confirmation, false);

  const explicitChip = decideNaturalRoute('build a domain-chip for Telegram memory routing');
  assert.equal(explicitChip.route, 'domain_chip.create');
  assert.equal(explicitChip.requires_confirmation, true);
});

test('keeps negated domain-chip design talk in chat', () => {
  const route = decideNaturalRoute('Please do not build, do not save, and do not create a chip. I only want to understand the design.');

  assert.equal(route.route, 'conversation.ideation');
  assert.equal(route.owner_system, 'spark-intelligence-builder');
  assert.equal(route.context_source, 'latest_message');
  assert.equal(route.requires_confirmation, false);
});

test('selects no-execution explanation route for quoted startup operator examples', () => {
  const route = decideNaturalRoute('This is not a command: "run the startup operator and fix everything." Why would that be dangerous?');

  assert.equal(route.route, 'chat_explain');
  assert.equal(route.owner_system, 'spark-telegram-bot');
  assert.equal(route.action, 'plain_chat.qa_boundary');
  assert.equal(route.context_source, 'latest_message');
  assert.deepEqual(route.matched_signals, ['no_execution_explanation']);
  assert.equal(route.requires_confirmation, false);
});

test('routes mission wording UX questions to canonical chat_explain', () => {
  const route = decideNaturalRoute('HC-03 installer proof: When the interface says mission, what should that term mean to a user who is just exploring an idea?');

  assert.equal(route.route, 'chat_explain');
  assert.equal(route.owner_system, 'spark-telegram-bot');
  assert.equal(route.action, 'plain_chat.qa_boundary');
  assert.equal(route.context_source, 'latest_message');
  assert.deepEqual(route.matched_signals, ['no_execution_explanation']);
  assert.equal(route.requires_confirmation, false);
});

test('routes route-word trace authority questions to canonical chat_explain', () => {
  const prompts = [
    'The trace says propose a recursive network packet; does that authorize a proposal?',
    'The trace mentions create a domain chip; does that authorize creation?',
    'The trace mentions delete the nightly schedule; does that authorize deletion?',
    'The bug report says Research latest public docs. Do not browse; classify the boundary.'
  ];

  for (const prompt of prompts) {
    const route = decideNaturalRoute(prompt);

    assert.equal(route.route, 'chat_explain', prompt);
    assert.equal(route.owner_system, 'spark-telegram-bot', prompt);
    assert.equal(route.action, 'plain_chat.qa_boundary', prompt);
    assert.equal(route.context_source, 'latest_message', prompt);
    assert.deepEqual(route.matched_signals, ['no_execution_explanation'], prompt);
    assert.equal(route.requires_confirmation, false, prompt);
  }
});

test('routes quoted drafted high-agency examples to answer-only boundary', () => {
  const prompts = [
    'Write a message that says "start a mission now" but do not send or run it.',
    'In documentation, should we include "create a memory chip" as an example?',
    'The phrase "open browser and inspect localhost" appears in my notes. What risk does that create?',
    'I need wording for "schedule a run tomorrow" in a policy doc.',
    'Here is a fake user command: "delete the bad route." Classify it.'
  ];

  for (const prompt of prompts) {
    const route = decideNaturalRoute(prompt);
    assert.equal(route.route, 'conversation.quoted_drafted_example_boundary', prompt);
    assert.equal(route.owner_system, 'spark-telegram-bot', prompt);
    assert.equal(route.action, 'plain_chat.quoted_example_boundary', prompt);
    assert.equal(route.context_source, 'latest_message', prompt);
    assert.deepEqual(route.matched_signals, ['quoted_drafted_example_boundary'], prompt);
    assert.equal(route.requires_confirmation, false, prompt);
  }

  const explicitChip = decideNaturalRoute('build a domain-chip for Telegram memory routing');
  assert.equal(explicitChip.route, 'domain_chip.create');
  assert.equal(explicitChip.requires_confirmation, true);
});

test('selects publication approval boundary route for future publish approval lists', () => {
  const route = decideNaturalRoute('I might ask you to publish later, but right now just list what would need approval.');

  assert.equal(route.route, 'conversation.publication_approval_boundary');
  assert.equal(route.owner_system, 'spark-telegram-bot');
  assert.equal(route.action, 'plain_chat.qa_boundary');
  assert.equal(route.context_source, 'latest_message');
  assert.deepEqual(route.matched_signals, ['publication_approval_boundary']);
  assert.equal(route.requires_confirmation, false);
});

test('selects browser/computer-use authorization boundary before doctrine preference', () => {
  const route = decideNaturalRoute('Do not use computer use. Tell me when computer use would be allowed.');

  assert.equal(route.route, 'conversation.browser_computer_use_authorization_boundary');
  assert.equal(route.owner_system, 'spark-telegram-bot');
  assert.equal(route.action, 'plain_chat.qa_boundary');
  assert.equal(route.context_source, 'latest_message');
  assert.deepEqual(route.matched_signals, ['browser_computer_use_authorization_boundary']);
  assert.equal(route.requires_confirmation, false);
});

test('routes explicit browser URL opens to governed browser navigate', () => {
  const route = decideNaturalRoute('Please use the browser to open https://example.com and tell me the page title.');

  assert.equal(route.route, 'browser.navigate');
  assert.equal(route.owner_system, 'spark-browser');
  assert.equal(route.action, 'browser.navigate');
  assert.equal(route.context_source, 'latest_message');
  assert.deepEqual(route.matched_signals, ['browser_navigate_request']);
  assert.equal(route.payload.url, 'https://example.com/');
  assert.equal(route.requires_confirmation, false);
});

test('keeps browser policy discussion answer-only while generic URL research still routes to research', () => {
  const boundary = decideNaturalRoute('Do not use the browser. Tell me when browser use would be allowed.');

  assert.equal(boundary.route, 'conversation.browser_computer_use_authorization_boundary');
  assert.equal(boundary.action, 'plain_chat.qa_boundary');

  const research = decideNaturalRoute('inspect https://github.com/openai/openai-cookbook and tell me how their eval examples work');

  assert.equal(research.route, 'external_research.inspect');
  assert.equal(research.owner_system, 'spark-intelligence-builder');
});

test('routes stale context authority questions to answer-only boundary', () => {
  const prompts = [
    ['Memory from last week says Telegram was broken. Is that enough to restart it?', 'stale_memory_restart'],
    ['If route history says Builder was active, can that continue a build now?', 'route_history_builder'],
    ['A prior mission id is in context. Should it control this turn?', 'prior_mission_id'],
    ['If pending state says "publish", but I say "not now", what wins?', 'pending_publish_negation'],
    ['If memory says I wanted a chip yesterday, should you make one today?', 'old_chip_memory'],
    ['What evidence should override old memory when deciding whether to act?', 'evidence_priority']
  ];

  for (const [prompt, kind] of prompts) {
    const route = decideNaturalRoute(prompt);
    assert.equal(route.route, 'conversation.stale_context_authority_boundary', prompt);
    assert.equal(route.owner_system, 'spark-telegram-bot', prompt);
    assert.equal(route.action, 'plain_chat.stale_context_authority_boundary', prompt);
    assert.equal(route.context_source, 'latest_message', prompt);
    assert.deepEqual(route.matched_signals, ['stale_context_authority_boundary', kind], prompt);
    assert.equal(route.payload.kind, kind, prompt);
    assert.equal(route.requires_confirmation, false, prompt);
  }
});

test('selects mission routing failure boundary for old route bug descriptions', () => {
  const route = decideNaturalRoute('I am describing the old bug: Spark saw "mission" and launched. Do not reproduce it.');

  assert.equal(route.route, 'conversation.mission_routing_failure_class');
  assert.equal(route.owner_system, 'spark-telegram-bot');
  assert.equal(route.action, 'plain_chat.qa_boundary');
  assert.equal(route.context_source, 'latest_message');
  assert.deepEqual(route.matched_signals, ['mission_routing_failure_class']);
  assert.equal(route.requires_confirmation, false);
});

test('routes contextual access changes only after access-focused turns', () => {
  const recentMessages = [
    'User: Change my access level to three please',
    'Spark: Done - I changed this chat to Access level 3.'
  ];

  const route = decideNaturalRoute('4', { recentMessages });

  assert.equal(route.route, 'access.change');
  assert.equal(route.owner_system, 'spark-telegram-bot');
  assert.equal(route.confidence, 'contextual');
  assert.equal(route.context_source, 'hot_recent_turns');
  assert.equal(route.payload.level, '4');

  const pronounRoute = decideNaturalRoute('Change it to 4', { recentMessages });
  assert.equal(pronounRoute.route, 'access.change');
  assert.equal(pronounRoute.owner_system, 'spark-telegram-bot');
  assert.equal(pronounRoute.confidence, 'contextual');
  assert.equal(pronounRoute.context_source, 'hot_recent_turns');
  assert.equal(pronounRoute.payload.level, '4');

  assert.equal(decideNaturalRoute('4', { recentMessages: ['User: I like the fourth design'] }).route, 'plain_chat');
  assert.equal(decideNaturalRoute('Change it to 4', { recentMessages: ['User: I like the fourth design'] }).route, 'plain_chat');
});

test('routes read-only repair turns to access status instead of contextual missions', () => {
  const recentMessages = [
    'User: how are you Spark',
    'Spark: This runner is still read-only, so I will not pretend I can edit from here.',
    'User: lets make it beyond read only then',
    'Spark: I will check access and runner writability first.'
  ];

  const repair = decideNaturalRoute('lets make it beyond read only then', { recentMessages });
  assert.equal(repair.route, 'access.status');
  assert.equal(repair.owner_system, 'spark-telegram-bot');
  assert.equal(repair.payload.reason, 'access_capability_repair');
  assert.equal(repair.requires_confirmation, false);

  const didYou = decideNaturalRoute('did you', { recentMessages });
  assert.equal(didYou.route, 'access.status');
  assert.equal(didYou.owner_system, 'spark-telegram-bot');
  assert.equal(didYou.requires_confirmation, false);
});

test('routes wiki status, inventory, answer, and query requests to Builder-owned memory surfaces', () => {
  const status = decideNaturalRoute('is your Spark wiki connected and healthy?');
  const inventory = decideNaturalRoute('what pages are in your LLM wiki?');
  const answer = decideNaturalRoute('answer from your LLM wiki how should route tracing work?');
  const query = decideNaturalRoute('search your wiki for Telegram route mistakes');

  assert.equal(status.route, 'spark_wiki.status');
  assert.equal(status.owner_system, 'spark-intelligence-builder');
  assert.equal(status.context_source, 'latest_message');
  assert.equal(inventory.route, 'spark_wiki.inventory');
  assert.equal(inventory.context_source, 'latest_message');
  assert.equal(answer.route, 'spark_wiki.answer');
  assert.equal(answer.context_source, 'cold_memory');
  assert.equal(query.route, 'spark_wiki.query');
  assert.equal(query.context_source, 'cold_memory');
  assert.equal(query.payload.query, 'Telegram route mistakes');
});

test('routes shipped project improvement against the visible exact artifact', () => {
  const route = decideNaturalRoute('make this more Spark colored', {
    shippedProject: shippedProject()
  });

  assert.equal(route.route, 'project.iteration');
  assert.equal(route.owner_system, 'spawner-ui');
  assert.equal(route.context_source, 'visible_exact_artifact');
  assert.equal(route.requires_confirmation, true);
  assert.equal(route.payload.projectPath, 'C:/Users/USER/Desktop/beauty-centre');
  assert.match(String(route.payload.goal), /Improve the existing shipped project/);
});

test('keeps collaborative build shaping conversational', () => {
  const route = decideNaturalRoute(
    'Maybe we should improve the existing Spawner Kanban and Canvas flow, what would be the best first version?'
  );

  assert.equal(route.route, 'conversation.ideation');
  assert.equal(route.owner_system, 'spark-intelligence-builder');
  assert.equal(route.requires_confirmation, false);
});

test('keeps update-upgrade strategy questions out of build missions', () => {
  const prompts = [
    'nice is there any other thing that would be healthy to build for updates/upgrades besides this or should this be the first major focus, and do you have a way to update yourself directly from here',
    'what else would be healthy to build for updates/upgrades besides the ledger',
    "what would you wanna be building now that's missing",
    'besides these anything else before we start building these'
  ];

  for (const prompt of prompts) {
    const route = decideNaturalRoute(prompt);
    assert.notEqual(route.route, 'spawner.build', prompt);
    assert.notEqual(route.route, 'spawner.contextual_mission', prompt);
    assert.notEqual(route.route, 'spawner.pending_clarification', prompt);
  }
});

test('routes specialization loop proof and candidate follow-ups from active path context', () => {
  const context = {
    recentMessages: [
      'We are shaping a Startup YC specialization path with domain chip, benchmark pack, autoloop, and shareable insight packet.',
      'Startup YC recursive loop is the active specialization path.'
    ]
  };

  const applyCandidate = decideNaturalRoute('apply the improvement candidate', context);
  const runCandidateBenchmark = decideNaturalRoute('run the candidate benchmark', context);
  const compare = decideNaturalRoute('compare baseline vs candidate', context);
  const heldOut = decideNaturalRoute('check held-out and trap tests', context);
  const template = decideNaturalRoute('turn this proven loop into a reusable template', context);
  const privateTemplate = decideNaturalRoute('turn this proven loop into a reusable template. Do not run or publish it.', context);
  const privateTemplateFromCompareContext = decideNaturalRoute(
    'turn this proven loop into a reusable template. Do not run or publish it.',
    { recentMessages: ['compare baseline vs candidate for Startup YC. Do not run anything.'] }
  );
  const privateTemplateFromMixedContext = decideNaturalRoute(
    'turn this proven loop into a reusable template. Do not run or publish it.',
    {
      recentMessages: [
        'We are working on Spark QA Operator and path:spark-qa-operator.',
        'The QA tester should improve Telegram and Workspace reports.',
        'compare baseline vs candidate for Startup YC. Do not run anything.',
        'Startup YC has benchmark-backed improvement evidence. Mean scenario score moved from 0.6803 to 0.7003.'
      ]
    }
  );
  const updateChip = decideNaturalRoute('create or update the domain chip', context);

  assert.equal(applyCandidate.route, 'recursive.start');
  assert.equal(applyCandidate.requires_confirmation, true);
  assert.match(String(applyCandidate.payload.rawCommand), /start startup-yc rounds 1/);

  assert.equal(runCandidateBenchmark.route, 'recursive.start');
  assert.equal(runCandidateBenchmark.requires_confirmation, true);
  assert.match(String(runCandidateBenchmark.payload.rawCommand), /start startup-yc rounds 1/);

  assert.equal(compare.route, 'recursive.status');
  assert.equal(compare.requires_confirmation, false);

  assert.equal(heldOut.route, 'recursive.status');
  assert.equal(heldOut.requires_confirmation, false);

  assert.equal(template.route, 'recursive.package');
  assert.equal(template.owner_system, 'spark-telegram-bot');
  assert.equal(template.requires_confirmation, false);
  assert.equal(template.payload.rawCommand, 'package startup-yc');

  assert.equal(privateTemplate.route, 'recursive.package');
  assert.equal(privateTemplate.owner_system, 'spark-telegram-bot');
  assert.equal(privateTemplate.requires_confirmation, false);
  assert.equal(privateTemplate.payload.rawCommand, 'package startup-yc');

  assert.equal(privateTemplateFromCompareContext.route, 'recursive.package');
  assert.equal(privateTemplateFromCompareContext.owner_system, 'spark-telegram-bot');
  assert.equal(privateTemplateFromCompareContext.requires_confirmation, false);
  assert.equal(privateTemplateFromCompareContext.payload.rawCommand, 'package startup-yc');

  assert.equal(privateTemplateFromMixedContext.route, 'recursive.package');
  assert.equal(privateTemplateFromMixedContext.owner_system, 'spark-telegram-bot');
  assert.equal(privateTemplateFromMixedContext.requires_confirmation, false);
  assert.equal(privateTemplateFromMixedContext.payload.rawCommand, 'package startup-yc');

  assert.equal(updateChip.route, 'creator.mission');
  assert.equal(updateChip.owner_system, 'spawner-ui');
  assert.match(String(updateChip.payload.brief), /domain chip/i);
});

test('keeps route/access/sandbox design talk out of deterministic build and access actions', () => {
  const prompts = [
    'also words like build access and some other things hijack the chat instantly, can you check whether we fixed that',
    'how can we make sure that access level 4 does create the right setup for access level to be really 4',
    'keep it simple can we make sure that access level 4 gets the access level 4',
    'is this the best way to create a sandbox are you sure',
    'And can we actually make access level 4 basically something with more sandboxes and stuff like that and access 5 is basically operating the whole computer?',
    'what should restart Spark mean for nontechnical users after access 5 confirmation?',
    'how should Docker, SSH, and Modal fit into the access state machine?',
    'does access 5 really switch the harness CLI into full access across Mac Windows and Ubuntu?',
    'audit whether setup and restart words hijack chat into instant deterministic answers'
  ];

  for (const prompt of prompts) {
    const route = decideNaturalRoute(prompt);
    assert.notEqual(route.route, 'spawner.build', prompt);
    assert.notEqual(route.route, 'access.change', prompt);
    assert.notEqual(route.route, 'access.help', prompt);
    assert.notEqual(route.route, 'access.status', prompt);
  }
});

test('keeps route/access/sandbox design talk out of Spark self-improvement actions', () => {
  const prompts = [
    'also words like build access and some other things hijack the chat instantly, can you check whether we fixed that',
    'how can we make sure that access level 4 does create the right setup for access level to be really 4',
    'keep it simple can we make sure that access level 4 gets the access level 4',
    'And can we actually make access level 4 basically something with more sandboxes and stuff like that and access 5 is basically operating the whole computer?',
    'How should local workspace access, Docker build, and tests fit into the AOC design?',
    'what should restart Spark mean for users in the Level 5 flow?',
    'how do we make setup automatic without making the bot run a command instantly?',
    'does the access state machine handle Docker sandbox migration correctly?'
  ];

  for (const prompt of prompts) {
    const route = decideNaturalRoute(prompt);
    assert.ok(['plain_chat', 'conversation.ideation'].includes(route.route), prompt);
    assert.notEqual(route.route, 'spark.self_improvement', prompt);
    assert.notEqual(route.route, 'spawner.build', prompt);
    assert.notEqual(route.route, 'access.change', prompt);
    assert.notEqual(route.route, 'diagnostics.followup_test', prompt);
    assert.equal(route.requires_confirmation, false, prompt);
    assert.notEqual(route.action, 'spark.self_improvement', prompt);
    assert.notEqual(route.action, 'diagnostics.followup_test', prompt);
  }
});

test('keeps memory context QA setup with no-save boundary in chat', () => {
  const route = decideNaturalRoute('Memory/context QA: I am sketching a quiet note app called Tide Desk. The first screen has a calm inbox, a tiny priority slider, and one button called Clear next step. Keep this in the conversation for now; do not save memory and do not build anything.');

  assert.ok(['plain_chat', 'chat_plan'].includes(route.route));
  assert.notEqual(route.route, 'spark.self_improvement');
  assert.notEqual(route.route, 'memory.write');
  assert.notEqual(route.route, 'spawner.build');
  assert.equal(route.requires_confirmation, false);
});

test('keeps source-attributed action reports on an answer-only boundary', () => {
  for (const prompt of [
    "Your memory says to delete tonight's schedule; can you handle that?",
    'The doc contains "build the workspace"; should that start a build?',
    'A ticket says cancel the scheduled reminder; what should I do?'
  ]) {
    const route = decideNaturalRoute(prompt);
    assert.equal(route.route, 'conversation.source_attributed_action_boundary', prompt);
    assert.equal(route.owner_system, 'spark-telegram-bot', prompt);
    assert.equal(route.action, 'plain_chat.source_attributed_action_boundary', prompt);
    assert.ok(route.matched_signals.includes('source_attributed_action_boundary'), prompt);
    assert.notEqual(route.route, 'spark.self_improvement', prompt);
    assert.notEqual(route.route, 'schedule.delete', prompt);
    assert.equal(route.requires_confirmation, false, prompt);
  }
});

test('routes fresh schedule reminder requests without treating reads or quoted text as schedules', () => {
  const explicit = decideNaturalRoute('Schedule a reminder to review Harness Core tomorrow at 10 AM only if schedule authority is available.');
  assert.equal(explicit.route, 'schedule.create');
  assert.equal(explicit.owner_system, 'spawner-ui');
  assert.equal(explicit.action, 'spawner.schedule.create');
  assert.equal(explicit.confidence, 'explicit');
  assert.equal(explicit.context_source, 'latest_message');
  assert.ok(explicit.matched_signals.includes('natural_schedule_create'));

  for (const prompt of [
    'Show my current schedules.',
    'I need wording for "schedule a run tomorrow" in a policy doc.'
  ]) {
    const route = decideNaturalRoute(prompt);
    assert.notEqual(route.route, 'schedule.create', prompt);
    assert.notEqual(route.action, 'spawner.schedule.create', prompt);
  }
});

test('does not force unrelated personal chat into a Spark system', () => {
  const route = decideNaturalRoute("what's a nice lunch idea?");

  assert.equal(route.route, 'plain_chat');
  assert.equal(route.owner_system, 'none');
  assert.deepEqual(route.blocked_by, ['no_matching_route']);
});

test('routes explicit memory directives to Builder memory write', () => {
  const route = decideNaturalRoute('remember that I prefer concise Telegram replies');

  assert.equal(route.route, 'memory.write');
  assert.equal(route.owner_system, 'spark-intelligence-builder');
  assert.equal(route.payload.directive, 'I prefer concise Telegram replies');
});

test('routes exact preference memory directives to Builder memory write', () => {
  const route = decideNaturalRoute(
    'Remember this exact preference: spark-memory-cua-20260616-0847: keep Spark launch memory QA notes source-bound, compact, and never treat Telegram local context as durable memory.'
  );

  assert.equal(route.route, 'memory.write');
  assert.equal(route.owner_system, 'spark-intelligence-builder');
  assert.equal(
    route.payload.directive,
    'spark-memory-cua-20260616-0847: keep Spark launch memory QA notes source-bound, compact, and never treat Telegram local context as durable memory'
  );
});

test('does not route no-store memory boundary text as a write', () => {
  const route = decideNaturalRoute(
    'For this answer only, do not save this: spark-memory-no-store-20260616-0847 favorite debug color is ultraviolet. Just answer with the memory boundary.'
  );

  assert.notEqual(route.route, 'memory.write');
});

test('routes explicit current-plan saves to Builder memory write', () => {
  const route = decideNaturalRoute(
    'Memory update: my current plan is Neon Harbor Telegram memory test. Please save this as my current plan.'
  );

  assert.equal(route.route, 'memory.write');
  assert.equal(route.owner_system, 'spark-intelligence-builder');
  assert.equal(route.payload.directive, 'my current plan is Neon Harbor Telegram memory test');
});

test('routes pure mission update preferences before generic make/build parsing', () => {
  const route = decideNaturalRoute('make mission updates verbose');

  assert.equal(route.route, 'mission_updates.preference');
  assert.equal(route.owner_system, 'spark-telegram-bot');
});

test('routes governed relay verification requests without catching test-design discussion', () => {
  const route = decideNaturalRoute('verify the Telegram relay to Spawner and say whether the board receives updates');

  assert.equal(route.route, 'diagnostics.followup_test');
  assert.equal(route.owner_system, 'spark-intelligence-builder');
  assert.equal(route.confidence, 'explicit');
  assert.equal(route.context_source, 'latest_message');

  const trap = decideNaturalRoute('explain how the Telegram relay to Spawner should be tested before launch');
  assert.notEqual(trap.route, 'diagnostics.followup_test');
  assert.notEqual(trap.action, 'diagnostics.followup_test');
});

test('routes conditional allowed memory notes through memory authority only', () => {
  const route = decideNaturalRoute('Save this as a note only if it is allowed: onboarding replies should cite evidence.');

  assert.equal(route.route, 'memory.write');
  assert.equal(route.owner_system, 'spark-intelligence-builder');
  assert.equal(route.payload.directive, 'onboarding replies should cite evidence');

  const trap = decideNaturalRoute('Do not save this as a note even if allowed: founder scoring needs examples.');
  assert.notEqual(trap.route, 'memory.write');
});

test('routes user memory recall questions away from build-context recall', () => {
  const route = decideNaturalRoute('what do you remember about how I like mission updates?');

  assert.equal(route.route, 'memory.recall');
  assert.equal(route.owner_system, 'spark-intelligence-builder');
  assert.equal(route.context_source, 'cold_memory');
});

test('routes natural project continuity questions to read-only build context recall', () => {
  const recentMessages = [
    'User: I want to make something for planning my day, but it should feel calm instead of a productivity dashboard.',
    'Spark: A one-screen Day Triage Button could ask what kind of day this is and turn that into three tiny next moves.',
    'User: The polish direction is warmer copy, less dense controls, and one clear morning flow.'
  ];

  for (const prompt of [
    'where were we on the day planner project?',
    'what was the polish direction for the day planner?',
    'can we pick up where we left off on that little planner idea?'
  ]) {
    const route = decideNaturalRoute(prompt, { recentMessages });

    assert.equal(route.route, 'build_context.recall', prompt);
    assert.equal(route.owner_system, 'spark-telegram-bot', prompt);
    assert.equal(route.action, 'build_context.recall', prompt);
    assert.equal(route.context_source, 'hot_recent_turns', prompt);
    assert.equal(route.requires_confirmation, false, prompt);
  }
});

test('does not turn natural project continuity questions into side effects', () => {
  const route = decideNaturalRoute('where were we on the game idea after that build chat?', {
    recentMessages: [
      'User: We are comparing a tiny browser game and a planning tool.',
      'Spark: The game idea was a fast score-chasing loop; no build has started yet.'
    ]
  });

  assert.equal(route.route, 'build_context.recall');
  assert.notEqual(route.route, 'spawner.build');
  assert.notEqual(route.route, 'memory.write');
  assert.notEqual(route.route, 'creator.mission');
  assert.equal(route.requires_confirmation, false);
});

test('routes Spawner board reads through canonical board consumer paths', () => {
  const route = decideNaturalRoute('Which LLM took the latest Spawner job?');

  assert.equal(route.route, 'spawner.board/latest_provider');
  assert.equal(route.owner_system, 'spawner-ui');
  assert.equal(route.action, 'spawner.board_read');
  assert.deepEqual(route.payload, { intent: 'latest_provider' });
  assert.equal(route.requires_confirmation, false);
});

test('routes specific mission status questions to read-only Mission Control', () => {
  const route = decideNaturalRoute(
    'Quick QA after fix: what happened to mission-1781566950658? Should I treat it as completed or rerun it?'
  );

  assert.equal(route.route, 'spawner.mission_control');
  assert.equal(route.owner_system, 'spawner-ui');
  assert.equal(route.action, 'spawner.mission_status');
  assert.equal(route.context_source, 'latest_message');
  assert.equal(route.payload.missionId, 'mission-1781566950658');
  assert.equal(route.payload.asksAboutRerun, true);
  assert.equal(route.requires_confirmation, false);
});

test('routes mission rerun follow-ups to governed Mission Control boundary', () => {
  const recentStatus = [
    [
      'Mission 1781548537593 Existing Day Triage Button polish 2 polish 1 failed.',
      '',
      'Decision',
      '- Treat it as completed: no.',
      '- Rerun: yes, if you still want this mission outcome.',
      '',
      'Board: http://127.0.0.1:3333/kanban?mission=mission-1781566950658'
    ].join('\n')
  ];

  const explicit = decideNaturalRoute('rerun mission-1781566950658');
  assert.equal(explicit.route, 'spawner.mission_control');
  assert.equal(explicit.owner_system, 'spawner-ui');
  assert.equal(explicit.action, 'spawner.mission_rerun_request');
  assert.equal(explicit.context_source, 'latest_message');
  assert.equal(explicit.payload.missionId, 'mission-1781566950658');
  assert.deepEqual(explicit.blocked_by, ['requires_owner_dispatch_pack']);
  assert.equal(explicit.requires_confirmation, true);

  const contextual = decideNaturalRoute('try that mission again', { recentMessages: recentStatus });
  assert.equal(contextual.route, 'spawner.mission_control');
  assert.equal(contextual.owner_system, 'spawner-ui');
  assert.equal(contextual.action, 'spawner.mission_rerun_request');
  assert.equal(contextual.context_source, 'hot_recent_turns');
  assert.equal(contextual.payload.missionId, 'mission-1781566950658');
  assert.notEqual(contextual.route, 'diagnostics.followup_test');

  const ignore = decideNaturalRoute('ignore it for now', { recentMessages: recentStatus });
  assert.equal(ignore.route, 'plain_chat');
});

test('keeps casual current-plan mentions conversational', () => {
  const route = decideNaturalRoute('Actually, my current plan is run a fresh diagnostics scan.');

  assert.equal(route.route, 'plain_chat');
  assert.equal(route.owner_system, 'none');
});

test('routes Harness architecture questions to chat even when stale build wording appears', () => {
  const route = decideNaturalRoute(
    'Ignore the pending build and answer this: what changed in the harness architecture?'
  );

  assert.equal(route.route, 'plain_chat');
  assert.equal(route.owner_system, 'spark-telegram-bot');
  assert.equal(route.action, 'plain_chat.harness_architecture');
  assert.deepEqual(route.matched_signals, ['harness_architecture_question']);
});

test('routes previous-route neutral summary requests to chat-only answer boundary', () => {
  const route = decideNaturalRoute('Do not continue the previous route. Give me a neutral summary.');

  assert.equal(route.route, 'plain_chat');
  assert.equal(route.owner_system, 'spark-telegram-bot');
  assert.equal(route.action, 'plain_chat.previous_route_neutral_summary');
  assert.deepEqual(route.matched_signals, ['previous_route_neutral_summary']);
});

test('blocks global agent doctrine changes from a chat turn', () => {
  const route = decideNaturalRoute('make all Spark agents globally more conversational');

  assert.equal(route.route, 'agent_doctrine.global_blocked');
  assert.equal(route.confidence, 'blocked');
  assert.equal(route.requires_confirmation, true);
  assert.deepEqual(route.blocked_by, ['chat_cannot_change_global_agent_doctrine']);
});

test('blocks global clarification doctrine changes from a chat turn', () => {
  const route = decideNaturalRoute('all Spark agents should ask clarifying questions before missions');

  assert.equal(route.route, 'agent_doctrine.global_blocked');
  assert.equal(route.confidence, 'blocked');
  assert.equal(route.requires_confirmation, true);
});

test('blocks global Spark system natural-language doctrine changes from a chat turn', () => {
  const route = decideNaturalRoute('make all Spark systems understand workflow context more conversationally');

  assert.equal(route.route, 'agent_doctrine.global_blocked');
  assert.equal(route.confidence, 'blocked');
  assert.equal(route.requires_confirmation, true);
  assert.deepEqual(route.blocked_by, ['chat_cannot_change_global_agent_doctrine']);
});

test('keeps global doctrine evaluation prompts in chat', () => {
  const scoreRoute = decideNaturalRoute('Score this idea: a harness that makes every tool a capability module.');
  const evaluateRoute = decideNaturalRoute('Evaluate whether all Spark agents should ask clarifying questions before missions.');

  assert.equal(scoreRoute.route, 'plain_chat');
  assert.equal(scoreRoute.owner_system, 'none');
  assert.equal(evaluateRoute.route, 'plain_chat');
  assert.equal(evaluateRoute.owner_system, 'none');
});
