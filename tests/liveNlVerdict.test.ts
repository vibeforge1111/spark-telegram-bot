import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  formatLiveNlCopyPastePrompts,
  formatLiveNlVerdictReport,
  liveNlCaseTurns,
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

test('keeps explicit multi-case selection available', () => {
  const selected = selectLiveNlCommandCases(cases, { caseIds: ['mission-001', 'wiki-001'] });

  assert.deepEqual(selected.map((entry) => entry.id), ['mission-001', 'wiki-001']);
});

test('keeps explicit multi-case selection in requested order', () => {
  const selected = selectLiveNlCommandCases(cases, { caseIds: ['wiki-001', 'safe-001'] });

  assert.deepEqual(selected.map((entry) => entry.id), ['wiki-001', 'safe-001']);
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

test('formats copy-paste prompts without leaking route expectations into Telegram text', () => {
  const promptSheet = formatLiveNlCopyPastePrompts([cases[0]], { title: 'Manual Smoke' });

  assert.match(promptSheet, /# Manual Smoke/);
  assert.match(promptSheet, /Copy only each Telegram message into Telegram/);
  assert.match(promptSheet, /```text\nremember this: concise replies\n```/);
  assert.match(promptSheet, /CASE safe-001/);
  assert.match(promptSheet, /<paste Spark reply here>/);
  assert.doesNotMatch(promptSheet, /Expected route|Expected outcome|memory_directive|Saves the preference/);
});

test('formats multi-turn live probes as sequential copy-paste messages', () => {
  const [entry] = parseLiveNlCommandCases([
    {
      id: 'context-001',
      suite: 'context_window',
      risk: 'safe',
      turns: ['shape a tiny route-confidence harness but do not build yet', 'run it'],
      expectedRoute: 'plain_chat',
      expectedOutcome: 'Uses the prior turn without launching an unrelated system.'
    }
  ]);
  const promptSheet = formatLiveNlCopyPastePrompts([entry], { title: 'Multi Turn Smoke' });
  const report = formatLiveNlVerdictReport([entry], {
    generatedAt: new Date('2026-05-09T00:00:00.000Z')
  });

  assert.deepEqual(liveNlCaseTurns(entry), [
    'shape a tiny route-confidence harness but do not build yet',
    'run it'
  ]);
  assert.match(promptSheet, /Telegram message 1 of 2/);
  assert.match(promptSheet, /CASE context-001 TURN 2/);
  assert.match(report, /Prompts:/);
  assert.match(report, /Turn 2:\n\s+run it/);
  assert.doesNotMatch(promptSheet, /plain_chat|Uses the prior turn/);
});

test('live command copy-paste output keeps metadata out of Telegram blocks', () => {
  const actualCases = parseLiveNlCommandCases(JSON.parse(readFileSync(resolve(__dirname, '../ops/natural-language-live-commands.json'), 'utf8')));
  const selected = selectLiveNlCommandCases(actualCases, { caseIds: ['guard-006', 'guard-007', 'build-004', 'domain-chip-003'] });
  const promptSheet = formatLiveNlCopyPastePrompts(selected);

  assert.equal(selected.length, 4);
  assert.deepEqual(selected.map((entry) => entry.id), ['guard-006', 'guard-007', 'build-004', 'domain-chip-003']);
  assert.match(promptSheet, /1\. guard-006[\s\S]+all Spark agents should ask clarifying questions before missions/);
  assert.match(promptSheet, /2\. guard-007[\s\S]+make all Spark systems understand workflow context more conversationally/);
  assert.match(promptSheet, /3\. build-004[\s\S]+please help me design a project called Relay Workshop/);
  assert.match(promptSheet, /4\. domain-chip-003[\s\S]+do not build yet, help me think through a domain chip/);
  assert.doesNotMatch(promptSheet, /global_doctrine_blocked|conversation_ideation|Expected route|Expected outcome/);
});

test('rejects malformed command cases', () => {
  assert.throws(
    () => parseLiveNlCommandCases([{ id: 'bad', suite: 'memory', risk: 'danger', prompt: 'x', expectedRoute: 'x', expectedOutcome: 'x' }]),
    /unsupported risk danger\. Allowed risks: safe, mission, writes_files, external\./
  );
});

test('actual live command catalog keeps route-boundary prompt cards', () => {
  const catalogPath = resolve(__dirname, '../ops/natural-language-live-commands.json');
  const actualCases = parseLiveNlCommandCases(JSON.parse(readFileSync(catalogPath, 'utf8')));
  const ids = actualCases.map((entry) => entry.id);

  assert.equal(new Set(ids).size, ids.length);
  assert.ok(actualCases.length >= 63);
  assert.ok(ids.includes('memory-002'));
  assert.ok(ids.includes('guard-006'));
  assert.ok(ids.includes('guard-007'));
  assert.ok(ids.includes('domain-chip-003'));
  assert.deepEqual(
    selectLiveNlCommandCases(actualCases, { suite: 'domain_chip' }).map((entry) => entry.id),
    ['domain-chip-001', 'domain-chip-002', 'domain-chip-003']
  );
});
