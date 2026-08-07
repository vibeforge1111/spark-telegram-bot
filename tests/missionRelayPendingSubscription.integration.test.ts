import assert from 'node:assert/strict';
import { createServer, request } from 'node:http';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {
  discardPendingMissionRelay,
  registerPendingMissionRelay,
  resetMissionRelayDeliveryStateForTests,
  resetMissionRelayRegistryForTests,
  startMissionRelay,
  stopMissionRelayForTests
} from '../src/missionRelay';
import { resetJsonStateForTests } from '../src/jsonState';
import { resetTerminalDeliveryOutboxForTests } from '../src/terminalDeliveryOutbox';
import { spawner } from '../src/spawner';

const originalEnv = { ...process.env };
const relaySecret = 'pending_subscription_test_secret_123456';

function restoreEnv(): void {
  for (const key of Object.keys(process.env)) if (!(key in originalEnv)) delete process.env[key];
  Object.assign(process.env, originalEnv);
}

async function freePort(): Promise<number> {
  const server = createServer();
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  const port = typeof address === 'object' && address ? address.port : 0;
  await new Promise<void>((resolve) => server.close(() => resolve()));
  return port;
}

async function configureCase(
  sendMessage?: (chatId: number, text: string) => Promise<void>
): Promise<{
  stateDir: string;
  port: number;
  sent: string[];
}> {
  await stopMissionRelayForTests();
  resetMissionRelayDeliveryStateForTests();
  resetMissionRelayRegistryForTests();
  resetTerminalDeliveryOutboxForTests();
  resetJsonStateForTests();
  const stateDir = await mkdtemp(path.join(os.tmpdir(), 'spark-pending-relay-'));
  const port = await freePort();
  process.env.SPARK_GATEWAY_STATE_DIR = stateDir;
  process.env.TELEGRAM_RELAY_PORT = String(port);
  process.env.SPARK_TELEGRAM_PROFILE = 'pending-relay-test';
  process.env.TELEGRAM_RELAY_SECRET = relaySecret;
  process.env.SPAWNER_UI_URL = 'http://spawner-pending.test';
  const sent: string[] = [];
  const bot = {
    telegram: {
      sendMessage: async (chatId: number, text: string) => {
        if (sendMessage) await sendMessage(chatId, text);
        else sent.push(text);
      }
    }
  };
  await startMissionRelay(bot as any);
  return { stateDir, port, sent };
}

async function cleanupCase(stateDir: string): Promise<void> {
  await stopMissionRelayForTests();
  resetMissionRelayDeliveryStateForTests();
  resetMissionRelayRegistryForTests();
  resetTerminalDeliveryOutboxForTests();
  resetJsonStateForTests();
  await rm(stateDir, { recursive: true, force: true });
}

function postEvent(
  port: number,
  event: Record<string, unknown>
): Promise<{ status: number; body: Record<string, unknown>; requestBody: string }> {
  const requestBody = JSON.stringify({ type: 'mission_control_event', event });
  return new Promise((resolve, reject) => {
    const req = request({
      hostname: '127.0.0.1',
      port,
      path: '/spawner-events',
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'content-length': Buffer.byteLength(requestBody),
        'x-spark-telegram-relay-secret': relaySecret
      }
    }, (res) => {
      const chunks: Buffer[] = [];
      res.on('data', (chunk) => chunks.push(Buffer.from(chunk)));
      res.on('end', () => resolve({
        status: res.statusCode || 0,
        body: JSON.parse(Buffer.concat(chunks).toString('utf8')),
        requestBody
      }));
    });
    req.on('error', reject);
    req.end(requestBody);
  });
}

async function test(name: string, run: () => Promise<void>): Promise<void> {
  try {
    await run();
    console.log(`ok - ${name}`);
  } catch (error) {
    console.error(`not ok - ${name}`);
    throw error;
  }
}

