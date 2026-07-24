import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { parseBuildIntent } from '../src/buildIntent';
import {
  formatProviderCompletionForTelegram,
  formatMissionRelayStateMessageForTelegram
} from '../src/missionRelay';
import {
  isSparkWorkflowBugHuntRequest,
  isMissionRoutingFailureClassQuestion,
  isNoExecutionBoundary,
  shouldPreferConversationalIdeation,
  parseMissionUpdatePreferenceIntent,
  parseSpawnerBoardNaturalIntent,
  renderMissionRoutingFailureClassReply,
  renderSparkWorkflowBugHuntReply
} from '../src/conversationIntent';
import {
  formatBuildClarificationReplyWithMicrocopy,
  formatCanvasReadySummary,
  formatCanvasShapingHeartbeatSummary,
  formatCanvasStillRunningSummary,
  formatLatestCanvasPlanReply,
  isLatestCanvasPlanQuestion,
  isNamedTelegramProfileSetupQuestion,
  isDomainChipPendingDirection,
  isPendingClarificationAlternativeRequest,
  isPendingClarificationFollowup,
  isRouteConfidenceGateUnsupportedError,
  latestCanvasPlanFromLoadState,
  routeConfidenceGateCompatibilityAllows,
  renderUnknownTelegramCommandReply,
  cleanupSlidingWindowRateLimit,
  shouldSendRateLimitNotice,
  slidingWindowRateLimitAllows,
  shouldAnswerAuthoritativeRuntimeStatus,
  shouldUsePendingClarificationForMessage
} from '../src/index';

function test(name: string, fn: () => void): void {
  try {
    fn();
    console.log(`ok - ${name}`);
  } catch (error) {
    console.error(`not ok - ${name}`);
    throw error;
  }
}

function assertNoBuild(prompt: string): void {
  assert.equal(parseBuildIntent(prompt), null, `Unexpected build route for:\n${prompt}`);
}

function assertBuild(prompt: string, expectedProjectName: string): void {
  const intent = parseBuildIntent(prompt);
  assert.ok(intent, `Expected build route for:\n${prompt}`);
  assert.equal(intent.projectName, expectedProjectName);
}

test('rate-limit notice is emitted once per cooldown', () => {
  const notices = new Map<number, number>();
  assert.equal(shouldSendRateLimitNotice(notices, 7, 1_000, 30_000), true);
  assert.equal(shouldSendRateLimitNotice(notices, 7, 2_000, 30_000), false);
  assert.equal(shouldSendRateLimitNotice(notices, 7, 31_000, 30_000), true);
});

