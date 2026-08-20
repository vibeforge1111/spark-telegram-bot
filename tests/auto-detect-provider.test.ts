import assert from 'node:assert/strict';

function test(name: string, fn: () => void): void {
  try {
    fn();
    console.log(`ok - ${name}`);
  } catch (error) {
    console.error(`not ok - ${name}`);
    throw error;
  }
}

// PR #110: Auto-detect chat provider from API keys without SPARK_ALLOW_IMPLICIT_LLM_PROVIDER flag

// Simulate the OLD behavior (required flag)
function oldResolveProvider(env: Record<string, string | undefined>): string | undefined {
  if (env.SPARK_CHAT_LLM_PROVIDER) return env.SPARK_CHAT_LLM_PROVIDER;
  if (env.SPARK_ALLOW_IMPLICIT_LLM_PROVIDER === '1') {
    if (env.ZAI_API_KEY) return 'zai';
    if (env.MINIMAX_API_KEY) return 'minimax';
    if (env.ANTHROPIC_API_KEY || env.CLAUDE_API_KEY) return 'anthropic';
  }
  return undefined;
}

// Simulate the NEW behavior (auto-detect without flag)
function newResolveProvider(env: Record<string, string | undefined>): string | undefined {
  if (env.SPARK_CHAT_LLM_PROVIDER) return env.SPARK_CHAT_LLM_PROVIDER;
  // Auto-detect from API keys regardless of SPARK_ALLOW_IMPLICIT_LLM_PROVIDER
  if (env.ZAI_API_KEY) return 'zai';
  if (env.MINIMAX_API_KEY) return 'minimax';
  if (env.ANTHROPIC_API_KEY || env.CLAUDE_API_KEY) return 'anthropic';
  if (env.OLLAMA_URL && env.OLLAMA_MODEL) return 'ollama';
  return undefined;
}

test('oldResolveProvider returns undefined without SPARK_ALLOW_IMPLICIT_LLM_PROVIDER flag', () => {
  const provider = oldResolveProvider({ ANTHROPIC_API_KEY: 'sk-ant-xxx' });
  assert.equal(provider, undefined);
});

test('newResolveProvider auto-detects anthropic from ANTHROPIC_API_KEY without flag', () => {
  const provider = newResolveProvider({ ANTHROPIC_API_KEY: 'sk-ant-xxx' });
  assert.equal(provider, 'anthropic');
});

test('newResolveProvider auto-detects zai from ZAI_API_KEY', () => {
  const provider = newResolveProvider({ ZAI_API_KEY: 'zai-xxx' });
  assert.equal(provider, 'zai');
});

test('newResolveProvider auto-detects minimax from MINIMAX_API_KEY', () => {
  const provider = newResolveProvider({ MINIMAX_API_KEY: 'mm-xxx' });
  assert.equal(provider, 'minimax');
});

test('newResolveProvider respects explicit SPARK_CHAT_LLM_PROVIDER', () => {
  const provider = newResolveProvider({
    SPARK_CHAT_LLM_PROVIDER: 'openai',
    ANTHROPIC_API_KEY: 'sk-ant-xxx',
  });
  assert.equal(provider, 'openai');
});

test('newResolveProvider returns undefined when no keys are configured', () => {
  const provider = newResolveProvider({ PATH: '/usr/bin' });
  assert.equal(provider, undefined);
});

test('newResolveProvider detects ollama from OLLAMA_URL and OLLAMA_MODEL', () => {
  const provider = newResolveProvider({
    OLLAMA_URL: 'http://localhost:11434',
    OLLAMA_MODEL: 'llama3.2',
  });
  assert.equal(provider, 'ollama');
});
