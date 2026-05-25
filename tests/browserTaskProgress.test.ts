import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
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

function telegramContext(messageId: number, updateId = 9001): any {
  return {
    chat: { id: 123 },
    from: { id: 456 },
    message: {
      message_id: messageId,
      chat: { id: 123 },
      from: { id: 456 },
      text: '/browser task full http://127.0.0.1:3333/canvas inspect it'
    },
    update: { update_id: updateId }
  };
}

async function main(): Promise<void> {
  const stateDir = await mkdtemp(path.join(os.tmpdir(), 'spark-browser-task-progress-'));
  process.env.SPARK_GATEWAY_STATE_DIR = stateDir;
  const jsonState = await import('../src/jsonState');
  jsonState.resetJsonStateForTests();
  const { shouldSendBrowserTaskStartNotice } = await import('../src/browserTaskProgress');

  try {
    await test('suppresses duplicate browser task start notices for the same Telegram turn', async () => {
      assert.equal(await shouldSendBrowserTaskStartNotice(telegramContext(10), 1000), true);
      assert.equal(await shouldSendBrowserTaskStartNotice(telegramContext(10), 2000), false);
    });

    await test('allows a new browser task start notice for a new Telegram message', async () => {
      assert.equal(await shouldSendBrowserTaskStartNotice(telegramContext(11), 3000), true);
    });

    await test('allows stale browser task start notices after the dedupe ttl', async () => {
      const sixHoursAndChange = 6 * 60 * 60 * 1000 + 1;
      assert.equal(await shouldSendBrowserTaskStartNotice(telegramContext(12), 4000), true);
      assert.equal(await shouldSendBrowserTaskStartNotice(telegramContext(12), 4000 + sixHoursAndChange), true);
    });
  } finally {
    jsonState.resetJsonStateForTests();
    await rm(stateDir, { recursive: true, force: true });
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
