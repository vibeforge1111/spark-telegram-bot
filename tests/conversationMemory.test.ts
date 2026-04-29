import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import {
  ConversationMemory,
  extractAssistantOptions,
  isPendingTaskRecoveryQuestion,
  optionOrdinalFromText,
  parseTelegramUserIds,
  renderPendingTaskRecoveryReply
} from '../src/conversation';
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

  await test('resolves short ordinal replies against the last Spark option list', async () => {
  await withTempState(async () => {
    const memory = new ConversationMemory();

    await memory.remember(user, "Hey Spark, let's build something like a magazine about AGI");
    await memory.rememberAssistantReply(user, [
      'Two ways to take this: a content chip that generates magazine-style AGI pieces on demand, or a recurring publication workflow that curates, writes, and packages issues on a schedule.',
      '',
      "Which form factor are you picturing?"
    ].join('\n'));

    const resolved = await memory.resolveRecentOptionReference(user, 'The second');

    assert.equal(optionOrdinalFromText('The second'), 2);
    assert.deepEqual(extractAssistantOptions('Spark: Pick one:\n1. First path\n2. Second path'), ['First path', 'Second path']);
    assert.equal(resolved?.ordinal, 2);
    assert.match(resolved?.choice || '', /recurring publication workflow/);
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

  await test('persists interrupted task recovery context across instances', async () => {
  await withTempState(async () => {
    const first = new ConversationMemory();
    await first.recordInterruptedTask(user, {
      message: 'analyze our systems to see what memory layers we have',
      failure: 'Promise timed out after 90000 milliseconds',
      stage: 'telegram_handler'
    });

    const second = new ConversationMemory();
    const pending = await second.getPendingTaskRecovery(user);
    const context = await second.getContext(user, 'what happened');

    assert.equal(pending?.message, 'analyze our systems to see what memory layers we have');
    assert.equal(pending?.failure, 'Promise timed out after 90000 milliseconds');
    assert.equal(pending?.stage, 'telegram_handler');
    assert.match(context, /Interrupted task to recover/);
    assert.match(context, /analyze our systems/);
  });
  });

  await test('recognizes recovery probes and renders the interrupted request', () => {
    assert.equal(isPendingTaskRecoveryQuestion('what happened?'), true);
    assert.equal(isPendingTaskRecoveryQuestion('is it fine now'), true);
    assert.equal(isPendingTaskRecoveryQuestion('you timed out'), true);
    assert.equal(isPendingTaskRecoveryQuestion('please build the app'), false);

    const reply = renderPendingTaskRecoveryReply({
      message: 'check the compression pipeline',
      failure: 'command timed out after 120000ms',
      stage: 'chat_runtime',
      recordedAt: '2026-04-28T18:00:00.000Z'
    });

    assert.match(reply, /The interrupted request was/);
    assert.match(reply, /check the compression pipeline/);
    assert.match(reply, /command timed out after 120000ms/);
    assert.match(reply, /I can resume from that/);
  });
}

void main();
