import assert from 'node:assert/strict';
import { buildSparkChatSystemPrompt, codexExecArgs, isCodexProvider, resolveChatProviderConfig } from '../src/llm';

function test(name: string, fn: () => void): void {
  try {
    fn();
    console.log(`ok - ${name}`);
  } catch (err) {
    console.error(`not ok - ${name}`);
    throw err;
  }
}

test('recognizes Codex as the local LLM provider', () => {
  assert.equal(isCodexProvider('codex'), true);
  assert.equal(isCodexProvider(' CODEX '), true);
  assert.equal(isCodexProvider('ollama'), false);
});

test('uses LM Studio as OpenAI-compatible chat provider instead of implicit Ollama', () => {
  const config = resolveChatProviderConfig({
    SPARK_CHAT_LLM_PROVIDER: 'openai',
    OPENAI_BASE_URL: 'http://localhost:1234/v1',
    OPENAI_MODEL: 'google/gemma-4-04b-2',
  });

  assert.equal(config.provider, 'openai');
  assert.equal(config.kind, 'openai_compat');
  assert.equal(config.baseUrl, 'http://localhost:1234/v1');
  assert.equal(config.model, 'google/gemma-4-04b-2');
});

test('does not let OpenAI-compatible model settings mask Codex chat model', () => {
  const config = resolveChatProviderConfig({
    SPARK_CHAT_LLM_PROVIDER: 'codex',
    OPENAI_MODEL: 'google/gemma-4-04b-2',
  });

  assert.equal(config.provider, 'codex');
  assert.equal(config.kind, 'codex');
  assert.equal(config.model, 'gpt-5.5');
});

test('does not fall back to Ollama unless Ollama is selected or configured', () => {
  const config = resolveChatProviderConfig({
    OLLAMA_URL: 'http://localhost:11434',
    OLLAMA_MODEL: 'llama3.2',
  });

  assert.equal(config.provider, 'not_configured');
  assert.equal(config.kind, 'not_configured');
});

test('uses explicit Ollama provider when selected', () => {
  const config = resolveChatProviderConfig({
    SPARK_CHAT_LLM_PROVIDER: 'ollama',
    OLLAMA_URL: 'http://localhost:11434',
    OLLAMA_MODEL: 'llama3.2',
  });

  assert.equal(config.provider, 'ollama');
  assert.equal(config.kind, 'ollama');
  assert.equal(config.baseUrl, 'http://localhost:11434');
  assert.equal(config.model, 'llama3.2');
});

test('uses a small installed-friendly Ollama default when no model is selected', () => {
  const config = resolveChatProviderConfig({
    SPARK_CHAT_LLM_PROVIDER: 'ollama',
  });

  assert.equal(config.provider, 'ollama');
  assert.equal(config.kind, 'ollama');
  assert.equal(config.model, 'llama3.2:3b');
});

test('uses explicit OpenRouter provider without being masked by other keys', () => {
  const config = resolveChatProviderConfig({
    SPARK_CHAT_LLM_PROVIDER: 'openrouter',
    OPENROUTER_API_KEY: 'or-key',
    OPENROUTER_MODEL: 'anthropic/claude-sonnet-4.5',
    ZAI_API_KEY: 'old-zai-key',
    OLLAMA_URL: 'http://localhost:11434',
  });

  assert.equal(config.provider, 'openrouter');
  assert.equal(config.kind, 'openai_compat');
  assert.equal(config.baseUrl, 'https://openrouter.ai/api/v1');
  assert.equal(config.model, 'anthropic/claude-sonnet-4.5');
  assert.equal(config.apiKey, 'or-key');
});

test('uses LM Studio as a named OpenAI-compatible local provider', () => {
  const config = resolveChatProviderConfig({
    SPARK_CHAT_LLM_PROVIDER: 'lmstudio',
    LMSTUDIO_BASE_URL: 'http://localhost:1234/v1',
    LMSTUDIO_MODEL: 'qwen-local',
  });

  assert.equal(config.provider, 'lmstudio');
  assert.equal(config.kind, 'openai_compat');
  assert.equal(config.baseUrl, 'http://localhost:1234/v1');
  assert.equal(config.model, 'qwen-local');
  assert.equal(config.apiKey, 'lm-studio');
});

