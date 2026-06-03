import assert from 'node:assert/strict';
import { llm } from '../src/llm';

// Coverage for the TB-1 fix API: llm.chat()/chatStream() accept the caller's
// admin status and render the provider-error reply accordingly. This file uses
// the post-fix options argument, so it is expected to compile/pass only on the
// fixed tree. The failing->passing regression lives in llmAdminLeak.test.ts.

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

const PROVIDER_ENV_KEYS = [
  'SPARK_CHAT_LLM_PROVIDER', 'LLM_PROVIDER', 'SPARK_LLM_PROVIDER',
  'SPARK_CHAT_LLM_BOT_PROVIDER', 'BOT_DEFAULT_PROVIDER', 'SPARK_BOT_DEFAULT_PROVIDER',
  'SPARK_ALLOW_IMPLICIT_LLM_PROVIDER', 'OPENAI_API_KEY', 'ANTHROPIC_API_KEY',
  'CLAUDE_API_KEY', 'ZAI_API_KEY', 'MINIMAX_API_KEY', 'OPENROUTER_API_KEY',
  'HF_TOKEN', 'HUGGINGFACE_API_KEY', 'KIMI_API_KEY', 'MOONSHOT_API_KEY',
  'OLLAMA_URL', 'OLLAMA_MODEL',
] as const;

const saved: Record<string, string | undefined> = {};

function clearProviderEnv(): void {
  for (const key of PROVIDER_ENV_KEYS) {
    saved[key] = process.env[key];
    delete (process.env as Record<string, string | undefined>)[key];
  }
  saved.SPARK_AGENT_KNOWLEDGE_ENABLED = process.env.SPARK_AGENT_KNOWLEDGE_ENABLED;
  process.env.SPARK_AGENT_KNOWLEDGE_ENABLED = '0';
}

function restoreEnv(): void {
  for (const [key, value] of Object.entries(saved)) {
    if (value === undefined) delete (process.env as Record<string, string | undefined>)[key];
    else (process.env as Record<string, string>)[key] = value;
  }
}

async function run(): Promise<void> {
  await test('explicit non-admin caller gets no operator guidance', async () => {
    clearProviderEnv();
    try {
      const reply = await llm.chat('hi', '', '', { isAdmin: false });
      assert.match(reply, /Please ask the operator/);
      assert.ok(!reply.includes('spark doctor llm'));
    } finally {
      restoreEnv();
    }
  });

  await test('admin caller still receives operator guidance', async () => {
    clearProviderEnv();
    try {
      const reply = await llm.chat('hi', '', '', { isAdmin: true });
      assert.match(reply, /spark doctor llm/);
    } finally {
      restoreEnv();
    }
  });

  await test('chatStream honors the caller admin flag', async () => {
    clearProviderEnv();
    try {
      const reply = await llm.chatStream('hi', '', '', undefined, { isAdmin: false });
      assert.match(reply, /Please ask the operator/);
      assert.ok(!reply.includes('spark doctor llm'));
    } finally {
      restoreEnv();
    }
  });
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
