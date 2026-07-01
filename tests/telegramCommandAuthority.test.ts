import assert from 'node:assert/strict';
import {
  authorizeTelegramCommandAction,
  buildTelegramCommandActionEnvelope,
  commandRouteForRunVariant
} from '../src/telegramCommandAuthority';

function test(name: string, fn: () => void): void {
  try {
    fn();
    console.log(`ok - ${name}`);
  } catch (error) {
    console.error(`not ok - ${name}`);
    throw error;
  }
}

function commandAuth(input: {
  text: string;
  commandName: string;
  route: Parameters<typeof authorizeTelegramCommandAction>[0]['route'];
  toolName: string;
  ownerSystem: string;
  mutationClass: Parameters<typeof authorizeTelegramCommandAction>[0]['mutationClass'];
  action?: string;
  kind?: Parameters<typeof authorizeTelegramCommandAction>[0]['kind'];
  externalNetwork?: boolean;
}) {
  return authorizeTelegramCommandAction({
    ...input,
    userRef: 'user:qa',
    chatRef: 'chat:qa',
    accessProfile: 'admin',
    conversationKind: 'command'
  });
}

test('slash run build commands authorize through command envelope', () => {
  const text = '/run Build a tiny static landing page for a cafe with a menu section.';
  const result = commandAuth({
    text,
    commandName: 'run',
    route: commandRouteForRunVariant({ commandName: 'run', isBuild: true }),
    toolName: 'spawner.run',
    ownerSystem: 'spawner-ui',
    mutationClass: 'launches_mission',
    action: 'spawner.build',
    kind: 'build_or_spawner'
  });

  assert.equal(result.allow, true);
  assert.equal(result.harnessCore?.envelope.surface, 'telegram');
  assert.equal(result.harnessCore?.envelope.selected_move, 'execute_action');
  assert.equal(result.harnessCore?.authorization.verdict, 'allow');
});

test('slash provider run keeps no-file wording as a launch constraint, not a no-run boundary', () => {
  const text = '/runcodex Reply exactly TESTER_REALPATH_OK and do not create files.';
  const envelope = buildTelegramCommandActionEnvelope({
    text,
    commandName: 'runcodex',
    route: 'natural_run',
    toolName: 'spawner.run',
    ownerSystem: 'spawner-ui',
    mutationClass: 'launches_mission',
    userRef: 'user:qa',
    chatRef: 'chat:qa',
    accessProfile: 'admin',
    conversationKind: 'command'
  });
  const result = commandAuth({
    text,
    commandName: 'runcodex',
    route: 'natural_run',
    toolName: 'spawner.run',
    ownerSystem: 'spawner-ui',
    mutationClass: 'launches_mission'
  });

  assert.equal(envelope.directive.noExecution, false);
  assert.equal(result.allow, true);
  assert.equal(result.harnessCore?.authorization.verdict, 'allow');
});

test('slash run commands still block explicit no-run boundaries', () => {
  const text = '/run do not run, launch, or execute anything; just explain mission routing.';
  const result = commandAuth({
    text,
    commandName: 'run',
    route: 'natural_run',
    toolName: 'spawner.run',
    ownerSystem: 'spawner-ui',
    mutationClass: 'launches_mission'
  });

  assert.equal(result.allow, false);
  assert.ok(result.reasonCodes.includes('no_execution_boundary'));
  assert.ok(result.reasonCodes.includes('harness_core:authority_state_chat_only'));
});

test('slash schedule create and delete commands authorize distinct schedule tools', () => {
  const create = commandAuth({
    text: '/schedule "*/5 * * * *" mission summarize deployment health',
    commandName: 'schedule',
    route: 'schedule.create',
    toolName: 'spawner.schedule.create',
    ownerSystem: 'spawner-ui',
    mutationClass: 'creates_schedule',
    action: 'spawner.schedule.create',
    kind: 'schedule_mutation'
  });
  const remove = commandAuth({
    text: '/schedules delete sched-abc123',
    commandName: 'schedules',
    route: 'schedule.delete',
    toolName: 'spawner.schedule.delete',
    ownerSystem: 'spawner-ui',
    mutationClass: 'deletes_schedule',
    action: 'spawner.schedule.delete',
    kind: 'schedule_mutation'
  });

  assert.equal(create.allow, true);
  assert.equal(create.toolAuthorization.verdict, 'allowed');
  assert.equal(remove.allow, true);
  assert.equal(remove.toolAuthorization.verdict, 'allowed');
});

