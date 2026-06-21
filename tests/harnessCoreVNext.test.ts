import assert from 'node:assert/strict';
import { buildTelegramTurnIntentEnvelope, type ToolAuthorizationResult } from '../src/harnessContract';
import {
  authorizeHarnessCoreTelegramAction,
  buildHarnessCoreAction,
  buildTurnIntentEnvelopeVNextFromTelegram,
  recordHarnessCoreToolLedger,
  type HarnessCoreActionInput
} from '../src/harnessCoreVNext';
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

function envelopeFor(text: string) {
  return buildTelegramTurnIntentEnvelope({
    text,
    decision: classifyTelegramIntentV2(text),
    userRef: 'user:qa',
    chatRef: 'chat:qa',
    accessProfile: 'admin',
    conversationKind: 'dm',
    turnId: 'turn:harness-core-vnext',
    traceId: 'trace:harness-core-vnext'
  });
}

function readOnlyStateEnvelopeFor(text: string) {
  const base = classifyTelegramIntentV2(text);
  return buildTelegramTurnIntentEnvelope({
    text,
    decision: {
      ...base,
      kind: 'runtime_truth_or_operator',
      route: 'spark.read_only_state',
      owner_system: 'spark-telegram-bot',
      action: 'spark.read_only_state.risk_profile',
      confidence: 'explicit',
      payload: { ...base.payload, question: 'risk_profile' },
      matched_signals: [...base.matched_signals, 'spark_risk_profile_read'],
      supporting_routes: ['spark.read_only_state']
    },
    userRef: 'user:qa',
    chatRef: 'chat:qa',
    accessProfile: 'admin',
    conversationKind: 'dm',
    turnId: 'turn:harness-core-vnext-read-only',
    traceId: 'trace:harness-core-vnext-read-only'
  });
}

const allowedLegacy: ToolAuthorizationResult = { verdict: 'allowed', reasonCodes: [] };

test('stamps raw Telegram update ids as route-scoped Harness Core turn ids', () => {
  const text = 'What did I say I should focus on next?';
  const legacyEnvelope = buildTelegramTurnIntentEnvelope({
    text,
    decision: classifyTelegramIntentV2(text),
    userRef: 'user:qa',
    chatRef: 'chat:qa',
    accessProfile: 'admin',
    conversationKind: 'dm',
    turnId: 'telegram-update:452998900',
    traceId: 'trace:telegram-update:452998900'
  });
  const action: HarnessCoreActionInput = {
    route: 'memory.recall',
    text,
    toolName: 'memory.read',
    ownerSystem: 'domain-chip-memory',
    mutationClass: 'read_only'
  };

  const vnext = buildTurnIntentEnvelopeVNextFromTelegram(legacyEnvelope, action, true);
  const expectedTurnId = 'turn:telegram:memory.recall:telegram-update:452998900';
  assert.equal(vnext.turn_id, expectedTurnId);
  assert.equal(vnext.proposed_actions[0]?.action_id.startsWith(`action:${expectedTurnId}`), true);

  const ledger = recordHarnessCoreToolLedger({
    envelope: vnext,
    action: vnext.proposed_actions[0]!,
    authorization: authorizeHarnessCoreTelegramAction(legacyEnvelope, action, allowedLegacy, true).authorization,
    toolName: 'memory.read',
    status: 'success',
    summary: 'Memory read completed for the route-scoped turn.'
  });
  assert.equal(ledger.turn_id, expectedTurnId);
});

test('preserves already route-scoped Telegram Harness Core turn ids', () => {
  const text = 'Read the current memory state for this project.';
  const canonicalTurnId = 'turn:telegram:memory.recall:telegram-update:452998901';
  const legacyEnvelope = buildTelegramTurnIntentEnvelope({
    text,
    decision: classifyTelegramIntentV2(text),
    userRef: 'user:qa',
    chatRef: 'chat:qa',
    accessProfile: 'admin',
    conversationKind: 'dm',
    turnId: canonicalTurnId,
    traceId: 'trace:telegram-update:452998901'
  });
  const action: HarnessCoreActionInput = {
    route: 'memory.recall',
    text,
    toolName: 'memory.read',
    ownerSystem: 'domain-chip-memory',
    mutationClass: 'read_only'
  };

  const vnext = buildTurnIntentEnvelopeVNextFromTelegram(legacyEnvelope, action, true);
  const proposedAction = buildHarnessCoreAction(action, canonicalTurnId);

  assert.equal(vnext.turn_id, canonicalTurnId);
  assert.equal(proposedAction.action_id.startsWith(`action:${canonicalTurnId}`), true);
  assert.doesNotMatch(vnext.turn_id, /turn:telegram:memory\.recall:turn:telegram/);
});

