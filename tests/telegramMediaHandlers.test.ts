import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

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

function fakeMediaCtx(input: {
  userId: number;
  messageId: number;
  message: Record<string, unknown>;
  replies: string[];
}) {
  const message = { message_id: input.messageId, ...input.message };
  return {
    chat: { id: input.userId, type: 'private' },
    from: { id: input.userId, username: `qa${input.userId}` },
    message,
    update: { update_id: input.messageId, message },
    sendChatAction: async (_action: string) => {},
    reply: async (reply: string) => {
      input.replies.push(reply);
    },
    replyWithVoice: async () => {
      throw new Error('voice delivery was not expected');
    },
    replyWithAudio: async () => {
      throw new Error('audio delivery was not expected');
    }
  };
}

void (async () => {
  await test('read-only media handlers do not persist local user memory', async () => {
    const tempRoot = mkdtempSync(path.join(os.tmpdir(), 'spark-media-handler-memory-'));
    process.env.BOT_TOKEN = process.env.BOT_TOKEN || '123:test';
    process.env.ADMIN_TELEGRAM_IDS = '1000000001,1000000056';
    process.env.SPARK_BOT_TEST_MODE = '1';
    process.env.SPARK_AGENT_ACCESS_PROFILE = 'developer';
    process.env.SPARK_GATEWAY_STATE_DIR = tempRoot;

    const indexModule: any = await import('../src/index');
    const conversationModule = await import('../src/conversation');
    const jsonStateModule = await import('../src/jsonState');

    indexModule.__setBuilderBridgeRunnerForTest(async (update: Record<string, unknown>) => {
      const message = update.message && typeof update.message === 'object'
        ? update.message as Record<string, unknown>
        : {};
      const hasVoice = Boolean(message.voice || message.audio);
      return {
        used: true,
        responseText: hasVoice ? 'Voice analysis only.' : 'Image analysis only.',
        decision: hasVoice ? 'media.voice' : 'media.image',
        bridgeMode: 'test',
        routingDecision: hasVoice ? 'media.voice' : 'media.image'
      };
    });

    try {
      const imageReplies: string[] = [];
      const imageCtx = fakeMediaCtx({
        userId: 1000000001,
        messageId: 9201,
        replies: imageReplies,
        message: {
          caption: 'private launch dashboard',
          photo: [{ file_id: 'photo-1', width: 1, height: 1 }]
        }
      });
      await indexModule.handleImageMessage(imageCtx);
      const imageRecent = await conversationModule.conversation.getRecentMessages(imageCtx.from, 10);
      const imageTurns = await conversationModule.conversation.getRecentTurns(imageCtx.from, 10);

      assert.deepEqual(imageReplies, ['Image analysis only.']);
      assert.ok(!imageRecent.some((line: string) => line.includes('[image] private launch dashboard')));
      assert.ok(imageTurns.some((turn: { role: string; text: string }) => turn.role === 'assistant' && turn.text === 'Image analysis only.'));

      const voiceReplies: string[] = [];
      const voiceCtx = fakeMediaCtx({
        userId: 1000000056,
        messageId: 9202,
        replies: voiceReplies,
        message: {
          caption: 'private hiring note',
          voice: { file_id: 'voice-1', mime_type: 'audio/ogg' }
        }
      });
      await indexModule.handleVoiceMessage(voiceCtx);
      const voiceRecent = await conversationModule.conversation.getRecentMessages(voiceCtx.from, 10);
      const voiceTurns = await conversationModule.conversation.getRecentTurns(voiceCtx.from, 10);

      assert.deepEqual(voiceReplies, ['Voice analysis only.']);
      assert.ok(!voiceRecent.some((line: string) => line.includes('[voice] private hiring note')));
      assert.ok(voiceTurns.some((turn: { role: string; text: string }) => turn.role === 'assistant' && turn.text === 'Voice analysis only.'));
    } finally {
      indexModule.__setBuilderBridgeRunnerForTest(null);
      jsonStateModule.resetJsonStateForTests();
      rmSync(tempRoot, { recursive: true, force: true });
    }
  });
})();
