import assert from 'node:assert/strict';
import {
  buildHarnessProofCapsule,
  harnessProofCapsuleFromTurnIntentEnvelope,
  summarizeHarnessProofCapsule,
  validateHarnessProofCapsuleV1
} from '../src/harnessProofCapsule';
import { buildTelegramTurnIntentEnvelope } from '../src/harnessContract';
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

function envelopeFor(text: string) {
  return buildTelegramTurnIntentEnvelope({
    text,
    decision: classifyTelegramIntentV2(text),
    userRef: 'user:qa',
    chatRef: 'chat:qa',
    accessProfile: 'admin',
    conversationKind: 'dm',
    turnId: 'turn:test',
    traceId: 'trace:test'
  });
}

test('builds a redacted allowed Harness proof capsule from a TurnIntent envelope', () => {
  const envelope = envelopeFor('Run a tiny no-edit Spawner mission that replies SPARK_QA_NO_EDIT_OK. Do not edit files.');
  const capsule = harnessProofCapsuleFromTurnIntentEnvelope({
    envelope,
    authorityDecision: 'allowed',
    executionStatus: 'started',
    tool: 'spawner.run',
    mutationClass: 'launches_mission',
    replyDelivered: true,
    replyShape: 'natural',
    joins: {
      telegram: 'joined',
      spawner: 'joined'
    }
  });

  assert.equal(validateHarnessProofCapsuleV1(capsule), true);
  assert.equal(capsule.schema, 'spark.harness_proof.v1');
  assert.match(capsule.turnRef, /^turn:sha256:[a-f0-9]{16}$/);
  assert.equal(capsule.authority.decision, 'allowed');
  assert.equal(capsule.governor.verified, true);
  assert.equal(capsule.execution.tool, 'spawner.run');
  assert.equal(capsule.reply.rawReasonsHidden, true);
  assert.doesNotMatch(JSON.stringify(capsule), /turn:test|trace:test|user:qa|chat:qa/);
});

test('builds blocked and downgraded fixtures without leaking raw policy reasons', () => {
  const blocked = buildHarnessProofCapsule({
    turnRef: '/Users/example/private/turn.json',
    route: 'spawner.build',
    owner: 'spark-telegram-bot',
    intent: { kind: 'spawner.build', confidence: 'explicit', noExecution: true },
    authority: {
      decision: 'blocked',
      contract: 'spark.turn_intent.v1',
      riskTier: 'execute',
      reasonSummary: 'tool_not_allowed_by_policy owner_mismatch /Users/example/private/path'
    },
    governor: { decision: 'deny', verified: true },
    execution: { status: 'blocked', tool: 'spawner.run', mutationClass: 'launches_mission' },
    reply: { delivered: true, shape: 'natural', rawReasonsHidden: true },
    joins: { telegram: 'joined', spawner: 'missing' }
  });
  const downgraded = buildHarnessProofCapsule({
    turnRef: 'turn:downgraded',
    route: 'memory.doctor',
    owner: 'spark-intelligence-builder',
    intent: { kind: 'memory.doctor', confidence: 'contextual', noExecution: false },
    authority: {
      decision: 'downgraded',
      contract: 'spark.turn_intent.v1',
      riskTier: 'read',
      reasonSummary: 'Harness downgraded this to read-only diagnostics.'
    },
    governor: { decision: 'read_only', verified: true },
    execution: { status: 'completed', tool: 'memory.diagnose', mutationClass: 'read_only' },
    reply: { delivered: true, shape: 'natural', rawReasonsHidden: true },
    joins: { telegram: 'joined', builder: 'joined', memory: 'missing' }
  });

  assert.equal(validateHarnessProofCapsuleV1(blocked), true);
  assert.equal(validateHarnessProofCapsuleV1(downgraded), true);
  assert.doesNotMatch(JSON.stringify(blocked), /tool_not_allowed_by_policy|owner_mismatch|\/Users\/example/);
  assert.match(summarizeHarnessProofCapsule(blocked), /Gaps: spawner/);
  assert.match(summarizeHarnessProofCapsule(downgraded), /Authority: downgraded/);
});

test('rejects missing-proof objects', () => {
  assert.equal(validateHarnessProofCapsuleV1(null), false);
  assert.equal(validateHarnessProofCapsuleV1({ schema: 'spark.harness_proof.v1' }), false);
  assert.equal(validateHarnessProofCapsuleV1({
    schema: 'spark.harness_proof.v1',
    turnRef: 'turn:test'
  }), false);
});
