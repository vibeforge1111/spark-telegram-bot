import assert from 'node:assert/strict';
import {
  isLowInformationLlmReply,
  builderReplySuppressionReason,
} from '../src/conversationIntent';

function test(name: string, fn: () => void): void {
  try {
    fn();
    console.log(`  PASS: ${name}`);
  } catch (e) {
    console.error(`  FAIL: ${name}`);
    console.error(`    ${e}`);
    process.exitCode = 1;
  }
}

// --- isLowInformationLlmReply ---

test('produced an empty reply is low-information', () => {
  assert.equal(isLowInformationLlmReply('produced an empty reply'), true);
});

test('working memory is low-information', () => {
  assert.equal(isLowInformationLlmReply('working memory'), true);
});

test('empty string is low-information', () => {
  assert.equal(isLowInformationLlmReply(''), true);
});

test('normal reply is not low-information', () => {
  assert.equal(isLowInformationLlmReply('Here is your task summary'), false);
});

// --- builderReplySuppressionReason ---

test('runtime_command routing bypasses suppression', () => {
  const reason = builderReplySuppressionReason(
    'spark could not reach the builder memory path right now',
    'runtime_command_status'
  );
  assert.equal(reason, null);
});

test('memory routing bypasses suppression', () => {
  const reason = builderReplySuppressionReason(
    'spark could not reach the builder memory path right now',
    'memory_raw_episode_update'
  );
  assert.equal(reason, null);
});

test('normal routing still suppresses diagnostic_wall', () => {
  const reason = builderReplySuppressionReason(
    'spark could not reach the builder memory path right now',
    'chat_general'
  );
  assert.equal(reason, 'diagnostic_wall');
});

test('empty reply suppressed for normal routing', () => {
  const reason = builderReplySuppressionReason('produced an empty reply', 'chat_general');
  assert.equal(reason, 'low_information');
});

test('empty reply NOT suppressed for runtime_command', () => {
  const reason = builderReplySuppressionReason('produced an empty reply', 'runtime_command_diagnose');
  assert.equal(reason, null);
});
