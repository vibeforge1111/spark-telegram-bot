import assert from 'node:assert/strict';
import { isRevokeAllGoal } from '../src/index';

function test(name: string, fn: () => void): void {
  try {
    fn();
    console.log(`ok - ${name}`);
  } catch (error) {
    console.error(`not ok - ${name}`);
    throw error;
  }
}

test('spark security revoke triggers gate', () => {
  assert.equal(isRevokeAllGoal('spark security revoke'), true);
});

test('spark security revoke-all triggers gate', () => {
  assert.equal(isRevokeAllGoal('spark security revoke-all'), true);
});

test('revoke-all triggers gate', () => {
  assert.equal(isRevokeAllGoal('revoke-all credentials'), true);
});

test('revoke all (spaced) triggers gate', () => {
  assert.equal(isRevokeAllGoal('revoke all sessions'), true);
});

test('non-destructive goal does not trigger gate', () => {
  assert.equal(isRevokeAllGoal('build a landing page'), false);
});

test('empty string does not trigger gate', () => {
  assert.equal(isRevokeAllGoal(''), false);
});

test('case-insensitive: REVOKE-ALL triggers gate', () => {
  assert.equal(isRevokeAllGoal('REVOKE-ALL'), true);
});

test('case-insensitive: Spark Security Revoke triggers gate', () => {
  assert.equal(isRevokeAllGoal('Spark Security Revoke credentials'), true);
});

test('hostile: irrevocable does not trigger gate', () => {
  assert.equal(isRevokeAllGoal('this action is irrevocable'), false);
});

test('hostile: revoke one token (no all/security) does not trigger gate', () => {
  assert.equal(isRevokeAllGoal('revoke one token'), false);
});
