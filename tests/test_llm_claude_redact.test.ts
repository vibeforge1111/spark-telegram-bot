import assert from 'node:assert/strict';
import { redactText } from '../src/redaction';

// Mirrors src/llm.ts: Claude CLI failures throw
//   new Error(redactText(result.stderr || result.stdout || 'Claude CLI failed'))
// Uses the production redactText so the test locks real behavior.
function buildClaudeError(stderr: string, stdout: string): string {
  return redactText(stderr || stdout || 'Claude CLI failed');
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
  await test('sensitive API key in stderr is masked', () => {
    const msg = buildClaudeError('ANTHROPIC_API_KEY=sk-ant-abc123def456ghi789jkl', '');
    assert.doesNotMatch(msg, /sk-ant-abc123def456ghi789jkl/);
  });

  await test('internal filesystem path is redacted', () => {
    const msg = buildClaudeError('failed at /home/user/.config/claude-api-key', '');
    assert.doesNotMatch(msg, /\/home\/user\/\.config\/claude-api-key/);
    assert.match(msg, /\[REDACTED_PATH\]/);
  });

  await test('falls back to stdout when stderr empty', () => {
    const msg = buildClaudeError('', 'partial output for the user');
    assert.equal(msg, 'partial output for the user');
  });

  await test('falls back to static message when both empty', () => {
    const msg = buildClaudeError('', '');
    assert.equal(msg, 'Claude CLI failed');
  });

  await test('short safe message is left intact', () => {
    const msg = buildClaudeError('err', '');
    assert.equal(msg, 'err');
  });
})();
