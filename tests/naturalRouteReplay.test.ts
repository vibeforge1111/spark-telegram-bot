import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {
  createNaturalRouteReplayLedgerRecords,
  formatNaturalRouteReplaySummary,
  parseNaturalRouteReplayCases,
  runNaturalRouteReplayCases,
  summarizeNaturalRouteReplayLedger
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

test('creates redacted dry-run ledger records from replay results', () => {
  const cases = parseNaturalRouteReplayCases([
    JSON.stringify({
      id: 'memory.write.sensitive_fixture',
      currentMessage: 'Memory update: my current plan is Neon Harbor Telegram memory test. Please save this as my current plan.',
      expectedRoute: 'memory.write'
    })
  ].join('\n'));
  const summary = runNaturalRouteReplayCases(cases);
  const records = createNaturalRouteReplayLedgerRecords(summary, {
    profile: 'local_replay_test',
    now: new Date('2026-05-09T00:00:00.000Z')
  });
  const serialized = JSON.stringify(records);
  const ledgerSummary = summarizeNaturalRouteReplayLedger(summary);

  assert.equal(records.length, 1);
  assert.equal(records[0].shadow_route, 'memory.write');
  assert.equal(records[0].executed_route, 'memory.write');
  assert.equal(records[0].outcome, 'matched');
  assert.equal(ledgerSummary.total, 1);
  assert.doesNotMatch(serialized, /Neon Harbor|Telegram memory test|current plan/i);
});

test('rejects duplicate replay case ids before evaluating fixtures', () => {
  const duplicateReplayCases = [
    JSON.stringify({
      id: 'memory.write.duplicate',
      currentMessage: 'remember this: concise replies',
      expectedRoute: 'memory.write'
    }),
    JSON.stringify({
      id: 'memory.write.duplicate',
      currentMessage: 'save this preference: short answers',
      expectedRoute: 'memory.write'
    })
  ].join('\n');

  assert.throws(
    () => parseNaturalRouteReplayCases(duplicateReplayCases),
    /Replay case id memory\.write\.duplicate is duplicated\./
  );
});
