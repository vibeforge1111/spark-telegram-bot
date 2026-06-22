import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import axios from 'axios';

type AsyncTest = () => Promise<void> | void;

async function test(name: string, fn: AsyncTest): Promise<void> {
  try {
    await fn();
    console.log(`ok - ${name}`);
  } catch (error) {
    console.error(`not ok - ${name}`);
    throw error;
  }
}

function fakeCtx(text: string, replies: string[], replyExtras: any[]): any {
  const user = { id: 1000000001, is_bot: false, first_name: 'SpawnerTrace', username: 'spawner_trace' };
  const chat = { id: 1000000001, type: 'private', first_name: 'SpawnerTrace', username: 'spawner_trace' };
  return {
    update: {
      update_id: 1,
      message: {
        message_id: 1,
        date: Math.floor(Date.now() / 1000),
        chat,
        from: user,
        text
      }
    },
    from: user,
    chat,
    message: {
      message_id: 1,
      date: Math.floor(Date.now() / 1000),
      chat,
      from: user,
      text
    },
    sendChatAction: async () => undefined,
    reply: async (reply: unknown, extra?: any) => {
      replies.push(String(reply ?? ''));
      replyExtras.push(extra);
      return { message_id: replies.length + 1 };
    },
    telegram: {
      sendMessage: async (_chatId: unknown, reply: unknown, extra?: any) => {
        replies.push(String(reply ?? ''));
        replyExtras.push(extra);
        return { message_id: replies.length + 1 };
      }
    }
  };
}

const tempRoot = mkdtempSync(path.join(os.tmpdir(), 'spark-spawner-board-trace-'));
const originalAxiosGet = axios.get;

process.env.SPARK_SKIP_ENV_OVERRIDE = '1';
process.env.SPARK_BOT_TEST_MODE = '1';
process.env.BOT_TOKEN = '0:spawner-board-trace-test';
process.env.ADMIN_TELEGRAM_IDS = '1000000001';
process.env.ALLOWED_TELEGRAM_IDS = '1000000001';
process.env.SPARK_HOME = tempRoot;
process.env.SPARK_GATEWAY_STATE_DIR = tempRoot;
process.env.SPARK_AGENT_ACCESS_PROFILE = 'builder';
process.env.SPARK_AGENT_PERSONA_BUILDER_SYNC = '0';
process.env.SPARK_BUILDER_BRIDGE_MODE = 'off';
process.env.SPARK_TELEGRAM_CHAT_STREAMING = '0';

process.on('exit', () => {
  (axios as any).get = originalAxiosGet;
  try {
    rmSync(tempRoot, { recursive: true, force: true });
  } catch {
    // Best-effort cleanup; a locked SQLite handle should not fail this test.
  }
});

async function main(): Promise<void> {
  await test('natural Spawner preview read carries outbound trace metadata', async () => {
    const now = Date.now();
    (axios as any).get = async (url: string) => {
      assert.match(url, /\/api\/mission-control\/board$/);
      return {
        data: {
          board: {
            running: [],
            paused: [],
            completed: [
              {
                missionId: 'mission-trace-preview',
                missionName: 'Trace Preview App',
                status: 'completed',
                lastEventType: 'mission_completed',
                lastUpdated: new Date(now).toISOString(),
                lastSummary: 'Done',
                taskName: 'Ship preview',
                providerSummary: 'Codex: Replaced the root screen with Trace Preview App in src/routes/+page.svelte.'
              }
            ],
            failed: [],
            created: []
          }
        }
      };
    };

    const indexModule = await import('../src/index');
    const replies: string[] = [];
    const extras: any[] = [];

    await indexModule.handleTextMessage(fakeCtx('no the localhost for the beauty centre', replies, extras));

    assert.equal(replies.length, 1);
    assert.match(replies[0], /Here is the latest shipped app/i);
    assert.match(replies[0], /Trace Preview App/);
    assert.deepEqual(extras[0]?.__sparkTraceContext, {
      turnId: 'telegram-update:1',
      telegramUpdateId: 1,
      route: 'spawner.board/latest_project_preview',
      command: 'spawner.board_read',
      replyKind: 'spawner_board_read.latest_project_preview'
    });
  });
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => {
    (axios as any).get = originalAxiosGet;
  });
