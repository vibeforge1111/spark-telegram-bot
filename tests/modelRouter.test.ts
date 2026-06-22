import assert from 'node:assert/strict';
import { decideModelRoute, CONFIRM_ROUTES, CHAT_ROUTES, LOCAL_READ_ROUTES } from '../src/modelRouter';
import type { IntentProposal } from '../src/intentProposerShadow';

const registered: Array<[string, () => void]> = [];
function test(name: string, fn: () => void): void { registered.push([name, fn]); }

function prop(route: string, confidence: number, abstain = false): IntentProposal {
  return { candidates: [{ route, confidence, rationale: '' }], abstain };
}

test('a confident low-blast action DISPATCHES (tools fire)', () => {
  const d = decideModelRoute(prop('diagnostics.scan', 0.95));
  assert.equal(d.mode, 'dispatch');
  assert.equal(d.route, 'diagnostics.scan');
});

test('a confident normal action DISPATCHES after the action confidence bar', () => {
  for (const route of ['memory.write', 'model.switch', 'browser.navigate']) {
    assert.equal(decideModelRoute(prop(route, 0.9)).mode, 'dispatch', route);
  }
});

test('local owner-backed reads DISPATCH at the read confidence bar', () => {
  for (const route of ['memory.recall', 'spark.read_only_state', 'spark_wiki.answer', 'spawner.board', 'access.status']) {
    const d = decideModelRoute(prop(route, 0.72));
    assert.equal(d.mode, 'dispatch', route);
    assert.equal(d.reason, 'model_routed_to_local_read', route);
  }
});

test('open-ended next-step ideation demotes misclassified local reads before dispatch', () => {
  for (const route of ['memory.recall', 'spark.read_only_state']) {
    const decision = decideModelRoute(prop(route, 0.91), {
      text: 'after that restart, what should I focus on?'
    });
    assert.equal(decision.mode, 'chat', route);
    assert.equal(decision.route, 'conversation.ideation', route);
    assert.equal(decision.reason, 'fresh_text_is_open_ended_ideation', route);
  }

  assert.equal(
    decideModelRoute(prop('spark.read_only_state', 0.91), { text: 'is a restart needed right now?' }).mode,
    'dispatch'
  );
  assert.equal(
    decideModelRoute(prop('memory.recall', 0.91), { text: 'What did I say I should focus on next?' }).mode,
    'dispatch'
  );
});

