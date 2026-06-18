import assert from 'node:assert/strict';
import {
  pendingConfirmKey, stagePendingConfirm, getPendingConfirm, clearPendingConfirm,
  isConfirmText, shouldConsumeConfirm, confirmPromptMessage
} from '../src/modelRouterConfirm';

const registered: Array<[string, () => void]> = [];
function test(name: string, fn: () => void): void { registered.push([name, fn]); }

test('isConfirmText: affirmatives yes, negations and arbitrary text no', () => {
  for (const t of ['yes', 'yes do it', 'go ahead', 'confirm', 'ok', 'sure', 'proceed']) assert.equal(isConfirmText(t), true, t);
  for (const t of ['no', "don't", 'cancel', 'stop', 'change my access to operator', 'what is the weather', '']) assert.equal(isConfirmText(t), false, t);
});

test('stage/get/clear pending, with TTL expiry', () => {
  const key = pendingConfirmKey(1, 2);
  stagePendingConfirm(key, { route: 'access.change', label: 'change access to operator', turnId: 't1', text: 'change my access to operator' }, 1000);
  const p = getPendingConfirm(key, 2000);
  assert.equal(p?.route, 'access.change');
  assert.equal(p?.text, 'change my access to operator');
  assert.equal(getPendingConfirm(key, 1000 + 11 * 60 * 1000), null); // expired past TTL
  stagePendingConfirm(key, { route: 'schedule.delete', label: 'delete 9am', turnId: 't2', text: 'delete the 9am schedule' }, 5000);
  clearPendingConfirm(key);
  assert.equal(getPendingConfirm(key, 5000), null);
});

test('shouldConsumeConfirm: only a confirmation with a pending consumes', () => {
  const pending = { route: 'access.change', label: 'change access to operator', turnId: 't1', text: 'change my access to operator', createdAt: 0 };
  assert.deepEqual(shouldConsumeConfirm(pending, 'yes'), { consume: true, route: 'access.change', label: 'change access to operator' });
  assert.equal(shouldConsumeConfirm(pending, 'no').consume, false);
  assert.equal(shouldConsumeConfirm(null, 'yes').consume, false); // no pending -> a stray yes does nothing
  // the confirm-echo hole: "yes, change my access to operator" with NO pending must not consume
  assert.equal(shouldConsumeConfirm(null, 'yes, change my access to operator').consume, false);
});

test('confirm prompt names the action, no em dash', () => {
  const m = confirmPromptMessage('change access to operator');
  assert.match(m, /change access to operator/);
  assert.ok(!m.includes('—'));
});

void (async () => {
  let failed = 0;
  for (const [name, fn] of registered) {
    try { fn(); console.log(`ok - ${name}`); }
    catch (err) { console.error(`not ok - ${name}`); console.error(err); failed++; }
  }
  if (failed) process.exitCode = 1;
})();
