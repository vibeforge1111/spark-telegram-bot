// /diagnose - one-shot health trace for Telegram, Spawner, routing, and LLM providers.
// Designed to run from Telegram and fit in a single message.

import axios from 'axios';
import { getSparkAccessProfile, sparkAccessLabel } from './accessPolicy';
import { getBuilderBridgeStatus, type BuilderBridgeStatus } from './builderBridge';
import { pingChatProvider, resolveChatProviderConfig, type ChatProviderPing } from './llm';
import { parseTelegramUserIds } from './conversation';
import {
  normalizeProviderId,
  resolveKnownChatProviderId,
  resolveChatDefaultProvider,
  resolveMissionDefaultProvider
} from './providerRouting';
import { telegramRelayIdentityFromEnv } from './relayIdentity';
import { relayHealthUrl } from './healthRuntime';
import { redactText } from './redaction';
import { spawnerAxiosOptions } from './spawnerAuth';
import { resolveSpawnerUiUrl } from './spawnerUrl';

const SPAWNER_UI_URL = resolveSpawnerUiUrl();
const CODEX_SHIM_URL = process.env.CODEX_SHIM_URL;
const BOT_DEFAULT_PROVIDER = resolveChatDefaultProvider();

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

interface RelayIdentity {
  port: number;
  profile: string;
}

interface HttpStatusResult {
  ok: boolean;
  status?: number;
  err?: string;
  payload?: unknown;
}

export interface DiagnoseSubject {
  userId: number;
  chatId: string | number;
  isAdmin: boolean;
  isAllowed: boolean;
}

export function getRelayIdentityFromEnv(env: NodeJS.ProcessEnv = process.env): RelayIdentity {
  return telegramRelayIdentityFromEnv(env);
}

function httpPortLabel(url: string): string {
  try {
    const parsed = new URL(url);
    return parsed.port ? `:${parsed.port}` : parsed.host;
  } catch {
    return url;
  }
}

function formatDiagnoseErrorDetail(value: unknown, fallback = 'unavailable'): string {
  const text = typeof value === 'string' ? value : String(value ?? fallback);
  const firstLine = text.split(/\r?\n/, 1)[0] || '';
  return redactText(firstLine).replace(/\s+/g, ' ').trim().slice(0, 120) || fallback;
}

export function readableLocalServiceUrl(url: string): string {
  try {
    const parsed = new URL(url);
    const localHosts = new Set(['127.0.0.1', '0.0.0.0', '::1', '[::1]']);
    const host = localHosts.has(parsed.hostname) ? 'localhost' : parsed.hostname;
    const port = parsed.port ? `:${parsed.port}` : '';
    const path = parsed.pathname === '/' ? '' : parsed.pathname.replace(/\/$/, '');
    return `${parsed.protocol}//${host}${port}${path}`;
  } catch {
    return url;
  }
}

function isRailwayPrivateUrl(url: string | undefined): boolean {
  if (!url) return false;
  try {
    return new URL(url).hostname.endsWith('.railway.internal');
  } catch {
    return /\.railway\.internal(?::|\/|$)/i.test(url);
  }
}

function spawnerPublicUrlFromEnv(env: NodeJS.ProcessEnv = process.env): string | undefined {
  return env.SPAWNER_UI_PUBLIC_URL || env.PUBLIC_SPAWNER_UI_URL || env.SPAWNER_PUBLIC_URL;
}

export function describeSpawnerPublicLinkHealth(env: NodeJS.ProcessEnv = process.env): string | null {
  const internalUrl = resolveSpawnerUiUrl(env);
  if (!isRailwayPrivateUrl(internalUrl)) {
    return null;
  }

  const publicUrl = spawnerPublicUrlFromEnv(env);
  if (!publicUrl) {
    return 'Spawner public links: ❌ set SPAWNER_UI_PUBLIC_URL; Telegram mission links cannot use railway.internal URLs';
  }
  if (isRailwayPrivateUrl(publicUrl)) {
    return 'Spawner public links: ❌ SPAWNER_UI_PUBLIC_URL must be a public protected Spawner URL, not railway.internal';
  }
  return `Spawner public links: ✅ ${httpPortLabel(publicUrl)}`;
}

async function httpStatus(url: string, timeoutMs = 3000): Promise<HttpStatusResult> {
  try {
    const res = await axios.get(url, { timeout: timeoutMs });
    return { ok: true, status: res.status, payload: res.data };
  } catch (err: any) {
    const status = Number(err.response?.status);
    if (Number.isFinite(status)) {
      return {
        ok: false,
        status,
        err: `HTTP ${status}`,
        payload: err.response?.data
      };
    }
    return { ok: false, err: formatDiagnoseErrorDetail(err.code || err.message, 'unreachable') };
  }
}

