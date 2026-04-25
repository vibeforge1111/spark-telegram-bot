import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import { existsSync } from 'node:fs';
import type { Telegraf } from 'telegraf';
import { readJsonFile, resolveStatePath, writeJsonAtomic } from './jsonState';
import { requireRelaySecret } from './launchMode';

type RelayEventType =
  | 'mission_created'
  | 'mission_started'
  | 'mission_paused'
  | 'mission_resumed'
  | 'mission_completed'
  | 'mission_failed'
  | 'task_started'
  | 'task_progress'
  | 'progress'
  | 'task_completed'
  | 'task_failed'
  | 'task_cancelled'
  | 'dispatch_started'
  | 'provider_feedback'
  | 'log';

interface MissionSubscription {
  missionId: string;
  chatId: string;
  userId: string;
  requestId: string;
  goal: string;
  createdAt: string;
  relayPort?: number;
  relayProfile?: string;
  updateId?: number;
}

export type TelegramRelayVerbosity = 'minimal' | 'normal' | 'verbose';

interface TelegramRelayPreferences {
  relayVerbosityByChatId?: Record<string, TelegramRelayVerbosity>;
}

interface RelayWebhookPayload {
  type?: string;
  timestamp?: string;
  summary?: string;
  event?: {
    type?: RelayEventType;
    missionId?: string;
    taskId?: string;
    taskName?: string;
    message?: string;
    timestamp?: string;
    source?: string;
    data?: Record<string, unknown>;
  };
}

interface DeliverableRelayEvent {
  type: RelayEventType;
  missionId: string;
  taskId?: string;
  taskName?: string;
  message?: string;
  timestamp?: string;
  source?: string;
  data?: Record<string, unknown>;
}

const REGISTRY_PATH = resolveStatePath('.spark-spawner-missions.json');
const PREFERENCES_PATH = resolveStatePath('.spark-telegram-preferences.json');
const deliveryCache = new Map<string, number>();
const heartbeatTimers = new Map<string, ReturnType<typeof setInterval>>();
const registry = new Map<string, MissionSubscription>();
let registryLoaded = false;
let relayServer: Server | null = null;

function getRelayPort(): number {
	const parsed = Number(process.env.TELEGRAM_RELAY_PORT || '8788');
	return Number.isFinite(parsed) && parsed > 0 ? parsed : 8788;
}

function getRelaySecret(): string | null {
	return requireRelaySecret();
}

function getRelayProfile(): string {
  return process.env.SPARK_TELEGRAM_PROFILE?.trim() || 'default';
}

function normalizeRelayPort(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value) && value > 0) {
    return Math.trunc(value);
  }
  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value.trim());
    return Number.isFinite(parsed) && parsed > 0 ? Math.trunc(parsed) : null;
  }
  return null;
}

function relayTargetFromEvent(event: DeliverableRelayEvent): { port: number | null; profile: string | null } {
  const data = event.data;
  if (!data || typeof data !== 'object') {
    return { port: null, profile: null };
  }

  const nested = data.telegramRelay && typeof data.telegramRelay === 'object'
    ? data.telegramRelay as Record<string, unknown>
    : null;
  const port = normalizeRelayPort(nested?.port ?? data.telegramRelayPort);
  const profileRaw = nested?.profile ?? data.telegramRelayProfile;
  const profile = typeof profileRaw === 'string' && profileRaw.trim() ? profileRaw.trim() : null;
  return { port, profile };
}

export function shouldAcceptRelayEventForThisBot(event: DeliverableRelayEvent): boolean {
  const target = relayTargetFromEvent(event);
  if (target.port !== null && target.port !== getRelayPort()) {
    return false;
  }
  if (target.profile !== null && target.profile !== getRelayProfile()) {
    return false;
  }
  return true;
}

export function normalizeTelegramRelayVerbosity(value: unknown): TelegramRelayVerbosity | null {
  if (typeof value !== 'string') return null;
  const normalized = value.trim().toLowerCase().replace(/[\s_-]+/g, '');
  if (['minimal', 'bare', 'barebones', 'quiet'].includes(normalized)) return 'minimal';
  if (['normal', 'default', 'standard'].includes(normalized)) return 'normal';
  if (['verbose', 'detailed', 'full'].includes(normalized)) return 'verbose';
  return null;
}

