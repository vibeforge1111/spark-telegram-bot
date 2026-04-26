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
  const explanation = explainSparkError(new Error('ECONNREFUSED 127.0.0.1:5173'), 'spawner');

  assert.equal(explanation.category, 'network_or_service');
  assert.match(explanation.userLine, /local Spark service/);
  assert.match(explanation.check, /mission relay/);
  assert.match(explanation.repair, /spark start spawner-ui/);
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
  const reply = renderSparkErrorReply(
    new Error('BOT_TOKEN=8736683770:AAHP_8S4XEdylUaqOK4yHQscvRPRLk8Km6I failed with sk-live-secret-value'),
    'telegram',
    true
  );

  assert.doesNotMatch(reply, /8736683770:AAHP_8S4XEdylUaqOK4yHQscvRPRLk8Km6I/);
  assert.doesNotMatch(reply, /sk-live-secret-value/);
  assert.match(reply, /\[REDACTED\]|\*\*\*/);
});

test('does not offer doctor PR drafting to non-admin users', () => {
  const reply = renderSparkErrorReply(new Error('fetch failed'), 'chat', false);

  assert.match(reply, /Please ask the operator/);
  assert.doesNotMatch(reply, /spark doctor llm/);
  assert.doesNotMatch(reply, /upstream PR draft/);
});