async function main(): Promise<void> {
  await test('binds a fast redacted failure by request id and suppresses late start', async () => {
    const testCase = await configureCase();
    try {
      const requestId = 'tg-run-fast-terminal-request';
      const traceRef = `trace:telegram-run:${requestId}`;
      const missionId = 'spark-fast-terminal-mission';
      registerPendingMissionRelay({
        chatId: '123456789',
        userId: '987654321',
        requestId,
        traceRef,
        goal: 'Run the tiny no-edit check.',
        createdAt: new Date().toISOString(),
        relayPort: testCase.port,
        relayProfile: 'pending-relay-test'
      });

      const [taskFailure, missionFailure] = await Promise.all([
        postEvent(testCase.port, {
          type: 'task_failed', missionId, source: 'spawner-ui', message: 'No tool-capable executor is available.',
          data: { requestId, traceRef, provider: 'openai', error: 'No tool-capable executor is available.' }
        }),
        postEvent(testCase.port, {
          type: 'mission_failed', missionId, source: 'spawner-ui', message: 'The run stopped before making changes.',
          data: { requestId, traceRef, provider: 'openai' }
        })
      ]);
      const lateStart = await postEvent(testCase.port, {
        type: 'mission_started', missionId, source: 'spawner-ui', message: 'Mission started.',
        data: { requestId, traceRef }
      });

      assert.equal([taskFailure, missionFailure].some((result) => result.body.ignored === 'unknown_mission'), false);
      assert.equal(lateStart.body.suppressed, 'mission_already_terminal');
      assert.equal(testCase.sent.length, 1);
      assert.match(testCase.sent[0], /could not finish|stopped before making changes/i);
      assert.doesNotMatch(testCase.sent[0], /123456789|987654321|tg-run-fast-terminal-request|trace:telegram-run/i);
      assert.doesNotMatch(taskFailure.requestBody + missionFailure.requestBody, /123456789|987654321/);
    } finally {
      await cleanupCase(testCase.stateDir);
    }
  });

  await test('does not bind a pending chat to a wrong request or trace', async () => {
    const testCase = await configureCase();
    try {
      const requestId = 'tg-run-correct-request';
      const traceRef = `trace:telegram-run:${requestId}`;
      registerPendingMissionRelay({
        chatId: '12345', userId: '67890', requestId, traceRef,
        goal: 'Run the safe check.', createdAt: new Date().toISOString(),
        relayPort: testCase.port, relayProfile: 'pending-relay-test'
      });

      const wrongRequest = await postEvent(testCase.port, {
        type: 'mission_failed', missionId: 'spark-wrong-request',
        data: { requestId: 'tg-run-other-request', traceRef }
      });
      const wrongTrace = await postEvent(testCase.port, {
        type: 'mission_failed', missionId: 'spark-wrong-trace',
        data: { requestId, traceRef: 'trace:telegram-run:other' }
      });
      const missingTrace = await postEvent(testCase.port, {
        type: 'mission_failed', missionId: 'spark-missing-trace',
        data: { requestId }
      });
      assert.equal(wrongRequest.body.ignored, 'unknown_mission');
      assert.equal(wrongTrace.body.ignored, 'unknown_mission');
      assert.equal(missingTrace.body.ignored, 'unknown_mission');
      assert.equal(testCase.sent.length, 0);

      const correct = await postEvent(testCase.port, {
        type: 'mission_failed', missionId: 'spark-correct-request',
        message: 'The safe check could not start.', data: { requestId, traceRef }
      });
      assert.equal(correct.status, 200);
      assert.equal(testCase.sent.length, 1);
    } finally {
      await cleanupCase(testCase.stateDir);
    }
  });

  await test('does not trust event-supplied Telegram identity without a local pending request', async () => {
    const testCase = await configureCase();
    try {
      const result = await postEvent(testCase.port, {
        type: 'mission_failed', missionId: 'spark-injected-identity',
        message: 'Attempted injected failure.',
        data: {
          requestId: 'tg-run-no-local-request',
          traceRef: 'trace:telegram-run:tg-run-no-local-request',
          chatId: '12345',
          userId: '67890'
        }
      });
      assert.equal(result.status, 202);
      assert.equal(result.body.ignored, 'unknown_mission');
      assert.equal(testCase.sent.length, 0);
    } finally {
      await cleanupCase(testCase.stateDir);
    }
  });

  await test('retries a failed mission handoff and commits dedupe only after delivery', async () => {
    let attempts = 0;
    const sent: string[] = [];
    const testCase = await configureCase(async (_chatId, text) => {
      attempts += 1;
      if (attempts === 1) throw new Error('transient Telegram failure');
      sent.push(text);
    });
    try {
      const requestId = 'tg-run-retry-failure';
      const traceRef = `trace:telegram-run:${requestId}`;
      const missionId = 'spark-retry-failure';
      registerPendingMissionRelay({
        chatId: '12345', userId: '67890', requestId, traceRef,
        goal: 'Run the safe check.', createdAt: new Date().toISOString(),
        relayPort: testCase.port, relayProfile: 'pending-relay-test'
      });
      const event = {
        type: 'mission_failed', missionId, message: 'The safe check could not finish.',
        data: { requestId, traceRef }
      };

      const first = await postEvent(testCase.port, event);
      const second = await postEvent(testCase.port, event);
      const third = await postEvent(testCase.port, event);

      assert.equal(first.status, 500);
      assert.equal(first.body.error, 'delivery_failed');
      assert.equal(second.status, 200);
      assert.equal(third.status, 200);
      assert.equal(third.body.suppressed, 'mission_failure_handoff_already_claimed');
      assert.equal(attempts, 2);
      assert.equal(sent.length, 1);
    } finally {
      await cleanupCase(testCase.stateDir);
    }
  });

  await test('suppresses a late mission start after a provider task failure alone', async () => {
    const testCase = await configureCase();
    try {
      const requestId = 'tg-run-task-failure-only';
      const traceRef = `trace:telegram-run:${requestId}`;
      const missionId = 'spark-task-failure-only';
      registerPendingMissionRelay({
        chatId: '12345', userId: '67890', requestId, traceRef,
        goal: 'Run the safe check.', createdAt: new Date().toISOString(),
        relayPort: testCase.port, relayProfile: 'pending-relay-test'
      });
      const failed = await postEvent(testCase.port, {
        type: 'task_failed', missionId, message: 'Provider stopped.',
        data: { requestId, traceRef, provider: 'openai', error: 'Provider stopped.' }
      });
      const lateStart = await postEvent(testCase.port, {
        type: 'mission_started', missionId, message: 'Mission started.',
        data: { requestId, traceRef }
      });
      assert.equal(failed.status, 200);
      assert.equal(lateStart.body.suppressed, 'mission_already_terminal');
      assert.equal(testCase.sent.length, 1);
    } finally {
      await cleanupCase(testCase.stateDir);
    }
  });

  await test('handleRunCommand pre-binds a fast terminal event and suppresses the stale start acknowledgement', async () => {
    const testCase = await configureCase();
    const originalRunGoal = spawner.runGoal;
    try {
      process.env.ADMIN_TELEGRAM_IDS = '67890';
      process.env.SPARK_AGENT_ACCESS_PROFILE = 'developer';
      process.env.SPARK_BOT_TEST_MODE = '1';
      (spawner as any).runGoal = async (input: { requestId: string; traceRef: string }) => {
        const missionId = 'spark-handle-run-fast-failure';
        const delivered = await postEvent(testCase.port, {
          type: 'mission_failed', missionId, message: 'No tool-capable executor is available.',
          data: { requestId: input.requestId, traceRef: input.traceRef, provider: 'openai' }
        });
        assert.equal(delivered.status, 200);
        return { success: true, missionId, requestId: input.requestId, providers: ['openai'] };
      };
      const replies: string[] = [];
      const ctx = {
        chat: { id: 12345 },
        from: { id: 67890, username: 'relay-test' },
        update: { update_id: 42 },
        sendChatAction: async () => {},
        reply: async (text: string) => { replies.push(text); }
      };
      const relayProfile = process.env.SPARK_TELEGRAM_PROFILE;
      process.env.SPARK_TELEGRAM_PROFILE = 'primary';
      const { handleRunCommand } = await import('../src/index');
      process.env.SPARK_TELEGRAM_PROFILE = relayProfile;
      const missionId = await handleRunCommand(ctx, 'Run the tiny no-edit check.', ['openai']);

      assert.equal(missionId, 'spark-handle-run-fast-failure');
      assert.equal(testCase.sent.length, 1);
      assert.match(testCase.sent[0], /could not finish|No tool-capable executor/i);
      assert.equal(replies.length, 0, 'terminal relay must win over the stale mission-start acknowledgement');
    } finally {
      (spawner as any).runGoal = originalRunGoal;
      await cleanupCase(testCase.stateDir);
    }
  });

  await test('clears pending identity when dispatch fails before a mission is returned', async () => {
    const testCase = await configureCase();
    try {
      const requestId = 'tg-run-dispatch-failed';
      const traceRef = `trace:telegram-run:${requestId}`;
      registerPendingMissionRelay({
        chatId: '12345', userId: '67890', requestId, traceRef,
        goal: 'Run the safe check.', createdAt: new Date().toISOString(),
        relayPort: testCase.port, relayProfile: 'pending-relay-test'
      });
      discardPendingMissionRelay(requestId);

      const result = await postEvent(testCase.port, {
        type: 'mission_failed', missionId: 'spark-dispatch-failed',
        data: { requestId, traceRef }
      });
      assert.equal(result.body.ignored, 'unknown_mission');
      assert.equal(testCase.sent.length, 0);
    } finally {
      await cleanupCase(testCase.stateDir);
    }
  });
}

main().catch(async (error) => {
  restoreEnv();
  await stopMissionRelayForTests().catch(() => {});
  console.error(error);
  process.exitCode = 1;
});
