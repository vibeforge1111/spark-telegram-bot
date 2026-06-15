import assert from 'node:assert/strict';
import { formatChipLoopExecError } from '../src/chipLoop';

function test(name: string, fn: () => void): void {
  try {
    fn();
    console.log(`ok - ${name}`);
  } catch (err) {
    console.error(`not ok - ${name}`);
    throw err;
  }
}

test('redacts chip loop subprocess messages before returning them to Telegram', () => {
  const detail = formatChipLoopExecError({
    message: 'Command failed: Authorization: Bearer sk-testplaceholder1234567890',
    stderr: 'builder failed BOT_TOKEN=123456:abcdefghijklmnopqrstuvwxyzABCD',
  });

  assert.doesNotMatch(detail, /sk-testplaceholder1234567890/);
  assert.doesNotMatch(detail, /123456:abcdefghijklmnopqrstuvwxyzABCD/);
  assert.match(detail, /Authorization: Bearer/);
  assert.match(detail, /BOT_TOKEN=/);
});
