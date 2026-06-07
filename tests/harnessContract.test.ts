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

test('keeps publication approval-list boundaries answer-only', () => {
  const envelope = envelopeFor('I might ask you to publish later, but right now just list what would need approval.');

  assert.equal(validateTurnIntentEnvelopeV1(envelope), true);
  assert.equal(envelope.selectedIntent.kind, 'plain_conversation');
  assert.equal(envelope.selectedIntent.ownerSystem, 'spark-telegram-bot');
  assert.equal(envelope.selectedIntent.action, 'plain_chat.qa_boundary');
  assert.equal(envelope.directive.mode, 'answer');
  assert.equal(envelope.directive.noExecution, true);
  assert.equal(envelope.directive.noPublish, true);
  assert.equal(envelope.directive.localOnly, true);
  assert.equal(envelope.executionPolicy.canPublish, false);
  assert.equal(envelope.executionPolicy.canUseExternalNetwork, false);
  assert.equal(envelope.executionPolicy.canLaunchMission, false);
  assert.deepEqual(envelope.toolPolicy.mutationClassesAllowed, ['none', 'read_only']);
  assert.deepEqual(envelope.toolPolicy.allowedTools, ['answer.compose']);
  assert.ok(envelope.toolPolicy.deniedTools.includes('publish.run'));
  assert.ok(envelope.toolPolicy.deniedTools.includes('external.fetch'));

  const publishAuthorization = authorizeToolCallFromEnvelope(envelope, {
    toolName: 'publish.run',
    ownerSystem: 'spark-telegram-bot',
    mutationClass: 'publishes',
    publishes: true
  });
  assert.equal(publishAuthorization.verdict, 'blocked');
  assert.ok(publishAuthorization.reasonCodes.includes('no_execution_boundary'));
  assert.ok(publishAuthorization.reasonCodes.includes('no_publish_boundary'));
  assert.ok(publishAuthorization.reasonCodes.includes('tool_denied_by_policy'));
  assert.ok(publishAuthorization.reasonCodes.includes('mutation_class_not_authorized'));

  const networkAuthorization = authorizeToolCallFromEnvelope(envelope, {
    toolName: 'external.fetch',
    ownerSystem: 'spark-telegram-bot',
    mutationClass: 'external_network',
    externalNetwork: true
  });
  assert.equal(networkAuthorization.verdict, 'blocked');
  assert.ok(networkAuthorization.reasonCodes.includes('external_network_not_authorized'));
  assert.ok(networkAuthorization.reasonCodes.includes('tool_denied_by_policy'));
});

test('keeps browser/computer-use authorization boundaries answer-only', () => {
  const envelope = envelopeFor('Do not use computer use. Tell me when computer use would be allowed.');

  assert.equal(validateTurnIntentEnvelopeV1(envelope), true);
  assert.equal(envelope.selectedIntent.kind, 'plain_conversation');
  assert.equal(envelope.selectedIntent.ownerSystem, 'spark-telegram-bot');
  assert.equal(envelope.selectedIntent.action, 'plain_chat.qa_boundary');
  assert.equal(envelope.directive.mode, 'answer');
  assert.equal(envelope.directive.noExecution, true);
  assert.equal(envelope.directive.localOnly, true);
  assert.equal(envelope.executionPolicy.canLaunchMission, false);
  assert.equal(envelope.executionPolicy.canUseExternalNetwork, false);
  assert.deepEqual(envelope.toolPolicy.allowedTools, ['answer.compose']);
  assert.ok(envelope.toolPolicy.deniedTools.includes('browser.use'));
  assert.ok(envelope.toolPolicy.deniedTools.includes('computer.use'));

  const computerUseAuthorization = authorizeToolCallFromEnvelope(envelope, {
    toolName: 'computer.use',
    ownerSystem: 'spark-telegram-bot',
    mutationClass: 'external_network',
    externalNetwork: true
  });
  assert.equal(computerUseAuthorization.verdict, 'blocked');
  assert.ok(computerUseAuthorization.reasonCodes.includes('no_execution_boundary'));
  assert.ok(computerUseAuthorization.reasonCodes.includes('external_network_not_authorized'));
  assert.ok(computerUseAuthorization.reasonCodes.includes('tool_denied_by_policy'));
});

