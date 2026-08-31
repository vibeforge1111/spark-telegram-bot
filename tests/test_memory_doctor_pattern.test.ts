import * as assert from 'node:assert/strict';
import { shouldAttachMemoryDoctorEvidence } from '../src/memoryDoctorBridge';

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

// --- system-state "what happened" must NOT trigger Memory Doctor ---
test('shouldAttachMemoryDoctorEvidence: "What happened to my build" → false', () => {
  assert.equal(shouldAttachMemoryDoctorEvidence('What happened to my build?'), false);
});

test('shouldAttachMemoryDoctorEvidence: "What happened when I ran spark update" → false', () => {
  assert.equal(shouldAttachMemoryDoctorEvidence('What happened when I ran spark update?'), false);
});

test('shouldAttachMemoryDoctorEvidence: "What happened during that mission" → false', () => {
  assert.equal(shouldAttachMemoryDoctorEvidence('What happened during that mission?'), false);
});

test('shouldAttachMemoryDoctorEvidence: "What happened to the deployment" → false', () => {
  assert.equal(shouldAttachMemoryDoctorEvidence('What happened to the deployment?'), false);
});

test('shouldAttachMemoryDoctorEvidence: "what happened with the error" → false', () => {
  assert.equal(shouldAttachMemoryDoctorEvidence('what happened with the error?'), false);
});

// --- memory-context "what happened" MUST trigger Memory Doctor ---
test('shouldAttachMemoryDoctorEvidence: "What happened to my memory" → true', () => {
  assert.equal(shouldAttachMemoryDoctorEvidence('What happened to my memory?'), true);
});

test('shouldAttachMemoryDoctorEvidence: "What happened to our conversation" → true', () => {
  assert.equal(shouldAttachMemoryDoctorEvidence('What happened to our conversation?'), true);
});

test('shouldAttachMemoryDoctorEvidence: "what happened to the context" → true', () => {
  assert.equal(shouldAttachMemoryDoctorEvidence('what happened to the context?'), true);
});

test('shouldAttachMemoryDoctorEvidence: "what happened to the last message" → true', () => {
  assert.equal(shouldAttachMemoryDoctorEvidence('what happened to the last message?'), true);
});

// --- regression: other Memory Doctor triggers still fire ---
test('shouldAttachMemoryDoctorEvidence: "went blank" → true (regression)', () => {
  assert.equal(shouldAttachMemoryDoctorEvidence('you just went blank'), true);
});

test('shouldAttachMemoryDoctorEvidence: "got blank" → true (regression)', () => {
  assert.equal(shouldAttachMemoryDoctorEvidence('the conversation got blank'), true);
});

test('shouldAttachMemoryDoctorEvidence: "lost the context" → true (regression)', () => {
  assert.equal(shouldAttachMemoryDoctorEvidence('you lost the context'), true);
});

test('shouldAttachMemoryDoctorEvidence: "forgot the context" → true (regression)', () => {
  assert.equal(shouldAttachMemoryDoctorEvidence('you forgot the context'), true);
});

test('shouldAttachMemoryDoctorEvidence: "run memory doctor" → true (regression)', () => {
  assert.equal(shouldAttachMemoryDoctorEvidence('please run memory doctor'), true);
});

test('shouldAttachMemoryDoctorEvidence: "did you forget my context" → true (regression)', () => {
  assert.equal(shouldAttachMemoryDoctorEvidence('did you forget my context?'), true);
});

// --- Summary ---
console.log(`\n${passed + failed} tests: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
