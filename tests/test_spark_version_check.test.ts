import * as assert from 'node:assert/strict';
import {
  isSparkVersionCheckQuestion,
  renderSparkVersionCheckReply,
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

// --- isSparkVersionCheckQuestion: positive cases ---
test('isSparkVersionCheckQuestion: "What version of Spark is installed" → true', () => {
  assert.equal(isSparkVersionCheckQuestion('What version of Spark is installed?'), true);
});

test('isSparkVersionCheckQuestion: "spark --version" → true', () => {
  assert.equal(isSparkVersionCheckQuestion('spark --version'), true);
});

test('isSparkVersionCheckQuestion: "how do I check my Spark version" → true', () => {
  assert.equal(isSparkVersionCheckQuestion('how do I check my Spark version?'), true);
});

test('isSparkVersionCheckQuestion: "what is the current spark version" → true', () => {
  assert.equal(isSparkVersionCheckQuestion('what is the current spark version?'), true);
});

test('isSparkVersionCheckQuestion: "check spark version" → true', () => {
  assert.equal(isSparkVersionCheckQuestion('check spark version'), true);
});

test('isSparkVersionCheckQuestion: "show me the spark version running" → true', () => {
  assert.equal(isSparkVersionCheckQuestion('show me the spark version running'), true);
});

// --- isSparkVersionCheckQuestion: negative cases (regression) ---
test('isSparkVersionCheckQuestion: "spark update" → false', () => {
  assert.equal(isSparkVersionCheckQuestion('spark update'), false);
});

test('isSparkVersionCheckQuestion: "what version of node is installed" → false', () => {
  assert.equal(isSparkVersionCheckQuestion('what version of node is installed?'), false);
});

test('isSparkVersionCheckQuestion: "npm --version" → false', () => {
  assert.equal(isSparkVersionCheckQuestion('npm --version'), false);
});

test('isSparkVersionCheckQuestion: empty string → false', () => {
  assert.equal(isSparkVersionCheckQuestion(''), false);
});

// --- renderSparkVersionCheckReply ---
test('renderSparkVersionCheckReply: contains CLI output', () => {
  const reply = renderSparkVersionCheckReply('spark 2.14.1');
  assert.ok(reply.includes('spark 2.14.1'), `Expected output in reply, got: ${reply}`);
});

test('renderSparkVersionCheckReply: empty output → install hint', () => {
  const reply = renderSparkVersionCheckReply('');
  assert.ok(reply.toLowerCase().includes('installed') || reply.toLowerCase().includes('path'),
    `Expected install hint in reply, got: ${reply}`);
});

test('renderSparkVersionCheckReply: output is not hallucinated — passes through raw CLI output', () => {
  const fakeCliOutput = 'spark 99.0.0-test';
  const reply = renderSparkVersionCheckReply(fakeCliOutput);
  assert.ok(reply.includes(fakeCliOutput), `Expected raw CLI output in reply, got: ${reply}`);
});

// --- Summary ---
console.log(`\n${passed + failed} tests: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
