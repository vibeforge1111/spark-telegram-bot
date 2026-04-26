import assert from 'node:assert/strict';
import {
  describeRelayHealth,
  describeProviderStatus,
  getRelayIdentityFromEnv,
  selectPingProviderIds,
  type ProviderStatus
} from '../src/diagnose';

function test(name: string, fn: () => void): void {
  try {
    fn();
    console.log(`ok - ${name}`);
  } catch (error) {
    console.error(`not ok - ${name}`);
    throw error;
  }
}

test('reports terminal CLI providers as ready without API keys', () => {
  const provider: ProviderStatus = {
    id: 'codex',
    label: 'Codex',
    model: 'gpt-5.5',
    kind: 'terminal_cli',
    requiresApiKey: false,
    envKeyConfigured: false,
    cliConfigured: true,
    configured: true,
    configurationMode: 'cli'
  };

  assert.deepEqual(describeProviderStatus(provider), {
    ready: true,
    icon: '✅',
    note: 'cli'
  });
});

test('marks selected API-key providers missing when no key is configured', () => {
  const provider: ProviderStatus = {
    id: 'zai',
    label: 'Z.AI',
    model: 'glm-5.1',
    kind: 'openai_compat',
    requiresApiKey: true,
    envKeyConfigured: false,
    configured: false,
    configurationMode: 'none'
  };

  assert.deepEqual(describeProviderStatus(provider, new Set(['zai'])), {
    ready: false,
    icon: '❌',
    note: 'key missing'
  });
});

test('pings selected Spawner route providers only', () => {
  const providers: ProviderStatus[] = [
    {
      id: 'codex',
      label: 'Codex',
      kind: 'terminal_cli',
      requiresApiKey: false,
      cliConfigured: true,
      configured: true
    },
    {
      id: 'zai',
      label: 'Z.AI',
      kind: 'openai_compat',
      requiresApiKey: true,
      envKeyConfigured: false,
      configured: false
    },
    {
      id: 'minimax',
      label: 'MiniMax',
      kind: 'openai_compat',
      requiresApiKey: true,
      envKeyConfigured: false,
      configured: false
    }
  ];

  assert.deepEqual(selectPingProviderIds(providers, ['zai']), ['zai']);
});

test('uses the active Telegram relay profile and port for diagnostics', () => {
  assert.deepEqual(getRelayIdentityFromEnv({
    TELEGRAM_RELAY_PORT: '8789',
    SPARK_TELEGRAM_PROFILE: 'spark-agi'
  } as NodeJS.ProcessEnv), {
    port: 8789,
    profile: 'spark-agi'
  });

  assert.deepEqual(getRelayIdentityFromEnv({
    TELEGRAM_RELAY_PORT: 'nope',
    SPARK_TELEGRAM_PROFILE: ''
  } as NodeJS.ProcessEnv), {
    port: 8788,
    profile: 'default'
  });
});

test('describes relay identity mismatches clearly', () => {
  const expected = { port: 8789, profile: 'spark-agi' };

  assert.equal(
    describeRelayHealth({
      ok: true,
      status: 200,
      payload: { relay: { port: 8789, profile: 'spark-agi' } }
    }, expected),
    '• Bot mission relay (:8789/spark-agi): ✅'
  );

  assert.equal(
    describeRelayHealth({
      ok: true,
      status: 200,
      payload: { relay: { port: 8788, profile: 'default' } }
    }, expected),
    '• Bot mission relay (:8789/spark-agi): ❌ identity mismatch (8788 / default)'
  );

  assert.equal(
    describeRelayHealth({ ok: false, err: 'ECONNREFUSED' }, expected),
    '• Bot mission relay (:8789/spark-agi): ❌ ECONNREFUSED'
  );
});
