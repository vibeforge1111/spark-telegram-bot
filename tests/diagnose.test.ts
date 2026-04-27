import assert from 'node:assert/strict';
import {
  describeAccessDiagnostics,
  describeBuilderBridgeHealth,
  describeChatProviderHealth,
  describeRelayHealth,
  describeProviderStatus,
  getRelayIdentityFromEnv,
  inferDiagnoseLikelyIssue,
  resolveDiagnoseRouteProviders,
  selectPingProviderIds,
  type DiagnoseSubject,
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

  const description = describeProviderStatus(provider);
  assert.equal(description.ready, true);
  assert.equal(description.note, 'cli');
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

  const description = describeProviderStatus(provider, new Set(['zai']));
  assert.equal(description.ready, false);
  assert.equal(description.note, 'key missing');
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

test('diagnostics keep OpenAI-compatible chat separate from Codex mission routing', () => {
  const routes = resolveDiagnoseRouteProviders({
    BOT_DEFAULT_PROVIDER: 'codex',
    DEFAULT_MISSION_PROVIDER: 'codex',
    SPARK_CHAT_LLM_PROVIDER: 'openai',
    SPARK_CHAT_LLM_BASE_URL: 'http://localhost:1234/v1',
    OPENAI_MODEL: 'google/gemma-4-04b-2',
  } as NodeJS.ProcessEnv, 'codex');

  assert.equal(routes.chatProvider, 'openai');
  assert.equal(routes.telegramRunProvider, 'codex');
  assert.equal(routes.spawnerDefaultProvider, 'codex');
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
    profile: 'primary'
  });
});

test('describes relay identity mismatches clearly', () => {
  const expected = { port: 8789, profile: 'spark-agi' };

  assert.match(
    describeRelayHealth({
      ok: true,
      status: 200,
      payload: { relay: { port: 8789, profile: 'spark-agi' } }
    }, expected),
    /Bot mission relay \(:8789\/spark-agi\): .*$/,
  );

  assert.match(
    describeRelayHealth({
      ok: true,
      status: 200,
      payload: { relay: { port: 8788, profile: 'spark-agi' } }
    }, expected),
    /identity mismatch \(8788 \/ spark-agi\)$/
  );

  assert.match(
    describeRelayHealth({ ok: false, err: 'ECONNREFUSED' }, expected),
    /ECONNREFUSED$/
  );
});

test('describes HTTP failures as relay errors', () => {
  assert.match(
    describeRelayHealth({ ok: false, status: 401, err: 'HTTP 401' }, { port: 8788, profile: 'primary' }),
    /HTTP 401$/
  );
});

test('describes plain chat bridge and provider health', () => {
  assert.equal(
    describeBuilderBridgeHealth({
      mode: 'required',
      available: false,
      builderRepo: 'C:\\spark-intelligence-builder',
      builderHome: 'C:\\spark\\state'
    }),
    'Builder bridge: ❌ unavailable (required)'
  );
  assert.equal(
    describeBuilderBridgeHealth({
      mode: 'auto',
      available: true,
      builderRepo: 'C:\\spark-intelligence-builder',
      builderHome: 'C:\\spark\\state'
    }),
    'Builder bridge: ✅ available (auto)'
  );
  assert.equal(
    describeChatProviderHealth({ ok: false, detail: 'request failed' }, 'zai (glm-5.1)'),
    'Chat provider completion: ❌ zai (glm-5.1) (request failed)'
  );
});

test('describes access diagnostics without leaking ids', () => {
  const subject: DiagnoseSubject = {
    userId: 123,
    chatId: 456,
    isAdmin: false,
    isAllowed: false
  };
  const lines = describeAccessDiagnostics(subject, 'Level 3 - Research + Build', {
    ADMIN_TELEGRAM_IDS: '111,222',
    ALLOWED_TELEGRAM_IDS: '333',
    TELEGRAM_PUBLIC_CHAT_ENABLED: '0'
  } as NodeJS.ProcessEnv);

  assert.deepEqual(lines, [
    'Current user: ❌ not allowed',
    'Access level: Level 3 - Research + Build',
    'Configured operators: admins=2, allowed=1, public=off'
  ]);
});

test('infers likely diagnose issue from user-facing failure class', () => {
  const base = {
    subject: {
      userId: 123,
      chatId: 456,
      isAdmin: false,
      isAllowed: true
    },
    botRelayOk: true,
    spawnerOk: true,
    builder: {
      mode: 'auto' as const,
      available: true,
      builderRepo: 'repo',
      builderHome: 'home'
    },
    chatProviderOk: true,
    missionPingOk: true
  };

  assert.match(
    inferDiagnoseLikelyIssue({
      ...base,
      subject: { ...base.subject, isAllowed: false }
    }),
    /not allowed/
  );
  assert.match(
    inferDiagnoseLikelyIssue({
      ...base,
      chatProviderOk: false
    }),
    /plain chat provider is unhealthy/
  );
  assert.match(
    inferDiagnoseLikelyIssue({
      ...base,
      builder: {
        mode: 'required',
        available: false,
        builderRepo: 'repo',
        builderHome: 'home'
      }
    }),
    /Builder bridge is required/
  );
});
