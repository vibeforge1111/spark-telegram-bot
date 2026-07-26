import assert from 'node:assert/strict';

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

function fakeCtx(text: string, replies: string[]) {
  const message = { message_id: 9101, text };
  return {
    chat: { id: 8319079055, type: 'private' },
    from: { id: 8319079055, username: 'qa' },
    message,
    update: { update_id: 9101, message },
    sendChatAction: async (_action: string) => {},
    reply: async (reply: string) => {
      replies.push(reply);
    }
  };
}

test('no-execution meta action words bypass Builder bridge detours', async () => {
  process.env.BOT_TOKEN = process.env.BOT_TOKEN || '123:test';
  process.env.ADMIN_TELEGRAM_IDS = '8319079055';
  process.env.SPARK_BOT_TEST_MODE = '1';
  process.env.SPARK_AGENT_ACCESS_PROFILE = 'developer';
  process.env.SPARK_BUILDER_BRIDGE_MODE = 'auto';

  const indexModule: any = await import('../src/index');
  const llmModule = await import('../src/llm');
  const originalChat = llmModule.llm.chat;
  let bridgeCalls = 0;

  indexModule.__setBuilderBridgeRunnerForTest(async () => {
    bridgeCalls += 1;
    return {
      used: true,
      responseText: "I can't search the web right now.\nMy live browser session dropped.",
      decision: 'blocked',
      bridgeMode: 'blocked',
      routingDecision: 'browser_unavailable'
    };
  });
  llmModule.llm.chat = async () => (
    "Those are example words, not commands. I will keep this in chat and won't launch, save, schedule, or run anything."
  );

  try {
    const text = 'TurnIntent live QA: The words build, memory, schedule, provider, run, and Codex are examples only. Do not start, save, schedule, or run anything; answer conversationally in one short reply.';
    const replies: string[] = [];
    await indexModule.handleTextMessage(fakeCtx(text, replies));

    assert.equal(bridgeCalls, 0);
    assert.equal(replies.length, 1);
    assert.match(replies[0], /language evidence, not as the action itself|examples or context|example words, not commands/i);
    assert.doesNotMatch(replies[0], /search the web|browser session/i);
  } finally {
    llmModule.llm.chat = originalChat;
    indexModule.__setBuilderBridgeRunnerForTest(null);
  }
});
