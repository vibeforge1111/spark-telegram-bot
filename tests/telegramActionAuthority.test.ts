import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import {
  createHarnessCoreActionEnvelopeVNext,
  createHarnessCoreAuthorizedGovernorDecision
} from '@spark/harness-core';
import { buildTelegramTurnIntentEnvelope } from '../src/harnessContract';
import {
  authorizeTelegramActionFromEnvelope,
  governorOutcomeAllowsTelegramAction
} from '../src/telegramActionAuthority';
import {
  governorDecisionSignaturePayload,
  type GovernorDecisionSignatureV1
} from '../src/governorSignature';
import {
  classifyTelegramIntentV2,
  isTelegramIntentGateV2SafeRoute,
  shouldEnforceTelegramIntentGateV2
} from '../src/telegramIntentGate';
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

function envelopeForNaturalRoute(text: string) {
  const naturalRouteDecision = decideNaturalRoute(text);
  return envelopeForDecision(text, classifyTelegramIntentV2(text, { naturalRouteDecision }));
}

const shippedProject = {
  chatId: 'chat:qa',
  userId: 'user:qa',
  projectName: 'JS Sprint Picker',
  projectPath: 'C:/Users/USER/.spark/workspaces/mission-test-js-sprint-picker',
  previewUrl: 'http://127.0.0.1:3333/preview/js-sprint-picker/index.html',
  missionId: 'mission-test',
  iteration: 1,
  shippedAt: '2026-06-15T00:00:00.000Z',
  updatedAt: '2026-06-15T00:00:00.000Z'
};

const activeSpawnerArtifact = {
  projectName: 'Habit Button',
  requestId: 'tg-build-0ee3f3c61cc5-1781524520548',
  missionId: 'mission-1781524520548',
  status: 'running',
  buildMode: 'direct',
  buildLane: 'fast_direct',
  canvasUrl: 'http://127.0.0.1:3333/canvas?pipeline=prd-tg-build-0ee3f3c61cc5-1781524520548&mission=mission-1781524520548',
  boardUrl: 'http://127.0.0.1:3333/kanban?mission=mission-1781524520548',
  resultAvailable: false
};

