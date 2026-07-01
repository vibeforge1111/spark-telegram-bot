import assert from 'node:assert/strict';
import {
  DEFAULT_TELEGRAM_POLLING_RETRY_MS,
  isRecoverableTelegramStartupError,
  telegramPollingRetryDelayMs,
  telegramStartupErrorMessage
} from '../src/telegramPollingStartup';

function test(name: string, fn: () => void): void {
  try {
    fn();
    console.log(`ok - ${name}`);
  } catch (error) {
    console.error(`not ok - ${name}`);
    throw error;
  }
}

test('treats Telegram transport timeouts as recoverable startup failures', () => {
  assert.equal(
    isRecoverableTelegramStartupError(new Error('request to https://api.telegram.org/getWebhookInfo failed, reason: connect ETIMEDOUT 149.154.166.110:443')),
    true
  );
  assert.equal(isRecoverableTelegramStartupError(new Error('socket hang up')), true);
  assert.equal(isRecoverableTelegramStartupError(new Error('502 Bad Gateway')), true);
});

test('does not retry invalid credentials or duplicate polling conflicts', () => {
  assert.equal(isRecoverableTelegramStartupError(new Error('401 Unauthorized')), false);
  assert.equal(isRecoverableTelegramStartupError(new Error('404 Not Found')), false);
  assert.equal(isRecoverableTelegramStartupError(new Error('Conflict: terminated by other getUpdates request')), false);
});

test('bounds Telegram polling retry delay from env', () => {
  assert.equal(telegramPollingRetryDelayMs({} as NodeJS.ProcessEnv), DEFAULT_TELEGRAM_POLLING_RETRY_MS);
  assert.equal(telegramPollingRetryDelayMs({ TELEGRAM_POLLING_RETRY_MS: '250' } as NodeJS.ProcessEnv), 1000);
  assert.equal(telegramPollingRetryDelayMs({ TELEGRAM_POLLING_RETRY_MS: '150000' } as NodeJS.ProcessEnv), 120000);
  assert.equal(telegramPollingRetryDelayMs({ TELEGRAM_POLLING_RETRY_MS: '5000' } as NodeJS.ProcessEnv), 5000);
});

test('formats unknown startup errors without throwing', () => {
  assert.equal(telegramStartupErrorMessage(null), 'unknown error');
});
