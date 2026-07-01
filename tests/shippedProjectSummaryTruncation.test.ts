import assert from 'node:assert/strict';
import { mkdtemp } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

async function test(name: string, fn: () => Promise<void>): Promise<void> {
  try {
    await fn();
    console.log(`ok - ${name}`);
  } catch (error) {
    console.error(`not ok - ${name}`);
    throw error;
  }
}

void (async () => {
  process.env.SPARK_GATEWAY_STATE_DIR = await mkdtemp(path.join(os.tmpdir(), 'spark-shipped-summary-test-'));
  const shippedProjectContext = await import('../src/shippedProjectContext');

  await test('marks shipped project summaries that are truncated', async () => {
    const longSummary = `Built the long summary project. ${Array.from({ length: 90 }, (_, index) => `detail ${index + 1}`).join(', ')}`;
    await shippedProjectContext.recordShippedProjectFromMission({
      chatId: 'summary-chat',
      userId: 'summary-user',
      missionId: 'mission-long-summary',
      goal: 'Build a static browser app called Long Summary Desk.',
      providerLabel: 'codex',
      response: JSON.stringify({
        summary: longSummary,
        project_path: 'C:/Users/USER/.spark/workspaces/long-summary-desk',
        preview_url: 'http://127.0.0.1:3333/preview/summary/index.html'
      })
    });

    const latest = await shippedProjectContext.getLatestShippedProjectContext('summary-chat');
    assert.ok(latest?.summary);
    assert.match(latest.summary, /\[truncated\]$/);
  });
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
