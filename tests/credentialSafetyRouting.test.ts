import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

async function main(): Promise<void> {
  const stateDir = mkdtempSync(path.join(tmpdir(), 'spark-credential-routing-'));
  process.env.SPARK_GATEWAY_STATE_DIR = stateDir;
  process.env.TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || '123456:test-token-for-local-routing';
  process.env.TELEGRAM_INTENT_GATE_V2_MODE = 'off';

  try {
    const { conversation } = require('../src/conversation') as typeof import('../src/conversation');
    const { handleRememberCommand, handleTextMessage } = require('../src/index') as typeof import('../src/index');
    const user = { id: 72345, first_name: 'Credential Route QA' };

    const slashReplies: string[] = [];
    await handleRememberCommand({
      from: user,
      chat: { id: 72345, type: 'private' },
      message: { text: '/remember my password is sunshine123' },
      reply: async (text: string) => { slashReplies.push(text); }
    });
    assert.equal(slashReplies.length, 1);
    assert.match(slashReplies[0], /won't store/i);
    assert.doesNotMatch(slashReplies[0], /sunshine123/i);

    const setupReplies: string[] = [];
    const setupText = 'How do I set up my OpenAI API key in Spark?';
    await handleTextMessage({
      from: user,
      chat: { id: 72345, type: 'private' },
      message: { text: setupText },
      update: { message: { text: setupText, from: user, chat: { id: 72345, type: 'private' } } },
      reply: async (text: string) => { setupReplies.push(text); }
    });
    assert.equal(setupReplies.length, 1);
    assert.match(setupReplies[0], /spark setup/i);
    assert.doesNotMatch(setupReplies[0], /spark credentials (?:set|list|delete)/i);

    const plainReplies: string[] = [];
    const plainText = 'Please save my API key: sk-ant-api03-abcdefghijklmnopqrstuvwxyz';
    await handleTextMessage({
      from: user,
      chat: { id: 72345, type: 'private' },
      message: { text: plainText },
      update: { message: { text: plainText, from: user, chat: { id: 72345, type: 'private' } } },
      reply: async (text: string) => { plainReplies.push(text); }
    });
    assert.equal(plainReplies.length, 1);
    assert.match(plainReplies[0], /won't store/i);
    assert.doesNotMatch(plainReplies[0], /sk-ant|abcdefghijklmnopqrstuvwxyz/i);

    const context = await conversation.getContext(user, 'what did I say?');
    assert.match(context, /sensitive credential omitted/i);
    assert.doesNotMatch(context, /sunshine123|sk-ant|abcdefghijklmnopqrstuvwxyz/i);
    console.log('ok - credential safety intercepts slash and plain Telegram routes before memory or Builder handoff');
  } finally {
    rmSync(stateDir, { recursive: true, force: true });
  }
}

void main();
