// /diagnose - one-shot health trace for Telegram, Spawner, routing, and LLM providers.
// Designed to run from Telegram and fit in a single message.

import axios from 'axios';

const SPAWNER_UI_URL = process.env.SPAWNER_UI_URL || 'http://127.0.0.1:5173';
const CODEX_SHIM_URL = process.env.CODEX_SHIM_URL;
const BOT_DEFAULT_PROVIDER = normalizeProviderId(process.env.BOT_DEFAULT_PROVIDER) || 'codex';

export interface ProviderStatus {
  id: string;
  label: string;
  model?: string;
  envKeyConfigured?: boolean;
  cliConfigured?: boolean;
  configured?: boolean;
  configurationMode?: string;
  kind?: string;
  requiresApiKey?: boolean;
  sparkSelected?: boolean;
}

interface ProvidersPayload {
  sparkDefaultProvider?: string | null;
  providers?: ProviderStatus[];
}

interface PingResult {
  providerId: string;
  ok: boolean;
  ms?: number;
  error?: string;
}

interface ProviderDescription {
  ready: boolean;
  icon: string;
  note: string;
}

export function normalizeProviderId(value: string | undefined | null): string | null {
  const normalized = value?.trim().toLowerCase();
  return normalized || null;
}

function httpPortLabel(url: string): string {
  try {
    const parsed = new URL(url);
    return parsed.port ? `:${parsed.port}` : parsed.host;
  } catch {
    return url;
  }
}

async function httpStatus(url: string, timeoutMs = 3000): Promise<{ ok: boolean; status?: number; err?: string }> {
  try {
    const res = await axios.get(url, { timeout: timeoutMs, validateStatus: () => true });
    return { ok: res.status < 500, status: res.status };
  } catch (err: any) {
    return { ok: false, err: err.code || err.message };
  }
}

export function describeProviderStatus(provider: ProviderStatus, selectedIds: Set<string> = new Set()): ProviderDescription {
  const ready =
    provider.configured === true ||
    provider.cliConfigured === true ||
    provider.envKeyConfigured === true ||
    (provider.requiresApiKey === false && provider.kind === 'custom');

  if (ready) {
    if (provider.cliConfigured || provider.configurationMode === 'cli') {
      return { ready, icon: '✅', note: 'cli' };
    }
    if (provider.envKeyConfigured || provider.configurationMode === 'api_key') {
      return { ready, icon: '✅', note: 'api key' };
    }
    return { ready, icon: '✅', note: provider.configurationMode || 'configured' };
  }

  if (selectedIds.has(provider.id)) {
    const note = provider.requiresApiKey === false ? 'cli missing' : 'key missing';
    return { ready, icon: '❌', note };
  }

  const note = provider.requiresApiKey === false ? 'optional cli not found' : 'not configured';
  return { ready, icon: '⚪', note };
}

export function selectPingProviderIds(
  providers: ProviderStatus[],
  routeProviderIds: Array<string | null | undefined>
): string[] {
  const providerById = new Map(providers.map((provider) => [provider.id, provider]));
  const selected = new Set(routeProviderIds.map(normalizeProviderId).filter((id): id is string => Boolean(id)));
  const ids = new Set<string>();

  for (const provider of providers) {
    const description = describeProviderStatus(provider, selected);
    if (description.ready || selected.has(provider.id)) {
      ids.add(provider.id);
    }
  }

  for (const id of selected) {
    if (providerById.has(id)) {
      ids.add(id);
    }
  }

  return Array.from(ids);
}

async function fetchProviders(): Promise<{ ok: boolean; status?: number; err?: string; payload?: ProvidersPayload }> {
  try {
    const res = await axios.get(`${SPAWNER_UI_URL}/api/providers`, {
      timeout: 3000,
      validateStatus: () => true
    });
    return { ok: res.status < 500, status: res.status, payload: res.data || {} };
  } catch (err: any) {
    return { ok: false, err: err.code || err.message };
  }
}

async function pingProvider(providerId: string): Promise<PingResult> {
  const started = Date.now();
  try {
    const run = await axios.post(
      `${SPAWNER_UI_URL}/api/spark/run`,
      {
        goal: 'Reply with exactly: PING_OK',
        chatId: 'diag',
        userId: 'diag',
        requestId: `diag-${providerId}-${started}`,
        providers: [providerId],
        promptMode: 'simple',
        suppressRelay: true
      },
      { timeout: 10000 }
    );
    const missionId = run.data?.missionId;
    if (!missionId) {
      return { providerId, ok: false, error: 'no missionId' };
    }

    for (let i = 0; i < 25; i++) {
      await new Promise((resolve) => setTimeout(resolve, 2000));
      try {
        const res = await axios.get(`${SPAWNER_UI_URL}/api/mission-control/results`, {
          params: { missionId },
          timeout: 3000
        });
        const result = (res.data?.results || [])[0];
        if (result?.status === 'completed') {
          return { providerId, ok: true, ms: Date.now() - started };
        }
        if (result?.status === 'failed') {
          return {
            providerId,
            ok: false,
            ms: Date.now() - started,
            error: result.error?.slice(0, 120) || 'failed'
          };
        }
      } catch {
        // Keep polling until the mission finishes or times out.
      }
    }
    return { providerId, ok: false, error: 'timeout' };
  } catch (err: any) {
    return { providerId, ok: false, error: err.response?.data?.error || err.message };
  }
}

