import assert from 'node:assert/strict';
import {
  decideProposerEnforcement,
  NO_ACTION_ROUTES,
  DEFAULT_ENFORCE_ALLOWLIST,
  decideProposerVeto,
  proposerVetoConfirmMessage,
  NON_MUTATING_PROPOSER_ROUTES
} from '../src/intentProposerEnforce';
import type { IntentProposal } from '../src/intentProposerShadow';

const registered: Array<[string, () => void]> = [];
function test(name: string, fn: () => void): void { registered.push([name, fn]); }

function prop(route: string, confidence: number, abstain = false): IntentProposal {
  return { candidates: [{ route, confidence, rationale: '' }], abstain };
}

test('suggests when regex chatted but proposer confidently hit an allowlisted recall route', () => {
  const d = decideProposerEnforcement('plain_chat', prop('diagnostics.scan', 0.96));
  assert.equal(d.mode, 'suggest');
  assert.equal(d.route, 'diagnostics.scan');
  assert.match(d.message || '', /diagnostics/i);
});

test('suggests memory.write recall hole', () => {
  const d = decideProposerEnforcement('plain_chat', prop('memory.write', 0.97));
  assert.equal(d.mode, 'suggest');
  assert.match(d.message || '', /remember/i);
});

test('does NOT fire when the regex already chose an action route (cannot fight a real route)', () => {
  assert.equal(decideProposerEnforcement('spawner.build', prop('diagnostics.scan', 0.99)).mode, 'none');
  assert.equal(decideProposerEnforcement('schedule.delete', prop('memory.write', 0.99)).mode, 'none');
});

test('fires for the expanded recall routes (schedule/model/memory.delete)', () => {
  for (const route of ['schedule.create', 'schedule.delete', 'model.switch', 'memory.delete']) {
    assert.equal(decideProposerEnforcement('plain_chat', prop(route, 0.95)).mode, 'suggest', route);
  }
});

test('does NOT fire for a route outside the scoped allowlist', () => {
  // high-blast-radius routes stay OUT of the nudge allowlist (build, chip creation, access change,
  // external research) even when the regex chatted and the proposer is confident.
  for (const route of ['spawner.build', 'domain_chip.create', 'access.change', 'external_research.inspect']) {
    assert.equal(decideProposerEnforcement('plain_chat', prop(route, 0.99)).mode, 'none', route);
  }
});

test('does NOT fire below the confidence bar, on abstain, or on a null proposal', () => {
  assert.equal(decideProposerEnforcement('plain_chat', prop('diagnostics.scan', 0.85)).mode, 'none');
  assert.equal(decideProposerEnforcement('plain_chat', prop('diagnostics.scan', 0.99, true)).mode, 'none');
  assert.equal(decideProposerEnforcement('plain_chat', null).mode, 'none');
});

test('does NOT fire when the proposer agrees it is just chat (precision case)', () => {
  assert.equal(decideProposerEnforcement('plain_chat', prop('plain_chat', 0.95)).mode, 'none');
});

test('scope invariants hold (allowlist subset of routes, no-action set non-empty)', () => {
  assert.ok(DEFAULT_ENFORCE_ALLOWLIST.has('diagnostics.scan'));
  assert.ok(DEFAULT_ENFORCE_ALLOWLIST.has('memory.write'));
  assert.ok(NO_ACTION_ROUTES.has('plain_chat'));
  // a hijack-over-routed mutation must never be enforceable: it would arrive as an action regexRoute
  assert.equal(decideProposerEnforcement('spawner.build', prop('plain_chat', 0.95)).mode, 'none');
});

// --- Phase 2b veto -------------------------------------------------------------------------------

test('VETO fires when the model confidently reads a mutation-permitted turn as plain chat', () => {
  // the classic hijack: gate permitted a mutation, but the fresh text is discussion -> block + confirm.
  const d = decideProposerVeto(prop('plain_chat', 0.93));
  assert.equal(d.veto, true);
  assert.equal(d.route, 'plain_chat');
  assert.equal(d.reason, 'semantic_proposer_veto');
});

test('VETO fires for negation/quote read as a read-only route at the lower veto bar', () => {
  for (const route of ['spark.read_only_state', 'spark_wiki.answer', 'spawner.board']) {
    assert.equal(decideProposerVeto(prop(route, 0.82)).veto, true, route);
  }
});

test('VETO does NOT fire when the model agrees it is a real action (never block a genuine command)', () => {
  for (const route of ['spawner.build', 'access.change', 'schedule.delete', 'memory.write']) {
    assert.equal(decideProposerVeto(prop(route, 0.99)).veto, false, route);
  }
});

test('VETO does NOT fire below the veto bar, on abstain, or on a null proposal (default open)', () => {
  assert.equal(decideProposerVeto(prop('plain_chat', 0.7)).veto, false);
  assert.equal(decideProposerVeto(prop('plain_chat', 0.99, true)).veto, false);
  assert.equal(decideProposerVeto(null).veto, false);
});

test('VETO fails CLOSED on a null proposal when guarding a permitted mutation', () => {
  const d = decideProposerVeto(null, { failClosedOnNull: true });
  assert.equal(d.veto, true);
  assert.equal(d.reason, 'proposer_unavailable');
  // abstain is a real model opinion ("ask"), not an outage -> still open, not the fail-closed path
  assert.equal(decideProposerVeto(prop('plain_chat', 0.99, true), { failClosedOnNull: true }).veto, false);
});

test('VETO honors a custom confidence bar', () => {
  assert.equal(decideProposerVeto(prop('plain_chat', 0.85), { minConfidence: 0.95 }).veto, false);
  assert.equal(decideProposerVeto(prop('plain_chat', 0.97), { minConfidence: 0.95 }).veto, true);
});

test('VETO non-mutating set covers the no-action routes and reads, not the mutations', () => {
  assert.ok(NON_MUTATING_PROPOSER_ROUTES.has('plain_chat'));
  assert.ok(NON_MUTATING_PROPOSER_ROUTES.has('spark.read_only_state'));
  for (const route of NO_ACTION_ROUTES) assert.ok(NON_MUTATING_PROPOSER_ROUTES.has(route), route);
  assert.ok(!NON_MUTATING_PROPOSER_ROUTES.has('spawner.build'));
  assert.ok(!NON_MUTATING_PROPOSER_ROUTES.has('access.change'));
});

test('veto confirm message names the action and gives an explicit go-ahead, no em dash', () => {
  const msg = proposerVetoConfirmMessage('access.change');
  assert.match(msg, /access\.change/);
  assert.match(msg, /yes, access\.change/);
  assert.ok(!msg.includes('—'));
});

void (async () => {
  let failed = 0;
  for (const [name, fn] of registered) {
    try { fn(); console.log(`ok - ${name}`); }
    catch (err) { console.error(`not ok - ${name}`); console.error(err); failed++; }
  }
  if (failed) process.exitCode = 1;
})();