test('converts meta action-word turns into chat-only Harness Core envelopes', () => {
  const text = 'I am mentioning build, publish, deploy, schedule, chip, and memory as trigger examples. Do not run anything.';
  const legacyEnvelope = envelopeFor(text);
  const vnext = buildTurnIntentEnvelopeVNextFromTelegram(legacyEnvelope);

  assert.equal(vnext.schema_version, 'turn-intent-envelope-vnext');
  assert.equal(vnext.selected_move, 'chat_explain');
  assert.equal(vnext.action_authority.state, 'chat_only');
  assert.equal(vnext.proposed_actions.length, 0);
  assert.equal(vnext.freshness.fresh_user_intent_ref?.kind, 'fresh_user_intent');
  assert.equal(vnext.freshness.fresh_user_intent_ref?.source, 'spark-telegram-bot');
  assert.equal(vnext.freshness.stale_state_used_as_authority, false);
  assert.equal(vnext.freshness.memory_used_as_instruction, false);
  assert.ok(vnext.evidence.some((item) => item.id === vnext.freshness.fresh_user_intent_ref?.id));
  assert.ok(vnext.evidence.some((item) => item.kind === 'fresh_user_intent'));
  assert.ok(vnext.evidence.some((item) => item.kind === 'negative_intent'));
});

test('converts product planning turns into chat_plan Harness Core envelopes', () => {
  const text = 'HC-02 installer proof turn 1: I am sketching a memory quality dashboard with stale-context labels.';
  const legacyEnvelope = envelopeFor(text);
  const vnext = buildTurnIntentEnvelopeVNextFromTelegram(legacyEnvelope);

  assert.equal(legacyEnvelope.selectedIntent.action, 'plain_chat.plan');
  assert.equal(vnext.selected_move, 'chat_plan');
  assert.equal(vnext.action_authority.state, 'chat_only');
  assert.equal(vnext.proposed_actions.length, 0);
});

test('converts domain-chip option proposals into chat_plan Harness Core envelopes', () => {
  const text = 'HC-09 installer proof: We are comparing domain-chip options for startup pricing objections; what proposal should we discuss first?';
  const legacyEnvelope = envelopeFor(text);
  const vnext = buildTurnIntentEnvelopeVNextFromTelegram(legacyEnvelope);

  assert.equal(legacyEnvelope.selectedIntent.action, 'plain_chat.plan');
  assert.equal(vnext.selected_move, 'chat_plan');
  assert.equal(vnext.action_authority.state, 'chat_only');
  assert.equal(vnext.proposed_actions.length, 0);
});

test('Telegram action authority now requires Harness Core allow verdict', () => {
  const text = 'Build a private local-first dashboard for memory reports with stale context labels.';
  const result = authorizeTelegramActionFromEnvelope(envelopeFor(text), {
    route: 'spawner.build',
    text,
    toolName: 'spawner.run',
    ownerSystem: 'spawner-ui',
    mutationClass: 'launches_mission'
  });

  assert.equal(result.allow, true);
  assert.ok(result.harnessCore);
  assert.equal(result.harnessCore?.envelope.schema_version, 'turn-intent-envelope-vnext');
  assert.equal(result.harnessCore?.envelope.selected_move, 'execute_action');
  assert.equal(result.harnessCore?.envelope.action_authority.state, 'executable');
  assert.match(result.harnessCore?.envelope.action_authority.reason || '', /Governor consumer verification/);
  assert.doesNotMatch(result.harnessCore?.envelope.action_authority.reason || '', /legacy route evidence authorize/i);
  assert.equal(result.harnessCore?.action.action_type, 'launch_mission');
  assert.equal(result.harnessCore?.authorization.schema_version, 'authorization-decision-v1');
  assert.equal(typeof result.harnessCore?.authorization.wire_contract_version, 'number');
  assert.ok((result.harnessCore?.authorization.wire_contract_version || 0) >= 1);
  assert.equal(result.harnessCore?.authorization.verdict, 'allow');
  assert.equal(result.governorDecision?.schema_version, 'governor-decision-v1');
  assert.equal(result.governorDecision?.outcome, 'execute');
  assert.equal(result.governorDecision?.execution_boundary.action_authorized, true);
  assert.equal(result.governorDecision?.execution_boundary.legacy_authority_demoted, true);
});

