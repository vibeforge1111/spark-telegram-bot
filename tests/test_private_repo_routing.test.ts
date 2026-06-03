import * as assert from 'node:assert/strict';
import {
  isPrivateRepoQuestion,
  renderPrivateRepoGuidance,
  isAmbiguousRepoQuestion,
  renderAmbiguousRepoGuidance,
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

// --- isPrivateRepoQuestion triggers ---
test('private repo question: "How do I access a private repo?" -> true', () => {
  assert.equal(isPrivateRepoQuestion('How do I access a private repo?'), true);
});

test('private repo question: "Can Spark clone a private GitHub repository?" -> true', () => {
  assert.equal(isPrivateRepoQuestion('Can Spark clone a private GitHub repository?'), true);
});

test('private repo question: "private github access" -> true', () => {
  assert.equal(isPrivateRepoQuestion('private github access'), true);
});

// --- renderPrivateRepoGuidance content ---
test('private repo guidance: mentions reviewer-routed proof packet', () => {
  const r = renderPrivateRepoGuidance();
  assert.ok(r.includes('reviewer-routed proof packet'), `Missing "reviewer-routed proof packet": ${r}`);
});

test('private repo guidance: warns against pasting PAT in chat', () => {
  const r = renderPrivateRepoGuidance();
  assert.ok(r.includes('never paste it into chat'), `Missing PAT-in-chat warning: ${r}`);
});

test('private repo guidance: mentions maintainer routing', () => {
  const r = renderPrivateRepoGuidance();
  assert.ok(r.includes('maintainer'), `Missing maintainer routing mention: ${r}`);
});

test('private repo guidance: does not invent a repo name', () => {
  const r = renderPrivateRepoGuidance();
  assert.ok(!/vibeforge|spark-telegram-bot|example\//.test(r), `Invented repo name in guidance: ${r}`);
});

// --- isAmbiguousRepoQuestion triggers ---
test('ambiguous repo question: "I\'m not sure which repo to use" -> true', () => {
  assert.equal(isAmbiguousRepoQuestion("I'm not sure which repo to use"), true);
});

test('ambiguous repo question: "can you figure out which repo?" -> true', () => {
  assert.equal(isAmbiguousRepoQuestion('can you figure out which repo?'), true);
});

test('ambiguous repo question: "unsure which github repo" -> true', () => {
  assert.equal(isAmbiguousRepoQuestion('unsure which github repo'), true);
});

// --- renderAmbiguousRepoGuidance content ---
test('ambiguous repo guidance: mentions reviewer-routing', () => {
  const r = renderAmbiguousRepoGuidance();
  assert.ok(r.includes('reviewer-routed proof packet'), `Missing reviewer-routing in ambiguous guidance: ${r}`);
});

test('ambiguous repo guidance: asks one clarifying question', () => {
  const r = renderAmbiguousRepoGuidance();
  const questionMarks = (r.match(/\?/g) || []).length;
  assert.ok(questionMarks >= 1, `Expected at least one question in ambiguous guidance: ${r}`);
});

test('ambiguous repo guidance: does not invent a repo name', () => {
  const r = renderAmbiguousRepoGuidance();
  assert.ok(!/vibeforge|spark-telegram-bot|example\//.test(r), `Invented repo name in ambiguous guidance: ${r}`);
});

// --- Non-triggers ---
test('non-trigger: "how do I run a mission" -> false (both)', () => {
  assert.equal(isPrivateRepoQuestion('how do I run a mission'), false);
  assert.equal(isAmbiguousRepoQuestion('how do I run a mission'), false);
});

test('non-trigger: empty string -> false (both)', () => {
  assert.equal(isPrivateRepoQuestion(''), false);
  assert.equal(isAmbiguousRepoQuestion(''), false);
});

test('non-trigger: "I want to update Spark" -> false (both)', () => {
  assert.equal(isPrivateRepoQuestion('I want to update Spark'), false);
  assert.equal(isAmbiguousRepoQuestion('I want to update Spark'), false);
});

// --- Summary ---
console.log(`\n${passed + failed} tests: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
