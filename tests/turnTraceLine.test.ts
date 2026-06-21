import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { buildAnswerComposeTraceContext, buildTurnTraceLineRecord } from '../src/index';

function test(name: string, fn: () => void): void {
  try {
    fn();
    console.log(`ok - ${name}`);
  } catch (error) {
    console.error(`not ok - ${name}`);
    throw error;
  }
}

test('builds a D11-safe turn trace line with SIB trace context', () => {
  const previousSalt = process.env.SPARK_CHAT_REF_SALT;
  process.env.SPARK_CHAT_REF_SALT = 'turn-trace-unit-test';
  try {
    const record = buildTurnTraceLineRecord({
      chatId: 123456789,
      update: { update_id: 987654 },
      traceContext: {
        route: 'plain_chat',
        replyKind: 'builder_reply',
        requestId: 'telegram-update:987654',
        traceRef: 'trace:agent-1:human-1:telegram-update:987654'
      },
      now: new Date('2026-06-10T00:00:00.000Z')
    });

    assert.ok(record);
    assert.equal(record.schema, 'spark.turn_trace.v1');
    assert.equal(record.turn_id, 'telegram-update:987654');
    assert.equal(record.telegram_update_id, 987654);
    assert.match(String(record.chat_ref), /^chat_[a-f0-9]{16}$/);
    assert.notEqual(record.chat_ref, '123456789');
    assert.equal(record.sib_request_id, 'telegram-update:987654');
    assert.equal(record.sib_trace_ref, 'trace:agent-1:human-1:telegram-update:987654');
    assert.deepEqual(record.hops, ['telegram-bot', 'sib-gateway']);
    assert.equal(record.status, 'delivered');
  } finally {
    if (previousSalt === undefined) delete process.env.SPARK_CHAT_REF_SALT;
    else process.env.SPARK_CHAT_REF_SALT = previousSalt;
  }
});

test('turn trace schema covers emitted record keys', () => {
  const schema = JSON.parse(readFileSync('schemas/turn-trace-line.v1.schema.json', 'utf-8'));
  const record = buildTurnTraceLineRecord({
    chatId: 123456789,
    update: { update_id: 987654 },
    traceContext: {
      route: 'plain_chat',
      replyKind: 'builder_reply',
      requestId: 'telegram-update:987654',
      traceRef: 'trace:agent-1:human-1:telegram-update:987654'
    },
    now: new Date('2026-06-10T00:00:00.000Z')
  });

  assert.ok(record);
  for (const key of Object.keys(record)) {
    assert.ok(schema.properties[key], `schema is missing emitted key ${key}`);
  }
  for (const key of schema.required) {
    assert.ok(Object.prototype.hasOwnProperty.call(record, key), `record is missing required schema key ${key}`);
  }
  assert.equal(schema.properties.schema.const, 'spark.turn_trace.v1');
});

test('read-only state trace context records route and reply kind without SIB ids', () => {
  const record = buildTurnTraceLineRecord({
    chatId: 123456789,
    update: { update_id: 987654 },
    traceContext: {
      route: 'spark.read_only_state.provider_runtime_config',
      command: 'read_only_state',
      replyKind: 'read_only_state'
    },
    now: new Date('2026-06-16T00:00:00.000Z')
  });

  assert.ok(record);
  assert.equal(record.turn_id, 'telegram-update:987654');
  assert.equal(record.telegram_update_id, 987654);
  assert.equal(record.route, 'spark.read_only_state.provider_runtime_config');
  assert.equal(record.reply_kind, 'read_only_state');
  assert.equal(record.sib_request_id, null);
  assert.equal(record.sib_trace_ref, null);
  assert.deepEqual(record.hops, ['telegram-bot']);
});

test('answer-compose trace context stamps route and reply kind from Telegram update', () => {
  const traceContext = buildAnswerComposeTraceContext(
    { update_id: 765432 },
    'conversation.no_pending_confirmation',
    'plain_chat.no_pending_confirmation'
  );

  const record = buildTurnTraceLineRecord({
    chatId: 123456789,
    update: { update_id: 765432 },
    traceContext,
    now: new Date('2026-06-21T00:00:00.000Z')
  });

  assert.ok(record);
  assert.equal(record.turn_id, 'telegram-update:765432');
  assert.equal(record.telegram_update_id, 765432);
  assert.equal(record.route, 'conversation.no_pending_confirmation');
  assert.equal(record.reply_kind, 'plain_chat.no_pending_confirmation');
  assert.equal(record.sib_request_id, null);
  assert.equal(record.sib_trace_ref, null);
  assert.deepEqual(record.hops, ['telegram-bot']);
});

test('answer-compose trace context covers source-attributed action boundary replies', () => {
  const traceContext = buildAnswerComposeTraceContext(
    { update_id: 765433 },
    'conversation.source_attributed_action_boundary',
    'plain_chat.source_attributed_action_boundary'
  );

  const record = buildTurnTraceLineRecord({
    chatId: 123456789,
    update: { update_id: 765433 },
    traceContext,
    now: new Date('2026-06-21T00:01:00.000Z')
  });

  assert.ok(record);
  assert.equal(record.turn_id, 'telegram-update:765433');
  assert.equal(record.telegram_update_id, 765433);
  assert.equal(record.route, 'conversation.source_attributed_action_boundary');
  assert.equal(record.reply_kind, 'plain_chat.source_attributed_action_boundary');
  assert.deepEqual(record.hops, ['telegram-bot']);
});

test('answer-compose trace context covers local chat fallback replies', () => {
  const traceContext = buildAnswerComposeTraceContext(
    { update_id: 765434 },
    'plain_chat',
    'plain_chat.local_llm'
  );

  const record = buildTurnTraceLineRecord({
    chatId: 123456789,
    update: { update_id: 765434 },
    traceContext,
    now: new Date('2026-06-21T00:02:00.000Z')
  });

  assert.ok(record);
  assert.equal(record.turn_id, 'telegram-update:765434');
  assert.equal(record.telegram_update_id, 765434);
  assert.equal(record.route, 'plain_chat');
  assert.equal(record.reply_kind, 'plain_chat.local_llm');
  assert.deepEqual(record.hops, ['telegram-bot']);
});

test('skips records when no Telegram update id is available', () => {
  assert.equal(buildTurnTraceLineRecord({ chatId: 123456789 }), null);
});
