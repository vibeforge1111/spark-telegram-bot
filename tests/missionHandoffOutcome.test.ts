import assert from 'node:assert/strict';
import {
  getMissionHandoffOutcome,
  resetMissionRelayDeliveryStateForTests,
  shouldSuppressMissionHandoff,
  tryClaimMissionHandoffOutcome,
} from '../src/missionRelay';

function test(name: string, fn: () => void): void {
  resetMissionRelayDeliveryStateForTests();
  try {
    fn();
    console.log(`ok - ${name}`);
  } catch (error) {
    console.error(`not ok - ${name}`);
    throw error;
  }
}

test('only one terminal handoff outcome can be claimed per mission', () => {
  assert.equal(tryClaimMissionHandoffOutcome('mission-1', 'canvas_ready'), true);
  assert.equal(tryClaimMissionHandoffOutcome('mission-1', 'failed'), false);
  assert.equal(getMissionHandoffOutcome('mission-1'), 'canvas_ready');
});

test('a claimed failure suppresses a later canvas-ready handoff', () => {
  assert.equal(tryClaimMissionHandoffOutcome('mission-2', 'failed'), true);
  assert.equal(shouldSuppressMissionHandoff('mission-2'), true);
  assert.equal(tryClaimMissionHandoffOutcome('mission-2', 'canvas_ready'), false);
});
