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
  chatId: '1000000001',
  userId: '1000000001',
  projectName: 'Mission Control Reliability Desk',
  projectPath: 'C:/Users/USER/.spark/workspaces/mission-1778354076476-mission-control-reliability-desk',
  previewUrl: 'http://127.0.0.1:3333/preview/reliability/index.html',
  missionId: 'mission-1778354076476',
  iteration: 2,
  shippedAt: '2026-05-09T00:00:00Z',
  updatedAt: '2026-05-09T00:00:00Z'
};

test('named polish pass stays attached to the shipped project despite build-intent wording', () => {
  const text = 'can we make one tiny polish pass on Mission Control Reliability Desk: keep exactly the same five files, do not add features, only improve spacing and visual consistency, and verify MC_RELIABILITY_DESK_OK is still visible';

  assert.equal(parseBuildIntent(text), null, 'polish wording without a target path is no longer a standalone build');
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
