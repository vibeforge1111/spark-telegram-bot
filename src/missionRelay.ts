```
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
let relayRuntimeStatus: MissionRelayRuntimeStatus = {};
const OUTBOUND_TRACE_CONTEXT_KEY = '__sparkTraceContext';

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
  traceRef?: string;
  goal: string;
  createdAt: string;
  relayPort?: number;
  relayProfile?: string;
  updateId?: number;
}

export type TelegramRelayVerbosity = 'minimal' | 'normal' | 'verbose';
export type TelegramMissionLinkPreference = 'none' | 'board' | 'canvas' | 'both';
export type MissionRelayTelegramPollingState = 'starting' | 'active' | 'disabled';

export interface MissionRelayRuntimeStatus {
  telegramPolling?: MissionRelayTelegramPollingState;
  pollingStartedAt?: string | null;
}

export interface MissionRelayHealthPayload extends Record<string, unknown> {
  ok: boolean;
  service: 'spark-telegram-bot';
  relay: ReturnType<typeof getTelegramRelayIdentity>;
  pid: number;
  runtime: MissionRelayRuntimeStatus;
}

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

const LEGACY_REGISTRY_PATH = resolveStatePath('.spark-spawner-missions.json');
const PREFERENCES_PATH = resolveStatePath('.spark-telegram-preferences.json');
const deliveryCache = new Map<string, number>();
const openTaskStartCache = new Map<string, { taskKey: string; timestamp: number }>();
const completionDeliveryCache = new Set<string>();
const completionDeliveryInFlight = new Set<string>();
const verboseNarrationCounts = new Map<string, number>();
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

function stateFileSafeSegment(value: string): string {
  return value.replace(/[^A-Za-z0-9_-]+/g, '-').replace(/^-+|-+$/g, '') || 'default';
}

function registryPathForCurrentRelay(): string {
  return resolveStatePath(`.spark-spawner-missions-${stateFileSafeSegment(getRelayProfile())}-${getRelayPort()}.json`);
}

function completionDeliveryPathForCurrentRelay(): string {
  return resolveStatePath(`.spark-mission-completions-${stateFileSafeSegment(getRelayProfile())}-${getRelayPort()}.json`);
}

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
      return 'Minimal sends pickup, final handoff, and failures only.';
    case 'verbose':
      return 'Verbose adds a few meaningful milestone updates, without task-start chatter.';
    case 'normal':
    default:
      return 'Normal sends pickup, canvas-ready, final handoff, and failures.';
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

  try {
    const scopedEntries = (await readJsonFile<MissionSubscription[]>(registryPathForCurrentRelay())) || [];
    const legacyEntries = existsSync(LEGACY_REGISTRY_PATH)
      ? (await readJsonFile<MissionSubscription[]>(LEGACY_REGISTRY_PATH)) || []
      : [];
    const entries = [...scopedEntries, ...legacyEntries];
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
    await writeJsonAtomic(registryPathForCurrentRelay(), Array.from(registry.values()));
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
    links.push(`Mission board: ${baseUrl}/kanban?${missionQuery}`);
  }
  if (preference === 'canvas' || preference === 'both') {
    links.push(`Canvas: ${baseUrl}/canvas?${canvasQuery}`);
  }
  return links;
}

function shouldIncludeRequestedMissionControlLinks(goal?: string): boolean {
  const normalized = (goal || '').toLowerCase().replace(/\s+/g, ' ').trim();
  if (!normalized) return false;
  return (
    /\bshare\b/.test(normalized) &&
    /\b(?:canvas|kanban|view execution|execution)\b/.test(normalized)
  ) || (
    /\bno[-\s]*edit\b/.test(normalized) &&
    /\b(?:mission control|spawner)\b/.test(normalized) &&
    /\b(?:canvas|kanban|view execution|execution)\b/.test(normalized)
  );
}

function requestedMissionControlLinkLines(missionId: string, goal?: string): string[] {
  if (!shouldIncludeRequestedMissionControlLinks(goal)) return [];
  const baseUrl = spawnerPublicUrl();
  const missionQuery = `mission=${encodeURIComponent(missionId)}`;
  return [
    `Canvas: ${baseUrl}/canvas?${missionQuery}`,
    `Kanban: ${baseUrl}/kanban?${missionQuery}`,
    `View execution: ${baseUrl}/canvas?${missionQuery}`
  ];
}

function missionIdIsLinked(missionId: string, links: string[]): boolean {
  const encoded = encodeURIComponent(missionId);
  return links.some((link) => link.includes(`mission=${encoded}`));
}

function missionReferenceLines(missionId: string, links: string[]): string[] {
  return missionIdIsLinked(missionId, links) ? links : [`Mission: ${missionId}`, ...links];
}

export function formatMissionRelayStateMessageForTelegram(input: {
  state: 'cancelled' | 'paused' | 'resumed';
  missionId: string;
  links?: string[];
}): string {
  const links = input.links || [];
  const movement = input.state === 'cancelled'
    ? ['Run cancelled.', 'I will keep any late handoff messages quiet for this one.']
    : input.state === 'paused'
      ? ['Run paused.', 'I will hold Telegram handoffs until it resumes.']
      : ['Run resumed.', 'Telegram handoffs are back on.'];
  return compactTelegramBlocks(
    movement[0],
    movement[1],
    links.length > 0 ? links.join('\n') : null
  );
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
        const openLink = await readyProjectOpenLink(previewUrl, projectPath);
        const providerLabel = completedProvider && typeof completedProvider.providerId === 'string'
          ? completedProvider.providerId
          : 'provider';
        return {
          providerLabel,
          response: responseText,
          openLink,
          previewPending: false
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

function traceRefFromEvent(event: DeliverableRelayEvent): string | undefined {
  const value = event.data?.traceRef ?? event.data?.trace_ref;
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function missionRelayTraceExtra(
  subscription: MissionSubscription,
  event: DeliverableRelayEvent,
  replyKind: string
): Record<string, unknown> {
  return {
    [OUTBOUND_TRACE_CONTEXT_KEY]: {
      route: 'mission_relay',
      command: 'mission_relay',
      replyKind,
      requestId: subscription.requestId,
      traceRef: subscription.traceRef || traceRefFromEvent(event),
      missionId: event.missionId
    }
  };
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
  if (completionDeliveryCache.has(event.missionId) || completionDeliveryInFlight.has(event.missionId)) {
    return 0;
  }
  completionDeliveryInFlight.add(event.missionId);
  try {
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
      await bot.telegram.sendMessage(
        chatId,
        `${prefix}${chunks[i]}`,
        missionRelayTraceExtra(subscription, event, 'mission_completion')
      );
    }
    completionDeliveryCache.add(event.missionId);
    await saveCompletionDeliveryCache();
    await handleMissionCompletionMemory(bot, chatId, subscription, event, completion.providerLabel, completion.response);
    return chunks.length;
  } finally {
    completionDeliveryInFlight.delete(event.missionId);
  }
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
    })().catch((error) => {
      console.warn('[MissionRelay] Delayed completion summary failed:', error);
    });
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
    '🛠️ Spark is on it.',
    '🛠️ The run is moving.',
    '🛠️ Spark picked it up.',
    '🛠️ We are underway.'
  ],
  taskStarted: [
    'Step {n} started',
    'Step {n} is moving',
    'Now working on step {n}',
    'Step {n} is underway'
  ],
  taskDone: [
    '{done}.',
    '✨ {done}.',
    'small win: {done}.',
    'nice, {done}.'
  ],
  progress: [
    'small update.',
    'quick progress.',
    'a bit more progress.',
    'small win.'
  ],
  heartbeat: [
    'still working.',
    'still with it.',
    'still moving.',
    'still shaping this.'
  ],
  completed: [
    '✨ I got this one finished for you.',
    '✨ I got it done for you.',
    '✨ done, this one came back clean.',
    '✨ nice, this one is finished.'
  ],
  failed: [
    '⚠️ That run hit a blocker.',
    '⚠️ The build got blocked.',
    '⚠️ Spark could not finish that one.',
    '⚠️ This one needs a quick look.'
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

function providerCompletionLooksBlocked(text: string): boolean {
  const normalized = compactWhitespace(text).toLowerCase();
  if (!normalized) return false;
  return (
    /\bblocked before task start\b/.test(normalized) ||
    /\bblocked by (?:the |this |current )?(?:execution )?environment\b/.test(normalized) ||
    /\bcould not load (?:the )?mandatory h70 skills\b/.test(normalized) ||
    /\bfailed to load (?:the )?mandatory h70 skills\b/.test(normalized) ||
    /\bi did not create (?:any )?files\b/.test(normalized) ||
    /\bdid not create (?:any )?files\b/.test(normalized) ||
    /\bworkspace (?:is|was) read-only\b/.test(normalized) ||