import assert from 'node:assert/strict';
import { describeTelegramTokenError } from '../src/healthPolling';
import { relayHealthUrl, validateRelayRuntime } from '../src/healthRuntime';

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

test('builds relay health URL from configured relay port', () => {
  assert.equal(relayHealthUrl({ TELEGRAM_RELAY_PORT: '8789' } as NodeJS.ProcessEnv), 'http://127.0.0.1:8789/health');
  assert.equal(relayHealthUrl({ TELEGRAM_RELAY_PORT: 'not-a-port' } as NodeJS.ProcessEnv), 'http://127.0.0.1:8788/health');
});

test('builds relay health URL from hosted relay callback URL', () => {
  assert.equal(
    relayHealthUrl({ TELEGRAM_RELAY_URL: 'http://spark-telegram-bot.railway.internal:8788/spawner-events' } as NodeJS.ProcessEnv),
    'http://spark-telegram-bot.railway.internal:8788/health'
  );
});

test('validates relay runtime without exposing secrets', async () => {
  const fetchImpl = async () => new Response(
    JSON.stringify({ ok: true, relay: { profile: 'spark-agi', port: 8789 }, pid: 123 }),
    { status: 200, headers: { 'content-type': 'application/json' } }
  );

  const detail = await validateRelayRuntime(fetchImpl as typeof fetch, { TELEGRAM_RELAY_PORT: '8789' } as NodeJS.ProcessEnv);

  assert.equal(detail, 'spark-agi@8789 pid=123');
});

test('explains unreachable relay runtime', async () => {
  const fetchImpl = async () => new Response('missing', { status: 503 });

  await assert.rejects(
    () => validateRelayRuntime(fetchImpl as typeof fetch, { TELEGRAM_RELAY_PORT: '8789' } as NodeJS.ProcessEnv),
    /Telegram relay runtime is not reachable at http:\/\/127\.0\.0\.1:8789\/health: HTTP 503/
  );
});
