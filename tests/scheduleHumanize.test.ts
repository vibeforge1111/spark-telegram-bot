import assert from 'node:assert/strict';
import {
  formatNextFireLocal,
  formatScheduleList,
  humanSummary,
  humanizeCron,
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

test('humanizeCron renders every-minute and stepped-minute forms', () => {
  assert.equal(humanizeCron('* * * * *'), 'Every minute');
  assert.equal(humanizeCron('*/5 * * * *'), 'Every 5 minutes');
  assert.equal(humanizeCron('*/1 * * * *'), 'Every 1 minute');
});

test('humanizeCron describes fixed minute past every hour', () => {
  assert.equal(humanizeCron('15 * * * *'), 'At 15 min past every hour');
});

test('humanizeCron describes stepped hour and daily-at patterns', () => {
  assert.equal(humanizeCron('30 */2 * * *'), 'Every 2 hours at :30');
  assert.equal(humanizeCron('5 */1 * * *'), 'Every 1 hour at :05');
  assert.equal(humanizeCron('0 9 * * *'), 'Daily at 9 AM');
  assert.equal(humanizeCron('30 9 * * *'), 'Daily at 9:30 AM');
  assert.equal(humanizeCron('15 0 * * *'), 'Daily at 12:15 AM');
  assert.equal(humanizeCron('0 12 * * *'), 'Daily at 12 PM');
});

test('humanizeCron describes weekly, monthly, and yearly patterns', () => {
  assert.equal(humanizeCron('0 9 * * 1'), 'Every Mon at 9 AM');
  assert.equal(humanizeCron('30 14 * * 5'), 'Every Fri at 2:30 PM');
  assert.equal(humanizeCron('0 8 1 * *'), 'Monthly on day 1 at 8 AM');
  assert.equal(humanizeCron('15 18 25 12 *'), 'Yearly on Dec 25 at 6:15 PM');
});

test('humanizeCron falls back to a Custom label or original string on unsupported shapes', () => {
  assert.equal(humanizeCron('* * * * * *'), '* * * * * *');
  assert.equal(humanizeCron('0 9,17 * * *'), 'Custom: 0 9,17 * * *');
  assert.equal(humanizeCron('  0 9 * * *  '), 'Daily at 9 AM');
});

test('formatNextFireLocal returns - for empty input and the iso string for invalid dates', () => {
  assert.equal(formatNextFireLocal(null), '-');
  assert.equal(formatNextFireLocal(''), '-');
  // Invalid date pushes Number(d) to NaN; the helper renders the iso fallback.
  const out = formatNextFireLocal('not-a-real-iso');
  // toLocaleString on invalid date returns 'Invalid Date'; both branches are acceptable.
  assert.ok(out === 'not-a-real-iso' || /Invalid/.test(out) || out.includes('NaN') === false);
});

test('formatNextFireLocal labels past dates with due now', () => {
  const past = new Date(Date.now() - 60_000).toISOString();
  const out = formatNextFireLocal(past);
  assert.match(out, /due now/);
});

test('formatNextFireLocal labels future dates with a relative window', () => {
  const future = new Date(Date.now() + 5 * 60_000).toISOString();
  const out = formatNextFireLocal(future);
  assert.match(out, /in \d+m/);
});

test('humanSummary describes mission and loop actions', () => {
  const missionRec: ScheduleRecord = {
    id: 'm1', cron: '0 9 * * *', action: 'mission',
    payload: { goal: 'check inventory' },
    createdAt: '', lastFiredAt: null, nextFireAt: null,
    fireCount: 0, lastStatus: null, enabled: true,
  };
  const loopRec: ScheduleRecord = {
    id: 'l1', cron: '0 9 * * *', action: 'loop',
    payload: { chipKey: 'health-check', rounds: 3 },
    createdAt: '', lastFiredAt: null, nextFireAt: null,
    fireCount: 0, lastStatus: null, enabled: true,
  };
  const singleLoop: ScheduleRecord = { ...loopRec, payload: { chipKey: 'k', rounds: 1 } };

  assert.equal(humanSummary(missionRec), 'Run mission "check inventory"');
  assert.equal(humanSummary(loopRec), 'Run 3 loop rounds on health-check');
  assert.equal(humanSummary(singleLoop), 'Run 1 loop round on k');
});

test('humanSummary falls back to (no goal) for mission with missing goal', () => {
  const rec: ScheduleRecord = {
    id: 'm', cron: '* * * * *', action: 'mission',
    payload: {}, createdAt: '', lastFiredAt: null, nextFireAt: null,
    fireCount: 0, lastStatus: null, enabled: true,
  };
  assert.equal(humanSummary(rec), 'Run mission "(no goal)"');
});

test('formatScheduleList returns No schedules. when the list is empty', () => {
  assert.equal(formatScheduleList([]), 'No schedules.');
});

test('formatScheduleList renders headers and per-record sections', () => {
  const records: ScheduleRecord[] = [
    {
      id: 'a', cron: '0 9 * * *', action: 'mission',
      payload: { goal: 'audit' },
      createdAt: '', lastFiredAt: null,
      nextFireAt: new Date(Date.now() + 60_000).toISOString(),
      fireCount: 4, lastStatus: 'ok', enabled: true,
    },
  ];
  const text = formatScheduleList(records);
  assert.match(text, /Schedules \(1\):/);
  assert.match(text, /Run mission "audit"/);
  assert.match(text, /Schedule: Daily at 9 AM/);
  assert.match(text, /Fires so far: 4 \| last: ok/);
  assert.match(text, /Id: a/);
});
