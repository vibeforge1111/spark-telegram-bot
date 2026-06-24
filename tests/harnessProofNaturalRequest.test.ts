import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { buildHarnessProofCapsule } from '../src/harnessProofCapsule';
import { isNaturalHarnessProofInspectRequest } from '../src/harnessProofNaturalRequest';

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

const originalEnv = {
  ADMIN_TELEGRAM_IDS: process.env.ADMIN_TELEGRAM_IDS,
  LLM_PROVIDER: process.env.LLM_PROVIDER,
  SPARK_ALLOW_IMPLICIT_LLM_PROVIDER: process.env.SPARK_ALLOW_IMPLICIT_LLM_PROVIDER,
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

function disableLocalProviderFallback(): void {
  process.env.LLM_PROVIDER = 'disabled-for-test';
  process.env.SPARK_CHAT_LLM_PROVIDER = 'disabled-for-test';
  process.env.SPARK_LLM_PROVIDER = 'disabled-for-test';
  process.env.SPARK_ALLOW_IMPLICIT_LLM_PROVIDER = '0';
}

function fakeCtx(replies: string[], replyExtras: any[]) {
  return {
    chat: { id: 8319079055, type: 'private' },
    from: { id: 8319079055, username: 'cem' },
    message: {
      message_id: 629,
      text: 'Show me whether the last action has Harness proof, but do not run anything new.'
    },
    update: { update_id: 629 },
    sendChatAction: async (_action: string) => {},
    reply: async (text: string, extra?: any) => {
      replies.push(text);
      replyExtras.push(extra);
    }
  };
}

async function run(): Promise<void> {
  await test('recognizes inspect-only natural Harness proof requests', () => {
    assert.equal(
      isNaturalHarnessProofInspectRequest('Show me whether the last action has Harness proof, but do not run anything new.'),
      true
    );
    assert.equal(isNaturalHarnessProofInspectRequest('Can you check the latest proof panel without starting anything?'), true);
    assert.equal(isNaturalHarnessProofInspectRequest('What does Harness proof mean for Spark?'), false);
    assert.equal(isNaturalHarnessProofInspectRequest('Prove that the new feature idea is good.'), false);
  });

  await test('natural Harness proof inspection reuses the inspect-only proof panel', async () => {
    restoreEnv();
    disableLocalProviderFallback();
    process.env.ADMIN_TELEGRAM_IDS = '8319079055';
    const tempRoot = mkdtempSync(path.join(os.tmpdir(), 'spark-natural-proof-command-'));
    process.env.SPARK_HOME = tempRoot;
    try {
      const proofCapsule = buildHarnessProofCapsule({
        turnRef: 'turn:natural-proof-command',
        route: 'plain_conversation',
        owner: 'spark-telegram-bot',
        intent: { kind: 'plain_conversation', confidence: 'explicit', noExecution: true },
        authority: {
          decision: 'downgraded',
          contract: 'spark.turn_intent.v1',
          riskTier: 'read',
          reasonSummary: 'tool_not_allowed_by_policy /Users/example/private'
        },
        governor: { decision: 'read_only', verified: true },
        execution: { status: 'completed', tool: 'none', mutationClass: 'none' },
        reply: { delivered: true, shape: 'natural', rawReasonsHidden: true },
        joins: { telegram: 'joined' }
      });
      const auditPath = path.join(tempRoot, 'state', 'spark-telegram-bot', 'final-answer-gate-audit.jsonl');
      mkdirSync(path.dirname(auditPath), { recursive: true });
      writeFileSync(auditPath, `${JSON.stringify({
        request_id: 'raw-natural-proof-request',
        trace_ref: 'trace:raw-natural-proof',
        harness_proof_ref: proofCapsule.turnRef,
        proof_capsule: proofCapsule
      })}\n`, 'utf8');

      const replies: string[] = [];
      const replyExtras: any[] = [];
      const indexModule: any = await import('../src/index');
      await indexModule.handleTextMessage(fakeCtx(replies, replyExtras));

      assert.match(replies[0] || '', /Harness Proof/);
      assert.match(replies[0] || '', /Authority: downgraded/);
      assert.match(replies[0] || '', /Execution: completed/);
      assert.doesNotMatch(
        replies.join('\n'),
        /unproven here|do not have the actual proof capsule|raw-natural-proof|\/Users\/example|tool_not_allowed_by_policy/
      );
      assert.deepEqual(replyExtras[0]?.__sparkTraceContext?.route, 'proof.inspect');
      assert.deepEqual(replyExtras[0]?.__sparkTraceContext?.command, 'proof');
      assert.deepEqual(replyExtras[0]?.__sparkTraceContext?.replyKind, 'proof_panel');
      assert.equal(replyExtras[0]?.__sparkTraceContext?.proofRef, proofCapsule.turnRef);
    } finally {
      rmSync(tempRoot, { recursive: true, force: true });
      restoreEnv();
    }
  });
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