function defaultRelayVerbosity(): TelegramRelayVerbosity {
  return normalizeTelegramRelayVerbosity(process.env.TELEGRAM_RELAY_VERBOSITY) || 'normal';
}

async function readTelegramRelayPreferences(): Promise<TelegramRelayPreferences> {
  return (await readJsonFile<TelegramRelayPreferences>(PREFERENCES_PATH)) || {};
}

export async function getTelegramRelayVerbosity(chatId: string | number): Promise<TelegramRelayVerbosity> {
  const preferences = await readTelegramRelayPreferences();
  const configured = preferences.relayVerbosityByChatId?.[String(chatId)];
  return normalizeTelegramRelayVerbosity(configured) || defaultRelayVerbosity();
}

export async function setTelegramRelayVerbosity(
  chatId: string | number,
  verbosity: TelegramRelayVerbosity
): Promise<void> {
  const preferences = await readTelegramRelayPreferences();
  await writeJsonAtomic(PREFERENCES_PATH, {
    ...preferences,
    relayVerbosityByChatId: {
      ...(preferences.relayVerbosityByChatId || {}),
      [String(chatId)]: verbosity
    }
  });
}

export function describeTelegramRelayVerbosity(verbosity: TelegramRelayVerbosity): string {
  switch (verbosity) {
    case 'minimal':
      return 'Minimal sends start, completion, and failures only.';
    case 'verbose':
      return 'Verbose sends task starts, progress notes, completions, and failures.';
    case 'normal':
    default:
      return 'Normal sends mission starts, task starts, readable completions, and failures.';
  }
}

async function loadRegistry(): Promise<void> {
  if (registryLoaded) return;
  registryLoaded = true;

  if (!existsSync(REGISTRY_PATH)) return;

  try {
    const entries = await readJsonFile<MissionSubscription[]>(REGISTRY_PATH);
    if (!entries) {
      return;
    }
    for (const entry of entries) {
      if (entry?.missionId && entry.chatId) {
        registry.set(entry.missionId, entry);
      }
    }
  } catch (error) {
    console.warn('[MissionRelay] Failed to load registry:', error);
  }
}

async function refreshRegistry(): Promise<void> {
  registry.clear();
  registryLoaded = false;
  await loadRegistry();
}

async function persistRegistry(): Promise<void> {
  try {
    await writeJsonAtomic(REGISTRY_PATH, Array.from(registry.values()));
  } catch (error) {
    console.warn('[MissionRelay] Failed to persist registry:', error);
  }
}

export async function registerMissionRelay(input: MissionSubscription): Promise<void> {
  await loadRegistry();
  registry.set(input.missionId, input);
  await persistRegistry();
}

function shouldDeliverEvent(event: RelayWebhookPayload['event']): event is DeliverableRelayEvent {
  if (!event?.type || !event.missionId) return false;
  return [
    'mission_created',
    'mission_started',
    'dispatch_started',
    'task_started',
    'task_progress',
    'progress',
    'provider_feedback',
    'log',
    'task_completed',
    'task_failed',
    'task_cancelled',
    'mission_completed',
    'mission_failed'
  ].includes(event.type);
}

function stripThinkingAndMeta(text: string): string {
  let out = text;
  out = out.replace(/<think[\s\S]*?<\/think>/gi, '');
  out = out.replace(/<thinking[\s\S]*?<\/thinking>/gi, '');
  out = out.replace(/```(?:bash|shell|sh)?\s*curl\s+-X\s+POST[\s\S]*?\/api\/events[\s\S]*?```/gi, '');
  out = out.replace(/^\s*\*?\*?Mission ID:?\*?\*?\s*\S+\s*\n+/gim, '');
  out = out.replace(/\n{3,}/g, '\n\n');
  return out.trim();
}

