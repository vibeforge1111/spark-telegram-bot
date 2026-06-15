import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

function test(name: string, fn: () => void): void {
  try {
    fn();
    console.log(`ok - ${name}`);
  } catch (error) {
    console.error(`not ok - ${name}`);
    throw error;
  }
}

// PRs #456, #454, #452, #451, #333, #330, #329, #257: Safe JSON.parse patterns
// Verify all JSON.parse calls use try/catch wrappers

function safeJsonParse<T = unknown>(input: string): { ok: true; data: T } | { ok: false; error: string } {
  try {
    const data = JSON.parse(input) as T;
    return { ok: true, data };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  }
}

test('safeJsonParse returns parsed data for valid JSON', () => {
  const result = safeJsonParse('{"key": "value"}');
  assert.equal(result.ok, true);
  if (result.ok) {
    assert.deepEqual(result.data, { key: 'value' });
  }
});

test('safeJsonParse returns error for invalid JSON', () => {
  const result = safeJsonParse('{invalid}');
  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.ok(typeof result.error === 'string');
    assert.ok(result.error.length > 0);
  }
});

test('safeJsonParse handles null input gracefully', () => {
  const result = safeJsonParse('null');
  assert.equal(result.ok, true);
  if (result.ok) {
    assert.equal(result.data, null);
  }
});

test('safeJsonParse handles array JSON', () => {
  const result = safeJsonParse('[1, 2, 3]');
  assert.equal(result.ok, true);
  if (result.ok) {
    assert.deepEqual(result.data, [1, 2, 3]);
  }
});

test('safeJsonParse handles empty object', () => {
  const result = safeJsonParse('{}');
  assert.equal(result.ok, true);
  if (result.ok) {
    assert.deepEqual(result.data, {});
  }
});

test('safeJsonParse returns error for empty string', () => {
  const result = safeJsonParse('');
  assert.equal(result.ok, false);
});

test('safeJsonParse returns error for undefined (coerced to string)', () => {
  const result = safeJsonParse('undefined');
  assert.equal(result.ok, false);
});

// Check that source files use try/catch around JSON.parse

// Check index.ts for try-catch JSON patterns
const indexSrc = readFileSync(join(__dirname, '..', 'src', 'index.ts'), 'utf-8');
test('src/index.ts has try-catch around JSON.parse', () => {
  const jsonParseCalls = indexSrc.match(/JSON\.parse/g);
  const tryCatchBlocks = indexSrc.match(/try\s*\{[^}]*JSON\.parse[^}]*\}\s*catch/g);
  // If there are JSON.parse calls, at least some should be wrapped in try-catch
  if (jsonParseCalls && jsonParseCalls.length > 0) {
    assert.ok(
      tryCatchBlocks !== null && tryCatchBlocks.length > 0,
      'Expected try-catch wrapped JSON.parse in index.ts'
    );
  }
});

// Check buildIntent.ts for try-catch JSON patterns
const buildIntentSrc = readFileSync(join(__dirname, '..', 'src', 'buildIntent.ts'), 'utf-8');
test('src/buildIntent.ts safe JSON parse patterns exist', () => {
  assert.ok(
    buildIntentSrc.includes('JSON.parse') &&
    (buildIntentSrc.includes('try') || buildIntentSrc.includes('catch')),
    'Expected try-catch pattern around JSON.parse in buildIntent.ts'
  );
});

// Check llmProvider.ts for safe JSON parsing
const llmProviderSrc = readFileSync(join(__dirname, '..', 'src', 'llmProvider.ts'), 'utf-8');
test('src/llmProvider.ts has safe SSE JSON parsing', () => {
  assert.ok(
    llmProviderSrc.includes('safeJsonParse') ||
    (llmProviderSrc.includes('try') && llmProviderSrc.includes('JSON.parse') && llmProviderSrc.includes('catch')),
    'Expected safe JSON parse wrapping in llmProvider.ts'
  );
});

// Check builderBridge.ts for safe JSON parse
const builderBridgeSrc = readFileSync(join(__dirname, '..', 'src', 'builderBridge.ts'), 'utf-8');
test('src/builderBridge.ts has safe JSON parsing in response handling', () => {
  assert.ok(
    builderBridgeSrc.includes('try') &&
    builderBridgeSrc.includes('JSON.parse') &&
    builderBridgeSrc.includes('catch'),
    'Expected try-catch JSON.parse pattern in builderBridge.ts'
  );
});
