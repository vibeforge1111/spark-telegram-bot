import assert from 'node:assert/strict';
import { redactText } from '../src/redaction';

// Mirrors src/chipLoop.ts: on exec failure the stderr tail is run through
// redactText() before being appended to the returned error string:
//   const stderr = redactText(err.stderr.slice(-400));
//   error = err.message ? `${err.message}${stderr ? ': ' + stderr : ''}` : 'loop exec failed';
function buildLoopError(errMsg: string, stderrRaw: string): { ok: boolean; error: string } {
  const stderr = stderrRaw ? redactText(stderrRaw.slice(-400)) : '';
  return { ok: false, error: errMsg ? `${errMsg}${stderr ? ': ' + stderr : ''}` : 'loop exec failed' };
}

async function test(name: string, fn: () => void | Promise<void>): Promise<void> {
  try {
    await fn();
    console.log(`ok - ${name}`);
  } catch (error) {
    console.error(`not ok - ${name}`);
    throw error;
  }
}

(async () => {
  await test('raw secret stderr is masked in the error string', () => {
    const res = buildLoopError('exec failed', 'SECRET_TOKEN=abc123def456ghi789jkl0 long secret value');
    assert.doesNotMatch(res.error, /abc123def456ghi789jkl0/);
  });

  await test('result is not ok on failure', () => {
    assert.equal(buildLoopError('err', 'stderr').ok, false);
  });

  await test('internal paths in stderr are redacted', () => {
    const res = buildLoopError('exec failed', 'wrote to /home/runner/.spark/state/secret.json');
    assert.doesNotMatch(res.error, /\/home\/runner\/\.spark\/state\/secret\.json/);
    assert.match(res.error, /\[REDACTED_PATH\]/);
  });

  await test('falls back to "loop exec failed" when no message', () => {
    const res = buildLoopError('', '');
    assert.equal(res.error, 'loop exec failed');
  });

  await test('original error message prefix is preserved', () => {
    const res = buildLoopError('chip loop failed', 'some detail');
    assert.match(res.error, /^chip loop failed/);
  });
})();
