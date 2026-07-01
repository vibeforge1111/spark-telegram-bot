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
