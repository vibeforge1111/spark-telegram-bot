import assert from 'node:assert/strict';
import { mkdtemp } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

async function test(name: string, fn: () => void | Promise<void>): Promise<void> {
  try {
    await fn();
    console.log(`ok - ${name}`);
  } catch (error) {
    console.error(`not ok - ${name}`);
    throw error;
  }
}

async function main(): Promise<void> {
  process.env.SPARK_GATEWAY_STATE_DIR = await mkdtemp(path.join(os.tmpdir(), 'spark-shipped-project-test-'));

  const shippedProjectContext = await import('../src/shippedProjectContext');
  const { buildProjectImprovementGoal, isProjectImprovementRequest } = await import('../src/conversationIntent');

  await test('extracts a shipped workspace from markdown file links', () => {
    const response = [
      'Codex: Built the Mission Control Reliability Desk.',
      '',
      'Files:',
      '- [index.html](C:/Users/USER/.spark/workspaces/mission-1778354076476-mission-control-reliability-desk/index.html)',
      '- [styles.css](C:/Users/USER/.spark/workspaces/mission-1778354076476-mission-control-reliability-desk/styles.css)'
    ].join('\n');

    assert.equal(
      shippedProjectContext.extractProjectPathFromMissionText(response),
      'C:/Users/USER/.spark/workspaces/mission-1778354076476-mission-control-reliability-desk'
    );
  });

  await test('records explicit Mission Control lineage over an older shipped project', async () => {
    await shippedProjectContext.recordShippedProjectFromMission({
      chatId: '8319079055',
      userId: '8319079055',
      missionId: 'mission-loop',
      goal: 'Build a static browser app called Loop Lantern.',
      providerLabel: 'codex',
      response: JSON.stringify({
        summary: 'Built Loop Lantern.',
        project_path: 'C:/Users/USER/.spark/workspaces/loop-lantern',
        preview_url: 'http://127.0.0.1:3333/preview/loop/index.html'
      })
    });

    await shippedProjectContext.recordShippedProjectFromMission({
      chatId: '8319079055',
      userId: '8319079055',
      missionId: 'mission-1778354076476',
      requestId: 'tg-build-8319079055-3709-1778354076476',
      goal: 'Build a polished static browser app called Mission Control Reliability Desk.',
      providerLabel: 'codex',
      response: JSON.stringify({
        summary: 'completed without a text response',
        project_path: 'C:/Users/USER/.spark/workspaces/mission-1778354076476-mission-control-reliability-desk',
        preview_url: 'http://127.0.0.1:3333/preview/reliability/index.html'
      })
    });

    const latest = await shippedProjectContext.getLatestShippedProjectContext('8319079055');
    assert.ok(latest);
    assert.equal(latest.projectName, 'Mission Control Reliability Desk');
    assert.equal(latest.projectPath, 'C:/Users/USER/.spark/workspaces/mission-1778354076476-mission-control-reliability-desk');
    assert.equal(latest.previewUrl, 'http://127.0.0.1:3333/preview/reliability/index.html');
    assert.equal(isProjectImprovementRequest('turn this into Spark style components like spawner-ui', latest), true);

    const improvementGoal = buildProjectImprovementGoal(
      'turn this into Spark style components like spawner-ui',
      latest,
      ['Spark has the build ready.', 'User is reviewing Mission Control Reliability Desk.']
    );
    assert.ok(improvementGoal);
    assert.match(improvementGoal, /Mission Control Reliability Desk/);
    assert.match(improvementGoal, /mission-1778354076476-mission-control-reliability-desk/);
    assert.doesNotMatch(improvementGoal, /Loop Lantern/);
  });
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