test('latest-message mutation routes keep fresh-turn provenance', () => {
  const text = 'Build a pocket checklist for launch QA with one save button.';
  const result = authorizeTelegramActionFromEnvelope(envelopeFor(text), {
    route: 'spawner.build',
    text,
    toolName: 'spawner.run',
    ownerSystem: 'spawner-ui',
    mutationClass: 'launches_mission'
  });

  assert.equal(result.allow, true);
  assert.equal(result.harnessCore?.envelope.selected_move, 'execute_action');
  assert.equal(result.harnessCore?.envelope.freshness.fresh_user_intent_present, true);
  assert.equal(result.harnessCore?.envelope.action_authority.state, 'executable');
  assert.ok(result.harnessCore?.envelope.evidence.some((item) => item.summary.includes('latest_message/fresh_turn')));
});

test('contextual mutation referents are demoted before Harness Core action authority', () => {
  const text = 'yes, rerun it with the same settings';
  const naturalRouteDecision = {
    schema_version: 'spark.nlp.route_decision.v1' as const,
    route: 'spawner.mission_control',
    owner_system: 'spawner-ui' as const,
    confidence: 'contextual' as const,
    action: 'spawner.mission_rerun_request',
    payload: { missionId: 'mission-1781566950658', source: 'recent_mission_status' },
    context_source: 'hot_recent_turns' as const,
    matched_signals: ['mission_rerun_request', 'recent_mission_status'],
    blocked_by: [],
    requires_confirmation: true
  };
  const legacyEnvelope = buildTelegramTurnIntentEnvelope({
    text,
    decision: classifyTelegramIntentV2(text, { naturalRouteDecision }),
    userRef: 'user:qa',
    chatRef: 'chat:qa',
    accessProfile: 'admin',
    conversationKind: 'dm',
    turnId: 'turn:harness-core-contextual-rerun',
    traceId: 'trace:harness-core-contextual-rerun'
  });
  const vnext = buildTurnIntentEnvelopeVNextFromTelegram(legacyEnvelope, {
    route: 'spawner.mission_control',
    text,
    toolName: 'spawner.run',
    ownerSystem: 'spawner-ui',
    mutationClass: 'launches_mission'
  }, true);

  assert.equal(legacyEnvelope.selectedIntent.contextSource, 'hot_recent_turns');
  assert.equal(legacyEnvelope.selectedIntent.mutationReferent, 'contextual_reference');
  assert.equal(vnext.selected_move, 'chat_explain');
  assert.equal(vnext.action_authority.state, 'chat_only');
  assert.equal(vnext.proposed_actions.length, 0);
  assert.equal(vnext.freshness.stale_state_used_as_authority, true);
  assert.equal(vnext.freshness.memory_used_as_instruction, false);
  assert.equal(vnext.freshness.pending_state_used_as_authority, false);
  assert.ok(vnext.blocked_routes.some((route) => route.reason.includes('hot_recent_turns is context evidence')));
  assert.ok(vnext.blocked_routes.some((route) => route.evidence?.kind === 'policy'));
});

