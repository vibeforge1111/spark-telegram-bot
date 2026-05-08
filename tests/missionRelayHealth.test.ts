import assert from 'node:assert/strict';
import { missionRelayHealthPayload, setMissionRelayRuntimeStatus } from '../src/missionRelay';

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
  setMissionRelayRuntimeStatus({ telegramPolling: 'active', pollingStartedAt: '2026-05-08T09:30:00.000Z' });

  const payload = missionRelayHealthPayload();

  assert.equal(payload.ok, true);
  assert.equal(payload.runtime.telegramPolling, 'active');
  assert.equal(payload.runtime.pollingStartedAt, '2026-05-08T09:30:00.000Z');
});

test('relay health stays ready for smoke mode without Telegram polling', () => {
  setMissionRelayRuntimeStatus({ telegramPolling: 'disabled', pollingStartedAt: null });

  const payload = missionRelayHealthPayload();

  assert.equal(payload.ok, true);
  assert.equal(payload.runtime.telegramPolling, 'disabled');
});
