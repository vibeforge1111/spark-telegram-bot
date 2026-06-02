import assert from 'node:assert/strict';
import { formatScheduleError, formatScheduleList, type ScheduleRecord } from '../src/schedule';

function test(name: string, fn: () => void): void {
  try {
    fn();
    console.log(`ok - ${name}`);
  } catch (error) {
    console.error(`not ok - ${name}`);
    throw error;
  }
}

test('redacts backend schedule errors before Telegram replies', () => {
  const detail = formatScheduleError(
    'scheduler rejected Authorization: Bearer sk-testplaceholder1234567890',
    'create failed'
  );

  assert.doesNotMatch(detail, /sk-testplaceholder1234567890/);
  assert.match(detail, /Authorization: Bearer/);
});

test('redacts schedule last status in Telegram listings', () => {
  const schedule: ScheduleRecord = {
    id: 'sched_public_1',
    cron: '*/5 * * * *',
    action: 'mission',
    payload: { goal: 'check status' },
    chatId: 'chat_private_1',
    createdAt: '2026-06-02T00:00:00.000Z',
    lastFiredAt: null,
    nextFireAt: null,
    fireCount: 1,
    lastStatus: 'failed with BOT_TOKEN=123456:abcdefghijklmnopqrstuvwxyzABCD',
    enabled: true,
  };

  const listing = formatScheduleList([schedule]);

  assert.doesNotMatch(listing, /123456:abcdefghijklmnopqrstuvwxyzABCD/);
  assert.match(listing, /BOT_TOKEN=/);
});
