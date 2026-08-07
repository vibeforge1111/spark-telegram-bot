import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import axios from 'axios';
import { classifyTelegramIntentV2 } from '../src/telegramIntentGate';

const originalPost = axios.post;
const originalGet = axios.get;
const originalEnv = { ...process.env };

function restore(): void {
  (axios as any).post = originalPost;
  (axios as any).get = originalGet;
  for (const key of Object.keys(process.env)) {
    if (!(key in originalEnv)) delete process.env[key];
  }
  Object.assign(process.env, originalEnv);
}

function makeFakeCtx(chatId: number, fromId: number, messageId: number, replies: string[], extras: any[]) {
  return {
    chat: { id: chatId, type: 'private' },
    from: { id: fromId, username: 'cem' },
    message: { message_id: messageId, text: '' },
    update: { update_id: messageId },
    sendChatAction: async (_action: string) => {},
    reply: async (text: string, extra?: any) => {
      replies.push(text);
      extras.push(extra);
    }
  };
}

async function run(): Promise<void> {
  const tempRoot = mkdtempSync(path.join(os.tmpdir(), 'spark-jury-preflight-authority-'));
  try {
    process.env.BOT_TOKEN = 'test-token';
    process.env.ADMIN_TELEGRAM_IDS = '8319079055';
    process.env.BOT_DEFAULT_TIER = 'base';
    process.env.SPAWNER_UI_URL = 'http://stub-spawner.test';
    process.env.SPAWNER_UI_PUBLIC_URL = 'http://stub-spawner.test';
    process.env.SPARK_AGENT_ACCESS_PROFILE = 'developer';
    process.env.SPARK_BOT_TEST_MODE = '1';
    process.env.SPARK_GATEWAY_STATE_DIR = tempRoot;
    process.env.SPARK_HARNESS_CORE_LEDGER_PATH = path.join(tempRoot, 'harness-ledger.jsonl');
    process.env.LLM_PROVIDER = 'disabled-for-test';
    process.env.SPARK_CHAT_LLM_PROVIDER = 'disabled-for-test';
    process.env.SPARK_LLM_PROVIDER = 'disabled-for-test';
    process.env.SPARK_ALLOW_IMPLICIT_LLM_PROVIDER = '0';

    const captured: Array<{ url: string; body: any }> = [];
    (axios as any).post = async (url: string, body: any) => {
      captured.push({ url, body });
      if (url.includes('/api/spark/run')) {
        return {
          data: {
            success: true,
            missionId: 'spark-external-research-authority-test',
            requestId: body.requestId,
            providers: ['codex']
          }
        };
      }
      return { data: { success: true } };
    };
    (axios as any).get = async () => ({ data: { providers: [{ id: 'codex' }] } });

    const replies: string[] = [];
    const extras: any[] = [];
    const chatId = 8319079188;
    const ctx = makeFakeCtx(chatId, 8319079055, 560, replies, extras);
    ctx.message.text = [
      'Lane F: please run the legitimate protected review-control preflight for Spark Compete PR #124 at exact head e25f16b3e32626a541b5eceab3ece0035898f791.',
      'Use the sealed public-safe evidence bundle /tmp/spark-r30-pr124-jury-evidence-bundle.json.',
      'If and only if the fresh GitHub head, required non-jury checks, packet/security/jury/lab/duplicate/team-account gates, signature, freshness, and replay store all pass, publish the legitimate spark-jury-approval status.',
      'If any gate fails, do not publish the status; return a bounded blocker receipt.',
      'Do not bypass protection, expose HMAC/signing material, mutate points, merge a PR, or publish anything else.'
    ].join(' ');

    const decision = classifyTelegramIntentV2(ctx.message.text);
    assert.equal(decision.route, 'external_research.inspect');
    assert.equal(decision.constraints.noExecution, false);
    assert.equal(decision.constraints.noMerge, true);

    const indexModule: any = await import('../src/index');
    await indexModule.handleTextMessage(ctx);
    const runCalls = captured.filter((call) => call.url.includes('/api/spark/run'));
    assert.equal(runCalls.length, 0, `protected Jury control must not launch a generic Spawner mission; replies=${JSON.stringify(replies)}`);
    const reply = replies.join('\n');
    assert.match(reply, /protected review-control signer/i);
    assert.match(reply, /durable replay store/i);
    assert.match(reply, /nothing was published/i);
    assert.match(reply, /equipped review-control host/i);
    assert.doesNotMatch(reply, /I will run that through|Mission:|Provider:|Harness Core execution authority is required|chat model is not healthy/i);
    assert.equal(extras.length, 1);
    assert.equal(extras[0]?.__sparkTraceContext?.route, 'spark_compete.protected_jury_handoff');
    assert.equal(extras[0]?.__sparkTraceContext?.replyKind, 'bounded_blocker');
    console.log('ok - protected Jury preflight fails closed to the equipped review-control owner');
  } finally {
    restore();
    rmSync(tempRoot, { force: true, recursive: true });
  }
}

run().catch((error) => {
  console.error('not ok - protected Jury preflight fails closed to the equipped review-control owner');
  throw error;
});
