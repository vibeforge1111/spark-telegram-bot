import assert from 'node:assert/strict';
import { isDestructiveGoal } from '../src/index';

function test(name: string, fn: () => void): void {
  try {
    fn();
    console.log(`ok - ${name}`);
  } catch (error) {
    console.error(`not ok - ${name}`);
    throw error;
  }
}

test('delete keyword triggers destructive gate', () => {
  assert.equal(isDestructiveGoal('delete all my notes'), true);
});

test('remove keyword triggers destructive gate', () => {
  assert.equal(isDestructiveGoal('remove the project'), true);
});

test('drop keyword triggers destructive gate', () => {
  assert.equal(isDestructiveGoal('drop the database'), true);
});

test('wipe keyword triggers destructive gate', () => {
  assert.equal(isDestructiveGoal('wipe everything'), true);
});

test('purge keyword triggers destructive gate', () => {
  assert.equal(isDestructiveGoal('purge old files'), true);
});

test('force keyword triggers destructive gate', () => {
  assert.equal(isDestructiveGoal('force reset the state'), true);
});

test('non-destructive goal does not trigger gate', () => {
  assert.equal(isDestructiveGoal('build a landing page'), false);
});

test('empty string does not trigger gate', () => {
  assert.equal(isDestructiveGoal(''), false);
});

test('keyword detection is case-insensitive', () => {
  assert.equal(isDestructiveGoal('DELETE all my notes'), true);
  assert.equal(isDestructiveGoal('Wipe the slate'), true);
});

test('keyword must be a whole word — partial match does not trigger gate', () => {
  assert.equal(isDestructiveGoal('forced to choose'), false);
  assert.equal(isDestructiveGoal('dropdown menu'), false);
});