const TELEGRAM_MESSAGE_LIMIT = 3800;

function chunkForTelegram(text: string, limit = TELEGRAM_MESSAGE_LIMIT): string[] {
  if (!text) return [];
  if (text.length <= limit) return [text];
  const chunks: string[] = [];
  let remaining = text;
  while (remaining.length > limit) {
    let cut = remaining.lastIndexOf('\n', limit);
    if (cut < limit * 0.5) cut = limit;
    chunks.push(remaining.slice(0, cut).trimEnd());
    remaining = remaining.slice(cut).trimStart();
  }
  if (remaining.length > 0) chunks.push(remaining);
  return chunks;
}

const PROVIDER_DISPLAY_NAMES: Record<string, string> = {
  minimax: 'MiniMax',
  zai: 'Z.AI GLM',
  'z.ai': 'Z.AI GLM',
  glm: 'Z.AI GLM',
  claude: 'Claude',
  codex: 'Codex'
};

function humanizeProviderLabel(label: string): string {
  const key = label.trim().toLowerCase();
  return PROVIDER_DISPLAY_NAMES[key] || label;
}

function providerLabelFrom(event: DeliverableRelayEvent): string {
  const data = event.data;
  if (data && typeof data === 'object') {
    if (typeof data.providerLabel === 'string' && data.providerLabel) return data.providerLabel;
    if (typeof data.provider === 'string' && data.provider) return data.provider;
    if (typeof data.originalSource === 'string' && data.originalSource) return data.originalSource;
  }
  return event.source || event.taskName || 'provider';
}

function extractProviderResponse(event: DeliverableRelayEvent): { providerLabel: string; response: string } | null {
  const data = event.data;
  if (!data || typeof data !== 'object') return null;
  const raw = typeof data.response === 'string' ? data.response : '';
  const response = stripThinkingAndMeta(raw);
  if (!response) return null;
  return { providerLabel: providerLabelFrom(event), response };
}

function compactWhitespace(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}

