import assert from 'node:assert/strict';
import { describeTelegramTokenError, formatTelegramPollingHealth } from '../src/healthPolling';
import { readFileSync } from 'node:fs';
import {
  DEFAULT_RELAY_HEALTH_TIMEOUT_MS,
  relayHealthTimeoutMs,
  relayHealthUrl,
  validateRelayRuntime
} from '../src/healthRuntime';
import type { RuntimeBuildIdentity } from '../src/runtimeBuildIdentity';

const TEST_BUILD: RuntimeBuildIdentity = {
  schema: 'spark.telegram.loaded-runtime.v1',
  artifact: 'dist-js-tree',
  sha256: 'a'.repeat(64),
  fileCount: 42,
  loadedAt: '2026-08-07T12:00:00.000Z'
};

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

test('polling health keeps human output by default and offers one structured JSON object', () => {
  const info = {
    status: 'ok' as const,
    botToken: 'accepted (@spark_recursive)',
    ingressMode: 'polling',
    webhookIngress: 'disabled for this launch build' as const,
    relayAuth: 'configured' as const
  };
  assert.match(formatTelegramPollingHealth(info), /Telegram health: OK\nBot token: accepted/);
  assert.deepEqual(JSON.parse(formatTelegramPollingHealth(info, true)), info);
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
  assert.equal(relayHealthUrl({ TELEGRAM_RELAY_PORT: '8789' } as NodeJS.ProcessEnv), 'http://localhost:8789/health');
  assert.equal(relayHealthUrl({ TELEGRAM_RELAY_PORT: 'not-a-port' } as NodeJS.ProcessEnv), 'http://localhost:8788/health');
});

test('gives relay health enough time to cross slow startup boundaries', () => {
  assert.equal(DEFAULT_RELAY_HEALTH_TIMEOUT_MS, 8000);
  assert.equal(relayHealthTimeoutMs({} as NodeJS.ProcessEnv), 8000);
  assert.equal(
    relayHealthTimeoutMs({ SPARK_TELEGRAM_RELAY_HEALTH_TIMEOUT_MS: '12000' } as NodeJS.ProcessEnv),
    12000
  );
  assert.equal(
    relayHealthTimeoutMs({ SPARK_TELEGRAM_RELAY_HEALTH_TIMEOUT_MS: '100' } as NodeJS.ProcessEnv),
    500
  );
  assert.equal(
    relayHealthTimeoutMs({ SPARK_TELEGRAM_RELAY_HEALTH_TIMEOUT_MS: '90000' } as NodeJS.ProcessEnv),
    30000
  );
});

test('builds relay health URL from hosted relay callback URL', () => {
  assert.equal(
    relayHealthUrl({ TELEGRAM_RELAY_URL: 'http://spark-telegram-bot.railway.internal:8788/spawner-events' } as NodeJS.ProcessEnv),
    'http://spark-telegram-bot.railway.internal:8788/health'
  );
  assert.equal(
    relayHealthUrl({ TELEGRAM_RELAY_URL: 'https://relay.example/api/spark/spawner-events?token=hidden#fragment' } as NodeJS.ProcessEnv),
    'https://relay.example/api/spark/health'
  );
});

test('validates relay runtime without exposing secrets', async () => {
  let observedHeaders: RequestInit['headers'];
  const fetchImpl = async (_url: string | URL | Request, init?: RequestInit) => {
    observedHeaders = init?.headers;
    return new Response(
      JSON.stringify({ ok: true, relay: { profile: 'spark-agi', port: 8789 }, pid: 123, build: TEST_BUILD, runtime: { telegramPolling: 'active' } }),
      { status: 200, headers: { 'content-type': 'application/json' } }
    );
  };

  const detail = await validateRelayRuntime(fetchImpl as typeof fetch, {
    TELEGRAM_RELAY_PORT: '8789',
    TELEGRAM_RELAY_SECRET: 'relay-health-secret-abcdefghijklmnopqrstuvwxyz'
  } as NodeJS.ProcessEnv, () => TEST_BUILD);

  assert.equal(detail, 'spark-agi@8789 pid=123 polling=active build=aaaaaaaaaaaa');
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
    JSON.stringify({ ok: true, relay: { profile: 'spark-agi', port: 8789 }, pid: 123, build: TEST_BUILD, runtime: { telegramPolling: 'disabled' } }),
    { status: 200, headers: { 'content-type': 'application/json' } }
  );

  const detail = await validateRelayRuntime(fetchImpl as typeof fetch, { TELEGRAM_RELAY_PORT: '8789' } as NodeJS.ProcessEnv, () => TEST_BUILD);

  assert.equal(detail, 'spark-agi@8789 pid=123 polling=disabled build=aaaaaaaaaaaa');
});

