import assert from 'node:assert/strict';
import { renderMemoryDoctorTelegramSummary } from '../src/memoryDoctorBridge';

function test(name: string, fn: () => void): void {
  try {
    fn();
    console.log(`ok - ${name}`);
  } catch (error) {
    console.error(`not ok - ${name}`);
    throw error;
  }
}

test('summarizes raw Memory Doctor diagnostics for Telegram', () => {
  const raw = [
    'Memory Doctor: needs attention.',
    'Topic: last request only if the current turn authorizes it; otherwise explain what to ask next.',
    '[Spark Telegram Memory Doctor evidence]',
    'Route: memory.doctor',
    'Request: telegram:749543788.',
    'Context capsule: gateway had 4 earlier same-session message(s), but the provider capsule had no recent-conversation turns.',
    'Lineage scope: 2 session(s), 1 channel(s) visible.',
    'Root cause: gateway -> provider context gap.',
    'Brain: visibility 93/100, 5 gap(s), next probe: fix the highest-severity finding.',
    'Benchmark: 54/100, weakest=close_turn_recall:fail.',
    'Problem: gateway trace had 4 earlier Telegram message(s), but the selected provider capsule had 0 recent-conversation source(s) (request=telegram:749543788).',
    'Next: Repair the recent-conversation capsule path: compare the gateway transcript, Builder request id, and provider capsule source ledger, then replay the same close-turn request.'
  ].join('\n');

  const summary = renderMemoryDoctorTelegramSummary(raw) || '';

  assert.match(summary, /Memory Doctor needs attention/);
  assert.match(summary, /provider context bundle did not receive them/);
  assert.match(summary, /repair the recent-conversation capsule path/);
  assert.match(summary, /I did not change memory/);
  assert.doesNotMatch(summary, /telegram:749543788/);
  assert.doesNotMatch(summary, /\bRequest:/);
  assert.doesNotMatch(summary, /\bRoute:/);
  assert.doesNotMatch(summary, /\bBenchmark:/);
  assert.doesNotMatch(summary, /source ledger/);
});

test('leaves already conversational Memory Doctor replies alone', () => {
  assert.equal(
    renderMemoryDoctorTelegramSummary('Memory Doctor looks clean. The previous exchange is available in recent context.'),
    null
  );
});
