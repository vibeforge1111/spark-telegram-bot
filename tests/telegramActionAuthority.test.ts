import assert from 'node:assert/strict';
import {
  createHarnessCoreActionEnvelopeVNext,
  createHarnessCoreAuthorizedGovernorDecision
} from '@spark/harness-core';
import { buildTelegramTurnIntentEnvelope } from '../src/harnessContract';
import {
  authorizeTelegramActionFromEnvelope,
  governorOutcomeAllowsTelegramAction
} from '../src/telegramActionAuthority';
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

test('blocks action words when the fresh turn is meta or no-execution', () => {
  const text = 'I am mentioning build and mission, but do not start anything. Just explain the risk.';
  const result = authorizeTelegramActionFromEnvelope(envelopeFor(text), {
    route: 'spawner.build',
    text,
    toolName: 'spawner.run',
    ownerSystem: 'spawner-ui',
    mutationClass: 'launches_mission'
  });

  assert.equal(result.allow, false);
  assert.equal(result.routeVerdict.allow, false);
  assert.equal(result.toolAuthorization.verdict, 'blocked');
  assert.ok(result.reasonCodes.includes('route_firewall:no_execution_boundary'));
  assert.ok(result.reasonCodes.includes('no_execution_boundary'));
});

test('allows explicit project build only when route and envelope both authorize it', () => {
  const text = 'Build a private local-first dashboard for memory reports with stale context and source labels.';
  const result = authorizeTelegramActionFromEnvelope(envelopeFor(text), {
    route: 'spawner.build',
    text,
    toolName: 'spawner.run',
    ownerSystem: 'spawner-ui',
    mutationClass: 'launches_mission'
  });

  assert.equal(result.allow, true);
  assert.equal(result.routeVerdict.allow, true);
  assert.equal(result.toolAuthorization.verdict, 'allowed');
});

test('keeps local-only publication bans as build constraints', () => {
  const text = 'Build a local-only static proof page called Spark Proof Tile. Do not publish, deploy, or push anything.';
  const decision = classifyTelegramIntentV2(text);
  const envelope = envelopeFor(text);
  const result = authorizeTelegramActionFromEnvelope(envelope, {
    route: 'spawner.build',
    text,
    toolName: 'spawner.run',
    ownerSystem: 'spawner-ui',
    mutationClass: 'launches_mission'
  });

  assert.equal(decision.route, 'spawner.build');
  assert.equal(decision.constraints.noPublish, true);
  assert.equal(decision.constraints.localOnly, true);
  assert.equal(envelope.selectedIntent.action, 'spawner.build');
  assert.equal(envelope.directive.noExecution, false);
  assert.equal(result.allow, true);
  assert.equal(result.routeVerdict.reason, 'concrete_project_build_local_only');
  assert.equal(result.toolAuthorization.verdict, 'allowed');
});

test('final Telegram action boundary never treats prepare as execution authority', () => {
  const text = 'Build a private local-first dashboard for memory reports with stale context and source labels.';
  const result = authorizeTelegramActionFromEnvelope(envelopeFor(text), {
    route: 'spawner.build',
    text,
    toolName: 'spawner.run',
    ownerSystem: 'spawner-ui',
    mutationClass: 'launches_mission'
  });
  assert.ok(result.harnessCore?.action);

  const preparedDecision = {
    ...result.governorDecision!,
    outcome: 'prepare' as const,
    execution_boundary: {
      ...result.governorDecision!.execution_boundary,
      action_authorized: false
    }
  };

  assert.equal(governorOutcomeAllowsTelegramAction(preparedDecision, result.harnessCore.action, 'spawner.run'), false);
  assert.equal(governorOutcomeAllowsTelegramAction(result.governorDecision, result.harnessCore.action, 'spawner.run'), true);
  assert.equal(governorOutcomeAllowsTelegramAction(result.governorDecision, result.harnessCore.action, 'spawner.files'), false);
});

