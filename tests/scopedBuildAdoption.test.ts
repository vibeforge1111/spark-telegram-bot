import assert from 'node:assert/strict';
import { parseBuildIntent } from '../src/buildIntent';
import { decideNaturalRoute } from '../src/naturalRouteDecision';
import {
  isLiveSparkHealthQuestion,
  shouldAnswerSparkRepairRequest
} from '../src/runtimeRouteGuards';

const originalProjectRoot = process.env.SPARK_PROJECT_ROOT;
process.env.SPARK_PROJECT_ROOT = String.raw`C:\Dev\projects`;

function test(name: string, fn: () => void): void {
  try {
    fn();
    console.log(`ok - ${name}`);
  } catch (error) {
    console.error(`not ok - ${name}`);
    throw error;
  }
}

function assertBuild(prompt: string, expectedName: string): void {
  const intent = parseBuildIntent(prompt);
  assert.ok(intent, prompt);
  assert.equal(intent.projectName, expectedName, prompt);
  assert.equal(decideNaturalRoute(prompt).route, 'spawner.build', prompt);
  assert.equal(isLiveSparkHealthQuestion(prompt), false, prompt);
  assert.equal(shouldAnswerSparkRepairRequest(prompt), false, prompt);
}

try {
  test('PR #498 keeps a narrow old-artifact rejection while executing the fresh backend', () => {
    assertBuild(
      String.raw`Continue mission-1780080376626, but do not make another dashboard-only prototype. Build the real backend for the Telegram group scoring bot. Create a full local project at: C:\Dev\projects\telegram-health-bot Include API routes, persistence, scoring logic, and a runnable local setup.`,
      'Telegram Health Bot'
    );
  });

  test('PR #315 multiline donor brief remains one build payload', () => {
    const prompt = String.raw`Continue mission-1780080376626, but do not make another dashboard-only prototype.

Build the real backend for the Telegram group health scoring bot.

Create a full local project at:
C:\Dev\projects\telegram-health-bot

Required stack:
- Node.js + TypeScript
- Telegraf Telegram bot
- Express local API
- SQLite local database

Do not use placeholder-only implementation. Include runnable code and tests or smoke scripts.`;
    assertBuild(prompt, 'Telegram Health Bot');
    const intent = parseBuildIntent(prompt);
    assert.ok(intent);
    assert.match(intent.prd, /Required stack:/i);
    assert.doesNotMatch(intent.prd, /dashboard-only prototype/i);
  });

  test('distinct replacement artifacts are actionable', () => {
    assertBuild(
      String.raw`Do not build a mobile app. Build a web dashboard called Signal Desk at: C:\Dev\projects\signal-desk. Include tests.`,
      'Signal Desk'
    );
    assertBuild(
      String.raw`Don't change the old dashboard. Create a new API service called Signal API at: C:\Dev\projects\signal-api. Include persistence and tests.`,
      'Signal API'
    );
  });

  test('broad, same-target, and terminal prohibitions still fail closed', () => {
    const blocked = [
      'Do not build anything. Build a dashboard called Unsafe Desk.',
      'Build a dashboard called Signal Desk. Do not build it.',
      'Do not change the old dashboard. Build the dashboard now.',
      'Build a local API called Hold Point, but wait for my approval before starting it.',
      'Example prompt: Build a dashboard called Quoted Desk.',
      'The ticket says: build a dashboard called Reported Desk.'
    ];
    for (const prompt of blocked) {
      assert.equal(parseBuildIntent(prompt), null, prompt);
      assert.notEqual(decideNaturalRoute(prompt).route, 'spawner.build', prompt);
    }
  });

  test('health-named builds route to Spawner while real health reads remain reads', () => {
    const buildPrompt = String.raw`Do not build a mobile app. Build a backend health API called Runtime Health at: C:\Dev\projects\runtime-health. Include tests.`;
    assertBuild(buildPrompt, 'Runtime Health');
    assert.equal(isLiveSparkHealthQuestion('Check Spark health right now.'), true);
    assert.equal(parseBuildIntent('Check Spark health right now.'), null);
  });
} finally {
  if (originalProjectRoot === undefined) delete process.env.SPARK_PROJECT_ROOT;
  else process.env.SPARK_PROJECT_ROOT = originalProjectRoot;
}
