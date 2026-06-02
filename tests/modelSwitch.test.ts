import assert from 'node:assert/strict';
import { mkdtemp, readdir, readFile, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {
  codexClientConfigArgsFromModelCommand,
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
  assert.equal(normalizeModelProvider('lm studio'), 'lmstudio');
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
    assert.doesNotMatch(status, /Recommended Spark provider paths/);
    assert.doesNotMatch(status, /Choose one provider first/);
    assert.match(status, /\/model agent claude claude-sonnet-4-6/);
    assert.match(status, /\/model mission claude claude-opus-4-7/);
    assert.match(status, /\/model codex fast high/);
  } finally {
    process.env = before;
  }
});

test('parses Codex client config model commands for Telegram', () => {
  assert.deepEqual(codexClientConfigArgsFromModelCommand('agent codex'), { handled: false });
  assert.deepEqual(codexClientConfigArgsFromModelCommand('codex status'), {
    handled: true,
    args: ['providers', 'codex']
  });
  assert.deepEqual(codexClientConfigArgsFromModelCommand('codex fast high'), {
    handled: true,
    args: ['providers', 'codex', '--service-tier', 'fast', '--reasoning-effort', 'high']
  });
  assert.deepEqual(codexClientConfigArgsFromModelCommand('codex model=gpt-5.5 tier=fast reasoning=high'), {
    handled: true,
    args: [
      'providers',
      'codex',
      '--model',
      'gpt-5.5',
      '--service-tier',
      'fast',
      '--reasoning-effort',
      'high'
    ]
  });
  assert.deepEqual(codexClientConfigArgsFromModelCommand('codex model=gpt-5.5 tier=FAST reasoning=HIGH'), {
    handled: true,
    args: [
      'providers',
      'codex',
      '--model',
      'gpt-5.5',
      '--service-tier',
      'fast',
      '--reasoning-effort',
      'high'
    ]
  });
  assert.match(
    (codexClientConfigArgsFromModelCommand('codex weird') as { handled: true; error: string }).error,
    /do not recognize/
  );
  assert.match(
    (codexClientConfigArgsFromModelCommand('codex tier=rocket') as { handled: true; error: string }).error,
    /service tier "rocket"/i
  );
  assert.match(
    (codexClientConfigArgsFromModelCommand('codex reasoning=banana') as { handled: true; error: string }).error,
    /reasoning effort "banana"/i
  );
  assert.match(
    (codexClientConfigArgsFromModelCommand('codex tier=rocket reasoning=banana') as { handled: true; error: string }).error,
    /service tier "rocket"/i
  );
});

test('renders recommended model versions for Claude families', () => {
  assert.equal(recommendedModelFor('anthropic', 'agent'), 'claude-sonnet-4-6');
  assert.equal(recommendedModelFor('anthropic', 'mission'), 'claude-opus-4-7');
  const help = renderModelRecommendations('anthropic');
  assert.match(help, /Choose one provider first/);
  assert.match(help, /Claude sign-in or API key; agent Claude Sonnet 4\.6 \(claude-sonnet-4-6\); mission Claude Opus 4\.7 \(claude-opus-4-7\)/);
  assert.match(help, /Sonnet is the daily driver; Opus is for harder missions/);
});

test('renders paid API and local recommendation lanes', () => {
  const help = renderModelRecommendations();
  assert.match(help, /Have ChatGPT\/Codex: codex with gpt-5\.5/);
  assert.match(help, /Want local\/private: LM Studio for desktop, Ollama for terminal/);
  assert.match(help, /huggingface: Hosted open-model router; agent google\/gemma-4-26B-A4B-it:fastest; mission google\/gemma-4-31B-it:fastest/);
  assert.match(help, /lmstudio: Local\/private desktop/);
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

test('uses a lightweight Ollama default for local model switching', async () => {
  const before = { ...process.env };
  try {
    process.env.SPARK_MODULE_CONFIG_DIR = '__missing_test_dir__';
    const reply = await switchModelRoute('agent', 'ollama');
    assert.match(reply, /Agent chat\/runtime\/memory now uses ollama \(llama3\.2:3b\)/);
    const config = resolveChatProviderConfig(process.env);
    assert.equal(config.provider, 'ollama');
    assert.equal(config.model, 'llama3.2:3b');
  } finally {
    process.env = before;
  }
});

test('persists model env updates through a same-directory temp replacement', async () => {
  const before = { ...process.env };
  const dir = await mkdtemp(path.join(os.tmpdir(), 'spark-model-env-test-'));
  const envPath = path.join(dir, 'spark-telegram-bot.env');
  try {
    await writeFile(envPath, 'SPARK_LLM_PROVIDER=old\nBOT_DEFAULT_PROVIDER=old\n', 'utf8');
    process.env.SPARK_MODULE_CONFIG_DIR = dir;
    delete process.env.SPARK_TELEGRAM_PROFILE;

    const reply = await switchModelRoute('agent', 'ollama');
    const content = await readFile(envPath, 'utf8');
    const leftovers = (await readdir(dir)).filter((name) => name.endsWith('.tmp'));

    assert.match(reply, /Saved for future Spark restarts/);
    assert.match(content, /SPARK_LLM_PROVIDER=ollama/);
    assert.match(content, /BOT_DEFAULT_PROVIDER=ollama/);
    assert.equal(leftovers.length, 0);
  } finally {
    process.env = before;
  }
});

test('supports LM Studio as an explicit local model route', async () => {
  const before = { ...process.env };
  try {
    process.env.SPARK_MODULE_CONFIG_DIR = '__missing_test_dir__';
    const reply = await switchModelRoute('agent', 'lmstudio', 'loaded-local-model');
    assert.match(reply, /Agent chat\/runtime\/memory now uses lmstudio \(loaded-local-model\)/);
    const config = resolveChatProviderConfig(process.env);
    assert.equal(config.provider, 'lmstudio');
    assert.equal(config.kind, 'openai_compat');
    assert.equal(config.baseUrl, 'http://localhost:1234/v1');
    assert.equal(config.model, 'loaded-local-model');
  } finally {
    process.env = before;
  }
});

test('recommends Gemma 4 for Hugging Face agent and mission routes', () => {
  const text = renderModelRecommendations('huggingface');
  assert.match(text, /agent google\/gemma-4-26B-A4B-it:fastest/);
  assert.match(text, /mission google\/gemma-4-31B-it:fastest/);
});

test('supports LM Studio as an explicit local mission route', async () => {
	const before = { ...process.env };
	try {
		process.env.SPARK_MODULE_CONFIG_DIR = '__missing_test_dir__';
		const reply = await switchModelRoute('mission', 'lmstudio', 'loaded-local-model');
		assert.match(reply, /Missions now uses lmstudio \(loaded-local-model\)/);
		assert.equal(resolveMissionDefaultProvider(process.env), 'lmstudio');
		assert.equal(process.env.SPARK_MISSION_LLM_MODEL, 'loaded-local-model');
	} finally {
		process.env = before;
	}
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
