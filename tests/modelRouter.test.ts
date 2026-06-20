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
});

test('invariants: confirm routes are the destructive/irreversible set, chat routes are non-actions', () => {
  assert.ok(CONFIRM_ROUTES.has('access.change'));
  assert.ok(CONFIRM_ROUTES.has('schedule.delete'));
  assert.ok(!CONFIRM_ROUTES.has('spawner.build')); // builds start on request now (friction dropped)
  assert.ok(CHAT_ROUTES.has('plain_chat'));
  assert.ok(CHAT_ROUTES.has('conversation.ideation'));
  assert.ok(CHAT_ROUTES.has('abstain'));
  assert.ok(LOCAL_READ_ROUTES.has('memory.recall'));
  assert.ok(LOCAL_READ_ROUTES.has('spark.read_only_state'));
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
