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
const originalEnv = {
  ADMIN_TELEGRAM_IDS: process.env.ADMIN_TELEGRAM_IDS,
  BOT_TOKEN: process.env.BOT_TOKEN,
  SPARK_AGENT_ACCESS_PROFILE: process.env.SPARK_AGENT_ACCESS_PROFILE,
  SPARK_BOT_TEST_MODE: process.env.SPARK_BOT_TEST_MODE,
  SPAWNER_UI_PUBLIC_URL: process.env.SPAWNER_UI_PUBLIC_URL,
  SPAWNER_UI_URL: process.env.SPAWNER_UI_URL
};

function restoreEnv(): void {
  for (const [key, value] of Object.entries(originalEnv)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
}

function fakeCtx(text: string, replies: string[], ids = { chat: 8319079055, user: 8319079055, message: 9061 }) {
  const chat = { id: ids.chat, type: 'private' };
  const from = { id: ids.user, username: 'qa' };
  const message = { message_id: ids.message, text, chat, from };
  return {
    chat,
    from,
    message,
    update: { update_id: ids.message, message },
    sendChatAction: async (_action: string) => {},
    reply: async (reply: string) => {
      replies.push(reply);
    }
  };
}

async function withLoopHandler() {
  process.env.BOT_TOKEN = process.env.BOT_TOKEN || '123:test';
  process.env.ADMIN_TELEGRAM_IDS = '8319079055';
  process.env.SPARK_AGENT_ACCESS_PROFILE = 'developer';
  process.env.SPARK_BOT_TEST_MODE = '1';
  process.env.SPAWNER_UI_URL = 'http://127.0.0.1:3333';
  process.env.SPAWNER_UI_PUBLIC_URL = 'http://127.0.0.1:3333';
  return import('../src/index');
}

function stubSpawner(calls: Array<{ url: string; body: any }>): void {
  (axios as any).post = async (url: string, body: unknown) => {
    calls.push({ url, body });
    if (url.includes('/benchmarks/run')) {
      return {
        data: {
          ok: true,
          commandResult: {
            action: 'benchmark_run_queued',
            inspectUrl: '/loop-engineering/domain-chip-prd-writing-proof-loop',
            userMessage: 'Queued a private benchmark mission for domain-chip-prd-writing-proof-loop. It can produce evidence, but it does not approve activation or claim improvement by itself.'
          }
        }
      };
    }
    if (url.includes('/evaluator-review')) {
      return {
        data: {
          ok: true,
          event: { id: 'lee-evaluator-prd', eventType: 'evaluator_review', status: 'passed' },
          commandResult: {
            action: 'evaluator_review_recorded',
            eventId: 'lee-evaluator-prd',
            inspectUrl: '/loop-engineering/domain-chip-prd-writing-proof-loop',
            userMessage: 'Recorded separated evaluator evidence for domain-chip-prd-writing-proof-loop: 6.0 -> 8.4. This can support distillation, but it does not activate the chip.'
          }
        }
      };
    }
    if (url.includes('/distill')) {
      return {
        data: {
          ok: true,
          commandResult: {
            action: 'distillation_staged',
            inspectUrl: '/loop-engineering/domain-chip-prd-writing-proof-loop',
            userMessage: 'Distilled 1 evaluator-backed lesson for domain-chip-prd-writing-proof-loop. They are staged for future PRDs, not globally activated.'
          }
        }
      };
    }
    if (url.includes('/activation')) {
      return {
        data: {
          ok: true,
          commandResult: {
            action: 'activation_requested',
            inspectUrl: '/loop-engineering/domain-chip-prd-writing-proof-loop',
            userMessage: 'Staged suggested activation for PRD Writing requests. It is not active yet and nothing was published.'
          }
        }
      };
    }
    throw new Error(`unexpected url ${url}`);
  };
}

async function run(): Promise<void> {
  await test('/loop benchmark queues private benchmark through Spawner command-result payload', async () => {
    restoreEnv();
    const calls: Array<{ url: string; body: any }> = [];
    stubSpawner(calls);
    const indexModule: any = await withLoopHandler();
    const replies: string[] = [];

    await indexModule.handleLoopCommand(fakeCtx('/loop benchmark domain-chip-prd-writing-proof-loop', replies));

    assert.equal(calls.length, 1);
    assert.match(calls[0].url, /\/api\/loop-engineering\/chips\/domain-chip-prd-writing-proof-loop\/benchmarks\/run$/);
    assert.equal(calls[0].body.sourceSurface, 'telegram');
    assert.equal(calls[0].body.executionAuthority.tool_ledgers[0].tool_name, 'spawner.loop_engineering.benchmark.run');
    assert.match(replies[0], /Queued a private benchmark mission/);
    assert.match(replies[0], /Spawner: http:\/\/127\.0\.0\.1:3333\/loop-engineering\/domain-chip-prd-writing-proof-loop/);
    assert.doesNotMatch(replies[0], /approved|activated|published/i);
  });

  await test('/loop eval, distill, and activate drive PRD Writing evidence chain through Spawner', async () => {
    restoreEnv();
    const calls: Array<{ url: string; body: any }> = [];
    stubSpawner(calls);
    const indexModule: any = await withLoopHandler();
    const replies: string[] = [];

    await indexModule.handleLoopCommand(fakeCtx('/loop eval domain-chip-prd-writing-proof-loop 6.0 8.4 rounds 3 evidence reports/prd-eval.json', replies, { chat: 8319079055, user: 8319079055, message: 9062 }));
    await indexModule.handleLoopCommand(fakeCtx('/loop distill domain-chip-prd-writing-proof-loop from lee-evaluator-prd lesson Resolve user, owner, success metric, and acceptance criteria first.', replies, { chat: 8319079055, user: 8319079055, message: 9063 }));
    await indexModule.handleLoopCommand(fakeCtx('/loop activate domain-chip-prd-writing-proof-loop use-case PRD Writing requests trigger write a PRD rollback reports/prd-writing-rollback.json', replies, { chat: 8319079055, user: 8319079055, message: 9064 }));

    assert.equal(calls.length, 3);
    assert.match(calls[0].url, /\/evaluator-review$/);
    assert.equal(calls[0].body.evaluatorSeparated, true);
    assert.deepEqual(calls[0].body.evidenceRefs, ['reports/prd-eval.json']);
    assert.equal(calls[0].body.executionAuthority.tool_ledgers[0].tool_name, 'spawner.loop_engineering.evaluator_review.record');
    assert.match(calls[1].url, /\/distill$/);
    assert.equal(calls[1].body.sourceEvaluatorEventId, 'lee-evaluator-prd');
    assert.equal(calls[1].body.executionAuthority.tool_ledgers[0].tool_name, 'spawner.loop_engineering.distill.stage');
    assert.match(calls[2].url, /\/activation$/);
    assert.equal(calls[2].body.useCase, 'PRD Writing requests');
    assert.deepEqual(calls[2].body.triggerPatterns, ['write a PRD']);
    assert.equal(calls[2].body.executionAuthority.tool_ledgers[0].tool_name, 'spawner.loop_engineering.activation.stage');

    assert.match(replies.join('\n'), /Recorded separated evaluator evidence/);
    assert.match(replies.join('\n'), /staged for future PRDs/);
    assert.match(replies.join('\n'), /not active yet and nothing was published/i);
  });
}

run().finally(() => {
  (axios as any).post = originalPost;
  restoreEnv();
}).catch((error) => {
  console.error(error);
  process.exit(1);
});
