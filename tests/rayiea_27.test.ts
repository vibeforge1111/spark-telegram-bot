import assert from 'node:assert/strict';
import { safeJsonParse } from '../src/safeJson';

function test(name: string, fn: () => void): void {
  try {
    fn();
    console.log(`ok - ${name}`);
  } catch (error) {
    console.error(`not ok - ${name}`);
    throw error;
  }
}

test('rayiea 27 safe json parse fallback', () => {
  assert.deepEqual(safeJsonParse('{not-json', { fallback: true }, 'rayiea-27'), { fallback: true });
});
