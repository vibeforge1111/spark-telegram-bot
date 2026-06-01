import * as assert from 'node:assert/strict';
import {
  isPracticeRepoInstallQuestion,
  renderPracticeFixtureStatusGuidance,
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

// --- isPracticeRepoInstallQuestion triggers ---
test('"Is spark-personality-chip-labs starter-installed by default?" -> true', () => {
  assert.equal(isPracticeRepoInstallQuestion('Is spark-personality-chip-labs starter-installed by default?'), true);
});

test('"Is spark-personality-chip-labs installed?" -> true', () => {
  assert.equal(isPracticeRepoInstallQuestion('Is spark-personality-chip-labs installed?'), true);
});

test('"is the practice repo installed by default?" -> true', () => {
  assert.equal(isPracticeRepoInstallQuestion('is the practice repo installed by default?'), true);
});

test('"Does the practice module come with Spark by default?" -> true', () => {
  assert.equal(isPracticeRepoInstallQuestion('Does the practice module come with Spark by default?'), true);
});

// --- renderPracticeFixtureStatusGuidance content ---
test('guidance: confirms spark-personality-chip-labs is a known optional public practice fixture', () => {
  const r = renderPracticeFixtureStatusGuidance();
  assert.ok(r.includes('spark-personality-chip-labs'), `Missing module name: ${r}`);
  assert.ok(r.includes('optional'), `Missing "optional": ${r}`);
  assert.ok(r.includes('practice fixture'), `Missing "practice fixture": ${r}`);
});

test('guidance: states clearly NOT starter-installed by default', () => {
  const r = renderPracticeFixtureStatusGuidance();
  assert.ok(/NOT\s+starter-installed|not.*starter-installed|NOT.*default/i.test(r), `Missing NOT-default statement: ${r}`);
});

test('guidance: gives install command', () => {
  const r = renderPracticeFixtureStatusGuidance();
  assert.ok(r.includes('spark install spark-personality-chip-labs'), `Missing install command: ${r}`);
});

test('guidance: distinguishes from spark-character', () => {
  const r = renderPracticeFixtureStatusGuidance();
  assert.ok(r.includes('spark-character'), `Missing spark-character distinction: ${r}`);
});

test('guidance: distinguishes from spark-domain-chip-labs', () => {
  const r = renderPracticeFixtureStatusGuidance();
  assert.ok(r.includes('spark-domain-chip-labs'), `Missing spark-domain-chip-labs distinction: ${r}`);
});

test('guidance: never claims it is installed without verification', () => {
  const r = renderPracticeFixtureStatusGuidance();
  assert.ok(!/is\s+(?:already\s+)?installed(?!\s+separately|.*spark install)/i.test(r), `Overclaims installation: ${r}`);
});

test('guidance: suggests how to check what is installed', () => {
  const r = renderPracticeFixtureStatusGuidance();
  assert.ok(/spark status|--modules|verify/i.test(r), `Missing verification hint: ${r}`);
});

// --- Non-triggers ---
test('non-trigger: "how do I run a mission" -> false', () => {
  assert.equal(isPracticeRepoInstallQuestion('how do I run a mission'), false);
});

test('non-trigger: empty string -> false', () => {
  assert.equal(isPracticeRepoInstallQuestion(''), false);
});

test('non-trigger: "I want to update Spark" -> false', () => {
  assert.equal(isPracticeRepoInstallQuestion('I want to update Spark'), false);
});

test('non-trigger: "how do I create a domain chip?" -> false', () => {
  assert.equal(isPracticeRepoInstallQuestion('how do I create a domain chip?'), false);
});

// --- Summary ---
console.log(`\n${passed + failed} tests: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
