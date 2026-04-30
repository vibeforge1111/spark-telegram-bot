import assert from 'node:assert/strict';
import axios from 'axios';
import { formatCreatorMissionSummary, spawner } from '../src/spawner';

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

const originalGet = axios.get;
const originalPost = axios.post;
const originalPort = process.env.TELEGRAM_RELAY_PORT;
const originalProfile = process.env.SPARK_TELEGRAM_PROFILE;

function restoreAxios(): void {
  (axios as any).get = originalGet;
  (axios as any).post = originalPost;
}

function restoreEnv(): void {
  if (originalPort === undefined) delete process.env.TELEGRAM_RELAY_PORT;
  else process.env.TELEGRAM_RELAY_PORT = originalPort;
  if (originalProfile === undefined) delete process.env.SPARK_TELEGRAM_PROFILE;
  else process.env.SPARK_TELEGRAM_PROFILE = originalProfile;
}

async function run(): Promise<void> {
  await test('runGoal posts Telegram relay metadata and orchestration options to Spawner', async () => {
    restoreAxios();
    process.env.TELEGRAM_RELAY_PORT = '8799';
    process.env.SPARK_TELEGRAM_PROFILE = 'spark-agi';

    let capturedUrl = '';
    let capturedBody: any = null;
    let capturedOptions: any = null;
    (axios as any).post = async (url: string, body: unknown, options: unknown) => {
      capturedUrl = url;
      capturedBody = body;
      capturedOptions = options;
      return {
        data: {
          success: true,
          missionId: 'spark-telegram-1',
          requestId: 'tg-req-1',
          providers: ['codex', 'claude']
        }
      };
    };

    const result = await spawner.runGoal({
      goal: 'Build a Kanban board from this Telegram message.',
      chatId: '123',
      userId: '456',
      requestId: 'tg-req-1',
      providers: ['codex', 'claude'],
      promptMode: 'orchestrator'
    });

    assert.equal(result.success, true);
    assert.equal(result.missionId, 'spark-telegram-1');
    assert.equal(result.requestId, 'tg-req-1');
    assert.deepEqual(result.providers, ['codex', 'claude']);
    assert.match(capturedUrl, /\/api\/spark\/run$/);
    assert.deepEqual(capturedBody, {
      goal: 'Build a Kanban board from this Telegram message.',
      chatId: '123',
      userId: '456',
      requestId: 'tg-req-1',
      telegramRelay: { port: 8799, profile: 'spark-agi' },
      providers: ['codex', 'claude'],
      promptMode: 'orchestrator'
    });
    assert.equal(capturedOptions.timeout, 1800000);
  });

  await test('runGoal retries once when local Spawner request times out', async () => {
    restoreAxios();
    let attempts = 0;
    (axios as any).post = async () => {
      attempts += 1;
      if (attempts === 1) {
        const error: any = new Error('timeout of 10000ms exceeded');
        error.code = 'ECONNABORTED';
        throw error;
      }
      return { data: { success: true, missionId: 'spark-after-retry' } };
    };

    const result = await spawner.runGoal({
      goal: 'Build after one timeout.',
      chatId: '123',
      userId: '456',
      requestId: 'tg-retry'
    });

    assert.equal(attempts, 2);
    assert.equal(result.success, true);
    assert.equal(result.missionId, 'spark-after-retry');
  });

  await test('runGoal falls back to the primary relay target when env values are invalid', async () => {
    restoreAxios();
    process.env.TELEGRAM_RELAY_PORT = 'not-a-port';
    process.env.SPARK_TELEGRAM_PROFILE = '   ';

    let capturedBody: any = null;
    (axios as any).post = async (_url: string, body: unknown) => {
      capturedBody = body;
      return { data: { success: true, missionId: 'spark-defaults' } };
    };

    const result = await spawner.runGoal({
      goal: 'Build a plain board.',
      chatId: '123',
      userId: '456',
      requestId: 'tg-defaults'
    });

    assert.equal(result.success, true);
    assert.deepEqual(capturedBody.telegramRelay, { port: 8788, profile: 'primary' });
    assert.equal(capturedBody.providers, undefined);
    assert.equal(capturedBody.promptMode, undefined);
  });

  await test('creatorMission posts creator planning input to Spawner', async () => {
    restoreAxios();

    let capturedUrl = '';
    let capturedBody: any = null;
    let capturedOptions: any = null;
    (axios as any).post = async (url: string, body: unknown, options: unknown) => {
      capturedUrl = url;
      capturedBody = body;
      capturedOptions = options;
      return {
        data: {
          ok: true,
          missionId: 'mission-creator-1',
          requestId: 'tg-creator-1',
          trace: {
            mission_id: 'mission-creator-1',
            request_id: 'tg-creator-1',
            creator_mode: 'full_path',
            artifacts: ['domain_chip', 'benchmark_pack'],
            intent_packet: {
              target_domain: 'Startup YC',
              privacy_mode: 'local_only',
              risk_level: 'medium'
            }
          }
        }
      };
    };

    const result = await spawner.creatorMission({
      brief: 'Create a Startup YC specialization path with benchmarked autoloop.',
      requestId: 'tg-creator-1',
      privacyMode: 'local_only',
      riskLevel: 'medium'
    });

    assert.equal(result.success, true);
    assert.equal(result.missionId, 'mission-creator-1');
    assert.equal(result.requestId, 'tg-creator-1');
    assert.match(capturedUrl, /\/api\/creator\/mission$/);
    assert.deepEqual(capturedBody, {
      brief: 'Create a Startup YC specialization path with benchmarked autoloop.',
      requestId: 'tg-creator-1',
      privacyMode: 'local_only',
      riskLevel: 'medium'
    });
    assert.equal(capturedOptions.timeout, 1800000);
  });

  await test('formatCreatorMissionSummary renders the creator mission packet for Telegram', async () => {
    const message = formatCreatorMissionSummary(
      {
        success: true,
        missionId: 'mission-creator-1',
        requestId: 'tg-creator-1',
        trace: {
          mission_id: 'mission-creator-1',
          creator_mode: 'full_path',
          artifacts: ['domain_chip', 'benchmark_pack', 'autoloop_policy'],
          intent_packet: {
            target_domain: 'Startup YC',
            privacy_mode: 'github_pr',
            risk_level: 'high'
          }
        }
      },
      'http://spawner.test/'
    );

    assert.match(message, /Creator mission planned/);
    assert.match(message, /Mission: mission-creator-1/);
    assert.match(message, /Mode: full path/);
    assert.match(message, /Domain: Startup YC/);
    assert.match(message, /Privacy: github_pr/);
    assert.match(message, /Risk: high/);
    assert.match(message, /Artifacts: domain_chip, benchmark_pack, autoloop_policy/);
    assert.match(message, /Mission board: http:\/\/spawner\.test\/kanban\?mission=mission-creator-1/);
  });

  await test('missionCommand formats provider status for Telegram', async () => {
    restoreAxios();
    (axios as any).post = async () => ({
      data: {
        status: {
          paused: false,
          allComplete: true,
          providers: {
            codex: 'completed',
            claude: 'running'
          }
        }
      }
    });

    const result = await spawner.missionCommand('status', 'spark-status');

    assert.equal(result.success, true);
    assert.match(result.message, /Mission: spark-status/);
    assert.match(result.message, /Complete: yes/);
    assert.match(result.message, /codex: completed/);
    assert.match(result.message, /claude: running/);
  });

  await test('missionCommand reports not-found status without inventing a mission', async () => {
    restoreAxios();
    (axios as any).post = async () => ({
      data: {
        ok: false,
        error: 'Mission spark-not-real was not found. Use /board to pick a current mission ID.'
      }
    });

    const result = await spawner.missionCommand('status', 'spark-not-real');

    assert.equal(result.success, false);
    assert.match(result.message, /not found/i);
    assert.doesNotMatch(result.message, /Providers:/);
  });

  await test('missionCommand reports rejected pause without claiming execution', async () => {
    restoreAxios();
    (axios as any).post = async () => ({
      data: {
        ok: false,
        error: 'Mission not-spark-id was not found. Use /board to pick a current mission ID.'
      }
    });

    const result = await spawner.missionCommand('pause', 'not-spark-id');

    assert.equal(result.success, false);
    assert.match(result.message, /not found/i);
    assert.doesNotMatch(result.message, /executed/i);
  });

  await test('board renders useful Kanban buckets and hides stale running missions', async () => {
    restoreAxios();
    const now = Date.now();
    (axios as any).get = async () => ({
      data: {
        board: {
          running: [
            {
              missionId: 'spark-fresh',
              status: 'running',
              lastEventType: 'task_progress',
              lastUpdated: new Date(now - 60_000).toISOString(),
              lastSummary: 'Working',
              taskName: 'Build canvas sync'
            },
            {
              missionId: 'spark-stale',
              status: 'running',
              lastEventType: 'task_progress',
              lastUpdated: new Date(now - 60 * 60_000).toISOString(),
              lastSummary: 'Old',
              taskName: 'Old task'
            }
          ],
          paused: [],
          completed: [
            {
              missionId: 'spark-done',
              status: 'completed',
              lastEventType: 'mission_completed',
              lastUpdated: new Date(now).toISOString(),
              lastSummary: 'Done',
              taskName: null
            }
          ],
          failed: [],
          created: []
        }
      }
    });

    const result = await spawner.board();

    assert.equal(result.success, true);
    assert.match(result.message, /Running: 1/);
    assert.match(result.message, /- spark-fresh \| Build canvas sync/);
    assert.doesNotMatch(result.message, /spark-stale/);
    assert.match(result.message, /Completed: 1/);
    assert.match(result.message, /- spark-done/);
  });

  await test('board tolerates malformed board buckets from Spawner', async () => {
    restoreAxios();
    (axios as any).get = async () => ({
      data: {
        board: {
          running: { nope: true },
          paused: null,
          completed: 'bad',
          failed: undefined,
          created: []
        }
      }
    });

    const result = await spawner.board();

    assert.equal(result.success, true);
    assert.match(result.message, /Running: 0/);
    assert.match(result.message, /Paused: 0/);
    assert.match(result.message, /Completed: 0/);
  });

  await test('latestKanbanSummary reports the newest board-visible mission', async () => {
    restoreAxios();
    const now = Date.now();
    (axios as any).get = async () => ({
      data: {
        board: {
          running: [],
          paused: [],
          completed: [
            {
              missionId: 'mission-older',
              missionName: 'Older canvas mission',
              status: 'completed',
              lastEventType: 'mission_completed',
              lastUpdated: new Date(now - 60_000).toISOString(),
              lastSummary: 'Done',
              taskName: 'Old task',
              providerSummary: 'Claude: done'
            },
            {
              missionId: 'mission-newer',
              missionName: 'Fresh canvas mission',
              status: 'completed',
              lastEventType: 'mission_completed',
              lastUpdated: new Date(now).toISOString(),
              lastSummary: 'Done',
              taskName: 'Render page',
              taskNames: ['Render page', 'Write README'],
              telegramRelay: { port: 8789, profile: 'spark-agi' },
              providerResults: [{ providerId: 'codex', status: 'completed', summary: 'OK' }],
              providerSummary: 'Codex: OK'
            }
          ],
          failed: [],
          created: []
        }
      }
    });

    const result = await spawner.latestKanbanSummary();

    assert.equal(result.success, true);
    assert.match(result.message, /latest mission is visible on Kanban/);
    assert.doesNotMatch(result.message, /^Yes,/);
    assert.match(result.message, /Mission: mission-newer/);
    assert.match(result.message, /Tasks: Render page, Write README/);
    assert.match(result.message, /Provider: Codex/);
    assert.match(result.message, /Relay: spark-agi:8789/);
    assert.doesNotMatch(result.message, /mission-older/);
  });

  await test('latestProviderSummary reports the provider for the newest Spawner job', async () => {
    restoreAxios();
    const now = Date.now();
    (axios as any).get = async () => ({
      data: {
        board: {
          running: [
            {
              missionId: 'spark-live',
              missionName: 'Live smoke',
              status: 'running',
              lastEventType: 'task_started',
              lastUpdated: new Date(now).toISOString(),
              lastSummary: 'Working',
              taskName: 'codex',
              providerResults: [{ providerId: 'codex', status: 'running' }]
            }
          ],
          paused: [],
          completed: [
            {
              missionId: 'spark-done',
              status: 'completed',
              lastEventType: 'mission_completed',
              lastUpdated: new Date(now - 30_000).toISOString(),
              lastSummary: 'Done',
              taskName: 'zai',
              providerSummary: 'zai: done'
            }
          ],
          failed: [],
          created: []
        }
      }
    });

    const result = await spawner.latestProviderSummary();

    assert.equal(result.success, true);
    assert.match(result.message, /handled by: Codex/);
    assert.match(result.message, /Mission: spark-live/);
    assert.doesNotMatch(result.message, /spark-done/);
  });
}

run()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => {
    restoreAxios();
    restoreEnv();
  });
