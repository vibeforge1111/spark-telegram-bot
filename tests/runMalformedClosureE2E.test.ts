import assert from 'node:assert/strict';
import axios from 'axios';

type AsyncTest = () => Promise<void> | void;

interface CapturedCall {
  url: string;
  body: any;
}

async function test(name: string, fn: AsyncTest): Promise<void> {
  try {
    await fn();
    console.log(`ok - ${name}`);
  } catch (error) {
    console.error(`not ok - ${name}`);
    throw error;
  }
}

const originalPost = axios.post;
const originalGet = axios.get;
const originalEnv = {
  ADMIN_TELEGRAM_IDS: process.env.ADMIN_TELEGRAM_IDS,
  BOT_DEFAULT_TIER: process.env.BOT_DEFAULT_TIER,
  SPARK_AGENT_ACCESS_PROFILE: process.env.SPARK_AGENT_ACCESS_PROFILE,
  SPAWNER_UI_PUBLIC_URL: process.env.SPAWNER_UI_PUBLIC_URL,
  SPAWNER_UI_URL: process.env.SPAWNER_UI_URL
};

function restore(): void {
  (axios as any).post = originalPost;
  (axios as any).get = originalGet;
  for (const [key, value] of Object.entries(originalEnv)) {
    if (value === undefined) delete (process.env as Record<string, string | undefined>)[key];
    else (process.env as Record<string, string>)[key] = value;
  }
}

function makeFakeCtx(chatId: number, fromId: number, messageId: number, replies: string[]) {
  return {
    chat: { id: chatId },
    from: { id: fromId, username: 'cem' },
    message: { message_id: messageId, text: '/run Reply exactly SPARK_QA_NO_EDIT_OK and do not edit files.' },
    update: { update_id: messageId },
    sendChatAction: async (_action: string) => {},
    reply: async (text: string) => replies.push(text)
  };
}

async function run(): Promise<void> {
  await test('/run malformed success without mission id fails with closure proof reason', async () => {
    restore();
    process.env.ADMIN_TELEGRAM_IDS = '8319079055';
    process.env.BOT_DEFAULT_TIER = 'base';
    process.env.SPAWNER_UI_URL = 'http://stub-spawner.test';
    process.env.SPAWNER_UI_PUBLIC_URL = 'http://stub-spawner.test';
    process.env.SPARK_AGENT_ACCESS_PROFILE = 'developer';

    const captured: CapturedCall[] = [];
    (axios as any).post = async (url: string, body: any) => {
      captured.push({ url, body });
      return url.includes('/api/spark/run')
        ? { data: { success: true, requestId: body.requestId, providers: ['codex'] } }
        : { data: { success: true } };
    };
    (axios as any).get = async () => ({ data: { pending: false } });

    const replies: string[] = [];
    const ctx = makeFakeCtx(8319079055, 8319079055, 5571, replies);
    const indexModule: any = await import('../src/index');
    const missionId = await indexModule.handleRunCommand(
      ctx,
      'Reply exactly SPARK_QA_NO_EDIT_OK and do not edit files.',
      ['codex'],
      undefined,
      { allowBuildIntent: true }
    );

    assert.equal(missionId, null);
    assert.ok(captured.some((c) => c.url.includes('/api/spark/run')), 'expected non-build /run to POST to /api/spark/run');
    assert.match(replies.join('\n'), /did not return a mission id/i);
    assert.match(replies.join('\n'), /closure proof/i);
    assert.doesNotMatch(replies.join('\n'), /I will run that through/i);
    assert.doesNotMatch(replies.join('\n'), /internal error/i);
  });
}

run()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(restore);
