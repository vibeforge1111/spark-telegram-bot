import assert from 'node:assert/strict';
import {
  missionRelayHealthPayload,
  setMissionRelayRuntimeStatus,
} from '../src/missionRelay';
import { protectRelayHealthPayload } from '../src/relayHealthPrivacy';

function test(name: string, fn: () => void): void {
  try {
    fn();
    console.log(`ok - ${name}`);
  } catch (error) {
    console.error(`not ok - ${name}`);
    throw error;
  }
}

test('relay health waits for Telegram polling to become active', () => {
  setMissionRelayRuntimeStatus({ telegramPolling: 'starting', pollingStartedAt: null });

  const payload = missionRelayHealthPayload();

  assert.equal(payload.ok, false);
  assert.deepEqual(payload.runtime, { telegramPolling: 'starting', pollingStartedAt: null });
});

test('relay health is ready once Telegram polling is active', () => {
  setMissionRelayRuntimeStatus({
    telegramPolling: 'active',
    pollingStartedAt: '2026-05-08T09:30:00.000Z',
    pollingLastGetUpdatesAttemptAt: '2026-05-08T09:30:01.000Z',
    pollingGetUpdatesCount: 3
  });

  const payload = missionRelayHealthPayload();

  assert.equal(payload.ok, true);
  assert.equal(payload.runtime.telegramPolling, 'active');
  assert.equal(payload.runtime.pollingStartedAt, '2026-05-08T09:30:00.000Z');
  assert.equal(payload.runtime.pollingLastGetUpdatesAttemptAt, '2026-05-08T09:30:01.000Z');
  assert.equal(payload.runtime.pollingGetUpdatesCount, 3);
});

test('relay health stays ready for smoke mode without Telegram polling', () => {
  setMissionRelayRuntimeStatus({ telegramPolling: 'disabled', pollingStartedAt: null });

  const payload = missionRelayHealthPayload();

  assert.equal(payload.ok, true);
  assert.equal(payload.runtime.telegramPolling, 'disabled');
});

test('relay health fails closed when Telegram polling records an error', () => {
  setMissionRelayRuntimeStatus({
    telegramPolling: 'error',
    pollingStartedAt: '2026-06-29T15:09:00.000Z',
    pollingLastErrorAt: '2026-06-29T15:10:00.000Z',
    pollingLastError: 'Telegram token check failed: network timeout'
  });

  const payload = missionRelayHealthPayload();

  assert.equal(payload.ok, false);
  assert.equal(payload.runtime.telegramPolling, 'error');
  assert.equal(payload.runtime.pollingLastErrorAt, '2026-06-29T15:10:00.000Z');
  assert.equal(payload.runtime.pollingLastError, 'Telegram token check failed: network timeout');
});

test('relay health fails closed when Telegram polling stops after startup', () => {
  setMissionRelayRuntimeStatus({
    telegramPolling: 'stopped',
    pollingStartedAt: '2026-06-29T15:09:00.000Z',
    pollingStoppedAt: '2026-06-29T15:11:00.000Z',
    pollingLastError: 'Telegram polling stopped'
  });

  const payload = missionRelayHealthPayload();

  assert.equal(payload.ok, false);
  assert.equal(payload.runtime.telegramPolling, 'stopped');
  assert.equal(payload.runtime.pollingStoppedAt, '2026-06-29T15:11:00.000Z');
});

test('relay health exposes full runtime detail only with the relay secret', () => {
  setMissionRelayRuntimeStatus({
    telegramPolling: 'active',
    pollingStartedAt: '2026-07-15T12:00:00.000Z'
  });

  const response = protectRelayHealthPayload(
    missionRelayHealthPayload(),
    'relay-health-secret-abcdefghijklmnopqrstuvwxyz',
    'relay-health-secret-abcdefghijklmnopqrstuvwxyz'
  );

  assert.equal(response.status, 200);
  assert.equal(response.payload.service, 'spark-telegram-bot');
  assert.equal(typeof response.payload.pid, 'number');
  assert.equal(response.payload.runtime?.telegramPolling, 'active');
  assert.equal(typeof response.payload.relay, 'object');
});

test('relay health keeps unauthenticated liveness useful without topology detail', () => {
  setMissionRelayRuntimeStatus({
    telegramPolling: 'active',
    pollingStartedAt: '2026-07-15T12:00:00.000Z'
  });

  for (const supplied of [undefined, 'wrong-relay-health-secret-abcdefghijk']) {
    const response = protectRelayHealthPayload(
      missionRelayHealthPayload(),
      supplied,
      'relay-health-secret-abcdefghijklmnopqrstuvwxyz'
    );
    assert.equal(response.status, 200);
    assert.deepEqual(response.payload, { ok: true, service: 'spark-telegram-bot' });
    assert.equal('pid' in response.payload, false);
    assert.equal('relay' in response.payload, false);
    assert.equal('runtime' in response.payload, false);
  }
});

test('relay health preserves readiness status without exposing failure detail', () => {
  setMissionRelayRuntimeStatus({
    telegramPolling: 'error',
    pollingLastError: 'Telegram token check failed with private runtime detail'
  });

  const response = protectRelayHealthPayload(
    missionRelayHealthPayload(),
    undefined,
    'relay-health-secret-abcdefghijklmnopqrstuvwxyz'
  );

  assert.equal(response.status, 503);
  assert.deepEqual(response.payload, { ok: false, service: 'spark-telegram-bot' });
  assert.doesNotMatch(JSON.stringify(response.payload), /private runtime detail/);
});