test('slash schedule command blocks contradictory no-schedule text', () => {
  const result = commandAuth({
    text: '/schedule "*/5 * * * *" mission summarize deployment health but do not schedule anything',
    commandName: 'schedule',
    route: 'schedule.create',
    toolName: 'spawner.schedule.create',
    ownerSystem: 'spawner-ui',
    mutationClass: 'creates_schedule',
    action: 'spawner.schedule.create',
    kind: 'schedule_mutation'
  });

  assert.equal(result.allow, false);
  assert.ok(result.reasonCodes.includes('no_execution_boundary'));
});

test('slash access changes authorize through access tool policy', () => {
  const result = commandAuth({
    text: '/access 4',
    commandName: 'access',
    route: 'access.change',
    toolName: 'access.change',
    ownerSystem: 'spark-telegram-bot',
    mutationClass: 'writes_files',
    action: 'access.change',
    kind: 'access_help'
  });

  assert.equal(result.allow, true);
  assert.equal(result.toolAuthorization.verdict, 'allowed');
  assert.equal(result.harnessCore?.authorization.verdict, 'allow');
});

test('slash access changes block contradictory no-change text', () => {
  const result = commandAuth({
    text: '/access 4 but do not change access yet',
    commandName: 'access',
    route: 'access.change',
    toolName: 'access.change',
    ownerSystem: 'spark-telegram-bot',
    mutationClass: 'writes_files',
    action: 'access.change',
    kind: 'access_help'
  });

  assert.equal(result.allow, false);
  assert.ok(result.reasonCodes.includes('no_execution_boundary'));
});

test('access action commands and callbacks authorize operator tools', () => {
  const doctor = commandAuth({
    text: '/docker_doctor',
    commandName: 'docker_doctor',
    route: 'operator.safe_action',
    toolName: 'operator.safe_action',
    ownerSystem: 'spark-telegram-bot',
    mutationClass: 'read_only',
    action: 'operator.safe_action.docker_doctor',
    kind: 'runtime_truth_or_operator'
  });
  const callback = commandAuth({
    text: 'spark_access:workspace_setup:confirm',
    commandName: 'callback:workspace_setup',
    route: 'operator.safe_action',
    toolName: 'operator.safe_action',
    ownerSystem: 'spark-telegram-bot',
    mutationClass: 'writes_files',
    action: 'operator.safe_action.workspace_setup',
    kind: 'runtime_truth_or_operator'
  });
  const level5Confirm = commandAuth({
    text: 'spark_access_level:operator:confirm',
    commandName: 'access',
    route: 'access.change',
    toolName: 'access.change',
    ownerSystem: 'spark-telegram-bot',
    mutationClass: 'writes_files',
    action: 'access.change.operator_confirm',
    kind: 'access_help'
  });

  assert.equal(doctor.allow, true);
  assert.equal(callback.allow, true);
  assert.equal(level5Confirm.allow, true);
});

test('creator plan commands allow plan-only no-run language', () => {
  const result = commandAuth({
    text: '/creator plan private risk medium create a Startup YC benchmark path; do not run or publish it yet',
    commandName: 'creator',
    route: 'creator.mission',
    toolName: 'creator.mission.create',
    ownerSystem: 'spawner-ui',
    mutationClass: 'creates_chip',
    action: 'creator.mission.plan',
    kind: 'creator_or_domain_chip'
  });

  assert.equal(result.allow, true);
  assert.equal(result.harnessCore?.authorization.verdict, 'allow');
});

test('chip create commands block contradictory no-create language', () => {
  const result = commandAuth({
    text: '/chip create a pricing objection coach but do not create a chip',
    commandName: 'chip',
    route: 'domain_chip.create',
    toolName: 'domain_chip.create',
    ownerSystem: 'domain-chip',
    mutationClass: 'creates_chip',
    action: 'domain_chip.create',
    kind: 'creator_or_domain_chip'
  });

  assert.equal(result.allow, false);
  assert.ok(result.reasonCodes.includes('no_execution_boundary'));
});

