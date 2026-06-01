import * as assert from 'node:assert/strict';
import {
  isBugReportRequest,
  isDuplicateCheckRequest,
  extractBugFingerprint,
  renderBugReportFlowGuidance,
  renderDuplicateCheckGuidance,
} from '../src/index';

let passed = 0;
let failed = 0;

function test(name: string, fn: () => void) {
  try {
    fn();
    console.log(`  PASS  ${name}`);
    passed++;
  } catch (err: any) {
    console.error(`  FAIL  ${name}`);
    console.error(`         ${err.message}`);
    failed++;
  }
}

// --- isBugReportRequest triggers ---
test('"I found a bug. How do I report it?" -> true', () => {
  assert.equal(isBugReportRequest('I found a bug. How do I report it?'), true);
});

test('"How do I report a bug?" -> true', () => {
  assert.equal(isBugReportRequest('How do I report a bug?'), true);
});

test('"I want to report a bug" -> true', () => {
  assert.equal(isBugReportRequest('I want to report a bug'), true);
});

// --- isBugReportRequest does NOT trigger for duplicate check queries ---
test('"Has anyone already reported this bug about schedule delete?" -> isBugReport false', () => {
  assert.equal(isBugReportRequest('Has anyone already reported this bug about schedule delete not checking ownership?'), false);
});

// --- isDuplicateCheckRequest triggers ---
test('"Has anyone already reported this bug about schedule delete not checking ownership?" -> true', () => {
  assert.equal(isDuplicateCheckRequest('Has anyone already reported this bug about schedule delete not checking ownership?'), true);
});

test('"already reported this bug" -> true', () => {
  assert.equal(isDuplicateCheckRequest('already reported this bug'), true);
});

test('"Is there an existing issue for this?" -> true', () => {
  assert.equal(isDuplicateCheckRequest('Is there an existing issue for this?'), true);
});

// --- Duplicate check does NOT route to schedule manager ---
test('"Has anyone reported schedule delete bug" -> isDuplicateCheck true, not isBugReport as schedule intent', () => {
  const text = 'Has anyone reported the schedule delete bug about ownership?';
  assert.equal(isDuplicateCheckRequest(text), true);
  assert.equal(isBugReportRequest(text), false);
});

// --- renderBugReportFlowGuidance content ---
test('bug report guidance: prompts for bug description first before filing', () => {
  const r = renderBugReportFlowGuidance();
  assert.ok(r.includes('fingerprint') || r.includes('description'), `Missing fingerprint/description prompt: ${r}`);
});

test('bug report guidance: includes duplicate search step', () => {
  const r = renderBugReportFlowGuidance();
  assert.ok(r.includes('gh issue list') || r.includes('duplicate'), `Missing duplicate search: ${r}`);
});

test('bug report guidance: mentions first complete packet credit', () => {
  const r = renderBugReportFlowGuidance();
  assert.ok(r.includes('first') && r.includes('credit'), `Missing first-reporter credit: ${r}`);
});

test('bug report guidance: never says "paste logs directly"', () => {
  const r = renderBugReportFlowGuidance();
  assert.ok(!/paste\s+(?:raw\s+)?logs\s+(?:directly|here)/i.test(r), `Guidance tells user to paste logs: ${r}`);
});

test('bug report guidance: includes structured report fields', () => {
  const r = renderBugReportFlowGuidance();
  assert.ok(r.includes('Repro') || r.includes('repro'), `Missing repro steps: ${r}`);
  assert.ok(r.includes('Expected') || r.includes('expected'), `Missing expected behavior: ${r}`);
  assert.ok(r.includes('Actual') || r.includes('actual'), `Missing actual behavior: ${r}`);
});

// --- renderDuplicateCheckGuidance content ---
test('duplicate check guidance: includes gh issue list command', () => {
  const r = renderDuplicateCheckGuidance('Has anyone reported the schedule delete ownership bug?');
  assert.ok(r.includes('gh issue list'), `Missing gh issue list: ${r}`);
});

test('duplicate check guidance: includes extracted fingerprint terms', () => {
  const r = renderDuplicateCheckGuidance('Has anyone reported the schedule delete ownership bug?');
  assert.ok(r.includes('schedule') || r.includes('delete') || r.includes('ownership'), `Missing extracted terms: ${r}`);
});

// --- Non-triggers ---
test('non-trigger: "how do I run a mission" -> false (both)', () => {
  assert.equal(isBugReportRequest('how do I run a mission'), false);
  assert.equal(isDuplicateCheckRequest('how do I run a mission'), false);
});

test('non-trigger: empty string -> false (both)', () => {
  assert.equal(isBugReportRequest(''), false);
  assert.equal(isDuplicateCheckRequest(''), false);
});

test('non-trigger: "I want to update Spark" -> false (both)', () => {
  assert.equal(isBugReportRequest('I want to update Spark'), false);
  assert.equal(isDuplicateCheckRequest('I want to update Spark'), false);
});

// --- Summary ---
console.log(`\n${passed + failed} tests: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
