import assert from 'node:assert/strict';
import { conversation } from '../src/conversation';

function test(name: string, fn: () => Promise<void> | void): Promise<void> {
  return Promise.resolve()
    .then(fn)
    .then(
      () => {
        console.log(`ok - ${name}`);
      },
      (error) => {
        console.error(`not ok - ${name}`);
        throw error;
      }
    );
}

function makeFakeCtx(chatId: number, fromId: number, messageId: number, replies: string[]) {
  return {
    chat: { id: chatId },
    from: { id: fromId, username: 'cem' },
    message: { message_id: messageId, text: '' },
    update: { update_id: messageId },
    sendChatAction: async (_action: string) => {},
    reply: async (text: string) => {
      replies.push(text);
    }
  };
}

async function run(): Promise<void> {
  await test('routes Spark CLI install checks to supported Windows commands', async () => {
    process.env.BOT_TOKEN = process.env.BOT_TOKEN || '123:test';
    process.env.SPARK_BOT_TEST_MODE = '1';
    process.env.SPARK_BUILDER_BRIDGE_MODE = 'off';
    process.env.SPARK_AGENT_ACCESS_PROFILE = 'developer';

    const replies: string[] = [];
    const ctx = makeFakeCtx(8319079055, 8319079055, 901, replies);
    ctx.message.text = 'Help me check whether my Spark CLI install is working on Windows. Tell me the exact next command.';

    const indexModule: any = await import('../src/index');
    await indexModule.handleTextMessage(ctx);

    const reply = replies[0] || '';
    assert.match(reply, /`spark status`/);
    assert.match(reply, /`spark doctor`/);
    assert.match(reply, /`spark verify --onboarding`/);
    assert.match(reply, /better proof than `spark --version`/);
    assert.match(reply, /does not prove your Windows PATH is broken/);
    assert.doesNotMatch(reply, /Use `spark --version`/);
  });

  await test('uses the recent context when the user pastes the failing output', async () => {
    process.env.BOT_TOKEN = process.env.BOT_TOKEN || '123:test';
    process.env.SPARK_BOT_TEST_MODE = '1';
    process.env.SPARK_BUILDER_BRIDGE_MODE = 'off';
    process.env.SPARK_AGENT_ACCESS_PROFILE = 'developer';

    const chatId = 8319079056;
    const user = { id: chatId, username: 'cem' };
    await conversation.remember(user, 'Help me check whether my Spark CLI install is working on Windows. Tell me the exact next command.');

    const replies: string[] = [];
    const ctx = makeFakeCtx(chatId, chatId, 902, replies);
    ctx.message.text = [
      'PS C:\\Users\\BUY-PC COMPUTERS> spark --version',
      'usage: spark [-h]',
      'spark: error: the following arguments are required: command'
    ].join('\n');

    const indexModule: any = await import('../src/index');
    await indexModule.handleTextMessage(ctx);

    const reply = replies[0] || '';
    assert.match(reply, /`spark status`/);
    assert.match(reply, /`spark doctor`/);
    assert.match(reply, /`spark verify --onboarding`/);
    assert.match(reply, /better proof than `spark --version`/);
    assert.match(reply, /does not prove your Windows PATH is broken/);
  });
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
