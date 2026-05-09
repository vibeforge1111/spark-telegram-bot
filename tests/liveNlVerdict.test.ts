import assert from 'node:assert/strict';
import {
  formatLiveNlVerdictReport,
  parseLiveNlCommandCases,
  selectLiveNlCommandCases
} from '../src/liveNlVerdict';

function test(name: string, fn: () => void): void {
  try {
    fn();
    console.log(`ok - ${name}`);
  } catch (error) {
    console.error(`not ok - ${name}`);
    throw error;
  }
}

const cases = parseLiveNlCommandCases([
  {
    id: 'safe-001',
    suite: 'memory',
    risk: 'safe',
    prompt: 'remember this: concise replies',
    expectedRoute: 'memory_directive',
    expectedOutcome: 'Saves the preference.'
  },
  {
    id: 'mission-001',
    suite: 'mission',
    risk: 'mission',
    prompt: '/run say OK',
    expectedRoute: 'slash_run',
    expectedOutcome: 'Starts a mission.'
  },
  {
    id: 'wiki-001',
    suite: 'wiki',
    risk: 'safe',
    prompt: 'what pages are in your LLM wiki?',
    expectedRoute: 'natural_wiki_inventory',
    expectedOutcome: 'Lists wiki pages.'
  }
]);

test('selects only safe live NL cases by default', () => {
  const selected = selectLiveNlCommandCases(cases);

  assert.deepEqual(selected.map((entry) => entry.id), ['safe-001', 'wiki-001']);
});

test('keeps explicit risky case selection available', () => {
  const selected = selectLiveNlCommandCases(cases, { caseId: 'mission-001' });

  assert.deepEqual(selected.map((entry) => entry.id), ['mission-001']);
});

test('expands suite aliases for verdict reports', () => {
  const selected = selectLiveNlCommandCases(cases, { suite: 'memory_architecture' });

  assert.deepEqual(selected.map((entry) => entry.id), ['safe-001', 'wiki-001']);
});

test('formats a human-scored verdict worksheet', () => {
  const report = formatLiveNlVerdictReport([cases[0]], {
    generatedAt: new Date('2026-05-09T00:00:00.000Z'),
    suite: 'memory'
  });

  assert.match(report, /Generated: 2026-05-09T00:00:00\.000Z/);
  assert.match(report, /Verdict values: pass, fail, blocked, needs-retest, untested/);
  assert.match(report, /- Verdict: untested/);
  assert.match(report, /- Actual route:/);
  assert.match(report, /remember this: concise replies/);
  assert.doesNotMatch(report, /BOT_TOKEN|TELEGRAM_BOT_TOKEN/i);
});

test('rejects malformed command cases', () => {
  assert.throws(
    () => parseLiveNlCommandCases([{ id: 'bad', suite: 'memory', risk: 'danger', prompt: 'x', expectedRoute: 'x', expectedOutcome: 'x' }]),
    /unsupported risk/
  );
});