test('cold memory mutation referents stay data and mark memory-as-instruction', () => {
  const text = 'old memory says save the project note again';
  const naturalRouteDecision = {
    schema_version: 'spark.nlp.route_decision.v1' as const,
    route: 'memory.write',
    owner_system: 'domain-chip-memory' as const,
    confidence: 'contextual' as const,
    action: 'memory.write',
    payload: { source: 'cold_memory' },
    context_source: 'cold_memory' as const,
    matched_signals: ['memory_reference'],
    blocked_by: [],
    requires_confirmation: false
  };
  const legacyEnvelope = buildTelegramTurnIntentEnvelope({
    text,
    decision: classifyTelegramIntentV2(text, { naturalRouteDecision }),
    userRef: 'user:qa',
    chatRef: 'chat:qa',
    accessProfile: 'admin',
    conversationKind: 'dm',
    turnId: 'turn:harness-core-cold-memory-write',
    traceId: 'trace:harness-core-cold-memory-write'
  });
  const vnext = buildTurnIntentEnvelopeVNextFromTelegram(legacyEnvelope, {
    route: 'memory.write',
    text,
    toolName: 'memory.write',
    ownerSystem: 'domain-chip-memory',
    mutationClass: 'writes_memory'
  }, true);

  assert.equal(legacyEnvelope.selectedIntent.contextSource, 'cold_memory');
  assert.equal(legacyEnvelope.selectedIntent.mutationReferent, 'memory_reference');
  assert.equal(vnext.selected_move, 'chat_explain');
  assert.equal(vnext.proposed_actions.length, 0);
  assert.equal(vnext.freshness.stale_state_used_as_authority, true);
  assert.equal(vnext.freshness.memory_used_as_instruction, true);
  assert.equal(vnext.freshness.pending_state_used_as_authority, false);
});

test('pending state mutation referents stay data and mark pending authority', () => {
  const text = 'yes, continue it';
  const naturalRouteDecision = {
    schema_version: 'spark.nlp.route_decision.v1' as const,
    route: 'spawner.build',
    owner_system: 'spawner-ui' as const,
    confidence: 'contextual' as const,
    action: 'spawner.build',
    payload: { source: 'pending_state' },
    context_source: 'pending_state' as const,
    matched_signals: ['pending_state'],
    blocked_by: [],
    requires_confirmation: false
  };
  const legacyEnvelope = buildTelegramTurnIntentEnvelope({
    text,
    decision: classifyTelegramIntentV2(text, { naturalRouteDecision }),
    userRef: 'user:qa',
    chatRef: 'chat:qa',
    accessProfile: 'admin',
    conversationKind: 'dm',
    turnId: 'turn:harness-core-pending-build',
    traceId: 'trace:harness-core-pending-build'
  });
  const vnext = buildTurnIntentEnvelopeVNextFromTelegram(legacyEnvelope, {
    route: 'spawner.build',
    text,
    toolName: 'spawner.run',
    ownerSystem: 'spawner-ui',
    mutationClass: 'launches_mission'
  }, true);

  assert.equal(legacyEnvelope.selectedIntent.contextSource, 'pending_state');
  assert.equal(legacyEnvelope.selectedIntent.mutationReferent, 'pending_state');
  assert.equal(vnext.selected_move, 'chat_explain');
  assert.equal(vnext.proposed_actions.length, 0);
  assert.equal(vnext.freshness.stale_state_used_as_authority, true);
  assert.equal(vnext.freshness.memory_used_as_instruction, false);
  assert.equal(vnext.freshness.pending_state_used_as_authority, true);
});

test('Harness Core interrupts high-risk publish even when legacy evidence would allow', () => {
  const legacyEnvelope = envelopeFor('Publish the reviewed local package after approval.');
  const action: HarnessCoreActionInput = {
    route: 'release.publish',
    text: legacyEnvelope.text.raw,
    toolName: 'publish.run',
    ownerSystem: 'spawner-ui',
    mutationClass: 'publishes',
    publishes: true
  };

  const bundle = authorizeHarnessCoreTelegramAction(legacyEnvelope, action, allowedLegacy, true);

  assert.equal(bundle.envelope.selected_move, 'confirm_action');
  assert.equal(bundle.envelope.action_authority.state, 'confirmation_required');
  assert.equal(bundle.action.risk_tier, 'high');
  assert.equal(bundle.authorization.verdict, 'interrupt');
  assert.equal(typeof bundle.authorization.wire_contract_version, 'number');
  assert.equal(bundle.authorization.approval.required, true);
  assert.ok(bundle.authorization.reasons.includes('authority_state_confirmation_required'));

  assert.throws(
    () => recordHarnessCoreToolLedger({
      envelope: bundle.envelope,
      action: bundle.action,
      authorization: bundle.authorization,
      toolName: 'publish.run',
      status: 'success',
      summary: 'This must not be representable before explicit approval.'
    }),
    /allow authorization/
  );

  const ledger = recordHarnessCoreToolLedger({
    envelope: bundle.envelope,
    action: bundle.action,
    authorization: bundle.authorization,
    toolName: 'publish.run',
    status: 'not_started',
    summary: 'Publish was interrupted before execution.'
  });
  assert.equal(ledger.result.status, 'not_started');
  assert.ok(ledger.lifecycle.some((stage) => stage.stage === 'authorize' && stage.verdict === 'pending'));
  assert.ok(ledger.lifecycle.some((stage) => stage.stage === 'execute' && stage.verdict === 'skipped'));
});

