import assert from 'node:assert/strict';
import { isSshSandboxSetupQuestion } from '../src/index';

function test(name: string, fn: () => void): void {
  try {
    fn();
    console.log(`ok - ${name}`);
  } catch (error) {
    console.error(`not ok - ${name}`);
    throw error;
  }
}

test('explain SSH sandbox setup triggers handler', () => {
  assert.equal(isSshSandboxSetupQuestion('explain SSH sandbox setup'), true);
});

test('how do I set up SSH triggers handler', () => {
  assert.equal(isSshSandboxSetupQuestion('how do I set up SSH'), true);
});

test('SSH remote lane config triggers handler', () => {
  assert.equal(isSshSandboxSetupQuestion('SSH remote lane config'), true);
});

test('set up ssh for spark triggers handler', () => {
  assert.equal(isSshSandboxSetupQuestion('set up ssh for spark'), true);
});

test('SSH sandbox triggers handler', () => {
  assert.equal(isSshSandboxSetupQuestion('SSH sandbox'), true);
});

test('StrictHostKeyChecking ssh triggers handler', () => {
  assert.equal(isSshSandboxSetupQuestion('ssh StrictHostKeyChecking setup'), true);
});

test('case-insensitive: ssh SANDBOX triggers handler', () => {
  assert.equal(isSshSandboxSetupQuestion('ssh SANDBOX'), true);
});

test('non-SSH question does not trigger handler', () => {
  assert.equal(isSshSandboxSetupQuestion('how do I run a mission'), false);
});

test('empty string does not trigger handler', () => {
  assert.equal(isSshSandboxSetupQuestion(''), false);
});

test('hostile: SSH connection dropped does not trigger handler', () => {
  assert.equal(isSshSandboxSetupQuestion('SSH connection dropped'), false);
});

test('hostile: ssh is optional does not trigger handler', () => {
  assert.equal(isSshSandboxSetupQuestion('ssh is optional'), false);
});
