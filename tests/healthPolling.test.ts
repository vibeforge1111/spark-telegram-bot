import assert from 'node:assert/strict';
import { describeTelegramTokenError } from '../src/healthPolling';

function test(name: string, fn: () => void): void {
  try {
    fn();
    console.log(`ok - ${name}`);
  } catch (error) {
    console.error(`not ok - ${name}`);
    throw error;
  }
}

test('explains rejected Telegram tokens without echoing token material', () => {
  const message = describeTelegramTokenError(new Error('404: Not Found'));

  assert.match(message, /Telegram rejected BOT_TOKEN/);
  assert.match(message, /BotFather/);
  assert.doesNotMatch(message, /\d+:[A-Za-z0-9_-]+/);
});

test('keeps unknown Telegram health failures actionable', () => {
  const message = describeTelegramTokenError(new Error('network timeout'));

  assert.equal(message, 'Telegram token check failed: network timeout');
});
