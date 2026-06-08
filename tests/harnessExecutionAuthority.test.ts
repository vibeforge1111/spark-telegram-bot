import assert from 'node:assert/strict';
import {
  createHarnessCoreActionEnvelopeVNext,
  createHarnessCoreAuthorizedGovernorDecision,
  signHarnessCoreGovernorDecision,
  type GovernorDecisionV1
} from '@spark/harness-core';
import { harnessExecutionAuthorityFailureReason } from '../src/harnessExecutionAuthority';

function test(name: string, fn: () => void): void {
  try {
    fn();
    console.log(`ok - ${name}`);
  } catch (error) {
    console.error(`not ok - ${name}`);
    throw error;
  }
}

function withGovernorHmacEnv(fn: () => void): void {
  const previousKey = process.env.SPARK_GOVERNOR_HMAC_KEY;
  const previousKeyId = process.env.SPARK_GOVERNOR_HMAC_KEY_ID;
  try {
    process.env.SPARK_GOVERNOR_HMAC_KEY = 'test-governor-secret';
    process.env.SPARK_GOVERNOR_HMAC_KEY_ID = 'telegram-unit-test';
    fn();
  } finally {
    if (previousKey === undefined) delete process.env.SPARK_GOVERNOR_HMAC_KEY;
    else process.env.SPARK_GOVERNOR_HMAC_KEY = previousKey;
    if (previousKeyId === undefined) delete process.env.SPARK_GOVERNOR_HMAC_KEY_ID;
    else process.env.SPARK_GOVERNOR_HMAC_KEY_ID = previousKeyId;
  }
}

function spawnerRunDecision(): GovernorDecisionV1 {
  const envelope = createHarnessCoreActionEnvelopeVNext({
    surface: 'telegram',
    ownerSystem: 'spawner-ui',
    toolName: 'spawner.run',
    mutationClass: 'launches_mission',
    source: 'telegram.authority.test',
    reason: 'Focused Telegram execution authority regression.',
    requestId: 'telegram-authority-test',
    actorKind: 'human',
    actorIdRef: 'telegram-user:test',
    target: 'spawner'
  });
  return createHarnessCoreAuthorizedGovernorDecision({
    envelope,
    tool_name: 'spawner.run'
  });
}

const expectedSpawnerRun = {
  toolName: 'spawner.run',
  ownerSystem: 'spawner-ui',
  actionType: 'launch_mission' as const
};

test('accepts unsigned Governor execution authority when no HMAC key is configured', () => {
  delete process.env.SPARK_GOVERNOR_HMAC_KEY;
  delete process.env.SPARK_GOVERNOR_HMAC_KEY_ID;

  assert.equal(harnessExecutionAuthorityFailureReason(spawnerRunDecision(), expectedSpawnerRun), null);
});

test('requires signed Governor execution authority when an HMAC key is configured', () => withGovernorHmacEnv(() => {
  const reason = harnessExecutionAuthorityFailureReason(spawnerRunDecision(), expectedSpawnerRun);

  assert.match(reason || '', /governor_signature_missing/);
}));

test('accepts signed Governor execution authority when the configured key matches', () => withGovernorHmacEnv(() => {
  const signedDecision = signHarnessCoreGovernorDecision(spawnerRunDecision(), {
    key: 'test-governor-secret',
    key_id: 'telegram-unit-test',
    nonce: 'nonce:telegram-authority-test'
  });

  assert.equal(harnessExecutionAuthorityFailureReason(signedDecision, expectedSpawnerRun), null);
}));

test('rejects tampered signed Governor execution authority', () => withGovernorHmacEnv(() => {
  const signedDecision = signHarnessCoreGovernorDecision(spawnerRunDecision(), {
    key: 'test-governor-secret',
    key_id: 'telegram-unit-test',
    nonce: 'nonce:telegram-authority-test'
  });
  const tamperedDecision = {
    ...signedDecision,
    tool_ledgers: signedDecision.tool_ledgers.map((ledger) => ({
      ...ledger,
      tool_name: 'spawner.copied'
    }))
  };

  const reason = harnessExecutionAuthorityFailureReason(tamperedDecision, expectedSpawnerRun);

  assert.match(reason || '', /governor_signature_invalid/);
}));