test('recursive and Spark QA slash actions authorize through command envelopes', () => {
  const recursiveStart = commandAuth({
    text: '/recursive start startup-yc rounds 1',
    commandName: 'recursive',
    route: 'recursive.start',
    toolName: 'recursive.loop',
    ownerSystem: 'spark-telegram-bot',
    mutationClass: 'launches_mission',
    action: 'recursive.start',
    kind: 'recursive_or_swarm'
  });
  const recursiveRead = commandAuth({
    text: '/recursive report startup-yc',
    commandName: 'recursive',
    route: 'recursive.command',
    toolName: 'recursive.report',
    ownerSystem: 'spark-telegram-bot',
    mutationClass: 'read_only',
    action: 'recursive.report',
    kind: 'recursive_or_swarm'
  });
  const sparkQaBenchmark = commandAuth({
    text: '/sparkqa benchmark Spark QA Operator level 7',
    commandName: 'sparkqa',
    route: 'sparkqa.benchmark',
    toolName: 'sparkqa.benchmark',
    ownerSystem: 'spark-telegram-bot',
    mutationClass: 'writes_files',
    action: 'sparkqa.benchmark',
    kind: 'diagnostic_or_self_awareness'
  });

  assert.equal(recursiveStart.allow, true);
  assert.equal(recursiveRead.allow, true);
  assert.equal(recursiveRead.harnessCore?.envelope.selected_move, 'read_current_state');
  assert.equal(sparkQaBenchmark.allow, true);
});

test('recursive start commands block contradictory no-run language', () => {
  const result = commandAuth({
    text: '/recursive start startup-yc rounds 1 but do not run it',
    commandName: 'recursive',
    route: 'recursive.start',
    toolName: 'recursive.loop',
    ownerSystem: 'spark-telegram-bot',
    mutationClass: 'launches_mission',
    action: 'recursive.start',
    kind: 'recursive_or_swarm'
  });

  assert.equal(result.allow, false);
  assert.ok(result.reasonCodes.includes('no_execution_boundary'));
});

test('memory and wiki mutation commands authorize through command envelopes', () => {
  const remember = commandAuth({
    text: '/remember startup operator prefers benchmark-backed claims',
    commandName: 'remember',
    route: 'memory.write',
    toolName: 'memory.write',
    ownerSystem: 'domain-chip-memory',
    mutationClass: 'writes_memory',
    action: 'memory.write',
    kind: 'memory_write'
  });
  const forget = commandAuth({
    text: '/forget stale startup operator score',
    commandName: 'forget',
    route: 'memory.delete',
    toolName: 'memory.delete',
    ownerSystem: 'domain-chip-memory',
    mutationClass: 'writes_memory',
    action: 'memory.delete',
    kind: 'memory_write'
  });
  const wiki = commandAuth({
    text: '/wiki promote verified Harness Core owns action authority',
    commandName: 'wiki',
    route: 'spark_wiki.promote',
    toolName: 'spark_wiki.promote',
    ownerSystem: 'spark-intelligence-builder',
    mutationClass: 'writes_memory',
    action: 'spark_wiki.promote',
    kind: 'wiki_or_knowledge'
  });

  assert.equal(remember.allow, true);
  assert.equal(forget.allow, true);
  assert.equal(wiki.allow, true);
});

test('wiki read commands authorize read-only tools through command envelopes', () => {
  const query = commandAuth({
    text: '/wiki query Harness Core authority ledgers',
    commandName: 'wiki',
    route: 'spark_wiki.query',
    toolName: 'spark_wiki.query',
    ownerSystem: 'spark-intelligence-builder',
    mutationClass: 'read_only',
    action: 'spark_wiki.query',
    kind: 'wiki_or_knowledge'
  });
  const answer = commandAuth({
    text: '/wiki answer how should route tracing work?',
    commandName: 'wiki',
    route: 'spark_wiki.answer',
    toolName: 'spark_wiki.answer',
    ownerSystem: 'spark-intelligence-builder',
    mutationClass: 'read_only',
    action: 'spark_wiki.answer',
    kind: 'wiki_or_knowledge'
  });
  const inventory = commandAuth({
    text: '/wiki pages',
    commandName: 'wiki',
    route: 'spark_wiki.inventory',
    toolName: 'spark_wiki.inventory',
    ownerSystem: 'spark-intelligence-builder',
    mutationClass: 'read_only',
    action: 'spark_wiki.inventory',
    kind: 'wiki_or_knowledge'
  });
  const status = commandAuth({
    text: '/wiki status',
    commandName: 'wiki',
    route: 'spark_wiki.status',
    toolName: 'spark_wiki.status',
    ownerSystem: 'spark-intelligence-builder',
    mutationClass: 'read_only',
    action: 'spark_wiki.status',
    kind: 'wiki_or_knowledge'
  });

  for (const result of [query, answer, inventory, status]) {
    assert.equal(result.allow, true);
    assert.equal(result.toolAuthorization.verdict, 'allowed');
    assert.equal(result.harnessCore?.authorization.verdict, 'allow');
    assert.equal(result.governorDecision?.outcome, 'read_only');
  }
});

