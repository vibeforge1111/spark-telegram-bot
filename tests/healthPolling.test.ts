import assert from 'node:assert/strict';
import { describeTelegramTokenError } from '../src/healthPolling';
import { readFileSync } from 'node:fs';
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

test('health wrappers bound Telegram API hangs with a watchdog', () => {
  const runtimeWrapper = readFileSync('scripts/run-health-runtime.cjs', 'utf8');
  const pollingWrapper = readFileSync('scripts/run-health-polling.cjs', 'utf8');

  for (const source of [runtimeWrapper, pollingWrapper]) {
    assert.match(source, /SPARK_TELEGRAM_HEALTH_TIMEOUT_MS/);
    assert.match(source, /timeout:\s*healthTimeoutMs/);
    assert.match(source, /SIGTERM/);
  }
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
  let observedHeaders: HeadersInit | undefined;
  const fetchImpl = async (_url: string | URL | Request, init?: RequestInit) => {
    observedHeaders = init?.headers;
    return new Response(
      JSON.stringify({ ok: true, relay: { profile: 'spark-agi', port: 8789 }, pid: 123, runtime: { telegramPolling: 'active' } }),
      { status: 200, headers: { 'content-type': 'application/json' } }
    );
  };

  const detail = await validateRelayRuntime(fetchImpl as typeof fetch, {
    TELEGRAM_RELAY_PORT: '8789',
    TELEGRAM_RELAY_SECRET: 'relay-health-secret-abcdefghijklmnopqrstuvwxyz'
  } as NodeJS.ProcessEnv);

  assert.equal(detail, 'spark-agi@8789 pid=123 polling=active');
  assert.deepEqual(observedHeaders, {
    'x-spark-telegram-relay-secret': 'relay-health-secret-abcdefghijklmnopqrstuvwxyz'
  });
});

test('rejects relay runtime when Telegram polling reports an error', async () => {
  const fetchImpl = async () => new Response(
    JSON.stringify({
      ok: false,
      relay: { profile: 'spark-agi', port: 8789 },
      pid: 123,
      runtime: {
        telegramPolling: 'error',
        pollingLastErrorAt: '2026-06-29T15:10:00.000Z',
        pollingLastError: 'Telegram token check failed: network timeout'
      }
    }),
    { status: 503, headers: { 'content-type': 'application/json' } }
  );

  await assert.rejects(
    () => validateRelayRuntime(fetchImpl as typeof fetch, { TELEGRAM_RELAY_PORT: '8789' } as NodeJS.ProcessEnv),
    /Telegram relay runtime is not reachable at http:\/\/127\.0\.0\.1:8789\/health: HTTP 503/
  );
});

test('validates relay runtime smoke-disabled polling state', async () => {
  const fetchImpl = async () => new Response(
    JSON.stringify({ ok: true, relay: { profile: 'spark-agi', port: 8789 }, pid: 123, runtime: { telegramPolling: 'disabled' } }),
    { status: 200, headers: { 'content-type': 'application/json' } }
  );

  const detail = await validateRelayRuntime(fetchImpl as typeof fetch, { TELEGRAM_RELAY_PORT: '8789' } as NodeJS.ProcessEnv);

  assert.equal(detail, 'spark-agi@8789 pid=123 polling=disabled');
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

test('health runtime preserves loaded env token while profile secrets are unavailable', () => {
  const source = readFileSync('src/healthRuntime.ts', 'utf8');

  assert.match(
    source,
    /loadSparkTelegramProfileEnv\(process\.argv\.slice\(2\), process\.env, \{ preserveExisting: true \}\)/
  );
});

test('explains unreachable relay runtime', async () => {
  const fetchImpl = async () => new Response('missing', { status: 503 });

  await assert.rejects(
    () => validateRelayRuntime(fetchImpl as typeof fetch, { TELEGRAM_RELAY_PORT: '8789' } as NodeJS.ProcessEnv),
    /Telegram relay runtime is not reachable at http:\/\/127\.0\.0\.1:8789\/health: HTTP 503/
  );
});