function envelopeForShippedProjectTurn(text: string) {
  const naturalRouteDecision = decideNaturalRoute(text, { shippedProject });
  return envelopeForDecision(text, classifyTelegramIntentV2(text, { naturalRouteDecision, shippedProject }));
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

test('blocks action words when the fresh turn is meta or no-execution', () => {
  const texts = [
    'I am mentioning build and mission, but do not start anything. Just explain the risk.',
    'We are discussing build vs chat as a product rule, not asking you to build.',
    'This is a routing review, not a build request; why did the build route trigger?'
  ];

  for (const text of texts) {
    const result = authorizeTelegramActionFromEnvelope(envelopeFor(text), {
      route: 'spawner.build',
      text,
      toolName: 'spawner.run',
      ownerSystem: 'spawner-ui',
      mutationClass: 'launches_mission'
    });

    assert.equal(result.allow, false, text);
    assert.equal(result.routeVerdict.allow, false, text);
    assert.equal(result.routeVerdict.reason, 'route_not_selected_by_turn_envelope', text);
    assert.equal(result.toolAuthorization.verdict, 'blocked', text);
    assert.ok(result.reasonCodes.includes('route_not_selected_by_turn_envelope'), text);
    assert.ok(result.reasonCodes.includes('no_execution_boundary'), text);
  }
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

test('allows fresh shipped-project iteration to authorize the writable Spawner lane', () => {
  const text = "Yes, apply that button rename to the shipped JS Sprint Picker now. Update the existing project only; do not create a new app.";
  const envelope = envelopeForShippedProjectTurn(text);
  const result = authorizeTelegramActionFromEnvelope(envelope, {
    route: 'spawner.project_iteration',
    text,
    toolName: 'spawner.run',
    ownerSystem: 'spawner-ui',
    mutationClass: 'launches_mission'
  });

  assert.equal(envelope.candidates[0]?.route, 'project.iteration');
  assert.equal(envelope.executionPolicy.canLaunchMission, true);
  assert.equal(envelope.toolPolicy.allowedTools.includes('spawner.run'), true);
  assert.equal(result.routeVerdict.allow, true);
  assert.equal(result.toolAuthorization.verdict, 'allowed');
  assert.equal(result.allow, true);
  assert.equal(result.reasonCodes.includes('route_not_selected_by_turn_envelope'), false);
});

test('allows contextual shipped-project polish follow-through to authorize the writable Spawner lane', () => {
  const text = "Let's do that.";
  const recentMessages = [
    'Assistant: JS Sprint Picker is the current shipped app at C:/Users/USER/.spark/workspaces/mission-test-js-sprint-picker.',
    'Assistant: Polish next: tighten the empty states and mobile move flow, then add a reset for tonight action. Current preview: http://127.0.0.1:3333/preview/js-sprint-picker/index.html'
  ];
  const naturalRouteDecision = decideNaturalRoute(text, { shippedProject, recentMessages });
  const decision = classifyTelegramIntentV2(text, { naturalRouteDecision, shippedProject });
  const envelope = envelopeForDecision(text, decision);
  const result = authorizeTelegramActionFromEnvelope(envelope, {
    route: 'spawner.project_iteration',
    text,
    toolName: 'spawner.run',
    ownerSystem: 'spawner-ui',
    mutationClass: 'launches_mission'
  });

  assert.equal(naturalRouteDecision.route, 'project.iteration');
  assert.equal(decision.route, 'project.iteration');
  assert.equal(envelope.candidates[0]?.route, 'project.iteration');
  assert.equal(envelope.executionPolicy.canLaunchMission, true);
  assert.equal(envelope.toolPolicy.allowedTools.includes('spawner.run'), true);
  assert.equal(result.allow, true);
  assert.equal(result.routeVerdict.allow, true);
  assert.equal(result.toolAuthorization.verdict, 'allowed');
  assert.equal(result.reasonCodes.includes('route_not_selected_by_turn_envelope'), false);
});

test('blocks low-information follow-through from authorizing Spawner when recent advice targets another artifact', () => {
  const text = 'Nice, do that.';
  const goingProject = {
    ...shippedProject,
    projectName: 'Mission 1781524790278 Going',
    projectPath: 'C:/Users/USER/.spark/workspaces/mission-1781524790278-going',
    previewUrl: 'http://127.0.0.1:3333/preview/mission-1781524790278-going/dist/index.html',
    missionId: 'mission-1781524790278'
  };
  const recentMessages = [
    'Assistant: Mission 1781524790278 Going is ready. Current preview: http://127.0.0.1:3333/preview/mission-1781524790278-going/dist/index.html',
    'User: What would you polish next for Habit Button?',
    'Assistant: I would polish the Habit Button surface next by making the streak feedback clearer. Canvas: http://127.0.0.1:3333/canvas?pipeline=prd-tg-build-0ee3f3c61cc5-1781524520548'
  ];
  const naturalRouteDecision = decideNaturalRoute(text, {
    shippedProject: goingProject,
    spawnerArtifact: activeSpawnerArtifact,
    recentMessages
  });
  const decision = classifyTelegramIntentV2(text, { naturalRouteDecision, shippedProject: goingProject });
  const envelope = envelopeForDecision(text, decision);
  const result = authorizeTelegramActionFromEnvelope(envelope, {
    route: 'spawner.project_iteration',
    text,
    toolName: 'spawner.run',
    ownerSystem: 'spawner-ui',
    mutationClass: 'launches_mission'
  });

  assert.notEqual(naturalRouteDecision.route, 'project.iteration');
  assert.notEqual(naturalRouteDecision.route, 'spawner.build');
  assert.notEqual(decision.route, 'project.iteration');
  assert.equal(envelope.executionPolicy.canLaunchMission, false);
  assert.equal(envelope.toolPolicy.allowedTools.includes('spawner.run'), false);
  assert.equal(result.allow, false);
  assert.equal(result.routeVerdict.allow, false);
  assert.equal(result.reasonCodes.includes('route_not_selected_by_turn_envelope'), true);
});

test('blocks uncertain product exploration from authorizing a Spawner build', () => {
  const texts = [
    'I want to make something for planning my day.',
    'Can we make something for planning my day, or should we think more first?',
    "I keep losing track of my day and want to make something for that, but I'm not sure what shape it should take.",
    "My mornings keep slipping away and I want to make a little tool around that, but I haven't figured out what shape it should take."
  ];

  for (const text of texts) {
    const naturalRouteDecision = decideNaturalRoute(text, { shippedProject });
    const decision = classifyTelegramIntentV2(text, { naturalRouteDecision, shippedProject });
    const envelope = envelopeForDecision(text, decision);
    const result = authorizeTelegramActionFromEnvelope(envelope, {
      route: 'spawner.build',
      text,
      toolName: 'spawner.run',
      ownerSystem: 'spawner-ui',
      mutationClass: 'launches_mission'
    });

    assert.ok(['conversation.ideation', 'chat_plan'].includes(naturalRouteDecision.route));
    assert.notEqual(naturalRouteDecision.route, 'spawner.build');
    assert.notEqual(decision.route, 'spawner.build');
    assert.equal(envelope.executionPolicy.canLaunchMission, false);
    assert.equal(envelope.toolPolicy.allowedTools.includes('spawner.run'), false);
    assert.equal(result.allow, false);
    assert.equal(result.routeVerdict.allow, false);
    assert.equal(result.reasonCodes.includes('route_not_selected_by_turn_envelope'), true);
  }
});

test('blocks active build status questions from authorizing a new Spawner build', () => {
  const text = 'How is that Habit Button build going right now?';
  const naturalRouteDecision = decideNaturalRoute(text, {
    shippedProject,
    spawnerArtifact: activeSpawnerArtifact
  });
  const decision = classifyTelegramIntentV2(text, {
    naturalRouteDecision,
    shippedProject,
    spawnerArtifact: activeSpawnerArtifact
  });
  const envelope = envelopeForDecision(text, decision);
  const result = authorizeTelegramActionFromEnvelope(envelope, {
    route: 'spawner.build',
    text,
    toolName: 'spawner.run',
    ownerSystem: 'spawner-ui',
    mutationClass: 'launches_mission'
  });

  assert.equal(naturalRouteDecision.route, 'project.readout');
  assert.equal(decision.route, 'project.readout');
  assert.notEqual(decision.route, 'spawner.build');
  assert.equal(envelope.executionPolicy.canLaunchMission, false);
  assert.equal(envelope.toolPolicy.allowedTools.includes('spawner.run'), false);
  assert.equal(result.allow, false);
  assert.equal(result.routeVerdict.allow, false);
  assert.equal(result.reasonCodes.includes('route_not_selected_by_turn_envelope'), true);
});

test('allows static app build briefs that specify no build step', () => {
  const text = 'Build a quick vanilla JS page at ./spark-ap07-authority-proof-test: Files: index.html, app.js. No build step. Shows AP07 signed authority proof foreground.';
  const decision = classifyTelegramIntentV2(text, { naturalRouteDecision: decideNaturalRoute(text) });
  const envelope = envelopeForDecision(text, decision);
  const result = authorizeTelegramActionFromEnvelope(envelope, {
    route: 'spawner.build',
    text,
    toolName: 'spawner.run',
    ownerSystem: 'spawner-ui',
    mutationClass: 'launches_mission'
  });

  assert.equal(envelope.selectedIntent.action, 'spawner.build');
  assert.equal(envelope.directive.noExecution, false);
  assert.equal(envelope.executionPolicy.canLaunchMission, true);
  assert.equal(result.allow, true);
  assert.equal(result.routeVerdict.reason, 'envelope_selected_route');

  const stopText = 'No build or mission for now, just help me think through the plan.';
  const stopResult = authorizeTelegramActionFromEnvelope(envelopeFor(stopText), {
    route: 'spawner.build',
    text: stopText,
    toolName: 'spawner.run',
    ownerSystem: 'spawner-ui',
    mutationClass: 'launches_mission'
  });

  assert.equal(stopResult.allow, false);
  assert.ok(stopResult.reasonCodes.includes('no_execution_boundary'));
});

test('allows live Harness authority build prompt through Spawner instead of architecture chat', () => {
  const text = 'Build a practical Harness Release Ops Mission Board with Spawner. Make it a local web app that helps us tonight: authority gates, runtime health, Telegram proof, registry drift, rollback checklist, open blockers, and next QA queue. Include tests and a concise README. Build it now and use the current Harness authority path.';
  const envelope = envelopeForNaturalRoute(text);
  const result = authorizeTelegramActionFromEnvelope(envelope, {
    route: 'spawner.build',
    text,
    toolName: 'spawner.run',
    ownerSystem: 'spawner-ui',
    mutationClass: 'launches_mission'
  });

  assert.equal(envelope.selectedIntent.action, 'spawner.build');
  assert.equal(envelope.selectedIntent.ownerSystem, 'spawner-ui');
  assert.equal(result.allow, true);
  assert.equal(result.routeVerdict.allow, true);
  assert.equal(result.toolAuthorization.verdict, 'allowed');
  assert.equal(result.consumerVerification?.allowed, true);
  assert.equal(result.consumerVerification?.tool_name, 'spawner.run');
});

test('allows Telegram Spawner build prompt with scoped no-publish clause', () => {
  const text = 'Use direct build mode. Build a tiny static local-only Spawner Telegram QA card called Telegram Spawner Smoke 0615. Create index.html, styles.css, app.js, and README.md. The page should have a button that toggles proof details. Do not publish, deploy, call external services, delete files, or modify anything outside the Spawner project workspace. This is an explicit requested Spawner build.';
  const envelope = envelopeForNaturalRoute(text);
  const result = authorizeTelegramActionFromEnvelope(envelope, {
    route: 'spawner.build',
    text,
    toolName: 'spawner.run',
    ownerSystem: 'spawner-ui',
    mutationClass: 'launches_mission'
  });

  assert.equal(envelope.selectedIntent.action, 'spawner.build');
  assert.equal(envelope.selectedIntent.ownerSystem, 'spawner-ui');
  assert.equal(envelope.directive.noExecution, false);
  assert.equal(envelope.directive.noPublish, true);
  assert.equal(envelope.executionPolicy.canLaunchMission, true);
  assert.equal(envelope.executionPolicy.canPublish, false);
  assert.equal(result.allow, true);
  assert.equal(result.routeVerdict.allow, true);
  assert.equal(result.toolAuthorization.verdict, 'allowed');
  assert.equal(result.consumerVerification?.allowed, true);
  assert.equal(result.consumerVerification?.tool_name, 'spawner.run');
});

test('allows Telegram existing-project Spawner improvements with scoped no-publish clause', () => {
  const text = 'Improve the existing local Spawner project at C:\\Users\\USER\\.spark\\workspaces\\mission-1781509664295-telegram-spawner-star-catch-0615e. Keep it local-only. Add a difficulty selector with Easy, Normal, and Hard modes; add a high score saved in localStorage; add a visible combo streak indicator; and add simple on-screen left/right controls so the game works better in browser automation and on touch devices. Preserve the existing Star Catch game, README, and QA proof panel. Do not publish, deploy, call external services, delete files, or modify anything outside that project workspace. This is an explicit requested improvement to the existing Spawner build.';
  const envelope = envelopeForNaturalRoute(text);
  const result = authorizeTelegramActionFromEnvelope(envelope, {
    route: 'spawner.build',
    text,
    toolName: 'spawner.run',
    ownerSystem: 'spawner-ui',
    mutationClass: 'launches_mission'
  });

  assert.equal(envelope.selectedIntent.action, 'spawner.build');
  assert.equal(envelope.selectedIntent.ownerSystem, 'spawner-ui');
  assert.equal(envelope.directive.noExecution, false);
  assert.equal(envelope.directive.noPublish, true);
  assert.equal(envelope.executionPolicy.canLaunchMission, true);
  assert.equal(envelope.executionPolicy.canPublish, false);
  assert.equal(result.allow, true);
  assert.equal(result.routeVerdict.allow, true);
  assert.equal(result.toolAuthorization.verdict, 'allowed');
  assert.equal(result.consumerVerification?.allowed, true);
  assert.equal(result.consumerVerification?.tool_name, 'spawner.run');
});

test('allows concrete Spawner builds when chip and QA words are requirements, not route authority', () => {
  const text = 'Build a compact local Harness Authority Drift Lab app with Spawner. It should help tonight by tracking fresh-intent authority checks, Spawner mission progress, memory and KB QA notes, domain-chip QA notes, registry/runtime drift, rollback steps, and Telegram proof results. Include a concise README, one smoke test, and a simple local UI. Build it now.';
  const envelope = envelopeForNaturalRoute(text);
  const result = authorizeTelegramActionFromEnvelope(envelope, {
    route: 'spawner.build',
    text,
    toolName: 'spawner.run',
    ownerSystem: 'spawner-ui',
    mutationClass: 'launches_mission'
  });

  assert.equal(envelope.selectedIntent.action, 'spawner.build');
  assert.equal(envelope.selectedIntent.ownerSystem, 'spawner-ui');
  assert.equal(result.allow, true);
  assert.equal(result.routeVerdict.allow, true);
  assert.equal(result.toolAuthorization.verdict, 'allowed');
  assert.equal(result.consumerVerification?.allowed, true);
  assert.equal(result.consumerVerification?.tool_name, 'spawner.run');
  assert.equal(result.reasonCodes.includes('route_not_selected_by_turn_envelope'), false);
});

test('allows Spawner continuity board builds without stale chip-memory boundary drift', () => {
  const text = 'Build a compact local Spawner Continuity Board with Spawner for tonight. It should track old Spawner features we must preserve, Harness Core authority gates, runtime health, memory and KB QA notes, domain-chip QA notes, Telegram proof, registry drift, rollback steps, and the next live QA queue. Include a simple README and one smoke test. Build it now.';
  const envelope = envelopeForNaturalRoute(text);
  const result = authorizeTelegramActionFromEnvelope(envelope, {
    route: 'spawner.build',
    text,
    toolName: 'spawner.run',
    ownerSystem: 'spawner-ui',
    mutationClass: 'launches_mission'
  });

  assert.equal(envelope.selectedIntent.action, 'spawner.build');
  assert.equal(envelope.selectedIntent.ownerSystem, 'spawner-ui');
  assert.equal(result.allow, true);
  assert.equal(result.routeVerdict.allow, true);
  assert.equal(result.toolAuthorization.verdict, 'allowed');
  assert.equal(result.consumerVerification?.allowed, true);
  assert.equal(result.consumerVerification?.tool_name, 'spawner.run');
  assert.equal(result.reasonCodes.includes('route_not_selected_by_turn_envelope'), false);
});

test('allows Spawner relay proof pad builds without board/status route drift', () => {
  const text = 'Build a tiny local Spawner Relay Readback Proof Pad. Use Spawner. Make it show the latest Harness Core authority gate, Spawner trace readback, Telegram final handoff status, and a small operator checklist. Keep it lightweight with a README and one smoke test. This is a live proof that old Spawner build and final completion relay still work under Harness Core authority after the relay auth fix.';
  const envelope = envelopeForNaturalRoute(text);
  const result = authorizeTelegramActionFromEnvelope(envelope, {
    route: 'spawner.build',
    text,
    toolName: 'spawner.run',
    ownerSystem: 'spawner-ui',
    mutationClass: 'launches_mission'
  });

  assert.equal(envelope.selectedIntent.action, 'spawner.build');
  assert.equal(envelope.selectedIntent.ownerSystem, 'spawner-ui');
  assert.equal(result.allow, true);
  assert.equal(result.routeVerdict.allow, true);
  assert.equal(result.toolAuthorization.verdict, 'allowed');
  assert.equal(result.consumerVerification?.allowed, true);
  assert.equal(result.consumerVerification?.tool_name, 'spawner.run');
  assert.equal(result.reasonCodes.includes('route_not_selected_by_turn_envelope'), false);
});

test('signs Telegram Governor decisions when an HMAC key is configured', () => withGovernorHmacEnv(() => {
  const text = 'Build a private local-first dashboard for memory reports with stale context and source labels.';
  const result = authorizeTelegramActionFromEnvelope(envelopeFor(text), {
    route: 'spawner.build',
    text,
    toolName: 'spawner.run',
    ownerSystem: 'spawner-ui',
    mutationClass: 'launches_mission'
  });

  assert.equal(result.allow, true);
  const signedDecision = result.governorDecision as typeof result.governorDecision & {
    signature?: GovernorDecisionSignatureV1;
  };
  assert.equal(signedDecision?.signature?.schema_version, 'governor-decision-signature-v1');
  assert.equal(signedDecision?.signature?.alg, 'hmac-sha256');
  assert.equal(signedDecision?.signature?.key_id, 'telegram-unit-test');
  assert.match(signedDecision?.signature?.nonce || '', /^[0-9a-f-]{36}$/);
  assert.match(signedDecision?.signature?.signature || '', /^[0-9a-f]{64}$/);

  const { signature, ...signaturePayloadFields } = signedDecision!.signature!;
  const expected = createHmac('sha256', 'test-governor-secret')
    .update(governorDecisionSignaturePayload(signedDecision as unknown as Record<string, unknown>, signaturePayloadFields), 'utf8')
    .digest('hex');
  assert.equal(signature, expected);
}));

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

test('final Telegram action boundary rejects unsigned Governor decisions when HMAC is configured', () => withGovernorHmacEnv(() => {
  const envelope = createHarnessCoreActionEnvelopeVNext({
    surface: 'telegram',
    ownerSystem: 'spark-telegram-bot',
    toolName: 'spark.status',
    mutationClass: 'read_only',
    source: 'telegram',
    reason: 'Read Spark status from Telegram.',
    requestId: 'turn:unsigned-governor',
    actorIdRef: 'telegram-human'
  });
  const unsignedDecision = createHarnessCoreAuthorizedGovernorDecision({
    envelope,
    tool_name: 'spark.status'
  });
  const readAction = unsignedDecision.envelope.proposed_actions[0];

  assert.equal(governorOutcomeAllowsTelegramAction(unsignedDecision, readAction, 'spark.status'), false);
}));

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

test('natural wiki reads require Harness read authority and tool ledgers', () => {
  const text = 'search your wiki for Telegram route mistakes';
  const envelope = envelopeFor(text);
  const result = authorizeTelegramActionFromEnvelope(envelope, {
    route: 'spark_wiki.query',
    text,
    toolName: 'spark_wiki.query',
    ownerSystem: 'spark-intelligence-builder',
    mutationClass: 'read_only'
  });

  assert.equal(envelope.selectedIntent.action, 'spark_wiki.query');
  assert.equal(envelope.executionPolicy.canWriteMemory, false);
  assert.equal(result.allow, true);
  assert.equal(result.routeVerdict.reason, 'envelope_selected_route');
  assert.equal(result.toolAuthorization.verdict, 'allowed');
  assert.equal(result.harnessCore?.envelope.selected_move, 'read_current_state');
  assert.equal(result.harnessCore?.authorization.verdict, 'allow');
  assert.equal(result.harnessCoreLedger?.tool_name, 'spark_wiki.query');
  assert.equal(result.governorDecision?.outcome, 'read_only');
  assert.equal(result.consumerVerification?.allowed, true);
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

test('classifies memory directives without letting Intent Gate V2 execute them', () => {
  const text = 'Remember that tonight I prefer concise Harness release updates.';
  const decision = classifyTelegramIntentV2(text);
  const envelope = envelopeForDecision(text, decision);
  const result = authorizeTelegramActionFromEnvelope(envelope, {
    route: 'memory.write',
    text,
    toolName: 'memory.write',
    ownerSystem: 'domain-chip-memory',
    mutationClass: 'writes_memory'
  });

  assert.equal(decision.route, 'memory.write');
  assert.equal(decision.enforcement, 'enforce_safe');
  assert.equal(isTelegramIntentGateV2SafeRoute(decision), false);
  assert.equal(shouldEnforceTelegramIntentGateV2(decision), false);
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