test('rejects a healthy poller that loaded a different runtime tree', async () => {
  const loadedBuild = { ...TEST_BUILD, sha256: 'b'.repeat(64) };
  const fetchImpl = async () => new Response(
    JSON.stringify({ ok: true, relay: { profile: 'spark-agi', port: 8789 }, pid: 123, build: loadedBuild, runtime: { telegramPolling: 'active' } }),
    { status: 200, headers: { 'content-type': 'application/json' } }
  );
  await assert.rejects(
    () => validateRelayRuntime(fetchImpl as typeof fetch, { TELEGRAM_RELAY_PORT: '8789' } as NodeJS.ProcessEnv, () => TEST_BUILD),
    /running Telegram process loaded a different artifact generation/i
  );
});

test('rejects a healthy legacy poller that does not report loaded artifact identity', async () => {
  const fetchImpl = async () => new Response(
    JSON.stringify({ ok: true, relay: { profile: 'spark-agi', port: 8789 }, pid: 123, runtime: { telegramPolling: 'active' } }),
    { status: 200, headers: { 'content-type': 'application/json' } }
  );
  await assert.rejects(
    () => validateRelayRuntime(fetchImpl as typeof fetch, { TELEGRAM_RELAY_PORT: '8789' } as NodeJS.ProcessEnv, () => TEST_BUILD),
    /did not report a valid loaded-artifact identity/i
  );
});

test('rejects a runtime tree that changes while health is being verified', async () => {
  const changedBuild = { ...TEST_BUILD, sha256: 'c'.repeat(64) };
  const observed: RuntimeBuildIdentity[] = [TEST_BUILD, changedBuild];
  const fetchImpl = async () => new Response(
    JSON.stringify({ ok: true, relay: { profile: 'spark-agi', port: 8789 }, pid: 123, build: TEST_BUILD, runtime: { telegramPolling: 'active' } }),
    { status: 200, headers: { 'content-type': 'application/json' } }
  );
  await assert.rejects(
    () => validateRelayRuntime(
      fetchImpl as typeof fetch,
      { TELEGRAM_RELAY_PORT: '8789' } as NodeJS.ProcessEnv,
      () => observed.shift() || changedBuild
    ),
    /changed during health verification/i
  );
});

test('rejects relay runtime before Telegram polling is active', async () => {
  const fetchImpl = async () => new Response(
    JSON.stringify({ ok: true, relay: { profile: 'spark-agi', port: 8789 }, pid: 123, runtime: { telegramPolling: 'starting' } }),
    { status: 200, headers: { 'content-type': 'application/json' } }
  );

  await assert.rejects(
    () => validateRelayRuntime(fetchImpl as typeof fetch, { TELEGRAM_RELAY_PORT: '8789' } as NodeJS.ProcessEnv),
    /Telegram relay runtime is not reachable at http:\/\/localhost:8789\/health: Telegram polling is starting/
  );
});

test('rejects stale relay runtime without Telegram polling status', async () => {
  const fetchImpl = async () => new Response(
    JSON.stringify({ ok: true, relay: { profile: 'spark-agi', port: 8789 }, pid: 123 }),
    { status: 200, headers: { 'content-type': 'application/json' } }
  );

  await assert.rejects(
    () => validateRelayRuntime(fetchImpl as typeof fetch, { TELEGRAM_RELAY_PORT: '8789' } as NodeJS.ProcessEnv),
    /Telegram relay runtime is not reachable at http:\/\/localhost:8789\/health: Telegram polling status is missing/
  );
});

test('health runtime preserves loaded env token while profile secrets are unavailable', () => {
  const source = readFileSync('src/healthRuntime.ts', 'utf8');

  assert.match(
    source,
    /loadSparkTelegramProfileEnv\(args, process\.env, \{ preserveExisting: true \}\)/
  );
  assert.match(source, /args\.includes\('--json'\)/);
  assert.match(source, /output: json \? 'silent' : 'text'/);
});

test('explains unreachable relay runtime', async () => {
  const fetchImpl = async () => new Response('missing', { status: 503 });

  await assert.rejects(
    () => validateRelayRuntime(fetchImpl as typeof fetch, { TELEGRAM_RELAY_PORT: '8789' } as NodeJS.ProcessEnv),
    /Telegram relay runtime is not reachable at http:\/\/localhost:8789\/health: HTTP 503/
  );
});
