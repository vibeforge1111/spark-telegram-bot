process.env.BOT_TOKEN = process.env.BOT_TOKEN || '123:test';

import assert from 'node:assert/strict';
import {
  formatBrowserProofQuestionAnswer,
  shouldAnswerAuthoritativeRuntimeStatus,
} from '../src/index';

function test(name: string, fn: () => void): void {
  try {
    fn();
    console.log(`ok - ${name}`);
  } catch (error) {
    console.error(`not ok - ${name}`);
    throw error;
  }
}

const PASTED_BRIEF = [
  'I am taking part in a bug-fix hunt and need help testing real workflows.',
  'Talk to Spark, try local CLI, Spawner UI, Telegram, and hosted onboarding.',
  'Use browser screenshots with exact actions and capture before/after proof.',
  'The shared bot may say status live; verify the systems are running.',
  'Do not expose raw logs or hidden details.',
].join(' ');

test('long pasted work briefs do not trigger browser proof replies', () => {
  assert.equal(formatBrowserProofQuestionAnswer(PASTED_BRIEF), '');
});

test('long pasted work briefs do not trigger authoritative runtime status', () => {
  assert.equal(shouldAnswerAuthoritativeRuntimeStatus(PASTED_BRIEF), false);
});

test('concise direct questions keep their evidence-grounded routes', () => {
  assert.match(formatBrowserProofQuestionAnswer('can you browse web pages right now?'), /\/probe browser/);
  assert.equal(shouldAnswerAuthoritativeRuntimeStatus('are the spawner and telegram systems running?'), true);
});