test('final Telegram action boundary rejects copied Governor ledgers', () => {
  const text = 'Build a private local-first dashboard for memory reports with stale context and source labels.';
  const result = authorizeTelegramActionFromEnvelope(envelopeFor(text), {
    route: 'spawner.build',
    text,
    toolName: 'spawner.run',
    ownerSystem: 'spawner-ui',
    mutationClass: 'launches_mission'
  });
  assert.ok(result.harnessCore?.action);
  assert.equal(result.governorDecision?.outcome, 'execute');

  const copiedLedgerDecision = {
    ...result.governorDecision!,
    tool_ledgers: result.governorDecision!.tool_ledgers.map((ledger) => ({
      ...ledger,
      action_id: 'action:stale-ledger',
      authorization: {
        ...ledger.authorization,
        action_id: 'action:stale-ledger'
      }
    }))
  };

  assert.equal(copiedLedgerDecision.outcome, 'execute');
  assert.equal(governorOutcomeAllowsTelegramAction(copiedLedgerDecision, result.harnessCore.action, 'spawner.run'), false);
});

test('final Telegram action boundary allows read-only Governor outcome only for read tools', () => {
  const envelope = createHarnessCoreActionEnvelopeVNext({
    surface: 'telegram',
    ownerSystem: 'spark-telegram-bot',
    toolName: 'spark.status',
    mutationClass: 'read_only',
    source: 'telegram',
    reason: 'Read Spark status from Telegram.',
    requestId: 'turn:read-only',
    actorIdRef: 'telegram-human'
  });
  const readOnlyDecision = createHarnessCoreAuthorizedGovernorDecision({
    envelope,
    tool_name: 'spark.status'
  });
  const readAction = readOnlyDecision.envelope.proposed_actions[0];
  assert.equal(readOnlyDecision.outcome, 'read_only');
  assert.equal(governorOutcomeAllowsTelegramAction(readOnlyDecision, readAction, 'spark.status'), true);
  assert.equal(
    governorOutcomeAllowsTelegramAction(
      readOnlyDecision,
      {
        ...readAction,
        action_type: 'write_memory'
      },
      'spark.status'
    ),
    false
  );
});

test('allows explicit no-edit Spawner missions while preserving the file-edit constraint', () => {
  const text = 'Run a tiny mission through Spawner that only replies: SPARK_TURNINTENT_QA_OK_6. Do not edit files.';
  const envelope = envelopeFor(text);
  const result = authorizeTelegramActionFromEnvelope(envelope, {
    route: 'spawner.build',
    text,
    toolName: 'spawner.run',
    ownerSystem: 'spawner-ui',
    mutationClass: 'launches_mission'
  });

  assert.equal(result.allow, true);
  assert.equal(result.routeVerdict.reason, 'explicit_spawner_no_edit_mission');
  assert.equal(result.toolAuthorization.verdict, 'allowed');
  assert.equal(envelope.directive.noExecution, false);
  assert.equal(envelope.executionPolicy.canLaunchMission, true);
  assert.equal(envelope.executionPolicy.canMutateFiles, false);

  const probeText = 'Run a tiny no-edit Spawner probe that only replies SPARK_TURNINTENT_QA_067_OK. Do not edit files.';
  const probeEnvelope = envelopeFor(probeText);
  const probeResult = authorizeTelegramActionFromEnvelope(probeEnvelope, {
    route: 'spawner.build',
    text: probeText,
    toolName: 'spawner.run',
    ownerSystem: 'spawner-ui',
    mutationClass: 'launches_mission'
  });
  assert.equal(probeResult.allow, true);
  assert.equal(probeResult.routeVerdict.reason, 'explicit_spawner_no_edit_mission');
  assert.equal(probeEnvelope.directive.noExecution, false);
  assert.equal(probeEnvelope.executionPolicy.canLaunchMission, true);
  assert.equal(probeEnvelope.executionPolicy.canMutateFiles, false);

  const fileEditResult = authorizeTelegramActionFromEnvelope(envelope, {
    route: 'spawner.build',
    text,
    toolName: 'spawner.files',
    ownerSystem: 'spawner-ui',
    mutationClass: 'writes_files'
  });
  assert.equal(fileEditResult.allow, false);
  assert.ok(fileEditResult.reasonCodes.includes('tool_not_allowed_by_policy'));
  assert.ok(fileEditResult.reasonCodes.includes('mutation_class_not_authorized'));
});

