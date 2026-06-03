import assert from 'node:assert/strict';
import { compactRuntimeOutputForTests } from '../src/index';

function test(name: string, fn: () => void): void {
  try {
    fn();
    console.log(`ok - ${name}`);
  } catch (error) {
    console.error(`not ok - ${name}`);
    throw error;
  }
}

test('compact runtime output marks line truncation', () => {
  const output = Array.from({ length: 6 }, (_, index) => `line ${index + 1}`).join('\n');

  assert.equal(
    compactRuntimeOutputForTests(output, 3),
    ['line 1', 'line 2', 'line 3', '[truncated]'].join('\n')
  );
});
