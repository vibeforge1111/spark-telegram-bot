import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import { existsSync } from 'node:fs';
import type { Telegraf } from 'telegraf';
import { conversation } from './conversation';
import { readJsonFile, resolveStatePath, writeJsonAtomic } from './jsonState';
import { relaySecretMatches, requireRelaySecret } from './launchMode';

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

export interface MissionSubscription {
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
export type TelegramMissionLinkPreference = 'none' | 'board' | 'canvas' | 'both';

interface TelegramRelayPreferences {
  relayVerbosityByChatId?: Record<string, TelegramRelayVerbosity>;
  missionLinksByChatId?: Record<string, TelegramMissionLinkPreference>;
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

export interface DeliverableRelayEvent {
  type: RelayEventType;
  missionId: string;
  taskId?: string;
  taskName?: string;
  message?: string;
  timestamp?: string;
  source?: string;
  data?: Record<string, unknown>;
}

interface MissionBoardEntry {
  missionId?: string;
  status?: string;
  lastEventType?: string;
  lastUpdated?: string;
  lastSummary?: string;
  taskName?: string | null;
}

const REGISTRY_PATH = resolveStatePath('.spark-spawner-missions.json');
const PREFERENCES_PATH = resolveStatePath('.spark-telegram-preferences.json');
const deliveryCache = new Map<string, number>();
const heartbeatTimers = new Map<string, ReturnType<typeof setInterval>>();
const registry = new Map<string, MissionSubscription>();
let registryLoaded = false;
let relayServer: Server | null = null;
const RELAY_RATE_LIMIT_WINDOW_MS = 60_000;
const RELAY_RATE_LIMIT_MAX_REQUESTS = 240;
const relayRateLimits = new Map<string, { startedAt: number; count: number }>();

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

export function getTelegramRelayIdentity(): { port: number; profile: string } {
  return {
    port: getRelayPort(),
    profile: getRelayProfile()
  };
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

export function normalizeTelegramMissionLinkPreference(value: unknown): TelegramMissionLinkPreference | null {
  if (typeof value !== 'string') return null;
  const normalized = value.trim().toLowerCase().replace(/[\s_-]+/g, '');
  if (['none', 'off', 'no', 'nolinks', 'telegramonly'].includes(normalized)) return 'none';
  if (['board', 'missionboard', 'missions', 'kanban', 'missionkanban'].includes(normalized)) return 'board';
  if (['canvas', 'visual', 'visualcanvas'].includes(normalized)) return 'canvas';
  if (
    ['both', 'all', 'boardcanvas', 'canvasboard', 'boardandcanvas', 'canvasandboard', 'kanbancanvas', 'canvaskanban', 'kanbanandcanvas', 'canvasandkanban'].includes(normalized)
  ) return 'both';
  return null;
}

function defaultMissionLinkPreference(): TelegramMissionLinkPreference {
  return normalizeTelegramMissionLinkPreference(process.env.TELEGRAM_MISSION_LINKS) || 'board';
}

async function readTelegramRelayPreferences(): Promise<TelegramRelayPreferences> {
  return (await readJsonFile<TelegramRelayPreferences>(PREFERENCES_PATH)) || {};
}

export async function getTelegramRelayVerbosity(chatId: string | number): Promise<TelegramRelayVerbosity> {
  const preferences = await readTelegramRelayPreferences();
  const configured = preferences.relayVerbosityByChatId?.[String(chatId)];
  return normalizeTelegramRelayVerbosity(configured) || defaultRelayVerbosity();
}

export async function getTelegramMissionLinkPreference(chatId: string | number): Promise<TelegramMissionLinkPreference> {
  const preferences = await readTelegramRelayPreferences();
  const configured = preferences.missionLinksByChatId?.[String(chatId)];
  return normalizeTelegramMissionLinkPreference(configured) || defaultMissionLinkPreference();
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

export async function setTelegramMissionLinkPreference(
  chatId: string | number,
  preference: TelegramMissionLinkPreference
): Promise<void> {
  const preferences = await readTelegramRelayPreferences();
  await writeJsonAtomic(PREFERENCES_PATH, {
    ...preferences,
    missionLinksByChatId: {
      ...(preferences.missionLinksByChatId || {}),
      [String(chatId)]: preference
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

export function describeTelegramMissionLinkPreference(preference: TelegramMissionLinkPreference): string {
  switch (preference) {
    case 'none':
      return 'No Spawner links are added to mission updates.';
    case 'canvas':
      return 'Mission updates include the Spawner canvas link.';
    case 'both':
      return 'Mission updates include both the Mission board/Kanban and canvas links.';
    case 'board':
    default:
      return 'Mission updates include the Mission board/Kanban link.';
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
        if (!subscriptionBelongsToThisRelay(entry)) {
          continue;
        }
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
  const subscription = {
    ...input,
    relayPort: input.relayPort || getRelayPort(),
    relayProfile: input.relayProfile || getRelayProfile()
  };
  registry.set(input.missionId, subscription);
  await persistRegistry();
}

function subscriptionBelongsToThisRelay(entry: MissionSubscription): boolean {
  if (entry.relayPort !== undefined && entry.relayPort !== getRelayPort()) {
    return false;
  }
  if (entry.relayProfile !== undefined && entry.relayProfile !== getRelayProfile()) {
    return false;
  }
  return true;
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
  out = out.replace(/```(?:bash|shell|sh)?\s*curl\s+-X\s+POST[\s\S]*?(?:\/api\/events|\/spawner-events)[\s\S]*?```/gi, '');
  out = out.replace(/^\s*curl\s+-X\s+POST\b.*(?:\/api\/events|\/spawner-events).*(?:\r?\n)?/gim, '');
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

function spawnerUiUrl(): string {
  return (process.env.SPAWNER_UI_URL || 'http://127.0.0.1:5173').replace(/\/+$/, '');
}

export function buildMissionSurfaceLinks(
  missionId: string,
  preference: TelegramMissionLinkPreference,
  baseUrl = spawnerUiUrl()
): string[] {
  if (preference === 'none') return [];
  const links: string[] = [];
  if (preference === 'board' || preference === 'both') {
    links.push(`Mission ${missionId}: ${baseUrl}/kanban`);
  }
  if (preference === 'canvas' || preference === 'both') {
    links.push(`Canvas: ${baseUrl}/canvas`);
  }
  return links;
}

function missionIdIsLinked(missionId: string, links: string[]): boolean {
  return links.some((link) => link.startsWith(`Mission ${missionId}:`));
}

function missionReferenceLines(missionId: string, links: string[]): string[] {
  return missionIdIsLinked(missionId, links) ? links : [`Mission: ${missionId}`, ...links];
}

function findMissionInBoard(board: Record<string, unknown>, missionId: string): MissionBoardEntry | null {
  for (const [status, value] of Object.entries(board)) {
    if (!Array.isArray(value)) continue;
    const match = value.find((entry) => {
      const record = asRecord(entry);
      return record && record.missionId === missionId;
    });
    const record = asRecord(match);
    if (record) {
      return {
        missionId: typeof record.missionId === 'string' ? record.missionId : missionId,
        status,
        lastEventType: typeof record.lastEventType === 'string' ? record.lastEventType : undefined,
        lastUpdated: typeof record.lastUpdated === 'string' ? record.lastUpdated : undefined,
        lastSummary: typeof record.lastSummary === 'string' ? record.lastSummary : undefined,
        taskName: typeof record.taskName === 'string' ? record.taskName : null
      };
    }
  }
  return null;
}

async function fetchMissionBoardEntry(missionId: string): Promise<MissionBoardEntry | null> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 2500);
    try {
      const response = await fetch(`${spawnerUiUrl()}/api/mission-control/board`, {
        signal: controller.signal
      });
      if (!response.ok) return null;
      const payload = asRecord(await response.json());
      const board = asRecord(payload?.board);
      return board ? findMissionInBoard(board, missionId) : null;
    } finally {
      clearTimeout(timeout);
    }
  } catch {
    return null;
  }
}

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

function stripMissionControlBoilerplate(text: string): string {
  return stripThinkingAndMeta(text)
    .replace(/^\[MissionControl\]\s*/i, '')
    .replace(/^Progress:\s*/i, '')
    .replace(/\s*\((?:spark|mission|dispatch)-[\w-]+\)\s*$/i, '')
    .replace(/\b(?:spark|mission|dispatch)-\d{6,}\b/gi, 'this mission')
    .trim();
}

function usefulProgressSummary(message: string, taskLabel: string): string | null {
  const cleaned = compactWhitespace(stripMissionControlBoilerplate(message));
  if (!cleaned) return null;

  const withoutProvider = cleaned.replace(/^(?:Z\.AI|ZAI|Claude|Codex|MiniMax|GLM)(?:\s+GLM)?\s*:\s*/i, '').trim();
  const normalized = withoutProvider.toLowerCase();
  const normalizedTask = taskLabel.toLowerCase();

  if (/^(?:working|still working|running|in progress|processing)\.?$/.test(normalized)) {
    return null;
  }
  if (normalized.includes(normalizedTask) && /\b(?:is\s+)?(?:running|in progress|working)\b/.test(normalized)) {
    return null;
  }

  return clipText(withoutProvider, 420);
}

function humanElapsed(elapsedMs: number): string {
  const seconds = Math.max(1, Math.round(elapsedMs / 1000));
  if (seconds < 75) return `${seconds}s`;
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `about ${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  return remainingMinutes > 0 ? `about ${hours}h ${remainingMinutes}m` : `about ${hours}h`;
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

  if (verbosity === 'verbose') {
    lines.push('', `Mission: ${input.missionId}`);
  }
  if (verbosity === 'verbose' && input.requestId) {
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

export function formatProgressMessageForTelegram(
  event: DeliverableRelayEvent,
  subscription: MissionSubscription,
  verbosity: TelegramRelayVerbosity,
  linkPreference: TelegramMissionLinkPreference,
  summary?: string
): string | null {
  if (!shouldDeliverProgressEvent(event, verbosity)) return null;
  const taskLabel = clipText(event.taskName || event.taskId || 'task', 120);
  const message = event.message || summary || '';
  const links = buildMissionSurfaceLinks(event.missionId, linkPreference);

  switch (event.type) {
    case 'mission_created':
      return [
        'Spark picked up your request.',
        `Goal: ${clipText(subscription.goal, 260)}`,
        ...missionReferenceLines(event.missionId, links)
      ].join('\n');
    case 'mission_started':
      return [
        'Spark started the run.',
        verbosity === 'normal' ? 'I will send useful checkpoints here and keep the board updated.' : null,
        verbosity === 'verbose' ? `Goal: ${clipText(subscription.goal, 260)}` : null,
        ...missionReferenceLines(event.missionId, links)
      ].filter(Boolean).join('\n');
    case 'dispatch_started':
      return 'Spark is assigning the work.';
    case 'task_started':
      return `${taskLabel} started working on it.`;
    case 'task_progress':
    case 'progress':
    case 'provider_feedback':
    case 'log':
      const useful = usefulProgressSummary(message, taskLabel);
      if (!useful) return null;
      return [
        `Update: ${taskLabel}`,
        useful
      ].filter(Boolean).join('\n');
    case 'mission_completed':
      return [
        'Mission completed.',
        links.length > 0 ? 'Open the board/canvas from the start message, or check the latest build summary above.' : 'Check the latest build summary above.'
      ].join('\n');
    case 'mission_failed':
      return [
        'Mission failed.',
        message ? clipText(message, 500) : null,
        ...missionReferenceLines(event.missionId, links)
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

export function formatMissionHeartbeatForTelegram(input: {
  missionId: string;
  goal: string;
  taskLabel: string;
  elapsedMs: number;
  verbosity: TelegramRelayVerbosity;
  snapshot?: MissionBoardEntry | null;
}): string {
  const taskLabel = clipText(input.snapshot?.taskName || input.taskLabel || 'the build', 120);
  const summary = input.snapshot?.lastSummary
    ? usefulProgressSummary(input.snapshot.lastSummary, taskLabel)
    : null;
  const status = input.snapshot?.status ? compactWhitespace(input.snapshot.status) : null;

  const lines: string[] = [];
  if (summary) {
    lines.push('Still building. Here is the latest useful signal I have:', summary);
  } else {
    lines.push('Still building. No new high-signal checkpoint has landed yet.');
  }

  lines.push(`Current focus: ${taskLabel}.`);

  if (input.verbosity === 'verbose') {
    lines.push(`Elapsed: ${humanElapsed(input.elapsedMs)}.`);
    if (status && !['running', 'created'].includes(status.toLowerCase())) {
      lines.push(`Mission state: ${status}.`);
    }
    lines.push(`Goal: ${clipText(input.goal, 220)}`);
  } else {
    lines.push('I will send the next note when there is a meaningful checkpoint or the run finishes.');
  }

  if (input.verbosity === 'verbose') {
    lines.push(`Mission: ${input.missionId}`);
  }
  return lines.join('\n');
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
  const timer = setInterval(async () => {
    const elapsedMs = Date.now() - startedAt;
    const snapshot = await fetchMissionBoardEntry(event.missionId);
    const message = formatMissionHeartbeatForTelegram({
      missionId: event.missionId,
      goal: subscription.goal,
      taskLabel,
      elapsedMs,
      verbosity,
      snapshot
    });

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
  const data = event.data && typeof event.data === 'object' ? event.data : {};
  const identity = relayIdentityFromEvent(event);
  if (!identity.chatId || !identity.userId) return;

  await registerMissionRelay({
    missionId: event.missionId,
    chatId: identity.chatId,
    userId: identity.userId,
    requestId: typeof data.requestId === 'string' && data.requestId.trim() ? data.requestId.trim() : event.missionId,
    goal: typeof data.goal === 'string' && data.goal.trim() ? data.goal.trim() : event.message || event.missionId,
    createdAt: new Date().toISOString(),
    relayPort: relayTargetFromEvent(event).port || undefined,
    relayProfile: relayTargetFromEvent(event).profile || undefined
  });
}

async function rememberMissionCompletion(
  subscription: MissionSubscription,
  event: DeliverableRelayEvent,
  providerLabel: string,
  response: string
): Promise<void> {
  const userId = Number(subscription.userId);
  if (!Number.isFinite(userId)) return;

  const summaryLine = response
    .split(/\r?\n/)
    .map((line) => line.trim())
    .find((line) => line && !line.startsWith('-')) || response;
  const note = [
    `Completed Spawner mission ${event.missionId} via ${humanizeProviderLabel(providerLabel)}.`,
    `Goal: ${clipText(subscription.goal, 260)}`,
    `Result: ${clipText(summaryLine, 500)}`
  ].join(' ');

  await conversation.learnAboutUser({ id: userId }, note).catch((error) => {
    console.warn('[MissionRelay] Failed to remember mission completion:', error);
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

function isRelayRateLimited(req: IncomingMessage, now = Date.now()): boolean {
  const key = req.socket.remoteAddress || 'unknown';
  const existing = relayRateLimits.get(key);
  if (!existing || now - existing.startedAt >= RELAY_RATE_LIMIT_WINDOW_MS) {
    relayRateLimits.set(key, { startedAt: now, count: 1 });
    return false;
  }
  existing.count += 1;
  return existing.count > RELAY_RATE_LIMIT_MAX_REQUESTS;
}

function normalizeRelayIdentityValue(value: unknown): string | null {
  if (typeof value === 'string' && value.trim()) {
    return value.trim();
  }
  if (typeof value === 'number' && Number.isFinite(value)) {
    return String(Math.trunc(value));
  }
  return null;
}

function relayIdentityFromEvent(event: DeliverableRelayEvent): { chatId: string | null; userId: string | null } {
  const data = event.data && typeof event.data === 'object' ? event.data : {};
  return {
    chatId: normalizeRelayIdentityValue(data.chatId),
    userId: normalizeRelayIdentityValue(data.userId)
  };
}

export function relayEventMatchesSubscription(
  event: DeliverableRelayEvent,
  subscription: MissionSubscription
): boolean {
  const identity = relayIdentityFromEvent(event);
  return identity.chatId === subscription.chatId && identity.userId === subscription.userId;
}

export async function startMissionRelay(bot: Telegraf): Promise<{ port: number }> {
  await loadRegistry();

  if (relayServer) {
    return { port: getRelayPort() };
  }

	const port = getRelayPort();

	relayServer = createServer(async (req, res) => {
    if (req.method === 'GET' && (req.url === '/' || req.url === '/health')) {
      writeJson(res, 200, {
        ok: true,
        service: 'spark-telegram-bot',
        relay: getTelegramRelayIdentity(),
        pid: process.pid
      });
      return;
    }

		if (req.method !== 'POST' || req.url !== '/spawner-events') {
			writeJson(res, 404, { ok: false, error: 'not_found' });
			return;
		}

    if (isRelayRateLimited(req)) {
      writeJson(res, 429, { ok: false, error: 'rate_limited' });
      return;
    }

		const relaySecret = getRelaySecret();
		if (relaySecret) {
			const secretHeader = req.headers['x-spark-telegram-relay-secret'];
			if (!relaySecretMatches(secretHeader, relaySecret)) {
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

    if (!relayEventMatchesSubscription(event, subscription)) {
      writeJson(res, 403, { ok: false, error: 'relay_identity_mismatch' });
      return;
    }

    if (shouldSkipDuplicate(event)) {
      writeJson(res, 202, { ok: true, duplicate: true });
      return;
    }

    try {
      const chatId = Number(subscription.chatId);
      const verbosity = await getTelegramRelayVerbosity(subscription.chatId);
      const linkPreference = await getTelegramMissionLinkPreference(subscription.chatId);

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
        await rememberMissionCompletion(subscription, event, extracted.providerLabel, extracted.response);
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

      const progressMessage = formatProgressMessageForTelegram(event, subscription, verbosity, linkPreference, payload.summary);
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
