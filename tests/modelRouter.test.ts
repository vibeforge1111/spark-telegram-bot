import assert from 'node:assert/strict';
import { decideModelRoute, CONFIRM_ROUTES, CHAT_ROUTES } from '../src/modelRouter';
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

test('a read route DISPATCHES freely (no confirm)', () => {
  for (const route of ['memory.write', 'model.switch']) {
    assert.equal(decideModelRoute(prop(route, 0.9)).mode, 'dispatch', route);
  }
});

test('high-blast-radius mutations CONFIRM before executing', () => {
  for (const route of ['access.change', 'spawner.build', 'schedule.delete']) {
    assert.equal(decideModelRoute(prop(route, 0.99)).mode, 'confirm', route);
  }
});

test('a hijack the model read as chat -> CHAT (no separate veto needed)', () => {
  // this is the whole point: the model never routes a hijack to an action, so there is nothing to veto
  assert.equal(decideModelRoute(prop('plain_chat', 0.96)).mode, 'chat');
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

test('invariants: confirm routes are high-blast, chat routes are non-actions', () => {
  assert.ok(CONFIRM_ROUTES.has('access.change'));
  assert.ok(CONFIRM_ROUTES.has('spawner.build'));
  assert.ok(CHAT_ROUTES.has('plain_chat'));
  assert.ok(CHAT_ROUTES.has('abstain'));
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
