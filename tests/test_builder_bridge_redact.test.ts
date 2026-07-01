import assert from 'node:assert/strict';
import { redactText } from '../src/redaction';

// builderBridge throws empty-stdout diagnostics errors as
//   `Diagnostics scan returned empty stdout. stderr=${redactText(stderr.trim())}`
// (src/builderBridge.ts). This locks the real redaction behavior those error
// paths depend on, using the production redactText rather than a local copy.
function buildDiagnosticsError(stderr: string): string {
  return `Diagnostics scan returned empty stdout. stderr=${redactText(stderr.trim())}`;
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
  await test('sensitive stderr token is masked in the diagnostics error message', () => {
    const msg = buildDiagnosticsError('ANTHROPIC_API_KEY=sk-ant-abc123def456ghi789jkl internal/path');
    assert.doesNotMatch(msg, /sk-ant-abc123def456ghi789jkl/);
  });

  await test('internal filesystem paths are redacted from the diagnostics error', () => {
    const msg = buildDiagnosticsError('failed reading /home/user/.config/secret-key');
    assert.doesNotMatch(msg, /\/home\/user\/\.config\/secret-key/);
    assert.match(msg, /\[REDACTED_PATH\]/);
  });

  await test('error message preserves the descriptive prefix', () => {
    const msg = buildDiagnosticsError('anything');
    assert.match(msg, /^Diagnostics scan returned empty stdout\./);
  });

  await test('empty stderr produces a clean trailing marker', () => {
    const msg = buildDiagnosticsError('');
    assert.equal(msg, 'Diagnostics scan returned empty stdout. stderr=');
  });

  await test('a short non-secret stderr is left intact', () => {
    const msg = buildDiagnosticsError('exit 1');
    assert.equal(msg, 'Diagnostics scan returned empty stdout. stderr=exit 1');
  });
})();
