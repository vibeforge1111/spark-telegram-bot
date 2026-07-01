import assert from 'node:assert/strict';
import {
  authorizeToolCallFromEnvelope,
  buildTelegramTurnIntentEnvelope,
  validateTurnIntentEnvelopeV1
} from '../src/harnessContract';
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

test('creates a valid answer-only envelope for meta action words', () => {
  const envelope = envelopeFor('I am mentioning build and mission, but do not start anything. Just explain the current risk.');

  assert.equal(validateTurnIntentEnvelopeV1(envelope), true);
  assert.equal(envelope.schema, 'spark.turn_intent.v1');
  assert.equal(envelope.directive.mode, 'answer');
  assert.equal(envelope.directive.noExecution, true);
  assert.equal(envelope.directive.explanationOnly, true);
  assert.equal(envelope.directive.quotedOrMetaLanguage, true);
  assert.equal(envelope.executionPolicy.canLaunchMission, false);
  assert.equal(envelope.executionPolicy.canMutateFiles, false);
  assert.ok(envelope.threatDefense.reasonCodes.includes('fresh_user_turn_is_authority'));
  assert.ok(envelope.threatDefense.reasonCodes.includes('no_execution_boundary'));
});

test('authorizes explicit startup canary through the startup lane contract', () => {
  const envelope = envelopeFor('Run a startup self-improvement canary comparing improved and non-improved answers.');

  assert.equal(validateTurnIntentEnvelopeV1(envelope), true);
  assert.equal(envelope.directive.mode, 'execute');
  assert.equal(envelope.selectedIntent.ownerSystem, 'spark-intelligence-builder');
  assert.equal(envelope.executionPolicy.canLaunchMission, true);
  assert.ok(envelope.laneContract);
  assert.equal(envelope.laneContract?.laneId, 'startup-operator');

  const authorization = authorizeToolCallFromEnvelope(envelope, {
    toolName: 'spawner.run',
    ownerSystem: 'spark-intelligence-builder',
    mutationClass: 'launches_mission'
  });

  assert.deepEqual(authorization, { verdict: 'allowed', reasonCodes: [] });
});

test('blocks tool execution when the envelope does not authorize mutation', () => {
  const envelope = envelopeFor('Do not run or build anything; just explain whether build routes are risky.');

  const authorization = authorizeToolCallFromEnvelope(envelope, {
    toolName: 'spawner.run',
    ownerSystem: 'spawner-ui',
    mutationClass: 'launches_mission'
  });

  assert.equal(authorization.verdict, 'blocked');
  assert.ok(authorization.reasonCodes.includes('no_execution_boundary'));
  assert.ok(authorization.reasonCodes.includes('tool_denied_by_policy'));
  assert.ok(authorization.reasonCodes.includes('mutation_class_not_authorized'));
});

test('blocks tool execution without a valid envelope', () => {
  const authorization = authorizeToolCallFromEnvelope(null, {
    toolName: 'spawner.run',
    ownerSystem: 'spawner-ui',
    mutationClass: 'launches_mission'
  });

  assert.deepEqual(authorization, {
    verdict: 'blocked',
    reasonCodes: ['missing_or_invalid_envelope']
  });
});

test('keeps memory authority evidence-only in the envelope', () => {
  const envelope = envelopeFor('What do you remember about how I like mission updates? Keep it short and do not run anything.');

  assert.equal(envelope.directive.mode, 'answer');
  assert.equal(envelope.directive.noExecution, true);
  assert.equal(envelope.threatDefense.recalledMemory, 'evidence_only');
  assert.equal(envelope.sessionScope.memoryLoadPolicy, 'evidence_only');
  assert.equal(envelope.executionPolicy.canLaunchMission, false);
});

test('authorizes explicit Memory Doctor as read-only diagnostics', () => {
  const envelope = envelopeFor('run memory doctor for last request');

  assert.equal(envelope.selectedIntent.ownerSystem, 'spark-intelligence-builder');
  assert.equal(envelope.selectedIntent.action, 'memory.doctor');
  assert.equal(envelope.directive.mode, 'inspect');
  assert.ok(envelope.toolPolicy.allowedTools.includes('memory.diagnose'));

  const authorization = authorizeToolCallFromEnvelope(envelope, {
    toolName: 'memory.diagnose',
    ownerSystem: 'spark-intelligence-builder',
    mutationClass: 'read_only'
  });

  assert.deepEqual(authorization, { verdict: 'allowed', reasonCodes: [] });
});

test('authorizes explicit schedule delete for Builder bridge confirmation flow', () => {
  const envelope = envelopeFor('delete the nightly schedule');

  assert.equal(envelope.selectedIntent.ownerSystem, 'spark-intelligence-builder');
  assert.equal(envelope.selectedIntent.action, 'schedule.delete');
  assert.equal(envelope.executionPolicy.canDeleteSchedule, true);
  assert.ok(envelope.toolPolicy.allowedTools.includes('schedule.delete'));

  const authorization = authorizeToolCallFromEnvelope(envelope, {
    toolName: 'schedule.delete',
    ownerSystem: 'spark-intelligence-builder',
    mutationClass: 'deletes_schedule'
  });

  assert.deepEqual(authorization, { verdict: 'allowed', reasonCodes: [] });
});

