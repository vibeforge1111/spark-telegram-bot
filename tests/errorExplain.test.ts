import assert from 'node:assert/strict';
import { explainSparkError, renderSparkErrorReply } from '../src/errorExplain';

function test(name: string, fn: () => void): void {
  try {
    fn();
    console.log(`ok - ${name}`);
  } catch (err) {
    console.error(`not ok - ${name}`);
    throw err;
  }
}

test('explains provider auth failures with a repair path', () => {
  const reply = renderSparkErrorReply(new Error('Request failed with status code 401: invalid api key'), 'chat', true);

  assert.match(reply, /provider authentication is not working/);
  assert.match(reply, /Check now: Run \/diagnose/);
  assert.match(reply, /spark providers status/);
  assert.match(reply, /spark setup/);
  assert.match(reply, /spark doctor llm "Spark chat failure: provider_auth" --save-report --upstream-report/);
  assert.match(reply, /redacts sensitive data/);
  assert.doesNotMatch(reply, /Try again in a moment/);
});

test('explains local service network failures', () => {
  const explanation = explainSparkError(new Error('ECONNREFUSED 127.0.0.1:3333'), 'spawner');

  assert.equal(explanation.category, 'spawner_offline');
  assert.match(explanation.userLine, /Mission Control is not reachable/);
  assert.match(explanation.check, /Spawner UI is not running/);
  assert.match(explanation.repair, /spark start spawner-ui/);
});

test('explains slow Spawner handoffs separately from offline Spawner', () => {
  const reply = renderSparkErrorReply(new Error('ECONNABORTED - timeout of 10000ms exceeded'), 'spawner', true);

  assert.match(reply, /Mission Control is running too slowly/);
  assert.match(reply, /retry/);
  assert.match(reply, /spark restart spawner-ui/);
  assert.match(reply, /Spark spawner failure: spawner_slow/);
});

test('does not mislabel Telegram handler timeouts as Telegram config', () => {
  const reply = renderSparkErrorReply(new Error('Promise timed out after 90000 milliseconds'), 'telegram', true);

  assert.match(reply, /waited too long/);
  assert.match(reply, /chat, Builder, Spawner, or the local harness/);
  assert.match(reply, /Spark telegram failure: telegram_handler_timeout/);
  assert.doesNotMatch(reply, /Telegram configuration problem/);
});

test('does not mislabel Builder command failures as Telegram config', () => {
  const reply = renderSparkErrorReply(
    new Error('Command failed: C:\\Python313\\python.exe -c import runpy, sys; sys.path.insert(0, sys.argv[1]); sys.argv = ["spark_intelligence.cli", *sys.argv[2:]]; runpy.run_module("spark_intelligence.cli", run_name="__main__") C:\\Users\\USER\\.spark\\modules\\spark-intelligence-builder\\source\\src gateway simulate-telegram-update update.json --home C:\\Users\\USER\\.spark\\state\\spark-intelligence --origin telegram-runtime --json'),
    'telegram',
    true
  );

  assert.match(reply, /Builder memory path/);
  assert.match(reply, /Spark builder failure: builder_or_memory/);
  assert.doesNotMatch(reply, /Telegram configuration problem/);
  assert.doesNotMatch(reply, /Spark telegram failure: telegram_config/);
});

test('explains command timeouts in chat as runtime timeouts', () => {
  const explanation = explainSparkError(new Error('command timed out after 120000ms'), 'chat');

  assert.equal(explanation.category, 'chat_runtime_timeout');
  assert.match(explanation.userLine, /chat runtime timeout/);
  assert.match(explanation.repair, /route this kind of long analysis through a Spawner mission/);
});

test('explains builder memory failures', () => {
  const reply = renderSparkErrorReply(new Error('Builder bridge is required but unavailable'), 'memory', true);

  assert.match(reply, /Builder memory path/);
  assert.match(reply, /Check now: Run \/diagnose/);
  assert.match(reply, /spark fix telegram/);
  assert.match(reply, /spark verify --onboarding/);
});

test('directs provider rate limits to quota or provider switching', () => {
  const explanation = explainSparkError(new Error('HTTP 429: too many requests, quota exceeded'), 'chat');

  assert.equal(explanation.category, 'provider_rate_limit');
  assert.match(explanation.userLine, /rate-limiting/);
  assert.match(explanation.repair, /switch providers/);
});

test('directs duplicate Telegram polling to one live process', () => {
  const reply = renderSparkErrorReply(
    new Error('409 Conflict: terminated by other getUpdates request'),
    'telegram',
    true
  );

  assert.match(reply, /already polling this bot token/);
  assert.match(reply, /stop duplicate bot processes/);
  assert.match(reply, /spark restart spark-telegram-bot/);
});

test('redacts secrets from user-facing errors', () => {
  const tokenFixture = ['1234567890', 'AA' + 'A'.repeat(34)].join(':');
  const reply = renderSparkErrorReply(
    new Error(`BOT_TOKEN=${tokenFixture} failed with sk-live-secret-value`),
    'telegram',
    true
  );

  assert.doesNotMatch(reply, new RegExp(tokenFixture.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  assert.doesNotMatch(reply, /sk-live-secret-value/);
  assert.match(reply, /\[REDACTED\]|\*\*\*/);
});

test('does not offer doctor PR drafting to non-admin users', () => {
  const reply = renderSparkErrorReply(new Error('fetch failed'), 'chat', false);

  assert.match(reply, /Please ask the operator/);
  assert.doesNotMatch(reply, /spark doctor llm/);
  assert.doesNotMatch(reply, /upstream PR draft/);
});
