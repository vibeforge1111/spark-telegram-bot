import assert from 'node:assert/strict';
import {
  isSparkUpdateRequest,
  isSparkUpdateConsequenceQuestion,
  renderSparkUpdateGuidance,
  renderSparkUpdateConsequenceGuidance
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

test('post-install update query triggers update guidance', () => {
  assert.equal(isSparkUpdateRequest('I want to update Spark. How do I do it?'), true);
});

test('how do I update Spark triggers update guidance', () => {
  assert.equal(isSparkUpdateRequest('How do I update Spark?'), true);
});

test('spark update bare phrase triggers update guidance', () => {
  assert.equal(isSparkUpdateRequest('spark update'), true);
});

test('update guidance contains dirty worktree warning', () => {
  const reply = renderSparkUpdateGuidance();
  assert.ok(/git\s+status/i.test(reply), 'reply must mention git status');
  assert.ok(/uncommitted|dirty|worktree|workspace\s+state/i.test(reply.toLowerCase()), 'reply must warn about uncommitted changes');
});

test('update guidance contains rollback path', () => {
  const reply = renderSparkUpdateGuidance();
  assert.ok(/rollback|roll\s+back|revert|checkout|--version/i.test(reply), 'reply must include rollback instructions');
});

test('update guidance contains registry pin note', () => {
  const reply = renderSparkUpdateGuidance();
  assert.ok(/registry\s+pin|spark\s+verify/i.test(reply), 'reply must mention registry pins or verify step');
});

test('update consequence question routes to consequence guidance', () => {
  assert.equal(isSparkUpdateConsequenceQuestion('What happens to my current work if I run spark update?'), true);
});

test('will spark update affect my current work routes correctly', () => {
  assert.equal(isSparkUpdateConsequenceQuestion('will spark update affect my current work'), true);
});

test('does spark update overwrite routes correctly', () => {
  assert.equal(isSparkUpdateConsequenceQuestion('does spark update overwrite my files'), true);
});

test('consequence guidance contains worktree check', () => {
  const reply = renderSparkUpdateConsequenceGuidance();
  assert.ok(/git\s+status/i.test(reply), 'consequence reply must mention git status');
});

test('consequence guidance contains rollback path', () => {
  const reply = renderSparkUpdateConsequenceGuidance();
  assert.ok(/roll\s*back|rollback|--version|git\s+checkout/i.test(reply), 'consequence reply must include rollback path');
});

test('consequence guidance does not contain Memory Doctor content', () => {
  const reply = renderSparkUpdateConsequenceGuidance();
  assert.ok(!/memory\s+doctor|context\s+trace|conversation\s+trace/i.test(reply), 'consequence reply must not be a Memory Doctor diagnostic');
});

test('non-update question does not trigger update handler', () => {
  assert.equal(isSparkUpdateRequest('how do I run a mission'), false);
});

test('empty string does not trigger update handler', () => {
  assert.equal(isSparkUpdateRequest(''), false);
});

test('empty string does not trigger consequence handler', () => {
  assert.equal(isSparkUpdateConsequenceQuestion(''), false);
});

test('hostile: no spark context does not trigger consequence handler', () => {
  assert.equal(isSparkUpdateConsequenceQuestion('how do I run a mission'), false);
});