test('keeps old mission route bug descriptions answer-only', () => {
  const envelope = envelopeFor('I am describing the old bug: Spark saw "mission" and launched. Do not reproduce it.');

  assert.equal(validateTurnIntentEnvelopeV1(envelope), true);
  assert.equal(envelope.selectedIntent.kind, 'plain_conversation');
  assert.equal(envelope.selectedIntent.ownerSystem, 'spark-telegram-bot');
  assert.equal(envelope.selectedIntent.action, 'plain_chat.qa_boundary');
  assert.equal(envelope.directive.mode, 'answer');
  assert.equal(envelope.directive.noExecution, true);
  assert.equal(envelope.executionPolicy.canLaunchMission, false);
  assert.deepEqual(envelope.toolPolicy.allowedTools, ['answer.compose']);

  const missionAuthorization = authorizeToolCallFromEnvelope(envelope, {
    toolName: 'spawner.run',
    ownerSystem: 'spawner-ui',
    mutationClass: 'launches_mission'
  });
  assert.equal(missionAuthorization.verdict, 'blocked');
  assert.ok(missionAuthorization.reasonCodes.includes('no_execution_boundary'));
  assert.ok(missionAuthorization.reasonCodes.includes('tool_denied_by_policy'));
  assert.ok(missionAuthorization.reasonCodes.includes('mutation_class_not_authorized'));
});