test('fresh deterministic owner routes survive proposer abstention without reviving broad build routes', () => {
  const preference = decideModelRoute(prop('memory.write', 0.7, true), {
    text: 'make mission updates verbose',
    deterministicRoute: {
      route: 'mission_updates.preference',
      confidence: 'explicit',
      context_source: 'latest_message',
      mutation_referent: 'fresh_turn'
    }
  });
  assert.equal(preference.mode, 'dispatch');
  assert.equal(preference.route, 'mission_updates.preference');
  assert.equal(preference.reason, 'fresh_deterministic_owner_route');

  const operator = decideModelRoute(prop('plain_chat', 0.85), {
    text: 'Check whether C:\\Users\\USER\\Desktop exists and list the first five folders.',
    deterministicRoute: {
      route: 'operator.safe_action',
      confidence: 'explicit',
      context_source: 'latest_message',
      mutation_referent: 'fresh_turn'
    }
  });
  assert.equal(operator.mode, 'dispatch');
  assert.equal(operator.route, 'operator.safe_action');

  const schedule = decideModelRoute(prop('plain_chat', 0.86), {
    text: 'Schedule a reminder to review Harness Core tomorrow at 10 AM only if schedule authority is available.',
    deterministicRoute: {
      route: 'schedule.create',
      confidence: 'explicit',
      context_source: 'latest_message',
      mutation_referent: 'fresh_turn'
    }
  });
  assert.equal(schedule.mode, 'dispatch');
  assert.equal(schedule.route, 'schedule.create');
  assert.equal(schedule.reason, 'fresh_deterministic_owner_route');

  const modelSwitch = decideModelRoute(prop('plain_chat', 0.88), {
    text: 'switch the chat model to glm',
    deterministicRoute: {
      route: 'model.switch',
      confidence: 'explicit',
      context_source: 'latest_message',
      mutation_referent: 'fresh_turn',
      payload: { role: 'agent', provider: 'zai' }
    }
  });
  assert.equal(modelSwitch.mode, 'dispatch');
  assert.equal(modelSwitch.route, 'model.switch');
  assert.equal(modelSwitch.reason, 'fresh_deterministic_owner_route');

  const externalResearch = decideModelRoute(prop('plain_chat', 0.88), {
    text: 'Fetch current external research on harnesses.',
    deterministicRoute: {
      route: 'external_research.inspect',
      confidence: 'explicit',
      context_source: 'latest_message',
      mutation_referent: 'fresh_turn'
    }
  });
  assert.equal(externalResearch.mode, 'dispatch');
  assert.equal(externalResearch.route, 'external_research.inspect');
  assert.equal(externalResearch.reason, 'fresh_deterministic_owner_route');

  const buildContext = decideModelRoute(prop('plain_chat', 0.88), {
    text: 'what project are we working on and what evidence do you have?',
    deterministicRoute: {
      route: 'build_context.recall',
      confidence: 'contextual',
      context_source: 'hot_recent_turns',
      mutation_referent: 'fresh_turn'
    }
  });
  assert.equal(buildContext.mode, 'dispatch');
  assert.equal(buildContext.route, 'build_context.recall');
  assert.equal(buildContext.reason, 'fresh_deterministic_owner_route');

  const memoryRecall = decideModelRoute(prop('plain_chat', 0.88), {
    text: 'What is the session code word I asked you to remember?',
    deterministicRoute: {
      route: 'memory.recall',
      confidence: 'explicit',
      context_source: 'cold_memory',
      mutation_referent: 'fresh_turn'
    }
  });
  assert.equal(memoryRecall.mode, 'dispatch');
  assert.equal(memoryRecall.route, 'memory.recall');

  const wikiInventory = decideModelRoute(prop('plain_chat', 0.88), {
    text: 'what pages are in your LLM wiki?',
    deterministicRoute: {
      route: 'spark_wiki.inventory',
      confidence: 'explicit',
      context_source: 'latest_message',
      mutation_referent: 'fresh_turn'
    }
  });
  assert.equal(wikiInventory.mode, 'dispatch');
  assert.equal(wikiInventory.route, 'spark_wiki.inventory');

  const wikiAnswer = decideModelRoute(prop('plain_chat', 0.88), {
    text: 'answer from your wiki how should route tracing work?',
    deterministicRoute: {
      route: 'spark_wiki.answer',
      confidence: 'explicit',
      context_source: 'cold_memory',
      mutation_referent: 'fresh_turn'
    }
  });
  assert.equal(wikiAnswer.mode, 'dispatch');
  assert.equal(wikiAnswer.route, 'spark_wiki.answer');

  const wikiAnswerNoModel = decideModelRoute(null, {
    text: 'answer from your wiki how should route tracing work?',
    deterministicRoute: {
      route: 'spark_wiki.answer',
      confidence: 'explicit',
      context_source: 'cold_memory',
      mutation_referent: 'fresh_turn'
    }
  });
  assert.equal(wikiAnswerNoModel.mode, 'dispatch');
  assert.equal(wikiAnswerNoModel.route, 'spark_wiki.answer');

  const naturalMission = decideModelRoute(prop('plain_chat', 0.88), {
    text: 'launch a mission to summarize the QA ledger in one sentence',
    deterministicRoute: {
      route: 'natural_run',
      confidence: 'explicit',
      context_source: 'latest_message',
      mutation_referent: 'fresh_turn'
    }
  });
  assert.equal(naturalMission.mode, 'dispatch');
  assert.equal(naturalMission.route, 'natural_run');

  assert.equal(
    decideModelRoute(prop('plain_chat', 0.9), {
      text: 'build is mentioned in this bug report',
      deterministicRoute: {
        route: 'spawner.build',
        confidence: 'explicit',
        context_source: 'latest_message',
        mutation_referent: 'fresh_turn'
      }
    }).mode,
    'chat'
  );
});

