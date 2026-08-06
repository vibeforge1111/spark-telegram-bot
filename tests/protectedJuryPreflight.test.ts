import assert from 'node:assert/strict';
import { isNoExecutionBoundary } from '../src/conversationIntent';
import { isProtectedJuryPreflightRequest } from '../src/protectedJuryPreflight';

function test(name: string, fn: () => void): void {
  try {
    fn();
    console.log(`ok - ${name}`);
  } catch (error) {
    console.error(`not ok - ${name}`);
    throw error;
  }
}

test('keeps conditional protected Jury preflights executable without weakening stop boundaries', () => {
  const prompt = [
    'Please run the legitimate protected review-control preflight at exact head e25f16b3e32626a541b5eceab3ece0035898f791.',
    'If and only if every required gate and signature check all pass, publish the spark-jury-approval status.',
    'If any gate fails, do not publish the status; return a bounded blocker receipt.',
    'Do not bypass protection.'
  ].join(' ');
  assert.equal(isProtectedJuryPreflightRequest(prompt), true);
  assert.equal(isNoExecutionBoundary(prompt), false);
  assert.equal(isProtectedJuryPreflightRequest(`Do not run it. ${prompt}`), false);
  assert.equal(isNoExecutionBoundary(`Do not run it. ${prompt}`), true);
  assert.equal(
    isProtectedJuryPreflightRequest(prompt.replace('If any gate fails, do not publish the status; ', '')),
    false
  );
});
