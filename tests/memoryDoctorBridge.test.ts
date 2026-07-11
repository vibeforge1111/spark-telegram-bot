import assert from 'node:assert/strict';
import {
  buildMemoryDoctorEvidencePrompt,
  isMemoryDoctorBridgeDetourReply,
  renderMemoryDoctorEvidenceFallback,
  selectMemoryDoctorEvidenceTurns,
  shouldAttachMemoryDoctorEvidence,
  shouldPreferMemoryDoctorEvidenceFallback,
} from '../src/memoryDoctorBridge';

function test(name: string, fn: () => void): void {
  try {
    fn();
    console.log(`ok - ${name}`);
  } catch (error) {
    console.error(`not ok - ${name}`);
    throw error;
  }
}

test('shouldAttachMemoryDoctorEvidence matches the documented memory-doctor phrasings', () => {
  assert.equal(shouldAttachMemoryDoctorEvidence('what happened to the last reply?'), true);
  assert.equal(shouldAttachMemoryDoctorEvidence('you went blank again'), true);
  assert.equal(shouldAttachMemoryDoctorEvidence('did you lose the context?'), true);
  assert.equal(shouldAttachMemoryDoctorEvidence('please run the memory doctor'), true);
  assert.equal(shouldAttachMemoryDoctorEvidence('what was your last answer?'), true);
});

test('shouldAttachMemoryDoctorEvidence ignores unrelated requests', () => {
  assert.equal(shouldAttachMemoryDoctorEvidence('what is the weather today?'), false);
  assert.equal(shouldAttachMemoryDoctorEvidence('please build me a feature'), false);
  assert.equal(shouldAttachMemoryDoctorEvidence(''), false);
});

test('selectMemoryDoctorEvidenceTurns drops the trailing user turn when it duplicates the request', () => {
  const turns = selectMemoryDoctorEvidenceTurns('what happened?', [
    { role: 'user', text: 'hi' },
    { role: 'assistant', text: 'hello' },
    { role: 'user', text: 'what happened?' },
  ]);
  assert.equal(turns.length, 2);
  assert.equal(turns[turns.length - 1].text, 'hello');
});

test('selectMemoryDoctorEvidenceTurns keeps the last assistant reply intact', () => {
  const turns = selectMemoryDoctorEvidenceTurns('audit please', [
    { role: 'user', text: 'earlier' },
    { role: 'assistant', text: 'reply-A' },
    { role: 'assistant', text: 'reply-B' },
  ]);
  assert.equal(turns.length, 2);
  assert.equal(turns[turns.length - 1].text, 'reply-B');
});

test('selectMemoryDoctorEvidenceTurns respects an explicit maxTurns limit', () => {
  const recent = Array.from({ length: 6 }, (_, i) => ({ role: 'user', text: `t${i}` }));
  const turns = selectMemoryDoctorEvidenceTurns('different request', recent, 3);
  assert.equal(turns.length, 3);
  assert.equal(turns[0].text, 't3');
});

test('buildMemoryDoctorEvidencePrompt returns just the request when no recent turns', () => {
  const prompt = buildMemoryDoctorEvidencePrompt('audit please', []);
  assert.equal(prompt, 'audit please');
});

test('buildMemoryDoctorEvidencePrompt renders newest-last, role-tagged evidence', () => {
  const prompt = buildMemoryDoctorEvidencePrompt('audit please', [
    { role: 'user', text: 'q1' },
    { role: 'assistant', text: 'a1' },
  ]);
  assert.match(prompt, /\[Spark Telegram Memory Doctor evidence\]/);
  assert.match(prompt, /- user: q1/);
  assert.match(prompt, /- assistant: a1/);
  assert.match(prompt, /Route: memory.doctor/);
});

test('buildMemoryDoctorEvidencePrompt compacts very long turns down to the 700-char limit', () => {
  const long = 'x'.repeat(2000);
  const prompt = buildMemoryDoctorEvidencePrompt('audit please', [{ role: 'user', text: long }]);
  const turnLine = prompt.split('\n').find((line) => line.startsWith('- user:')) || '';
  assert.ok(turnLine.length > 0);
  // 700-char body + "- user: " prefix should still cap well under 720 chars.
  assert.ok(turnLine.length <= 720);
  assert.match(turnLine, /\.\.\.$/);
});

test('isMemoryDoctorBridgeDetourReply flags MCP/permission detours', () => {
  assert.equal(isMemoryDoctorBridgeDetourReply('You need MCP permission to proceed.'), true);
  assert.equal(isMemoryDoctorBridgeDetourReply('please run /diagnose first'), true);
  assert.equal(isMemoryDoctorBridgeDetourReply('which one do you prefer?'), true);
  assert.equal(isMemoryDoctorBridgeDetourReply(''), false);
  assert.equal(isMemoryDoctorBridgeDetourReply('Here is the audit summary you asked for.'), false);
});

test('renderMemoryDoctorEvidenceFallback adapts diagnosis to the assistant trace', () => {
  const fallback = renderMemoryDoctorEvidenceFallback('what happened?', [
    { role: 'user', text: 'hi' },
    { role: 'assistant', text: 'You need MCP permission to proceed.' },
  ]);
  assert.match(fallback, /Memory Doctor/);
  assert.match(fallback, /MCP\/tool permission/);
});

test('renderMemoryDoctorEvidenceFallback explains absence when no turns are available', () => {
  const fallback = renderMemoryDoctorEvidenceFallback('what happened?', []);
  assert.match(fallback, /No recent visible turn pair was available/);
  assert.match(fallback, /Request: what happened\?/);
});

test('shouldPreferMemoryDoctorEvidenceFallback fires only on blankness requests with a detour reply', () => {
  const turns = [
    { role: 'user', text: 'hi' },
    { role: 'assistant', text: 'I need MCP permission to verify' },
  ];
  assert.equal(shouldPreferMemoryDoctorEvidenceFallback('what happened to the last reply?', turns), true);
  // Same turns but the request is unrelated → false.
  assert.equal(shouldPreferMemoryDoctorEvidenceFallback('build me something', turns), false);
});