test('no model opinion can fall back to a fresh explicit build owner route', () => {
  const decision = decideModelRoute(null, {
    text: 'Create a Spark live status dashboard with cards for Telegram and Spawner.',
    deterministicRoute: {
      route: 'spawner.build',
      confidence: 'explicit',
      context_source: 'latest_message',
      mutation_referent: 'fresh_turn'
    }
  });
  assert.equal(decision.mode, 'dispatch');
  assert.equal(decision.route, 'spawner.build');
  assert.equal(decision.reason, 'fresh_deterministic_owner_route');

  const quoted = decideModelRoute(prop('plain_chat', 0.9), {
    text: 'the doc says build a dashboard',
    deterministicRoute: {
      route: 'spawner.build',
      confidence: 'explicit',
      context_source: 'latest_message',
      mutation_referent: 'fresh_turn'
    }
  });
  assert.equal(quoted.mode, 'chat');
});

test('no model opinion can fall back to a fresh exact-artifact build owner route', () => {
  const decision = decideModelRoute(null, {
    text: 'Build this at C:\\Users\\USER\\Desktop\\recipe-timer: a tiny kitchen timer for developers.',
    deterministicRoute: {
      route: 'spawner.build',
      confidence: 'explicit',
      context_source: 'visible_exact_artifact',
      mutation_referent: 'fresh_turn'
    }
  });
  assert.equal(decision.mode, 'dispatch');
  assert.equal(decision.route, 'spawner.build');
  assert.equal(decision.reason, 'fresh_deterministic_owner_route');

  const stale = decideModelRoute(null, {
    text: 'Build that same timer now.',
    deterministicRoute: {
      route: 'spawner.build',
      confidence: 'explicit',
      context_source: 'cold_memory',
      mutation_referent: 'fresh_turn'
    }
  });
  assert.equal(stale.mode, 'chat');

  const quoted = decideModelRoute(prop('plain_chat', 0.92), {
    text: 'The README says: build this at C:\\Users\\USER\\Desktop\\recipe-timer.',
    deterministicRoute: {
      route: 'spawner.build',
      confidence: 'explicit',
      context_source: 'visible_exact_artifact',
      mutation_referent: 'fresh_turn'
    }
  });
  assert.equal(quoted.mode, 'chat');
});

test('no model opinion can fall back to a fresh Spark QA proof owner route', () => {
  const decision = decideModelRoute(null, {
    text: 'show Spark QA Operator benchmark score',
    deterministicRoute: {
      route: 'sparkqa.run',
      confidence: 'explicit',
      context_source: 'latest_message',
      mutation_referent: 'fresh_turn'
    }
  });
  assert.equal(decision.mode, 'dispatch');
  assert.equal(decision.route, 'sparkqa.run');
  assert.equal(decision.reason, 'fresh_deterministic_owner_route');

  const reported = decideModelRoute(prop('plain_chat', 0.94), {
    text: 'The report says: show Spark QA Operator benchmark score.',
    deterministicRoute: {
      route: 'sparkqa.run',
      confidence: 'explicit',
      context_source: 'latest_message',
      mutation_referent: 'fresh_turn'
    }
  });
  assert.equal(reported.mode, 'chat');
});

test('no model opinion can fall back to a fresh domain-chip preview owner route', () => {
  const decision = decideModelRoute(null, {
    text: 'create a payments risk domain chip for launch readiness',
    deterministicRoute: {
      route: 'domain_chip.create',
      confidence: 'explicit',
      context_source: 'latest_message',
      mutation_referent: 'fresh_turn',
      requires_confirmation: true
    }
  });
  assert.equal(decision.mode, 'dispatch');
  assert.equal(decision.route, 'domain_chip.create');
  assert.equal(decision.reason, 'fresh_deterministic_owner_route');

  const access = decideModelRoute(null, {
    text: 'change my access to operator',
    deterministicRoute: {
      route: 'access.change',
      confidence: 'explicit',
      context_source: 'latest_message',
      mutation_referent: 'fresh_turn',
      requires_confirmation: true
    }
  });
  assert.equal(access.mode, 'chat');
});

