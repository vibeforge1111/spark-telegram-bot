import assert from 'node:assert/strict';
import {
  formatNextFireLocal,
  formatScheduleList,
  humanizeCron,
  humanSummary,
  type ScheduleRecord,
} from '../src/schedule';

function test(name: string, fn: () => void): void {
  try {
    fn();
    console.log(`ok - ${name}`);
  } catch (error) {
    console.error(`not ok - ${name}`);
    throw error;
  }
}

test('humanizes supported common cron forms without changing source cron', () => {
  assert.equal(humanizeCron('*/5 * * * *'), 'Every 5 minutes');
  assert.equal(humanizeCron('0 9 * * *'), 'Daily at 9 AM');
  assert.equal(humanizeCron('30 14 * * 1'), 'Every Mon at 2:30 PM');
});

test('does not present out-of-range cron fields as valid schedules', () => {
  assert.equal(humanizeCron('60 * * * *'), 'Custom: 60 * * * *');
  assert.equal(humanizeCron('0 25 * * *'), 'Custom: 0 25 * * *');
  assert.equal(humanizeCron('0 9 * 13 *'), 'Custom: 0 9 * 13 *');
  assert.equal(humanizeCron('0 9 * * 7'), 'Custom: 0 9 * * 7');
});

test('invalid next-fire evidence stays visibly raw instead of inventing relative time', () => {
  assert.equal(formatNextFireLocal('not-a-date'), 'not-a-date');
});

test('renders mission and loop summaries without internal headings', () => {
  const mission = record({ action: 'mission', payload: { goal: 'Review priorities' } });
  const loop = record({ action: 'loop', payload: { chipKey: 'startup-yc', rounds: 2 } });

  assert.equal(humanSummary(mission), 'Run mission "Review priorities"');
  assert.equal(humanSummary(loop), 'Run 2 loop rounds on startup-yc');
  assert.doesNotMatch(formatScheduleList([mission]), /\b(?:Provider|Move|Status):/);
});

function record(overrides: Partial<ScheduleRecord>): ScheduleRecord {
  return {
    id: 'schedule-1',
    cron: '0 9 * * *',
    action: 'mission',
    payload: { goal: 'Review priorities' },
    createdAt: '2026-07-13T00:00:00.000Z',
    lastFiredAt: null,
    nextFireAt: null,
    fireCount: 0,
    lastStatus: null,
    enabled: true,
    ...overrides,
  };
}