test('keeps quoted drafted high-agency examples answer-only', () => {
  const envelope = envelopeFor('In documentation, should we include "create a memory chip" as an example?');

  assert.equal(validateTurnIntentEnvelopeV1(envelope), true);
  assert.equal(envelope.selectedIntent.kind, 'plain_conversation');
  assert.equal(envelope.selectedIntent.ownerSystem, 'spark-telegram-bot');
  assert.equal(envelope.selectedIntent.action, 'plain_chat.quoted_example_boundary');
  assert.equal(envelope.directive.mode, 'answer');
  assert.equal(envelope.directive.noExecution, true);
  assert.equal(envelope.directive.localOnly, true);
  assert.equal(envelope.directive.quotedOrMetaLanguage, true);
  assert.equal(envelope.executionPolicy.canLaunchMission, false);
  assert.equal(envelope.executionPolicy.canWriteMemory, false);
  assert.equal(envelope.executionPolicy.canCreateChip, false);
  assert.equal(envelope.executionPolicy.canCreateSchedule, false);
  assert.equal(envelope.executionPolicy.canPublish, false);
  assert.deepEqual(envelope.toolPolicy.allowedTools, ['answer.compose']);
  assert.ok(envelope.toolPolicy.deniedTools.includes('domain_chip.create'));
  assert.ok(envelope.toolPolicy.deniedTools.includes('memory.write'));
  assert.ok(envelope.toolPolicy.deniedTools.includes('schedule.create'));
  assert.ok(envelope.toolPolicy.deniedTools.includes('publish.run'));
  assert.ok(envelope.toolPolicy.deniedTools.includes('browser.use'));
  assert.ok(envelope.toolPolicy.deniedTools.includes('computer.use'));
  assert.ok(envelope.threatDefense.reasonCodes.includes('fresh_user_turn_is_authority'));
  assert.ok(envelope.threatDefense.reasonCodes.includes('no_execution_boundary'));
  assert.ok(envelope.threatDefense.reasonCodes.includes('meta_language_boundary'));

  for (const tool of [
    { toolName: 'domain_chip.create', ownerSystem: 'domain-chip', mutationClass: 'creates_chip' as const },
    { toolName: 'memory.write', ownerSystem: 'domain-chip-memory', mutationClass: 'writes_memory' as const },
    { toolName: 'schedule.create', ownerSystem: 'spark-intelligence-builder', mutationClass: 'creates_schedule' as const },
    { toolName: 'publish.run', ownerSystem: 'spark-telegram-bot', mutationClass: 'publishes' as const },
    { toolName: 'browser.use', ownerSystem: 'spark-telegram-bot', mutationClass: 'external_network' as const, externalNetwork: true }
  ]) {
    const authorization = authorizeToolCallFromEnvelope(envelope, tool);
    assert.equal(authorization.verdict, 'blocked', tool.toolName);
    assert.ok(authorization.reasonCodes.includes('no_execution_boundary'), tool.toolName);
    assert.ok(authorization.reasonCodes.includes('tool_denied_by_policy'), tool.toolName);
    assert.ok(authorization.reasonCodes.includes('mutation_class_not_authorized'), tool.toolName);
  }
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

test('allows scoped owner-approved memory write while denying other negative side effects', () => {
  const envelope = envelopeFor(
    'Harness native QA memory/KB positive: owner approves exactly one memory write. Save this exact KB note and nothing else: "harness-cua-kb-20260607-0703: Browser/computer-use must remain read-only planning until Harness Core grants explicit tool authority with screenshot and side-effect evidence." Do not start missions, do not create chips, and do not change runtime or registry truth.'
  );

  assert.equal(validateTurnIntentEnvelopeV1(envelope), true);
  assert.equal(envelope.selectedIntent.kind, 'memory_write');
  assert.equal(envelope.selectedIntent.action, 'memory.write');
  assert.equal(envelope.directive.noExecution, false);
  assert.equal(envelope.executionPolicy.canWriteMemory, true);
  assert.equal(envelope.executionPolicy.canLaunchMission, false);
  assert.equal(envelope.executionPolicy.canCreateChip, false);
  assert.equal(envelope.executionPolicy.canPublish, false);
  assert.ok(envelope.toolPolicy.allowedTools.includes('memory.write'));
  assert.ok(envelope.threatDefense.reasonCodes.includes('scoped_no_execution_boundary'));

  const memoryAuthorization = authorizeToolCallFromEnvelope(envelope, {
    toolName: 'memory.write',
    ownerSystem: 'domain-chip-memory',
    mutationClass: 'writes_memory'
  });
  assert.deepEqual(memoryAuthorization, { verdict: 'allowed', reasonCodes: [] });

  for (const blocked of [
    { toolName: 'spawner.run', ownerSystem: 'spawner-ui', mutationClass: 'launches_mission' as const },
    { toolName: 'domain_chip.create', ownerSystem: 'spawner-ui', mutationClass: 'creates_chip' as const },
    { toolName: 'browser.use', ownerSystem: 'spark-telegram-bot', mutationClass: 'external_network' as const, externalNetwork: true }
  ]) {
    const authorization = authorizeToolCallFromEnvelope(envelope, blocked);
    assert.equal(authorization.verdict, 'blocked', blocked.toolName);
    assert.ok(authorization.reasonCodes.includes('tool_not_allowed_by_policy'), blocked.toolName);
    assert.ok(authorization.reasonCodes.includes('mutation_class_not_authorized'), blocked.toolName);
  }
});

test('allows quoted tool-surface wording inside an explicit memory note', () => {
  const envelope = envelopeFor(
    'Spark, please save this exact KB note for me: "harness-cua-kb-20260607-0812z: Native Telegram Desktop CUA canary proves quoted tool-surface words stay memory content; missions, chips, browser/computer-use, runtime, and registry appear here as nouns inside the approved note while Harness Core chooses the actual authorized tool for the turn."'
  );

  assert.equal(validateTurnIntentEnvelopeV1(envelope), true);
  assert.equal(envelope.selectedIntent.kind, 'memory_write');
  assert.equal(envelope.selectedIntent.action, 'memory.write');
  assert.equal(envelope.directive.noExecution, false);
  assert.equal(envelope.directive.quotedOrMetaLanguage, true);
  assert.equal(envelope.executionPolicy.canWriteMemory, true);
  assert.ok(envelope.toolPolicy.allowedTools.includes('memory.write'));
  assert.ok(envelope.threatDefense.reasonCodes.includes('meta_language_boundary'));
  assert.ok(envelope.threatDefense.reasonCodes.includes('scoped_no_execution_boundary'));

  const memoryAuthorization = authorizeToolCallFromEnvelope(envelope, {
    toolName: 'memory.write',
    ownerSystem: 'domain-chip-memory',
    mutationClass: 'writes_memory'
  });
  assert.deepEqual(memoryAuthorization, { verdict: 'allowed', reasonCodes: [] });

  const browserAuthorization = authorizeToolCallFromEnvelope(envelope, {
    toolName: 'browser.use',
    ownerSystem: 'spark-telegram-bot',
    mutationClass: 'external_network',
    externalNetwork: true
  });
  assert.equal(browserAuthorization.verdict, 'blocked');
  assert.ok(browserAuthorization.reasonCodes.includes('external_network_not_authorized'));
  assert.ok(browserAuthorization.reasonCodes.includes('tool_not_allowed_by_policy'));
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
