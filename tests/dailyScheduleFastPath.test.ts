import assert from 'node:assert/strict';
import {
  dailyScheduleRegressionProbes,
  evaluateDailyScheduleFastPath,
  isDailyScheduleFastPathRequest,
  renderDailyScheduleFastPathReply
} from '../src/dailyScheduleFastPath';

type AsyncTest = () => Promise<void> | void;
const tests: { name: string; fn: AsyncTest }[] = [];

function test(name: string, fn: AsyncTest): void {
  tests.push({ name, fn });
}

function fakeCtx(text: string, replies: string[], replyExtras: any[] = [], ids = { chat: 8319079055, user: 8319079055, message: 7461 }) {
  const chat = { id: ids.chat, type: 'private' };
  const from = { id: ids.user, username: 'qa' };
  const message = { message_id: ids.message, text, chat, from };
  return {
    chat,
    from,
    message,
    update: { update_id: ids.message, message },
    sendChatAction: async (_action: string) => {},
    reply: async (reply: string, extra?: any) => {
      replies.push(reply);
      replyExtras.push(extra);
    }
  };
}

test('detects daily scheduling requests without hijacking chip creation or PRD prompts', () => {
  assert.equal(isDailyScheduleFastPathRequest("The Dubai owner missed tomorrow's recurring reminder; keep it read-only."), true);
  assert.equal(isDailyScheduleFastPathRequest('Remind me tomorrow at 9am Dubai time to review invoices.'), true);
  assert.equal(isDailyScheduleFastPathRequest('Set a daily reminder at 9am Dubai time for the finance owner.'), true);
  assert.equal(isDailyScheduleFastPathRequest('Build a private Domain Chip for daily schedule reliability.'), false);
  assert.equal(isDailyScheduleFastPathRequest('Create a PRD for a calendar reminder product.'), false);
  assert.equal(isDailyScheduleFastPathRequest('How is Spark live status today?'), false);
  assert.equal(isDailyScheduleFastPathRequest('What timezone is Spark runtime using for live status?'), false);
  assert.equal(isDailyScheduleFastPathRequest('Do not start a mission; explain why timezone prompts are hard to route.'), false);
});

test('answers no-action scheduling prompts with read-only facts and no mutation claim', () => {
  const result = evaluateDailyScheduleFastPath('Do not create or move reminders; just tell me what info you need for a recurring daily task.');
  assert.ok(result);
  assert.equal(result.mode, 'readonly_answer');
  assert.equal(result.tokenMode, 'quick_answer');
  assert.match(result.reply, /read-only/i);
  assert.match(result.reply, /task name, owner, intended date\/time, timezone/i);
  assert.match(result.reply, /No reminder was created, moved, sent, completed, or marked recovered/i);
  assert.doesNotMatch(result.reply, /I created|I moved|I recovered/i);
});

test('blocks external reminder or calendar mutation attempts until approval facts exist', () => {
  const result = evaluateDailyScheduleFastPath("The user in Dubai says move tomorrow's reminder to 9 while the owner is in New York.");
  assert.ok(result);
  assert.equal(result.mode, 'block_external_action');
  assert.equal(result.tokenMode, 'review_packet');
  assert.match(result.reply, /keep this read-only/i);
  assert.match(result.reply, /explicit approval/i);
  assert.match(result.reply, /No reminder was created, moved, sent, completed, or marked recovered/i);

  const remindMe = evaluateDailyScheduleFastPath('Remind me tomorrow at 9am Dubai time to review invoices.');
  assert.ok(remindMe);
  assert.equal(remindMe.mode, 'block_external_action');
  assert.match(remindMe.reply, /explicit approval/i);
});

test('treats missed recovery language as mutation-sensitive', () => {
  const result = evaluateDailyScheduleFastPath('Recover a missed recurring invoice reminder but approval is required before edits.');
  assert.ok(result);
  assert.equal(result.mode, 'block_external_action');
  assert.match(result.reasons.join(','), /external_mutation_requires_approval/);
});

