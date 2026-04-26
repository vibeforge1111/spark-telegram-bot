import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { ConversationMemory, parseTelegramUserIds } from '../src/conversation';
import { resetJsonStateForTests } from '../src/jsonState';

async function test(name: string, fn: () => Promise<void> | void): Promise<void> {
  try {
    await fn();
    console.log(`ok - ${name}`);
  } catch (error) {
    console.error(`not ok - ${name}`);
    throw error;
  }
}

const user = { id: 12345, first_name: 'Tester' };

async function withTempState(fn: () => Promise<void>): Promise<void> {
  const previous = process.env.SPARK_GATEWAY_STATE_DIR;
  const dir = mkdtempSync(path.join(tmpdir(), 'spark-telegram-memory-test-'));
  process.env.SPARK_GATEWAY_STATE_DIR = dir;
  try {
    await fn();
  } finally {
    resetJsonStateForTests();
    if (previous === undefined) {
      delete process.env.SPARK_GATEWAY_STATE_DIR;
    } else {
      process.env.SPARK_GATEWAY_STATE_DIR = previous;
    }
    rmSync(dir, { recursive: true, force: true });
  }
}

async function main(): Promise<void> {
  await test('parses configured Telegram user ids strictly', () => {
    assert.deepEqual(parseTelegramUserIds('123, 456'), [123, 456]);
    assert.deepEqual(parseTelegramUserIds('0, -1, NaN, 12abc, 1.5, 9007199254740992'), []);
  });

  await test('keeps explicit session notes available to the next chat turn', async () => {
  await withTempState(async () => {
    const memory = new ConversationMemory();

    await memory.learnAboutUser(user, 'User asked Spark to remember: you are a QA agent');
    await memory.remember(user, 'can you remember that you are a QA agent');

    const context = await memory.getContext(user, 'what are you');

    assert.match(context, /Session notes from this chat/);
    assert.match(context, /you are a QA agent/);
    assert.match(context, /Recent Telegram turns/);
  });
  });

  await test('does not leak one user session context to another user', async () => {
  await withTempState(async () => {
    const memory = new ConversationMemory();

    await memory.learnAboutUser(user, 'User asked Spark to remember: you are a QA agent');

    const otherContext = await memory.getContext({ id: 67890 }, 'what are you');

    assert.equal(otherContext, 'No prior memories.');
  });
  });

  await test('exposes recent user turns for follow-up mission inference', async () => {
  await withTempState(async () => {
    const memory = new ConversationMemory();

    await memory.remember(user, "let's build something together shall we");
    await memory.remember(user, 'a new domain chip');
    await memory.remember(user, 'recognizing bugs happening in Spark systems');

    const recent = await memory.getRecentMessages(user, 2);

    assert.deepEqual(recent, ['a new domain chip', 'recognizing bugs happening in Spark systems']);
  });
  });

  await test('keeps assistant replies in chat context without feeding mission inference', async () => {
  await withTempState(async () => {
    const memory = new ConversationMemory();

    await memory.remember(user, "I don't know what should we be building");
    await memory.rememberAssistantReply(user, [
      'A few directions:',
      '1. Spark Command Palette',
      '2. Domain Chip Workbench',
      '3. Spark Timeline'
    ].join('\n'));
    await memory.remember(user, 'no.1 could be handy - how would you think of the no2?');

    const context = await memory.getContext(user, 'no.1 could be handy - how would you think of the no2?');
    const recentUserMessages = await memory.getRecentMessages(user, 4);

    assert.match(context, /Spark: A few directions/);
    assert.match(context, /2\. Domain Chip Workbench/);
    assert.deepEqual(recentUserMessages, [
      "I don't know what should we be building",
      'no.1 could be handy - how would you think of the no2?'
    ]);
  });
  });

  await test('persists recent planning context across ConversationMemory instances', async () => {
  await withTempState(async () => {
    const first = new ConversationMemory();
    await first.remember(user, 'a new domain chip');
    await first.remember(user, 'recognizing bugs happening in Spark systems');

    const second = new ConversationMemory();
    const recent = await second.getRecentMessages(user, 4);

    assert.deepEqual(recent, ['a new domain chip', 'recognizing bugs happening in Spark systems']);
  });
  });
}

void main();
