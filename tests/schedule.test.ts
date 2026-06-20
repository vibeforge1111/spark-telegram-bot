import assert from 'node:assert/strict';
import axios from 'axios';
import {
  createHarnessCoreActionEnvelopeVNext,
  createHarnessCoreAuthorizedGovernorDecision
} from '@spark/harness-core';
import { createSchedule, deleteSchedule, SCHEDULE_CREATE_TOOL, SCHEDULE_DELETE_TOOL, SCHEDULE_OWNER_SYSTEM } from '../src/schedule';
import type { SparkHarnessMutationClass } from '../src/harnessContract';

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
const originalDelete = axios.delete;

function restoreAxios(): void {
  (axios as any).post = originalPost;
  (axios as any).delete = originalDelete;
}

function fakeExecutionAuthority(
  toolName: string,
  mutationClass: SparkHarnessMutationClass,
  ownerSystem = SCHEDULE_OWNER_SYSTEM
): unknown {
  const envelope = createHarnessCoreActionEnvelopeVNext({
    surface: 'telegram',
    ownerSystem,
    toolName,
    mutationClass,
    source: 'schedule.test',
    reason: `Test Harness Core authority for ${toolName}.`,
    requestId: `turn:${toolName}:${mutationClass}`,
    actorIdRef: 'telegram-human'
  });
  return createHarnessCoreAuthorizedGovernorDecision({ envelope, tool_name: toolName });
}