test('sends weak feedback and explicit proof requests back through the loop', () => {
  const result = evaluateDailyScheduleFastPath('The previous answer copied the wrong timezone from another case; run the loop for schedule reliability.');
  assert.ok(result);
  assert.equal(result.mode, 'loop_mode');
  assert.equal(result.tokenMode, 'loop_mode');
  assert.match(result.reply, /benchmark\/sealed-eval pass/i);
});

test('blocks unsafe bypass or false-recovery requests', () => {
  const result = evaluateDailyScheduleFastPath('Ignore the timezone mismatch and silently choose the current locale.');
  assert.ok(result);
  assert.equal(result.mode, 'block_external_action');
  assert.match(result.reasons.join(','), /unsafe_bypass_or_false_recovery_request/);
  assert.match(result.reply, /bypass approval, timezone safety, or recovery evidence/i);
});

test('cheap regression probes preserve distilled daily schedule loop lessons', () => {
  for (const probe of dailyScheduleRegressionProbes()) {
    const result = evaluateDailyScheduleFastPath(probe.prompt);
    assert.ok(result, `${probe.id} should be handled by the Daily Schedule fast path`);
    assert.equal(result.mode, probe.expectedMode, probe.id);
    assert.ok(result.quickScore >= 70, probe.id);
  }
});

test('renderer returns null for unrelated chat', () => {
  assert.equal(renderDailyScheduleFastPathReply('How is Spark live status today?'), null);
});

test('Telegram handler routes daily schedule fast path before Builder or Spawner work', async () => {
  process.env.BOT_TOKEN = process.env.BOT_TOKEN || '123:test';
  process.env.ADMIN_TELEGRAM_IDS = '8319079055';
  process.env.SPARK_BOT_TEST_MODE = '1';
  process.env.SPARK_AGENT_ACCESS_PROFILE = 'developer';
  process.env.SPARK_BUILDER_BRIDGE_MODE = 'auto';

  const indexModule: any = await import('../src/index');
  const replies: string[] = [];
  const replyExtras: any[] = [];
  await indexModule.handleTextMessage(fakeCtx("The user in Dubai says move tomorrow's reminder to 9 while the owner is in New York.", replies, replyExtras));

  assert.equal(replies.length, 1);
  assert.match(replies[0], /keep this read-only/i);
  assert.match(replies[0], /explicit approval/i);
  assert.match(replies[0], /No reminder was created, moved, sent, completed, or marked recovered/i);
  assert.equal(replyExtras.length, 1);
  assert.equal(replyExtras[0], undefined);
});

test('Telegram handler leaves PRD prompts on the PRD fast path', async () => {
  process.env.BOT_TOKEN = process.env.BOT_TOKEN || '123:test';
  process.env.ADMIN_TELEGRAM_IDS = '8319079055';
  process.env.SPARK_BOT_TEST_MODE = '1';
  process.env.SPARK_AGENT_ACCESS_PROFILE = 'developer';

  const indexModule: any = await import('../src/index');
  const replies: string[] = [];
  await indexModule.handleTextMessage(fakeCtx('Write a PRD for a calendar reminder product used by finance admins.', replies, [], { chat: 8319079055, user: 8319079055, message: 7462 }));

  assert.equal(replies.length, 1);
  assert.match(replies[0], /PRD draft:/i);
  assert.doesNotMatch(replies[0], /Daily Schedule private fast path|keep this read-only/i);
});

