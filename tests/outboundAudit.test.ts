import assert from 'node:assert/strict';
import {
  buildFinalAnswerGateSuppressionRecord,
  buildNodeOutboundAuditRecord,
  buildTurnTraceLineRecord
} from '../src/index';

function test(name: string, fn: () => void): void {
  try {
    fn();
    console.log(`ok - ${name}`);
  } catch (error) {
    console.error(`not ok - ${name}`);
    throw error;
  }
}

test('outbound audit records include Telegram turn identifiers from update metadata', () => {
  const record = buildNodeOutboundAuditRecord(
    12345,
    'hello',
    new Date('2026-06-15T00:00:00.000Z'),
    null,
    { update_id: 749543999 }
  );

  assert.equal(record.turn_id, 'telegram-update:749543999');
  assert.equal(record.telegram_update_id, 749543999);
  assert.equal(record.event, 'telegram_node_delivered');
  assert.equal(record.schema_version, 'spark.node_outbound_audit.v1');
});

test('outbound audit records include mission ids from trace context', () => {
  const record = buildNodeOutboundAuditRecord(
    12345,
    'mission complete',
    new Date('2026-06-15T00:00:00.000Z'),
    {
      route: 'mission_relay',
      command: 'mission_relay',
      replyKind: 'mission_completion',
      requestId: 'tg-build-audit-proof',
      traceRef: 'trace:spawner-prd:mission-audit-proof',
      missionId: 'mission-audit-proof'
    }
  );

  assert.equal(record.mission_id, 'mission-audit-proof');
  assert.equal(record.request_id, 'tg-build-audit-proof');
  assert.equal(record.trace_ref, 'trace:spawner-prd:mission-audit-proof');
  assert.equal(record.legacy_audit_ref, undefined);
});

test('outbound audit records add redacted legacy refs for machine-origin deliveries without turn ids', () => {
  const record = buildNodeOutboundAuditRecord(
    12345,
    'machine-origin delivery without a Telegram update',
    new Date('2026-06-15T00:00:00.000Z')
  );

  assert.match(String(record.legacy_audit_ref), /^node-outbound:[a-f0-9]{16}$/);
  assert.equal(record.turn_id, undefined);
  assert.equal(record.telegram_update_id, undefined);
  assert.equal(JSON.stringify(record).includes('machine-origin delivery'), false);
});

test('turn trace records keep chat ids redacted and joinable by update id', () => {
  const record = buildTurnTraceLineRecord({
    chatId: 12345,
    update: { update_id: 749544000 },
    now: new Date('2026-06-15T00:00:00.000Z')
  });

  assert.equal(record?.turn_id, 'telegram-update:749544000');
  assert.equal(record?.telegram_update_id, 749544000);
  assert.match(String(record?.chat_ref), /^chat_[a-f0-9]{16}$/);
  assert.notEqual(record?.chat_ref, '12345');
});

test('suppressed final-answer audits include Telegram turn identifiers from update metadata', () => {
  const record = buildFinalAnswerGateSuppressionRecord({
    chatId: 12345,
    userId: 67890,
    update: { update_id: 749544001 },
    suppressionReason: 'plain_chat_suppression',
    builderRoutingDecision: 'tool_result',
    builderBridgeMode: 'test',
    builderReply: 'Suppressed builder reply',
    fallbackRoute: 'local_chat'
  }, new Date('2026-06-15T00:00:00.000Z'));

  assert.equal(record.turn_id, 'telegram-update:749544001');
  assert.equal(record.telegram_update_id, 749544001);
  assert.equal(record.outcome, 'suppressed_builder_reply');
});
