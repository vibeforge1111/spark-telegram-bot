import assert from 'node:assert/strict';
import { parseScheduleDeleteIntent } from '../src/index';

function test(name: string, fn: () => void): void {
  try {
    fn();
    console.log(`ok - ${name}`);
  } catch (error) {
    console.error(`not ok - ${name}`);
    throw error;
  }
}

test('schedule delete parser prefers schedule-shaped ids in natural polite text', () => {
  assert.equal(
    parseScheduleDeleteIntent('Please delete schedule sched-f9b5d85a.'),
    'sched-f9b5d85a'
  );
});

test('schedule delete parser skips filler command words before fallback ids', () => {
  assert.equal(
    parseScheduleDeleteIntent('please remove scheduled job abc12345'),
    'abc12345'
  );
});
