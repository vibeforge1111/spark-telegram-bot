import assert from 'node:assert/strict';

process.env.SPARK_BOT_TEST_MODE = '1';
process.env.BOT_TOKEN = process.env.BOT_TOKEN || '123:test';
process.env.TELEGRAM_RELAY_SECRET = process.env.TELEGRAM_RELAY_SECRET || 'group-media-addressing-test-relay-secret-123456';
process.env.SPARK_BUILDER_BRIDGE_MODE = 'off';

async function run(): Promise<void> {
  const { handleImageMessage, handleVoiceMessage } = await import('../src/index');
  const { conversation } = await import('../src/conversation');
  const botInfo = { id: 42, username: 'SparkTestBot' };
  let remembered = false;
  const originalRemember = conversation.remember.bind(conversation);
  const originalGetRecent = conversation.getRecentMessages.bind(conversation);
  (conversation as any).remember = async () => { remembered = true; };
  (conversation as any).getRecentMessages = async () => [];

  function ctxFor(chatType: string, message: Record<string, unknown>): any {
    return {
      chat: { type: chatType, id: 999 },
      from: { id: 7, username: 'member' },
      botInfo,
      message,
      update: { message },
      reply: async () => {},
      sendChatAction: async () => {},
      telegram: { sendChatAction: async () => {} }
    };
  }

  async function proceeds(handler: (ctx: any) => Promise<void>, ctx: any): Promise<boolean> {
    remembered = false;
    try { await handler(ctx); } catch { /* Later media steps are outside this boundary test. */ }
    return remembered;
  }

  try {
    assert.equal(await proceeds(handleImageMessage, ctxFor('supergroup', { photo: [{ file_id: 'a' }], caption: '' })), false);
    assert.equal(await proceeds(handleVoiceMessage, ctxFor('supergroup', { voice: { file_id: 'b' } })), false);
    assert.equal(await proceeds(handleImageMessage, ctxFor('private', { photo: [{ file_id: 'a' }], caption: '' })), true);
    assert.equal(
      await proceeds(handleImageMessage, ctxFor('supergroup', { photo: [{ file_id: 'a' }], caption: '@SparkTestBot look at this' })),
      true
    );
    console.log('ok - group media handlers only act when Spark is addressed');
  } finally {
    (conversation as any).remember = originalRemember;
    (conversation as any).getRecentMessages = originalGetRecent;
  }
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
