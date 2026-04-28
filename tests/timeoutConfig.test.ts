import assert from 'node:assert/strict';
import {
  DEFAULT_AGENT_TIMEOUT_MS,
  DEFAULT_BUILDER_BRIDGE_TIMEOUT_MS,
  DEFAULT_LOCAL_SERVICE_TIMEOUT_MS,
  builderBridgeTimeoutMs,
  chatCommandTimeoutMs,
  localServiceDefaultTimeoutMs,
  positiveIntegerEnv,
  telegramHandlerTimeoutMs,
} from '../src/timeoutConfig';

function test(name: string, fn: () => void): void {
  try {
    fn();
    console.log(`ok - ${name}`);
  } catch (err) {
    console.error(`not ok - ${name}`);
    throw err;
  }
}

test('agent-facing timeouts default to thirty minutes', () => {
  assert.equal(telegramHandlerTimeoutMs({}), DEFAULT_AGENT_TIMEOUT_MS);
  assert.equal(chatCommandTimeoutMs({}), DEFAULT_AGENT_TIMEOUT_MS);
});

test('bridge and local service timeouts default to longer agent-safe windows', () => {
  assert.equal(builderBridgeTimeoutMs({}), DEFAULT_BUILDER_BRIDGE_TIMEOUT_MS);
  assert.equal(localServiceDefaultTimeoutMs({}), DEFAULT_LOCAL_SERVICE_TIMEOUT_MS);
});

test('timeout env parsing accepts positive integers only', () => {
  assert.equal(positiveIntegerEnv({ TEST_TIMEOUT_MS: '12345' }, 'TEST_TIMEOUT_MS', 99), 12345);
  assert.equal(positiveIntegerEnv({ TEST_TIMEOUT_MS: '0' }, 'TEST_TIMEOUT_MS', 99), 99);
  assert.equal(positiveIntegerEnv({ TEST_TIMEOUT_MS: '-1' }, 'TEST_TIMEOUT_MS', 99), 99);
  assert.equal(positiveIntegerEnv({ TEST_TIMEOUT_MS: 'nope' }, 'TEST_TIMEOUT_MS', 99), 99);
});

test('specific timeout env vars override defaults', () => {
  assert.equal(telegramHandlerTimeoutMs({ SPARK_TELEGRAM_HANDLER_TIMEOUT_MS: '700000' }), 700000);
  assert.equal(chatCommandTimeoutMs({ SPARK_CHAT_COMMAND_TIMEOUT_MS: '800000' }), 800000);
  assert.equal(builderBridgeTimeoutMs({ SPARK_BUILDER_TIMEOUT_MS: '900000' }), 900000);
  assert.equal(localServiceDefaultTimeoutMs({ SPARK_LOCAL_SERVICE_TIMEOUT_MS: '1000000' }), 1000000);
});
