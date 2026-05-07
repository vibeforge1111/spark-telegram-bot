import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import { existsSync } from 'node:fs';
import type { Telegraf } from 'telegraf';
import { conversation } from './conversation';
import { readJsonFile, resolveStatePath, writeJsonAtomic } from './jsonState';
import { relaySecretMatches, requireRelaySecret } from './launchMode';
import { telegramRelayIdentityFromEnv } from './relayIdentity';
import { recordShippedProjectFromMission } from './shippedProjectContext';
import { resolveProjectPreviewBaseUrl, resolveSpawnerPublicUrl, resolveSpawnerUiUrl } from './spawnerUrl';

const MISSION_LESSON_APPROVAL_PATH = resolveStatePath('.spark-mission-lesson-approvals.json');

type RelayEventType =
  | 'mission_created'
  | 'mission_started'
  | 'mission_paused'
  | 'mission_resumed'
  | 'mission_completed'
  | 'mission_failed'
  | 'mission_cancelled'
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
const openTaskStartCache = new Map<string, { taskKey: string; timestamp: number }>();
const completionDeliveryCache = new Set<string>();
const cancelledMissionCache = new Map<string, number>();
const pausedMissionCache = new Map<string, number>();
const heartbeatTimers = new Map<string, ReturnType<typeof setInterval>>();
const heartbeatLastMessages = new Map<string, string>();
const registry = new Map<string, MissionSubscription>();
const MISSION_STATE_CACHE_TTL_MS = 6 * 60 * 60_000;
let registryLoaded = false;
let relayServer: Server | null = null;
const RELAY_RATE_LIMIT_WINDOW_MS = 60_000;
const RELAY_RATE_LIMIT_MAX_REQUESTS = 240;
const relayRateLimits = new Map<string, { startedAt: number; count: number }>();
const DEFAULT_HEARTBEAT_STALE_MS = 35 * 60_000;

function getRelayPort(): number {
	return telegramRelayIdentityFromEnv().port;
}

function getRelaySecret(): string | null {
	return requireRelaySecret();
}

function getRelayProfile(): string {
  return telegramRelayIdentityFromEnv().profile;
}

function getRelayHost(): string {
  const raw = process.env.TELEGRAM_RELAY_HOST || process.env.SPARK_TELEGRAM_RELAY_HOST;
  return typeof raw === 'string' && raw.trim() ? raw.trim() : '127.0.0.1';
}

export function getTelegramRelayIdentity(): { port: number; profile: string; url?: string } {
  return telegramRelayIdentityFromEnv();
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

function pruneCancelledMissionCache(now = Date.now()): void {
  for (const [missionId, timestamp] of cancelledMissionCache.entries()) {
    if (now - timestamp > MISSION_STATE_CACHE_TTL_MS) {
      cancelledMissionCache.delete(missionId);
    }
  }
}

function prunePausedMissionCache(now = Date.now()): void {
  for (const [missionId, timestamp] of pausedMissionCache.entries()) {
    if (now - timestamp > MISSION_STATE_CACHE_TTL_MS) {
      pausedMissionCache.delete(missionId);
    }
  }
}

export function markMissionRelayCancelled(missionId: string): void {
  const normalized = missionId.trim();
  if (!normalized) return;
  pruneCancelledMissionCache();
  cancelledMissionCache.set(normalized, Date.now());
  pausedMissionCache.delete(normalized);
  clearHeartbeatForMission(normalized);
}

export function markMissionRelayPaused(missionId: string): void {
  const normalized = missionId.trim();
  if (!normalized) return;
  prunePausedMissionCache();
  pausedMissionCache.set(normalized, Date.now());
  clearHeartbeatForMission(normalized);
}

export function markMissionRelayResumed(missionId: string): void {
  const normalized = missionId.trim();
  if (!normalized) return;
  pausedMissionCache.delete(normalized);
}

export function isMissionRelayPaused(missionId: string): boolean {
  prunePausedMissionCache();
  return pausedMissionCache.has(missionId.trim());
}

export function shouldSuppressMissionHandoff(missionId: string): boolean {
  pruneCancelledMissionCache();
  prunePausedMissionCache();
  const normalized = missionId.trim();
  return cancelledMissionCache.has(normalized) || pausedMissionCache.has(normalized);
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
    'mission_failed',
    'mission_cancelled',
    'mission_paused',
    'mission_resumed'
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
  return resolveSpawnerUiUrl().replace(/\/+$/, '');
}

function spawnerPublicUrl(): string {
  return resolveSpawnerPublicUrl().replace(/\/+$/, '');
}

export function buildMissionSurfaceLinks(
  missionId: string,
  preference: TelegramMissionLinkPreference,
  baseUrl = spawnerPublicUrl(),
  requestId?: string | null
): string[] {
  if (preference === 'none') return [];
  const links: string[] = [];
  const missionQuery = `mission=${encodeURIComponent(missionId)}`;
  const canvasQuery = requestId?.trim()
    ? `pipeline=${encodeURIComponent(`prd-${requestId.trim()}`)}&${missionQuery}`
    : missionQuery;
  if (preference === 'board' || preference === 'both') {
    links.push(`Mission ${missionId}: ${baseUrl}/kanban?${missionQuery}`);
  }
  if (preference === 'canvas' || preference === 'both') {
    links.push(`Canvas: ${baseUrl}/canvas?${canvasQuery}`);
  }
  return links;
}

function missionIdIsLinked(missionId: string, links: string[]): boolean {
  return links.some((link) => link.startsWith(`Mission ${missionId}:`));
}

function missionReferenceLines(missionId: string, links: string[]): string[] {
  return missionIdIsLinked(missionId, links) ? links : [`Mission: ${missionId}`, ...links];
}

function requestIdFromEvent(event: DeliverableRelayEvent): string | null {
  const data = asRecord(event.data);
  const value = data?.requestId;
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function missionStartLinkPreference(preference: TelegramMissionLinkPreference): TelegramMissionLinkPreference {
  if (preference === 'none') return 'none';
  return 'board';
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
      const boardEntry = board ? findMissionInBoard(board, missionId) : null;
      if (boardEntry) return boardEntry;
    } finally {
      clearTimeout(timeout);
    }
  } catch {
    // Fall through to the trace endpoint; the board may be stale while trace still knows dispatch state.
  }

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 2500);
    try {
      const response = await fetch(`${spawnerUiUrl()}/api/mission-control/trace?mission=${encodeURIComponent(missionId)}`, {
        signal: controller.signal
      });
      if (!response.ok) return null;
      const payload = asRecord(await response.json());
      if (!payload) return null;
      const progress = asRecord(payload.progress);
      return {
        missionId,
        status: typeof payload.phase === 'string' ? payload.phase : undefined,
        lastEventType: typeof payload.phase === 'string' ? payload.phase : undefined,
        lastUpdated: typeof payload.serverTime === 'string' ? payload.serverTime : undefined,
        lastSummary: typeof payload.summary === 'string' ? payload.summary : undefined,
        taskName: typeof progress?.currentTask === 'string' ? progress.currentTask : null
      };
    } finally {
      clearTimeout(timeout);
    }
  } catch {
    return null;
  }
}