test('no model opinion can fall back to a scoped no-edit Spawner probe without broadening builds', () => {
  const probe = decideModelRoute(prop('plain_chat', 0.91), {
    text: 'Run a no-edit startup QA probe that only replies SPARK_STARTUP_NO_EDIT_OK.',
    deterministicRoute: {
      route: 'spawner.build',
      confidence: 'explicit',
      context_source: 'latest_message',
      mutation_referent: 'fresh_turn',
      payload: { noEditProbe: true }
    }
  });
  assert.equal(probe.mode, 'dispatch');
  assert.equal(probe.route, 'spawner.build');
  assert.equal(probe.reason, 'fresh_deterministic_owner_route');

  const broadBuild = decideModelRoute(prop('plain_chat', 0.91), {
    text: 'build a generic dashboard',
    deterministicRoute: {
      route: 'spawner.build',
      confidence: 'explicit',
      context_source: 'latest_message',
      mutation_referent: 'fresh_turn'
    }
  });
  assert.equal(broadBuild.mode, 'chat');
});

test('no model opinion can fall back to a scoped creator mission follow-up route', () => {
  const decision = decideModelRoute(null, {
    text: 'create or update the domain chip',
    deterministicRoute: {
      route: 'creator.mission',
      confidence: 'contextual',
      context_source: 'hot_recent_turns',
      mutation_referent: 'fresh_turn',
      requires_confirmation: true
    }
  });
  assert.equal(decision.mode, 'dispatch');
  assert.equal(decision.route, 'creator.mission');

  const stale = decideModelRoute(null, {
    text: 'create or update the domain chip',
    deterministicRoute: {
      route: 'creator.mission',
      confidence: 'explicit',
      context_source: 'cold_memory',
      mutation_referent: 'fresh_turn',
      requires_confirmation: true
    }
  });
  assert.equal(stale.mode, 'chat');
});

test('no model opinion can fall back to a scoped Spark QA pause owner route', () => {
  const decision = decideModelRoute(null, {
    text: 'pause the Spark QA Operator loop; do not keep running more rounds',
    deterministicRoute: {
      route: 'sparkqa.pause',
      confidence: 'explicit',
      context_source: 'hot_recent_turns',
      mutation_referent: 'fresh_turn',
      requires_confirmation: true
    }
  });
  assert.equal(decision.mode, 'dispatch');
  assert.equal(decision.route, 'sparkqa.pause');

  const stale = decideModelRoute(null, {
    text: 'pause that old QA loop',
    deterministicRoute: {
      route: 'sparkqa.pause',
      confidence: 'explicit',
      context_source: 'cold_memory',
      mutation_referent: 'fresh_turn',
      requires_confirmation: true
    }
  });
  assert.equal(stale.mode, 'chat');
});

test('no model opinion can fall back to non-operator access changes only', () => {
  const contextualLowerWithoutModel = decideModelRoute(null, {
    text: 'Actually make it four',
    deterministicRoute: {
      route: 'access.change',
      confidence: 'contextual',
      context_source: 'hot_recent_turns',
      mutation_referent: 'fresh_turn',
      payload: { level: '4' }
    }
  });
  assert.equal(contextualLowerWithoutModel.mode, 'dispatch');
  assert.equal(contextualLowerWithoutModel.route, 'access.change');

  const lower = decideModelRoute(prop('plain_chat', 0.9), {
    text: 'Change my access level to three please',
    deterministicRoute: {
      route: 'access.change',
      confidence: 'explicit',
      context_source: 'latest_message',
      mutation_referent: 'fresh_turn',
      payload: { level: '3' }
    }
  });
  assert.equal(lower.mode, 'dispatch');
  assert.equal(lower.route, 'access.change');

  const contextualLower = decideModelRoute(prop('plain_chat', 0.9), {
    text: 'Change it to 4',
    deterministicRoute: {
      route: 'access.change',
      confidence: 'contextual',
      context_source: 'hot_recent_turns',
      mutation_referent: 'fresh_turn',
      payload: { level: '4' }
    }
  });
  assert.equal(contextualLower.mode, 'dispatch');
  assert.equal(contextualLower.route, 'access.change');

  const operator = decideModelRoute(prop('plain_chat', 0.9), {
    text: 'Change my access level to five please',
    deterministicRoute: {
      route: 'access.change',
      confidence: 'explicit',
      context_source: 'latest_message',
      mutation_referent: 'fresh_turn',
      payload: { level: '5' }
    }
  });
  assert.equal(operator.mode, 'chat');

  const contextualOperatorWithoutModel = decideModelRoute(null, {
    text: 'Actually make it five',
    deterministicRoute: {
      route: 'access.change',
      confidence: 'contextual',
      context_source: 'hot_recent_turns',
      mutation_referent: 'fresh_turn',
      payload: { level: '5' }
    }
  });
  assert.equal(contextualOperatorWithoutModel.mode, 'chat');
});