test('allows explicit no-edit Mission Control diagnostics through Spawner', () => {
  const text = 'Run a deliberately slow no-edit Mission Control diagnostic through Spawner. It should only prove live running-state UI and reply with SPARK_E2E_SLOW_NO_EDIT_OK after waiting about 30 seconds. Do not create files, do not edit files, and share Canvas/Kanban/View Execution if it starts.';
  const envelope = envelopeFor(text);
  const result = authorizeTelegramActionFromEnvelope(envelope, {
    route: 'spawner.build',
    text,
    toolName: 'spawner.run',
    ownerSystem: 'spawner-ui',
    mutationClass: 'launches_mission'
  });

  assert.equal(result.allow, true);
  assert.equal(result.routeVerdict.reason, 'explicit_spawner_no_edit_mission');
  assert.equal(result.toolAuthorization.verdict, 'allowed');
  assert.equal(envelope.directive.noExecution, false);
  assert.equal(envelope.executionPolicy.canLaunchMission, true);
  assert.equal(envelope.executionPolicy.canMutateFiles, false);
});

test('lets benchmark-pack creation own stale score wording', () => {
  const text = 'create a level 10 benchmark pack for Spark QA Operator that tests stale scores, wrong Workspace evidence, route drift, natural-language context hijack, no-op loops, and private review boundary mistakes';
  const envelope = envelopeFor(text);
  const result = authorizeTelegramActionFromEnvelope(envelope, {
    route: 'creator.mission',
    text,
    toolName: 'domain_chip.create',
    ownerSystem: 'domain-chip',
    mutationClass: 'creates_chip'
  });

  assert.equal(envelope.selectedIntent.ownerSystem, 'domain-chip');
  assert.equal(result.allow, true);
  assert.equal(result.routeVerdict.reason, 'explicit_creator_artifact');
  assert.equal(result.toolAuthorization.verdict, 'allowed');
});

test('allows explicit external research with network policy', () => {
  const text = 'Research the latest public docs and GitHub repos about agent harness routing.';
  const result = authorizeTelegramActionFromEnvelope(envelopeFor(text), {
    route: 'spawner.external_research',
    text,
    toolName: 'external.fetch',
    ownerSystem: 'spark-intelligence-builder',
    mutationClass: 'external_network',
    externalNetwork: true
  });

  assert.equal(result.allow, true);
  assert.equal(result.toolAuthorization.verdict, 'allowed');
});

test('allows explicit provider runs through provider policy', () => {
  const text = 'ask codex to review this launch plan';
  const result = authorizeTelegramActionFromEnvelope(envelopeFor(text), {
    route: 'natural_run',
    text,
    toolName: 'provider.run',
    ownerSystem: 'spawner-ui',
    mutationClass: 'external_network',
    externalNetwork: true
  });

  assert.equal(result.allow, true);
  assert.equal(result.toolAuthorization.verdict, 'allowed');
});

test('blocks provider runs without an explicit provider-run envelope policy', () => {
  const text = 'I am talking about the word Codex here, not asking a provider to run.';
  const result = authorizeTelegramActionFromEnvelope(envelopeFor(text), {
    route: 'natural_run',
    text,
    toolName: 'provider.run',
    ownerSystem: 'spark-telegram-bot',
    mutationClass: 'external_network',
    externalNetwork: true
  });

  assert.equal(result.allow, false);
  assert.ok(
    result.reasonCodes.includes('no_execution_boundary') ||
    result.reasonCodes.includes('tool_denied_by_policy') ||
    result.reasonCodes.includes('mutation_class_not_authorized')
  );
});
