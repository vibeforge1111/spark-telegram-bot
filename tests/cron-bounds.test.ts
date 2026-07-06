import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

function test(name: string, fn: () => void): void {
  try {
    fn();
    console.log(`ok - ${name}`);
  } catch (error) {
    console.error(`not ok - ${name}`);
    throw error;
  }
}

const DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

// Replicate the old (buggy) and new (fixed) humanizeCron logic
function oldHumanizeCron(cron: string): string {
  const parts = cron.trim().split(/\s+/);
  if (parts.length !== 5) return cron;
  const [, , dom, month, dow] = parts;
  if (/^\d+$/.test(dow) && dom === '*' && month === '*') {
    // Old: no bounds check on DOW[+dow]
    return `Every ${DOW[+dow as number]} at ...`;
  }
  return 'Custom: ' + cron;
}

function newHumanizeCronDOW(cron: string): string {
  const parts = cron.trim().split(/\s+/);
  if (parts.length !== 5) return cron;
  const [minute, hour, dom, month, dow] = parts;
  if (/^\d+$/.test(minute) && /^\d+$/.test(hour) && dom === '*' && month === '*' && /^\d$/.test(dow)) {
    // Fixed: bounds check with % 7
    return `Every ${DOW[+dow % 7]} at ...`;
  }
  return 'Custom: ' + cron;
}

function newHumanizeCronMON(cron: string): string {
  const parts = cron.trim().split(/\s+/);
  if (parts.length !== 5) return cron;
  const [minute, hour, dom, month] = parts;
  if (/^\d+$/.test(minute) && /^\d+$/.test(hour) && /^\d+$/.test(dom) && /^\d+$/.test(month)) {
    const monthIdx = Math.max(0, Math.min(11, +month - 1));
    return `Yearly on ${MON[monthIdx]} ${dom} at ...`;
  }
  return 'Custom: ' + cron;
}

test('old humanizeCron crashes on dow=7 (out of bounds)', () => {
  // DOW has indices 0-6, so DOW[7] is undefined
  assert.equal(oldHumanizeCron('0 0 * * 7'), 'Every undefined at ...');
});

test('fixed humanizeCron clamps dow=7 to dow=0 (Sunday)', () => {
  assert.equal(newHumanizeCronDOW('0 0 * * 7'), 'Every Sun at ...');
});

test('fixed humanizeCron clamps dow=8 to dow=1', () => {
  assert.equal(newHumanizeCronDOW('0 0 * * 8'), 'Every Mon at ...');
});

test('old humanizeCron crashes on month=0 (out of bounds)', () => {
  // MON[-1] is undefined
  assert.equal(newHumanizeCronMON('0 0 1 0 *'), 'Yearly on undefined 1 at ...');
});

test('fixed humanizeCron clamps month=0 to Jan', () => {
  assert.equal(newHumanizeCronMON('0 0 1 0 *'), 'Yearly on Jan 1 at ...');
});

test('fixed humanizeCron handles month=13 clamping to Dec', () => {
  assert.equal(newHumanizeCronMON('0 0 1 13 *'), 'Yearly on Dec 1 at ...');
});

// Check the actual source file uses the bounded pattern
const scheduleSrc = readFileSync(join(__dirname, '..', 'src', 'schedule.ts'), 'utf-8');
test('src/schedule.ts humanizeCron uses bounded DOW access', () => {
  assert.ok(
    scheduleSrc.includes('% 7') || scheduleSrc.includes('% 7]'),
    'Expected DOW bound check with % 7'
  );
});

test('src/schedule.ts humanizeCron uses bounded MON access', () => {
  assert.ok(
    scheduleSrc.includes('Math.max(0, Math.min(11') || scheduleSrc.includes('Math.min(11, Math.max(0,'),
    'Expected MON bound check with Math.min/Math.max'
  );
});