test('unknown slash commands get one compact help hint', () => {
  const reply = renderUnknownTelegramCommandReply();
  assert.match(reply, /don't recognize/i);
  assert.match(reply, /\/help/);
  assert.equal(reply.split('\n').length, 1);
});

test('bug hunt: strategy, QA, and route-meta conversations do not hijack into builds', () => {
  [
    'yeah buybacks not for now actually, maybe later, i think we can earn it back from NFTs, if we do sell the NFTs via token, and create a nice structure for it to get hype right after the launch.',
    'what else would you actually test next as edge cases so that we can make the spawner loop a lot better?',
    'are we making these way too deterministic btw, because the messages came very fast like a chatbot',
    'what would you actually be making better here? I would say the Telegram messages, each time sharing the mission number is obsolete.',
    'look into the whole Spark systems and repos so we really find all the messages that can be improved',
    'can you give more examples and intelligence on this route confidence system',
    'were h70 skills mandatory here, and can we make sure normal prompts still operate?',
    'we already have a big community airdrop that we promised so it needs to be around 20% imo. and team 10% makes sense wondering what if we make liquidity dex 5% would it be too small or good enough, and then we could have some more stuff for ecosystem rewards.',
    'what else should Mission Control and Spawner workflow improve before we ship?',
    'right this has been actually really good, so should we send those PRs or what edge cases should we test next?',
    'prepare a huge unit test and let us become bug hunters for Mission Control and Spawner workflow',
    'are there any PR things we forgot before the publishing machine merges?',
    'should we focus and ship these or keep auditing Telegram composition first?'
  ].forEach(assertNoBuild);
});

test('bug hunt: explicit builds still route, with human project titles', () => {
  assertBuild(
    'Build a browser game called Recursive Sage: Proof Orchard. Make it a reasoning game Recursive would want to play.',
    'Recursive Sage: Proof Orchard'
  );
  assertBuild(
    'Build a token launch dashboard for NFT sale strategy.',
    'Token Launch Dashboard'
  );
  assertBuild(
    'Build another game that Spark Recursive would actually want to play. It should test its own reasoning skills too.',
    'Recursive Sage Reasoning Game'
  );
  assert.doesNotMatch(
    parseBuildIntent('Build another game that Spark Recursive would actually want to play. It should test its own reasoning skills too.')?.projectName || '',
    /\bNother\b/i
  );
  const reasoningGame = parseBuildIntent('Build another game that Spark Recursive would actually want to play. It should test its own reasoning skills too.');
  assert.ok(reasoningGame);
  assert.match(reasoningGame.prd, /reasoning game/i);
  assert.match(reasoningGame.prd, /trust, verify, quarantine, or revise/i);
  assert.doesNotMatch(reasoningGame.prd, /\bmaze\b/i);
});

test('bug hunt: clarification microcopy preserves reasoning-game intent', () => {
  const reply = formatBuildClarificationReplyWithMicrocopy(
    'Recursive Sage Reasoning Game',
    ['Should it be atmospheric and strange, or fast with score pressure?'],
    ['Assume it should test reasoning, trust, memory drift, contradiction handling, and action confidence.'],
    {
      recommendation: 'Build Recursive Sage as a browser maze puzzler with shifting walls and a win.',
      steeringQuestion: 'Should it feel atmospheric or fast?'
    }
  );

  assert.match(reply, /I can turn this into Recursive Sage Reasoning Game\./);
  assert.match(reply, /trust\/verify\/quarantine choices/);
  assert.doesNotMatch(reply, /\bmaze\b/i);
});

test('bug hunt: pending build clarification does not hijack alternative requests', () => {
  const pending = { timestamp: Date.now() };
  const alternative = "let's try something different what else you'd recommend?";
  const steering = 'playful and weird, and somewhat practical';
  const explicitSteering = "sure let's do it, playful and weird, and somewhat practical";

  assert.equal(isPendingClarificationAlternativeRequest(alternative), true);
  assert.equal(shouldPreferConversationalIdeation(alternative), true);
  assert.equal(isPendingClarificationFollowup(alternative), false);
  assert.equal(shouldUsePendingClarificationForMessage(pending, alternative), false);
  assertNoBuild(alternative);

  assert.equal(isPendingClarificationFollowup(steering), true);
  assert.equal(shouldUsePendingClarificationForMessage(pending, steering), true);
  assert.equal(isPendingClarificationFollowup(explicitSteering), true);
});

test('bug hunt: pending build clarification lives behind evidence adapter', () => {
  const indexSource = readFileSync(resolve(__dirname, '../src/index.ts'), 'utf8');
  const adapterSource = readFileSync(resolve(__dirname, '../src/telegramPendingBuildEvidence.ts'), 'utf8');

  assert.match(indexSource, /telegramPendingBuildEvidence/);
  assert.match(indexSource, /pendingBuildClarificationForMessage/);
  assert.doesNotMatch(indexSource, /const pendingClarifications = new Map/);
  assert.doesNotMatch(indexSource, /export function isPendingClarificationFollowup/);
  assert.match(adapterSource, /const buildClarifications = new Map/);
  assert.match(adapterSource, /export function pendingBuildClarificationForMessage/);
});

test('bug hunt: no-execution boundaries outrank build and mission words', () => {
  const prompts = [
    'I am mentioning build and mission, but do not start anything. What is the current Spark risk profile?',
    'I am asking about a bug in mission routing. Do not launch a mission; just explain the likely failure class.',
    'please help me design a project called Relay Workshop with kanban and canvas, but do not build yet',
    'do not build yet, help me think through a domain chip for route confidence',
    'No need, we can talk here.',
    'Do not run another mission; just tell me what edge cases remain.',
    'Don\'t launch anything yet, but explain how the Spawner loop should recover after restart.',
    'No build for now, I only want to compare the Mission board and Canvas language.',
    'For QA, show the latest canvas plan and skills for the H70 Orbit Proof build. Do not start anything new.'
  ];

  prompts.forEach((prompt) => {
    assert.equal(isNoExecutionBoundary(prompt), true, `Expected no-execution boundary for:\n${prompt}`);
    assertNoBuild(prompt);
  });
});

test('bug hunt: pending domain-chip drafts only accept explicit confirmation or chip-shaping direction', () => {
  assert.equal(isDomainChipPendingDirection('go'), true);
  assert.equal(isDomainChipPendingDirection('yes'), false);
  assert.equal(isDomainChipPendingDirection('yes create it'), true);
  assert.equal(isDomainChipPendingDirection('names with rationale and usage angle, make the vibe surreal'), true);
  assert.equal(isDomainChipPendingDirection('luxury sci-fi but still developer-friendly'), true);
  assert.equal(isDomainChipPendingDirection('focus on the reviewer workflow, benchmark cases, held-out traps, and rollback'), true);
  assert.equal(
    isDomainChipPendingDirection('prepare a huge unit test and let us become bug hunters for Mission Control and Spawner workflow'),
    false
  );
  assert.equal(isDomainChipPendingDirection('what else should we test in the Spawner loop?'), false);
});

test('bug hunt: pending domain-chip draft state lives behind evidence adapter', () => {
  const indexSource = readFileSync(resolve(__dirname, '../src/index.ts'), 'utf8');
  const adapterSource = readFileSync(resolve(__dirname, '../src/telegramPendingDomainChipEvidence.ts'), 'utf8');

  assert.match(indexSource, /telegramPendingDomainChipEvidence/);
  assert.match(indexSource, /getPendingDomainChipBuild/);
  assert.doesNotMatch(indexSource, /const pendingDomainChipBuilds = new Map/);
  assert.doesNotMatch(indexSource, /export function isDomainChipPendingDirection/);
  assert.match(adapterSource, /const domainChipBuilds = new Map/);
  assert.match(adapterSource, /export function isDomainChipPendingDirection/);
});

test('bug hunt: pending creator and cancel state live behind evidence adapters', () => {
  const indexSource = readFileSync(resolve(__dirname, '../src/index.ts'), 'utf8');
  const creatorAdapter = readFileSync(resolve(__dirname, '../src/telegramPendingCreatorMissionEvidence.ts'), 'utf8');
  const cancelAdapter = readFileSync(resolve(__dirname, '../src/telegramPendingMissionCancelEvidence.ts'), 'utf8');

  assert.match(indexSource, /telegramPendingCreatorMissionEvidence/);
  assert.match(indexSource, /telegramPendingMissionCancelEvidence/);
  assert.doesNotMatch(indexSource, /const pendingCreatorMissions = new Map/);
  assert.doesNotMatch(indexSource, /const pendingMissionCancelConfirmations = new Map/);
  assert.doesNotMatch(indexSource, /function parsePendingCreatorMissionAction/);
  assert.doesNotMatch(indexSource, /function isMissionCancelConfirmationText/);
  assert.match(creatorAdapter, /const creatorMissions = new Map/);
  assert.match(creatorAdapter, /export function parsePendingCreatorMissionAction/);
  assert.match(cancelAdapter, /const missionCancelConfirmations = new Map/);
  assert.match(cancelAdapter, /export function isMissionCancelConfirmationText/);
});

test('bug hunt: Spark workflow QA prompts get a local plan, not invented execution claims', () => {
  const prompt = 'prepare a huge unit test and let us become bug hunters for Mission Control and Spawner workflow';
  assert.equal(isSparkWorkflowBugHuntRequest(prompt), true);
  const reply = renderSparkWorkflowBugHuntReply(prompt);

  assert.match(reply, /QA planning, not a mission launch/);
  assert.match(reply, /route hijacks/);
  assert.match(reply, /no-edit probes/);
  assert.match(reply, /I will not start a mission from this wording\./);
  assert.doesNotMatch(reply, /read-only/i);
  assert.doesNotMatch(reply, /Prepared, but/i);
  assert.doesNotMatch(reply, /tests\/missionControlSpawnerWorkflow/i);
});

test('bug hunt: PRD Writing loop-state QA prompts yield to Loop Engineering status', () => {
  const prompt = 'Loop QA read-only check: latest PRD Writing loop state from Spawner? Include schedule status, fresh/stale, what improved, distilled reuse without rerun, and link. Do not mutate anything.';
  assert.equal(isSparkWorkflowBugHuntRequest(prompt), false);
});

test('bug hunt: Operations Research loop-state QA prompts yield to Loop Engineering status', () => {
  const prompt = 'Loop QA final smoke: read-only check latest Operations Research Watchdesk loop state from Spawner. Do not run a benchmark, loop, schedule, activation, mission, publication, or mutation. Confirm whether it matches the Spawner Operations Research control-plane truth and whether anything changed.';
  assert.equal(isSparkWorkflowBugHuntRequest(prompt), false);
});

test('bug hunt: success without mission id questions answer fail-closed directly', () => {
  const prompt = 'QA no-action check: do not create, run, repair, publish, or start anything. If Mission Control answers success but gives no mission id for a /run request, should Spark treat that as started or fail closed?';
  assert.equal(isSparkWorkflowBugHuntRequest(prompt), true);
  const reply = renderSparkWorkflowBugHuntReply(prompt);

  assert.match(reply, /Fail closed/);
  assert.match(reply, /not a started run/);
  assert.match(reply, /closure proof/);
  assert.match(reply, /fresh mission id/);
  assert.doesNotMatch(reply, /Coverage|QA pass first|Next move/i);
});

test('bug hunt: mission routing failure-class prompts stay short and non-executing', () => {
  const prompt = 'I am asking about a bug in mission routing. Do not launch a mission; just explain the likely failure class in one or two natural sentences.';
  assert.equal(isMissionRoutingFailureClassQuestion(prompt), true);
  assertNoBuild(prompt);

  const reply = renderMissionRoutingFailureClassReply(prompt);
  assert.match(reply, /route hijack/i);
  assert.match(reply, /Governor decision/i);
  assert.doesNotMatch(reply, /This is no-action|no-action/i);
  assert.doesNotMatch(reply, /Canvas|Kanban|Mission board|latest canvas|H70 Orbit Proof/i);
  assert.ok(reply.split(/\n/).filter((line) => line.trim()).length <= 2, `expected compact reply, got: ${reply}`);
});

test('bug hunt: no-action explanation reply does not reuse stale mission/build wording', () => {
  const staleGoReply = renderMissionRoutingFailureClassReply(
    'go. There is no active pending action in this turn. Do not continue an old mission. Just tell me whether this word alone is enough to act.'
  );
  assert.match(staleGoReply, /word by itself is not enough/i);
  assert.match(staleGoReply, /fresh explicit continuation request/i);
  assert.doesNotMatch(staleGoReply, /This is no-action|no-action/i);
  assert.doesNotMatch(staleGoReply, /mission or build words/i);
  assert.doesNotMatch(staleGoReply, /asked to explain only/i);

  const publishReply = renderMissionRoutingFailureClassReply(
    'This is not a command. I am discussing remember, publish, deploy, schedule, provider, and chip as risky triggers. Do not save memory or publish anything.'
  );
  assert.match(publishReply, /examples, quoted words/i);
  assert.match(publishReply, /fresh, explicit save request/i);
  assert.doesNotMatch(publishReply, /mission or build words/i);
});

test('bug hunt: mission utility requests do not become project builds', () => {
  assert.equal(parseMissionUpdatePreferenceIntent('include board and canvas links for missions')?.links, 'both');
  assert.equal(parseMissionUpdatePreferenceIntent('for missions only send start and end updates')?.verbosity, 'minimal');
  assert.equal(parseSpawnerBoardNaturalIntent('which LLM took the latest Spawner job?'), 'latest_provider');
  assert.equal(parseSpawnerBoardNaturalIntent('what was the mission?'), 'latest_mission');
  assert.equal(parseSpawnerBoardNaturalIntent('what happened with the latest mission? keep it short and conversational.'), 'latest_mission');
  assert.equal(parseSpawnerBoardNaturalIntent('why did the latest mission fail?'), 'latest_failure');

  [
    'include board and canvas links for missions',
    'for missions only send start and end updates',
    'which LLM took the latest Spawner job?',
    'why did the latest mission fail?',
    'show me the current Spawner/Kanban board'
  ].forEach(assertNoBuild);
});

test('bug hunt: Telegram composition keeps mission ids and telemetry mostly behind links', () => {
  const canvasReady = formatCanvasReadySummary({
    projectName: 'Proof Orchard',
    taskCount: 4,
    elapsed: 145,
    readyCanvasUrl: 'http://127.0.0.1:3333/canvas?pipeline=p1&mission=mission-123',
    kanbanUrl: 'http://127.0.0.1:3333/kanban?mission=mission-123',
    analysis: {
      tasks: [
        { title: 'Create the app shell', skills: ['frontend-engineer', 'ui-design'] },
        { title: 'Implement reasoning rounds', skills: ['frontend-engineer'] },
        { title: 'Polish the visual system', skills: ['ui-design', 'accessibility'] },
        { title: 'Write smoke notes', skills: ['technical-writer'] }
      ]
    }
  });
  assert.match(canvasReady, /Canvas is ready for Proof Orchard\./);
  assert.doesNotMatch(canvasReady, /Spawned tasks/);
  assert.match(canvasReady, /Canvas\n• http:\/\/127\.0\.0\.1:3333\/canvas/);
  assert.doesNotMatch(canvasReady, /Mission board/);
  assert.match(canvasReady, /Spark queued 4 build steps and is moving now\./);
  assert.doesNotMatch(canvasReady, /Plan\n• App shell · frontend/);
  assert.doesNotMatch(canvasReady, /• Smoke notes/);
  assert.doesNotMatch(canvasReady, /• Smoke notes · docs/);
  assert.doesNotMatch(canvasReady, /• \+1 more/);
  assert.doesNotMatch(canvasReady, /Skills invoked/);
  assert.doesNotMatch(canvasReady, /Skill tier/);
  assert.doesNotMatch(canvasReady, /Ask for tasks or skills if you want the full plan\./);
  assert.doesNotMatch(canvasReady, /^Mission:\s*mission-123/im);
  assert.doesNotMatch(canvasReady, /elapsed|trace|request/i);

  const oneStepFastLane = formatCanvasReadySummary({
    projectName: 'One Step Fast Smoke',
    taskCount: 1,
    elapsed: 4,
    readyCanvasUrl: 'http://127.0.0.1:3333/canvas?pipeline=p-fast&mission=mission-fast',
    kanbanUrl: 'http://127.0.0.1:3333/kanban?mission=mission-fast',
    analysis: {
      tasks: [
        { title: 'Build and check the single-file static page', skills: ['frontend-engineer', 'accessibility', 'qa-engineering'] }
      ]
    }
  });
  assert.match(oneStepFastLane, /Spark queued 1 build step and is moving now/);
  assert.doesNotMatch(oneStepFastLane, /• Build \+ check static page · frontend/);
  assert.doesNotMatch(oneStepFastLane, /\.\.\./);

  const heartbeat = formatCanvasShapingHeartbeatSummary({ projectName: 'Proof Orchard', elapsedSeconds: 120 });
  assert.match(heartbeat, /still shaping Proof Orchard\./);
  assert.match(heartbeat, /still shaping Proof Orchard\.\n\nI will keep this quiet until the canvas is ready or something needs attention\./);
  assert.doesNotMatch(heartbeat, /🛠️/);
  assert.doesNotMatch(heartbeat, /Canvas prep has been running/);
  assert.doesNotMatch(heartbeat, /^Status$/m);
  assert.doesNotMatch(heartbeat, /^Move$/m);
  assert.doesNotMatch(heartbeat, /Mission:/);

  const stillRunning = formatCanvasStillRunningSummary({
    projectName: 'Proof Orchard',
    elapsedSeconds: 240,
    kanbanUrl: 'http://127.0.0.1:3333/kanban?mission=mission-123'
  });
  assert.match(stillRunning, /still preparing Proof Orchard\./);
  assert.match(stillRunning, /taking a little longer than usual/);
  assert.match(stillRunning, /I will send the canvas when it is ready\./);
  assert.doesNotMatch(stillRunning, /🛠️/);
  assert.doesNotMatch(stillRunning, /It has been shaping/);
  assert.doesNotMatch(stillRunning, /^Status$/m);
  assert.doesNotMatch(stillRunning, /^Move$/m);
  assert.doesNotMatch(stillRunning, /^Mission:\s*mission-123/im);
});

test('bug hunt: automatic canvas-ready summary keeps build details behind explicit follow-up', () => {
  const tenStepReply = formatCanvasReadySummary({
    projectName: 'Ten Step App',
    taskCount: 10,
    elapsed: 20,
    readyCanvasUrl: 'http://127.0.0.1:3333/canvas?pipeline=p2&mission=mission-456',
    kanbanUrl: 'http://127.0.0.1:3333/kanban?mission=mission-456',
    analysis: {
      tasks: Array.from({ length: 10 }, (_, index) => ({
        title: `Step ${index + 1}`,
        skills: ['frontend-engineer']
      }))
    }
  });
  assert.match(tenStepReply, /Spark queued 10 build steps and is moving now\./);
  assert.doesNotMatch(tenStepReply, /• Step 1 · frontend/);
  assert.doesNotMatch(tenStepReply, /• Step 10 · frontend/);
  assert.doesNotMatch(tenStepReply, /• \+\d+ more/);

  const twelveStepReply = formatCanvasReadySummary({
    projectName: 'Twelve Step App',
    taskCount: 12,
    elapsed: 20,
    readyCanvasUrl: 'http://127.0.0.1:3333/canvas?pipeline=p3&mission=mission-789',
    kanbanUrl: 'http://127.0.0.1:3333/kanban?mission=mission-789',
    analysis: {
      tasks: Array.from({ length: 12 }, (_, index) => ({
        title: `Step ${index + 1}`,
        skills: ['frontend-engineer']
      }))
    }
  });
  assert.match(twelveStepReply, /Spark queued 12 build steps and is moving now\./);
  assert.doesNotMatch(twelveStepReply, /• Step 10 · frontend/);
  assert.doesNotMatch(twelveStepReply, /• Step 11 · frontend/);
  assert.doesNotMatch(twelveStepReply, /• \+2 more/);
});

test('bug hunt: automatic pro canvas summaries do not dump skill machinery', () => {
  const reply = formatCanvasReadySummary({
    projectName: 'Pro Game',
    taskCount: 2,
    elapsed: 20,
    tier: 'pro',
    readyCanvasUrl: 'http://127.0.0.1:3333/canvas?pipeline=p4&mission=mission-pro',
    kanbanUrl: 'http://127.0.0.1:3333/kanban?mission=mission-pro',
    analysis: {
      tasks: [
        { title: 'Create the playable game shell', skills: ['frontend-engineer', 'game-development'] },
        { title: 'Design the core play and reasoning loop', skills: ['game-design', 'puzzle-design'] }
      ]
    }
  });
  assert.doesNotMatch(reply, /• Playable shell · frontend/);
  assert.doesNotMatch(reply, /• Core reasoning loop · game design/);
  assert.doesNotMatch(reply, /Skills invoked/);
  assert.doesNotMatch(reply, /Skill tier/);
  assert.doesNotMatch(reply, /Pro can add/);
});

test('bug hunt: automatic pro canvas ready summary hides the full skill stack', () => {
  const reply = formatCanvasReadySummary({
    projectName: 'H70 Orbit Proof',
    taskCount: 4,
    elapsed: 20,
    tier: 'pro',
    readyCanvasUrl: 'http://127.0.0.1:3333/canvas?pipeline=p-h70&mission=mission-h70',
    kanbanUrl: 'http://127.0.0.1:3333/kanban?mission=mission-h70',
    analysis: {
      tasks: [
        {
          title: 'Create the playable game shell',
          skills: ['frontend-engineer', 'threejs-3d-graphics', 'game-development', 'game-ui-design', 'responsive-mobile-first']
        },
        {
          title: 'Design the core play and reasoning loop',
          skills: ['game-design', 'game-design-core', 'puzzle-design', 'procedural-generation', 'level-design']
        },
        {
          title: 'Add scoring, restart, and player feedback',
          skills: ['state-management', 'game-ui-design', 'player-onboarding', 'accessibility']
        },
        {
          title: 'Verify the playable loop',
          skills: ['qa-engineering', 'testing-strategies', 'accessibility']
        }
      ]
    }
  });

  assert.doesNotMatch(reply, /Skills invoked/);
  assert.doesNotMatch(reply, /Skill tier/);
  assert.doesNotMatch(reply, /\+\d+ more/);
  assert.doesNotMatch(reply, /\+11 more/);
  assert.doesNotMatch(reply, /frontend, accessibility, testing, game dev, \+8 more/);
});

test('bug hunt: canvas task details stay available as an explicit follow-up', () => {
  const reply = formatLatestCanvasPlanReply({
    projectName: 'Proof Orchard',
    taskCount: 4,
    tier: 'base',
    readyCanvasUrl: 'http://127.0.0.1:3333/canvas?pipeline=p1&mission=mission-123',
    recordedAt: '2026-05-12T09:00:00.000Z',
    tasks: [
      { title: 'Create the app shell', skills: ['frontend-engineer', 'ui-design'] },
      { title: 'Implement reasoning rounds', skills: ['frontend-engineer'] },
      { title: 'Polish the visual system', skills: ['ui-design', 'accessibility'] },
      { title: 'Write smoke notes', skills: ['technical-writer'] }
    ]
  });

  assert.match(reply, /The latest canvas is for Proof Orchard\./);
  assert.match(reply, /4 build steps are queued\./);
  assert.doesNotMatch(reply, /\nSkill tier: base tier/);
  assert.match(reply, /Tasks\n• Create the app shell - frontend, UI design/);
  assert.match(reply, /• Write smoke notes/);
  assert.doesNotMatch(reply, /• Write smoke notes - technical-writer/);
  assert.match(reply, /Skills invoked\n• Active: 3 skills: frontend, UI design, accessibility\n• Skill tier: base tier \(30-skill starter loadout\)\n• Pro can add 1 skill: docs/);
  assert.match(reply, /Canvas\n• http:\/\/127\.0\.0\.1:3333\/canvas/);
  assert.doesNotMatch(reply, /^Mission:/im);
  assert.doesNotMatch(reply, /Mission board/);
});

test('bug hunt: casual next-step questions do not recall stale canvas plans', () => {
  assert.equal(
    isLatestCanvasPlanQuestion('What’s the smallest useful next step here? Keep it natural, short paragraphs, and use bullets only if they help.'),
    false
  );
  assert.equal(
    isLatestCanvasPlanQuestion('For QA, show the latest canvas plan and skills for the Startup Benchmark Progress Dashboard build. Do not start anything new.'),
    true
  );
  assert.equal(
    isLatestCanvasPlanQuestion('Do not start a mission. If I say "Create a tiny maze game plan and build only a minimal playable prototype", what mission title would you use? Keep it natural and short.'),
    false
  );
});

test('bug hunt: named Telegram profile setup stays out of live health status', () => {
  const prompt = [
    'Spark Compete QA: Test named Telegram profile setup in a disposable or read-only lane.',
    'Check /myid, env separation, log separation, and warnings not to disturb the primary bot.'
  ].join(' ');

  assert.equal(isNamedTelegramProfileSetupQuestion(prompt), true);
  assert.equal(shouldAnswerAuthoritativeRuntimeStatus(prompt), false);
});

test('bug hunt: repair-needed current-status question uses live status instead of repair action', () => {
  assert.equal(
    shouldAnswerAuthoritativeRuntimeStatus('Do not repair anything. Is a repair needed from the current status?'),
    true
  );
});

test('bug hunt: latest canvas plan can be restored from persisted Spawner state after restart', () => {
  const plan = latestCanvasPlanFromLoadState({
    requestId: 'tg-build-d9318b7927c7-1778771867119',
    missionId: 'mission-1778771867119',
    pipelineName: 'H70 Orbit Proof',
    tier: 'pro',
    timestamp: '2026-05-14T15:17:52.587Z',
    nodes: [
      {
        skill: {
          name: 'Create the playable game shell',
          skillChain: ['frontend-engineer', 'threejs-3d-graphics', 'game-development', 'game-ui-design', 'responsive-mobile-first']
        }
      },
      {
        skill: {
          name: 'Design the core play and reasoning loop',
          skillChain: ['game-design', 'game-design-core', 'puzzle-design', 'procedural-generation', 'level-design']
        }
      }
    ]
  }, 'http://127.0.0.1:3333');

  assert.ok(plan);
  const reply = formatLatestCanvasPlanReply(plan);
  assert.match(reply, /The latest canvas is for H70 Orbit Proof\./);
  assert.match(reply, /2 build steps are queued\./);
  assert.match(reply, /• Create the playable game shell - frontend, Three\.js, game dev, game UI, mobile/);
  assert.match(reply, /Skills invoked\n• Active: 10 skills: frontend, Three\.js, game dev, game UI, mobile, game design, game loop, puzzle, procedural, levels\n• Skill tier: pro tier \(full Spark skill catalog\)/);
  assert.match(reply, /Canvas\n• http:\/\/127\.0\.0\.1:3333\/canvas\?pipeline=prd-tg-build-d9318b7927c7-1778771867119&mission=mission-1778771867119/);
  assert.doesNotMatch(reply, /I can turn this into/);
});

test('bug hunt: provider completion does not make failures look shipped', () => {
  const unknownError = formatProviderCompletionForTelegram({
    providerLabel: 'codex',
    missionId: 'mission-unknown-error',
    verbosity: 'normal',
    response: 'unknown error'
  });
  assert.match(unknownError, /(?:hit a blocker|got blocked|could not finish that one|quick look)/i);
  assert.match(unknownError, /unknown error/i);
  assert.match(unknownError, /The board has the full trace if you want to inspect it\./);
  assert.doesNotMatch(unknownError, /raw trace|raw record/i);
  assert.doesNotMatch(unknownError, /^Move$/m);
  assert.doesNotMatch(unknownError, /✨ Spark (?:shipped|finished|wrapped|has the result)/i);
  assert.doesNotMatch(unknownError, /Mission: mission-unknown-error/);

  const noText = formatProviderCompletionForTelegram({
    providerLabel: 'codex',
    missionId: 'mission-empty',
    verbosity: 'normal',
    response: 'completed without a text response'
  });
  assert.match(noText, /The run finished, but it did not send useful final notes back\./);
  assert.match(noText, /Open the preview or board if you want to inspect what changed\./);
  assert.doesNotMatch(noText, /Codex:\s*completed without a text response/i);
  assert.doesNotMatch(noText, /Mission: mission-empty/);
});

test('bug hunt: created mission handoff is not framed as finished work', () => {
  const message = formatProviderCompletionForTelegram({
    providerLabel: 'codex',
    missionId: 'mission-agent-mission-control-v1',
    verbosity: 'normal',
    response: [
      'Created the focused Spawner mission v1.',
      '',
      'Mission: `mission-agent-mission-control-v1`',
      'Canvas: http://127.0.0.1:3334/canvas?pipeline=prd-telegram-agent-mission-control-v1&mission=mission-agent-mission-control-v1',
      'Kanban: http://127.0.0.1:3334/kanban?mission=mission-agent-mission-control-v1',
      '',
      'Verification passed:',
      '- Board shows the mission in `created` with `5/5` tasks queued.',
      '- Trace reports `canvas_ready`, `0%`, `5` nodes.',
      '- npm run smoke:routes passed.'
    ].join('\n')
  });

  assert.match(message, /(?:staged the handoff|queued, not completed|set up; execution is still pending|canvas is ready)/i);
  assert.match(message, /Created the focused Spawner mission v1/i);
  assert.doesNotMatch(message, /I got this one finished|got it done|came back clean|this one is finished/i);
  assert.doesNotMatch(message, /^✨/);
});

test('bug hunt: missing Builder route-confidence command degrades through local compatibility gate', () => {
  assert.equal(
    isRouteConfidenceGateUnsupportedError(
      new Error("spark-intelligence self: error: argument self_command: invalid choice: 'route-confidence-gate'")
    ),
    true
  );
  assert.equal(
    routeConfidenceGateCompatibilityAllows({
      latestInstruction: 'allow_execution',
      confirmationState: 'not_required',
      spawnerAvailable: true,
      runnerWritable: 'yes'
    }),
    true
  );
  assert.equal(
    routeConfidenceGateCompatibilityAllows({
      latestInstruction: 'no_execution',
      confirmationState: 'not_required',
      spawnerAvailable: true,
      runnerWritable: 'yes'
    }),
    false
  );
  assert.equal(
    routeConfidenceGateCompatibilityAllows({
      latestInstruction: 'allow_execution',
      confirmationState: 'missing',
      spawnerAvailable: true,
      runnerWritable: 'yes'
    }),
    false
  );
  assert.equal(
    routeConfidenceGateCompatibilityAllows({
      latestInstruction: 'allow_execution',
      confirmationState: 'not_required',
      spawnerAvailable: false,
      runnerWritable: 'yes'
    }),
    false
  );
  assert.equal(
    routeConfidenceGateCompatibilityAllows({
      latestInstruction: 'allow_execution',
      confirmationState: 'not_required',
      spawnerAvailable: true,
      runnerWritable: 'no'
    }),
    false
  );
});

test('bug hunt: pause, resume, and cancel relay state messages stay compact', () => {
  for (const state of ['paused', 'resumed', 'cancelled'] as const) {
    const message = formatMissionRelayStateMessageForTelegram({
      state,
      missionId: 'mission-state-noise',
      links: ['Mission board: http://127.0.0.1:3333/kanban?mission=mission-state-noise']
    });
    assert.doesNotMatch(message, /^Move$/m);
    assert.match(message, /(?:I will hold Telegram handoffs until it resumes|Telegram handoffs are back on|I will keep any late handoff messages quiet)/);
    assert.match(message, /Mission board: http:\/\/127\.0\.0\.1:3333\/kanban/);
    assert.doesNotMatch(message, /^Mission:\s*mission-state-noise/im);
    assert.ok(message.split('\n').length <= 6, `State message too tall:\n${message}`);
  }
});
