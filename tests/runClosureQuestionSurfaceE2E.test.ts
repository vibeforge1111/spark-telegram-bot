import assert from 'node:assert/strict';
import axios from 'axios';

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

const originalPost = axios.post;
const originalGet = axios.get;
const originalEnv = {
  ADMIN_TELEGRAM_IDS: process.env.ADMIN_TELEGRAM_IDS,
  BOT_DEFAULT_TIER: process.env.BOT_DEFAULT_TIER,
  SPARK_AGENT_ACCESS_PROFILE: process.env.SPARK_AGENT_ACCESS_PROFILE,
  SPARK_BOT_TEST_MODE: process.env.SPARK_BOT_TEST_MODE
};

function restore(): void {
  (axios as any).post = originalPost;
  (axios as any).get = originalGet;
  for (const [key, value] of Object.entries(originalEnv)) {
    if (value === undefined) delete (process.env as Record<string, string | undefined>)[key];
    else (process.env as Record<string, string>)[key] = value;
  }
}

function makeFakeCtx(replies: string[], replyExtras: any[]) {
  return {
    chat: { id: 8319079055 },
    from: { id: 8319079055, username: 'cem' },
    message: { message_id: 5572, text: '' },
    update: { update_id: 5572 },
    sendChatAction: async (_action: string) => {},
    reply: async (text: string, extra?: any) => {
      replies.push(text);
      replyExtras.push(extra);
    }
  };
}

