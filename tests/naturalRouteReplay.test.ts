import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {
  formatNaturalRouteReplaySummary,
  parseNaturalRouteReplayCases,
  runNaturalRouteReplayCases
} from '../src/naturalRouteReplay';

function test(name: string, fn: () => void): void {
  try {
    fn();
    console.log(`ok - ${name}`);
  } catch (error) {
    console.error(`not ok - ${name}`);
    throw error;
  }
}

test('replays natural route fixture matrix without wrong-system starts', () => {
  const fixturePath = path.join(__dirname, 'fixtures', 'natural-route-replay-cases.jsonl');
  const cases = parseNaturalRouteReplayCases(fs.readFileSync(fixturePath, 'utf8'));
  const summary = runNaturalRouteReplayCases(cases);

  assert.equal(summary.failed, 0, formatNaturalRouteReplaySummary(summary));
  assert.ok(summary.total >= 12);
});
