import assert from 'node:assert/strict';
import {
  normalizeModelProvider,
  normalizeModelRole,
  providerIsConfigured,
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
    assert.match(status, /\/model agent claude/);
  } finally {
    process.env = before;
  }
});

test('switches mission provider in memory immediately', async () => {
  const before = { ...process.env };
  try {
    process.env.SPARK_MODULE_CONFIG_DIR = '__missing_test_dir__';
    const reply = await switchModelRoute('mission', 'anthropic');
    assert.match(reply, /Missions now uses claude \(opus\)/);
    assert.equal(resolveMissionDefaultProvider(process.env), 'claude');
    assert.equal(process.env.SPARK_MISSION_LLM_MODEL, 'opus');
  } finally {
    process.env = before;
  }
});

test('switches agent provider in memory immediately', async () => {
  const before = { ...process.env };
  try {
    process.env.SPARK_MODULE_CONFIG_DIR = '__missing_test_dir__';
    const reply = await switchModelRoute('agent', 'anthropic', 'sonnet');
    assert.match(reply, /Agent chat\/runtime\/memory now uses claude \(sonnet\)/);
    const config = resolveChatProviderConfig(process.env);
    assert.equal(config.provider, 'anthropic');
    assert.equal(config.kind, 'claude');
    assert.equal(config.model, 'sonnet');
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
