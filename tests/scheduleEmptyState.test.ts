import assert from 'node:assert/strict';
import { formatScheduleList, type ScheduleRecord } from '../src/schedule';

function test(name: string, fn: () => void): void {
  try {
    fn();
    console.log(`ok - ${name}`);
  } catch (error) {
    console.error(`not ok - ${name}`);
    throw error;
  }
}

test('empty schedule list gives accurate cron-first next steps', () => {
  const reply = formatScheduleList([]);

  assert.match(reply, /No schedules yet\./);
  assert.match(reply, /^\/schedule "<cron>" mission <goal>$/m);
  assert.match(reply, /^\/schedule "<cron>" loop <chipKey> \[rounds\]$/m);
  assert.doesNotMatch(reply, /\/schedule mission <cron>/);
  assert.doesNotMatch(reply, /\b(?:Mission|Provider|Move|Status):/);
});

test('non-empty schedule rendering remains unchanged', () => {
  const schedule: ScheduleRecord = {
    id: 'schedule-1',
    cron: '0 9 * * *',
    action: 'mission',
    payload: { goal: 'Review today\'s priorities' },
    createdAt: '2026-07-13T00:00:00.000Z',
    lastFiredAt: null,
    nextFireAt: null,
    fireCount: 0,
    lastStatus: null,
    enabled: true,
  };

  const reply = formatScheduleList([schedule]);

  assert.match(reply, /^Schedules \(1\):/);
  assert.match(reply, /Run mission "Review today's priorities"/);
  assert.doesNotMatch(reply, /No schedules yet|Add one with/);
});
