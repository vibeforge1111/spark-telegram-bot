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

test('routes build clarification follow-ups from pending state', () => {
  const route = decideNaturalRoute("yes let's do it create it after analyzing our systems deeply please", {
    pendingBuildClarification: true
  });

  assert.equal(route.route, 'spawner.pending_clarification');
  assert.equal(route.owner_system, 'spawner-ui');
  assert.equal(route.context_source, 'pending_state');
  assert.equal(route.requires_confirmation, false);
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

  assert.equal(decideNaturalRoute('4', { recentMessages: ['User: I like the fourth design'] }).route, 'plain_chat');
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

test('routes explicit current-plan saves to Builder memory write', () => {
  const route = decideNaturalRoute(
    'Memory update: my current plan is Neon Harbor Telegram memory test. Please save this as my current plan.'
  );

  assert.equal(route.route, 'memory.write');
  assert.equal(route.owner_system, 'spark-intelligence-builder');
  assert.equal(route.payload.directive, 'my current plan is Neon Harbor Telegram memory test');
});

test('routes user memory recall questions away from build-context recall', () => {
  const route = decideNaturalRoute('what do you remember about how I like mission updates?');

  assert.equal(route.route, 'memory.recall');
  assert.equal(route.owner_system, 'spark-intelligence-builder');
  assert.equal(route.context_source, 'cold_memory');
});

test('keeps casual current-plan mentions conversational', () => {
  const route = decideNaturalRoute('Actually, my current plan is run a fresh diagnostics scan.');

  assert.equal(route.route, 'plain_chat');
  assert.equal(route.owner_system, 'none');
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
