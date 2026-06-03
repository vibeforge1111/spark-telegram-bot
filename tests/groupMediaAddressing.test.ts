import assert from 'node:assert/strict';

// Regression test for TB-3: in group chats the photo and voice handlers replied
// to every member's media because they lacked the isAddressedGroupText guard
// that handleTextMessage already has (added by #276, which covered text only).
// We detect whether a handler proceeds past the guard by spying
// conversation.remember (the first thing both handlers do after the guard).
// FAILS on buggy code (remember runs for an unaddressed group photo/voice),
// PASSES once the guard short-circuits unaddressed group media.

process.env.SPARK_BOT_TEST_MODE = '1';
process.env.BOT_TOKEN = process.env.BOT_TOKEN || '123:test';
process.env.TELEGRAM_RELAY_SECRET = process.env.TELEGRAM_RELAY_SECRET || 'group-media-addressing-test-relay-secret-123456';
process.env.SPARK_BUILDER_BRIDGE_MODE = 'off';

async function run(): Promise<void> {
  const { handleImageMessage, handleVoiceMessage } = await import('../src/index');
  const { conversation } = await import('../src/conversation');

  const botInfo = { id: 42, username: 'Tb3TestBot' };
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
      replyWithChatAction: async () => {},
      telegram: { sendChatAction: async () => {} },
    };
  }

  async function proceeds(handler: (ctx: any) => Promise<void>, ctx: any): Promise<boolean> {
    remembered = false;
    try { await handler(ctx); } catch { /* later media/bridge steps may throw; the spy already recorded */ }
    return remembered;
  }

  try {
    // Unaddressed group media must be ignored (handler returns before remember).
    assert.equal(
      await proceeds(handleImageMessage, ctxFor('supergroup', { photo: [{ file_id: 'a' }], caption: '' })),
      false,
      'group photo NOT addressing Spark must be ignored'
    );
    assert.equal(
      await proceeds(handleVoiceMessage, ctxFor('supergroup', { voice: { file_id: 'b' } })),
      false,
      'group voice note NOT addressing Spark must be ignored'
    );

    // Private chats must always be handled (guard returns true for non-groups).
    assert.equal(
      await proceeds(handleImageMessage, ctxFor('private', { photo: [{ file_id: 'a' }], caption: '' })),
      true,
      'private photo must be processed'
    );

    // A group photo whose caption addresses the bot must be handled.
    assert.equal(
      await proceeds(handleImageMessage, ctxFor('supergroup', { photo: [{ file_id: 'a' }], caption: '@Tb3TestBot look at this' })),
      true,
      'addressed group photo must be processed'
    );

    console.log('ok - group photo/voice handlers only act when Spark is addressed');
  } finally {
    (conversation as any).remember = originalRemember;
    (conversation as any).getRecentMessages = originalGetRecent;
  }
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
