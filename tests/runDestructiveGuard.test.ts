import assert from 'node:assert/strict';
import {
  isDestructiveRunConfirmationText,
  isDestructiveRunGoal,
  renderDestructiveRunConfirmationPrompt
} from '../src/runDestructiveGuard';

async function test(name: string, fn: () => void | Promise<void>): Promise<void> {
  try {
    await fn();
    console.log(`ok - ${name}`);
  } catch (error) {
    console.error(`not ok - ${name}`);
    throw error;
  }
}

async function main(): Promise<void> {
  await test('flags destructive delete and rm -rf goals', () => {
    assert.equal(isDestructiveRunGoal('delete all files in the production database'), true);
    assert.equal(isDestructiveRunGoal('rm -rf /var/lib/spark'), true);
    assert.equal(isDestructiveRunGoal('build a landing page for the docs site'), false);
  });

  await test('accepts only explicit destructive run confirmations', () => {
    assert.equal(isDestructiveRunConfirmationText('yes, run destructive'), true);
    assert.equal(isDestructiveRunConfirmationText('confirm destructive run'), true);
    assert.equal(isDestructiveRunConfirmationText('yes run it'), false);
    assert.equal(isDestructiveRunConfirmationText('delete everything now'), false);
  });

  await test('renders confirmation prompt with goal preview and next step', () => {
    const reply = renderDestructiveRunConfirmationPrompt('wipe the workspace database before redeploy');
    assert.match(reply, /looks destructive/i);
    assert.match(reply, /wipe the workspace database/);
    assert.match(reply, /yes, run destructive/i);
  });
}

void main();
