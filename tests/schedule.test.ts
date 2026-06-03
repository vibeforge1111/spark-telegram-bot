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

function baseRecord(overrides: Partial<ScheduleRecord> = {}): ScheduleRecord {
  return {
    id: 'sched-1',
    cron: '0 9 * * *',
    action: 'mission',
    payload: { goal: 'Daily standup' },
    createdAt: '2026-06-02T00:00:00Z',
    lastFiredAt: null,
    nextFireAt: '2026-06-03T09:00:00Z',
    fireCount: 0,
    lastStatus: null,
    enabled: true,
    ...overrides,
  };
}

test('formatScheduleList shows scheduler-provided timezone alongside the cron summary', () => {
  // The vibeship-spawner-ui scheduler API
  // (src/lib/server/scheduler.ts:49-63) returns a ScheduleRecord with an
  // IANA timezone string. Without this surface in the bot, the operator
  // saw `Daily at 9 AM` rendered in their Telegram local TZ -- giving the
  // false impression the cron fires at 9 AM local when it actually fires
  // at 9 AM in whatever timezone the spawner-ui process evaluated the
  // cron in. With the timezone surfaced, "Daily at 9 AM (Europe/Zurich)"
  // makes the spawner-side evaluation explicit.
  const out = formatScheduleList([baseRecord({ timezone: 'Europe/Zurich' })]);
  assert.match(out, /Schedule: Daily at 9 AM \(Europe\/Zurich\)/);
});

test('formatScheduleList keeps current rendering for legacy records with null timezone', () => {
  // Legacy spawner-ui records and bot-created schedules (which do not yet
  // forward a timezone) come back as null. The renderer must not append
  // a trailing `()` or `(null)` artifact in that case.
  const out = formatScheduleList([baseRecord({ timezone: null })]);
  assert.match(out, /Schedule: Daily at 9 AM\n/);
  assert.doesNotMatch(out, /\(null\)|\(\)/);
});

test('formatScheduleList ignores undefined timezone (back-compat with bot-created records)', () => {
  // The bot's createSchedule does not currently forward a timezone, so
  // some records come back without the field at all. The renderer falls
  // back to the cron-only summary.
  const rec = baseRecord();
  delete (rec as Partial<ScheduleRecord>).timezone;
  const out = formatScheduleList([rec]);
  assert.match(out, /Schedule: Daily at 9 AM\n/);
  assert.doesNotMatch(out, /\(undefined\)|\(\)/);
});