interface MissionCompletionSummary {
  providerLabel: string;
  response: string;
  openLink?: string | null;
  previewPending?: boolean;
}

interface MissionLessonApproval {
  missionId: string;
  chatId: string;
  userId: string;
  requestId: string;
  goal: string;
  providerLabel: string;
  candidates: string[];
  sourceRefs: string[];
  stagedAt: string;
}

interface MissionLessonApprovalState {
  pendingByUserId?: Record<string, MissionLessonApproval>;
}

interface MissionCompletionFetchOptions {
  attempts?: number;
  delayMs?: number;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function firstString(record: Record<string, unknown> | null, keys: string[]): string | null {
  if (!record) return null;
  for (const key of keys) {
    const value = record[key];
    if (typeof value === 'string' && value.trim()) return value.trim();
  }
  return null;
}

async function fetchMissionCompletionSummary(
  missionId: string,
  options: MissionCompletionFetchOptions = {}
): Promise<MissionCompletionSummary | null> {
  const attempts = Math.max(1, options.attempts ?? 4);
  const delayMs = Math.max(250, options.delayMs ?? 1500);
  for (let attempt = 0; attempt < attempts; attempt++) {
    if (attempt > 0) await sleep(delayMs);
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 3000);
      try {
        const response = await fetch(`${spawnerUiUrl()}/api/mission-control/trace?mission=${encodeURIComponent(missionId)}`, {
          signal: controller.signal
        });
        if (!response.ok) continue;
        const payload = asRecord(await response.json());
        if (!payload) continue;
        const phase = typeof payload.phase === 'string' ? payload.phase.toLowerCase() : '';
        const providerSummary = typeof payload.providerSummary === 'string' ? payload.providerSummary.trim() : '';
        const providerResults = Array.isArray(payload.providerResults) ? payload.providerResults.map(asRecord).filter(Boolean) : [];
        const completedProvider =
          providerResults.find((entry) => String(entry?.status || '').toLowerCase() === 'completed') ||
          providerResults.find((entry) => typeof entry?.summary === 'string' && entry.summary.trim());
        const resultSummary = completedProvider && typeof completedProvider.summary === 'string'
          ? completedProvider.summary.trim()
          : '';
        const responseText = providerSummary || resultSummary;
        if (phase !== 'completed' || !responseText) continue;

        const projectLineage = asRecord(payload.projectLineage);
        const projectPath = firstString(projectLineage, ['projectPath', 'project_path']);
        const previewUrl = firstString(projectLineage, ['previewUrl', 'preview_url']);
        const openLink = normalizePreviewLink(previewUrl, projectPath) || projectOpenLink(projectPath);
        const providerLabel = completedProvider && typeof completedProvider.providerId === 'string'
          ? completedProvider.providerId
          : 'provider';
        return {
          providerLabel,
          response: responseText,
          openLink,
          previewPending: Boolean(projectPath && !openLink)
        };
      } finally {
        clearTimeout(timeout);
      }
    } catch {
      // Retry briefly; mission_completed can arrive before provider results are persisted.
    }
  }
  return null;
}

function isProviderLevelCompletionEvent(event: DeliverableRelayEvent): boolean {
  return event.type === 'task_completed' && !event.taskId && !event.taskName;
}

async function sendFetchedCompletionSummary(
  bot: Telegraf,
  chatId: number,
  subscription: MissionSubscription,
  event: DeliverableRelayEvent,
  verbosity: TelegramRelayVerbosity,
  completion: MissionCompletionSummary
): Promise<number> {
  if (shouldSuppressMissionHandoff(event.missionId)) {
    return 0;
  }
  clearHeartbeatForMission(event.missionId);
  const message = formatProviderCompletionForTelegram({
    providerLabel: completion.providerLabel,
    response: completion.response,
    missionId: event.missionId,
    requestId: subscription.requestId,
    goal: subscription.goal,
    verbosity,
    openLink: completion.openLink,
    previewPending: completion.previewPending
  });
  const chunks = chunkForTelegram(message);
  for (let i = 0; i < chunks.length; i++) {
    const prefix = chunks.length > 1 ? `(part ${i + 1} of ${chunks.length})\n` : '';
    await bot.telegram.sendMessage(chatId, `${prefix}${chunks[i]}`);
  }
  completionDeliveryCache.add(event.missionId);
  await handleMissionCompletionMemory(bot, chatId, subscription, event, completion.providerLabel, completion.response);
  return chunks.length;
}