function isLocalOpenAICompatProvider(provider: ProviderStatus): boolean {
  return provider.kind === 'openai_compat' && provider.requiresApiKey === false;
}

export function describeRelayHealth(status: HttpStatusResult, expected: RelayIdentity): string {
  const label = `:${expected.port}/${expected.profile}`;
  if (!status.ok) {
    if (status.status === 404) {
      return `• Bot mission relay (${label}): ❌ HTTP 404 — relay is reachable, but this route or profile is missing; check the expected port/profile, then restart Spark`;
    }
    if (status.status === 401 || status.status === 403) {
      return `• Bot mission relay (${label}): ❌ HTTP ${status.status} — relay access was rejected; check relay authentication and profile alignment`;
    }
    return `• Bot mission relay (${label}): ❌ ${formatDiagnoseErrorDetail(status.err || status.status, 'unreachable')}`;
  }

  const payload = status.payload && typeof status.payload === 'object'
    ? status.payload as Record<string, unknown>
    : {};
  const relay = payload.relay && typeof payload.relay === 'object'
    ? payload.relay as Record<string, unknown>
    : null;
  if (relay) {
    const actualPort = Number(relay.port);
    const actualProfile = typeof relay.profile === 'string' ? relay.profile : '';
    if (actualPort !== expected.port || actualProfile !== expected.profile) {
      return `• Bot mission relay (${label}): ❌ identity mismatch (${actualPort || '?'} / ${actualProfile || '?'})`;
    }
  }

  return `• Bot mission relay (${label}): ✅`;
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
    const note = isLocalOpenAICompatProvider(provider)
      ? 'local endpoint unavailable'
      : provider.requiresApiKey === false
        ? 'cli missing'
        : 'key missing';
    return { ready, icon: '❌', note };
  }

  const note = isLocalOpenAICompatProvider(provider)
    ? 'local endpoint unavailable'
    : provider.requiresApiKey === false
      ? 'optional cli not found'
      : 'not configured';
  return { ready, icon: '⚪', note };
}

