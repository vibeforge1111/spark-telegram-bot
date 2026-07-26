import assert from 'node:assert/strict';
import { sanitizeBuilderChildProcessEnv } from '../src/builderBridge';

function test(name: string, fn: () => void): void {
  try {
    fn();
    console.log(`ok - ${name}`);
  } catch (error) {
    console.error(`not ok - ${name}`);
    throw error;
  }
}

test('removes Telegram credential aliases from Builder child environments', () => {
  const sanitized = sanitizeBuilderChildProcessEnv({
    BOT_TOKEN: 'bot',
    TEST_BOT_TOKEN: 'test',
    TELEGRAM_BOT_TOKEN: 'telegram',
    TELEGRAM_RELAY_TOKEN: 'relay',
    SPARK_TELEGRAM_ALT_TOKEN: 'alt',
    SPARK_PROFILE_TOKEN_MISSING: 'missing',
    PATH: '/usr/bin',
    PYTHONPATH: '/workspace/src'
  });

  assert.equal(sanitized.BOT_TOKEN, undefined);
  assert.equal(sanitized.TEST_BOT_TOKEN, undefined);
  assert.equal(sanitized.TELEGRAM_BOT_TOKEN, undefined);
  assert.equal(sanitized.TELEGRAM_RELAY_TOKEN, undefined);
  assert.equal(sanitized.SPARK_TELEGRAM_ALT_TOKEN, undefined);
  assert.equal(sanitized.SPARK_PROFILE_TOKEN_MISSING, undefined);
  assert.equal(sanitized.PATH, '/usr/bin');
  assert.equal(sanitized.PYTHONPATH, '/workspace/src');
});

test('does not mutate the parent environment object', () => {
  const parent = { BOT_TOKEN: 'bot', PATH: '/usr/bin' };
  sanitizeBuilderChildProcessEnv(parent);
  assert.equal(parent.BOT_TOKEN, 'bot');
});
