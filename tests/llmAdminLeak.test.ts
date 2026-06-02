import assert from 'node:assert/strict';
import { llm } from '../src/llm';

// Regression test for TB-1: llm.chat()/chatStream() rendered provider-error
// replies with isAdmin hardcoded true, leaking operator-only guidance to
// non-admin Telegram users. This test uses ONLY the public 1-3 argument call
// shape that exists in BOTH the buggy and fixed code, so it compiles against
// either tree: it FAILS on the buggy code (the default reply contains the
// operator strings) and PASSES once the default render is non-admin.

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

// Every env var resolveChatProviderConfig() consults to pick a provider.
// Unsetting all forces config.kind === 'not_configured', so chat()/chatStream()
// throw the "not configured" error and hit the error renderer WITHOUT network.
const PROVIDER_ENV_KEYS = [
  'SPARK_CHAT_LLM_PROVIDER', 'LLM_PROVIDER', 'SPARK_LLM_PROVIDER',
  'SPARK_CHAT_LLM_BOT_PROVIDER', 'BOT_DEFAULT_PROVIDER', 'SPARK_BOT_DEFAULT_PROVIDER',
  'SPARK_ALLOW_IMPLICIT_LLM_PROVIDER', 'OPENAI_API_KEY', 'ANTHROPIC_API_KEY',
  'CLAUDE_API_KEY', 'ZAI_API_KEY', 'MINIMAX_API_KEY', 'OPENROUTER_API_KEY',
  'HF_TOKEN', 'HUGGINGFACE_API_KEY', 'KIMI_API_KEY', 'MOONSHOT_API_KEY',
  'OLLAMA_URL', 'OLLAMA_MODEL',
] as const;

const OPERATOR_ONLY_STRINGS = [
  'spark doctor llm',
  'Operator fix:',
  '--save-report',
  '--upstream-report',
  'upstream PR draft',
];

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

function assertNoLeak(reply: string, label: string): void {
  for (const leak of OPERATOR_ONLY_STRINGS) {
    assert.ok(
      !reply.includes(leak),
      `${label} must not contain operator-only string ${JSON.stringify(leak)}; got: ${reply}`
    );
  }
}

async function run(): Promise<void> {
  await test('llm.chat default reply does not leak operator-only guidance to non-admin users', async () => {
    clearProviderEnv();
    try {
      const reply = await llm.chat('hi', '', '');
      assert.match(reply, /Please ask the operator/);
      assertNoLeak(reply, 'non-admin chat reply');
    } finally {
      restoreEnv();
    }
  });

  await test('llm.chatStream default reply does not leak operator-only guidance to non-admin users', async () => {
    clearProviderEnv();
    try {
      const reply = await llm.chatStream('hi', '', '');
      assert.match(reply, /Please ask the operator/);
      assertNoLeak(reply, 'non-admin stream reply');
    } finally {
      restoreEnv();
    }
  });
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
