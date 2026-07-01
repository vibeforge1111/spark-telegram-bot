import assert from 'node:assert/strict';
import {
  isLiveSparkHealthQuestion,
  shouldAnswerSparkRepairRequest
} from '../src/runtimeRouteGuards';

function test(name: string, fn: () => void): void {
  try {
    fn();
    console.log(`ok - ${name}`);
  } catch (error) {
    console.error(`not ok - ${name}`);
    throw error;
  }
}

test('routes explicit Spark repair requests to the repair gate', () => {
  assert.equal(shouldAnswerSparkRepairRequest('Spark is unhealthy, fix it.'), true);
  assert.equal(shouldAnswerSparkRepairRequest('Telegram is down, repair it.'), true);
  assert.equal(shouldAnswerSparkRepairRequest('Can we design a repair architecture for Spark?'), false);
  assert.equal(shouldAnswerSparkRepairRequest('Fix the spacing on the app.'), false);
});

test('routes fresh Spark health questions to live diagnostics', () => {
  assert.equal(isLiveSparkHealthQuestion('Can you check Spark health?'), true);
  assert.equal(isLiveSparkHealthQuestion('Check whether Spark is healthy, but do not repair anything.'), true);
  assert.equal(isLiveSparkHealthQuestion('Do not repair anything. Is a repair needed from the current status?'), true);
  assert.equal(isLiveSparkHealthQuestion('Earlier you said Spawner was down. What does fresh live state say right now?'), true);
  assert.equal(isLiveSparkHealthQuestion('Show raw live details for Spark right now.'), false);
  assert.equal(isLiveSparkHealthQuestion('How should we design health architecture for Spark?'), false);
  assert.equal(
    isLiveSparkHealthQuestion(
      "Build a practical Harness Release Ops Mission Board for tonight's installer work. Use Spawner. Make it track authority gates, runtime health, Telegram proof, registry pin drift, rollback steps, open blockers, and the next QA queue. Include tests and a simple README. This is the live retest after polling repair; build it now."
    ),
    false
  );
});

test('does not treat health inside a build target as a live health question', () => {
  const originalRoot = process.env.SPARK_PROJECT_ROOT;
  process.env.SPARK_PROJECT_ROOT = String.raw`C:\Dev\projects`;
  try {
    const prompt = String.raw`Continue mission-1780080376626, but do not make another dashboard-only prototype. Build the real backend for the Telegram group scoring bot. Create a full local project at: C:\Dev\projects\telegram-health-bot Include API routes, persistence, scoring logic, and a runnable local setup.`;

    assert.equal(isLiveSparkHealthQuestion(prompt), false);
    assert.equal(shouldAnswerSparkRepairRequest(prompt), false);
  } finally {
    if (originalRoot === undefined) delete process.env.SPARK_PROJECT_ROOT;
    else process.env.SPARK_PROJECT_ROOT = originalRoot;
  }
});
