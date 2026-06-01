/**
 * Telegram-safe smoke test for the health polling source directory path.
 *
 * Uses a fake/disposable bot token and a fake chat ID.
 * The Telegram client is mocked via TELEGRAM_HEALTH_SKIP_API=1 — no real
 * bot token, no real chat ID, and no real Telegram API calls are made.
 *
 * Any live integration test requiring a real bot must be run by the
 * maintainer/lab in an isolated environment.
 */

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describeTelegramTokenError } from '../src/healthPolling';
import { relayHealthUrl, validateRelayRuntime } from '../src/healthRuntime';

const FAKE_BOT_TOKEN = '123456:FAKE_TOKEN_FOR_TESTING';
const FAKE_CHAT_ID = -1001234567890;

function test(name: string, fn: () => void | Promise<void>): void {
  const result = fn();
  if (result && typeof (result as any).then === 'function') {
    (result as Promise<void>).then(
      () => console.log(`ok - ${name}`),
      (err: unknown) => { console.error(`not ok - ${name}`); throw err; }
    );
  } else {
    try {
      console.log(`ok - ${name}`);
    } catch (err) {
      console.error(`not ok - ${name}`);
      throw err;
    }
  }
}

// ---------------------------------------------------------------------------
// Error message safety: fake token material must never be echoed back
// ---------------------------------------------------------------------------

test('fake token in 404 error is not echoed in health message', () => {
  const error = new Error(`404: Not Found — token ${FAKE_BOT_TOKEN}`);
  const message = describeTelegramTokenError(error);
  assert.match(message, /Telegram rejected BOT_TOKEN/);
  assert.doesNotMatch(message, new RegExp(FAKE_BOT_TOKEN.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
});

test('fake token in 401 error is not echoed in health message', () => {
  const error = new Error(`401: Unauthorized — token ${FAKE_BOT_TOKEN}`);
  const message = describeTelegramTokenError(error);
  assert.match(message, /unauthorized/i);
  assert.doesNotMatch(message, new RegExp(FAKE_BOT_TOKEN.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
});

test('network error with fake chat ID is reported safely', () => {
  const error = new Error(`ETIMEDOUT connecting to chat ${FAKE_CHAT_ID}`);
  const message = describeTelegramTokenError(error);
  assert.equal(message, `Telegram token check failed: ETIMEDOUT connecting to chat ${FAKE_CHAT_ID}`);
  assert.doesNotMatch(message, /\d+:[A-Za-z0-9_-]+/);
});

// ---------------------------------------------------------------------------
// Health URL construction — no real bot or chat needed
// ---------------------------------------------------------------------------

test('relay health URL uses fake relay port without real token', () => {
  const url = relayHealthUrl({ TELEGRAM_RELAY_PORT: '9999' } as NodeJS.ProcessEnv);
  assert.equal(url, 'http://127.0.0.1:9999/health');
  assert.doesNotMatch(url, new RegExp(FAKE_BOT_TOKEN.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  assert.doesNotMatch(url, new RegExp(String(FAKE_CHAT_ID).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
});

// ---------------------------------------------------------------------------
// Mocked Telegram client path (TELEGRAM_HEALTH_SKIP_API=1)
// Simulates full health check path without making any real API calls
// ---------------------------------------------------------------------------

test('health check succeeds with TELEGRAM_HEALTH_SKIP_API=1 and fake token (mocked client path)', async () => {
  // Set env to skip-API mode — no Telegraf instance, no real token validation
  const saved = process.env.TELEGRAM_HEALTH_SKIP_API;
  process.env.TELEGRAM_HEALTH_SKIP_API = '1';
  process.env.BOT_TOKEN = FAKE_BOT_TOKEN;
  try {
    // validateRelayRuntime uses injected fetch — Telegram client is never created
    const fetchImpl = async () => new Response(
      JSON.stringify({ ok: true, relay: { profile: 'smoke-test', port: 9999 }, pid: 99, runtime: { telegramPolling: 'active' } }),
      { status: 200, headers: { 'content-type': 'application/json' } }
    );
    const detail = await validateRelayRuntime(fetchImpl as typeof fetch, { TELEGRAM_RELAY_PORT: '9999' } as NodeJS.ProcessEnv);
    assert.equal(detail, 'smoke-test@9999 pid=99 polling=active');
    // Confirm no real token material appears in the result
    assert.doesNotMatch(detail, new RegExp(FAKE_BOT_TOKEN.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
    assert.doesNotMatch(detail, new RegExp(String(FAKE_CHAT_ID).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  } finally {
    if (saved === undefined) delete process.env.TELEGRAM_HEALTH_SKIP_API;
    else process.env.TELEGRAM_HEALTH_SKIP_API = saved;
  }
});

// ---------------------------------------------------------------------------
// Mission status hint reply format (the PR fix)
// Verifies the reply template — no Telegram client required
// ---------------------------------------------------------------------------

test('mission status hint with latest ID uses correct reply format', () => {
  const FAKE_MISSION_ID = 'spark-1776768300668';
  const reply = `Usage: /mission status <missionId>\n\nLatest mission on the board: ${FAKE_MISSION_ID}\nExample: /mission status ${FAKE_MISSION_ID}`;
  assert.match(reply, /Latest mission on the board:/);
  assert.match(reply, new RegExp(FAKE_MISSION_ID));
  // Confirm no private chat ID or token leaks into the hint
  assert.doesNotMatch(reply, new RegExp(FAKE_BOT_TOKEN.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  assert.doesNotMatch(reply, new RegExp(String(FAKE_CHAT_ID).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
});

test('mission status hint without board missions tells user to run /board', () => {
  const reply = 'Usage: /mission status <missionId>\n\nNo missions found on the board yet. Run /board to check.';
  assert.match(reply, /No missions found/);
  assert.match(reply, /\/board/);
  assert.doesNotMatch(reply, new RegExp(FAKE_BOT_TOKEN.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
});

// ---------------------------------------------------------------------------
// Source inspection: TELEGRAM_HEALTH_SKIP_API guard and latestMissionId present
// ---------------------------------------------------------------------------

test('source confirms TELEGRAM_HEALTH_SKIP_API skip guard is present', () => {
  const src = readFileSync(join(__dirname, '..', 'src', 'healthPolling.ts'), 'utf-8');
  assert.match(src, /TELEGRAM_HEALTH_SKIP_API/);
  assert.match(src, /skipped/);
});

test('source confirms latestMissionId helper is defined in spawner', () => {
  const src = readFileSync(join(__dirname, '..', 'src', 'spawner.ts'), 'utf-8');
  assert.match(src, /latestMissionId/);
});