test('deterministic owner fallback rejects stale, contextual, and confirmation-required authority', () => {
  for (const deterministicRoute of [
    {
      route: 'memory.write',
      confidence: 'explicit',
      context_source: 'cold_memory',
      mutation_referent: 'fresh_turn'
    },
    {
      route: 'memory.write',
      confidence: 'contextual',
      context_source: 'latest_message',
      mutation_referent: 'fresh_turn'
    },
    {
      route: 'spark_wiki.promote',
      confidence: 'explicit',
      context_source: 'latest_message',
      mutation_referent: 'fresh_turn',
      requires_confirmation: true
    }
  ]) {
    const decision = decideModelRoute(prop('plain_chat', 0.96), {
      text: 'save the quoted note from that old report',
      deterministicRoute
    });
    assert.equal(decision.mode, 'chat');
    assert.equal(decision.reason, 'model_routed_to_chat');
  }
});

test('local option references are referents, not fresh action authority', () => {
  for (const text of ["Let's do the second one", "Let's do two"]) {
    const decision = decideModelRoute(prop('spawner.build', 0.92), { text });
    assert.equal(decision.mode, 'chat', text);
    assert.equal(decision.route, 'conversation.ideation', text);
    assert.equal(decision.reason, 'fresh_text_is_local_option_reference', text);
  }
});

test('question-shaped mutation proposals stay chat unless they are explicit requests', () => {
  const discussion = decideModelRoute(prop('creator.mission', 0.93), {
    text: 'How would Spark improve a startup answer without gaming the benchmark?'
  });
  assert.equal(discussion.mode, 'chat');
  assert.equal(discussion.reason, 'fresh_text_is_action_discussion_question');

  const request = decideModelRoute(prop('spawner.build', 0.93), {
    text: 'can you build me a compact launch dashboard?'
  });
  assert.equal(request.mode, 'dispatch');
  assert.equal(request.route, 'spawner.build');

  const researchQuestion = decideModelRoute(prop('external_research.inspect', 0.93), {
    text: 'How should we research current harnesses?'
  });
  assert.equal(researchQuestion.mode, 'chat');
  assert.equal(researchQuestion.reason, 'fresh_text_is_action_discussion_question');
});

test('low-confidence mutations and external reads still CHAT', () => {
  assert.equal(decideModelRoute(prop('schedule.create', 0.72)).mode, 'chat');
  assert.equal(decideModelRoute(prop('browser.navigate', 0.72)).mode, 'chat');
  assert.equal(decideModelRoute(prop('browser.navigate', 0.72)).reason, 'below_dispatch_confidence');
});

test('truly destructive/irreversible mutations CONFIRM before executing', () => {
  for (const route of ['access.change', 'schedule.delete', 'recursive.proposal']) {
    assert.equal(decideModelRoute(prop(route, 0.99)).mode, 'confirm', route);
  }
});

test('builds/chips/creator-missions DISPATCH directly (start on request, no confirm friction)', () => {
  for (const route of ['spawner.build', 'domain_chip.create', 'creator.mission']) {
    assert.equal(decideModelRoute(prop(route, 0.99)).mode, 'dispatch', route);
  }
});

test('a hijack the model read as chat -> CHAT (no separate veto needed)', () => {
  // this is the whole point: the model never routes a hijack to an action, so there is nothing to veto
  assert.equal(decideModelRoute(prop('plain_chat', 0.96)).mode, 'chat');
  assert.equal(decideModelRoute(prop('conversation.ideation', 0.91)).mode, 'chat');
});

