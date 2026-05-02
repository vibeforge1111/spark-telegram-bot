import assert from 'node:assert/strict';
import axios from 'axios';
import {
  formatCreatorMissionExecutionSummary,
  formatCreatorMissionStatusSummary,
  formatCreatorMissionSummary,
  formatCreatorMissionValidationSummary,
  spawner
} from '../src/spawner';

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
const originalBridgeKey = process.env.SPARK_BRIDGE_API_KEY;

function restoreAxios(): void {
  (axios as any).get = originalGet;
  (axios as any).post = originalPost;
}

function restoreEnv(): void {
  if (originalPort === undefined) delete process.env.TELEGRAM_RELAY_PORT;
  else process.env.TELEGRAM_RELAY_PORT = originalPort;
  if (originalProfile === undefined) delete process.env.SPARK_TELEGRAM_PROFILE;
  else process.env.SPARK_TELEGRAM_PROFILE = originalProfile;
  if (originalBridgeKey === undefined) delete process.env.SPARK_BRIDGE_API_KEY;
  else process.env.SPARK_BRIDGE_API_KEY = originalBridgeKey;
}

async function run(): Promise<void> {
  await test('runGoal posts Telegram relay metadata and orchestration options to Spawner', async () => {
    restoreAxios();
    process.env.TELEGRAM_RELAY_PORT = '8799';
    process.env.SPARK_TELEGRAM_PROFILE = 'spark-agi';
    process.env.SPARK_BRIDGE_API_KEY = 'bridge-secret-for-tests';

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
    assert.equal(capturedOptions.headers['x-api-key'], 'bridge-secret-for-tests');
    assert.equal(capturedOptions.headers['x-spawner-ui-key'], 'bridge-secret-for-tests');
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
          taskCount: 8,
          canvasUrl: 'http://spawner.test/canvas?pipeline=creator-tg-creator-1&mission=mission-creator-1',
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
    assert.equal(result.taskCount, 8);
    assert.equal(result.canvasUrl, 'http://spawner.test/canvas?pipeline=creator-tg-creator-1&mission=mission-creator-1');
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
          tasks: [{ id: 'creator-intent-plan' }, { id: 'benchmark-pack' }],
          intent_packet: {
            target_domain: 'Startup YC',
            privacy_mode: 'github_pr',
            risk_level: 'high'
          },
          links: {
            canvas: '/canvas?pipeline=creator-tg-creator-1&mission=mission-creator-1'
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
    assert.match(message, /Tasks: 2 queued/);
    assert.match(message, /Canvas: http:\/\/spawner\.test\/canvas\?pipeline=creator-tg-creator-1&mission=mission-creator-1/);
    assert.match(message, /Mission board: http:\/\/spawner\.test\/kanban\?mission=mission-creator-1/);
  });

  await test('creatorMissionExecute posts a planned creator mission run request to Spawner', async () => {
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
          started: true,
          providerId: 'codex',
          projectPath: 'C:\\Users\\USER\\Desktop',
          canvasUrl: 'http://spawner.test/canvas?pipeline=creator-tg-creator-1&mission=mission-creator-1',
          trace: {
            mission_id: 'mission-creator-1',
            request_id: 'tg-creator-1',
            links: {
              kanban: 'http://spawner.test/kanban?mission=mission-creator-1'
            }
          }
        }
      };
    };

    const result = await spawner.creatorMissionExecute({ missionId: 'mission-creator-1' });

    assert.equal(result.success, true);
    assert.equal(result.started, true);
    assert.equal(result.providerId, 'codex');
    assert.match(capturedUrl, /\/api\/creator\/mission\/execute$/);
    assert.deepEqual(capturedBody, { missionId: 'mission-creator-1' });
    assert.equal(capturedOptions.timeout, 1800000);
  });

  await test('formatCreatorMissionExecutionSummary renders execution links for Telegram', async () => {
    const message = formatCreatorMissionExecutionSummary(
      {
        success: true,
        missionId: 'mission-creator-1',
        started: true,
        providerId: 'codex',
        projectPath: 'C:\\Users\\USER\\Desktop',
        canvasUrl: '/canvas?pipeline=creator-tg-creator-1&mission=mission-creator-1',
        trace: {
          mission_id: 'mission-creator-1'
        }
      },
      'http://spawner.test/'
    );

    assert.match(message, /Creator mission execution started/);
    assert.match(message, /Mission: mission-creator-1/);
    assert.match(message, /Provider: Codex/);
    assert.match(message, /Workspace: C:\\Users\\USER\\Desktop/);
    assert.match(message, /Canvas: http:\/\/spawner\.test\/canvas\?pipeline=creator-tg-creator-1&mission=mission-creator-1/);
    assert.match(message, /Mission board: http:\/\/spawner\.test\/kanban\?mission=mission-creator-1/);
  });

  await test('creatorMissionStatus reads a creator mission trace from Spawner', async () => {
    restoreAxios();

    let capturedUrl = '';
    let capturedOptions: any = null;
    (axios as any).get = async (url: string, options: unknown) => {
      capturedUrl = url;
      capturedOptions = options;
      return {
        data: {
          ok: true,
          tracePath: 'C:\\Users\\USER\\.spawner\\creator-missions\\mission-creator-1.json',
          trace: {
            mission_id: 'mission-creator-1',
            request_id: 'tg-creator-1',
            current_stage: 'validation_completed',
            stage_status: 'validated',
            publish_readiness: 'workspace_validated',
            intent_packet: {
              target_domain: 'Startup YC',
              privacy_mode: 'local_only',
              risk_level: 'medium'
            }
          }
        }
      };
    };

    const result = await spawner.creatorMissionStatus({ missionId: 'mission-creator-1' });

    assert.equal(result.success, true);
    assert.equal(result.missionId, 'mission-creator-1');
    assert.equal(result.requestId, 'tg-creator-1');
    assert.match(capturedUrl, /\/api\/creator\/mission\?missionId=mission-creator-1$/);
    assert.equal(capturedOptions.timeout, 30000);
  });

  await test('formatCreatorMissionStatusSummary renders readiness and latest validation state', async () => {
    const message = formatCreatorMissionStatusSummary(
      {
        success: true,
        missionId: 'mission-creator-1',
        trace: {
          mission_id: 'mission-creator-1',
          current_stage: 'validation_failed',
          stage_status: 'failed',
          publish_readiness: 'workspace_prepared',
          artifacts: ['domain_chip', 'benchmark_pack'],
          artifact_manifest_validation_issues: [{ message: 'missing command' }],
          blockers: ['One or more validation commands failed.'],
          validation_runs: [
            {
              status: 'failed',
              results: [
                { status: 'passed' },
                { status: 'failed' },
                { status: 'skipped' }
              ]
            }
          ],
          intent_packet: {
            target_domain: 'Startup YC',
            privacy_mode: 'local_only',
            risk_level: 'medium'
          }
        }
      },
      'http://spawner.test/'
    );

    assert.match(message, /Creator mission status/);
    assert.match(message, /Mission: mission-creator-1/);
    assert.match(message, /Domain: Startup YC/);
    assert.match(message, /Stage: validation failed \(failed\)/);
    assert.match(message, /Publish readiness: workspace prepared/);
    assert.match(message, /Artifacts: 2/);
    assert.match(message, /Manifest issues: 1/);
    assert.match(message, /Latest validation: failed \(1 passed, 1 failed, 1 skipped\)/);
    assert.match(message, /Blockers: One or more validation commands failed/);
    assert.match(message, /Mission board: http:\/\/spawner\.test\/kanban\?mission=mission-creator-1/);
  });

  await test('creatorMissionValidate posts a creator validation request to Spawner', async () => {
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
          status: 'passed',
          run: {
            status: 'passed',
            results: [
              {
                artifact_id: 'startup-bench',
                command: 'python -m unittest discover -s tests -p "test_*.py"',
                status: 'passed',
                exit_code: 0
              }
            ]
          },
          trace: {
            mission_id: 'mission-creator-1',
            request_id: 'tg-creator-1'
          }
        }
      };
    };

    const result = await spawner.creatorMissionValidate({ missionId: 'mission-creator-1', maxCommands: 3 });

    assert.equal(result.success, true);
    assert.equal(result.status, 'passed');
    assert.match(capturedUrl, /\/api\/creator\/mission\/validate$/);
    assert.deepEqual(capturedBody, { missionId: 'mission-creator-1', maxCommands: 3 });
    assert.equal(capturedOptions.timeout, 1800000);
  });

  await test('formatCreatorMissionValidationSummary renders command totals and blockers', async () => {
    const message = formatCreatorMissionValidationSummary(
      {
        success: true,
        missionId: 'mission-creator-1',
        status: 'failed',
        run: {
          status: 'failed',
          results: [
            {
              artifact_id: 'domain-chip-startup-yc',
              command: 'python -m pytest tests',
              status: 'passed',
              exit_code: 0
            },
            {
              artifact_id: 'startup-bench',
              command: 'python -m thestartupbench run-suite examples/dev_scenario_suite.json baseline',
              status: 'failed',
              exit_code: 1,
              error: 'Validation command exited non-zero'
            }
          ]
        }
      },
      'http://spawner.test/'
    );

    assert.match(message, /Creator mission validation failed/);
    assert.match(message, /Mission: mission-creator-1/);
    assert.match(message, /Commands: 2/);
    assert.match(message, /Passed: 1/);
    assert.match(message, /Failed: 1/);
    assert.match(message, /Needs attention:/);
    assert.match(message, /startup-bench - python -m thestartupbench run-suite/);
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

  await test('latestProjectPreview returns the shipped app link for root route builds', async () => {
    restoreAxios();
    const now = Date.now();
    (axios as any).get = async () => ({
      data: {
        board: {
          running: [],
          paused: [],
          completed: [
            {
              missionId: 'mission-beauty',
              missionName: 'Beauty Centre Booking Website',
              status: 'completed',
              lastEventType: 'mission_completed',
              lastUpdated: new Date(now).toISOString(),
              lastSummary: 'Done',
              taskName: 'Polish booking flow',
              providerSummary: 'Codex: Replaced the root screen with a booking-first premium service menu in src/routes/+page.svelte.'
            }
          ],
          failed: [],
          created: []
        }
      }
    });

    const result = await spawner.latestProjectPreview();

    assert.equal(result.success, true);
    assert.match(result.message, /latest shipped app/);
    assert.match(result.message, /Beauty Centre Booking Website/);
    assert.match(result.message, /http:\/\/127\.0\.0\.1:5555/);
    assert.doesNotMatch(result.message, /Mission board/);
  });

  await test('latestProjectPreview returns static preview links from project paths', async () => {
    restoreAxios();
    const now = Date.now();
    (axios as any).get = async () => ({
      data: {
        board: {
          running: [],
          paused: [],
          completed: [
            {
              missionId: 'mission-static',
              missionName: 'Sprite Forge',
              status: 'completed',
              lastEventType: 'mission_completed',
              lastUpdated: new Date(now).toISOString(),
              lastSummary: 'Done',
              taskName: 'Ship static app',
              providerSummary: 'Codex: Built and verified `Sprite Forge` at `C:\\Users\\USER\\Desktop\\sprite-forge`.'
            }
          ],
          failed: [],
          created: []
        }
      }
    });

    const result = await spawner.latestProjectPreview();

    assert.equal(result.success, true);
    assert.match(result.message, /http:\/\/127\.0\.0\.1:5555\/preview\/[A-Za-z0-9_-]+\/index\.html/);
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
