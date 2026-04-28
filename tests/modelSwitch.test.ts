import assert from 'node:assert/strict';
import {
  normalizeModelProvider,
  normalizeModelRole,
  providerIsConfigured,
  recommendedModelFor,
  renderModelRecommendations,
  renderModelStatus,
  switchModelRoute
} from '../src/modelSwitch';
import { resolveChatProviderConfig } from '../src/llm';
import { resolveMissionDefaultProvider } from '../src/providerRouting';

const tests: Array<{ name: string; fn: () => void | Promise<void> }> = [];

function test(name: string, fn: () => void | Promise<void>): void {
  tests.push({ name, fn });
}

test('normalizes Telegram model switch aliases', () => {
  assert.equal(normalizeModelRole('chat'), 'agent');
  assert.equal(normalizeModelRole('spawner'), 'mission');
  assert.equal(normalizeModelProvider('claude'), 'anthropic');
  assert.equal(normalizeModelProvider('glm'), 'zai');
});

test('renders a model status help surface', () => {
  const before = { ...process.env };
  try {
    process.env.SPARK_CHAT_LLM_PROVIDER = 'zai';
    process.env.SPARK_CHAT_LLM_MODEL = 'glm-5.1';
    process.env.SPARK_MISSION_LLM_PROVIDER = 'codex';
    process.env.SPARK_MISSION_LLM_MODEL = 'gpt-5.5';
    const status = renderModelStatus();
    assert.match(status, /Agent chat: zai \(glm-5\.1\)/);
    assert.match(status, /Missions: codex \(gpt-5\.5\)/);
    assert.match(status, /\/model agent claude claude-sonnet-4-6/);
    assert.match(status, /\/model mission claude claude-opus-4-7/);
  } finally {
    process.env = before;
  }
});

test('renders recommended model versions for Claude families', () => {
  assert.equal(recommendedModelFor('anthropic', 'agent'), 'claude-sonnet-4-6');
  assert.equal(recommendedModelFor('anthropic', 'mission'), 'claude-opus-4-7');
  const help = renderModelRecommendations('anthropic');
  assert.match(help, /agent Claude Sonnet 4\.6 \(claude-sonnet-4-6\)/);
  assert.match(help, /mission Claude Opus 4\.7 \(claude-opus-4-7\)/);
});

test('switches mission provider in memory immediately', async () => {
  const before = { ...process.env };
  try {
    process.env.SPARK_MODULE_CONFIG_DIR = '__missing_test_dir__';
    const reply = await switchModelRoute('mission', 'anthropic');
    assert.match(reply, /Missions now uses claude \(Claude Opus 4\.7 \(claude-opus-4-7\)\)/);
    assert.equal(resolveMissionDefaultProvider(process.env), 'claude');
    assert.equal(process.env.SPARK_MISSION_LLM_MODEL, 'claude-opus-4-7');
  } finally {
    process.env = before;
  }
});

test('switches agent provider in memory immediately', async () => {
  const before = { ...process.env };
  try {
    process.env.SPARK_MODULE_CONFIG_DIR = '__missing_test_dir__';
    const reply = await switchModelRoute('agent', 'anthropic');
    assert.match(reply, /Agent chat\/runtime\/memory now uses claude \(Claude Sonnet 4\.6 \(claude-sonnet-4-6\)\)/);
    const config = resolveChatProviderConfig(process.env);
    assert.equal(config.provider, 'anthropic');
    assert.equal(config.kind, 'claude');
    assert.equal(config.model, 'claude-sonnet-4-6');
  } finally {
    process.env = before;
  }
});

test('refuses API providers when no key is configured', () => {
  assert.equal(providerIsConfigured('zai', {} as NodeJS.ProcessEnv), false);
  assert.equal(providerIsConfigured('codex', {} as NodeJS.ProcessEnv), true);
  assert.equal(providerIsConfigured('anthropic', {} as NodeJS.ProcessEnv), true);
});

(async () => {
  for (const entry of tests) {
    try {
      await entry.fn();
      console.log(`ok - ${entry.name}`);
    } catch (error) {
      console.error(`not ok - ${entry.name}`);
      throw error;
    }
  }
})();
