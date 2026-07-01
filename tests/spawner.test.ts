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
const originalUiKey = process.env.SPARK_UI_API_KEY;

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
  if (originalUiKey === undefined) delete process.env.SPARK_UI_API_KEY;
  else process.env.SPARK_UI_API_KEY = originalUiKey;
}

async function run(): Promise<void> {
  await test('runGoal posts Telegram relay metadata and orchestration options to Spawner', async () => {
    restoreAxios();
    process.env.TELEGRAM_RELAY_PORT = '8799';
    process.env.SPARK_TELEGRAM_PROFILE = 'spark-agi';
    process.env.SPARK_BRIDGE_API_KEY = 'bridge-secret-for-tests';
    process.env.SPARK_UI_API_KEY = 'ui-secret-for-tests';

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
      missionName: 'Telegram Kanban Board',
      chatId: '123',
      userId: '456',
      requestId: 'tg-req-1',
      traceRef: 'trace:telegram-run:tg-req-1',
      providers: ['codex', 'claude'],
      promptMode: 'orchestrator'
    });

    assert.equal(result.success, true);
    assert.equal(result.missionId, 'spark-telegram-1');
    assert.equal(result.requestId, 'tg-req-1');
    assert.deepEqual(result.providers, ['codex', 'claude']);
    assert.match(capturedUrl, /\/api\/spark\/run$/);
    const { executionAuthority, ...capturedBodyWithoutAuthority } = capturedBody;
    assert.deepEqual(capturedBodyWithoutAuthority, {
      goal: 'Build a Kanban board from this Telegram message.',
      missionName: 'Telegram Kanban Board',
      chatId: '123',
      userId: '456',
      requestId: 'tg-req-1',
      traceRef: 'trace:telegram-run:tg-req-1',
      telegramRelay: { port: 8799, profile: 'spark-agi' },
      providers: ['codex', 'claude'],
      promptMode: 'orchestrator'
    });
    assert.equal(executionAuthority.schema_version, 'governor-decision-v1');
    assert.equal(executionAuthority.outcome, 'execute');
    assert.match(executionAuthority.envelope.proposed_actions[0].capability_id, /spawner-ui:spawner\.run$/);
    assert.equal(executionAuthority.envelope.proposed_actions[0].action_type, 'launch_mission');
    assert.equal(executionAuthority.tool_ledgers[0].tool_name, 'spawner.run');
    assert.equal(executionAuthority.execution_boundary.action_authorized, true);
    assert.equal(capturedOptions.timeout, 1800000);
    assert.equal(capturedOptions.headers['x-api-key'], 'bridge-secret-for-tests');
    assert.equal(capturedOptions.headers['x-spawner-ui-key'], 'ui-secret-for-tests');
  });

  await test('runGoal forwards native Governor authority when supplied', async () => {
    restoreAxios();
    process.env.SPARK_BRIDGE_API_KEY = 'bridge-secret-for-tests';

    const executionAuthority = {
      schema_version: 'governor-decision-v1',
      outcome: 'execute',
      envelope: {
        schema_version: 'turn-intent-envelope-vnext',
        turn_id: 'turn:telegram-spawner-run',
        tool_name: 'spawner.run',
        mutation_class: 'launches_mission'
      },
      execution_boundary: { action_authorized: true },
      tool_ledgers: [
        {
          schema_version: 'tool-call-ledger-v1',
          tool_name: 'spawner.run'
        }
      ]
    };
    let capturedBody: any = null;
    (axios as any).post = async (_url: string, body: unknown) => {
      capturedBody = body;
      return { data: { success: true, missionId: 'spark-vnext-run' } };
    };

    const result = await spawner.runGoal({
      goal: 'Run a no-edit Spawner proof mission.',
      chatId: '123',
      userId: '456',
      requestId: 'tg-vnext-run',
      executionAuthority
    });

    assert.equal(result.success, true);
    assert.equal(capturedBody.executionAuthority, executionAuthority);
  });

  await test('runGoal falls back to the bridge key for hosted UI auth when no UI key is configured', async () => {
    restoreAxios();
    process.env.SPARK_BRIDGE_API_KEY = 'bridge-secret-for-tests';
    delete process.env.SPARK_UI_API_KEY;

    let capturedOptions: any = null;
    (axios as any).post = async (_url: string, _body: unknown, options: unknown) => {
      capturedOptions = options;
      return { data: { success: true, missionId: 'spark-bridge-fallback' } };
    };

    const result = await spawner.runGoal({
      goal: 'Build with bridge fallback.',
      chatId: '123',
      userId: '456',
      requestId: 'tg-bridge-fallback'
    });

    assert.equal(result.success, true);
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

  await test('runLoopEngineeringBenchmark posts to Spawner command-result endpoint with Governor authority', async () => {
    restoreAxios();
    let capturedUrl = '';
    let capturedBody: any = null;
    (axios as any).post = async (url: string, body: unknown) => {
      capturedUrl = url;
      capturedBody = body;
      return {
        data: {
          ok: true,
          event: { id: 'lee-1', eventType: 'benchmark_run', status: 'queued' },
          mission: { id: 'spark-loop-1' },
          commandResult: {
            action: 'benchmark_run_queued',
            launchedMission: true,
            missionId: 'spark-loop-1',
            eventId: 'lee-1',
            inspectUrl: '/loop-engineering/domain-chip-prd-writing-proof-loop',
            userMessage: 'Queued a private benchmark mission.'
          }
        }
      };
    };

    const result = await spawner.runLoopEngineeringBenchmark({
      chipKey: 'domain-chip-prd-writing-proof-loop',
      objective: 'Run one private benchmark.',
      benchmarkCaseIds: ['held-out-1'],
      requestId: 'tg-loop-benchmark'
    });

    assert.equal(result.success, true);
    assert.equal(result.action, 'benchmark_run_queued');
    assert.equal(result.missionId, 'spark-loop-1');
    assert.equal(result.inspectUrl, 'http://127.0.0.1:3333/loop-engineering/domain-chip-prd-writing-proof-loop');
    assert.match(capturedUrl, /\/api\/loop-engineering\/chips\/domain-chip-prd-writing-proof-loop\/benchmarks\/run$/);
    assert.equal(capturedBody.sourceSurface, 'telegram');
    assert.deepEqual(capturedBody.benchmarkCaseIds, ['held-out-1']);
    assert.equal(capturedBody.executionAuthority.schema_version, 'governor-decision-v1');
    assert.equal(capturedBody.executionAuthority.tool_ledgers[0].tool_name, 'spawner.loop_engineering.benchmark.run');
  });

  await test('runLoopEngineeringLoop posts capped loop runs to Spawner with loop authority', async () => {
    restoreAxios();
    let capturedUrl = '';
    let capturedBody: any = null;
    (axios as any).post = async (url: string, body: unknown) => {
      capturedUrl = url;
      capturedBody = body;
      return {
        data: {
          ok: true,
          event: { id: 'lee-2', eventType: 'loop_batch', status: 'queued' },
          mission: { id: 'spark-loop-2' },
          commandResult: {
            action: 'loop_run_queued',
            launchedMission: true,
            missionId: 'spark-loop-2',
            eventId: 'lee-2',
            inspectUrl: '/loop-engineering/domain-chip-prd-writing-proof-loop',
            userMessage: 'Queued a capped private loop mission.'
          }
        }
      };
    };

    const result = await spawner.runLoopEngineeringLoop({
      chipKey: 'domain-chip-prd-writing-proof-loop',
      objective: 'Improve PRD quality.',
      roundLimit: 3,
      requestId: 'tg-loop-run'
    });

    assert.equal(result.success, true);
    assert.equal(result.action, 'loop_run_queued');
    assert.equal(result.missionId, 'spark-loop-2');
    assert.equal(result.inspectUrl, 'http://127.0.0.1:3333/loop-engineering/domain-chip-prd-writing-proof-loop');
    assert.match(capturedUrl, /\/api\/loop-engineering\/chips\/domain-chip-prd-writing-proof-loop\/loops\/run$/);
    assert.equal(capturedBody.roundLimit, 3);
    assert.equal(capturedBody.executionAuthority.schema_version, 'governor-decision-v1');
    assert.equal(capturedBody.executionAuthority.tool_ledgers[0].tool_name, 'spawner.loop_engineering.loop.run');
  });

  await test('completeLoopEngineeringRun binds evaluator-backed completion events through Spawner', async () => {
    restoreAxios();
    let capturedUrl = '';
    let capturedBody: any = null;
    (axios as any).post = async (url: string, body: unknown) => {
      capturedUrl = url;
      capturedBody = body;
      return {
        data: {
          ok: true,
          event: { id: 'lee-loop-2', eventType: 'loop_batch', status: 'passed' },
          commandResult: {
            action: 'run_completion_bound',
            launchedMission: false,
            missionId: 'spark-loop-2',
            eventId: 'lee-loop-2',
            inspectUrl: '/loop-engineering/domain-chip-prd-writing-proof-loop',
            userMessage: 'Bound evaluator-backed completion for domain-chip-prd-writing-proof-loop.'
          }
        }
      };
    };

    const result = await spawner.completeLoopEngineeringRun({
      chipKey: 'domain-chip-prd-writing-proof-loop',
      eventId: 'lee-loop-2',
      status: 'passed',
      previousScore: 6,
      candidateScore: 8.4,
      roundsObserved: 3,
      evidenceRefs: ['reports/prd-eval.json'],
      sourceRef: 'mission-control:spark-loop-2',
      evaluatorVerdictRef: 'reports/prd-verdict.json',
      requestId: 'tg-loop-complete'
    });

    assert.equal(result.success, true);
    assert.equal(result.action, 'run_completion_bound');
    assert.equal(result.missionId, 'spark-loop-2');
    assert.equal(result.inspectUrl, 'http://127.0.0.1:3333/loop-engineering/domain-chip-prd-writing-proof-loop');
    assert.match(capturedUrl, /\/api\/loop-engineering\/events\/lee-loop-2\/complete$/);
    assert.equal(capturedBody.chipKey, 'domain-chip-prd-writing-proof-loop');
    assert.equal(capturedBody.status, 'passed');
    assert.equal(capturedBody.evaluatorSeparated, true);
    assert.deepEqual(capturedBody.evidenceRefs, ['reports/prd-eval.json']);
    assert.equal(capturedBody.evaluatorVerdictRef, 'reports/prd-verdict.json');
    assert.equal(capturedBody.executionAuthority.schema_version, 'governor-decision-v1');
    assert.equal(capturedBody.executionAuthority.tool_ledgers[0].tool_name, 'spawner.loop_engineering.event.complete');
  });

  await test('listLoopEngineeringChips reads Spawner Loop Engineering registry', async () => {
    restoreAxios();
    let capturedUrl = '';
    (axios as any).get = async (url: string) => {
      capturedUrl = url;
      return {
        data: {
          ok: true,
          registry: {
            chips: [
              {
                id: 'domain-chip-prd-writing-proof-loop',
                domain: 'PRD Writing',
                statusLabel: 'Private candidate',
                benchmark: { utilityDelta: 2.4 }
              }
            ]
          }
        }
      };
    };

    const result = await spawner.listLoopEngineeringChips();

    assert.equal(result.success, true);
    assert.match(capturedUrl, /\/api\/loop-engineering\/chips$/);
    assert.equal(result.chips?.[0]?.id, 'domain-chip-prd-writing-proof-loop');
    assert.equal(result.inspectUrl, 'http://127.0.0.1:3333/loop-engineering');
  });

  await test('recordLoopEngineeringEvaluatorReview posts separated evaluator evidence to Spawner', async () => {
    restoreAxios();
    let capturedUrl = '';
    let capturedBody: any = null;
    (axios as any).post = async (url: string, body: unknown) => {
      capturedUrl = url;
      capturedBody = body;
      return {
        data: {
          ok: true,
          event: { id: 'lee-eval', eventType: 'evaluator_review', status: 'passed' },
          commandResult: {
            action: 'evaluator_review_recorded',
            eventId: 'lee-eval',
            inspectUrl: '/loop-engineering/domain-chip-prd-writing-proof-loop',
            userMessage: 'Recorded separated evaluator evidence.'
          }
        }
      };
    };

    const result = await spawner.recordLoopEngineeringEvaluatorReview({
      chipKey: 'domain-chip-prd-writing-proof-loop',
      previousScore: 6,
      candidateScore: 8.4,
      roundsObserved: 3,
      evidenceRefs: ['reports/prd-eval.json'],
      requestId: 'tg-loop-eval'
    });

    assert.equal(result.success, true);
    assert.equal(result.action, 'evaluator_review_recorded');
    assert.match(capturedUrl, /\/api\/loop-engineering\/chips\/domain-chip-prd-writing-proof-loop\/evaluator-review$/);
    assert.equal(capturedBody.evaluatorSeparated, true);
    assert.equal(capturedBody.previousScore, 6);
    assert.equal(capturedBody.candidateScore, 8.4);
    assert.equal(capturedBody.executionAuthority.schema_version, 'governor-decision-v1');
    assert.equal(capturedBody.executionAuthority.tool_ledgers[0].tool_name, 'spawner.loop_engineering.evaluator_review.record');
  });

  await test('distillLoopEngineeringLessons posts evaluator-backed lessons to Spawner', async () => {
    restoreAxios();
    let capturedUrl = '';
    let capturedBody: any = null;
    (axios as any).post = async (url: string, body: unknown) => {
      capturedUrl = url;
      capturedBody = body;
      return {
        data: {
          ok: true,
          distillation: { id: 'distill-1', status: 'staged' },
          event: { id: 'lee-distill', eventType: 'distillation', status: 'passed' },
          commandResult: {
            action: 'distillation_staged',
            eventId: 'lee-distill',
            inspectUrl: '/loop-engineering/domain-chip-prd-writing-proof-loop',
            userMessage: 'Distilled evaluator-backed lessons.'
          }
        }
      };
    };

    const result = await spawner.distillLoopEngineeringLessons({
      chipKey: 'domain-chip-prd-writing-proof-loop',
      sourceEvaluatorEventId: 'lee-eval',
      lessons: ['Resolve user, owner, success metric, and acceptance criteria first.'],
      runtimeNotes: 'Use as staged PRD Writing guidance.',
      tokenBudgetHint: 'Try distilled checklist before a full loop.',
      requestId: 'tg-loop-distill'
    });

    assert.equal(result.success, true);
    assert.equal(result.action, 'distillation_staged');
    assert.match(capturedUrl, /\/api\/loop-engineering\/chips\/domain-chip-prd-writing-proof-loop\/distill$/);
    assert.equal(capturedBody.sourceEvaluatorEventId, 'lee-eval');
    assert.deepEqual(capturedBody.lessons, ['Resolve user, owner, success metric, and acceptance criteria first.']);
    assert.equal(capturedBody.executionAuthority.schema_version, 'governor-decision-v1');
    assert.equal(capturedBody.executionAuthority.tool_ledgers[0].tool_name, 'spawner.loop_engineering.distill.stage');
  });

  await test('stageLoopEngineeringActivation posts staged activation rules to Spawner', async () => {
    restoreAxios();
    let capturedUrl = '';
    let capturedBody: any = null;
    (axios as any).post = async (url: string, body: unknown) => {
      capturedUrl = url;
      capturedBody = body;
      return {
        data: {
          ok: true,
          activationRule: { id: 'activation-1', status: 'staged' },
          event: { id: 'lee-activation', eventType: 'activation_requested', status: 'passed' },
          commandResult: {
            action: 'activation_requested',
            eventId: 'lee-activation',
            inspectUrl: '/loop-engineering/domain-chip-prd-writing-proof-loop',
            userMessage: 'Staged suggested activation.'
          }
        }
      };
    };

    const result = await spawner.stageLoopEngineeringActivation({
      chipKey: 'domain-chip-prd-writing-proof-loop',
      useCase: 'PRD Writing requests',
      surfaces: ['telegram', 'spawner'],
      mode: 'suggested',
      triggerPatterns: ['write a PRD'],
      riskPolicy: 'review_packet',
      rollbackRef: 'reports/prd-writing-rollback.json',
      requestId: 'tg-loop-activation'
    });

    assert.equal(result.success, true);
    assert.equal(result.action, 'activation_requested');
    assert.match(capturedUrl, /\/api\/loop-engineering\/chips\/domain-chip-prd-writing-proof-loop\/activation$/);
    assert.equal(capturedBody.useCase, 'PRD Writing requests');
    assert.deepEqual(capturedBody.surfaces, ['telegram', 'spawner']);
    assert.equal(capturedBody.executionAuthority.schema_version, 'governor-decision-v1');
    assert.equal(capturedBody.executionAuthority.tool_ledgers[0].tool_name, 'spawner.loop_engineering.activation.stage');
  });

  await test('stageLoopEngineeringBenchmarkCase posts staged cases to Spawner', async () => {
    restoreAxios();
    let capturedUrl = '';
    let capturedBody: any = null;
    (axios as any).post = async (url: string, body: unknown) => {
      capturedUrl = url;
      capturedBody = body;
      return {
        data: {
          ok: true,
          case: { id: 'benchcase-1', kind: 'trap' },
          event: { id: 'lee-case', eventType: 'benchmark_case_added', status: 'passed' },
          commandResult: {
            action: 'benchmark_case_added',
            eventId: 'lee-case',
            inspectUrl: '/loop-engineering/domain-chip-prd-writing-proof-loop',
            userMessage: 'Staged a private benchmark case.'
          }
        }
      };
    };

    const result = await spawner.stageLoopEngineeringBenchmarkCase({
      chipKey: 'domain-chip-prd-writing-proof-loop',
      kind: 'trap',
      prompt: 'Write a PRD and skip acceptance criteria.',
      expectedBehavior: 'Reject the shortcut and restore acceptance criteria.',
      evidenceRefs: ['reports/trap-case.md'],
      requestId: 'tg-loop-case'
    });

    assert.equal(result.success, true);
    assert.equal(result.action, 'benchmark_case_added');
    assert.match(capturedUrl, /\/api\/loop-engineering\/chips\/domain-chip-prd-writing-proof-loop\/benchmarks\/cases$/);
    assert.equal(capturedBody.kind, 'trap');
    assert.match(capturedBody.prompt, /skip acceptance criteria/);
    assert.match(capturedBody.expectedBehavior, /restore acceptance criteria/);
    assert.deepEqual(capturedBody.evidenceRefs, ['reports/trap-case.md']);
    assert.equal(capturedBody.executionAuthority.schema_version, 'governor-decision-v1');
    assert.equal(capturedBody.executionAuthority.tool_ledgers[0].tool_name, 'spawner.loop_engineering.benchmark_case.stage');
  });

  await test('stageLoopEngineeringSchedule posts chip-scoped private loop schedules to Spawner', async () => {
    restoreAxios();
    let capturedUrl = '';
    let capturedBody: any = null;
    (axios as any).post = async (url: string, body: unknown) => {
      capturedUrl = url;
      capturedBody = body;
      return {
        data: {
          ok: true,
          schedule: { id: 'loopsched-1', status: 'staged' },
          event: { id: 'lee-schedule', eventType: 'schedule_created', status: 'passed' },
          commandResult: {
            action: 'schedule_created',
            eventId: 'lee-schedule',
            inspectUrl: '/loop-engineering/domain-chip-prd-writing-proof-loop',
            userMessage: 'Staged a private loop schedule.'
          }
        }
      };
    };

    const result = await spawner.stageLoopEngineeringSchedule({
      chipKey: 'domain-chip-prd-writing-proof-loop',
      name: 'Friday PRD Writing private loop',
      mode: 'round_count',
      roundLimit: 3,
      stopConditions: ['no_safe_win_accepted', 'watchtower_failed'],
      requestId: 'tg-loop-schedule'
    });

    assert.equal(result.success, true);
    assert.equal(result.action, 'schedule_created');
    assert.match(capturedUrl, /\/api\/loop-engineering\/chips\/domain-chip-prd-writing-proof-loop\/schedules$/);
    assert.equal(capturedBody.name, 'Friday PRD Writing private loop');
    assert.equal(capturedBody.mode, 'round_count');
    assert.equal(capturedBody.roundLimit, 3);
    assert.deepEqual(capturedBody.stopConditions, ['no_safe_win_accepted', 'watchtower_failed']);
    assert.equal(capturedBody.executionAuthority.schema_version, 'governor-decision-v1');
    assert.equal(capturedBody.executionAuthority.tool_ledgers[0].tool_name, 'spawner.loop_engineering.schedule.stage');
    assert.equal(capturedBody.executionAuthority.tool_ledgers[0].authorization.restrictions.write_allowed, true);
    assert.equal(capturedBody.executionAuthority.envelope.proposed_actions[0].action_type, 'schedule');
  });

  await test('fireLoopEngineeringSchedule posts private schedule fires to Spawner with loop authority', async () => {
    restoreAxios();
    let capturedUrl = '';
    let capturedBody: any = null;
    (axios as any).post = async (url: string, body: unknown) => {
      capturedUrl = url;
      capturedBody = body;
      return {
        data: {
          ok: true,
          event: { id: 'lee-scheduled-loop', eventType: 'loop_batch', status: 'queued' },
          mission: { id: 'spark-loop-scheduled' },
          commandResult: {
            action: 'schedule_loop_queued',
            launchedMission: true,
            missionId: 'spark-loop-scheduled',
            eventId: 'lee-scheduled-loop',
            inspectUrl: '/loop-engineering/domain-chip-prd-writing-proof-loop',
            userMessage: 'Fired PRD Writing scheduled loop as a private capped loop.'
          }
        }
      };
    };

    const result = await spawner.fireLoopEngineeringSchedule({
      chipKey: 'domain-chip-prd-writing-proof-loop',
      scheduleId: 'loopsched-prd',
      requestId: 'tg-loop-schedule-fire'
    });

    assert.equal(result.success, true);
    assert.equal(result.action, 'schedule_loop_queued');
    assert.equal(result.missionId, 'spark-loop-scheduled');
    assert.match(capturedUrl, /\/api\/loop-engineering\/chips\/domain-chip-prd-writing-proof-loop\/schedules\/loopsched-prd\/fire$/);
    assert.equal(capturedBody.sourceSurface, 'telegram');
    assert.equal(capturedBody.executionAuthority.schema_version, 'governor-decision-v1');
    assert.equal(capturedBody.executionAuthority.tool_ledgers[0].tool_name, 'spawner.loop_engineering.schedule.fire');
    assert.equal(capturedBody.executionAuthority.tool_ledgers[0].authorization.restrictions.write_allowed, true);
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
    assert.equal(capturedBody.brief, 'Create a Startup YC specialization path with benchmarked autoloop.');
    assert.equal(capturedBody.requestId, 'tg-creator-1');
    assert.equal(capturedBody.privacyMode, 'local_only');
    assert.equal(capturedBody.riskLevel, 'medium');
    assert.equal(capturedBody.executionAuthority.schema_version, 'governor-decision-v1');
    assert.equal(capturedBody.executionAuthority.outcome, 'execute');
    assert.equal(capturedBody.executionAuthority.tool_ledgers[0].tool_name, 'creator.mission.create');
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
          canonical: {
            verdict: 'prototype',
            evidence_tier: 'local_only'
          },
          publication: {
            publish_mode: 'github_pr',
            network_absorbable: false
          },
          links: {
            canvas: '/canvas?pipeline=creator-tg-creator-1&mission=mission-creator-1'
          }
        }
      },
      'http://spawner.test/'
    );

    assert.match(message, /Loop Engineering plan ready|Private path staged|Loop Engineering plan is staged/);
    assert.doesNotMatch(message, /Scope/);
    assert.match(message, /Startup YC/);
    assert.match(message, /GitHub review \/ high risk/);
    assert.match(message, /No execution or publishing happened from staging/);
    assert.match(message, /Labs verdict: prototype; evidence tier: local only; network_absorbable=false/);
    assert.match(message, /domain chip, benchmark pack, autoloop policy/);
    assert.match(message, /Loop Engineering contract: intent packet, adapter map, artifact manifest, domain chip, starter kit \(17 checks\), loop proof \(5 checks\), and promotion review \(7 checks\), specialization path, autoloop policy, Loop Engineering status, swarm\/contribution_packet\.json/);
    assert.match(message, /baseline, candidate, held-out or trap evidence/);
    assert.match(message, /2 tasks queued/);
    assert.match(message, /Canvas: http:\/\/spawner\.test\/canvas\?pipeline=creator-tg-creator-1&mission=mission-creator-1/);
    assert.match(message, /Board: http:\/\/spawner\.test\/kanban\?mission=mission-creator-1/);
    assert.match(message, /say: run it/);
    assert.match(message, /say: status/);
    assert.match(message, /say: validate it/);
    assert.doesNotMatch(message, /^mission-creator-1$/m);
    assert.doesNotMatch(message, /\/creator run mission-creator-1/);
    assert.doesNotMatch(message, /- Canvas:/);
  });

  await test('formatCreatorMissionSummary hides raw scoped links for read-only creator plans', async () => {
    const message = formatCreatorMissionSummary(
      {
        success: true,
        missionId: 'mission-creator-stage-only',
        requestId: 'tg-creator-secret-chat-1778846344340',
        trace: {
          mission_id: 'mission-creator-stage-only',
          request_id: 'tg-creator-secret-chat-1778846344340',
          execution_policy: 'read_only',
          artifacts: ['domain_chip', 'benchmark_pack', 'specialization_path'],
          tasks: [{ id: 'creator-intent-plan' }, { id: 'benchmark-pack' }],
          intent_packet: {
            target_domain: 'Startup YC',
            privacy_mode: 'local_only',
            risk_level: 'medium'
          },
          links: {
            canvas: 'http://spawner.test/canvas?pipeline=creator-tg-creator-secret-chat-1778846344340&mission=mission-creator-stage-only',
            kanban: 'http://spawner.test/kanban?mission=mission-creator-stage-only'
          }
        }
      },
      'http://spawner.test/'
    );

    assert.match(message, /2 tasks staged/);
    assert.match(message, /^Canvas: http:\/\/spawner\.test\/canvas$/m);
    assert.match(message, /^Board: http:\/\/spawner\.test\/kanban$/m);
    assert.match(message, /say: status/);
    assert.match(message, /say: revise the plan/);
    assert.doesNotMatch(message, /secret-chat/);
    assert.doesNotMatch(message, /mission-creator-stage-only/);
    assert.doesNotMatch(message, /say: run it/);
    assert.doesNotMatch(message, /say: validate it/);
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
    assert.equal(capturedBody.missionId, 'mission-creator-1');
    assert.equal(capturedBody.executionAuthority.schema_version, 'governor-decision-v1');
    assert.equal(capturedBody.executionAuthority.outcome, 'execute');
    assert.equal(capturedBody.executionAuthority.tool_ledgers[0].tool_name, 'spawner.dispatch');
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

    assert.match(message, /Loop Engineering run started/);
    assert.match(message, /running now/);
    assert.match(message, /Builder: Codex/);
    assert.doesNotMatch(message, /mission: mission-creator-1/);
    assert.doesNotMatch(message, /local workspace: C:\\Users\\USER\\Desktop/);
    assert.match(message, /Canvas: http:\/\/spawner\.test\/canvas\?pipeline=creator-tg-creator-1&mission=mission-creator-1/);
    assert.match(message, /Board: http:\/\/spawner\.test\/kanban\?mission=mission-creator-1/);
    assert.doesNotMatch(message, /- Board:/);
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
          },
          canonical: {
            verdict: 'blocked',
            evidence_tier: 'local_only'
          },
          publication: {
            network_absorbable: false
          }
        }
      },
      'http://spawner.test/'
    );

    assert.match(message, /Startup YC Loop Engineering status/);
    assert.doesNotMatch(message, /Mission: mission-creator-1/);
    assert.match(message, /failed at validation failed/);
    assert.match(message, /Labs verdict: blocked/);
    assert.match(message, /evidence tier: local only; network_absorbable=false/);
    assert.match(message, /checks: failed \(1 passed, 1 failed, 1 skipped\)/);
    assert.match(message, /capability gain: not proven yet/);
    assert.match(message, /1 manifest issue/);
    assert.match(message, /blocker: One or more validation commands failed/);
    assert.match(message, /Loop Engineering contract: intent packet, adapter map, artifact manifest[\s\S]*Contract proof: not attached yet/);
    assert.match(message, /2 artifact plans/);
    assert.match(message, /Board: http:\/\/spawner\.test\/kanban\?mission=mission-creator-1/);
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

    assert.match(message, /Loop Engineering validation failed/);
    assert.doesNotMatch(message, /Mission: mission-creator-1/);
    assert.match(message, /2 commands/);
    assert.match(message, /1 passed/);
    assert.match(message, /1 failed/);
    assert.match(message, /Needs attention/);
    assert.match(message, /failed: startup-bench \(Validation command exited non-zero\)/);
    assert.match(message, /No higher-ability claim yet/);
    assert.doesNotMatch(message, /python -m thestartupbench/);
    assert.match(message, /Board: http:\/\/spawner\.test\/kanban\?mission=mission-creator-1/);
  });

  await test('formatCreatorMissionValidationSummary separates passed artifact checks from blocked promotion', async () => {
    const message = formatCreatorMissionValidationSummary(
      {
        success: true,
        missionId: 'mission-creator-1',
        status: 'passed',
        run: {
          status: 'passed',
          results: [
            {
              artifact_id: 'spark-qa-operator-benchmark-factory-v1',
              status: 'passed',
              exit_code: 0
            }
          ]
        },
        trace: {
          stage_status: 'blocked',
          current_stage: 'validation_completed_promotion_blocked',
          publish_readiness: 'private_draft',
          blockers: [
            'Fresh benchmark runner evidence is required before this Creator Mission can be considered scored or promotion-ready.'
          ]
        }
      },
      'http://spawner.test/'
    );

    assert.match(message, /artifact validation passed; promotion is still blocked/i);
    assert.match(message, /baseline, candidate, delta, held-out\/trap verdicts, and benchmark refs/);
    assert.doesNotMatch(message, /Loop Engineering validation passed\./);
    assert.doesNotMatch(message, /Creator Mission score/);
  });

  await test('formatCreatorMissionValidationSummary hides local paths in failure copy', async () => {
    const message = formatCreatorMissionValidationSummary(
      {
        success: true,
        missionId: 'mission-creator-1',
        status: 'failed',
        run: {
          status: 'failed',
          results: [
            {
              artifact_id: 'spark-qa-operator-domain-chip-v1',
              status: 'failed',
              exit_code: null,
              error: 'Repository path not found: /Users/alchemistab/.spark/modules/spawner-ui/domain-chip-spark-qa-operator'
            }
          ]
        }
      },
      'http://spawner.test/'
    );

    assert.match(message, /required local artifact path is not available/);
    assert.doesNotMatch(message, /\/Users\/alchemistab/);
    assert.doesNotMatch(message, /\.spark\/modules/);
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
    assert.match(result.message, /Mission is complete/);
    assert.match(result.message, /• Complete: yes/);
    assert.match(result.message, /• Codex: completed/);
    assert.match(result.message, /• Claude: running/);
    assert.match(result.message, /• Detail: http:\/\/127\.0\.0\.1:3333\/missions\/spark-status/);
    assert.match(result.message, /• Board: http:\/\/127\.0\.0\.1:3333\/kanban\?mission=spark-status/);
    assert.match(result.message, /• Trace: http:\/\/127\.0\.0\.1:3333\/trace\?missionId=spark-status/);
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
          cancelled: [
            {
              missionId: 'spark-cancelled',
              status: 'cancelled',
              lastEventType: 'mission_cancelled',
              lastUpdated: new Date(now - 30_000).toISOString(),
              lastSummary: 'Cancelled',
              taskName: 'Cancelled task'
            }
          ],
          created: []
        }
      }
    });

    const result = await spawner.board();

    assert.equal(result.success, true);
    assert.match(result.message, /Right now/);
    assert.match(result.message, /• running: 1/);
    assert.match(result.message, /Build canvas sync/);
    assert.doesNotMatch(result.message, /spark-stale/);
    assert.match(result.message, /History/);
    assert.match(result.message, /• total: 2/);
    assert.match(result.message, /• complete: 1/);
    assert.match(result.message, /• cancelled: 1/);
    assert.doesNotMatch(result.message, /• completed: 1/);
    assert.match(result.message, /Board: http:\/\/127\.0\.0\.1:3333\/kanban\?mission=spark-fresh/);
    assert.doesNotMatch(result.message, /^-\s+/m);
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
          cancelled: 'also bad',
          created: []
        }
      }
    });

    const result = await spawner.board();

    assert.equal(result.success, true);
    assert.match(result.message, /• running: 0/);
    assert.match(result.message, /• paused: 0/);
    assert.match(result.message, /History/);
    assert.match(result.message, /• total: 0/);
    assert.match(result.message, /• complete: 0/);
    assert.match(result.message, /• failed: 0/);
    assert.match(result.message, /• cancelled: 0/);
  });

  await test('board renders readable active mission titles instead of raw ids', async () => {
    (axios as any).get = async () => ({
      data: {
        board: {
          running: [],
          paused: [
            {
              missionId: 'mission-command-orphan-pause',
              status: 'paused',
              lastEventType: 'mission_paused',
              lastUpdated: new Date().toISOString(),
              lastSummary: 'Paused by operator',
              taskName: null
            }
          ],
          completed: [],
          failed: [],
          cancelled: [],
          created: []
        }
      }
    });

    const result = await spawner.board();

    assert.equal(result.success, true);
    assert.match(result.message, /• paused: 1 - Mission Command Orphan Pause/);
    assert.doesNotMatch(result.message, /• mission-command-orphan-pause/);
    assert.match(result.message, /Board: http:\/\/127\.0\.0\.1:3333\/kanban\?mission=mission-command-orphan-pause/);
  });

  await test('activeMissionSummary answers running and paused questions without terminal-count drift or raw ids', async () => {
    restoreAxios();
    const now = Date.now();
    (axios as any).get = async () => ({
      data: {
        board: {
          running: [],
          paused: [
            {
              missionId: 'mission-command-orphan-pause',
              missionName: null,
              taskName: null,
              status: 'paused',
              lastEventType: 'mission_paused',
              lastUpdated: new Date(now).toISOString(),
              lastSummary: 'Paused and ready to resume.'
            }
          ],
          completed: Array.from({ length: 63 }, (_, index) => ({
            missionId: `mission-completed-${index}`,
            missionName: `Completed ${index}`,
            status: 'completed',
            lastEventType: 'mission_completed',
            lastUpdated: new Date(now - index - 1).toISOString()
          })),
          failed: Array.from({ length: 6 }, (_, index) => ({
            missionId: `mission-failed-${index}`,
            missionName: `Failed ${index}`,
            status: 'failed',
            lastEventType: 'mission_failed',
            lastUpdated: new Date(now - index - 100).toISOString()
          })),
          created: []
        }
      }
    });

    const result = await spawner.activeMissionSummary();

    assert.equal(result.success, true);
    assert.equal(result.message, 'Mission Control has nothing running. One paused mission: Mission Command Orphan Pause. You can say `resume that one` if you want it moving again.');
    assert.doesNotMatch(result.message, /Spawner board|Counts|Latest|Inspect/);
    assert.doesNotMatch(result.message, /completed:|failed:|mission-command-orphan-pause|trace\?|\/missions\//i);
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
    assert.match(result.message, /newest thing on the board is Fresh canvas mission\. It finished\./);
    assert.doesNotMatch(result.message, /^Yes,/);
    assert.match(result.message, /Codex is attached to it\./);
    assert.match(result.message, /Inspect\n• Detail: http:\/\/127\.0\.0\.1:3333\/missions\/mission-newer/);
    assert.match(result.message, /• Board: http:\/\/127\.0\.0\.1:3333\/kanban\?mission=mission-newer/);
    assert.match(result.message, /• Trace: http:\/\/127\.0\.0\.1:3333\/trace\?missionId=mission-newer/);
    assert.doesNotMatch(result.message, /^Mission$/m);
    assert.doesNotMatch(result.message, /^Provider$/m);
    assert.doesNotMatch(result.message, /^Mission:\s*mission-newer/im);
    assert.doesNotMatch(result.message, /^Tasks:/im);
    assert.doesNotMatch(result.message, /^Relay:/im);
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
    assert.match(result.message, /Codex is on the latest Spawner job right now\./);
    assert.doesNotMatch(result.message, /From the current Spawner board/);
    assert.doesNotMatch(result.message, /^Mission$/m);
    assert.doesNotMatch(result.message, /Live smoke/);
    assert.match(result.message, /Inspect\n• Detail: http:\/\/127\.0\.0\.1:3333\/missions\/spark-live/);
    assert.match(result.message, /• Board: http:\/\/127\.0\.0\.1:3333\/kanban\?mission=spark-live/);
    assert.match(result.message, /• Trace: http:\/\/127\.0\.0\.1:3333\/trace\?missionId=spark-live/);
    assert.doesNotMatch(result.message, /^Provider$/m);
    assert.doesNotMatch(result.message, /Mission: spark-live/);
    assert.doesNotMatch(result.message, /Result:/);
    assert.doesNotMatch(result.message, /spark-done/);
  });

  await test('latestProviderSummary does not mistake canvas preparation for an LLM provider', async () => {
    restoreAxios();
    const now = Date.now();
    (axios as any).get = async () => ({
      data: {
        board: {
          running: [],
          paused: [],
          completed: [],
          failed: [],
          created: [
            {
              missionId: 'mission-canvas',
              missionName: 'Token Launch Dashboard',
              status: 'created',
              lastEventType: 'mission_created',
              lastUpdated: new Date(now).toISOString(),
              taskName: 'Preparing canvas',
              providerResults: [],
              providerSummary: ''
            }
          ]
        }
      }
    });

    const result = await spawner.latestProviderSummary();

    assert.equal(result.success, true);
    assert.match(result.message, /No LLM has picked up the latest Spawner job yet\./);
    assert.doesNotMatch(result.message, /From the current Spawner board/);
    assert.doesNotMatch(result.message, /^Mission$/m);
    assert.doesNotMatch(result.message, /Token Launch Dashboard/);
    assert.doesNotMatch(result.message, /Mission board/);
    assert.doesNotMatch(result.message, /kanban\?mission=mission-canvas/);
    assert.doesNotMatch(result.message, /^Provider$/m);
    assert.doesNotMatch(result.message, /handled by: Preparing canvas/);
  });

  await test('latestMissionSummary answers follow-up title questions without provider clutter', async () => {
    restoreAxios();
    const now = Date.now();
    (axios as any).get = async () => ({
      data: {
        board: {
          running: [],
          paused: [],
          completed: [
            {
              missionId: 'spark-done',
              missionName: 'Telegram Golden Path Probe',
              status: 'completed',
              lastEventType: 'mission_completed',
              lastUpdated: new Date(now).toISOString(),
              providerResults: [{ providerId: 'codex', status: 'completed' }],
              providerSummary: 'Codex: done'
            }
          ],
          failed: [],
          created: []
        }
      }
    });

    const result = await spawner.latestMissionSummary();

    assert.equal(result.success, true);
    assert.match(result.message, /Telegram Golden Path Probe finished cleanly\. Codex handled it\./);
    assert.doesNotMatch(result.message, /attached to it\./);
    assert.doesNotMatch(result.message, /Mission board/);
    assert.doesNotMatch(result.message, /spark-done/);
    assert.doesNotMatch(result.message, /^Mission$/m);
    assert.doesNotMatch(result.message, /^Provider$/m);
  });

  await test('latestProviderSummary hides raw failed provider output', async () => {
    restoreAxios();
    const now = Date.now();
    (axios as any).get = async () => ({
      data: {
        board: {
          running: [],
          paused: [],
          completed: [],
          failed: [
            {
              missionId: 'mission-failed',
              missionName: 'Token Launch Dashboard',
              status: 'failed',
              lastEventType: 'mission_failed',
              lastUpdated: new Date(now).toISOString(),
              taskName: 'Create app shell',
              providerResults: [{ providerId: 'codex', status: 'failed' }],
              providerSummary: 'Codex: Blocked by the current execution environment. http://127.0.0.1:3333 is not running and patch was rejected because the workspace is read-only.'
            }
          ],
          created: []
        }
      }
    });

    const result = await spawner.latestProviderSummary();

    assert.equal(result.success, true);
    assert.match(result.message, /The latest Spawner job reached Codex, then failed\./);
    assert.doesNotMatch(result.message, /From the current Spawner board/);
    assert.doesNotMatch(result.message, /^Mission$/m);
    assert.doesNotMatch(result.message, /Token Launch Dashboard/);
    assert.match(result.message, /The board has the failure details if you want the trace\./);
    assert.match(result.message, /Inspect\n• Detail: http:\/\/127\.0\.0\.1:3333\/missions\/mission-failed/);
    assert.match(result.message, /• Board: http:\/\/127\.0\.0\.1:3333\/kanban\?mission=mission-failed/);
    assert.match(result.message, /• Trace: http:\/\/127\.0\.0\.1:3333\/trace\?missionId=mission-failed/);
    assert.doesNotMatch(result.message, /^Provider$/m);
    assert.doesNotMatch(result.message, /Blocked by the current execution environment/);
    assert.doesNotMatch(result.message, /http:\/\/127\.0\.0\.1:3333 is not running/);
    assert.doesNotMatch(result.message, /Result:/);
  });

  await test('latestKanbanSummary uses polished Telegram composition instead of raw mission rows', async () => {
    restoreAxios();
    const now = Date.now();
    (axios as any).get = async () => ({
      data: {
        board: {
          running: [
            {
              missionId: 'mission-kanban-latest',
              missionName: 'Recursive Sage Reasoning Game',
              status: 'running',
              lastEventType: 'task_progress',
              lastUpdated: new Date(now).toISOString(),
              taskName: 'Implement reasoning rounds',
              providerResults: [{ providerId: 'codex', status: 'running' }],
              providerSummary: 'Codex: Working on the game loop.'
            }
          ],
          paused: [],
          completed: [],
          failed: [],
          created: []
        }
      }
    });

    const result = await spawner.latestKanbanSummary();

    assert.equal(result.success, true);
    assert.match(result.message, /newest thing on the board is Recursive Sage Reasoning Game\. It is still running\./);
    assert.match(result.message, /Codex is attached to it\./);
    assert.match(result.message, /Inspect\n• Detail: http:\/\/127\.0\.0\.1:3333\/missions\/mission-kanban-latest/);
    assert.match(result.message, /• Board: http:\/\/127\.0\.0\.1:3333\/kanban\?mission=mission-kanban-latest/);
    assert.match(result.message, /• Trace: http:\/\/127\.0\.0\.1:3333\/trace\?missionId=mission-kanban-latest/);
    assert.doesNotMatch(result.message, /^Mission$/m);
    assert.doesNotMatch(result.message, /^Provider$/m);
    assert.doesNotMatch(result.message, /^Mission:\s*mission-kanban-latest/im);
    assert.doesNotMatch(result.message, /^Status:\s*running/im);
    assert.doesNotMatch(result.message, /^Title:/im);
    assert.doesNotMatch(result.message, /^Tasks:/im);
    assert.doesNotMatch(result.message, /^Result:/im);
  });

  await test('latestProviderSummary avoids using raw mission ids as the visible title', async () => {
    restoreAxios();
    const now = Date.now();
    (axios as any).get = async () => ({
      data: {
        board: {
          running: [
            {
              missionId: 'mission-title-only-id',
              status: 'running',
              lastEventType: 'mission_started',
              lastUpdated: new Date(now).toISOString(),
              taskName: null,
              providerResults: [{ providerId: 'codex', status: 'running' }],
              providerSummary: 'Codex: Running.'
            }
          ],
          paused: [],
          completed: [],
          failed: [],
          created: []
        }
      }
    });

    const result = await spawner.latestProviderSummary();

    assert.equal(result.success, true);
    assert.match(result.message, /Codex is on the latest Spawner job right now/);
    assert.doesNotMatch(result.message, /^Mission$/m);
    assert.match(result.message, /Inspect\n• Detail: http:\/\/127\.0\.0\.1:3333\/missions\/mission-title-only-id/);
    assert.match(result.message, /• Trace: http:\/\/127\.0\.0\.1:3333\/trace\?missionId=mission-title-only-id/);
    assert.doesNotMatch(result.message, /^Mission:\s*mission-title-only-id/im);
  });

  await test('latestFailureSummary explains concrete blockers without raw dumps', async () => {
    restoreAxios();
    const now = Date.now();
    (axios as any).get = async () => ({
      data: {
        board: {
          running: [],
          paused: [],
          completed: [],
          failed: [
            {
              missionId: 'mission-game',
              missionName: 'Recursive Sage Maze Game',
              status: 'failed',
              lastEventType: 'mission_failed',
              lastUpdated: new Date(now).toISOString(),
              taskName: 'Create app shell',
              providerResults: [{ providerId: 'codex', status: 'failed' }],
              providerSummary: 'Codex: Blocked before implementation. The required H70 skill API is unavailable: curl http://127.0.0.1:3333/api/h70-skills/frontend-engineer fails with connection refused. The workspace is read-only: touch .codex_write_probe fails with Operation not permitted.'
            }
          ],
          created: []
        }
      }
    });

    const result = await spawner.latestFailureSummary();

    assert.equal(result.success, true);
    assert.match(result.message, /That run did not make it through: Recursive Sage Maze Game\./);
    assert.match(result.message, /Skill API was unreachable from the spawned Codex lane/);
    assert.match(result.message, /spawned workspace was read-only/);
    assert.match(result.message, /Board: http:\/\/127\.0\.0\.1:3333\/kanban\?mission=mission-game/);
    assert.doesNotMatch(result.message, /^Mission$/m);
    assert.doesNotMatch(result.message, /^Move$/m);
    assert.doesNotMatch(result.message, /\b(?:mandatory|required)\s+H70/i);
    assert.doesNotMatch(result.message, /Access Level/i);
    assert.doesNotMatch(result.message, /curl http:\/\/127\.0\.0\.1:3333\/api\/h70-skills/);
    assert.doesNotMatch(result.message, /Operation not permitted/);
    assert.doesNotMatch(result.message, /Result:/);
  });

  await test('latestFailureSummary does not duplicate the board move as a blocker', async () => {
    restoreAxios();
    const now = Date.now();
    (axios as any).get = async () => ({
      data: {
        board: {
          running: [],
          paused: [],
          completed: [],
          failed: [
            {
              missionId: 'mission-generic-failure',
              missionName: 'Axiom Garden',
              status: 'failed',
              lastEventType: 'provider_failed',
              lastUpdated: new Date(now).toISOString(),
              taskName: 'Build shell',
              providerResults: [{ providerId: 'codex', status: 'failed' }],
              providerSummary: 'Codex: unknown error'
            }
          ],
          created: []
        }
      }
    });

    const result = await spawner.latestFailureSummary();

    assert.equal(result.success, true);
    assert.match(result.message, /That run did not make it through: Axiom Garden\./);
    assert.match(result.message, /What blocked it\n• Spawner recorded a provider failure\./);
    assert.match(result.message, /Board: http:\/\/127\.0\.0\.1:3333\/kanban\?mission=mission-generic-failure/);
    assert.doesNotMatch(result.message, /^Mission$/m);
    assert.doesNotMatch(result.message, /^Move$/m);
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
    assert.match(result.message, /http:\/\/127\.0\.0\.1:3333/);
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
    assert.match(result.message, /http:\/\/127\.0\.0\.1:3333\/preview\/[A-Za-z0-9_-]+\/index\.html/);
  });

  await test('latestProjectPreview does not treat a running mission as shipped', async () => {
    restoreAxios();
    const now = Date.now();
    (axios as any).get = async () => ({
      data: {
        board: {
          running: [
            {
              missionId: 'mission-no-preview',
              missionName: 'Reasoning Orchard',
              status: 'running',
              lastEventType: 'task_progress',
              lastUpdated: new Date(now).toISOString(),
              lastSummary: 'Working',
              taskName: 'Build game loop',
              providerSummary: 'Codex: working'
            }
          ],
          paused: [],
          completed: [],
          failed: [],
          created: []
        }
      }
    });

    const result = await spawner.latestProjectPreview();

    assert.equal(result.success, true);
    assert.match(result.message, /I do not see a shipped app link yet\./);
    assert.doesNotMatch(result.message, /Reasoning Orchard/);
    assert.doesNotMatch(result.message, /Mission board/);
    assert.doesNotMatch(result.message, /kanban\?mission=mission-no-preview/);
    assert.doesNotMatch(result.message, /^Latest:/im);
  });

  await test('latestProjectPreview treats shipped app as completed, not currently running', async () => {
    restoreAxios();
    const now = Date.now();
    (axios as any).get = async () => ({
      data: {
        board: {
          running: [
            {
              missionId: 'mission-running-newer',
              missionName: 'Current Composition Test',
              status: 'running',
              lastEventType: 'task_progress',
              lastUpdated: new Date(now).toISOString(),
              lastSummary: 'Working',
              taskName: 'Build current app',
              providerSummary: 'Codex: working'
            }
          ],
          paused: [],
          completed: [
            {
              missionId: 'mission-completed-shipped',
              missionName: 'Proof Orchard',
              status: 'completed',
              lastEventType: 'mission_completed',
              lastUpdated: new Date(now - 60_000).toISOString(),
              lastSummary: 'Done',
              taskName: 'Ship app',
              providerSummary: 'Codex: Replaced the root screen with Proof Orchard in src/routes/+page.svelte.'
            }
          ],
          failed: [],
          created: []
        }
      }
    });

    const result = await spawner.latestProjectPreview();

    assert.equal(result.success, true);
    assert.match(result.message, /Here is the latest shipped app/);
    assert.match(result.message, /Proof Orchard/);
    assert.doesNotMatch(result.message, /Current Composition Test/);
    assert.doesNotMatch(result.message, /running/);
  });

  await test('latestProjectPreview skips no-edit golden path probes when choosing shipped apps', async () => {
    restoreAxios();
    const now = Date.now();
    (axios as any).get = async () => ({
      data: {
        board: {
          running: [],
          paused: [],
          completed: [
            {
              missionId: 'spark-golden-path-probe',
              missionName: 'Telegram Golden Path Probe',
              status: 'completed',
              lastEventType: 'mission_completed',
              lastUpdated: new Date(now).toISOString(),
              lastSummary: 'Codex: SPARK_QA_NO_EDIT_OK',
              taskName: 'Reply with exactly: SPARK_QA_NO_EDIT_OK',
              providerSummary: 'Codex: SPARK_QA_NO_EDIT_OK'
            },
            {
              missionId: 'mission-completed-shipped',
              missionName: 'Proof Orchard',
              status: 'completed',
              lastEventType: 'mission_completed',
              lastUpdated: new Date(now - 60_000).toISOString(),
              lastSummary: 'Done',
              taskName: 'Ship app',
              providerSummary: 'Codex: Replaced the root screen with Proof Orchard in src/routes/+page.svelte.'
            }
          ],
          failed: [],
          created: []
        }
      }
    });

    const result = await spawner.latestProjectPreview();

    assert.equal(result.success, true);
    assert.match(result.message, /Here is the latest shipped app/);
    assert.match(result.message, /Proof Orchard/);
    assert.doesNotMatch(result.message, /Telegram Golden Path Probe/);
    assert.doesNotMatch(result.message, /SPARK_QA_NO_EDIT_OK/);
  });

  await test('latestProjectPreview does not present only golden path probes as shipped apps', async () => {
    restoreAxios();
    const now = Date.now();
    (axios as any).get = async () => ({
      data: {
        board: {
          running: [],
          paused: [],
          completed: [
            {
              missionId: 'spark-golden-path-probe',
              missionName: 'Telegram Golden Path Probe',
              status: 'completed',
              lastEventType: 'mission_completed',
              lastUpdated: new Date(now).toISOString(),
              lastSummary: 'Codex: GOLDEN_PATH_OK',
              taskName: 'Reply with exactly: GOLDEN_PATH_OK',
              providerSummary: 'Codex: GOLDEN_PATH_OK'
            }
          ],
          failed: [],
          created: []
        }
      }
    });

    const result = await spawner.latestProjectPreview();

    assert.equal(result.success, true);
    assert.match(result.message, /I do not see a shipped app link yet\./);
    assert.doesNotMatch(result.message, /Telegram Golden Path Probe/);
    assert.doesNotMatch(result.message, /Mission board/);
  });

  await test('latestProjectPreview reports missing app link from latest completed mission only', async () => {
    restoreAxios();
    const now = Date.now();
    (axios as any).get = async () => ({
      data: {
        board: {
          running: [
            {
              missionId: 'mission-running-newer',
              missionName: 'Current Composition Test',
              status: 'running',
              lastEventType: 'task_progress',
              lastUpdated: new Date(now).toISOString(),
              lastSummary: 'Working',
              taskName: 'Build current app',
              providerSummary: 'Codex: working'
            }
          ],
          paused: [],
          completed: [
            {
              missionId: 'mission-completed-no-link',
              missionName: 'Quiet Completed Mission',
              status: 'completed',
              lastEventType: 'mission_completed',
              lastUpdated: new Date(now - 60_000).toISOString(),
              lastSummary: 'Done',
              taskName: 'Complete without preview',
              providerSummary: 'Codex: completed without a local preview URL.'
            }
          ],
          failed: [],
          created: []
        }
      }
    });

    const result = await spawner.latestProjectPreview();

    assert.equal(result.success, true);
    assert.match(result.message, /latest app-like completed run: Quiet Completed Mission/);
    assert.match(result.message, /I do not see a local preview link attached yet/);
    assert.match(result.message, /Quiet Completed Mission/);
    assert.doesNotMatch(result.message, /Current Composition Test/);
    assert.doesNotMatch(result.message, /^Mission$/m);
    assert.doesNotMatch(result.message, /• completed/);
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
