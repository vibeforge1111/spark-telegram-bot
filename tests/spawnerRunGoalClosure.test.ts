import assert from 'node:assert/strict';
import axios from 'axios';
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

async function run(): Promise<void> {
  await test('runGoal fails closed when Spawner reports success without mission id', async () => {
    (axios as any).post = async () => ({ data: { success: true, requestId: 'tg-missing-mission', providers: ['codex'] } });

    const result = await spawner.runGoal({
      goal: 'Run a no-edit closure proof.',
      chatId: '123',
      userId: '456',
      requestId: 'tg-missing-mission'
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
