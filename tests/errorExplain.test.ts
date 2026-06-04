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

test('classifies OpenRouter 402 token limit errors as provider context limits', () => {
  const explanation = explainSparkError(
    new Error('HTTP 402 - Prompt tokens limit exceeded: 9124 > 6401. To increase, visit https://openrouter.ai/settings/credits and upgrade to a paid account - ERR_BAD_REQUEST - Request failed with status code 402'),
    'chat'
  );

  assert.equal(explanation.category, 'provider_context_limit');
  assert.match(explanation.userLine, /prompt is too large/);
  assert.match(explanation.check, /shorter message|provider plan limits/);
  assert.match(explanation.repair, /larger context window|provider credits/);
});

test('renders OpenRouter 402 token limit errors without auth repair commands', () => {
  const reply = renderSparkErrorReply(
    new Error('HTTP 402 - Prompt tokens limit exceeded: 9124 > 6401. To increase, visit https://openrouter.ai/settings/credits and upgrade to a paid account - ERR_BAD_REQUEST - Request failed with status code 402'),
    'chat',
    true
  );

  assert.match(reply, /context is too large|model limit/);
  assert.match(reply, /shorter message|larger-context model|provider limits/);
  assert.doesNotMatch(reply, /provider authentication is not working/);
  assert.doesNotMatch(reply, /provider_auth/);
  assert.doesNotMatch(reply, /openrouter\.ai|Prompt tokens limit exceeded|9124|6401|ERR_BAD_REQUEST|402/);
  assert.doesNotMatch(reply, /spark providers status|spark setup|spark doctor llm|save-report|upstream-report/);
});

test('explains local service network failures', () => {
  const explanation = explainSparkError(new Error('ECONNREFUSED 127.0.0.1:3333'), 'spawner');

  assert.equal(explanation.category, 'spawner_offline');
  assert.match(explanation.userLine, /Mission Control is not reachable/);
  assert.match(explanation.check, /Spawner UI is not running/);
  assert.match(explanation.repair, /spark start spawner-ui/);
});

test('labels plain Spawner connect failures as unreachable instead of unknown mission failure', () => {
  const reply = renderSparkErrorReply(new Error('Failed to connect to 127.0.0.1 port 3333'), 'spawner', true);

  assert.match(reply, /Mission Control.*(?:not reachable|could not reach)|Spark could not reach Mission Control/i);
  assert.match(reply, /spark start spawner-ui|spark verify --onboarding/);
  assert.doesNotMatch(reply, /mission failed/i);
  assert.doesNotMatch(reply, /unknown error/i);
});

test('explains slow Spawner handoffs separately from offline Spawner', () => {
  const reply = renderSparkErrorReply(new Error('ECONNABORTED - timeout of 10000ms exceeded'), 'spawner', true);

  assert.match(reply, /Mission Control is running too slowly/);
  assert.match(reply, /retry/);
  assert.match(reply, /spark restart spawner-ui/);
  assert.match(reply, /Spark spawner failure: spawner_slow/);
});

test('explains read-only execution as runner capability, not access permission', () => {
  const reply = renderSparkErrorReply(new Error('Operation not permitted: workspace is read-only and apply_patch rejected writes'), 'mission', true);

  assert.match(reply, /runner|workspace|writable route|write/i);
  assert.match(reply, /read-only|cannot write|blocked/i);
  assert.doesNotMatch(reply, /Access Level/i);
  assert.doesNotMatch(reply, /provider authentication/i);
  assert.doesNotMatch(reply, /Telegram configuration problem/i);
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
  assert.match(reply, /Builder bridge command did not finish cleanly/);
  assert.match(reply, /Spark builder failure: builder_or_memory/);
  assert.doesNotMatch(reply, /Telegram configuration problem/);
  assert.doesNotMatch(reply, /Spark telegram failure: telegram_config/);
  assert.doesNotMatch(reply, /runpy|spark_intelligence\.cli|simulate-telegram-update|Command failed/);
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

test('keeps conversational builder memory failures out of diagnostic mode', () => {
  const reply = renderSparkErrorReply(
    new Error('Command failed: python -m spark_intelligence.cli gateway simulate-telegram-update'),
    'chat',
    true
  );

  assert.match(reply, /visible chat/);
  assert.match(reply, /Run \/diagnose only when you want a health check/);
  assert.doesNotMatch(reply, /Spark could not reach the Builder memory path/);
  assert.doesNotMatch(reply, /spark fix telegram|spark doctor llm|upstream PR draft/);
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
  assert.match(reply, /same BotFather token/);
  assert.match(reply, /stop the other poller or rotate the BotFather token/);
  assert.doesNotMatch(reply, /Builder memory path/);
  assert.doesNotMatch(reply, /provider authentication/);
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
