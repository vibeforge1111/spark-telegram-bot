import * as assert from 'node:assert/strict';
import {
  isCredentialSetupQuestion,
  renderCredentialSetupGuidance,
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

// --- isCredentialSetupQuestion: positive cases ---
test('isCredentialSetupQuestion: "How do I set up my GitHub token" → true', () => {
  assert.equal(isCredentialSetupQuestion('How do I set up my GitHub token?'), true);
});

test('isCredentialSetupQuestion: "spark credentials set" → true', () => {
  assert.equal(isCredentialSetupQuestion('spark credentials set'), true);
});

test('isCredentialSetupQuestion: "I need to add my API key to Spark" → true', () => {
  assert.equal(isCredentialSetupQuestion('I need to add my API key to Spark'), true);
});

test('isCredentialSetupQuestion: "how do I configure my token in spark" → true', () => {
  assert.equal(isCredentialSetupQuestion('how do I configure my token in spark?'), true);
});

test('isCredentialSetupQuestion: "how to set up credentials for spark" → true', () => {
  assert.equal(isCredentialSetupQuestion('how to set up credentials for spark'), true);
});

test('isCredentialSetupQuestion: "spark credentials list" → true', () => {
  assert.equal(isCredentialSetupQuestion('spark credentials list'), true);
});

// --- isCredentialSetupQuestion: negative cases (no Spark context) ---
test('isCredentialSetupQuestion: generic "credentials" without Spark context → false', () => {
  assert.equal(isCredentialSetupQuestion('what are credentials?'), false);
});

test('isCredentialSetupQuestion: "my GitHub token expired" (no setup/spark context) → false', () => {
  assert.equal(isCredentialSetupQuestion('my GitHub token expired'), false);
});

test('isCredentialSetupQuestion: empty string → false', () => {
  assert.equal(isCredentialSetupQuestion(''), false);
});

test('isCredentialSetupQuestion: unrelated message → false', () => {
  assert.equal(isCredentialSetupQuestion('How do I run a mission?'), false);
});

// --- renderCredentialSetupGuidance: content checks ---
test('renderCredentialSetupGuidance: warns against pasting tokens in chat', () => {
  const reply = renderCredentialSetupGuidance();
  assert.ok(
    reply.toLowerCase().includes('never paste') || reply.toLowerCase().includes('never paste tokens'),
    `Expected anti-paste warning, got: ${reply}`
  );
});

test('renderCredentialSetupGuidance: gives spark credentials set command', () => {
  const reply = renderCredentialSetupGuidance();
  assert.ok(
    reply.includes('spark credentials set'),
    `Expected 'spark credentials set' command, got: ${reply}`
  );
});

test('renderCredentialSetupGuidance: mentions reviewer-routing for private repos', () => {
  const reply = renderCredentialSetupGuidance();
  assert.ok(
    reply.toLowerCase().includes('reviewer') || reply.toLowerCase().includes('private repo'),
    `Expected reviewer-routing / private repo mention, got: ${reply}`
  );
});

test('renderCredentialSetupGuidance: mentions terminal (not Telegram) for secrets', () => {
  const reply = renderCredentialSetupGuidance();
  assert.ok(
    reply.toLowerCase().includes('terminal'),
    `Expected 'terminal' guidance, got: ${reply}`
  );
});

// --- Summary ---
console.log(`\n${passed + failed} tests: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
