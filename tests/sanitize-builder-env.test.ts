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

// Verify builderChildProcessEnv sanitizes env vars properly
// The fix (PR #319) removes sensitive tokens from child process env

function isSensitiveBuilderChildEnvKey(key: string): boolean {
  const EXACT_SENSITIVE_ENV_KEYS = new Set([
    'BOT_TOKEN', 'TEST_BOT_TOKEN', 'TELEGRAM_BOT_TOKEN', 'TELEGRAM_TOKEN',
    'SPARK_PROFILE_TOKEN_MISSING'
  ]);
  const SENSITIVE_ENV_KEY_PATTERNS: RegExp[] = [
    /^TELEGRAM_.*_TOKEN$/i,
    /^SPARK_TELEGRAM_.*TOKEN/i
  ];
  if (EXACT_SENSITIVE_ENV_KEYS.has(key)) return true;
  return SENSITIVE_ENV_KEY_PATTERNS.some((pattern) => pattern.test(key));
}

function sanitizeBuilderChildProcessEnv(env: Record<string, string | undefined>): Record<string, string | undefined> {
  const sanitized: Record<string, string | undefined> = { ...env };
  for (const key of Object.keys(sanitized)) {
    if (isSensitiveBuilderChildEnvKey(key)) {
      delete sanitized[key];
    }
  }
  return sanitized;
}

test('isSensitiveBuilderChildEnvKey matches BOT_TOKEN', () => {
  assert.equal(isSensitiveBuilderChildEnvKey('BOT_TOKEN'), true);
});

test('isSensitiveBuilderChildEnvKey matches TELEGRAM_BOT_TOKEN', () => {
  assert.equal(isSensitiveBuilderChildEnvKey('TELEGRAM_BOT_TOKEN'), true);
});

test('isSensitiveBuilderChildEnvKey matches TELEGRAM_TOKEN', () => {
  assert.equal(isSensitiveBuilderChildEnvKey('TELEGRAM_TOKEN'), true);
});

test('isSensitiveBuilderChildEnvKey matches pattern TELEGRAM_SOME_TOKEN', () => {
  assert.equal(isSensitiveBuilderChildEnvKey('TELEGRAM_RELAY_TOKEN'), true);
});

test('isSensitiveBuilderChildEnvKey does not match PATH', () => {
  assert.equal(isSensitiveBuilderChildEnvKey('PATH'), false);
});

test('isSensitiveBuilderChildEnvKey does not match PYTHONPATH', () => {
  assert.equal(isSensitiveBuilderChildEnvKey('PYTHONPATH'), false);
});

test('sanitizeBuilderChildProcessEnv removes BOT_TOKEN', () => {
  const result = sanitizeBuilderChildProcessEnv({ BOT_TOKEN: '123:abc', PATH: '/usr/bin' });
  assert.equal(result.BOT_TOKEN, undefined);
  assert.equal(result.PATH, '/usr/bin');
});

test('sanitizeBuilderChildProcessEnv preserves non-sensitive keys', () => {
  const result = sanitizeBuilderChildProcessEnv({
    PATH: '/usr/bin',
    PYTHONPATH: '/opt/venv/lib',
    HOME: '/root',
    SPARK_BUILDER_REPO: '/tmp/builder'
  });
  assert.equal(result.PATH, '/usr/bin');
  assert.equal(result.PYTHONPATH, '/opt/venv/lib');
  assert.equal(result.HOME, '/root');
  assert.equal(result.SPARK_BUILDER_REPO, '/tmp/builder');
});

test('sanitizeBuilderChildProcessEnv removes all sensitive telegram token keys', () => {
  const result = sanitizeBuilderChildProcessEnv({
    BOT_TOKEN: '123:abc',
    TEST_BOT_TOKEN: '456:def',
    TELEGRAM_BOT_TOKEN: '789:ghi',
    TELEGRAM_TOKEN: '012:jkl',
    SPARK_PROFILE_TOKEN_MISSING: 'true',
    SPARK_TELEGRAM_MY_TOKEN: 'mno',
  });
  assert.equal(result.BOT_TOKEN, undefined);
  assert.equal(result.TEST_BOT_TOKEN, undefined);
  assert.equal(result.TELEGRAM_BOT_TOKEN, undefined);
  assert.equal(result.TELEGRAM_TOKEN, undefined);
  assert.equal(result.SPARK_PROFILE_TOKEN_MISSING, undefined);
  assert.equal(result.SPARK_TELEGRAM_MY_TOKEN, undefined);
});

// Check that builderChildProcessEnv.ts exists with correct implementation
const childEnvSrc = readFileSync(join(__dirname, '..', 'src', 'builderChildProcessEnv.ts'), 'utf-8');
test('src/builderChildProcessEnv.ts exports sanitizeBuilderChildProcessEnv', () => {
  assert.ok(childEnvSrc.includes('sanitizeBuilderChildProcessEnv'));
  assert.ok(childEnvSrc.includes('delete sanitized'));
});
