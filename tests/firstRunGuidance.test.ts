import assert from 'node:assert/strict';
import {
  isPostInstallFirstRunQuestion,
  resolvePostInstallPath,
  renderPostInstallClarificationQuestion,
  renderPostInstallNextAction
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

test('post-install query triggers clarification', () => {
  assert.equal(isPostInstallFirstRunQuestion('I just finished installing Spark. What should I do first?'), true);
});

test('just installed Spark triggers clarification', () => {
  assert.equal(isPostInstallFirstRunQuestion('I just installed Spark'), true);
});

test('after installing Spark triggers clarification', () => {
  assert.equal(isPostInstallFirstRunQuestion('after installing Spark what do I run?'), true);
});

test('what should I do first with install context triggers clarification', () => {
  assert.equal(isPostInstallFirstRunQuestion('What should I do first after Spark install?'), true);
});

test('clarification reply asks Telegram vs CLI, not both next steps', () => {
  const reply = renderPostInstallClarificationQuestion();
  assert.ok(/telegram/i.test(reply), 'reply must mention Telegram');
  assert.ok(/cli/i.test(reply), 'reply must mention CLI');
  assert.ok(!/spark verify.*spark live|spark live.*spark verify/i.test(reply), 'reply must not mix both next steps');
});

test('telegram path gives single next action with /start, no CLI commands', () => {
  const reply = renderPostInstallNextAction('telegram');
  assert.ok(/\/start/i.test(reply), 'telegram reply must mention /start');
  assert.ok(!/spark verify|spark live/i.test(reply), 'telegram reply must not contain CLI commands');
});

test('CLI path gives single next action with spark verify, no Telegram instructions', () => {
  const reply = renderPostInstallNextAction('cli');
  assert.ok(/spark verify/i.test(reply), 'cli reply must mention spark verify');
  assert.ok(!/\/start\b/i.test(reply), 'cli reply must not contain /start');
});

test('resolvePostInstallPath: telegram answer', () => {
  assert.equal(resolvePostInstallPath('Telegram'), 'telegram');
});

test('resolvePostInstallPath: cli answer', () => {
  assert.equal(resolvePostInstallPath('CLI'), 'cli');
});

test('resolvePostInstallPath: local cli maps to cli', () => {
  assert.equal(resolvePostInstallPath('local cli'), 'cli');
});

test('resolvePostInstallPath: unrecognized answer returns null', () => {
  assert.equal(resolvePostInstallPath('not sure'), null);
});

test('non-post-install question does not trigger handler', () => {
  assert.equal(isPostInstallFirstRunQuestion('how do I run a mission'), false);
});

test('empty string does not trigger handler', () => {
  assert.equal(isPostInstallFirstRunQuestion(''), false);
});

test('hostile: no spark context does not trigger handler', () => {
  assert.equal(isPostInstallFirstRunQuestion('I just finished installing node'), false);
});
