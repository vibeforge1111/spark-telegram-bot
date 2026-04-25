import assert from 'node:assert/strict';
import { ConversationMemory } from '../src/conversation';

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

async function main(): Promise<void> {
  await test('keeps explicit session notes available to the next chat turn', async () => {
  const memory = new ConversationMemory();

  await memory.learnAboutUser(user, 'User asked Spark to remember: you are a QA agent');
  await memory.remember(user, 'can you remember that you are a QA agent');

  const context = await memory.getContext(user, 'what are you');

  assert.match(context, /Session notes from this chat/);
  assert.match(context, /you are a QA agent/);
  assert.match(context, /Recent Telegram turns/);
  });

  await test('does not leak one user session context to another user', async () => {
  const memory = new ConversationMemory();

  await memory.learnAboutUser(user, 'User asked Spark to remember: you are a QA agent');

  const otherContext = await memory.getContext({ id: 67890 }, 'what are you');

  assert.equal(otherContext, 'No prior memories.');
  });

  await test('exposes recent user turns for follow-up mission inference', async () => {
  const memory = new ConversationMemory();

  await memory.remember(user, "let's build something together shall we");
  await memory.remember(user, 'a new domain chip');
  await memory.remember(user, 'recognizing bugs happening in Spark systems');

  const recent = await memory.getRecentMessages(user, 2);

  assert.deepEqual(recent, ['a new domain chip', 'recognizing bugs happening in Spark systems']);
  });
}

void main();
