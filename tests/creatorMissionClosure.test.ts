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
    await test('Loop Engineering staging fails closed when Spawner omits mission and staged artifact proof', async () => {
      (axios as any).post = async () => ({ data: { ok: true, taskCount: 3 } });
      const result = await spawner.creatorMission({
        brief: 'Create a DCL Loop Engineering system for research notes.',
        requestId: 'tg-creator-missing-proof',
        privacyMode: 'local_only',
        riskLevel: 'medium'
      });
      const message = formatCreatorMissionSummary(result);

      assert.equal(result.success, false);
      assert.match(result.error || '', /missing mission id or staged artifact proof/i);
      assert.match(message, /Loop Engineering staging failed/);
      assert.doesNotMatch(message, /Creator mission|Creator plan ready|Private path staged|Creator plan is staged/);
      assert.doesNotMatch(message, /Board: .*\/kanban$/m);
    });

    await test('Loop Engineering treats staged artifact proof without mission id as review-only', async () => {
      (axios as any).post = async () => ({
        data: {
          ok: true,
          requestId: 'tg-creator-review-only',
          taskCount: 4,
          reviewPath: '/creator/review/tg-creator-review-only',
          trace: {
            execution_policy: 'manual_run',
            artifacts: ['domain_chip', 'benchmark_pack'],
            intent_packet: { target_domain: 'Research Notes', privacy_mode: 'local_only', risk_level: 'medium' }
          }
        }
      });
      const result = await spawner.creatorMission({
        brief: 'Create a DCL Loop Engineering system for research notes.',
        requestId: 'tg-creator-review-only',
        privacyMode: 'local_only',
        riskLevel: 'medium'
      });
      const message = formatCreatorMissionSummary(result, 'http://spawner.test/');

      assert.equal(result.success, true);
      assert.equal(result.missionId, undefined);
      assert.equal(result.tracePath, '/creator/review/tg-creator-review-only');
      assert.match(message, /4 tasks staged/);
      assert.match(message, /Review: http:\/\/spawner\.test\/creator\/review\/tg-creator-review-only/);
      assert.doesNotMatch(message, /say: run it/);
      assert.doesNotMatch(message, /Creator mission|Creator plan/);
      assert.doesNotMatch(message, /Board: http:\/\/spawner\.test\/kanban$/m);
      assert.doesNotMatch(message, /kanban\?mission=staged-review/);
    });

    await test('Loop Engineering rejects local filesystem paths as closure proof', async () => {
      (axios as any).post = async () => ({ data: { ok: true, artifactPath: '/Users/alchemistab/.spark/private/creator-plan.json' } });
      const result = await spawner.creatorMission({
        brief: 'Create a private DCL Loop Engineering system.',
        requestId: 'tg-creator-local-path',
        privacyMode: 'local_only',
        riskLevel: 'medium'
      });

      assert.equal(result.success, false);
      assert.match(result.error || '', /missing mission id or staged artifact proof/i);
    });
  } finally {
    (axios as any).post = originalPost;
  }
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
