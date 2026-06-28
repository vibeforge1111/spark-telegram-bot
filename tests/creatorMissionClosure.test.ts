import assert from 'node:assert/strict';
import axios from 'axios';
import { formatCreatorMissionSummary, spawner } from '../src/spawner';

async function test(name: string, fn: () => Promise<void> | void): Promise<void> {
  try {
    await fn();
    console.log(`ok - ${name}`);
  } catch (error) {
    console.error(`not ok - ${name}`);
    throw error;
  }
}

async function run(): Promise<void> {
  const originalPost = axios.post;
  try {
    await test('creatorMission fails closed when Spawner omits mission and staged artifact proof', async () => {
      (axios as any).post = async () => ({ data: { ok: true, taskCount: 3 } });
      const result = await spawner.creatorMission({
        brief: 'Create a DCL creator system for research notes.',
        requestId: 'tg-creator-missing-proof',
        privacyMode: 'local_only',
        riskLevel: 'medium'
      });
      const message = formatCreatorMissionSummary(result);

      assert.equal(result.success, false);
      assert.match(result.error || '', /missing mission id or staged artifact proof/i);
      assert.match(message, /Creator mission failed/);
      assert.doesNotMatch(message, /Creator plan ready|Private path staged|Creator plan is staged/);
      assert.doesNotMatch(message, /Board: .*\/kanban$/m);
    });
  } finally {
    (axios as any).post = originalPost;
  }
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