test('memory and wiki mutation commands block contradictory no-write language', () => {
  const remember = commandAuth({
    text: '/remember startup operator note but do not remember anything',
    commandName: 'remember',
    route: 'memory.write',
    toolName: 'memory.write',
    ownerSystem: 'domain-chip-memory',
    mutationClass: 'writes_memory',
    action: 'memory.write',
    kind: 'memory_write'
  });
  const wiki = commandAuth({
    text: '/wiki promote Harness Core owns action authority but do not promote it',
    commandName: 'wiki',
    route: 'spark_wiki.promote',
    toolName: 'spark_wiki.promote',
    ownerSystem: 'spark-intelligence-builder',
    mutationClass: 'writes_memory',
    action: 'spark_wiki.promote',
    kind: 'wiki_or_knowledge'
  });

  assert.equal(remember.allow, false);
  assert.equal(wiki.allow, false);
  assert.ok(remember.reasonCodes.includes('no_execution_boundary'));
  assert.ok(wiki.reasonCodes.includes('no_execution_boundary'));
});

test('self improvement and model switch commands authorize through command envelopes', () => {
  const selfImprove = commandAuth({
    text: '/self improve routing evidence summaries',
    commandName: 'self',
    route: 'spark.self_improvement',
    toolName: 'spark.self_improvement',
    ownerSystem: 'spark-intelligence-builder',
    mutationClass: 'writes_files',
    action: 'spark.self_improvement',
    kind: 'diagnostic_or_self_awareness'
  });
  const modelSwitch = commandAuth({
    text: '/model agent codex',
    commandName: 'model',
    route: 'model.switch',
    toolName: 'model.switch',
    ownerSystem: 'spark-telegram-bot',
    mutationClass: 'writes_files',
    action: 'model.switch',
    kind: 'runtime_truth_or_operator'
  });
  const modelStatus = commandAuth({
    text: '/model status',
    commandName: 'model',
    route: 'model.switch',
    toolName: 'model.status',
    ownerSystem: 'spark-telegram-bot',
    mutationClass: 'read_only',
    action: 'model.status',
    kind: 'runtime_truth_or_operator'
  });

  assert.equal(selfImprove.allow, true);
  assert.equal(modelSwitch.allow, true);
  assert.equal(modelStatus.allow, true);
  assert.equal(modelStatus.harnessCore?.envelope.selected_move, 'read_current_state');
  assert.equal(modelStatus.harnessCore?.authorization.restrictions.write_allowed, false);
  assert.equal(modelStatus.governorDecision?.tool_ledgers[0]?.tool_name, 'model.status');
});

test('voice commands authorize exact status, diagnostics, self-test, speak, and setup hook tools through command envelopes', () => {
  const status = commandAuth({
    text: '/voice status',
    commandName: 'voice',
    route: 'voice.command',
    toolName: 'voice.status',
    ownerSystem: 'spark-voice-comms',
    mutationClass: 'read_only',
    action: 'voice.status',
    kind: 'runtime_truth_or_operator',
    externalNetwork: false
  });
  const doctor = commandAuth({
    text: '/voice doctor',
    commandName: 'voice',
    route: 'voice.command',
    toolName: 'voice.diagnostics.run',
    ownerSystem: 'spark-voice-comms',
    mutationClass: 'read_only',
    action: 'voice.diagnostics.run',
    kind: 'runtime_truth_or_operator',
    externalNetwork: false
  });
  const selfTest = commandAuth({
    text: '/voice self-test',
    commandName: 'voice',
    route: 'voice.command',
    toolName: 'voice.self_test.run',
    ownerSystem: 'spark-voice-comms',
    mutationClass: 'external_network',
    action: 'voice.self_test.run',
    kind: 'runtime_truth_or_operator',
    externalNetwork: true
  });
  const speak = commandAuth({
    text: '/voice speak SPARK_VOICE_QA_DELIVERY_OK',
    commandName: 'voice',
    route: 'voice.command',
    toolName: 'voice.speak',
    ownerSystem: 'spark-voice-comms',
    mutationClass: 'external_network',
    action: 'voice.speak',
    kind: 'runtime_truth_or_operator',
    externalNetwork: true
  });
  const setup = commandAuth({
    text: '/voice onboard local',
    commandName: 'voice',
    route: 'voice.command',
    toolName: 'voice.onboard',
    ownerSystem: 'spark-voice-comms',
    mutationClass: 'writes_files',
    action: 'voice.onboard',
    kind: 'runtime_truth_or_operator',
    externalNetwork: true
  });

  assert.equal(status.allow, true);
  assert.equal(doctor.allow, true);
  assert.equal(selfTest.allow, true);
  assert.equal(speak.allow, true);
  assert.equal(setup.allow, true);
  assert.equal(doctor.governorDecision?.tool_ledgers[0]?.tool_name, 'voice.diagnostics.run');
  assert.equal(selfTest.governorDecision?.tool_ledgers[0]?.tool_name, 'voice.self_test.run');
  assert.equal(speak.legacyEnvelope?.selectedIntent.ownerSystem, 'spark-voice-comms');
  assert.equal(speak.legacyEnvelope?.selectedIntent.action, 'voice.speak');
  assert.equal(speak.governorDecision?.tool_ledgers[0]?.tool_name, 'voice.speak');
  assert.equal(setup.harnessCore?.action.action_type, 'external_api_call');
  assert.equal(status.harnessCore?.authorization.restrictions.write_allowed, false);
  assert.equal(speak.harnessCore?.authorization.restrictions.network_allowed, true);
  assert.equal(setup.harnessCore?.authorization.restrictions.write_allowed, true);
});

