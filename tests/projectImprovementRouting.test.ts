import assert from 'node:assert/strict';
import { parseBuildIntent } from '../src/buildIntent';
import {
  buildProjectImprovementGoal,
  isProjectImprovementRequest
} from '../src/conversationIntent';
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

const reliabilityDesk = {
  chatId: '8319079055',
  userId: '8319079055',
  projectName: 'Mission Control Reliability Desk',
  projectPath: 'C:/Users/USER/.spark/workspaces/mission-1778354076476-mission-control-reliability-desk',
  previewUrl: 'http://127.0.0.1:3333/preview/reliability/index.html',
  missionId: 'mission-1778354076476',
  iteration: 2,
  shippedAt: '2026-05-09T00:00:00Z',
  updatedAt: '2026-05-09T00:00:00Z'
};

test('named polish pass stays attached to the shipped project despite build-intent wording', () => {
  const text = 'build a tiny polish pass for Mission Control Reliability Desk: keep exactly the same five files, do not add features, only improve spacing and visual consistency, and verify MC_RELIABILITY_DESK_OK is still visible';

  assert.ok(parseBuildIntent(text), 'the generic build parser can still see this as build-like wording');
  assert.equal(isProjectImprovementRequest(text, reliabilityDesk), true);

  const goal = buildProjectImprovementGoal(text, reliabilityDesk);
  assert.ok(goal);
  assert.match(goal, /Improve the existing shipped project "Mission Control Reliability Desk"/);
  assert.match(goal, /not a new scaffold/);
  assert.doesNotMatch(goal, /Solo founders/);

  const route = decideNaturalRoute(text, {
    recentMessages: [],
    shippedProject: reliabilityDesk
  });

  assert.equal(route.route, 'project.iteration');
  assert.equal(route.payload.projectName, 'Mission Control Reliability Desk');
  assert.equal(route.payload.projectPath, reliabilityDesk.projectPath);
});

test('explicit shipped-project apply request routes to project iteration', () => {
  const text = "Yes, apply that button rename to the shipped Mission Control Reliability Desk now. Update the existing project only; do not create a new app.";

  assert.equal(isProjectImprovementRequest(text, reliabilityDesk), true);

  const route = decideNaturalRoute(text, {
    recentMessages: [],
    shippedProject: reliabilityDesk
  });

  assert.equal(route.route, 'project.iteration');
  assert.equal(route.owner_system, 'spawner-ui');
  assert.equal(route.payload.projectName, 'Mission Control Reliability Desk');
  assert.equal(route.payload.projectPath, reliabilityDesk.projectPath);
});

test('fresh product-shaped pronoun request is not stolen by shipped project context', () => {
  const text = 'Actually make it a tiny calm focus picker: three moods, a short list of suggested tasks, and a 20 minute timer. Keep it local.';

  const buildIntent = parseBuildIntent(text);
  assert.ok(buildIntent, 'fresh focus picker should still be parseable as a build');
  assert.equal(buildIntent.projectName, 'Calm Focus Picker');
  assert.equal(isProjectImprovementRequest(text, reliabilityDesk), false);

  const route = decideNaturalRoute(text, {
    recentMessages: [
      "I want to make something for planning my day but I don't really know what it should be yet."
    ],
    shippedProject: reliabilityDesk
  });

  assert.equal(route.route, 'spawner.build');
  assert.equal(route.context_source, 'latest_message');
  assert.equal(route.payload.projectName, 'Calm Focus Picker');
});
