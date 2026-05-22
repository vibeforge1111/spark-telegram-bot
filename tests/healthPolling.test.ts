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
  const message = describeTelegramTokenError(new Error('unexpected parser failure'));

  assert.equal(message, 'Telegram token check failed: unexpected parser failure');
});

test('explains Telegram network failures without leaking token URLs', () => {
  const message = describeTelegramTokenError(new Error('request to https://api.telegram.org/bot123456:SECRET/getMe failed, reason:'));

  assert.match(message, /could not reach Telegram API/);
  assert.match(message, /network\/proxy\/DNS/);
  assert.doesNotMatch(message, /123456:SECRET/);
  assert.doesNotMatch(message, /api\.telegram\.org\/bot/);
});

test('uses nested network causes while keeping the user-facing repair safe', () => {
  const error = new Error('fetch failed') as Error & { cause?: Error };
  error.cause = new Error('ENOTFOUND api.telegram.org');
  const message = describeTelegramTokenError(error);

  assert.match(message, /could not reach Telegram API/);
  assert.match(message, /do not rotate the bot token/);
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
    JSON.stringify({ ok: true, relay: { profile: 'spark-agi', port: 8789 }, pid: 123, runtime: { telegramPolling: 'active' } }),
    { status: 200, headers: { 'content-type': 'application/json' } }
  );

  const detail = await validateRelayRuntime(fetchImpl as typeof fetch, { TELEGRAM_RELAY_PORT: '8789' } as NodeJS.ProcessEnv);

  assert.equal(detail, 'spark-agi@8789 pid=123 polling=active');
});

test('rejects relay runtime before Telegram polling is active', async () => {
  const fetchImpl = async () => new Response(
    JSON.stringify({ ok: true, relay: { profile: 'spark-agi', port: 8789 }, pid: 123, runtime: { telegramPolling: 'starting' } }),
    { status: 200, headers: { 'content-type': 'application/json' } }
  );

  await assert.rejects(
    () => validateRelayRuntime(fetchImpl as typeof fetch, { TELEGRAM_RELAY_PORT: '8789' } as NodeJS.ProcessEnv),
    /Telegram relay runtime is not reachable at http:\/\/127\.0\.0\.1:8789\/health: Telegram polling is starting/
  );
});

test('rejects stale relay runtime without Telegram polling status', async () => {
  const fetchImpl = async () => new Response(
    JSON.stringify({ ok: true, relay: { profile: 'spark-agi', port: 8789 }, pid: 123 }),
    { status: 200, headers: { 'content-type': 'application/json' } }
  );

  await assert.rejects(
    () => validateRelayRuntime(fetchImpl as typeof fetch, { TELEGRAM_RELAY_PORT: '8789' } as NodeJS.ProcessEnv),
    /Telegram relay runtime is not reachable at http:\/\/127\.0\.0\.1:8789\/health: Telegram polling status is missing/
  );
});

test('explains unreachable relay runtime', async () => {
  const fetchImpl = async () => new Response('missing', { status: 503 });

  await assert.rejects(
    () => validateRelayRuntime(fetchImpl as typeof fetch, { TELEGRAM_RELAY_PORT: '8789' } as NodeJS.ProcessEnv),
    /Telegram relay runtime is not reachable at http:\/\/127\.0\.0\.1:8789\/health: HTTP 503/
  );
});
