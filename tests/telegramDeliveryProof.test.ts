import assert from 'node:assert/strict';
import { buildTelegramTurnIntentEnvelope } from '../src/harnessContract';
import { buildTelegramDeliveryProofCapsule } from '../src/telegramDeliveryProof';
import { authorizeTelegramActionFromEnvelope } from '../src/telegramActionAuthority';
import { classifyTelegramIntentV2 } from '../src/telegramIntentGate';

function test(name: string, fn: () => void): void {
  try {
    fn();
    console.log(`ok - ${name}`);
  } catch (error) {
    console.error(`not ok - ${name}`);
    throw error;
  }
}

test('explicit delivery route overrides broad envelope intent kind', () => {
  const text = 'Run a tiny mission through Spawner that only replies: SPARK_QA_NO_EDIT_OK. Do not edit files.';
  const envelope = buildTelegramTurnIntentEnvelope({
    text,
    decision: classifyTelegramIntentV2(text),
    userRef: 'user:qa',
    chatRef: 'chat:qa',
    accessProfile: 'admin',
    conversationKind: 'dm',
    turnId: 'turn:test-mission-proof',
    traceId: 'trace:test-mission-proof'
  });
  const authorization = authorizeTelegramActionFromEnvelope(envelope, {
    route: 'spawner.build',
    text,
    toolName: 'spawner.run',
    ownerSystem: 'spawner-ui',
    mutationClass: 'launches_mission'
  });
  const capsule = buildTelegramDeliveryProofCapsule({
    turnRef: 'trace:test-mission-proof',
    route: 'spawner.run',
    owner: 'spawner-ui',
    tool: 'spawner.run',
    mutationClass: 'launches_mission',
    executionStatus: 'started',
    replyDelivered: true,
    replyShape: 'natural',
    authorization,
    joins: { telegram: 'joined', spawner: 'joined' }
  });

  assert.equal(capsule.route, 'spawner.run');
  assert.equal(capsule.intent.kind, 'spawner.run');
  assert.notEqual(capsule.intent.kind, 'build_or_spawner');
});
