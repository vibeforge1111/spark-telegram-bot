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
import { decideNaturalRoute } from '../src/naturalRouteDecision';

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

function envelopeForDecision(text: string, decision: ReturnType<typeof classifyTelegramIntentV2>) {
  return buildTelegramTurnIntentEnvelope({
    text,
    decision,
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
  assert.equal(result.routeVerdict.reason, 'route_not_selected_by_turn_envelope');
  assert.equal(result.toolAuthorization.verdict, 'blocked');
  assert.ok(result.reasonCodes.includes('route_not_selected_by_turn_envelope'));
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
  assert.equal(result.consumerVerification?.schema_version, 'governor-consumer-verification-v1');
  assert.equal(result.consumerVerification?.allowed, true);
  assert.equal(result.consumerVerification?.decision_id, result.governorDecision?.decision_id);
  assert.equal(result.consumerVerification?.ledger_id, result.harnessCoreLedger?.ledger_id);
  assert.equal(result.consumerVerification?.tool_name, 'spawner.run');
});

test('fresh envelope selection is required before mutating route evidence can authorize', () => {
  const staleEnvelopeText = 'Build a private local-first dashboard for memory reports with stale context and source labels.';
  const freshText = 'Iterate on the current project by tightening the stale-context labels and report layout.';
  const result = authorizeTelegramActionFromEnvelope(envelopeFor(staleEnvelopeText), {
    route: 'spawner.project_iteration',
    text: freshText,
    toolName: 'spawner.run',
    ownerSystem: 'spawner-ui',
    mutationClass: 'launches_mission'
  });

  assert.equal(result.routeVerdict.allow, false);
  assert.equal(result.routeVerdict.reason, 'route_not_selected_by_turn_envelope');
  assert.equal(result.routeVerdict.confidence, 'blocked');
  assert.equal(result.toolAuthorization.verdict, 'blocked');
  assert.equal(result.allow, false);
  assert.ok(result.reasonCodes.includes('route_not_selected_by_turn_envelope'));
  assert.notEqual(result.governorDecision?.outcome, 'execute');
  assert.equal(result.consumerVerification?.allowed, false);
  assert.ok(result.reasonCodes.includes('governor:governor_outcome_deny'));
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
  assert.equal(result.routeVerdict.reason, 'envelope_selected_route');
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
  assert.equal(probeResult.routeVerdict.reason, 'envelope_selected_route');
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
  assert.equal(result.routeVerdict.reason, 'envelope_selected_route');
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
    toolName: 'creator.mission.create',
    ownerSystem: 'spawner-ui',
    mutationClass: 'creates_chip'
  });

  assert.equal(envelope.selectedIntent.ownerSystem, 'spawner-ui');
  assert.equal(result.allow, true);
  assert.equal(result.routeVerdict.reason, 'envelope_selected_route');
  assert.equal(result.toolAuthorization.verdict, 'allowed');
});

test('contextual creator-loop chip follow-up must be selected by the turn envelope', () => {
  const text = 'create or update the domain chip';
  const naturalRoute = decideNaturalRoute(text, {
    recentMessages: [
      'We are shaping a Startup YC specialization path with domain chip, benchmark pack, autoloop, and shareable insight packet.'
    ]
  });
  const decision = classifyTelegramIntentV2(text, { naturalRouteDecision: naturalRoute });
  const envelope = envelopeForDecision(text, decision);
  const result = authorizeTelegramActionFromEnvelope(envelope, {
    route: 'creator.mission',
    text,
    toolName: 'creator.mission.create',
    ownerSystem: 'spawner-ui',
    mutationClass: 'creates_chip'
  });

  assert.equal(naturalRoute.route, 'creator.mission');
  assert.equal(decision.route, 'creator.mission');
  assert.equal(envelope.selectedIntent.ownerSystem, 'spawner-ui');
  assert.equal(result.allow, true);
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

test('allows stale-context authority questions only as answer boundaries', () => {
  const text = 'Memory from last week says Telegram was broken. Is that enough to restart it?';
  const envelope = envelopeFor(text);
  const answer = authorizeTelegramActionFromEnvelope(envelope, {
    route: 'conversation.stale_context_authority_boundary',
    text,
    toolName: 'answer.compose',
    ownerSystem: 'spark-telegram-bot',
    mutationClass: 'none'
  });
  assert.equal(envelope.selectedIntent.action, 'plain_chat.stale_context_authority_boundary');
  assert.equal(envelope.directive.noExecution, true);
  assert.equal(answer.allow, true);
  assert.equal(answer.toolAuthorization.verdict, 'allowed');

  const restart = authorizeTelegramActionFromEnvelope(envelope, {
    route: 'operator.safe_action',
    text,
    toolName: 'operator.safe_action',
    ownerSystem: 'spark-telegram-bot',
    mutationClass: 'writes_files'
  });
  assert.equal(restart.allow, false);
  assert.ok(restart.reasonCodes.includes('route_not_selected_by_turn_envelope'));
  assert.ok(restart.reasonCodes.includes('no_execution_boundary'));
});

test('route history cannot authorize Builder continuation from the fresh turn', () => {
  const text = 'If route history says Builder was active, can that continue a build now?';
  const result = authorizeTelegramActionFromEnvelope(envelopeFor(text), {
    route: 'spawner.build',
    text,
    toolName: 'spawner.run',
    ownerSystem: 'spawner-ui',
    mutationClass: 'launches_mission'
  });

  assert.equal(result.allow, false);
  assert.ok(result.reasonCodes.includes('route_not_selected_by_turn_envelope'));
  assert.ok(result.reasonCodes.includes('no_execution_boundary'));
});

test('prior mission id cannot control mission actions without explicit resume intent', () => {
  const text = 'A prior mission id is in context. Should it control this turn?';
  const result = authorizeTelegramActionFromEnvelope(envelopeFor(text), {
    route: 'spawner.mission_control',
    text,
    toolName: 'spawner.mission_control',
    ownerSystem: 'spawner-ui',
    mutationClass: 'launches_mission'
  });

  assert.equal(result.allow, false);
  assert.ok(result.reasonCodes.includes('route_not_selected_by_turn_envelope'));
  assert.ok(result.reasonCodes.includes('no_execution_boundary'));
});

test('fresh not-now negation blocks pending publish state from authorizing publish', () => {
  const text = 'If pending state says "publish", but I say "not now", what wins?';
  const result = authorizeTelegramActionFromEnvelope(envelopeFor(text), {
    route: 'natural_run',
    text,
    toolName: 'publish.run',
    ownerSystem: 'spark-telegram-bot',
    mutationClass: 'publishes',
    publishes: true
  });

  assert.equal(result.allow, false);
  assert.ok(result.reasonCodes.includes('no_execution_boundary'));
  assert.ok(
    result.reasonCodes.includes('tool_not_allowed_by_policy') ||
    result.reasonCodes.includes('mutation_class_not_authorized')
  );
});

test('old chip memory cannot authorize domain chip creation today', () => {
  const text = 'If memory says I wanted a chip yesterday, should you make one today?';
  const result = authorizeTelegramActionFromEnvelope(envelopeFor(text), {
    route: 'domain_chip.create',
    text,
    toolName: 'domain_chip.create',
    ownerSystem: 'domain-chip',
    mutationClass: 'creates_chip'
  });

  assert.equal(result.allow, false);
  assert.ok(result.reasonCodes.includes('route_not_selected_by_turn_envelope'));
  assert.ok(result.reasonCodes.includes('no_execution_boundary'));
});
