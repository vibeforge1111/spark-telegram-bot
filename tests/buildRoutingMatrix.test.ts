import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { parseBuildIntent } from '../src/buildIntent';
import { evaluateDeterministicRoute } from '../src/routeFirewall';
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

Include the Mission board and canvas links when they are useful.`, 'Beauty Booking Room');

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
  const mazePrototypePrompt = 'Create a tiny maze game plan and build only a minimal playable prototype. Use a short PRD if needed, keep it fast, and show me the Mission Control links as it moves through planning, build, and completion.';
  const mazePrototypeIntent = parseBuildIntent(mazePrototypePrompt);
  assert.ok(mazePrototypeIntent);
  assert.equal(mazePrototypeIntent.projectName, 'Tiny Maze Game');
  assert.equal(evaluateDeterministicRoute('spawner.build', mazePrototypePrompt).allow, true);

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

test('mission titles stay readable for simple game and path-derived builds', () => {
  assert.equal(parseBuildIntent("let's build a maze game")?.projectName, 'Maze Game');
  assert.equal(parseBuildIntent("let's build a game now for now Spark")?.projectName, 'Spark Game');
  assert.equal(parseBuildIntent('lets build something Spark')?.projectName, 'Spark App');
  assert.equal(
    parseBuildIntent(
      'Create a tiny maze game plan and build only a minimal playable prototype. Use a short PRD if needed, keep it fast, and show Mission Control links as it moves through planning, build, and completion.'
    )?.projectName,
    'Tiny Maze Game'
  );
  assert.equal(
    parseBuildIntent('Save mission updates as verbose and build this at C:\\Users\\USER\\Desktop\\terminal-chef-clock: a clock for terminal devs who cook.')?.projectName,
    'Terminal Chef Clock'
  );
});

test('non-build utility requests still route away from builder', () => {
  assert.equal(parseBuildIntent('include board and canvas links for missions'), null);
  assert.deepEqual(parseMissionUpdatePreferenceIntent('include board and canvas links for missions'), { links: 'both' });

  assert.equal(parseBuildIntent('Yes. Can you give me the Spawner UI localhost?'), null);
  assert.equal(isLocalSparkServiceRequest('Yes. Can you give me the Spawner UI localhost?', ''), true);

  assert.equal(parseBuildIntent('show me the current Spawner/Kanban board'), null);
  assert.equal(parseSpawnerBoardNaturalIntent('show me the current Spawner/Kanban board'), 'board');
  assert.equal(parseBuildIntent('what is currently running or paused in Mission Control? keep it short and do not start anything.'), null);
  assert.equal(parseSpawnerBoardNaturalIntent('what is currently running or paused in Mission Control? keep it short and do not start anything.'), 'active_missions');
  assert.equal(parseBuildIntent('Is anything still running? Do not start anything.'), null);
  assert.equal(parseSpawnerBoardNaturalIntent('Is anything still running? Do not start anything.'), 'active_missions');
  assert.equal(parseBuildIntent('Is anything active right now? Do not start anything.'), null);
  assert.equal(parseSpawnerBoardNaturalIntent('Is anything active right now? Do not start anything.'), 'active_missions');
  assert.equal(parseBuildIntent('Anything paused? Do not start anything.'), null);
  assert.equal(parseSpawnerBoardNaturalIntent('Anything paused? Do not start anything.'), 'active_missions');

  assert.equal(parseBuildIntent('scan my desktop projects'), null);
  assert.equal(isLocalWorkspaceInspectionOnlyRequest('scan my desktop projects'), false);

  assert.equal(parseBuildIntent('can you help me think through whether we should build a mission control dashboard before we touch the canvas?'), null);
  assert.equal(parseBuildIntent('Give me three build ideas for a memory dashboard'), null);
  assert.equal(parseBuildIntent('suggest two project directions for a context tester'), null);
  assert.equal(
    parseBuildIntent(
      'sure, lets make today also about improving your capabilities of action taking and improving yourself while talking together, for example can you install a voice to yourself right now?'
    ),
    null
  );
  assert.equal(
    parseBuildIntent('lets make today about improving your capabilities\u2026 can you install a voice to yourself?'),
    null
  );
  assert.equal(parseBuildIntent('lets make this chat about improving Spark in convos'), null);
  assert.equal(parseBuildIntent('make this better with benchmarks and autoloops'), null);
  assert.equal(parseBuildIntent('make this more Spark colored'), null);
  assert.equal(parseBuildIntent('make Spark read my emails as a new capability'), null);
  assert.equal(parseBuildIntent('make my Spark read my emails as a new capability'), null);
  assert.equal(parseBuildIntent('make your brain handle my workflow differently'), null);
  assert.equal(parseBuildIntent('make daily reports of my memories work differently'), null);
  assert.equal(parseBuildIntent("Okay let's build this for you, Spark: a way to read my emails and summarize them."), null);
  assert.equal(parseBuildIntent("Let's build you an email reader so you can summarize my inbox."), null);
  assert.equal(parseBuildIntent('Create a capability for Spark to read my calendar.'), null);
  assert.equal(parseBuildIntent('Build a skill that lets you browse my project files.'), null);
  assert.equal(
    parseBuildIntent('Run a safe Level 5 smoke test: create a tiny file at C:\\Users\\USER\\AppData\\Local\\Temp\\spark-telegram-level5-smoke.txt, write "level5 ok", read it back, then delete it. Do not touch anything else. Tell me each step.'),
    null
  );
  assert.equal(
    parseBuildIntent('Check whether C:\\Users\\USER\\Desktop exists. If it exists, list only the first 5 top-level folder names. Do not open files or read file contents.'),
    null
  );
  assert.equal(
    parseBuildIntent('also words like build access and some other things hijack the chat instantly, can you check whether we fixed that'),
    null
  );
  assert.equal(
    parseBuildIntent('how can we make sure that access level 4 does create the right setup for access level to be really 4'),
    null
  );
  assert.equal(parseBuildIntent('keep it simple can we make sure that access level 4 gets the access level 4'), null);
  assert.equal(parseBuildIntent('is this the best way to create a sandbox are you sure'), null);
  assert.equal(
    parseBuildIntent('How should local workspace access, Docker build, and tests fit into the AOC design?'),
    null
  );
  assert.equal(
    parseBuildIntent('And can we actually make access level 4 basically something with more sandboxes and stuff like that and access 5 is basically operating the whole computer?'),
    null
  );
  assert.equal(
    parseBuildIntent(
      'nice is there any other thing that would be healthy to build for updates/upgrades besides this or should this be the first major focus, and do you have a way to update yourself directly from here'
    ),
    null
  );
  assert.equal(parseBuildIntent('what else would be healthy to build for updates/upgrades besides the ledger'), null);
  assert.equal(parseBuildIntent("what would you wanna be building now that's missing"), null);
  assert.equal(parseBuildIntent('besides these anything else before we start building these'), null);
  assert.ok(parseBuildIntent('make a daily report dashboard for investors'));
  assert.ok(parseBuildIntent('Build a private local-first dashboard for memory reports'));
  assert.ok(parseBuildIntent('Build a Spark memory dashboard.'));
  assert.ok(parseBuildIntent('Build a tool for Spark users to manage reminders.'));
});

test('text handler checks latest-project iteration before generic build intent', () => {
  const indexSource = fs.readFileSync(path.join(__dirname, '..', 'src', 'index.ts'), 'utf8');
  const projectIterationIndex = indexSource.indexOf('isProjectImprovementRequest(text, latestShippedProject)');
  const genericBuildIndex = indexSource.indexOf('if (buildIntent) {', projectIterationIndex);

  assert.ok(projectIterationIndex > 0, 'expected latest-project iteration guard in text handler');
  assert.ok(genericBuildIndex > projectIterationIndex, 'latest-project iteration must beat broad parseBuildIntent matches');
});
