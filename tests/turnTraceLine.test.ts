import assert from 'node:assert/strict';
import { buildTurnTraceLineRecord } from '../src/index';

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

test('skips records when no Telegram update id is available', () => {
  assert.equal(buildTurnTraceLineRecord({ chatId: 123456789 }), null);
});
