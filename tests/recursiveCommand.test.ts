import assert from 'node:assert/strict';

process.env.SPARK_BOT_TEST_MODE = '1';
process.env.BOT_TOKEN = process.env.BOT_TOKEN || '0:telegram-recursive-command-test';
process.env.ADMIN_TELEGRAM_IDS = '8319079055';
process.env.TELEGRAM_RELAY_SECRET = process.env.TELEGRAM_RELAY_SECRET || 'recursive-command-test-relay-secret-1234567890';

async function test(name: string, fn: () => Promise<void> | void): Promise<void> {
  try {
    await fn();
    console.log(`ok - ${name}`);
  } catch (error) {
    console.error(`not ok - ${name}`);
    throw error;
  }
}

function fakeCtx(text: string): any {
  const replies: string[] = [];
  return {
    replies,
    from: { id: 8319079055 },
    chat: { id: 8319079055 },
    message: { text },
    reply: async (message: string) => {
      replies.push(message);
    },
    telegram: {
      sendChatAction: async () => {},
      sendMessage: async (_chatId: number, message: string) => {
        replies.push(message);
      }
    }
  };
}

async function main(): Promise<void> {
  const { handleRecursiveCommand } = await import('../src/index');

  await test('recursive command export renders help through command path', async () => {
    const ctx = fakeCtx('/recursive help');
    await handleRecursiveCommand(ctx);
    assert.match(ctx.replies.join('\n'), /\/recursive start <chipKey> \[rounds <n>\]/);
  });

  await test('recursive command export validates start usage through command path', async () => {
    const ctx = fakeCtx('/recursive start');
    await handleRecursiveCommand(ctx);
    assert.equal(ctx.replies[0], 'Usage: /recursive start <chipKey> [rounds <n>]');
  });
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
