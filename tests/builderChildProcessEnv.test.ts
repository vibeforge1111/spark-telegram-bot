import assert from 'node:assert/strict';
import { sanitizeBuilderChildProcessEnv } from '../src/builderChildProcessEnv';
import { sanitizeBuilderChildProcessEnv as bridgeExport } from '../src/builderBridge';

async function test(name: string, fn: () => void | Promise<void>): Promise<void> {
  try {
    await fn();
    console.log(`ok - ${name}`);
  } catch (error) {
    console.error(`not ok - ${name}`);
    throw error;
  }
}

async function main(): Promise<void> {
  await test('strips telegram bot tokens from builder child env', () => {
    const sanitized = sanitizeBuilderChildProcessEnv({
      PATH: '/usr/bin',
      BOT_TOKEN: '123:abc',
      TEST_BOT_TOKEN: '456:def',
      TELEGRAM_BOT_TOKEN: '789:ghi',
      SPARK_BUILDER_REPO: '/tmp/builder'
    });

    assert.equal(sanitized.PATH, '/usr/bin');
    assert.equal(sanitized.SPARK_BUILDER_REPO, '/tmp/builder');
    assert.equal(sanitized.BOT_TOKEN, undefined);
    assert.equal(sanitized.TEST_BOT_TOKEN, undefined);
    assert.equal(sanitized.TELEGRAM_BOT_TOKEN, undefined);
  });

  await test('strips tokens merged from builder home env files', () => {
    const sanitized = sanitizeBuilderChildProcessEnv({
      NODE_ENV: 'test',
      BOT_TOKEN: 'from-process',
      TELEGRAM_VOICE_BOT_TOKEN: 'voice-secret'
    });

    assert.equal(sanitized.NODE_ENV, 'test');
    assert.equal(sanitized.BOT_TOKEN, undefined);
    assert.equal(sanitized.TELEGRAM_VOICE_BOT_TOKEN, undefined);
  });

  await test('re-exports sanitizer through builderBridge', () => {
    assert.equal(bridgeExport, sanitizeBuilderChildProcessEnv);
    const sanitized = bridgeExport({ BOT_TOKEN: 'leak', PYTHONPATH: 'src' });
    assert.equal(sanitized.BOT_TOKEN, undefined);
    assert.equal(sanitized.PYTHONPATH, 'src');
  });
}

void main();