test('abstain and no-opinion -> CHAT (fail-safe, never invents an action)', () => {
  assert.equal(decideModelRoute(prop('plain_chat', 0.9, true)).mode, 'chat');
  assert.equal(decideModelRoute(null).mode, 'chat');
  assert.equal(decideModelRoute(null).reason, 'no_model_opinion');
});

test('an action below the dispatch bar -> CHAT (clarify in prose, do not act unsure)', () => {
  const d = decideModelRoute(prop('schedule.create', 0.6));
  assert.equal(d.mode, 'chat');
  assert.equal(d.reason, 'below_dispatch_confidence');
});

test('confidence bar is configurable', () => {
  assert.equal(decideModelRoute(prop('diagnostics.scan', 0.8), { dispatchMin: 0.9 }).mode, 'chat');
  assert.equal(decideModelRoute(prop('diagnostics.scan', 0.95), { dispatchMin: 0.9 }).mode, 'dispatch');
});

test('route-owner text boundaries demote descriptive frames before dispatch', () => {
  const diagnostics = decideModelRoute(prop('diagnostics.scan', 0.95), {
    text: 'Actually, my current plan is run a fresh diagnostics scan.'
  });
  assert.equal(diagnostics.mode, 'chat');
  assert.equal(diagnostics.reason, 'fresh_text_not_diagnostics_scan_request');

  const memory = decideModelRoute(prop('memory.write', 0.95), {
    text: 'my current plan is to run a diagnostics scan'
  });
  assert.equal(memory.mode, 'chat');
  assert.equal(memory.reason, 'fresh_text_not_memory_write_request');
});

test('route-owner text boundaries demote schedule read requests before create dispatch', () => {
  for (const text of ['Show my current schedules.', 'list the scheduled jobs I have right now']) {
    const decision = decideModelRoute(prop('schedule.create', 0.95), { text });
    assert.equal(decision.mode, 'chat', text);
    assert.equal(decision.reason, 'fresh_text_is_schedule_read_request', text);
  }
});

test('route-owner text boundaries still allow explicit fresh requests', () => {
  assert.equal(
    decideModelRoute(prop('diagnostics.scan', 0.95), { text: 'run a fresh diagnostics scan' }).mode,
    'dispatch'
  );
  assert.equal(
    decideModelRoute(prop('memory.write', 0.95), {
      text: 'Memory update: my current plan is Neon Harbor Telegram memory test. Please save this as my current plan.'
    }).mode,
    'dispatch'
  );
  assert.equal(
    decideModelRoute(prop('schedule.create', 0.95), { text: 'schedule a daily summary at 9am' }).mode,
    'dispatch'
  );
});

test('invariants: confirm routes are the destructive/irreversible set, chat routes are non-actions', () => {
  assert.ok(CONFIRM_ROUTES.has('access.change'));
  assert.ok(CONFIRM_ROUTES.has('schedule.delete'));
  assert.ok(!CONFIRM_ROUTES.has('spawner.build')); // builds start on request now (friction dropped)
  assert.ok(CHAT_ROUTES.has('plain_chat'));
  assert.ok(CHAT_ROUTES.has('conversation.ideation'));
  assert.ok(CHAT_ROUTES.has('abstain'));
  assert.ok(LOCAL_READ_ROUTES.has('memory.recall'));
  assert.ok(LOCAL_READ_ROUTES.has('build_context.recall'));
  assert.ok(LOCAL_READ_ROUTES.has('spark.read_only_state'));
  assert.ok(LOCAL_READ_ROUTES.has('spark_wiki.inventory'));
  assert.ok(LOCAL_READ_ROUTES.has('spark_wiki.status'));
  assert.ok(!LOCAL_READ_ROUTES.has('browser.navigate'));
  assert.ok(!CONFIRM_ROUTES.has('diagnostics.scan'));
});

void (async () => {
  let failed = 0;
  for (const [name, fn] of registered) {
    try { fn(); console.log(`ok - ${name}`); }
    catch (err) { console.error(`not ok - ${name}`); console.error(err); failed++; }
  }
  if (failed) process.exitCode = 1;
})();
