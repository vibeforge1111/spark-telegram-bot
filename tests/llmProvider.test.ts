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

test('does not fall back to Ollama unless Ollama is selected or configured', () => {
  const config = resolveChatProviderConfig({});

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
