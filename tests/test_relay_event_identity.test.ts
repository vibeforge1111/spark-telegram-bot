import assert from 'node:assert/strict';
import {
  relayEventMatchesSubscription,
  type DeliverableRelayEvent,
  type MissionSubscription
} from '../src/missionRelay';

function test(name: string, fn: () => void): void {
  try {
    fn();
    console.log(`ok - ${name}`);
  } catch (error) {
    console.error(`not ok - ${name}`);
    throw error;
  }
}

function makeSubscription(overrides: Partial<MissionSubscription> = {}): MissionSubscription {
  return {
    missionId: 'mission-abc',
    chatId: '100200300',
    userId: '42',
    requestId: 'req-1',
    goal: 'test',
    createdAt: new Date().toISOString(),
    ...overrides
  };
}

function makeEvent(overrides: Partial<DeliverableRelayEvent> = {}): DeliverableRelayEvent {
  return {
    type: 'mission_completed',
    missionId: 'mission-abc',
    ...overrides
  };
}

test('event with no chatId and no userId is rejected', () => {
  const event = makeEvent({ data: {} });
  const sub = makeSubscription();
  assert.equal(relayEventMatchesSubscription(event, sub), false);
});

test('event with undefined data is rejected', () => {
  const event = makeEvent({ data: undefined });
  const sub = makeSubscription();
  assert.equal(relayEventMatchesSubscription(event, sub), false);
});

test('event with matching chatId and userId is accepted', () => {
  const event = makeEvent({ data: { chatId: '100200300', userId: '42' } });
  const sub = makeSubscription({ chatId: '100200300', userId: '42' });
  assert.equal(relayEventMatchesSubscription(event, sub), true);
});

test('event with correct chatId but wrong userId is rejected', () => {
  const event = makeEvent({ data: { chatId: '100200300', userId: '999' } });
  const sub = makeSubscription({ chatId: '100200300', userId: '42' });
  assert.equal(relayEventMatchesSubscription(event, sub), false);
});

test('fabricated event omitting identity fields cannot spoof subscription delivery', () => {
  // Attacker knows missionId but omits chatId/userId to exploit the old tautology.
  // After the fix this must return false regardless of missionId match.
  const fabricated = makeEvent({ missionId: 'mission-abc', data: {} });
  const sub = makeSubscription({ missionId: 'mission-abc', chatId: '100200300', userId: '42' });
  assert.equal(relayEventMatchesSubscription(fabricated, sub), false);
});