test('uses explicit Hugging Face router provider', () => {
  const config = resolveChatProviderConfig({
    SPARK_CHAT_LLM_PROVIDER: 'huggingface',
    HF_TOKEN: 'hf-key',
    HUGGINGFACE_MODEL: 'google/gemma-4-26B-A4B-it:fastest',
  });

  assert.equal(config.provider, 'huggingface');
  assert.equal(config.kind, 'openai_compat');
  assert.equal(config.baseUrl, 'https://router.huggingface.co/v1');
  assert.equal(config.model, 'google/gemma-4-26B-A4B-it:fastest');
  assert.equal(config.apiKey, 'hf-key');
});

test('uses explicit Kimi provider without being masked by other keys', () => {
  const config = resolveChatProviderConfig({
    SPARK_CHAT_LLM_PROVIDER: 'kimi',
    KIMI_API_KEY: 'kimi-key',
    KIMI_MODEL: 'kimi-k2.6',
    ZAI_API_KEY: 'old-zai-key',
  });

  assert.equal(config.provider, 'kimi');
  assert.equal(config.kind, 'openai_compat');
  assert.equal(config.baseUrl, 'https://api.moonshot.ai/v1');
  assert.equal(config.model, 'kimi-k2.6');
  assert.equal(config.apiKey, 'kimi-key');
});

test('uses Gemma 4 as the Hugging Face default chat model', () => {
  const config = resolveChatProviderConfig({
    SPARK_CHAT_LLM_PROVIDER: 'huggingface',
    HF_TOKEN: 'hf-key',
  });

  assert.equal(config.provider, 'huggingface');
  assert.equal(config.kind, 'openai_compat');
  assert.equal(config.model, 'google/gemma-4-26B-A4B-it:fastest');
});

test('builds Codex exec args for non-git Spark workspaces', () => {
  assert.deepEqual(codexExecArgs('gpt-5.5', '/tmp/last-message.txt'), [
    'exec',
    '--skip-git-repo-check',
    '--model',
    'gpt-5.5',
    '--sandbox',
    'read-only',
    '--output-last-message',
    '/tmp/last-message.txt',
    '-',
  ]);
});

test('system prompt teaches fresh Spark installs their ecosystem', () => {
  const prompt = buildSparkChatSystemPrompt('', '');

  assert.match(prompt, /What Spark can do in this install/);
  assert.match(prompt, /Telegram chat/);
  assert.match(prompt, /Builder/);
  assert.match(prompt, /domain-chip-memory/);
  assert.match(prompt, /Spark Researcher/);
  assert.match(prompt, /Spawner UI/);
  assert.match(prompt, /\/remember <text>/);
  assert.match(prompt, /Not a generic assistant/);
});

test('system prompt includes memory and conversation context when provided', () => {
  const prompt = buildSparkChatSystemPrompt('Last turn: we discussed onboarding.', 'User likes concise warm replies.');

  assert.match(prompt, /## What I remember/);
  assert.match(prompt, /User likes concise warm replies/);
  assert.match(prompt, /## Where we left off/);
  assert.match(prompt, /we discussed onboarding/);
});

test('system prompt asks for skimmable Telegram formatting', () => {
  const prompt = buildSparkChatSystemPrompt('', '');

  assert.match(prompt, /short paragraphs/);
  assert.match(prompt, /Avoid Markdown bold\/italic emphasis/);
  assert.match(prompt, /plain headings or simple numbered points/);
});

test('system prompt prioritizes local list references over older memory', () => {
  const prompt = buildSparkChatSystemPrompt('', '');

  assert.match(prompt, /numbered or listed option/);
  assert.match(prompt, /most recent list/);
  assert.match(prompt, /Memory must not override/);
  assert.match(prompt, /Do not offer to scaffold/);
});

test('uses Claude Code print mode when Anthropic is selected for chat', () => {
  const config = resolveChatProviderConfig({
    SPARK_CHAT_LLM_PROVIDER: 'anthropic',
    SPARK_CHAT_LLM_MODEL: 'opus',
  });

  assert.equal(config.provider, 'anthropic');
  assert.equal(config.kind, 'claude');
  assert.equal(config.model, 'opus');
});

test('system prompt treats Spawner Kanban and Canvas as existing surfaces', () => {
  const prompt = buildSparkChatSystemPrompt('', '');

  assert.match(prompt, /Kanban, Canvas, Mission Control/);
  assert.match(prompt, /already exist in spawner-ui/);
  assert.match(prompt, /Do not suggest a standalone app/);
});