test('blocks schedule delete when the turn says not to execute it', () => {
  const envelope = envelopeFor('do not delete the schedule, just explain how deletes work');

  assert.equal(envelope.directive.noExecution, true);
  assert.equal(envelope.executionPolicy.canDeleteSchedule, false);

  const authorization = authorizeToolCallFromEnvelope(envelope, {
    toolName: 'schedule.delete',
    ownerSystem: 'spark-intelligence-builder',
    mutationClass: 'deletes_schedule'
  });

  assert.equal(authorization.verdict, 'blocked');
  assert.ok(authorization.reasonCodes.includes('no_execution_boundary'));
});

test('allows private Domain Chip creation while forbidding publication and outbound side effects', () => {
  const text = [
    'Build a private Domain Chip for daily schedule reliability.',
    'It should handle recurring tasks and timezone ambiguity.',
    'Keep it private/local; no publishing, activation, or real reminder sends.'
  ].join(' ');
  const envelope = envelopeFor(text);

  assert.equal(envelope.selectedIntent.action, 'domain_chip.create');
  assert.equal(envelope.directive.noExecution, false);
  assert.equal(envelope.directive.noPublish, true);
  assert.equal(envelope.directive.localOnly, true);
  assert.equal(envelope.executionPolicy.canCreateChip, true);
  assert.ok(envelope.toolPolicy.allowedTools.includes('domain_chip.create'));
  assert.ok(envelope.toolPolicy.deniedTools.includes('publish.run'));

  const authorization = authorizeToolCallFromEnvelope(envelope, {
    toolName: 'domain_chip.create',
    ownerSystem: envelope.selectedIntent.ownerSystem,
    mutationClass: 'creates_chip'
  });

  assert.deepEqual(authorization, { verdict: 'allowed', reasonCodes: [] });
});

test('keeps explicit Domain Chip no-create wording chat-only', () => {
  const envelope = envelopeFor('Do not create a Domain Chip for schedule reliability; just explain the benchmark design.');

  assert.equal(envelope.directive.noExecution, true);
  assert.equal(envelope.executionPolicy.canCreateChip, false);

  const authorization = authorizeToolCallFromEnvelope(envelope, {
    toolName: 'domain_chip.create',
    ownerSystem: envelope.selectedIntent.ownerSystem,
    mutationClass: 'creates_chip'
  });

  assert.equal(authorization.verdict, 'blocked');
  assert.ok(authorization.reasonCodes.includes('no_execution_boundary'));
});

test('allows preview-only Domain Chip staging without create authority', () => {
  const text = [
    'Create a private local Domain Chip starter preview for Operations Research Watchdesk.',
    'Do not run benchmarks, autoloops, activation, publishing, registry changes, or network absorption.',
    'Show the private starter preview and ask me for go before creating files.'
  ].join(' ');
  const envelope = envelopeFor(text);

  assert.equal(envelope.selectedIntent.action, 'domain_chip.preview');
  assert.equal(envelope.selectedIntent.ownerSystem, 'spark-telegram-bot');
  assert.equal(envelope.directive.noExecution, false);
  assert.equal(envelope.executionPolicy.canCreateChip, false);
  assert.ok(envelope.toolPolicy.allowedTools.includes('answer.compose'));
  assert.ok(!envelope.toolPolicy.allowedTools.includes('domain_chip.create'));

  const previewAuthorization = authorizeToolCallFromEnvelope(envelope, {
    toolName: 'answer.compose',
    ownerSystem: 'spark-telegram-bot',
    mutationClass: 'read_only'
  });
  assert.deepEqual(previewAuthorization, { verdict: 'allowed', reasonCodes: [] });

  const createAuthorization = authorizeToolCallFromEnvelope(envelope, {
    toolName: 'domain_chip.create',
    ownerSystem: 'domain-chip',
    mutationClass: 'creates_chip'
  });
  assert.equal(createAuthorization.verdict, 'blocked');
  assert.ok(createAuthorization.reasonCodes.includes('tool_not_allowed_by_policy'));
});

test('blocks reply-composer owner from claiming mutation tools', () => {
  const envelope = envelopeFor('Build a private Domain Chip for daily schedule reliability.');

  const mutationAuthorization = authorizeToolCallFromEnvelope(envelope, {
    toolName: 'domain_chip.create',
    ownerSystem: envelope.runtimeOwnership.replyComposerOwner,
    mutationClass: 'creates_chip'
  });

  assert.equal(mutationAuthorization.verdict, 'blocked');
  assert.ok(mutationAuthorization.reasonCodes.includes('owner_mismatch'));

  const replyAuthorization = authorizeToolCallFromEnvelope(envelope, {
    toolName: 'answer.compose',
    ownerSystem: envelope.runtimeOwnership.replyComposerOwner,
    mutationClass: 'read_only'
  });

  assert.deepEqual(replyAuthorization, { verdict: 'allowed', reasonCodes: [] });
});
