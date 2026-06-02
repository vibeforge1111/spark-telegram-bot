process.env.BOT_TOKEN = process.env.BOT_TOKEN || '123:test';

import assert from 'node:assert/strict';
import { formatBrowserProofQuestionAnswer } from '../src/index';

function test(name: string, fn: () => void): void {
  try {
    fn();
    console.log(`ok - ${name}`);
  } catch (error) {
    console.error(`not ok - ${name}`);
    throw error;
  }
}

// A pasted competition brief (the real-world trigger): mentions "browser-use",
// "pages", and "proof" many times, but is plainly not a question about Spark's
// browser capability. It must NOT trigger the /probe browser boundary answer.
const PASTED_BRIEF =
  "I am taking part in the spark compete bug fix bounty hunt. Can you help me testing to find bugs? " +
  "Here's the brief: Use real workflows: talk to Spark, try local CLI, Spawner UI, Telegram, and hosted " +
  "onboarding until a real issue appears. Use browser-use or computer-use screenshots with exact actions " +
  "for hosted UI issues. These tools are recommended. Capture before/after proof. Public page open, state " +
  "read, screenshots, clicks, cookies, and logged-in pages are part of safe proof.";

test('does not trigger the browser-proof boundary on a long pasted brief', () => {
  assert.equal(formatBrowserProofQuestionAnswer(PASTED_BRIEF), '');
});

test('does not trigger on a passing mention of a "proof page"', () => {
  // bare "page" must not count as asking about the browser route
  assert.equal(formatBrowserProofQuestionAnswer('is the proof page available?'), '');
  assert.equal(formatBrowserProofQuestionAnswer('thanks, that page looks great'), '');
});

test('still answers genuine browser-capability questions', () => {
  for (const q of [
    'can you browse the web right now?',
    'can you browse web pages right now?',
    'do you have browser-use available?',
    'prove you can open a web page',
  ]) {
    const reply = formatBrowserProofQuestionAnswer(q);
    assert.ok(reply, `expected a boundary answer for: ${q}`);
    assert.match(reply, /\/probe browser/);
  }
});
