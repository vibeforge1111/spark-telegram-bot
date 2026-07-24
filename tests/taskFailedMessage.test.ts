import assert from 'node:assert/strict';
import { renderTaskFailureBody } from '../src/missionRelay';

function test(name: string, fn: () => void): void {
  try {
    fn();
    console.log(`ok - ${name}`);
  } catch (error) {
    console.error(`not ok - ${name}`);
    throw error;
  }
}

test('turns unknown task failure into a bounded recovery path', () => {
  const output = renderTaskFailureBody('unknown error', 'mission-abc-123');
  assert.match(output, /did not return a usable failure reason/i);
  assert.match(output, /\/run/);
  assert.match(output, /\/mission status mission-abc-123/);
  assert.doesNotMatch(output, /unknown error/i);
});

test('redacts paths, drops stack lines, and bounds detailed task failure', () => {
  const output = renderTaskFailureBody(
    `Build failed at /Users/private/customer/repo\n    at run (/Users/private/runner.ts:12:3)\n${'detail '.repeat(200)}`,
    'mission-safe-42'
  );
  assert.doesNotMatch(output, /\/Users\/private|runner\.ts|at run/);
  assert.ok(output.length < 700, output);
});

test('does not interpolate an unsafe mission id into a command', () => {
  const output = renderTaskFailureBody('step failed', 'mission-1\n/run secret');
  assert.match(output, /\/mission status\.$/);
  assert.doesNotMatch(output, /\/run secret/);
});