function clipText(text: string, maxLength: number): string {
  const compact = compactWhitespace(text);
  if (compact.length <= maxLength) return compact;
  return `${compact.slice(0, Math.max(0, maxLength - 3)).trimEnd()}...`;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function parseJsonObject(text: string): Record<string, unknown> | null {
  try {
    return asRecord(JSON.parse(text));
  } catch {
    return null;
  }
}

function stringField(record: Record<string, unknown>, key: string): string | null {
  const value = record[key];
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function stringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((entry) => typeof entry === 'string' ? compactWhitespace(entry) : '')
    .filter(Boolean);
}

function providerStatusVerb(status: string | null): string {
  const normalized = status?.toLowerCase();
  if (normalized === 'completed' || normalized === 'success' || normalized === 'passed') {
    return 'finished the build';
  }
  if (normalized === 'blocked') {
    return 'reported a blocker';
  }
  if (normalized === 'failed' || normalized === 'error') {
    return 'reported a failure';
  }
  return 'finished';
}

function formatChangedFiles(files: string[], limit: number): string[] {
  if (files.length === 0) return [];
  const visible = files.slice(0, limit);
  const lines = [`Changed files: ${visible.join(', ')}`];
  if (files.length > visible.length) {
    lines.push(`Plus ${files.length - visible.length} more file(s).`);
  }
  return lines;
}

export function formatProviderCompletionForTelegram(input: {
  providerLabel: string;
  response: string;
  missionId: string;
  requestId?: string;
  goal?: string;
  verbosity?: TelegramRelayVerbosity;
}): string {
  const provider = humanizeProviderLabel(input.providerLabel);
  const verbosity = input.verbosity || 'normal';
  const parsed = parseJsonObject(input.response);

  if (!parsed) {
    const clean = stripThinkingAndMeta(input.response);
    const looksStructured = clean.trim().startsWith('{') || clean.trim().startsWith('[');
    if (looksStructured) {
      return [
        `${provider} finished, but returned a structured result I could not summarize cleanly.`,
        `Mission: ${input.missionId}`,
        'Use the canvas or mission board for the full raw record.'
      ].join('\n');
    }
    return [
      `${provider} says:`,
      '',
      clean,
      '',
      `Mission: ${input.missionId}`
    ].join('\n').trim();
  }

  const status = stringField(parsed, 'status');
  const summary = stringField(parsed, 'summary') || stringField(parsed, 'message');
  const projectPath = stringField(parsed, 'project_path') || stringField(parsed, 'projectPath');
  const changedFiles = stringArray(parsed.changed_files || parsed.changedFiles);
  const verification = stringArray(parsed.verification);
  const nextActions = stringArray(parsed.next_actions || parsed.nextActions);
  const exactCommands = stringArray(parsed.exact_commands || parsed.exactCommands);

  if (verbosity === 'minimal') {
    return [
      `${provider} ${providerStatusVerb(status)}.`,
      summary ? clipText(summary, 240) : null,
      projectPath ? `Project: ${projectPath}` : null,
      changedFiles.length ? `Files changed: ${changedFiles.length}` : null,
      `Mission: ${input.missionId}`
    ].filter(Boolean).join('\n');
  }

  const lines: string[] = [`${provider} ${providerStatusVerb(status)}.`];
  if (summary) {
    lines.push('', clipText(summary, verbosity === 'verbose' ? 700 : 420));
  } else if (input.goal) {
    lines.push('', `Goal: ${clipText(input.goal, 260)}`);
  }

  if (projectPath) {
    lines.push('', `Project: ${projectPath}`);
  }

  lines.push(...formatChangedFiles(changedFiles, verbosity === 'verbose' ? 12 : 6));

  if (verification.length > 0) {
    const visible = verification.slice(0, verbosity === 'verbose' ? 6 : 3);
    lines.push('', 'Checks:');
    lines.push(...visible.map((item) => `- ${clipText(item, 180)}`));
    if (verification.length > visible.length) {
      lines.push(`- ${verification.length - visible.length} more check(s) passed.`);
    }
  }

  if (verbosity === 'verbose' && exactCommands.length > 0) {
    lines.push('', `Verification commands run: ${exactCommands.length}`);
  }

  if (nextActions.length > 0) {
    lines.push('', 'Next:');
    lines.push(...nextActions.slice(0, 4).map((item) => `- ${clipText(item, 180)}`));
  }

  lines.push('', `Mission: ${input.missionId}`);
  if (input.requestId) {
    lines.push(`Request: ${input.requestId}`);
  }
  return lines.join('\n');
}

function extractProviderFailure(event: DeliverableRelayEvent): { providerLabel: string; error: string } {
  const data = event.data;
  const error = data && typeof data === 'object' && typeof data.error === 'string' && data.error.trim()
    ? data.error.trim()
    : event.message?.trim() || 'unknown error';
  return { providerLabel: providerLabelFrom(event), error };
}

function shouldDeliverProgressEvent(event: DeliverableRelayEvent, verbosity: TelegramRelayVerbosity): boolean {
  if (event.type === 'mission_failed' || event.type === 'task_failed' || event.type === 'task_cancelled') {
    return true;
  }
  if (verbosity === 'minimal') {
    return event.type === 'mission_started' || event.type === 'mission_completed';
  }
  if (verbosity === 'normal') {
    return ['mission_started', 'task_started', 'mission_completed'].includes(event.type);
  }
  return [
    'mission_created',
    'mission_started',
    'dispatch_started',
    'task_started',
    'task_progress',
    'progress',
    'provider_feedback',
    'log',
    'mission_completed'
  ].includes(event.type);
}

function formatProgressMessage(
  event: DeliverableRelayEvent,
  subscription: MissionSubscription,
  verbosity: TelegramRelayVerbosity,
  summary?: string
): string | null {
  if (!shouldDeliverProgressEvent(event, verbosity)) return null;
  const taskLabel = clipText(event.taskName || event.taskId || 'task', 120);
  const message = event.message || summary || '';

  switch (event.type) {
    case 'mission_created':
      return [
        'Spark picked up your request.',
        `Goal: ${clipText(subscription.goal, 260)}`,
        `Mission: ${event.missionId}`
      ].join('\n');
    case 'mission_started':
      return [
        'Spark started the run.',
        verbosity === 'verbose' ? `Goal: ${clipText(subscription.goal, 260)}` : null,
        `Mission: ${event.missionId}`
      ].filter(Boolean).join('\n');
    case 'dispatch_started':
      return `Spark is assigning the work.\nMission: ${event.missionId}`;
    case 'task_started':
      return `Started: ${taskLabel}\nMission: ${event.missionId}`;
    case 'task_progress':
    case 'progress':
    case 'provider_feedback':
    case 'log':
      return [
        `Update: ${taskLabel}`,
        message ? clipText(stripThinkingAndMeta(message), 500) : null,
        `Mission: ${event.missionId}`
      ].filter(Boolean).join('\n');
    case 'mission_completed':
      return `Mission completed.\nCheck the latest build summary above or open the canvas.\nMission: ${event.missionId}`;
    case 'mission_failed':
      return [
        'Mission failed.',
        message ? clipText(message, 500) : null,
        `Mission: ${event.missionId}`
      ].filter(Boolean).join('\n');
    default:
      return null;
  }
}

function shouldSkipDuplicate(event: DeliverableRelayEvent): boolean {
  const providerKey = typeof event.data?.provider === 'string' && event.data.provider
    ? event.data.provider
    : event.source || 'none';
  const signature = `${event.missionId}:${event.type}:${event.taskId || 'mission'}:${providerKey}`;
  const now = Date.now();
  const previous = deliveryCache.get(signature);
  if (typeof previous === 'number' && now - previous < 30_000) {
    return true;
  }

  deliveryCache.set(signature, now);
  if (deliveryCache.size > 500) {
    const cutoff = now - 30_000;
    for (const [key, timestamp] of deliveryCache.entries()) {
      if (timestamp < cutoff) {
        deliveryCache.delete(key);
      }
    }
  }

  return false;
}

function heartbeatKey(event: DeliverableRelayEvent): string {
  return event.missionId;
}

function heartbeatIntervalMs(verbosity: TelegramRelayVerbosity): number {
  if (verbosity === 'verbose') return 45_000;
  if (verbosity === 'normal') return 90_000;
  return 0;
}

function scheduleHeartbeat(
  bot: Telegraf,
  chatId: number,
  event: DeliverableRelayEvent,
  subscription: MissionSubscription,
  verbosity: TelegramRelayVerbosity
): void {
  const interval = heartbeatIntervalMs(verbosity);
  if (!interval || !['mission_started', 'task_started'].includes(event.type)) return;

  const key = heartbeatKey(event);
  if (heartbeatTimers.has(key)) return;

  const startedAt = Date.now();
  const taskLabel = clipText(event.taskName || 'the build', 120);
  const timer = setInterval(() => {
    const elapsed = Math.max(1, Math.round((Date.now() - startedAt) / 1000));
    const message = [
      `Still working on ${taskLabel}.`,
      `Elapsed: ${elapsed}s`,
      verbosity === 'verbose' ? `Goal: ${clipText(subscription.goal, 220)}` : null,
      `Mission: ${event.missionId}`
    ].filter(Boolean).join('\n');

    bot.telegram.sendMessage(chatId, message).catch((error) => {
      console.warn('[MissionRelay] Failed to send heartbeat:', error);
    });
  }, interval);

  heartbeatTimers.set(key, timer);
}

function clearHeartbeatForMission(missionId: string): void {
  for (const [key, timer] of heartbeatTimers.entries()) {
    if (key === missionId || key.startsWith(`${missionId}:`)) {
      clearInterval(timer);
      heartbeatTimers.delete(key);
    }
  }
}

async function registerFromEventIfPresent(event: DeliverableRelayEvent): Promise<void> {
  if (registry.has(event.missionId)) return;
  const data = event.data;
  if (!data || typeof data !== 'object') return;

  const chatId = typeof data.chatId === 'string' && data.chatId.trim() ? data.chatId.trim() : null;
  if (!chatId) return;

  await registerMissionRelay({
    missionId: event.missionId,
    chatId,
    userId: typeof data.userId === 'string' && data.userId.trim() ? data.userId.trim() : 'telegram',
    requestId: typeof data.requestId === 'string' && data.requestId.trim() ? data.requestId.trim() : event.missionId,
    goal: typeof data.goal === 'string' && data.goal.trim() ? data.goal.trim() : event.message || event.missionId,
    createdAt: new Date().toISOString(),
    relayPort: relayTargetFromEvent(event).port || undefined,
    relayProfile: relayTargetFromEvent(event).profile || undefined
  });
}

function formatRelayMessage(
  event: DeliverableRelayEvent,
  subscription: MissionSubscription,
  summary?: string
): string {
  const taskLabel = event.taskName || event.taskId || 'task';
  const lines = [
    `Mission: ${event.missionId}`,
    `Request: ${subscription.requestId}`
  ];

  switch (event.type) {
    case 'mission_created':
      lines.unshift('Spawner mission created');
      break;
    case 'mission_started':
      lines.unshift('Spawner mission started');
      break;
    case 'mission_paused':
      lines.unshift('Spawner mission paused');
      break;
    case 'mission_resumed':
      lines.unshift('Spawner mission resumed');
      break;
    case 'dispatch_started':
      lines.unshift('Spawner dispatch started');
      break;
    case 'task_started':
      lines.unshift(`Task started: ${taskLabel}`);
      break;
    case 'task_progress':
    case 'progress':
      lines.unshift(`Progress: ${taskLabel}`);
      break;
    case 'provider_feedback':
      lines.unshift(`Provider update: ${taskLabel}`);
      break;
    case 'log':
      lines.unshift('Spawner update');
      break;
    case 'mission_completed':
      lines.unshift('Spawner mission completed');
      break;
    case 'mission_failed':
      lines.unshift('Spawner mission failed');
      break;
    case 'task_failed':
      lines.unshift(`Task failed: ${taskLabel}`);
      break;
    case 'task_cancelled':
      lines.unshift(`Task cancelled: ${taskLabel}`);
      break;
  }

  if (summary) {
    lines.push(summary);
  } else if (event.message) {
    lines.push(event.message);
  }

  if (event.type === 'mission_completed' || event.type === 'mission_failed') {
    const providers = event.data?.providers;
    if (providers && typeof providers === 'object') {
      const providerLines = Object.entries(providers)
        .map(([providerId, value]) => {
          if (value && typeof value === 'object' && 'status' in value) {
            return `${providerId}: ${String((value as { status?: unknown }).status || 'unknown')}`;
          }
          return `${providerId}: ${String(value)}`;
        });
      if (providerLines.length > 0) {
        lines.push('Providers:');
        lines.push(...providerLines);
      }
    }
  }

  lines.push(`Check: /mission status ${event.missionId}`);
  return lines.join('\n');
}

function readJsonBody(req: IncomingMessage): Promise<RelayWebhookPayload | null> {
  return new Promise((resolve) => {
    const chunks: Buffer[] = [];
    let size = 0;

    req.on('data', (chunk: Buffer) => {
      size += chunk.length;
      if (size > 64 * 1024) {
        resolve(null);
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });

    req.on('end', () => {
      try {
        const parsed = JSON.parse(Buffer.concat(chunks).toString('utf-8')) as RelayWebhookPayload;
        resolve(parsed);
      } catch {
        resolve(null);
      }
    });

    req.on('error', () => resolve(null));
  });
}

function writeJson(res: ServerResponse, statusCode: number, body: Record<string, unknown>): void {
  res.statusCode = statusCode;
  res.setHeader('Content-Type', 'application/json');
  res.end(JSON.stringify(body));
}

export async function startMissionRelay(bot: Telegraf): Promise<{ port: number }> {
  await loadRegistry();

  if (relayServer) {
    return { port: getRelayPort() };
  }

  const port = getRelayPort();

	relayServer = createServer(async (req, res) => {
		if (req.method !== 'POST' || req.url !== '/spawner-events') {
			writeJson(res, 404, { ok: false, error: 'not_found' });
			return;
		}

		const relaySecret = getRelaySecret();
		if (relaySecret) {
			const secretHeader = req.headers['x-spark-telegram-relay-secret'];
			if (secretHeader !== relaySecret) {
				writeJson(res, 401, { ok: false, error: 'invalid_relay_secret' });
				return;
			}
		}

		const payload = await readJsonBody(req);
    const event = payload?.event;
    if (!payload || !shouldDeliverEvent(event)) {
      writeJson(res, 400, { ok: false, error: 'invalid_event' });
      return;
    }

    if (!shouldAcceptRelayEventForThisBot(event)) {
      writeJson(res, 202, { ok: true, ignored: 'foreign_relay_target' });
      return;
    }

    await registerFromEventIfPresent(event);

    let subscription = registry.get(event.missionId);
    if (!subscription) {
      await refreshRegistry();
      subscription = registry.get(event.missionId);
    }
    if (!subscription) {
      writeJson(res, 202, { ok: true, ignored: 'unknown_mission' });
      return;
    }

    if (shouldSkipDuplicate(event)) {
      writeJson(res, 202, { ok: true, duplicate: true });
      return;
    }

    try {
      const chatId = Number(subscription.chatId);
      const verbosity = await getTelegramRelayVerbosity(subscription.chatId);

      if (event.type === 'task_completed') {
        clearHeartbeatForMission(event.missionId);
        const extracted = extractProviderResponse(event);
        if (!extracted) {
          writeJson(res, 202, { ok: true, ignored: 'no_response_text' });
          return;
        }
        const message = formatProviderCompletionForTelegram({
          providerLabel: extracted.providerLabel,
          response: extracted.response,
          missionId: event.missionId,
          requestId: subscription.requestId,
          goal: subscription.goal,
          verbosity
        });
        const chunks = chunkForTelegram(message);
        for (let i = 0; i < chunks.length; i++) {
          const prefix = chunks.length > 1 ? `(part ${i + 1} of ${chunks.length})\n` : '';
          await bot.telegram.sendMessage(chatId, `${prefix}${chunks[i]}`);
        }
        writeJson(res, 200, { ok: true, chunks: chunks.length });
        return;
      }

      if (event.type === 'task_failed' || event.type === 'task_cancelled') {
        clearHeartbeatForMission(event.missionId);
        const failure = extractProviderFailure(event);
        const label = humanizeProviderLabel(failure.providerLabel);
        await bot.telegram.sendMessage(
          chatId,
          `${label} couldn't finish this one - ${failure.error.slice(0, 500)}`
        );
        writeJson(res, 200, { ok: true });
        return;
      }

      if (event.type === 'mission_failed' || event.type === 'mission_completed') {
        clearHeartbeatForMission(event.missionId);
      } else {
        scheduleHeartbeat(bot, chatId, event, subscription, verbosity);
      }

      const progressMessage = formatProgressMessage(event, subscription, verbosity, payload.summary);
      if (!progressMessage) {
        writeJson(res, 202, { ok: true, ignored: 'event_type_not_delivered' });
        return;
      }

      const chunks = chunkForTelegram(progressMessage);
      for (let i = 0; i < chunks.length; i++) {
        const prefix = chunks.length > 1 ? `(part ${i + 1} of ${chunks.length})\n` : '';
        await bot.telegram.sendMessage(chatId, `${prefix}${chunks[i]}`);
      }
      writeJson(res, 200, { ok: true, chunks: chunks.length });
    } catch (error) {
      console.error('[MissionRelay] Failed to deliver Telegram update:', error);
      writeJson(res, 500, { ok: false, error: 'delivery_failed' });
    }
  });

  await new Promise<void>((resolve, reject) => {
    relayServer!.once('error', reject);
    relayServer!.listen(port, '127.0.0.1', () => {
      relayServer!.off('error', reject);
      resolve();
    });
  });

  return { port };
}