function providerLabel(providerId: string | null, providers: ProviderStatus[]): string {
  if (!providerId) {
    return 'not configured';
  }
  const provider = providers.find((candidate) => candidate.id === providerId);
  if (!provider) {
    return providerId;
  }
  return provider.model ? `${provider.id} (${provider.model})` : provider.id;
}

export async function buildDiagnoseReport(adminId: number): Promise<string> {
  const started = Date.now();
  const lines: string[] = ['🩺 Diagnostic Report', ''];

  const [botRelay, spawnerProviders, shimHealth] = await Promise.all([
    httpStatus('http://127.0.0.1:8788/', 2000),
    fetchProviders(),
    CODEX_SHIM_URL ? httpStatus(`${CODEX_SHIM_URL}/health`, 2000) : Promise.resolve(null)
  ]);

  const providers = spawnerProviders.payload?.providers || [];
  const spawnerDefaultProvider =
    normalizeProviderId(spawnerProviders.payload?.sparkDefaultProvider) ||
    normalizeProviderId(process.env.DEFAULT_MISSION_PROVIDER) ||
    normalizeProviderId(process.env.SPARK_MISSION_LLM_PROVIDER) ||
    BOT_DEFAULT_PROVIDER;
  const telegramRunProvider =
    normalizeProviderId(process.env.SPARK_MISSION_LLM_BOT_PROVIDER) ||
    normalizeProviderId(process.env.SPARK_BOT_DEFAULT_PROVIDER) ||
    normalizeProviderId(process.env.BOT_DEFAULT_PROVIDER) ||
    spawnerDefaultProvider;
  const chatProvider =
    normalizeProviderId(process.env.SPARK_CHAT_LLM_PROVIDER) ||
    normalizeProviderId(process.env.SPARK_CHAT_LLM_BOT_PROVIDER) ||
    normalizeProviderId(process.env.SPARK_LLM_PROVIDER) ||
    BOT_DEFAULT_PROVIDER;
  const selectedIds = new Set([spawnerDefaultProvider, telegramRunProvider, chatProvider].filter(Boolean) as string[]);

  lines.push('Services');
  lines.push(`• Bot mission relay (:8788): ${botRelay.ok ? '✅' : `❌ ${botRelay.err || botRelay.status}`}`);
  lines.push(
    `• Spawner UI (${httpPortLabel(SPAWNER_UI_URL)}): ${
      spawnerProviders.ok ? '✅' : `❌ ${spawnerProviders.err || spawnerProviders.status}`
    }`
  );
  if (CODEX_SHIM_URL) {
    lines.push(
      `• Codex shim optional (${httpPortLabel(CODEX_SHIM_URL)}): ${
        shimHealth?.ok ? '✅' : `⚪ ${shimHealth?.err || shimHealth?.status || 'not running'}`
      }`
    );
  }
  lines.push('');

  lines.push('Providers (Spawner)');
  if (providers.length === 0) {
    lines.push('• No provider metadata available from Spawner UI.');
  }
  for (const provider of providers) {
    const description = describeProviderStatus(provider, selectedIds);
    const kindNote = provider.kind === 'terminal_cli' ? ' local CLI' : provider.kind ? ` ${provider.kind}` : '';
    lines.push(
      `• ${provider.label} [${provider.id}] ${provider.model || 'default'}${kindNote} ${description.icon} ${description.note}`
    );
  }
  lines.push('');

  lines.push('Routing');
  lines.push(`• Telegram /run default: ${providerLabel(telegramRunProvider, providers)}`);
  lines.push(`• Telegram plain chat: SIB → ${providerLabel(chatProvider, providers)}`);
  lines.push(`• Spawner missions default: ${providerLabel(spawnerDefaultProvider, providers)}`);
  lines.push('• Overrides: "claude, ...", "minimax: ...", "glm, ...", "all models: ..."');
  lines.push('');

  lines.push('Provider ping (PING_OK test)');
  const pingIds = selectPingProviderIds(providers, [telegramRunProvider, chatProvider, spawnerDefaultProvider]);
  if (pingIds.length === 0) {
    lines.push('• No configured or selected providers to ping.');
  } else {
    const pings = await Promise.all(pingIds.map((providerId) => pingProvider(providerId)));
    for (const ping of pings) {
      const icon = ping.ok ? '✅' : '❌';
      const ms = ping.ms ? `${(ping.ms / 1000).toFixed(1)}s` : '';
      const err = ping.error ? ` (${ping.error})` : '';
      lines.push(`• ${ping.providerId} ${icon} ${ms}${err}`);
    }
  }
  lines.push('');

  try {
    const res = await axios.get(`${SPAWNER_UI_URL}/api/mission-control/board`, { timeout: 3000 });
    const board = res.data?.board || {};
    const running = (board.running || []).length;
    const completed = (board.completed || []).length;
    const failed = (board.failed || []).length;
    lines.push(`Mission board: ${running} running / ${completed} completed / ${failed} failed`);
  } catch {
    lines.push('Mission board: ❌ unreachable');
  }

  lines.push('');
  lines.push(`Admin ID: ${adminId}`);
  lines.push(`Total diagnose time: ${((Date.now() - started) / 1000).toFixed(1)}s`);

  return lines.join('\n');
}
