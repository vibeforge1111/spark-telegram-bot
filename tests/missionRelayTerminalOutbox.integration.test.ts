import assert from 'node:assert/strict';
import { createServer, request } from 'node:http';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {
  registerMissionRelay,
  resetMissionRelayDeliveryStateForTests,
  resetMissionRelayRegistryForTests,
  setCompletionDeliveryCacheWriterForTests,
  startMissionRelay,
  stopMissionRelayForTests
} from '../src/missionRelay';
import { resetJsonStateForTests, writeJsonAtomic } from '../src/jsonState';
import {
  loadTerminalDeliveryOutbox,
  resetTerminalDeliveryOutboxForTests,
  terminalDeliveryOutboxPathForTests,
  type TerminalDeliveryTarget
} from '../src/terminalDeliveryOutbox';

const originalFetch = global.fetch;
const originalEnv = { ...process.env };
const relaySecret = 'terminal_outbox_test_secret_123456';

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

async function waitFor(predicate: () => boolean | Promise<boolean>, timeoutMs = 5000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await predicate()) return;
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  throw new Error('Timed out waiting for terminal relay test condition.');
}

function traceResponse(summary: string): Response {
  return new Response(JSON.stringify({
    phase: 'completed',
    providerSummary: summary,
    providerResults: [{ providerId: 'codex', status: 'completed', summary }]
  }), { status: 200, headers: { 'content-type': 'application/json' } });
}

function postTerminalEvent(port: number, missionId: string): Promise<{ status: number; body: any; elapsedMs: number }> {
  const payload = JSON.stringify({
    type: 'mission_control_event',
    event: { type: 'mission_completed', missionId }
  });
  const startedAt = Date.now();
  return new Promise((resolve, reject) => {
    const req = request({
      hostname: '127.0.0.1', port, path: '/spawner-events', method: 'POST',
      headers: {
        'content-type': 'application/json',
        'content-length': Buffer.byteLength(payload),
        'x-spark-telegram-relay-secret': relaySecret
      }
    }, (res) => {
      const chunks: Buffer[] = [];
      res.on('data', (chunk) => chunks.push(Buffer.from(chunk)));
      res.on('end', () => resolve({
        status: res.statusCode || 0,
        body: JSON.parse(Buffer.concat(chunks).toString('utf8')),
        elapsedMs: Date.now() - startedAt
      }));
    });
    req.on('error', reject);
    req.end(payload);
  });
}

async function configureCase(retryBaseMs = 25): Promise<{
  stateDir: string;
  port: number;
  target: TerminalDeliveryTarget;
  missionId: string;
}> {
  await stopMissionRelayForTests();
  resetMissionRelayDeliveryStateForTests();
  resetMissionRelayRegistryForTests();
  resetTerminalDeliveryOutboxForTests();
  resetJsonStateForTests();
  const stateDir = await mkdtemp(path.join(os.tmpdir(), 'spark-terminal-outbox-'));
  const port = await freePort();
  process.env.SPARK_GATEWAY_STATE_DIR = stateDir;
  process.env.TELEGRAM_RELAY_PORT = String(port);
  process.env.SPARK_TELEGRAM_PROFILE = 'terminal-outbox-test';
  process.env.TELEGRAM_RELAY_SECRET = relaySecret;
  process.env.SPAWNER_UI_URL = 'http://spawner-terminal.test';
  process.env.SPARK_TERMINAL_DELIVERY_RETRY_BASE_MS = String(retryBaseMs);
  const missionId = `spark-terminal-${port}`;
  await registerMissionRelay({
    missionId, chatId: '8319079055', userId: '8319079055', requestId: `request-${port}`,
    goal: 'Return the bounded terminal result.', createdAt: new Date().toISOString(),
    relayPort: port, relayProfile: 'terminal-outbox-test'
  });
  return { stateDir, port, target: { relayProfile: 'terminal-outbox-test', relayPort: port }, missionId };
}

