import assert from 'node:assert/strict';
import {
  applyPlainWordsSurfaceRequest,
  assertLoopEngineeringTelegramReadability,
  isPlainWordsSurfaceRequest,
  scoreLoopEngineeringTelegramReadability
} from '../src/telegramSurface';

function test(name: string, fn: () => void): void {
  try {
    fn();
    console.log(`ok - ${name}`);
  } catch (error) {
    console.error(`not ok - ${name}`);
    throw error;
  }
}

test('detects plain-word and no-list surface requests', () => {
  assert.equal(isPlainWordsSurfaceRequest('What should Spark Thread QA improve next, in plain words?'), true);
  assert.equal(isPlainWordsSurfaceRequest('Say it in one or two natural teammate sentences. No headings, no bullets.'), true);
  assert.equal(isPlainWordsSurfaceRequest('Give me the detailed status report'), false);
});

test('keeps helpful lists when user asks for plain words without banning bullets', () => {
  const reply = [
    'Spark Thread QA should improve route confidence next.',
    '',
    'The useful check is whether Spark is:',
    '• talking',
    '• inspecting',
    '• building',
    '• running'
  ].join('\n');

  assert.equal(
    applyPlainWordsSurfaceRequest('What should Spark Thread QA improve next, in plain words?', reply),
    reply
  );
});

test('keeps plain paragraphs and removes numbered plan tail for explicit no-list requests', () => {
  const reply = [
    'Spark Thread QA should improve route confidence next.',
    '',
    'In plain words: before Spark answers or acts, it should show whether the user is asking to talk, inspect, build, run, remember, or diagnose.',
    '',
    'The sharp v1:',
    '1. Detect the intended lane.',
    '2. Show why Spark chose it.'
  ].join('\n');

  assert.equal(
    applyPlainWordsSurfaceRequest('Say that in one or two natural teammate sentences. No headings, no bullets.', reply),
    [
      'Spark Thread QA should improve route confidence next.',
      '',
      'In plain words: before Spark answers or acts, it should show whether the user is asking to talk, inspect, build, run, remember, or diagnose.'
    ].join('\n')
  );
});

test('does not rewrite normal detailed answers when the user did not ask for plain words', () => {
  const reply = ['Plan:', '1. Inspect route.', '2. Patch test.'].join('\n');
  assert.equal(applyPlainWordsSurfaceRequest('Give me the detailed plan', reply), reply);
});

test('scores readable Loop Engineering Telegram replies above release bar', () => {
  const reply = [
    'I ran the private starter check for Pull Request Risk Review. It stayed private and did not activate, publish, or send anything.',
    '',
    'Starter result: 14 practice checks ran; the safety gate stayed closed.',
    '',
    'That proves the scaffold can run. Next useful step: run separated judges against real before/after work before any activation.'
  ].join('\n');

  const result = assertLoopEngineeringTelegramReadability(reply, 8);
  assert.ok(result.score >= 8);
  assert.deepEqual(result.issues, []);
});

test('penalizes dense packet-like Loop Engineering replies', () => {
  const reply = [
    'Fast PRD path: domain-chip-daily-schedule-reliability-preview-only',
    'Problem: Users need scheduled tasks with approval boundaries and source truth. Users: operators. Metric: activation. Draft: create flow. Acceptance: pass checks. Checks: benchmark, watchtower, autoloop, evidence, safety. Loop lesson reused: yes.',
    'Status: queued'
  ].join('\n');

  const result = scoreLoopEngineeringTelegramReadability(reply);
  assert.ok(result.score < 8);
  assert.ok(result.issues.includes('raw_identifier_visible'));
  assert.ok(result.issues.includes('single_newline_blob'));
});

test('allows the single created-chip receipt key needed for follow-up routing', () => {
  const reply = [
    'Domain Chip created: domain-chip-pull-request-risk-review',
    '',
    'Private starter kit is ready. It includes the trigger, playbook, examples, local starter checks, independent review packets, safety monitoring notes, and rollback notes.',
    '',
    'Next: say "run the private check" or ask for the proof checklist.',
    '',
    'Privacy: private/local only.'
  ].join('\n\n');

  const result = assertLoopEngineeringTelegramReadability(reply, 8);
  assert.ok(result.score >= 8);
  assert.doesNotMatch(result.issues.join(','), /raw_identifier_visible/);
});