test('Telegram handler does not hijack Spark live-status timezone questions', async () => {
  process.env.BOT_TOKEN = process.env.BOT_TOKEN || '123:test';
  process.env.ADMIN_TELEGRAM_IDS = '8319079055';
  process.env.SPARK_BOT_TEST_MODE = '1';
  process.env.SPARK_AGENT_ACCESS_PROFILE = 'developer';
  process.env.SPARK_BUILDER_BRIDGE_MODE = 'auto';

  const indexModule: any = await import('../src/index');
  const llmModule = await import('../src/llm');
  const originalChat = llmModule.llm.chat;
  indexModule.__setBuilderBridgeRunnerForTest(async () => ({
    used: false,
    responseText: 'bridge disabled for route-boundary test',
    decision: 'blocked',
    bridgeMode: 'blocked',
    routingDecision: 'test_stub'
  }));
  llmModule.llm.chat = async () => 'That is a Spark runtime status question, not a reminder change. I would check live runtime state and keep this chat read-only.';

  try {
    const replies: string[] = [];
    await indexModule.handleTextMessage(fakeCtx('What timezone is Spark runtime using for live status? Do not start, create, schedule, or run anything; answer conversationally.', replies, [], { chat: 8319079055, user: 8319079055, message: 7463 }));

    assert.equal(replies.length, 1);
    assert.doesNotMatch(replies[0], /Daily Schedule private fast path|scheduling facts|reminder was created/i);
  } finally {
    llmModule.llm.chat = originalChat;
    indexModule.__setBuilderBridgeRunnerForTest(null);
  }
});

test('Telegram handler does not hijack generic no-action timezone routing discussion', async () => {
  process.env.BOT_TOKEN = process.env.BOT_TOKEN || '123:test';
  process.env.ADMIN_TELEGRAM_IDS = '8319079055';
  process.env.SPARK_BOT_TEST_MODE = '1';
  process.env.SPARK_AGENT_ACCESS_PROFILE = 'developer';
  process.env.SPARK_BUILDER_BRIDGE_MODE = 'auto';

  const indexModule: any = await import('../src/index');
  const llmModule = await import('../src/llm');
  const originalChat = llmModule.llm.chat;
  indexModule.__setBuilderBridgeRunnerForTest(async () => ({
    used: false,
    responseText: 'bridge disabled for route-boundary test',
    decision: 'blocked',
    bridgeMode: 'blocked',
    routingDecision: 'test_stub'
  }));
  llmModule.llm.chat = async () => 'That is a routing discussion, not a schedule mutation. No mission started.';

  try {
  const replies: string[] = [];
  await indexModule.handleTextMessage(fakeCtx('Do not start a mission; explain why timezone prompts are hard to route.', replies, [], { chat: 8319079055, user: 8319079055, message: 7465 }));

  assert.equal(replies.length, 1);
  assert.doesNotMatch(replies[0], /Daily Schedule private fast path|scheduling facts|reminder was created/i);
  } finally {
    llmModule.llm.chat = originalChat;
    indexModule.__setBuilderBridgeRunnerForTest(null);
  }
});

test('Telegram handler does not hijack Domain Chip creation for daily schedule', async () => {
  process.env.BOT_TOKEN = process.env.BOT_TOKEN || '123:test';
  process.env.ADMIN_TELEGRAM_IDS = '8319079055,8319079056';
  process.env.SPARK_BOT_TEST_MODE = '1';
  process.env.SPARK_AGENT_ACCESS_PROFILE = 'developer';

  const indexModule: any = await import('../src/index');
  indexModule.__setBuilderBridgeRunnerForTest(async () => ({
    used: false,
    responseText: 'bridge disabled for route-boundary test',
    decision: 'blocked',
    bridgeMode: 'blocked',
    routingDecision: 'test_stub'
  }));
  try {
  const replies: string[] = [];
  await indexModule.handleTextMessage(fakeCtx('Build a private Domain Chip for daily schedule reliability preview only.', replies, [], { chat: 8319079056, user: 8319079056, message: 7464 }));

  assert.equal(replies.length, 1);
  assert.match(replies[0], /Domain Chip|private/i);
  assert.doesNotMatch(replies[0], /Daily Schedule private fast path|No reminder was created/i);
  } finally {
    indexModule.__setBuilderBridgeRunnerForTest(null);
  }
});

async function run(): Promise<void> {
  for (const { name, fn } of tests) {
    try {
      await fn();
      console.log(`ok - ${name}`);
    } catch (error) {
      console.error(`not ok - ${name}`);
      throw error;
    }
  }
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