async function run(): Promise<void> {
  await test('createSchedule forwards Governor authority to Spawner', async () => {
    restoreAxios();
    const executionAuthority = fakeExecutionAuthority(SCHEDULE_CREATE_TOOL, 'creates_schedule');
    let capturedBody: any = null;
    (axios as any).post = async (_url: string, body: unknown) => {
      capturedBody = body;
      return {
        data: {
          ok: true,
          schedule: {
            id: 'sched-1',
            cron: '*/5 * * * *',
            action: 'mission',
            payload: { goal: 'status' },
            chatId: '123',
            createdAt: '2026-06-04T00:00:00.000Z',
            lastFiredAt: null,
            nextFireAt: null,
            fireCount: 0,
            lastStatus: null,
            enabled: true
          }
        }
      };
    };

    const result = await createSchedule({
      cron: '*/5 * * * *',
      action: 'mission',
      payload: { goal: 'status' },
      chatId: '123',
      executionAuthority
    });

    assert.equal(result.ok, true);
    assert.equal(capturedBody.executionAuthority, executionAuthority);
  });

  await test('createSchedule fails closed before network when authority is missing', async () => {
    restoreAxios();
    let postCalled = false;
    (axios as any).post = async () => {
      postCalled = true;
      return { data: { ok: true } };
    };

    const result = await createSchedule({
      cron: '*/5 * * * *',
      action: 'mission',
      payload: { goal: 'status' },
      chatId: '123'
    });

    assert.equal(result.ok, false);
    assert.match(result.error || '', /Harness Core execution authority is required/);
    assert.equal(postCalled, false);
  });

  await test('createSchedule rejects delete authority before network', async () => {
    restoreAxios();
    let postCalled = false;
    (axios as any).post = async () => {
      postCalled = true;
      return { data: { ok: true } };
    };

    const result = await createSchedule({
      cron: '*/5 * * * *',
      action: 'mission',
      payload: { goal: 'status' },
      chatId: '123',
      executionAuthority: fakeExecutionAuthority(SCHEDULE_DELETE_TOOL, 'deletes_schedule')
    });

    assert.equal(result.ok, false);
    assert.match(result.error || '', /governor_missing_matching_authorization/);
    assert.equal(postCalled, false);
  });

  await test('createSchedule rejects legacy Builder schedule authority before network', async () => {
    restoreAxios();
    let postCalled = false;
    (axios as any).post = async () => {
      postCalled = true;
      return { data: { ok: true } };
    };

    const result = await createSchedule({
      cron: '*/5 * * * *',
      action: 'mission',
      payload: { goal: 'status' },
      chatId: '123',
      executionAuthority: fakeExecutionAuthority('schedule.create', 'creates_schedule', 'spark-intelligence-builder')
    });

    assert.equal(result.ok, false);
    assert.match(result.error || '', /governor_missing_matching_authorization/);
    assert.equal(postCalled, false);
  });

  await test('createSchedule rejects read-only Governor authority before network', async () => {
    restoreAxios();
    let postCalled = false;
    (axios as any).post = async () => {
      postCalled = true;
      return { data: { ok: true } };
    };

    const result = await createSchedule({
      cron: '*/5 * * * *',
      action: 'mission',
      payload: { goal: 'status' },
      chatId: '123',
      executionAuthority: fakeExecutionAuthority(SCHEDULE_CREATE_TOOL, 'read_only')
    });

    assert.equal(result.ok, false);
    assert.match(result.error || '', /governor_outcome_read_only/);
    assert.equal(postCalled, false);
  });

  await test('deleteSchedule forwards Governor authority in DELETE config data', async () => {
    restoreAxios();
    const executionAuthority = fakeExecutionAuthority(SCHEDULE_DELETE_TOOL, 'deletes_schedule');
    let capturedOptions: any = null;
    (axios as any).delete = async (_url: string, options: unknown) => {
      capturedOptions = options;
      return { data: { ok: true } };
    };

    const result = await deleteSchedule('sched-1', { executionAuthority });

    assert.equal(result.ok, true);
    assert.equal(capturedOptions.data.executionAuthority, executionAuthority);
  });

  await test('schedule mutations use Scheduled control auth rather than bridge auth', async () => {
    restoreAxios();
    const previousEventsKey = process.env.EVENTS_API_KEY;
    const previousBridgeKey = process.env.SPARK_BRIDGE_API_KEY;
    process.env.EVENTS_API_KEY = 'events-secret';
    process.env.SPARK_BRIDGE_API_KEY = 'bridge-secret';
    const executionAuthority = fakeExecutionAuthority(SCHEDULE_CREATE_TOOL, 'creates_schedule');
    let capturedOptions: any = null;
    (axios as any).post = async (_url: string, _body: unknown, options: unknown) => {
      capturedOptions = options;
      return {
        data: {
          ok: true,
          schedule: {
            id: 'sched-auth',
            cron: '*/5 * * * *',
            action: 'mission',
            payload: { goal: 'status' },
            chatId: '123',
            createdAt: '2026-06-04T00:00:00.000Z',
            lastFiredAt: null,
            nextFireAt: null,
            fireCount: 0,
            lastStatus: null,
            enabled: true
          }
        }
      };
    };

    try {
      const result = await createSchedule({
        cron: '*/5 * * * *',
        action: 'mission',
        payload: { goal: 'status' },
        chatId: '123',
        executionAuthority
      });

      assert.equal(result.ok, true);
      assert.equal(capturedOptions?.headers?.['x-api-key'], 'events-secret');
    } finally {
      if (previousEventsKey === undefined) delete process.env.EVENTS_API_KEY;
      else process.env.EVENTS_API_KEY = previousEventsKey;
      if (previousBridgeKey === undefined) delete process.env.SPARK_BRIDGE_API_KEY;
      else process.env.SPARK_BRIDGE_API_KEY = previousBridgeKey;
    }
  });

  await test('deleteSchedule fails closed before network when authority is missing', async () => {
    restoreAxios();
    let deleteCalled = false;
    (axios as any).delete = async () => {
      deleteCalled = true;
      return { data: { ok: true } };
    };

    const result = await deleteSchedule('sched-1');

    assert.equal(result.ok, false);
    assert.match(result.error || '', /Harness Core execution authority is required/);
    assert.equal(deleteCalled, false);
  });

  restoreAxios();
}

run().catch((error) => {
  console.error(error);
  restoreAxios();
  process.exit(1);
});