async function cleanupCase(stateDir: string): Promise<void> {
  await stopMissionRelayForTests();
  resetMissionRelayDeliveryStateForTests();
  resetMissionRelayRegistryForTests();
  resetTerminalDeliveryOutboxForTests();
  resetJsonStateForTests();
  await rm(stateDir, { recursive: true, force: true });
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
  await test('durably acknowledges held trace quickly and dedupes duplicate terminal webhooks', async () => {
    const testCase = await configureCase();
    try {
      let releaseTrace: ((response: Response) => void) | null = null;
      global.fetch = async () => new Promise<Response>((resolve) => { releaseTrace = resolve; });
      const sent: string[] = [];
      const bot = { telegram: { sendMessage: async (_chatId: number, text: string) => { sent.push(text); } } };
      await startMissionRelay(bot as any);

      const [first, duplicate] = await Promise.all([
        postTerminalEvent(testCase.port, testCase.missionId),
        postTerminalEvent(testCase.port, testCase.missionId)
      ]);
      assert.equal(first.status, 202);
      assert.equal(duplicate.status, 202);
      assert.ok(Math.max(first.elapsedMs, duplicate.elapsedMs) < 1000, 'terminal 202 must not wait for trace fetch');
      const pending = await loadTerminalDeliveryOutbox(testCase.target);
      assert.equal(pending.length, 1);
      const serialized = JSON.stringify(pending);
      assert.doesNotMatch(serialized, /8319079055|bounded terminal result|secret|\/tmp\//i);
      await waitFor(() => releaseTrace !== null);
      releaseTrace!(traceResponse('DURABLE_TERMINAL_OK'));
      await waitFor(() => sent.length === 1);
      assert.match(sent[0], /DURABLE_TERMINAL_OK/);
      await waitFor(async () => (await loadTerminalDeliveryOutbox(testCase.target)).length === 0);
    } finally {
      global.fetch = originalFetch;
      await cleanupCase(testCase.stateDir);
    }
  });

  await test('reloads and requeues a pending terminal record after relay restart', async () => {
    const testCase = await configureCase(250);
    try {
      global.fetch = async () => new Promise<Response>(() => {});
      const firstBot = { telegram: { sendMessage: async () => { throw new Error('old relay must not send'); } } };
      await startMissionRelay(firstBot as any);
      assert.equal((await postTerminalEvent(testCase.port, testCase.missionId)).status, 202);
      assert.equal((await loadTerminalDeliveryOutbox(testCase.target)).length, 1);
      await stopMissionRelayForTests();
      resetMissionRelayDeliveryStateForTests();
      resetMissionRelayRegistryForTests();
      resetTerminalDeliveryOutboxForTests();

      const sent: string[] = [];
      global.fetch = async () => traceResponse('RESTART_RECOVERY_OK');
      const recoveredBot = { telegram: { sendMessage: async (_chatId: number, text: string) => { sent.push(text); } } };
      await startMissionRelay(recoveredBot as any);
      await waitFor(() => sent.length === 1);
      assert.match(sent[0], /RESTART_RECOVERY_OK/);
      assert.equal((await loadTerminalDeliveryOutbox(testCase.target)).length, 0);
    } finally {
      global.fetch = originalFetch;
      await cleanupCase(testCase.stateDir);
    }
  });

  await test('retries a transient Telegram send failure and clears only after persistent completion proof', async () => {
    const testCase = await configureCase();
    try {
      global.fetch = async () => traceResponse('RETRY_SEND_OK');
      let sends = 0;
      const bot = { telegram: { sendMessage: async () => {
        sends += 1;
        if (sends === 1) throw new Error('temporary Telegram failure');
      } } };
      await startMissionRelay(bot as any);
      assert.equal((await postTerminalEvent(testCase.port, testCase.missionId)).status, 202);
      await waitFor(() => sends >= 2);
      await waitFor(async () => (await loadTerminalDeliveryOutbox(testCase.target)).length === 0);

      let persistenceAttempts = 0;
      let firstPersistenceFailure = false;
      resetMissionRelayDeliveryStateForTests();
      setCompletionDeliveryCacheWriterForTests(async (filePath, value) => {
        persistenceAttempts += 1;
        if (persistenceAttempts === 1) {
          firstPersistenceFailure = true;
          throw new Error('temporary completion cache failure');
        }
        await writeJsonAtomic(filePath, value);
      });
      const secondMission = `${testCase.missionId}-persistence`;
      await registerMissionRelay({
        missionId: secondMission, chatId: '8319079055', userId: '8319079055',
        requestId: 'request-persistence', goal: 'Persist before cleanup.', createdAt: new Date().toISOString(),
        relayPort: testCase.port, relayProfile: testCase.target.relayProfile
      });
      assert.equal((await postTerminalEvent(testCase.port, secondMission)).status, 202);
      await waitFor(() => firstPersistenceFailure);
      assert.equal((await loadTerminalDeliveryOutbox(testCase.target)).some((entry) => entry.missionId === secondMission), true);
      await waitFor(() => persistenceAttempts >= 2);
      await waitFor(async () => !(await loadTerminalDeliveryOutbox(testCase.target)).some((entry) => entry.missionId === secondMission));
    } finally {
      global.fetch = originalFetch;
      await cleanupCase(testCase.stateDir);
    }
  });

  await test('prunes corrupt and stale outbox records without replaying them', async () => {
    const testCase = await configureCase();
    try {
      await writeJsonAtomic(terminalDeliveryOutboxPathForTests(testCase.target), [
        { schema: 'spark.telegram_terminal_delivery.v1', missionId: '../secret', relayProfile: testCase.target.relayProfile },
        {
          schema: 'spark.telegram_terminal_delivery.v1', missionId: 'spark-stale', eventType: 'mission_completed',
          relayProfile: testCase.target.relayProfile, relayPort: testCase.target.relayPort, state: 'pending', attempts: 0,
          createdAt: '2020-01-01T00:00:00.000Z', updatedAt: '2020-01-01T00:00:00.000Z', nextAttemptAt: null, lastFailure: null
        }
      ]);
      assert.deepEqual(await loadTerminalDeliveryOutbox(testCase.target), []);
    } finally {
      await cleanupCase(testCase.stateDir);
    }
  });
}

main().catch(async (error) => {
  global.fetch = originalFetch;
  restoreEnv();
  await stopMissionRelayForTests().catch(() => {});
  console.error(error);
  process.exitCode = 1;
});
