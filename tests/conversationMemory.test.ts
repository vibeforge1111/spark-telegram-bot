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

  await test('exposes recent full turns for the conversation frame harness', async () => {
  await withTempState(async () => {
    const memory = new ConversationMemory();

    await memory.remember(user, 'What could we build?');
    await memory.rememberAssistantReply(user, ['A few directions:', '1. Spark Command Palette', '2. Domain Chip Workbench'].join('\n'));

    const turns = await memory.getRecentTurns(user, 4);

    assert.deepEqual(turns, [
      { role: 'user', text: 'What could we build?' },
      { role: 'assistant', text: ['A few directions:', '1. Spark Command Palette', '2. Domain Chip Workbench'].join('\n') }
    ]);
  });
  });

  await test('persists rolling frame state for contextual references across instances', async () => {
  await withTempState(async () => {
    const first = new ConversationMemory();

    await first.rememberAssistantReply(user, ['A few directions:', '1. Spark Command Palette', '2. Domain Chip Workbench'].join('\n'));

    const second = new ConversationMemory();
    const frame = await second.getConversationFrame(user, 'the second one');

    assert.equal(frame.referenceResolution.kind, 'list_item');
    assert.equal(frame.referenceResolution.value, 'Domain Chip Workbench');
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

  await test('resolves short ordinal replies against nested bullet options', async () => {
  await withTempState(async () => {
    const memory = new ConversationMemory();

    await memory.remember(user, 'shape a tiny magical object maker first');
    await memory.rememberAssistantReply(user, [
      'Two splits to decide on first:',
      '',
      '1. Interaction model',
      '- Drag-and-drop ingredient combining',
      '- Sequential clicking/rune-tracing',
      '',
      '2. Object output',
      '- Procedurally generated 3D forms',
      '- Curated set of hand-designed magical objects',
      '',
      "Which direction pulls you more on each split?"
    ].join('\n'));

    const resolved = await memory.resolveRecentOptionReference(user, 'The second');

    assert.deepEqual(extractAssistantOptions([
      'Spark: Two splits:',
      '1. Interaction model',
      '- Drag-and-drop ingredient combining',
      '- Sequential clicking/rune-tracing'
    ].join('\n')), ['Drag-and-drop ingredient combining', 'Sequential clicking/rune-tracing']);
    assert.equal(resolved?.ordinal, 2);
    assert.match(resolved?.choice || '', /Sequential clicking/);
  });
  });

  await test('resolves common option-reference phrasings', async () => {
  await withTempState(async () => {
    const memory = new ConversationMemory();

    await memory.remember(user, 'help me choose a game direction');
    await memory.rememberAssistantReply(user, [
      'Pick a direction:',
      '1. Cozy physics toy',
      '2. Fast score-chasing arcade loop',
      '3. Puzzle garden with unlocks'
    ].join('\n'));

    const checks: Array<[string, number, RegExp]> = [
      ['option 2', 2, /score-chasing/],
      ['no2 please', 2, /score-chasing/],
      ['#3', 3, /Puzzle garden/],
      ['the first one', 1, /Cozy physics/],
      ['go with the first option', 1, /Cozy physics/],
      ['I like that second one', 2, /score-chasing/],
      ['option two', 2, /score-chasing/],
      ['the latter', 2, /score-chasing/],
      ['the 3rd path', 3, /Puzzle garden/]
    ];

    for (const [reply, ordinal, expected] of checks) {
      const resolved = await memory.resolveRecentOptionReference(user, reply);
      assert.equal(optionOrdinalFromText(reply), ordinal);
      assert.equal(resolved?.ordinal, ordinal);
      assert.match(resolved?.choice || '', expected);
    }

    const lastReferences: Array<[string, RegExp]> = [
      ['the last one', /Puzzle garden/],
      ['last option please', /Puzzle garden/],
      ['I would take the final path', /Puzzle garden/],
      ['run with the bottom choice', /Puzzle garden/]
    ];

    for (const [reply, expected] of lastReferences) {
      const resolved = await memory.resolveRecentOptionReference(user, reply);
      assert.equal(resolved?.ordinal, 3);
      assert.match(resolved?.choice || '', expected);
    }
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