test('voice speak treats voice-note wording as payload while preserving no-network boundary', () => {
  const speakVoiceNote = commandAuth({
    text: '/voice speak Hello from Spark voice QA. Please send this as a short voice note.',
    commandName: 'voice',
    route: 'voice.command',
    toolName: 'voice.speak',
    ownerSystem: 'spark-voice-comms',
    mutationClass: 'external_network',
    action: 'voice.speak',
    kind: 'runtime_truth_or_operator',
    externalNetwork: true
  });
  const noNetworkTrap = commandAuth({
    text: '/voice speak Hello from Spark voice QA without network.',
    commandName: 'voice',
    route: 'voice.command',
    toolName: 'voice.speak',
    ownerSystem: 'spark-voice-comms',
    mutationClass: 'external_network',
    action: 'voice.speak',
    kind: 'runtime_truth_or_operator',
    externalNetwork: true
  });

  assert.equal(speakVoiceNote.allow, true);
  assert.equal(speakVoiceNote.legacyEnvelope?.directive.noExecution, false);
  assert.equal(speakVoiceNote.harnessCore?.authorization.restrictions.network_allowed, true);
  assert.equal(noNetworkTrap.allow, false);
  assert.ok(noNetworkTrap.reasonCodes.includes('external_network_not_authorized'));
});

test('route probe commands authorize through command envelopes', () => {
  const browserProbe = commandAuth({
    text: '/probe browser',
    commandName: 'probe',
    route: 'route.probe',
    toolName: 'route.probe',
    ownerSystem: 'spark-intelligence-builder',
    mutationClass: 'writes_memory',
    action: 'route.probe.spark_browser',
    kind: 'diagnostic_or_self_awareness',
    externalNetwork: true
  });
  const coreProbe = commandAuth({
    text: '/probe core',
    commandName: 'probe',
    route: 'route.probe',
    toolName: 'route.probe',
    ownerSystem: 'spark-intelligence-builder',
    mutationClass: 'writes_memory',
    action: 'route.probe.core',
    kind: 'diagnostic_or_self_awareness'
  });

  assert.equal(browserProbe.allow, true);
  assert.equal(browserProbe.harnessCore?.authorization.restrictions.network_allowed, true);
  assert.equal(browserProbe.harnessCore?.authorization.restrictions.write_allowed, true);
  assert.equal(coreProbe.allow, true);
  assert.equal(coreProbe.harnessCore?.envelope.selected_move, 'execute_action');
  assert.equal(coreProbe.harnessCore?.authorization.restrictions.network_allowed, false);
  assert.equal(coreProbe.harnessCore?.authorization.restrictions.write_allowed, true);
});

test('route probe commands block contradictory no-probe language', () => {
  const result = commandAuth({
    text: '/probe browser but do not probe or test browser right now',
    commandName: 'probe',
    route: 'route.probe',
    toolName: 'route.probe',
    ownerSystem: 'spark-intelligence-builder',
    mutationClass: 'writes_memory',
    action: 'route.probe.spark_browser',
    kind: 'diagnostic_or_self_awareness',
    externalNetwork: true
  });

  assert.equal(result.allow, false);
  assert.ok(result.reasonCodes.includes('no_execution_boundary'));
  assert.ok(result.reasonCodes.includes('harness_core:authority_state_chat_only'));
});

