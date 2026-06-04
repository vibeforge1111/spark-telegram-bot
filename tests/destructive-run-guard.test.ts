import assert from 'node:assert/strict';

function test(name: string, fn: () => void): void {
  try {
    fn();
    console.log(`ok - ${name}`);
  } catch (error) {
    console.error(`not ok - ${name}`);
    throw error;
  }
}

// The PR #318 adds a confirmation prompt before destructive /run goals
// Test the isDestructiveRunGoal helper logic

const DESTRUCTIVE_KEYWORDS = [
  'delete', 'remove', 'destroy', 'wipe', 'reset', 'clear',
  'prune', 'purge', 'nuke', 'terminate', 'kill', 'stop'
];

function isDestructiveRunGoal(goal: string): boolean {
  const lower = goal.toLowerCase();
  return DESTRUCTIVE_KEYWORDS.some((kw) => {
    const re = new RegExp(`\\b${kw}\\b`);
    return re.test(lower);
  });
}

function isDestructiveRunConfirmationText(text: string): boolean {
  const lower = text.trim().toLowerCase();
  return lower === 'yes' || lower === 'confirm' || lower === 'proceed' || lower === 'do it';
}

test('isDestructiveRunGoal detects delete keyword', () => {
  assert.equal(isDestructiveRunGoal('delete the production database'), true);
});

test('isDestructiveRunGoal detects destroy keyword', () => {
  assert.equal(isDestructiveRunGoal('destroy all test data'), true);
});

test('isDestructiveRunGoal does not flag safe goals', () => {
  assert.equal(isDestructiveRunGoal('train the model with new data'), false);
  assert.equal(isDestructiveRunGoal('run evaluation benchmarks'), false);
  assert.equal(isDestructiveRunGoal('check system health'), false);
});

test('isDestructiveRunGoal detects clear keyword', () => {
  assert.equal(isDestructiveRunGoal('clear the cache directory'), true);
});

test('isDestructiveRunConfirmationText accepts yes', () => {
  assert.equal(isDestructiveRunConfirmationText('yes'), true);
});

test('isDestructiveRunConfirmationText accepts confirm', () => {
  assert.equal(isDestructiveRunConfirmationText('confirm'), true);
});

test('isDestructiveRunConfirmationText rejects casual text', () => {
  assert.equal(isDestructiveRunConfirmationText('maybe later'), false);
  assert.equal(isDestructiveRunConfirmationText('what does it do'), false);
});

test('isDestructiveRunConfirmationText rejects empty input', () => {
  assert.equal(isDestructiveRunConfirmationText(''), false);
});