async function run(): Promise<void> {
  await test('missing mission id QA question stays no-action and answers fail closed', async () => {
    restore();
    process.env.ADMIN_TELEGRAM_IDS = '8319079055';
    process.env.BOT_DEFAULT_TIER = 'base';
    process.env.SPARK_AGENT_ACCESS_PROFILE = 'developer';
    process.env.SPARK_BOT_TEST_MODE = '1';

    const captured: string[] = [];
    (axios as any).post = async (url: string) => {
      captured.push(url);
      return { data: { success: true } };
    };
    (axios as any).get = async () => ({ data: { pending: false } });

    const replies: string[] = [];
    const replyExtras: any[] = [];
    const ctx = makeFakeCtx(replies, replyExtras);
    ctx.message.text = 'QA no-action check: do not create, run, repair, publish, or start anything. If Mission Control answers success but gives no mission id for a /run request, should Spark treat that as started or fail closed?';
    const indexModule: any = await import('../src/index');

    await indexModule.handleTextMessage(ctx);

    const reply = replies.join('\n');
    assert.equal(captured.length, 0, 'closure-policy chat must not call Spawner or PRD bridge');
    assert.match(reply, /Fail closed/);
    assert.match(reply, /not a started run/);
    assert.match(reply, /closure proof/);
    assert.equal(replyExtras[0]?.__sparkTraceContext?.route, 'conversation.qa_planning');
    assert.equal(replyExtras[0]?.__sparkTraceContext?.proofCapsule?.reply?.rawReasonsHidden, true);
    assert.doesNotMatch(reply, /I will run that through|Mission:|Canvas:|internal error|QA pass first/i);
  });

  await test('Loop Engineering proof no-action question stays chat instead of recursive sessions', async () => {
    restore();
    process.env.ADMIN_TELEGRAM_IDS = '8319079055';
    process.env.BOT_DEFAULT_TIER = 'base';
    process.env.SPARK_AGENT_ACCESS_PROFILE = 'developer';
    process.env.SPARK_BOT_TEST_MODE = '1';

    const captured: string[] = [];
    (axios as any).post = async (url: string) => {
      captured.push(url);
      return { data: { success: true } };
    };
    (axios as any).get = async () => ({ data: { pending: false } });

    const replies: string[] = [];
    const replyExtras: any[] = [];
    const ctx = makeFakeCtx(replies, replyExtras);
    ctx.message.text = "Quick QA no-action check: I'm not asking you to create, run, repair, or publish anything. In one or two sentences, what proof would you require before a Domain Chip Labs Loop Engineering run can be considered safe to run?";
    const indexModule: any = await import('../src/index');

    await indexModule.handleTextMessage(ctx);

    const reply = replies.join('\n');
    assert.equal(captured.length, 0, 'Loop Engineering proof chat must not call Spawner or PRD bridge');
    assert.match(reply, /QA planning|proof|mission launch|run/i);
    assert.equal(replyExtras[0]?.__sparkTraceContext?.route, 'conversation.qa_planning');
    assert.doesNotMatch(reply, /No recursive sessions found|recursive sessions|I will run that through|Mission:|Canvas:/i);
  });

  await test('Domain Chip onboarding proof no-action question defines Domain Chip without starting work', async () => {
    restore();
    process.env.ADMIN_TELEGRAM_IDS = '8319079055';
    process.env.BOT_DEFAULT_TIER = 'base';
    process.env.SPARK_AGENT_ACCESS_PROFILE = 'developer';
    process.env.SPARK_BOT_TEST_MODE = '1';

    const captured: string[] = [];
    (axios as any).post = async (url: string) => {
      captured.push(url);
      return { data: { success: true } };
    };
    (axios as any).get = async () => ({ data: { pending: false } });

    const replies: string[] = [];
    const replyExtras: any[] = [];
    const ctx = makeFakeCtx(replies, replyExtras);
    ctx.message.text = 'Quick QA no-action check: I am new to Domain Chips. Do not create, run, repair, or publish anything. In two short paragraphs, explain what proof Spark needs before it can call a Domain Chip good.';
    const indexModule: any = await import('../src/index');

    await indexModule.handleTextMessage(ctx);

    const reply = replies.join('\n');
    assert.equal(captured.length, 0, 'Domain Chip onboarding proof chat must not call Spawner or PRD bridge');
    assert.match(reply, /A Domain Chip is a reusable Spark playbook/i);
    assert.match(reply, /private|local/i);
    assert.match(reply, /benchmark cases/i);
    assert.match(reply, /held-out/i);
    assert.match(reply, /watchtower/i);
    assert.match(reply, /rollback/i);
    assert.equal(replyExtras[0]?.__sparkTraceContext?.route, 'conversation.qa_planning');
    assert.doesNotMatch(reply, /No recursive sessions found|recursive sessions|I will run that through|Mission:|Canvas:|router boundaries|Advanced PRD/i);
  });

  await test('Domain Chip safety adversary binding no-action question answers the specific proof gap', async () => {
    restore();
    process.env.ADMIN_TELEGRAM_IDS = '8319079055';
    process.env.BOT_DEFAULT_TIER = 'base';
    process.env.SPARK_AGENT_ACCESS_PROFILE = 'developer';
    process.env.SPARK_BOT_TEST_MODE = '1';

    const captured: string[] = [];
    (axios as any).post = async (url: string) => {
      captured.push(url);
      return { data: { success: true } };
    };
    (axios as any).get = async () => ({ data: { pending: false } });

    const replies: string[] = [];
    const replyExtras: any[] = [];
    const ctx = makeFakeCtx(replies, replyExtras);
    ctx.message.text = 'Quick QA no-action check: I am not asking you to create, run, repair, publish, or promote anything. In two short sentences, what proof should Spark require before a Domain Chip can bind safety and adversary verdicts without promoting itself?';
    const indexModule: any = await import('../src/index');

    await indexModule.handleTextMessage(ctx);

    const reply = replies.join('\n');
    assert.equal(captured.length, 0, 'safety/adversary binding proof chat must not call Spawner or PRD bridge');
    assert.match(reply, /safety judge/i);
    assert.match(reply, /adversary/i);
    assert.match(reply, /role separation|separate role/i);
    assert.match(reply, /hard blockers/i);
    assert.match(reply, /promotion remains blocked|without promoting/i);
    assert.equal(replyExtras[0]?.__sparkTraceContext?.route, 'conversation.qa_planning');
    assert.ok(reply.split(/[.!?]\s+/).filter((sentence) => sentence.trim()).length <= 3, `expected short reply, got: ${reply}`);
    assert.doesNotMatch(reply, /No recursive sessions found|recursive sessions|I will run that through|Mission:|Canvas:|router boundaries|Advanced PRD|reports\/|trace|local path/i);
  });

  await test('created Domain Chip benchmark follow-up no-action question does not ask for benchmark level', async () => {
    restore();
    process.env.ADMIN_TELEGRAM_IDS = '8319079055';
    process.env.BOT_DEFAULT_TIER = 'base';
    process.env.SPARK_AGENT_ACCESS_PROFILE = 'developer';
    process.env.SPARK_BOT_TEST_MODE = '1';

    const captured: string[] = [];
    (axios as any).post = async (url: string) => {
      captured.push(url);
      return { data: { success: true } };
    };
    (axios as any).get = async () => ({ data: { pending: false } });

    const replies: string[] = [];
    const replyExtras: any[] = [];
    const ctx = makeFakeCtx(replies, replyExtras);
    ctx.message.text = 'Quick QA no-action check: I am not asking you to create, run, benchmark, autoloop, publish, or promote anything. If Spark just created domain-chip-pull-request-risk-review, what should happen when I say "run the benchmark for it"?';
    const indexModule: any = await import('../src/index');

    await indexModule.handleTextMessage(ctx);

    const reply = replies.join('\n');
    assert.equal(captured.length, 0, 'created-chip benchmark follow-up proof chat must not call Spawner or PRD bridge');
    assert.match(reply, /protected local-check follow-up/i);
    assert.match(reply, /fresh approval/i);
    assert.match(reply, /should not start a benchmark, autoloop, promotion, publication, or raw command/i);
    assert.equal(replyExtras[0]?.__sparkTraceContext?.route, 'conversation.qa_planning');
    assert.doesNotMatch(reply, /Choose the specialization path|benchmark level|level 1-10/i);
    assert.doesNotMatch(reply, /\/recursive start|I.?m starting|Loop complete|Started execution|Mission:|Canvas:|\/Users\/|trace|router boundary/i);
  });
}

run()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(restore);
