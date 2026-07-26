import assert from 'node:assert/strict';
import axios from 'axios';
import {
  createHarnessCoreActionEnvelopeVNext,
  createHarnessCoreAuthorizedGovernorDecision
} from '@spark/harness-core';
import { spawner } from '../src/spawner';

type AsyncTest = () => Promise<void> | void;

async function test(name: string, fn: AsyncTest): Promise<void> {
  try {
    await fn();
    console.log(`ok - ${name}`);
  } catch (error) {
    console.error(`not ok - ${name}`);
    throw error;
  }
}

const originalPost = axios.post;

function fakeExecutionAuthority(): unknown {
  const envelope = createHarnessCoreActionEnvelopeVNext({
    surface: 'telegram',
    ownerSystem: 'spawner-ui',
    toolName: 'spawner.run',
    mutationClass: 'launches_mission',
    source: 'spawnerRunGoalClosure.test',
    reason: 'Test Harness Core authority for Spawner closure.',
    requestId: 'turn:spawner-run-closure',
    actorIdRef: 'telegram-human'
  });
  return createHarnessCoreAuthorizedGovernorDecision({ envelope, tool_name: 'spawner.run' });
}

async function run(): Promise<void> {
  await test('runGoal fails closed when Spawner reports success without mission id', async () => {
    (axios as any).post = async () => ({ data: { success: true, requestId: 'tg-missing-mission', providers: ['codex'] } });

    const result = await spawner.runGoal({
      goal: 'Run a no-edit closure proof.',
      chatId: '123',
      userId: '456',
      requestId: 'tg-missing-mission',
      executionAuthority: fakeExecutionAuthority()
    });

    assert.equal(result.success, false);
    assert.match(result.error || '', /missing mission id/i);
  });
}

run()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => {
    (axios as any).post = originalPost;
  });