export function selectPingProviderIds(
  providers: ProviderStatus[],
  routeProviderIds: Array<string | null | undefined>
): string[] {
  const providerById = new Map(providers.map((provider) => [provider.id, provider]));
  const selected = new Set(routeProviderIds.map(normalizeProviderId).filter((id): id is string => Boolean(id)));
  const ids = new Set<string>();

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
      ...spawnerAxiosOptions(3000)
    });
    return { ok: true, status: res.status, payload: res.data || {} };
  } catch (err: any) {
    const status = Number(err.response?.status);
    if (Number.isFinite(status)) {
      return {
        ok: false,
        status,
        err: `HTTP ${status}`,
        payload: err.response?.data || {}
      };
    }
    return { ok: false, err: formatDiagnoseErrorDetail(err.code || err.message, 'unreachable') };
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
      spawnerAxiosOptions(10000)
    );
    const missionId = run.data?.missionId;
    if (!missionId) {
      return { providerId, ok: false, error: 'no missionId' };
    }

    for (let i = 0; i < 25; i++) {
      await new Promise((resolve) => setTimeout(resolve, 2000));
      try {
        const res = await axios.get(`${SPAWNER_UI_URL}/api/mission-control/results`, {
          ...spawnerAxiosOptions(3000),
          params: { missionId },
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
            error: formatDiagnoseErrorDetail(result.error, 'failed')
          };
        }
      } catch {
        // Keep polling until the mission finishes or times out.
      }
    }
    return { providerId, ok: false, error: 'timeout' };
  } catch (err: any) {
    return { providerId, ok: false, error: formatDiagnoseErrorDetail(err.response?.data?.error || err.message, 'failed') };
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

function chatProviderLabel(providerId: string | null, providers: ProviderStatus[]): string {
  const config = resolveChatProviderConfig();
  if (config.provider === providerId && config.model) {
    return `${config.provider} (${config.model})`;
  }
  return providerLabel(providerId, providers);
}

export function describeBuilderBridgeHealth(status: BuilderBridgeStatus): string {
  if (status.mode === 'off') {
    return 'Builder bridge: ⚪ off';
  }
  if (status.available) {
    return `Builder bridge: ✅ available (${status.mode})`;
  }
  const icon = status.mode === 'required' ? '❌' : '⚪';
  return `Builder bridge: ${icon} unavailable (${status.mode})`;
}

export function describeChatProviderHealth(result: ChatProviderPing, chatProviderLabel: string): string {
  return `Chat provider completion: ${result.ok ? '✅' : '❌'} ${chatProviderLabel} (${formatDiagnoseErrorDetail(result.detail)})`;
}

export function resolveDiagnoseRouteProviders(
  env: NodeJS.ProcessEnv = process.env,
  spawnerDefaultProvider?: string | null
): { spawnerDefaultProvider: string; telegramRunProvider: string; chatProvider: string } {
  const normalizedSpawnerDefault =
    normalizeProviderId(spawnerDefaultProvider) ||
    normalizeProviderId(env.DEFAULT_MISSION_PROVIDER) ||
    normalizeProviderId(env.SPARK_MISSION_LLM_PROVIDER) ||
    BOT_DEFAULT_PROVIDER;
  const telegramRunProvider = resolveMissionDefaultProvider(env, normalizedSpawnerDefault);
  const chatProvider =
    resolveKnownChatProviderId(env.SPARK_CHAT_LLM_PROVIDER) ||
    resolveKnownChatProviderId(env.SPARK_CHAT_LLM_BOT_PROVIDER) ||
    resolveKnownChatProviderId(env.SPARK_LLM_PROVIDER) ||
    BOT_DEFAULT_PROVIDER;
  return { spawnerDefaultProvider: normalizedSpawnerDefault, telegramRunProvider, chatProvider };
}

export function describeAccessDiagnostics(subject: DiagnoseSubject, accessProfile: string, env: NodeJS.ProcessEnv = process.env): string[] {
  const adminCount = parseTelegramUserIds(env.ADMIN_TELEGRAM_IDS).length;
  const allowedCount = parseTelegramUserIds(env.ALLOWED_TELEGRAM_IDS || env.TELEGRAM_ALLOWED_USER_IDS).length;
  const publicChat = env.TELEGRAM_PUBLIC_CHAT_ENABLED === '1';
  return [
    `Current user: ${subject.isAllowed ? '✅ allowed' : '❌ not allowed'}${subject.isAdmin ? ' / admin' : ''}`,
    `Access level: ${accessProfile}`,
    `Configured operators: admins=${adminCount}, allowed=${allowedCount}, public=${publicChat ? 'on' : 'off'}`
  ];
}

export function inferDiagnoseLikelyIssue(args: {
  subject: DiagnoseSubject;
  botRelayOk: boolean;
  spawnerOk: boolean;
  builder: BuilderBridgeStatus;
  chatProviderOk: boolean;
  missionPingOk: boolean | null;
}): string {
  if (!args.subject.isAllowed) {
    return 'Likely issue: this Telegram user is not allowed. Add their /myid value to ALLOWED_TELEGRAM_IDS, or enable TELEGRAM_PUBLIC_CHAT_ENABLED=1.';
  }
  if (!args.botRelayOk) {
    return 'Likely issue: Telegram relay runtime is not reachable or profile/port identity is wrong.';
  }
  if (!args.chatProviderOk) {
    if (args.spawnerOk && args.missionPingOk === true) {
      return 'Likely issue: plain chat provider is unhealthy, but Spawner mission routing is healthy. Plain chat may need a provider timeout/key/base URL check; /run builds can still work.';
    }
    if (args.spawnerOk && args.missionPingOk === false) {
      return 'Likely issue: the selected provider is failing for both plain chat and Spawner builds. Check its shared key, base URL, and model, or switch both roles to a healthy provider before restarting Telegram.';
    }
    return 'Likely issue: plain chat provider is unhealthy. Check the selected chat model key/base URL, then restart the Telegram gateway.';
  }
  if (args.builder.mode === 'required' && !args.builder.available) {
    return 'Likely issue: Builder bridge is required but unavailable. Check SPARK_BUILDER_REPO, SPARK_BUILDER_HOME, and SPARK_BUILDER_PYTHON.';
  }
  if (!args.spawnerOk) {
    return 'Likely issue: Spawner UI is unreachable, so builds and board checks will fail.';
  }
  if (args.missionPingOk === false) {
    return 'Likely issue: mission provider ping failed. Plain chat may work, but Spawner builds are degraded.';
  }
  return 'Likely issue: no obvious fault detected in relay, access, plain chat, or Spawner ping.';
}

export async function buildDiagnoseReport(adminId: number, subject?: Partial<DiagnoseSubject>): Promise<string> {
  const started = Date.now();
  const relayIdentity = getRelayIdentityFromEnv();
  const diagnoseSubject: DiagnoseSubject = {
    userId: subject?.userId || adminId,
    chatId: subject?.chatId || adminId,
    isAdmin: subject?.isAdmin ?? true,
    isAllowed: subject?.isAllowed ?? true
  };

  const [botRelay, spawnerProviders, shimHealth, builderBridge, chatProviderPing, accessProfile] = await Promise.all([
    httpStatus(relayHealthUrl(), 2000),
    fetchProviders(),
    CODEX_SHIM_URL ? httpStatus(`${CODEX_SHIM_URL}/health`, 2000) : Promise.resolve(null),
    getBuilderBridgeStatus().catch(() => ({
      mode: 'required' as const,
      available: false,
      builderRepo: '',
      builderHome: ''
    })),
    pingChatProvider().catch((error) => ({
      ok: false,
      detail: formatDiagnoseErrorDetail(error instanceof Error ? error.message : String(error))
    })),
    getSparkAccessProfile(diagnoseSubject.chatId).catch(() => 'agent' as const)
  ]);

  const providers = spawnerProviders.payload?.providers || [];
  const { spawnerDefaultProvider, telegramRunProvider, chatProvider } = resolveDiagnoseRouteProviders(
    process.env,
    spawnerProviders.payload?.sparkDefaultProvider
  );
  const selectedIds = new Set([spawnerDefaultProvider, telegramRunProvider, chatProvider].filter(Boolean) as string[]);

  const providerDescriptions = providers.map((provider) => describeProviderStatus(provider, selectedIds));
  const readyProviderCount = providerDescriptions.filter((description) => description.ready).length;
  const spawnerPublicLinkHealth = describeSpawnerPublicLinkHealth();
  const pingIds = selectPingProviderIds(providers, [telegramRunProvider, spawnerDefaultProvider]);
  let missionPingOk: boolean | null = null;
  let pingSummary = 'not checked';
  if (pingIds.length === 0) {
    pingSummary = 'no selected provider to ping';
  } else {
    const pings = await Promise.all(pingIds.map((providerId) => pingProvider(providerId)));
    missionPingOk = pings.every((ping) => ping.ok);
    const failed = pings.filter((ping) => !ping.ok).map((ping) => ping.providerId);
    pingSummary = failed.length > 0 ? `${failed.join(', ')} failed` : 'passed';
  }

  let boardSummary = 'unavailable';
  try {
    const res = await axios.get(`${SPAWNER_UI_URL}/api/mission-control/board`, spawnerAxiosOptions(3000));
    const board = res.data?.board || {};
    const running = (board.running || []).length;
    const completed = (board.completed || []).length;
    const failed = (board.failed || []).length;
    boardSummary = `${running} running / ${completed} completed / ${failed} failed`;
  } catch {
    boardSummary = 'unreachable';
  }

  const likelyIssue = inferDiagnoseLikelyIssue({
    subject: diagnoseSubject,
    botRelayOk: botRelay.ok,
    spawnerOk: spawnerProviders.ok,
    builder: builderBridge,
    chatProviderOk: chatProviderPing.ok,
    missionPingOk
  });
  const issueText = likelyIssue.replace(/^Likely issue:\s*/i, '');
  const hasIssue = !/no obvious fault/i.test(likelyIssue);
  const hardFailure =
    !diagnoseSubject.isAllowed ||
    !botRelay.ok ||
    !spawnerProviders.ok ||
    !chatProviderPing.ok ||
    (builderBridge.mode === 'required' && !builderBridge.available);
  const headlineIcon = hasIssue ? (hardFailure ? '🔴' : '🟡') : '🟢';
  const lines: string[] = [
    `${headlineIcon} Spark diagnostics ${hasIssue ? 'found an issue' : 'look healthy'}.`,
    '',
    'Health',
    `${botRelay.ok ? '🟢' : '🔴'} Relay ${botRelay.ok ? 'ready' : botRelay.err || botRelay.status || 'unreachable'}`,
    `${chatProviderPing.ok && builderBridge.available ? '🟢' : '🔴'} Chat ${chatProviderPing.ok ? 'ready' : 'degraded'}`,
    `${spawnerProviders.ok && missionPingOk !== false ? '🟢' : '🟡'} Builds ${spawnerProviders.ok ? (missionPingOk === false ? 'degraded' : 'ready') : 'offline'}`,
    `${diagnoseSubject.isAllowed ? '🟢' : '🔴'} Access ${sparkAccessLabel(accessProfile)}${diagnoseSubject.isAdmin ? ' / admin' : ''}`,
    '',
    'Issue',
    issueText,
    '',
    'Routes',
    `Chat: ${chatProviderLabel(chatProvider, providers)}`,
    `Builds: ${providerLabel(telegramRunProvider, providers)}`,
    `Providers: ${providers.length > 0 ? `${readyProviderCount}/${providers.length} ready` : 'metadata unavailable'}`,
    `Ping: ${pingSummary}`,
    '',
    'Workspace',
    `Board: ${boardSummary}`,
    `Spawner UI: ${readableLocalServiceUrl(SPAWNER_UI_URL)}`,
    spawnerPublicLinkHealth && /❌/.test(spawnerPublicLinkHealth) ? spawnerPublicLinkHealth : null,
    CODEX_SHIM_URL && shimHealth && !shimHealth.ok ? `Codex shim: ${shimHealth.err || shimHealth.status || 'not running'}` : null,
    '',
    `Checked in ${((Date.now() - started) / 1000).toFixed(1)}s.`
  ].filter((line): line is string => Boolean(line));

  return lines.join('\n');
}