function scheduleDelayedCompletionSummary(
  bot: Telegraf,
  chatId: number,
  subscription: MissionSubscription,
  event: DeliverableRelayEvent,
  verbosity: TelegramRelayVerbosity
): void {
  setTimeout(() => {
    void (async () => {
      if (completionDeliveryCache.has(event.missionId) || shouldSuppressMissionHandoff(event.missionId)) return;
      const completion = await fetchMissionCompletionSummary(event.missionId, { attempts: 12, delayMs: 5000 });
      if (!completion || completionDeliveryCache.has(event.missionId) || shouldSuppressMissionHandoff(event.missionId)) return;
      await sendFetchedCompletionSummary(bot, chatId, subscription, event, verbosity, completion);
    })().catch(() => {});
  }, 1000);
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

const VOICE_LINES = {
  missionStarted: [
    'Spark is on it.',
    'The run is moving.',
    'Spark picked it up.',
    'We are underway.'
  ],
  taskStarted: [
    'Step {n} started',
    'Step {n} is moving',
    'Now working on step {n}',
    'Step {n} is underway'
  ],
  taskDone: [
    'Step {n} done',
    'Step {n} landed',
    'Step {n} is complete',
    'Finished step {n}'
  ],
  progress: [
    'Checkpoint',
    'Small update',
    'Progress note',
    'Good signal'
  ],
  heartbeat: [
    'Still working.',
    'Still with it.',
    'The run is still active.',
    'No handoff yet.'
  ],
  completed: [
    '✨ Spark shipped it.',
    '✨ Spark has the build ready.',
    '✨ Spark finished the build.',
    '✨ Spark shipped something you can open.'
  ],
  failed: [
    'This run needs attention.',
    'Something blocked the mission.',
    'The build hit a problem.',
    'Spark could not finish this run.'
  ]
} as const;

function stableHash(text: string): number {
  let hash = 2166136261;
  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function voiceLine(kind: keyof typeof VOICE_LINES, seed: string, replacements: Record<string, string> = {}): string {
  const choices = VOICE_LINES[kind];
  let line: string = choices[stableHash(`${kind}:${seed}`) % choices.length] || choices[0];
  for (const [key, value] of Object.entries(replacements)) {
    line = line.replace(new RegExp(`\\{${key}\\}`, 'g'), value);
  }
  return line;
}

function compactTelegramBlocks(...blocks: Array<string | null | undefined | false>): string {
  return blocks
    .filter((block): block is string => Boolean(block && block.trim()))
    .map((block) => block.trim())
    .join('\n\n');
}

function stripMissionControlBoilerplate(text: string): string {
  return stripThinkingAndMeta(text)
    .replace(/^\[MissionControl\]\s*/i, '')
    .replace(/^Progress:\s*/i, '')
    .replace(/\s*\((?:spark|mission|dispatch)-[\w-]+\)\s*[.!?]?\s*$/i, '')
    .replace(/\b(?:spark|mission|dispatch)-\d{6,}\b/gi, 'this mission')
    .trim();
}

function looksLikeInternalProgress(message: string): boolean {
  const normalized = message.toLowerCase();
  return (
    /\bskill_loaded\b/.test(normalized) ||
    /\bnode-\d+-task\b/.test(normalized) ||
    /\btask-task-\d+\b/.test(normalized) ||
    /\bis working through\b/.test(normalized) && /\btask pack\b/.test(normalized) ||
    /\bestimate adjusting\b|\b\d+(?:m \d+s|m|s) elapsed\b/i.test(message)
  );
}

function usefulProgressSummary(message: string, taskLabel: string): string | null {
  const cleaned = compactWhitespace(stripMissionControlBoilerplate(message));
  if (!cleaned) return null;

  const withoutProvider = cleaned.replace(/^(?:Z\.AI|ZAI|Claude|Codex|MiniMax|GLM)(?:\s+GLM)?\s*:\s*/i, '').trim();
  const normalized = withoutProvider.toLowerCase();
  const normalizedTask = taskLabel.toLowerCase();

  if (looksLikeInternalProgress(withoutProvider)) {
    return null;
  }
  if (/^(?:working|still working|running|in progress|processing)\.?$/.test(normalized)) {
    return null;
  }
  if (normalized.includes(normalizedTask) && /\b(?:is\s+)?(?:running|in progress|working)\b/.test(normalized)) {
    return null;
  }

  return clipText(withoutProvider, 420);
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

function normalizeLocalPath(pathValue: string): string {
  const normalized = pathValue.trim().replace(/^file:\/\/\/?/i, '').replace(/\\/g, '/');
  const wslDrive = normalized.match(/^\/([a-zA-Z])\/(.+)$/);
  if (wslDrive) {
    return `${wslDrive[1].toUpperCase()}:/${wslDrive[2]}`.replace(/\/+$/, '');
  }
  return normalized.replace(/\/+$/, '');
}

function localIndexLink(projectPath: string | null): string | null {
  if (!projectPath) return null;
  const normalized = normalizeLocalPath(projectPath);
  if (/^[A-Za-z]:\//.test(normalized)) {
    return `file:///${normalized.replace(/ /g, '%20')}/index.html`;
  }
  if (normalized.startsWith('/')) {
    return `file://${normalized.replace(/ /g, '%20')}/index.html`;
  }
  return null;
}

function projectPreviewBaseUrl(): string {
  return resolveProjectPreviewBaseUrl().replace(/\/+$/, '');
}

function projectPreviewLink(projectPath: string | null): string | null {
  if (!projectPath) return null;
  const normalized = normalizeLocalPath(projectPath);
  if (!normalized) return null;
  const token = Buffer.from(normalized, 'utf8').toString('base64url');
  return `${projectPreviewBaseUrl()}/preview/${token}/index.html`;
}

function normalizePreviewLink(previewUrl: string | null, projectPath: string | null): string | null {
  if (!previewUrl) return projectPreviewLink(projectPath);
  try {
    const parsed = new URL(previewUrl);
    const localHost = ['127.0.0.1', 'localhost', '::1', '[::1]'].includes(parsed.hostname.toLowerCase());
    const configuredDedicatedPreview = Boolean(process.env.SPARK_PROJECT_PREVIEW_URL?.trim());
    if (localHost && parsed.port === '5555' && !configuredDedicatedPreview && projectPath) {
      return projectPreviewLink(projectPath);
    }
  } catch {
    return projectPreviewLink(projectPath);
  }
  return previewUrl;
}

function projectOpenLink(projectPath: string | null): string | null {
  return projectPreviewLink(projectPath) || localIndexLink(projectPath);
}

function relayStringField(data: Record<string, unknown> | undefined, field: string): string | null {
  if (!data || typeof data[field] !== 'string') return null;
  const value = data[field].trim();
  return value || null;
}

function projectPathFromEvent(event: DeliverableRelayEvent): string | null {
  return relayStringField(event.data, 'projectPath') || relayStringField(event.data, 'project_path');
}

function previewLinkFromEvent(event: DeliverableRelayEvent): string | null {
  return relayStringField(event.data, 'previewUrl') || relayStringField(event.data, 'preview_url');
}

async function httpPreviewIsReachable(url: string): Promise<boolean> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 2500);
  const uiKey = process.env.SPARK_UI_API_KEY?.trim();
  try {
    const response = await fetch(url, {
      method: 'GET',
      headers: uiKey ? { 'x-spawner-ui-key': uiKey } : undefined,
      signal: controller.signal
    });
    return response.ok;
  } catch {
    return false;
  } finally {
    clearTimeout(timeout);
  }
}

async function readyProjectOpenLinkFromEvent(event: DeliverableRelayEvent): Promise<string | null> {
  const projectPath = projectPathFromEvent(event);
  const openLink = normalizePreviewLink(previewLinkFromEvent(event), projectPath) || projectOpenLink(projectPath);
  if (!openLink) return null;
  if (/^https?:\/\//i.test(openLink)) {
    return await httpPreviewIsReachable(openLink) ? openLink : null;
  }
  return openLink;
}

function openProjectLines(openLink: string | null): string[] {
  return openLink ? ['Open it here:', openLink] : [];
}

function nextPolishLine(): string {
  return 'Tell Spark what you want changed next and we can keep polishing from here.';
}

function extractProjectPathFromText(text: string): string | null {
  const patterns = [
    /(?:built|verified|created)[^`\r\n]*(?:in|at)\s+`([^`\r\n]+)`/i,
    /Project:\s*([A-Za-z]:\\[^\r\n]+)/i,
    /Project folder:\s*([A-Za-z]:\\[^\r\n]+)/i,
    /(?:at|in)\s+([A-Za-z]:\\Users\\[^\r\n`]+)/i
  ];
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match?.[1]) return match[1].trim().replace(/[.。]\s*$/, '');
  }
  return null;
}

function stripMarkdownFileLinks(text: string): string {
  return text
    .replace(/^\s*-\s+\[[^\]]+\]\(<[^)]+>\)\s*$/gim, '')
    .replace(/^\s*-\s+\[[^\]]+\]\([^)]+\)\s*$/gim, '')
    .replace(/`(?:[A-Za-z]:\\|\/(?:c|Users|home|root)\/)[^`\r\n]+`/g, '`local file`')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function extractSectionBullets(text: string, headingPattern: RegExp, maxItems: number): string[] {
  const lines = text.split(/\r?\n/);
  const start = lines.findIndex((line) => headingPattern.test(line.trim()));
  if (start < 0) return [];
  const bullets: string[] = [];
  for (const line of lines.slice(start + 1)) {
    const trimmed = line.trim();
    if (!trimmed) {
      if (bullets.length > 0) break;
      continue;
    }
    if (/^[A-Z][A-Za-z /-]+:\s*$/.test(trimmed) && bullets.length > 0) break;
    const bullet = trimmed.match(/^[-*]\s+(.+)/)?.[1];
    if (bullet) {
      if (!/\[[^\]]+\]\(|(?:[A-Za-z]:\\|\/(?:c|Users|home|root)\/)/i.test(bullet)) {
        bullets.push(clipText(bullet, 180));
      }
      if (bullets.length >= maxItems) break;
    } else if (bullets.length > 0) {
      break;
    }
  }
  return bullets;
}

function extractFreeformLeadSummary(text: string): string | null {
  const cleaned = stripMarkdownFileLinks(stripThinkingAndMeta(text));
  const line = cleaned
    .split(/\r?\n/)
    .map((entry) => entry.trim())
    .find((entry) =>
      entry &&
      !/^[-*]\s/.test(entry) &&
      !/^(what shipped|verification passed|created exactly|mission:|note:)/i.test(entry) &&
      !/\[[^\]]+\]\(/.test(entry)
    );
  return line ? clipText(line.replace(/^Done\.\s*/i, ''), 360) : null;
}

function taskNumberFromEvent(event: DeliverableRelayEvent): string | null {
  const raw = `${event.taskId || ''} ${event.taskName || ''}`;
  const match = raw.match(/\b(?:task|t)[-_ ]?(\d+)\b/i);
  return match?.[1] || null;
}

function cleanTaskLabel(label: string): string {
  const cleaned = label
    .replace(/^node-\d+-task-/i, '')
    .replace(/^task-task-/i, 'task-')
    .replace(/^task[-_ ]?\d+[-_: ]*/i, '')
    .replace(/^[a-z0-9]+(?:[-_][a-z0-9]+){2,}:\s*/i, '')
    .replace(/[-_]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  const readable = cleaned
    .replace(/\bthreejs\b/gi, 'Three.js')
    .replace(/\bwebgl\b/gi, 'WebGL')
    .replace(/\bjavascript\b/gi, 'JavaScript')
    .replace(/\blocalstorage\b/gi, 'localStorage')
    .replace(/\breadme\b/gi, 'README')
    .replace(/\bui\b/gi, 'UI')
    .replace(/\bjs\b/gi, 'JS')
    .replace(/\bcss\b/gi, 'CSS')
    .replace(/\bhtml\b/gi, 'HTML')
    .replace(/Three\.JS/g, 'Three.js');
  return clipText(readable, 160);
}

function formatTaskStartedMessage(event: DeliverableRelayEvent): string {
  const number = taskNumberFromEvent(event);
  const taskLabel = cleanTaskLabel(event.taskName || event.taskId || 'Next build step');
  const seed = `${event.missionId}:${event.taskId || event.taskName || taskLabel}`;
  const assignedTaskCount = typeof event.data?.assignedTaskCount === 'number'
    ? event.data.assignedTaskCount
    : Array.isArray(event.data?.assignedTaskIds)
      ? event.data.assignedTaskIds.length
      : 0;
  if (assignedTaskCount > 1) {
    return compactTelegramBlocks(
      number ? voiceLine('taskStarted', seed, { n: number }) : 'Step started',
      taskLabel,
      `Spark is working through ${assignedTaskCount} build steps. I will send the next note when a step finishes or the focus changes.`
    );
  }
  return [
    number ? voiceLine('taskStarted', seed, { n: number }) : 'Step started',
    taskLabel
  ].join('\n');
}

function formatTaskCompletedMessage(event: DeliverableRelayEvent): string {
  const number = taskNumberFromEvent(event);
  const taskLabel = cleanTaskLabel(event.taskName || event.taskId || 'Build step');
  const seed = `${event.missionId}:${event.taskId || event.taskName || taskLabel}:done`;
  return [
    number ? voiceLine('taskDone', seed, { n: number }) : 'Step done',
    taskLabel
  ].join('\n');
}

export function formatProviderCompletionForTelegram(input: {
  providerLabel: string;
  response: string;
  missionId: string;
  requestId?: string;
  goal?: string;
  verbosity?: TelegramRelayVerbosity;
  openLink?: string | null;
  previewPending?: boolean;
}): string {
  const provider = humanizeProviderLabel(input.providerLabel);
  const verbosity = input.verbosity || 'normal';
  const parsed = parseJsonObject(input.response);

  if (!parsed) {
    const clean = stripMarkdownFileLinks(stripThinkingAndMeta(input.response));
    const looksStructured = clean.trim().startsWith('{') || clean.trim().startsWith('[');
    if (looksStructured) {
      return [
        `${provider} finished, but returned a structured result I could not summarize cleanly.`,
        `Mission: ${input.missionId}`,
        'Use the canvas or mission board for the full raw record.'
      ].join('\n');
    }
    const projectPath = extractProjectPathFromText(input.response);
    const openLink = input.openLink !== undefined
      ? (input.openLink ? normalizePreviewLink(input.openLink, projectPath) : null)
      : projectOpenLink(projectPath);
    const shipped = extractSectionBullets(input.response, /^What shipped:/i, 4);
    const checks = extractSectionBullets(input.response, /^Verification passed:/i, 4);
    const lead = extractFreeformLeadSummary(input.response);
    const lines = [voiceLine('completed', `${input.missionId}:${provider}:freeform`)];
    if (lead) lines.push('', lead);
    if (openLink) {
      lines.push('', ...openProjectLines(openLink));
    } else if (projectPath && input.previewPending) {
      lines.push('', 'Preview is still preparing. Use the Mission board for now.');
    }
    if (shipped.length > 0) {
      lines.push('', 'What shipped:', ...shipped.map((item) => `- ${item}`));
    }
    if (checks.length > 0) {
      if (verbosity === 'verbose') {
        lines.push('', 'Quality checks:', ...checks.map((item) => `- ${item}`));
      } else {
        lines.push('', 'Quality checks passed.');
      }
    }
    if (openLink) lines.push('', nextPolishLine());
    if (verbosity === 'verbose') {
      lines.push('', `Mission: ${input.missionId}`);
    }
    if (lines.length > 1) return lines.join('\n');
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
  const openLink = input.openLink !== undefined
    ? (input.openLink ? normalizePreviewLink(input.openLink, projectPath) : null)
    : projectOpenLink(projectPath);
  const verification = stringArray(parsed.verification);
  const nextActions = stringArray(parsed.next_actions || parsed.nextActions);

  if (verbosity === 'minimal') {
    return [
      voiceLine(status && ['failed', 'error', 'blocked'].includes(status.toLowerCase()) ? 'failed' : 'completed', `${input.missionId}:${provider}:minimal`),
      summary ? clipText(summary, 240) : null,
      openLink ? openProjectLines(openLink).join('\n') : null,
      `Mission: ${input.missionId}`
    ].filter(Boolean).join('\n');
  }

  const lines: string[] = [voiceLine(status && ['failed', 'error', 'blocked'].includes(status.toLowerCase()) ? 'failed' : 'completed', `${input.missionId}:${provider}:structured`)];
  if (summary) {
    lines.push('', clipText(summary, verbosity === 'verbose' ? 700 : 420));
  } else if (input.goal) {
    lines.push('', `Goal: ${clipText(input.goal, 260)}`);
  }

  if (openLink) {
    lines.push('', ...openProjectLines(openLink));
  } else if (projectPath && input.previewPending) {
    lines.push('', 'Preview is still preparing. Use the Mission board for now.');
  }

  if (verification.length > 0) {
    const checkText = verification.length === 1
      ? 'Quality check passed.'
      : `Quality checks passed (${verification.length} checks).`;
    lines.push('', checkText);
  }

  if (nextActions.length > 0) {
    lines.push('', 'Next:');
    lines.push(...nextActions.slice(0, 4).map((item) => `- ${clipText(item, 180)}`));
  }

  if (openLink && (!status || !['failed', 'error', 'blocked'].includes(status.toLowerCase()))) {
    lines.push('', nextPolishLine());
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

function relayEventKind(event: DeliverableRelayEvent): string | null {
  return typeof event.data?.kind === 'string' ? event.data.kind : null;
}

function relayEventHasPlannedTasks(event: DeliverableRelayEvent): boolean {
  return Array.isArray(event.data?.plannedTasks) && event.data.plannedTasks.length > 0;
}

function shouldDeliverProgressEvent(event: DeliverableRelayEvent, verbosity: TelegramRelayVerbosity): boolean {
  if (event.type === 'mission_failed' || event.type === 'task_failed' || event.type === 'task_cancelled') {
    return true;
  }
  if (event.type === 'mission_started' && relayEventHasPlannedTasks(event)) {
    return false;
  }
  if (event.type === 'task_progress' && relayEventKind(event) === 'artifact_generation') {
    return false;
  }
  if (event.type === 'mission_created' || event.type === 'dispatch_started') {
    return false;
  }
  if (verbosity === 'minimal') {
    return event.type === 'mission_started' || event.type === 'mission_completed';
  }
  if (verbosity === 'normal') {
    return ['mission_started', 'task_started', 'task_completed', 'mission_completed'].includes(event.type);
  }
  return [
    'mission_started',
    'task_started',
    'task_progress',
    'progress',
    'provider_feedback',
    'log',
    'task_completed',
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
  const effectiveLinkPreference = event.type === 'mission_started'
    ? missionStartLinkPreference(linkPreference)
    : linkPreference;
  const links = buildMissionSurfaceLinks(
    event.missionId,
    effectiveLinkPreference,
    undefined,
    event.type === 'mission_started' ? null : requestIdFromEvent(event)
  );

  switch (event.type) {
    case 'mission_created':
      return null;
    case 'mission_started':
      return compactTelegramBlocks(
        voiceLine('missionStarted', `${event.missionId}:started`),
        'Planning has started. The Mission board is live now.',
        'I will send the canvas link once the PRD and canvas are ready.',
        verbosity === 'normal' ? 'I will only ping when something useful changes.' : null,
        missionReferenceLines(event.missionId, links).join('\n')
      );
    case 'dispatch_started':
      return null;
    case 'task_started':
      return formatTaskStartedMessage(event);
    case 'task_completed':
      return formatTaskCompletedMessage(event);
    case 'task_progress':
    case 'progress':
    case 'provider_feedback':
    case 'log':
      const useful = usefulProgressSummary(message, taskLabel);
      if (!useful) return null;
      return compactTelegramBlocks(
        voiceLine('progress', `${event.missionId}:${event.taskId || taskLabel}:${useful}`),
        cleanTaskLabel(taskLabel),
        useful
      );
    case 'mission_completed':
      if (verbosity !== 'verbose') return null;
      return 'Build finished. Preparing the handoff summary.';
    case 'mission_failed':
      return compactTelegramBlocks(
        voiceLine('failed', `${event.missionId}:failed`),
        message ? clipText(stripMissionControlBoilerplate(message), 500) : null,
        missionReferenceLines(event.missionId, links).join('\n')
      );
    default:
      return null;
  }
}

function shouldSkipDuplicate(event: DeliverableRelayEvent): boolean {
  const providerKey = typeof event.data?.provider === 'string' && event.data.provider
    ? event.data.provider
    : event.source || 'none';
  const eventIdentity = event.taskId || event.taskName || event.message || 'mission';
  const signature = `${event.missionId}:${event.type}:${eventIdentity}:${providerKey}`;
  const now = Date.now();
  const openTaskKey = `${event.missionId}:${providerKey}`;
  if (event.type === 'task_completed' || event.type === 'task_failed' || event.type === 'task_cancelled') {
    openTaskStartCache.delete(openTaskKey);
  }
  if (event.type === 'task_started') {
    const taskKey = cleanTaskLabel(event.taskName || event.taskId || 'task').toLowerCase();
    const openTask = openTaskStartCache.get(openTaskKey);
    if (openTask && openTask.taskKey !== taskKey && now - openTask.timestamp < 10 * 60_000) {
      return true;
    }
    openTaskStartCache.set(openTaskKey, { taskKey, timestamp: now });
    const taskSignature = `${event.missionId}:${event.type}:${taskKey}:${providerKey}`;
    const previousTask = deliveryCache.get(taskSignature);
    if (typeof previousTask === 'number' && now - previousTask < 5 * 60_000) {
      return true;
    }
    deliveryCache.set(taskSignature, now);
  }
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

export function shouldSkipDuplicateForTests(event: DeliverableRelayEvent): boolean {
  return shouldSkipDuplicate(event);
}

export function shouldAcknowledgeRelayWithoutTelegramDelivery(env: NodeJS.ProcessEnv = process.env): boolean {
  return env.TELEGRAM_SMOKE_MODE === '1';
}

export function resetMissionRelayDeliveryStateForTests(): void {
  deliveryCache.clear();
  openTaskStartCache.clear();
  completionDeliveryCache.clear();
  cancelledMissionCache.clear();
  pausedMissionCache.clear();
}

export function isCompletionDeliveryCachedForTests(missionId: string): boolean {
  return completionDeliveryCache.has(missionId);
}

export async function sendFetchedCompletionSummaryForTests(
  bot: Telegraf,
  chatId: number,
  subscription: MissionSubscription,
  event: DeliverableRelayEvent,
  verbosity: TelegramRelayVerbosity,
  completion: MissionCompletionSummary
): Promise<number> {
  return sendFetchedCompletionSummary(bot, chatId, subscription, event, verbosity, completion);
}

function heartbeatKey(event: DeliverableRelayEvent): string {
  return event.missionId;
}

function heartbeatIntervalMs(verbosity: TelegramRelayVerbosity): number {
  if (verbosity === 'verbose') return 120_000;
  if (verbosity === 'normal') return 180_000;
  return 0;
}

function heartbeatStaleMs(): number {
  const parsed = Number.parseInt(process.env.SPARK_TELEGRAM_HEARTBEAT_STALE_MS || '', 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_HEARTBEAT_STALE_MS;
}

function isTerminalMissionStatus(status: string | undefined | null): boolean {
  return ['completed', 'failed', 'cancelled'].includes((status || '').toLowerCase());
}

export function shouldStopMissionHeartbeat(input: {
  elapsedMs: number;
  staleMs?: number;
  snapshot?: MissionBoardEntry | null;
}): boolean {
  if (isTerminalMissionStatus(input.snapshot?.status)) return true;
  return input.elapsedMs >= (input.staleMs ?? heartbeatStaleMs());
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
    lines.push(voiceLine('heartbeat', `${input.missionId}:${summary}`), '', 'Checkpoint:', summary);
  } else {
    lines.push(voiceLine('heartbeat', `${input.missionId}:${taskLabel}`), '', 'No new checkpoint yet.');
  }

  lines.push('', 'Focus:', taskLabel);

  if (input.verbosity === 'verbose') {
    if (status && !['running', 'created'].includes(status.toLowerCase())) {
      lines.push(`Mission state: ${status}.`);
    }
  } else {
    lines.push('', 'I will nudge you again when there is new signal.');
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
    if (shouldStopMissionHeartbeat({ elapsedMs, snapshot })) {
      clearHeartbeatForMission(event.missionId);
      const status = snapshot?.status?.toLowerCase();
      if (status === 'completed' || status === 'failed' || status === 'cancelled') {
        const message = status === 'completed'
          ? 'The board shows this run as complete. I will stop live pings and wait for the handoff.'
          : `The board shows this run as ${status}. I will stop live pings; the trace has the latest detail.`;
        bot.telegram.sendMessage(chatId, message).catch((error) => {
          console.warn('[MissionRelay] Failed to send terminal heartbeat notice:', error);
        });
      } else {
        bot.telegram.sendMessage(
          chatId,
          [
            'This run has gone quiet, so I am stopping repeated pings.',
            '',
            'Check the board or canvas trace. If it looks stranded, use /mission status or /mission kill.'
          ].join('\n')
        ).catch((error) => {
          console.warn('[MissionRelay] Failed to send stale heartbeat notice:', error);
        });
      }
      return;
    }
    const message = formatMissionHeartbeatForTelegram({
      missionId: event.missionId,
      goal: subscription.goal,
      taskLabel,
      elapsedMs,
      verbosity,
      snapshot
    });
    if (heartbeatLastMessages.get(key) === message) {
      return;
    }
    heartbeatLastMessages.set(key, message);

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
      heartbeatLastMessages.delete(key);
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

async function handleMissionCompletionMemory(
  bot: Telegraf,
  chatId: number,
  subscription: MissionSubscription,
  event: DeliverableRelayEvent,
  providerLabel: string,
  response: string
): Promise<void> {
  await stageMissionLessonCandidate(subscription, event, providerLabel, response)
    .then((approval) => {
      if (!missionLessonApprovalPromptEnabled()) return;
      return bot.telegram.sendMessage(chatId, formatMissionLessonApprovalPrompt(approval));
    })
    .catch((error) => {
      console.warn('[MissionRelay] Failed to stage mission lesson candidate:', error);
  });

  await recordShippedProjectFromMission({
    chatId: subscription.chatId,
    userId: subscription.userId,
    missionId: event.missionId,
    requestId: subscription.requestId,
    goal: subscription.goal,
    providerLabel,
    response
  }).catch((error) => {
    console.warn('[MissionRelay] Failed to record shipped project context:', error);
  });
}

function missionLessonApprovalPromptEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  return ['1', 'true', 'yes', 'on'].includes(String(env.SPARK_MISSION_LESSON_PROMPTS || '').trim().toLowerCase());
}

async function readMissionLessonApprovalState(): Promise<MissionLessonApprovalState> {
  return (await readJsonFile<MissionLessonApprovalState>(MISSION_LESSON_APPROVAL_PATH)) || { pendingByUserId: {} };
}

async function writeMissionLessonApprovalState(state: MissionLessonApprovalState): Promise<void> {
  await writeJsonAtomic(MISSION_LESSON_APPROVAL_PATH, {
    pendingByUserId: state.pendingByUserId || {}
  });
}

async function stageMissionLessonCandidate(
  subscription: MissionSubscription,
  event: DeliverableRelayEvent,
  providerLabel: string,
  response: string
): Promise<MissionLessonApproval> {
  const userId = String(subscription.userId || '').trim();
  if (!userId) {
    throw new Error('mission_lesson_missing_user');
  }
  const candidates = buildMissionLessonCandidates({
    goal: subscription.goal,
    response,
    providerLabel
  });
  const approval: MissionLessonApproval = {
    missionId: event.missionId,
    chatId: subscription.chatId,
    userId,
    requestId: subscription.requestId,
    goal: subscription.goal,
    providerLabel,
    candidates,
    sourceRefs: [`mission:${event.missionId}`, `request:${subscription.requestId}`],
    stagedAt: new Date().toISOString()
  };
  const state = await readMissionLessonApprovalState();
  const pendingByUserId = pruneOldMissionLessonApprovals(state.pendingByUserId || {});
  pendingByUserId[userId] = approval;
  await writeMissionLessonApprovalState({ pendingByUserId });
  return approval;
}

export function buildMissionLessonCandidates(input: {
  goal: string;
  response: string;
  providerLabel?: string;
}): string[] {
  const parsed = parseJsonObject(input.response);
  const summary =
    (parsed && (stringField(parsed, 'summary') || stringField(parsed, 'result'))) ||
    extractFreeformLeadSummary(input.response) ||
    input.response;
  const verification = parsed ? stringArray(parsed.verification) : extractSectionBullets(input.response, /^verification\b/i, 2);
  const changedFiles = parsed ? stringArray(parsed.changed_files).concat(stringArray(parsed.files_changed)) : [];
  const goal = clipText(input.goal, 140);
  const provider = humanizeProviderLabel(input.providerLabel || 'provider');
  const rawCandidates = [
    `Workflow lesson: for future missions like "${goal}", reuse the approach that worked here: ${clipText(summary, 220)}`,
    verification.length
      ? `Verification lesson: before closing similar missions, include verification evidence like: ${clipText(verification[0], 180)}`
      : `Verification lesson: before closing similar missions, include the result, route, and verification evidence instead of only the mission id.`,
    changedFiles.length
      ? `Evidence lesson: for build missions, preserve changed-file or preview evidence before reusing the lesson: ${clipText(changedFiles.slice(0, 4).join(', '), 180)}`
      : `Memory hygiene lesson: when ${provider} finishes a mission, turn only reusable operating guidance into memory; keep raw completion logs as operational state.`
  ];
  return dedupeMissionLessons(rawCandidates.map((candidate) => clipText(candidate, 360))).slice(0, 3);
}

function dedupeMissionLessons(candidates: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const candidate of candidates) {
    const normalized = compactWhitespace(candidate).toLowerCase();
    if (!normalized || seen.has(normalized)) continue;
    seen.add(normalized);
    result.push(candidate);
  }
  return result;
}

function formatMissionLessonApprovalPrompt(approval: MissionLessonApproval): string {
  return compactTelegramBlocks(
    'Mission lesson candidate',
    'I will not save the completion log as memory automatically.',
    [
      'What should I remember from this mission?',
      ...approval.candidates.map((candidate, index) => `${index + 1}. ${candidate}`)
    ].join('\n'),
    'Reply `/remember 1`, `/remember 2`, `/remember 3`, or `/remember <edited lesson>`.',
    'Shipped-project context was recorded separately as operational state.'
  );
}

export async function approvePendingMissionLesson(userId: string | number, rememberText: string): Promise<string | null> {
  const normalizedUserId = String(userId || '').trim();
  if (!normalizedUserId) return null;
  const state = await readMissionLessonApprovalState();
  const pendingByUserId = state.pendingByUserId || {};
  const approval = pendingByUserId[normalizedUserId];
  if (!approval) return null;

  const text = rememberText.trim();
  if (!text) return null;
  const selection = text.match(/^(\d+)$/);
  const selectedIndex = selection ? Number(selection[1]) - 1 : -1;
  if (selection && (selectedIndex < 0 || selectedIndex >= approval.candidates.length)) {
    return `Pick 1-${approval.candidates.length}, or send /remember <edited lesson>.`;
  }
  const lesson = selection ? approval.candidates[selectedIndex] : text.replace(/^lesson:\s*/i, '').trim();
  if (!lesson) return null;

  const numericUserId = Number(normalizedUserId);
  if (!Number.isFinite(numericUserId)) return null;
  const note = [
    `Approved mission lesson from Spawner mission ${approval.missionId} via ${humanizeProviderLabel(approval.providerLabel)}.`,
    `Lesson: ${clipText(lesson, 700)}`,
    `Source refs: ${approval.sourceRefs.join(', ')}.`,
    `Goal: ${clipText(approval.goal, 220)}`
  ].join(' ');
  await conversation.learnAboutUser({ id: numericUserId }, note);

  delete pendingByUserId[normalizedUserId];
  await writeMissionLessonApprovalState({ pendingByUserId });
  return [
    `Saved mission lesson: ${clipText(lesson, 700)}`,
    `Source: mission ${approval.missionId}`
  ].join('\n');
}

function pruneOldMissionLessonApprovals(pendingByUserId: Record<string, MissionLessonApproval>): Record<string, MissionLessonApproval> {
  const cutoff = Date.now() - 7 * 24 * 60 * 60 * 1000;
  const next: Record<string, MissionLessonApproval> = {};
  for (const [userId, approval] of Object.entries(pendingByUserId)) {
    const stagedAt = Date.parse(approval.stagedAt);
    if (!Number.isFinite(stagedAt) || stagedAt >= cutoff) {
      next[userId] = approval;
    }
  }
  return next;
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
  if (!identity.chatId && !identity.userId) {
    return event.missionId === subscription.missionId;
  }
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

    if (shouldAcknowledgeRelayWithoutTelegramDelivery()) {
      writeJson(res, 200, { ok: true, smokeMode: true, eventType: event.type });
      return;
    }

    try {
      const chatId = Number(subscription.chatId);
      const verbosity = await getTelegramRelayVerbosity(subscription.chatId);
      const linkPreference = await getTelegramMissionLinkPreference(subscription.chatId);

      if (event.type === 'mission_cancelled') {
        const alreadySuppressed = shouldSuppressMissionHandoff(event.missionId);
        markMissionRelayCancelled(event.missionId);
        if (!alreadySuppressed) {
          await bot.telegram.sendMessage(
            chatId,
            [
              'Mission cancelled.',
              '',
              `Mission: ${event.missionId}`,
              'I will suppress any late handoff messages for this run.'
            ].join('\n')
          );
        }
        writeJson(res, 200, { ok: true, cancelled: true });
        return;
      }

      if (event.type === 'mission_paused') {
        const alreadyPaused = isMissionRelayPaused(event.missionId);
        markMissionRelayPaused(event.missionId);
        if (!alreadyPaused) {
          await bot.telegram.sendMessage(
            chatId,
            [
              'Mission paused.',
              '',
              `Mission: ${event.missionId}`,
              'I will hold Telegram auto-handoffs until it resumes.'
            ].join('\n')
          );
        }
        writeJson(res, 200, { ok: true, paused: true });
        return;
      }

      if (event.type === 'mission_resumed') {
        const wasPaused = isMissionRelayPaused(event.missionId);
        markMissionRelayResumed(event.missionId);
        if (wasPaused) {
          await bot.telegram.sendMessage(
            chatId,
            [
              'Mission resumed.',
              '',
              `Mission: ${event.missionId}`,
              'Telegram handoffs are enabled again.'
            ].join('\n')
          );
        }
        writeJson(res, 200, { ok: true, resumed: true });
        return;
      }

	      if (event.type === 'mission_completed' || isProviderLevelCompletionEvent(event)) {
	        const completion = completionDeliveryCache.has(event.missionId)
	          ? null
	          : await fetchMissionCompletionSummary(event.missionId);
	        if (completion) {
	          const chunks = await sendFetchedCompletionSummary(bot, chatId, subscription, event, verbosity, completion);
	          writeJson(res, 200, { ok: true, chunks, completionFetched: true });
	          return;
	        }
	        scheduleDelayedCompletionSummary(bot, chatId, subscription, event, verbosity);
	        writeJson(res, 202, { ok: true, queued: 'completion_summary_retry' });
	        return;
	      }

      if (event.type === 'task_completed') {
        const extracted = extractProviderResponse(event);
        if (extracted) {
          if (shouldSuppressMissionHandoff(event.missionId)) {
            writeJson(res, 200, { ok: true, suppressed: true });
            return;
          }
          clearHeartbeatForMission(event.missionId);
          const hasProjectLink = !!(previewLinkFromEvent(event) || projectPathFromEvent(event));
          const openLink = hasProjectLink ? await readyProjectOpenLinkFromEvent(event) : undefined;
          const message = formatProviderCompletionForTelegram({
            providerLabel: extracted.providerLabel,
            response: extracted.response,
            missionId: event.missionId,
            requestId: subscription.requestId,
            goal: subscription.goal,
            verbosity,
            openLink,
            previewPending: hasProjectLink && !openLink
          });
          const chunks = chunkForTelegram(message);
          for (let i = 0; i < chunks.length; i++) {
            const prefix = chunks.length > 1 ? `(part ${i + 1} of ${chunks.length})\n` : '';
            await bot.telegram.sendMessage(chatId, `${prefix}${chunks[i]}`);
          }
          await handleMissionCompletionMemory(bot, chatId, subscription, event, extracted.providerLabel, extracted.response);
          writeJson(res, 200, { ok: true, chunks: chunks.length });
          return;
        }
      }

      if (event.type === 'task_failed' || event.type === 'task_cancelled') {
        clearHeartbeatForMission(event.missionId);
        const failure = extractProviderFailure(event);
        const label = humanizeProviderLabel(failure.providerLabel);
        await bot.telegram.sendMessage(
          chatId,
          compactTelegramBlocks(
            voiceLine('failed', `${event.missionId}:${label}:task-failed`),
            `${label} could not finish this step.`,
            clipText(stripMissionControlBoilerplate(failure.error), 500)
          )
        );
        writeJson(res, 200, { ok: true });
        return;
      }

	      if (event.type === 'mission_failed') {
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
    relayServer!.listen(port, getRelayHost(), () => {
      relayServer!.off('error', reject);
      resolve();
    });
  });

  return { port };
}
