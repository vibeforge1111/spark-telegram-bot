import assert from 'node:assert/strict';
import { decideProposerEnforcement, NO_ACTION_ROUTES, DEFAULT_ENFORCE_ALLOWLIST } from '../src/intentProposerEnforce';
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

test('does NOT fire for a route outside the scoped allowlist', () => {
  // schedule.delete is a real recall miss too, but deliberately not in the v1 allowlist (mutating, riskier)
  assert.equal(decideProposerEnforcement('plain_chat', prop('schedule.delete', 0.99)).mode, 'none');
  assert.equal(decideProposerEnforcement('plain_chat', prop('spawner.build', 0.99)).mode, 'none');
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

void (async () => {
  let failed = 0;
  for (const [name, fn] of registered) {
    try { fn(); console.log(`ok - ${name}`); }
    catch (err) { console.error(`not ok - ${name}`); console.error(err); failed++; }
  }
  if (failed) process.exitCode = 1;
})();
