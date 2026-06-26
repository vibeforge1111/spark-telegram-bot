import assert from 'node:assert/strict';
import { redactText } from '../src/redaction';

// Mirrors src/llm.ts: Codex CLI failures throw
//   new Error(redactText(result.stderr || result.stdout || 'Codex CLI failed'))
// Uses the production redactText so the test locks real behavior.
function buildCodexError(stderr: string, stdout: string): string {
  return redactText(stderr || stdout || 'Codex CLI failed');
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
  await test('sensitive secret assignment in stderr is masked', () => {
    const msg = buildCodexError('OPENAI_API_KEY=supersecrettoken1234567890abcd', '');
    assert.doesNotMatch(msg, /supersecrettoken1234567890abcd/);
  });

  await test('internal filesystem path is redacted', () => {
    const msg = buildCodexError('failed at /home/user/.config/secret', '');
    assert.doesNotMatch(msg, /\/home\/user/);
    assert.match(msg, /\[REDACTED_PATH\]/);
  });

  await test('falls back to stdout when stderr empty', () => {
    const msg = buildCodexError('', 'stdout content for the caller');
    assert.equal(msg, 'stdout content for the caller');
  });

  await test('falls back to static message when both empty', () => {
    const msg = buildCodexError('', '');
    assert.equal(msg, 'Codex CLI failed');
  });

  await test('short safe message is left intact', () => {
    const msg = buildCodexError('err', '');
    assert.equal(msg, 'err');
  });
})();
