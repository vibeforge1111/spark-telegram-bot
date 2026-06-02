process.env.BOT_TOKEN = process.env.BOT_TOKEN || '123:test';

import assert from 'node:assert/strict';
import { shouldAnswerAuthoritativeRuntimeStatus } from '../src/index';

function test(name: string, fn: () => void): void {
  try {
    fn();
    console.log(`ok - ${name}`);
  } catch (error) {
    console.error(`not ok - ${name}`);
    throw error;
  }
}

// A pasted competition brief: mentions "spark", "telegram", "running", "status",
// "state" in passing. Several status checks use ".*" spanning the whole message,
// so this long paste would otherwise be misrouted to the authoritative runtime
// status report instead of being answered as a normal request.
const PASTED_BRIEF =
  "I am taking part in the spark compete bug fix bounty hunt. Can you help me testing to find bugs? " +
  "Here's the brief: Spark Compete is a two-week team hunt. Use real workflows: talk to Spark, try local CLI, " +
  "Spawner UI, Telegram, and hosted onboarding until a real issue appears. Use browser-use screenshots for " +
  "hosted UI issues. Capture before/after proof. The official bot URL is only an optional shared smoke lane " +
  "when it says status: live. Do not expose raw logs or hidden scoring details. Verify the new version " +
  "yourself and check the systems are running.";

test('does not route a long pasted brief to the authoritative runtime-status answer', () => {
  assert.equal(shouldAnswerAuthoritativeRuntimeStatus(PASTED_BRIEF), false);
});

test('still answers genuine, concise runtime-status questions', () => {
  for (const q of [
    'are the spawner and telegram systems running?',
    'what is the current live state?',
    'show me the raw live status',
  ]) {
    assert.equal(shouldAnswerAuthoritativeRuntimeStatus(q), true, `expected status answer for: ${q}`);
  }
});