test('Telegram action authority returns non-executing Governor outcome for meta action words', () => {
  const text = 'I am mentioning build and mission as examples only; do not run anything.';
  const result = authorizeTelegramActionFromEnvelope(envelopeFor(text), {
    route: 'spawner.build',
    text,
    toolName: 'spawner.run',
    ownerSystem: 'spawner-ui',
    mutationClass: 'launches_mission'
  });

  assert.equal(result.allow, false);
  assert.equal(result.governorDecision?.schema_version, 'governor-decision-v1');
  assert.notEqual(result.governorDecision?.outcome, 'execute');
  assert.equal(result.governorDecision?.execution_boundary.action_authorized, false);
  assert.equal(result.governorDecision?.reply_contract.should_interrupt, false);
});

test('no-execution constraints still allow selected read-only current-state checks', () => {
  const text = 'I am mentioning build and mission, but do not start anything. What is the current Spark risk profile?';
  const result = authorizeTelegramActionFromEnvelope(readOnlyStateEnvelopeFor(text), {
    route: 'spark.read_only_state',
    text,
    toolName: 'spark.read_only_state',
    ownerSystem: 'spark-telegram-bot',
    mutationClass: 'read_only'
  });

  assert.equal(result.allow, true);
  assert.equal(result.harnessCore?.envelope.selected_move, 'read_current_state');
  assert.equal(result.harnessCore?.envelope.action_authority.state, 'read_only');
  assert.equal(result.harnessCore?.authorization.verdict, 'allow');
  assert.equal(result.governorDecision?.outcome, 'read_only');
});

test('Telegram action authority blocks unselected contextual execution routes', () => {
  const text = 'Build a private local-first dashboard for memory reports with stale context labels.';
  const result = authorizeTelegramActionFromEnvelope(envelopeFor(text), {
    route: 'spawner.contextual_mission',
    text,
    toolName: 'spawner.run',
    ownerSystem: 'spawner-ui',
    mutationClass: 'launches_mission'
  });

  assert.equal(result.allow, false);
  assert.ok(result.reasonCodes.includes('route_not_selected_by_turn_envelope'));
  assert.notEqual(result.governorDecision?.outcome, 'execute');
  assert.equal(result.governorDecision?.execution_boundary.action_authorized, false);
});

test('records Harness Core tool ledger for authorized execution', () => {
  const text = 'Build a tiny static launch checklist app with one save button and responsive layout.';
  const result = authorizeTelegramActionFromEnvelope(envelopeFor(text), {
    route: 'spawner.build',
    text,
    toolName: 'spawner.run',
    ownerSystem: 'spawner-ui',
    mutationClass: 'launches_mission'
  });

  assert.equal(result.allow, true);
  assert.ok(result.harnessCore);
  const ledger = recordHarnessCoreToolLedger({
    envelope: result.harnessCore!.envelope,
    action: result.harnessCore!.action,
    authorization: result.harnessCore!.authorization,
    toolName: 'spawner.run',
    status: 'success',
    summary: 'Spawner accepted the authorized mission dispatch.'
  });

  assert.equal(ledger.schema_version, 'tool-call-ledger-v1');
  assert.equal(typeof ledger.wire_contract_version, 'number');
  assert.equal(ledger.authorization.wire_contract_version, ledger.wire_contract_version);
  assert.equal(ledger.turn_id, result.harnessCore?.envelope.turn_id);
  assert.equal(ledger.authorization.verdict, 'allow');
  assert.equal(ledger.result.status, 'success');
  assert.ok(ledger.lifecycle.some((stage) => stage.stage === 'authorize' && stage.verdict === 'passed'));
  assert.equal(result.governorDecision?.tool_ledgers[0].schema_version, 'tool-call-ledger-v1');
  assert.equal(
    result.governorDecision?.tool_ledgers[0].wire_contract_version,
    result.governorDecision?.authorizations[0].wire_contract_version
  );
});