test('legacy Spark process and reflect commands authorize through command envelopes', () => {
  const processQueue = commandAuth({
    text: '/process',
    commandName: 'process',
    route: 'spark.process',
    toolName: 'spark.process_queue',
    ownerSystem: 'spark-telegram-bot',
    mutationClass: 'writes_memory',
    action: 'spark.process_queue',
    kind: 'diagnostic_or_self_awareness'
  });
  const reflect = commandAuth({
    text: '/reflect',
    commandName: 'reflect',
    route: 'spark.reflect',
    toolName: 'spark.reflect',
    ownerSystem: 'spark-telegram-bot',
    mutationClass: 'writes_memory',
    action: 'spark.reflect',
    kind: 'diagnostic_or_self_awareness'
  });

  assert.equal(processQueue.allow, true);
  assert.equal(reflect.allow, true);
  assert.equal(processQueue.harnessCore?.authorization.restrictions.write_allowed, true);
  assert.equal(reflect.harnessCore?.authorization.restrictions.write_allowed, true);
});

test('self improvement and model switch commands block contradictory no-action language', () => {
  const selfImprove = commandAuth({
    text: '/self improve routing evidence summaries but do not improve anything',
    commandName: 'self',
    route: 'spark.self_improvement',
    toolName: 'spark.self_improvement',
    ownerSystem: 'spark-intelligence-builder',
    mutationClass: 'writes_files',
    action: 'spark.self_improvement',
    kind: 'diagnostic_or_self_awareness'
  });
  const modelSwitch = commandAuth({
    text: '/model agent codex but do not switch models',
    commandName: 'model',
    route: 'model.switch',
    toolName: 'model.switch',
    ownerSystem: 'spark-telegram-bot',
    mutationClass: 'writes_files',
    action: 'model.switch',
    kind: 'runtime_truth_or_operator'
  });
  const modelStatus = commandAuth({
    text: '/model status but do not check settings',
    commandName: 'model',
    route: 'model.switch',
    toolName: 'model.status',
    ownerSystem: 'spark-telegram-bot',
    mutationClass: 'read_only',
    action: 'model.status',
    kind: 'runtime_truth_or_operator'
  });

  assert.equal(selfImprove.allow, false);
  assert.equal(modelSwitch.allow, false);
  assert.equal(modelStatus.allow, false);
  assert.ok(selfImprove.reasonCodes.includes('no_execution_boundary'));
  assert.ok(modelSwitch.reasonCodes.includes('no_execution_boundary'));
  assert.ok(modelStatus.reasonCodes.includes('no_execution_boundary'));
  assert.ok(modelStatus.reasonCodes.includes('harness_core:authority_state_chat_only'));
});

test('voice setup commands block contradictory no-setup language', () => {
  const result = commandAuth({
    text: '/voice onboard local but do not set up voice yet',
    commandName: 'voice',
    route: 'voice.command',
    toolName: 'voice.command',
    ownerSystem: 'spark-intelligence-builder',
    mutationClass: 'writes_files',
    action: 'voice.configure',
    kind: 'runtime_truth_or_operator',
    externalNetwork: true
  });

  assert.equal(result.allow, false);
  assert.ok(result.reasonCodes.includes('no_execution_boundary'));
});

test('legacy Spark process and reflect commands block contradictory no-action language', () => {
  const processQueue = commandAuth({
    text: '/process but do not process anything',
    commandName: 'process',
    route: 'spark.process',
    toolName: 'spark.process_queue',
    ownerSystem: 'spark-telegram-bot',
    mutationClass: 'writes_memory',
    action: 'spark.process_queue',
    kind: 'diagnostic_or_self_awareness'
  });
  const reflect = commandAuth({
    text: '/reflect but do not reflect right now',
    commandName: 'reflect',
    route: 'spark.reflect',
    toolName: 'spark.reflect',
    ownerSystem: 'spark-telegram-bot',
    mutationClass: 'writes_memory',
    action: 'spark.reflect',
    kind: 'diagnostic_or_self_awareness'
  });

  assert.equal(processQueue.allow, false);
  assert.equal(reflect.allow, false);
  assert.ok(processQueue.reasonCodes.includes('no_execution_boundary'));
  assert.ok(reflect.reasonCodes.includes('no_execution_boundary'));
});
