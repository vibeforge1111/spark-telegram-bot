import assert from 'node:assert/strict';
import {
  buildDiagnosePingExecutionAuthority,
  describeAccessDiagnostics,
  describeBuilderBridgeHealth,
  describeChatProviderHealth,
  describeRouteDivergence,
  describeRelayHealth,
  describeProviderStatus,
  describeSpawnerPublicLinkHealth,
  getRelayIdentityFromEnv,
  inferDiagnoseLikelyIssue,
  readableLocalServiceUrl,
  renderDiagnoseReportHtml,
  resolveDiagnoseRouteProviders,
  selectPingProviderIds,
  type DiagnoseSubject,
  type ProviderStatus
} from '../src/diagnose';
import type { NaturalRouteExecutionRecord } from '../src/naturalRouteLedger';

function test(name: string, fn: () => void): void {
  try {
    fn();
    console.log(`ok - ${name}`);
  } catch (error) {
    console.error(`not ok - ${name}`);
    throw error;
  }
}

function routeRecord(
  shadowRoute: string,
  executedRoute: string,
  outcome: NaturalRouteExecutionRecord['outcome'] = shadowRoute === executedRoute ? 'matched' : 'mismatch'
): NaturalRouteExecutionRecord {
  return {
    schema_version: 'spark.nlp.route_execution.v1',
    recorded_at: '2026-06-10T00:00:00.000Z',
    profile: 'test',
    user_id: 'user_redacted',
    chat_id: 'chat_redacted',
    chat_type: 'private',
    admin: true,
    shadow_route: shadowRoute,
    shadow_owner: shadowRoute === 'spawner.build' ? 'spawner-ui' : 'none',
    shadow_confidence: 'explicit',
    shadow_context_source: 'latest_message',
    shadow_requires_confirmation: false,
    shadow_signals: [],
    shadow_blocked_by: [],
    executed_route: executedRoute,
    executed_owner: executedRoute === 'spawner.build' ? 'spawner-ui' : 'spark-telegram-bot',
    executed_action: executedRoute,
    outcome,
    delivery: 'selected'
  };
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

test('marks hosted local OpenAI-compatible providers as endpoint unavailable', () => {
  const provider: ProviderStatus = {
    id: 'ollama',
    label: 'Ollama',
    model: 'llama3.2:3b',
    kind: 'openai_compat',
    requiresApiKey: false,
    configured: false,
    configurationMode: 'none'
  };

  const optional = describeProviderStatus(provider);
  assert.equal(optional.ready, false);
  assert.equal(optional.note, 'local endpoint unavailable');

  const selected = describeProviderStatus(provider, new Set(['ollama']));
  assert.equal(selected.ready, false);
  assert.equal(selected.note, 'local endpoint unavailable');
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

test('diagnostic provider pings carry Harness Core Spawner run authority', () => {
  const authority = buildDiagnosePingExecutionAuthority({
    providerId: 'codex',
    requestId: 'diag-codex-123'
  }) as any;

  assert.equal(authority.schema_version, 'governor-decision-v1');
  assert.equal(authority.execution_boundary.action_authorized, true);
  assert.equal(authority.authorizations[0].verdict, 'allow');
  assert.equal(authority.authorizations[0].capability_id, 'capability:spawner-ui:spawner.run');
  assert.equal(authority.authorizations[0].restrictions.publish_allowed, false);
  assert.equal(authority.envelope.actor.kind, 'human');
  assert.equal(authority.envelope.proposed_actions[0].action_type, 'launch_mission');
  assert.equal(authority.envelope.proposed_actions[0].args_ref.path_or_uri, 'telegram://actions/spawner.run/diag-codex-123');
  assert.match(authority.turn_id, /diagnose-command:diag-codex-123$/);
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

test('renders diagnose reports as safe Telegram HTML with readable sections', () => {
  const html = renderDiagnoseReportHtml([
    '🟢 Spark diagnostics look healthy.',
    '',
    'Health',
    '🟢 Relay ready',
    '',
    'Routes',
    'Chat: codex (gpt-5.5)',
    'Builds: zai <unsafe>',
    'Spawner UI: http://127.0.0.1:3333'
  ].join('\n'));

  assert.match(html, /^<b>🟢 Spark diagnostics look healthy\.<\/b>/);
  assert.match(html, /<b>Health<\/b>/);
  assert.match(html, /<b>Routes<\/b>/);
  assert.match(html, /<b>Chat:<\/b> <code>codex \(gpt-5\.5\)<\/code>/);
  assert.match(html, /<b>Builds:<\/b> <code>zai &lt;unsafe&gt;<\/code>/);
  assert.match(html, /<b>Spawner UI:<\/b> <a href="http:\/\/127\.0\.0\.1:3333">open<\/a>/);
});

test('summarizes route divergence and build misroutes for diagnose', () => {
  assert.deepEqual(describeRouteDivergence([]), ['Route divergence: no route ledger records yet']);
  assert.deepEqual(
    describeRouteDivergence([routeRecord('spawner.build', 'spawner.build')]),
    ['Route divergence: ok (1 records, 0 mismatches)']
  );

  const lines = describeRouteDivergence([
    routeRecord('spawner.build', 'plain_chat'),
    routeRecord('spawner.build', 'spark.read_only_state.live_status'),
    routeRecord('memory.write', 'plain_chat')
  ]);

  assert.equal(lines[0], 'Route divergence: 3/3 mismatched; build misroutes 2');
  assert.match(lines[1], /spawner\.build->plain_chat x1/);
  assert.match(lines[1], /spawner\.build->spark\.read_only_state\.live_status x1/);
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

test('formats local service URLs as localhost links', () => {
  assert.equal(readableLocalServiceUrl('http://127.0.0.1:3333'), 'http://localhost:3333');
  assert.equal(readableLocalServiceUrl('http://0.0.0.0:3333/'), 'http://localhost:3333');
  assert.equal(readableLocalServiceUrl('http://[::1]:3333/'), 'http://localhost:3333');
  assert.equal(readableLocalServiceUrl('https://spawner.example.app/path/'), 'https://spawner.example.app/path');
});

test('warns when Railway Spawner links would point at private DNS', () => {
  assert.equal(
    describeSpawnerPublicLinkHealth({
      SPAWNER_UI_URL: 'http://spawner-ui.railway.internal:3000'
    } as NodeJS.ProcessEnv),
    'Spawner public links: ❌ set SPAWNER_UI_PUBLIC_URL; Telegram mission links cannot use railway.internal URLs'
  );

  assert.equal(
    describeSpawnerPublicLinkHealth({
      SPAWNER_UI_URL: 'http://spawner-ui.railway.internal:3000',
      SPAWNER_UI_PUBLIC_URL: 'https://spawner-ui-production.up.railway.app'
    } as NodeJS.ProcessEnv),
    'Spawner public links: ✅ spawner-ui-production.up.railway.app'
  );

  assert.equal(
    describeSpawnerPublicLinkHealth({
      SPAWNER_UI_URL: 'http://127.0.0.1:3333'
    } as NodeJS.ProcessEnv),
    null
  );

  assert.equal(
    describeSpawnerPublicLinkHealth({
      SPARK_SPAWNER_URL: 'http://spawner-ui.railway.internal:3000',
      SPAWNER_UI_PUBLIC_URL: 'https://spawner-ui-production.up.railway.app'
    } as NodeJS.ProcessEnv),
    'Spawner public links: ✅ spawner-ui-production.up.railway.app'
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
  const lines = describeAccessDiagnostics(subject, 'Access level 3', {
    ADMIN_TELEGRAM_IDS: '111,222',
    ALLOWED_TELEGRAM_IDS: '333',
    TELEGRAM_PUBLIC_CHAT_ENABLED: '0'
  } as NodeJS.ProcessEnv);

  assert.deepEqual(lines, [
    'Current user: ❌ not allowed',
    'Access level: Access level 3',
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
    /Spawner mission routing is healthy/
  );
  assert.match(
    inferDiagnoseLikelyIssue({
      ...base,
      chatProviderOk: false,
      missionPingOk: false
    }),
    /failing for both plain chat and Spawner builds/
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

test('missionPingOk=null (not checked) shows degraded, not "no obvious fault"', () => {
  // This is the core bug: before the fix, missionPingOk !== false treated
  // undefined/null as healthy. After fix, only === true shows ready.
  const base = {
    subject: { userId: 123, chatId: 456, isAdmin: true, isAllowed: true },
    botRelayOk: true,
    spawnerOk: true,
    builder: { mode: 'auto' as const, available: true, builderRepo: 'repo', builderHome: 'home' },
    chatProviderOk: true,
  };

  // null (not checked) should show degraded
  assert.match(
    inferDiagnoseLikelyIssue({ ...base, missionPingOk: null }),
    /mission provider ping failed or not reached/
  );

  // true should show no obvious fault
  assert.match(
    inferDiagnoseLikelyIssue({ ...base, missionPingOk: true }),
    /no obvious fault/
  );

  // false should show degraded
  assert.match(
    inferDiagnoseLikelyIssue({ ...base, missionPingOk: false }),
    /mission provider ping failed/
  );
});
