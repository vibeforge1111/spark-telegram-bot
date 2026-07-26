import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { shouldPreferConversationalIdeation } from '../src/conversationIntent';

const originalEnv = {
  ADMIN_TELEGRAM_IDS: process.env.ADMIN_TELEGRAM_IDS,
  SPARK_AGENT_ACCESS_PROFILE: process.env.SPARK_AGENT_ACCESS_PROFILE,
  SPARK_ALLOW_IMPLICIT_LLM_PROVIDER: process.env.SPARK_ALLOW_IMPLICIT_LLM_PROVIDER,
  SPARK_BOT_TEST_MODE: process.env.SPARK_BOT_TEST_MODE,
  SPARK_BUILDER_BRIDGE_MODE: process.env.SPARK_BUILDER_BRIDGE_MODE,
  SPARK_CHAT_LLM_PROVIDER: process.env.SPARK_CHAT_LLM_PROVIDER,
  SPARK_HOME: process.env.SPARK_HOME,
  SPARK_LLM_PROVIDER: process.env.SPARK_LLM_PROVIDER
};

function restoreEnv(): void {
  for (const [key, value] of Object.entries(originalEnv)) {
    if (value === undefined) delete (process.env as Record<string, string | undefined>)[key];
    else (process.env as Record<string, string>)[key] = value;
  }
}

function makeFakeCtx(replies: string[], replyExtras: unknown[]): any {
  const message = {
    message_id: 701,
    text: 'In one sentence, what does route confidence mean for Spark? Do not start anything.'
  };
  return {
    chat: { id: 8319079055, type: 'private' },
    from: { id: 8319079055, username: 'tester' },
    message,
    update: { update_id: 701, message },
    reply: async (text: string, extra?: unknown) => {
      replies.push(text);
      replyExtras.push(extra);
      return {};
    },
    sendChatAction: async () => undefined,
    telegram: {
      sendChatAction: async () => undefined
    }
  };
}

async function test(name: string, fn: () => Promise<void> | void): Promise<void> {
  try {
    await fn();
    console.log(`ok - ${name}`);
  } catch (error) {
    console.error(`not ok - ${name}`);
    throw error;
  }
}

test('route-confidence definition canary answers without starting ideation', async () => {
  assert.equal(
    shouldPreferConversationalIdeation('In one sentence, what does route confidence mean for Spark? Do not start anything.'),
    false
  );
  assert.equal(shouldPreferConversationalIdeation('what is route confidence in one sentence'), false);
  assert.equal(
    shouldPreferConversationalIdeation('do not build yet, help me think through a domain chip for route confidence'),
    true
  );

  const tempHome = mkdtempSync(path.join(os.tmpdir(), 'spark-route-confidence-'));
  process.env.ADMIN_TELEGRAM_IDS = '8319079055';
  process.env.SPARK_AGENT_ACCESS_PROFILE = 'developer';
  process.env.SPARK_ALLOW_IMPLICIT_LLM_PROVIDER = '0';
  process.env.SPARK_BOT_TEST_MODE = '1';
  process.env.SPARK_BUILDER_BRIDGE_MODE = 'off';
  process.env.SPARK_CHAT_LLM_PROVIDER = 'disabled-for-test';
  process.env.SPARK_HOME = tempHome;
  process.env.SPARK_LLM_PROVIDER = 'disabled-for-test';

  const indexModule: any = await import('../src/index');
  const capturedBridgeTexts: string[] = [];
  indexModule.__setBuilderBridgeRunnerForTest(async (updatePayload: Record<string, unknown>) => {
    const messageText = String((updatePayload as any).message?.text || '');
    capturedBridgeTexts.push(messageText);
    return {
      used: true,
      responseText: "Route confidence is Spark's evidence-backed confidence that the selected route matches the latest user intent, without treating safety language as permission to act.",
      decision: 'test',
      bridgeMode: 'test',
      routingDecision: 'plain_chat',
      requestId: 'sim:route-confidence-canary',
      traceRef: 'trace:route-confidence-canary'
    };
  });

  try {
    const replies: string[] = [];
    const replyExtras: unknown[] = [];
    await indexModule.handleTextMessage(makeFakeCtx(replies, replyExtras));

    assert.deepEqual(capturedBridgeTexts, [
      'In one sentence, what does route confidence mean for Spark? Do not start anything.'
    ]);
    assert.match(replies.join('\n'), /Route confidence is Spark/i);
    assert.doesNotMatch(replies.join('\n'), /staying in chat|shape the idea|trigger that would make action appropriate/i);
    const traceContext = (replyExtras[0] as any)?.__sparkTraceContext;
    assert.equal(traceContext?.route, 'plain_conversation');
    assert.equal(traceContext?.replyKind, 'builder_reply');
    assert.equal(traceContext?.proofCapsule?.schema, 'spark.harness_proof.v1');
    assert.equal(traceContext?.proofCapsule?.intent?.noExecution, true);
    assert.equal(traceContext?.proofCapsule?.reply?.delivered, true);
    assert.equal(traceContext?.proofCapsule?.execution?.mutationClass, 'read_only');
  } finally {
    indexModule.__setBuilderBridgeRunnerForTest(null);
    rmSync(tempHome, { recursive: true, force: true });
    restoreEnv();
  }
});
