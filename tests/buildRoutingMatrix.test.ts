import assert from 'node:assert/strict';
import { parseBuildIntent } from '../src/buildIntent';
import {
  isLocalSparkServiceRequest,
  parseMissionUpdatePreferenceIntent,
  parseNaturalAccessChangeIntent,
  parseSpawnerBoardNaturalIntent
} from '../src/conversationIntent';
import { isLocalWorkspaceInspectionOnlyRequest } from '../src/localWorkspace';

function test(name: string, fn: () => void): void {
  try {
    fn();
    console.log(`ok - ${name}`);
  } catch (error) {
    console.error(`not ok - ${name}`);
    throw error;
  }
}

function assertRoutesToBuild(prompt: string, expectedName?: string): void {
  const intent = parseBuildIntent(prompt);
  assert.ok(intent, `Expected build intent for prompt:\n${prompt}`);
  if (expectedName) {
    assert.equal(intent.projectName, expectedName);
  }
  assert.equal(parseSpawnerBoardNaturalIntent(prompt), null);
  assert.equal(parseMissionUpdatePreferenceIntent(prompt), null);
  assert.equal(isLocalWorkspaceInspectionOnlyRequest(prompt), false);
  assert.equal(parseNaturalAccessChangeIntent(prompt), null);
  assert.equal(isLocalSparkServiceRequest(prompt, ''), false);
}

test('detailed Telegram build prompts route to builder instead of utility replies', () => {
  assertRoutesToBuild(`Hey Spark, let’s build a real project called Founder Signal Room.

Build it at C:\\Users\\USER\\Desktop\\founder-signal-room.

I want this to be a private, local-first dashboard for founders who collect messy notes during the week and need those notes turned into a living operating picture.

Mission preferences:
Send concise Telegram updates only when planning is ready, a meaningful step starts or finishes, and when the project ships. Include the Mission board first, then send the project canvas link once it is ready.`, 'Founder Signal Room');

  assertRoutesToBuild(`Spark, build this at C:\\Users\\USER\\Desktop\\beauty-booking-room: a polished appointment system for a beauty salon.

It needs a service menu, durations, staff availability, booking flow, manager dashboard, confirmation state, and local persistence.

Include the Mission board and canvas links when they are useful.`, 'beauty booking room');

  assertRoutesToBuild(`I want to build a private Three.js tool called Magical Object Forge.

Build it at C:\\Users\\USER\\Desktop\\magical-object-forge.

The app should let people combine ingredients, preview a live 3D object, save variants, and test WebGL fallback.

Keep Telegram updates concise and include the canvas when it is ready.`, 'Magical Object Forge');

  assertRoutesToBuild(`Can we build a local dashboard called Strategy Pulse?

Target folder: C:\\Users\\USER\\Desktop\\strategy-pulse.

It should ingest weekly notes, extract signals, show risks, decisions, open loops, and board-meeting summaries.

I want the Mission board first and the canvas after planning.`, 'Strategy Pulse');

  assertRoutesToBuild(`Please create a full app called Kitchen Ops Clock.

Build it at C:\\Users\\USER\\Desktop\\kitchen-ops-clock.

It should have timers, prep stages, localStorage, reset flow, responsive design, and README smoke tests.`, 'Kitchen Ops Clock');
});

test('mixed preference and access wording still reaches the builder', () => {
  const updatePrompt = `Use verbose updates and build a Three.js world tree called Spark World Tree.

Build it at C:\\Users\\USER\\Desktop\\spark-world-tree.

Send the Mission board first and the canvas when planning is ready.`;
  const updateIntent = parseBuildIntent(updatePrompt);
  assert.ok(updateIntent);
  assert.equal(updateIntent.projectName, 'Spark World Tree');
  assert.equal(parseMissionUpdatePreferenceIntent(updatePrompt, { allowExecutionLanguage: true })?.verbosity, 'verbose');
  assert.equal(isLocalSparkServiceRequest(updatePrompt, ''), false);

  const savedPreferencePrompt = `Save mission updates as verbose and build this at C:\\Users\\USER\\Desktop\\terminal-chef-clock: a clock for terminal devs who cook.`;
  const savedPreferenceIntent = parseBuildIntent(savedPreferencePrompt);
  assert.ok(savedPreferenceIntent);
  assert.equal(savedPreferenceIntent.projectPath, 'C:\\Users\\USER\\Desktop\\terminal-chef-clock');
  assert.equal(parseMissionUpdatePreferenceIntent(savedPreferencePrompt, { allowExecutionLanguage: true })?.verbosity, 'verbose');

  const accessPrompt = 'Change this chat to level 4 and build a beauty salon appointment system called Salon Flow.';
  const accessIntent = parseBuildIntent(accessPrompt);
  assert.ok(accessIntent);
  assert.equal(accessIntent.projectName, 'Salon Flow');
  assert.equal(parseNaturalAccessChangeIntent(accessPrompt), '4');
});

test('non-build utility requests still route away from builder', () => {
  assert.equal(parseBuildIntent('include board and canvas links for missions'), null);
  assert.deepEqual(parseMissionUpdatePreferenceIntent('include board and canvas links for missions'), { links: 'both' });

  assert.equal(parseBuildIntent('Yes. Can you give me the Spawner UI localhost?'), null);
  assert.equal(isLocalSparkServiceRequest('Yes. Can you give me the Spawner UI localhost?', ''), true);

  assert.equal(parseBuildIntent('show me the current Spawner/Kanban board'), null);
  assert.equal(parseSpawnerBoardNaturalIntent('show me the current Spawner/Kanban board'), 'board');

  assert.equal(parseBuildIntent('scan my desktop projects'), null);
  assert.equal(isLocalWorkspaceInspectionOnlyRequest('scan my desktop projects'), false);

  assert.equal(parseBuildIntent('can you help me think through whether we should build a mission control dashboard before we touch the canvas?'), null);
});
