import assert from 'node:assert/strict';
import { requireRelaySecret, resolveTelegramLaunchConfig } from '../src/launchMode';

function env(overrides: Record<string, string | undefined> = {}): NodeJS.ProcessEnv {
  return { ...overrides };
}

function test(name: string, fn: () => void): void {
  try {
    fn();
    console.log(`ok - ${name}`);
  } catch (error) {
    console.error(`not ok - ${name}`);
    throw error;
  }
}

test('defaults to long polling when no gateway mode is set', () => {
  assert.deepEqual(resolveTelegramLaunchConfig(env()), { mode: 'polling' });
});

test('treats legacy auto mode as polling for launch compatibility', () => {
  assert.deepEqual(resolveTelegramLaunchConfig(env({ TELEGRAM_GATEWAY_MODE: 'auto' })), { mode: 'polling' });
});

test('refuses webhook mode in the launch build', () => {
  assert.throws(
    () => resolveTelegramLaunchConfig(env({ TELEGRAM_GATEWAY_MODE: 'webhook' })),
    /Webhook mode is disabled/
  );
});

test('refuses webhook env even when polling is requested', () => {
  assert.throws(
    () => resolveTelegramLaunchConfig(env({
      TELEGRAM_GATEWAY_MODE: 'polling',
      TELEGRAM_WEBHOOK_URL: 'https://example.com/telegram'
    })),
    /Webhook env is disabled/
  );
});

test('requires a strong local relay secret', () => {
  assert.equal(requireRelaySecret(env({ TELEGRAM_RELAY_SECRET: 'abcdefghijklmnopqrstuvwxyz_123456' })), 'abcdefghijklmnopqrstuvwxyz_123456');
  assert.throws(() => requireRelaySecret(env()), /TELEGRAM_RELAY_SECRET is required/);
  assert.throws(() => requireRelaySecret(env({ TELEGRAM_RELAY_SECRET: 'short' })), /24-256/);
  assert.throws(() => requireRelaySecret(env({ TELEGRAM_RELAY_SECRET: 'bad secret with spaces and enough length' })), /may only contain/);
});
