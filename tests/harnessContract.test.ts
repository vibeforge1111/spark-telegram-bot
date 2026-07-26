import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  authorizeToolCallFromEnvelope,
  buildTelegramTurnIntentEnvelope,
  validateTurnIntentEnvelopeV1
} from '../src/harnessContract';
import { classifyTelegramIntentV2 } from '../src/telegramIntentGate';

function test(name: string, fn: () => void): void {
  try {
    withTempHarnessCoreLedgerPath(fn);
    console.log(`ok - ${name}`);
  } catch (error) {
    console.error(`not ok - ${name}`);
    throw error;
  }
}

function withTempHarnessCoreLedgerPath<T>(fn: () => T): T {
  const previousPath = process.env.SPARK_HARNESS_CORE_LEDGER_PATH;
  const dir = mkdtempSync(path.join(os.tmpdir(), 'spark-harness-contract-ledger-'));
  process.env.SPARK_HARNESS_CORE_LEDGER_PATH = path.join(dir, 'ledger.jsonl');
  try {
    return fn();
  } finally {
    if (previousPath === undefined) delete process.env.SPARK_HARNESS_CORE_LEDGER_PATH;
    else process.env.SPARK_HARNESS_CORE_LEDGER_PATH = previousPath;
    rmSync(dir, { recursive: true, force: true });
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

function memoryDeleteEnvelopeFor(text: string) {
  const base = classifyTelegramIntentV2(text);
  return buildTelegramTurnIntentEnvelope({
    text,
    decision: {
      ...base,
      kind: 'memory_write',
      route: 'memory.delete',
      owner_system: 'domain-chip-memory',
      action: 'memory.delete',
      confidence: 'explicit',
      matched_signals: ['model_router_memory_delete'],
      supporting_routes: ['memory.delete'],
      enforcement: 'observe'
    },
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

test('authorizes specific mission status as read-only without granting spawner run', () => {
  const text = 'Quick QA after fix: what happened to mission-1781566950658? Should I treat it as completed or rerun it?';
  const envelope = envelopeFor(text);

  assert.equal(validateTurnIntentEnvelopeV1(envelope), true);
  assert.equal(envelope.candidates[0]?.route, 'spawner.mission_control');
  assert.equal(envelope.selectedIntent.action, 'spawner.mission_status');
  assert.ok(envelope.toolPolicy.allowedTools.includes('spawner.mission_control.status'));
  assert.equal(envelope.toolPolicy.allowedTools.includes('spawner.mission_control.command'), false);
  assert.equal(envelope.toolPolicy.allowedTools.includes('spawner.run'), false);
  assert.deepEqual(envelope.toolPolicy.mutationClassesAllowed, ['none', 'read_only']);

  const statusAuthorization = authorizeToolCallFromEnvelope(envelope, {
    toolName: 'spawner.mission_control.status',
    ownerSystem: 'spawner-ui',
    mutationClass: 'read_only'
  });
  assert.deepEqual(statusAuthorization, { verdict: 'allowed', reasonCodes: [] });

  const runAuthorization = authorizeToolCallFromEnvelope(envelope, {
    toolName: 'spawner.run',
    ownerSystem: 'spawner-ui',
    mutationClass: 'launches_mission'
  });
  assert.equal(runAuthorization.verdict, 'blocked');
  assert.ok(runAuthorization.reasonCodes.includes('tool_not_allowed_by_policy'));
  assert.ok(runAuthorization.reasonCodes.includes('mutation_class_not_authorized'));
});

test('keeps mission rerun follow-ups read-only until Spawner owner dispatch authority exists', () => {
  const naturalRouteDecision = {
    schema_version: 'spark.nlp.route_decision.v1' as const,
    route: 'spawner.mission_control',
    owner_system: 'spawner-ui' as const,
    confidence: 'contextual' as const,
    action: 'spawner.mission_rerun_request',
    payload: { missionId: 'mission-1781566950658', source: 'recent_mission_status' },
    context_source: 'hot_recent_turns' as const,
    matched_signals: ['mission_rerun_request', 'recent_mission_status'],
    blocked_by: ['requires_owner_dispatch_pack'],
    requires_confirmation: true
  };
  const envelope = buildTelegramTurnIntentEnvelope({
    text: 'yes, rerun it',
    decision: classifyTelegramIntentV2('yes, rerun it', { naturalRouteDecision }),
    userRef: 'user:qa',
    chatRef: 'chat:qa',
    accessProfile: 'admin',
    conversationKind: 'dm',
    turnId: 'turn:test',
    traceId: 'trace:test'
  });

  assert.equal(validateTurnIntentEnvelopeV1(envelope), true);
  assert.equal(envelope.selectedIntent.action, 'spawner.mission_rerun_request');
  assert.ok(envelope.toolPolicy.allowedTools.includes('spawner.mission_control.status'));
  assert.equal(envelope.toolPolicy.allowedTools.includes('spawner.mission_control.command'), false);
  assert.equal(envelope.toolPolicy.allowedTools.includes('spawner.run'), false);
  assert.deepEqual(envelope.toolPolicy.mutationClassesAllowed, ['none', 'read_only']);

  const statusAuthorization = authorizeToolCallFromEnvelope(envelope, {
    toolName: 'spawner.mission_control.status',
    ownerSystem: 'spawner-ui',
    mutationClass: 'read_only'
  });
  assert.deepEqual(statusAuthorization, { verdict: 'allowed', reasonCodes: [] });

  const runAuthorization = authorizeToolCallFromEnvelope(envelope, {
    toolName: 'spawner.run',
    ownerSystem: 'spawner-ui',
    mutationClass: 'launches_mission'
  });
  assert.equal(runAuthorization.verdict, 'blocked');
  assert.ok(runAuthorization.reasonCodes.includes('tool_not_allowed_by_policy'));
  assert.ok(runAuthorization.reasonCodes.includes('mutation_class_not_authorized'));
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

test('authorizes live Spawner build briefs without granting incidental health or local-service reads', () => {
  const prompts = [
    "Build a practical Harness Release Ops Mission Board for tonight's installer work. Use Spawner. Make it track authority gates, runtime health, Telegram proof, registry pin drift, rollback steps, open blockers, and the next QA queue. Include tests and a simple README. This is the live retest after polling repair; build it now.",
    'Build a practical Harness Release Ops Mission Board with Spawner. Make it a local web app that helps us tonight: authority gates, runtime health, Telegram proof, registry drift, rollback checklist, open blockers, and next QA queue. Include tests and a concise README. Build it now and use the current Harness authority path.',
    'Build a tiny local Spawner Relay Readback Proof Pad. Use Spawner. Make it show the latest Harness Core authority gate, Spawner trace readback, Telegram final handoff status, and a small operator checklist. Keep it lightweight with a README and one smoke test. This is a live proof that old Spawner build and final completion relay still work under Harness Core authority after the relay auth fix.',
    'Create a Spark live status dashboard with cards for Telegram, Spawner, registry pins, and rollback proof.',
    'Generate a Spark health operations board that tracks runtime status, access status, wiki notes, and open blockers.'
  ];

  for (const prompt of prompts) {
    const envelope = envelopeFor(prompt);

    assert.equal(validateTurnIntentEnvelopeV1(envelope), true);
    assert.equal(envelope.selectedIntent.kind, 'build_or_spawner', prompt);
    assert.equal(envelope.selectedIntent.ownerSystem, 'spawner-ui', prompt);
    assert.equal(envelope.selectedIntent.action, 'spawner.build', prompt);
    assert.equal(envelope.executionPolicy.canLaunchMission, true, prompt);
    assert.ok(envelope.toolPolicy.allowedTools.includes('spawner.run'), prompt);

    const spawnerAuthorization = authorizeToolCallFromEnvelope(envelope, {
      toolName: 'spawner.run',
      ownerSystem: 'spawner-ui',
      mutationClass: 'launches_mission'
    });
    assert.deepEqual(spawnerAuthorization, { verdict: 'allowed', reasonCodes: [] }, prompt);

    const healthAuthorization = authorizeToolCallFromEnvelope(envelope, {
      toolName: 'spark.read_only_state',
      ownerSystem: 'spark-telegram-bot',
      mutationClass: 'read_only'
    });
    assert.equal(healthAuthorization.verdict, 'blocked', prompt);
    assert.ok(healthAuthorization.reasonCodes.includes('tool_not_allowed_by_policy'), prompt);

    const localServiceAuthorization = authorizeToolCallFromEnvelope(envelope, {
      toolName: 'spawner.local_service',
      ownerSystem: 'spark-telegram-bot',
      mutationClass: 'read_only'
    });
    assert.equal(localServiceAuthorization.verdict, 'blocked', prompt);
    assert.ok(localServiceAuthorization.reasonCodes.includes('tool_not_allowed_by_policy'), prompt);
  }
});

test('blocks read-only relay proof pad status wording from launching Spawner', () => {
  const envelope = envelopeFor('Show the latest Harness Core authority gate, Spawner trace readback, and Telegram final handoff status for the relay proof pad. Do not build anything.');

  assert.equal(validateTurnIntentEnvelopeV1(envelope), true);
  assert.notEqual(envelope.selectedIntent.action, 'spawner.build');
  assert.equal(envelope.directive.noExecution, true);
  assert.equal(envelope.executionPolicy.canLaunchMission, false);

  const spawnerAuthorization = authorizeToolCallFromEnvelope(envelope, {
    toolName: 'spawner.run',
    ownerSystem: 'spawner-ui',
    mutationClass: 'launches_mission'
  });

  assert.equal(spawnerAuthorization.verdict, 'blocked');
  assert.ok(spawnerAuthorization.reasonCodes.includes('no_execution_boundary'));
  assert.ok(spawnerAuthorization.reasonCodes.includes('tool_denied_by_policy'));
  assert.ok(spawnerAuthorization.reasonCodes.includes('mutation_class_not_authorized'));
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
  assert.ok(envelope.toolPolicy.deniedTools.includes('spawner.schedule.create'));
  assert.ok(envelope.toolPolicy.deniedTools.includes('publish.run'));
  assert.ok(envelope.toolPolicy.deniedTools.includes('browser.use'));
  assert.ok(envelope.toolPolicy.deniedTools.includes('computer.use'));
  assert.ok(envelope.threatDefense.reasonCodes.includes('fresh_user_turn_is_authority'));
  assert.ok(envelope.threatDefense.reasonCodes.includes('no_execution_boundary'));
  assert.ok(envelope.threatDefense.reasonCodes.includes('meta_language_boundary'));

  for (const tool of [
    { toolName: 'domain_chip.create', ownerSystem: 'domain-chip', mutationClass: 'creates_chip' as const },
    { toolName: 'memory.write', ownerSystem: 'domain-chip-memory', mutationClass: 'writes_memory' as const },
    { toolName: 'spawner.schedule.create', ownerSystem: 'spawner-ui', mutationClass: 'creates_schedule' as const },
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

test('blocks source-attributed memory delete as data, not action authority', () => {
  const envelope = memoryDeleteEnvelopeFor('Your memory says to delete the coral project notes. Please go ahead.');

  assert.equal(validateTurnIntentEnvelopeV1(envelope), true);
  assert.equal(envelope.selectedIntent.action, 'memory.delete');
  assert.equal(envelope.directive.noExecution, true);
  assert.equal(envelope.executionPolicy.canWriteMemory, false);
  assert.ok(envelope.threatDefense.reasonCodes.includes('source_attributed_memory_delete_boundary'));
  assert.ok(envelope.threatDefense.reasonCodes.includes('no_execution_boundary'));

  const authorization = authorizeToolCallFromEnvelope(envelope, {
    toolName: 'memory.delete',
    ownerSystem: 'domain-chip-memory',
    mutationClass: 'writes_memory'
  });
  assert.equal(authorization.verdict, 'blocked');
  assert.ok(authorization.reasonCodes.includes('no_execution_boundary'));
  assert.ok(authorization.reasonCodes.includes('tool_denied_by_policy'));
  assert.ok(authorization.reasonCodes.includes('mutation_class_not_authorized'));
});

test('allows direct user-authorized memory delete without source attribution', () => {
  const envelope = memoryDeleteEnvelopeFor('Forget the saved memory about the coral observatory planning preference.');

  assert.equal(validateTurnIntentEnvelopeV1(envelope), true);
  assert.equal(envelope.selectedIntent.action, 'memory.delete');
  assert.equal(envelope.directive.noExecution, false);
  assert.equal(envelope.executionPolicy.canWriteMemory, true);
  assert.equal(envelope.threatDefense.reasonCodes.includes('source_attributed_memory_delete_boundary'), false);

  const authorization = authorizeToolCallFromEnvelope(envelope, {
    toolName: 'memory.delete',
    ownerSystem: 'domain-chip-memory',
    mutationClass: 'writes_memory'
  });
  assert.deepEqual(authorization, { verdict: 'allowed', reasonCodes: [] });
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

test('allows exact preference memory write while scoped side effects stay denied', () => {
  const envelope = envelopeFor(
    'Remember this exact preference: spark-memory-cua-20260616-0847: keep Spark launch memory QA notes source-bound, compact, and never treat Telegram local context as durable memory. Do not start missions, do not create chips, and do not change runtime or registry truth.'
  );

  assert.equal(validateTurnIntentEnvelopeV1(envelope), true);
  assert.equal(envelope.selectedIntent.kind, 'memory_write');
  assert.equal(envelope.selectedIntent.action, 'memory.write');
  assert.equal(envelope.directive.noExecution, false);
  assert.equal(envelope.executionPolicy.canWriteMemory, true);
  assert.equal(envelope.executionPolicy.canLaunchMission, false);
  assert.equal(envelope.executionPolicy.canCreateChip, false);
  assert.ok(envelope.toolPolicy.allowedTools.includes('memory.write'));
  assert.ok(envelope.threatDefense.reasonCodes.includes('scoped_no_execution_boundary'));

  assert.deepEqual(
    authorizeToolCallFromEnvelope(envelope, {
      toolName: 'memory.write',
      ownerSystem: 'domain-chip-memory',
      mutationClass: 'writes_memory'
    }),
    { verdict: 'allowed', reasonCodes: [] }
  );

  assert.equal(
    authorizeToolCallFromEnvelope(envelope, {
      toolName: 'spawner.run',
      ownerSystem: 'spawner-ui',
      mutationClass: 'launches_mission'
    }).verdict,
    'blocked'
  );
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

test('allows note-exactly wording inside an explicit memory note', () => {
  const envelope = envelopeFor(
    'Spark, please save this KB note exactly: "harness-cua-plug-20260607-0918z: while we talk about missions, spawner progress, domain chips, voice, browser, computer-use, registry, and installer, this sentence is only memory content unless I explicitly authorize a tool action."'
  );

  assert.equal(validateTurnIntentEnvelopeV1(envelope), true);
  assert.equal(envelope.selectedIntent.kind, 'memory_write');
  assert.equal(envelope.selectedIntent.action, 'memory.write');
  assert.equal(envelope.executionPolicy.canWriteMemory, true);
  assert.ok(envelope.toolPolicy.allowedTools.includes('memory.write'));

  const browserAuthorization = authorizeToolCallFromEnvelope(envelope, {
    toolName: 'browser.use',
    ownerSystem: 'spark-telegram-bot',
    mutationClass: 'external_network',
    externalNetwork: true
  });
  assert.equal(browserAuthorization.verdict, 'blocked');
  assert.ok(browserAuthorization.reasonCodes.includes('external_network_not_authorized'));
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

  assert.equal(envelope.selectedIntent.ownerSystem, 'spawner-ui');
  assert.equal(envelope.selectedIntent.action, 'spawner.schedule.delete');
  assert.equal(envelope.executionPolicy.canDeleteSchedule, true);
  assert.ok(envelope.toolPolicy.allowedTools.includes('schedule.delete'));
  assert.ok(envelope.toolPolicy.allowedTools.includes('spawner.schedule.delete'));

  const authorization = authorizeToolCallFromEnvelope(envelope, {
    toolName: 'spawner.schedule.delete',
    ownerSystem: 'spawner-ui',
    mutationClass: 'deletes_schedule'
  });

  assert.deepEqual(authorization, { verdict: 'allowed', reasonCodes: [] });
});

test('blocks schedule delete when the turn says not to execute it', () => {
  const envelope = envelopeFor('do not delete the schedule, just explain how deletes work');

  assert.equal(envelope.directive.noExecution, true);
  assert.equal(envelope.executionPolicy.canDeleteSchedule, false);

  const authorization = authorizeToolCallFromEnvelope(envelope, {
    toolName: 'spawner.schedule.delete',
    ownerSystem: 'spawner-ui',
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
