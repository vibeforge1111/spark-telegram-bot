import assert from 'node:assert/strict';
import {
  resolveChatDefaultProvider,
  resolveKnownChatProviderId,
  resolveMissionDefaultProvider
} from '../src/providerRouting';

function test(name: string, fn: () => void): void {
  try {
    fn();
    console.log(`ok - ${name}`);
  } catch (error) {
    console.error(`not ok - ${name}`);
    throw error;
  }
}

test('keeps chat provider separate from mission provider', () => {
  const env = {
    BOT_DEFAULT_PROVIDER: 'zai',
    SPARK_MISSION_LLM_PROVIDER: 'codex'
  } as NodeJS.ProcessEnv;

  assert.equal(resolveChatDefaultProvider(env), 'zai');
  assert.equal(resolveMissionDefaultProvider(env), 'codex');
});

test('recognizes chat-only provider ids without making them mission providers', () => {
  assert.equal(resolveKnownChatProviderId('openai'), 'openai');
  assert.equal(resolveKnownChatProviderId('ollama'), 'ollama');
  assert.equal(resolveMissionDefaultProvider({
    SPARK_MISSION_LLM_PROVIDER: 'ollama'
  } as NodeJS.ProcessEnv), 'codex');
});

test('recognizes OpenAI-compatible gateway providers for chat and mission routing', () => {
  assert.equal(resolveKnownChatProviderId('openrouter'), 'openrouter');
  assert.equal(resolveKnownChatProviderId('huggingface'), 'huggingface');
  assert.equal(resolveKnownChatProviderId('lmstudio'), 'lmstudio');
  assert.equal(resolveMissionDefaultProvider({
    SPARK_MISSION_LLM_PROVIDER: 'openrouter'
  } as NodeJS.ProcessEnv), 'openrouter');
  assert.equal(resolveMissionDefaultProvider({
    SPARK_MISSION_LLM_PROVIDER: 'lmstudio'
  } as NodeJS.ProcessEnv), 'lmstudio');
});

test('uses explicit Telegram mission override before other mission defaults', () => {
  const env = {
    BOT_DEFAULT_PROVIDER: 'zai',
    DEFAULT_MISSION_PROVIDER: 'claude',
    SPARK_MISSION_LLM_PROVIDER: 'codex',
    SPARK_MISSION_LLM_BOT_PROVIDER: 'minimax'
  } as NodeJS.ProcessEnv;

  assert.equal(resolveMissionDefaultProvider(env), 'minimax');
});

test('does not invent a chat provider when provider env values are unknown', () => {
  const env = {
    BOT_DEFAULT_PROVIDER: 'mystery',
    SPARK_MISSION_LLM_PROVIDER: 'also-mystery'
  } as NodeJS.ProcessEnv;

  assert.equal(resolveChatDefaultProvider(env), 'not_configured');
  assert.equal(resolveMissionDefaultProvider(env), 'codex');
});
