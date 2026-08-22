import { createServer, type Server } from 'node:http';
import { existsSync } from 'node:fs';
import type { Telegraf } from 'telegraf';
import { conversation } from './conversation';
import { readJsonFile, resolveStatePath, writeJsonAtomic } from './jsonState';
import { relaySecretMatches, requireRelaySecret } from './launchMode';
import { buildMissionRelayTraceContext } from './missionRelayProof';
import { fetchMissionCompletionSummary, type MissionCompletionSummary } from './missionCompletionFetch';
import { probePreviewReachability } from './previewFetchPolicy';
import { protectRelayHealthPayload } from './relayHealthPrivacy';
import { telegramRelayIdentityFromEnv } from './relayIdentity';
import { redactIdentifier, redactText } from './redaction';
import { recordShippedProjectFromMission } from './shippedProjectContext';
import { spawnerAuthHeaders } from './spawnerAuth';
import { resolveProjectPreviewBaseUrl, resolveSpawnerPublicUrl, resolveSpawnerUiUrl } from './spawnerUrl';
import {
  claimPendingMissionRelay,
  deliverMissionFailureOnce,
  discardPendingMissionRelay,
  hasObservedTerminalMissionEvent,
  observeTerminalMissionEvent,
  registerPendingMissionRelayState,
  relayEventMatchesSubscription,
  relayIdentityMismatchPayload,
  resetMissionRelayLifecycleForTests,
  restorePendingMissionRelay
} from './missionRelayLifecycle';
import {
  isRelayRateLimited,
  pruneRelayRateLimitEntries,
  readRelayJsonBody,
  RELAY_MAX_BODY_BYTES,
  writeJson
} from './missionRelayHttp';
import {
  TerminalDeliveryCoordinator,
  type TerminalDeliveryOutboxRecord,
  type TerminalDeliveryTarget
} from './terminalDeliveryOutbox';
import type { RuntimeBuildIdentity } from './runtimeBuildIdentity';

const MISSION_LESSON_APPROVAL_PATH = resolveStatePath('.spark-mission-lesson-approvals.json');
let relayRuntimeStatus: MissionRelayRuntimeStatus = {};
let relayRuntimeBuildIdentity: RuntimeBuildIdentity | null = null;
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

export function parseRelayChatId(value: string | number): number | null {
  const normalized = typeof value === 'string' ? value.trim() : value;
  if (normalized === '') return null;
  const chatId = Number(normalized);
  return Number.isSafeInteger(chatId) && chatId !== 0 ? chatId : null;
}

export type TelegramRelayVerbosity = 'minimal' | 'normal' | 'verbose';
export type TelegramMissionLinkPreference = 'none' | 'board' | 'canvas' | 'both';
export type MissionRelayTelegramPollingState = 'starting' | 'active' | 'disabled' | 'error' | 'stopped';

export interface MissionRelayRuntimeStatus extends Record<string, unknown> {
  telegramPolling?: MissionRelayTelegramPollingState; pollingStartedAt?: string | null;
  pollingLastErrorAt?: string | null; pollingLastError?: string | null; pollingStoppedAt?: string | null;
}

export interface MissionRelayHealthPayload extends Record<string, unknown> {
  ok: boolean;
  service: 'spark-telegram-bot';
  relay: ReturnType<typeof getTelegramRelayIdentity>;
  pid: number;
  build: RuntimeBuildIdentity | null;
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
const completionDeliveryCache = new Map<string, number>();
const COMPLETION_CACHE_TTL_MS = 24 * 60 * 60_000;
const completionDeliveryInFlight = new Set<string>();
let terminalDeliveryCoordinator: TerminalDeliveryCoordinator<MissionCompletionSummary> | null = null;
let completionDeliveryCacheWriter = writeJsonAtomic;
function pruneCompletionDeliveryCache(now = Date.now()): void {
  for (const [key, ts] of completionDeliveryCache) {
    if (now - ts > COMPLETION_CACHE_TTL_MS) completionDeliveryCache.delete(key);
  }
}

const verboseNarrationCounts = new Map<string, number>();
const cancelledMissionCache = new Map<string, number>();
const pausedMissionCache = new Map<string, number>();
const missionHandoffOutcomeCache = new Map<string, { outcome: 'failed' | 'canvas_ready'; timestamp: number }>();
const heartbeatTimers = new Map<string, ReturnType<typeof setInterval>>();
const heartbeatLastMessages = new Map<string, string>();
const registry = new Map<string, MissionSubscription>();
const MISSION_STATE_CACHE_TTL_MS = 6 * 60 * 60_000;
let registryLoaded = false;
let relayServer: Server | null = null;
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

function getRelaySecret(): string {
	return requireRelaySecret();
}

function getRelayProfile(): string {
  return telegramRelayIdentityFromEnv().profile;
}

function terminalDeliveryTarget(): TerminalDeliveryTarget {
  return { relayProfile: getRelayProfile(), relayPort: getRelayPort() };
}
function getRelayHost(): string {
  const raw = process.env.TELEGRAM_RELAY_HOST || process.env.SPARK_TELEGRAM_RELAY_HOST;
  if (typeof raw === 'string' && raw.trim()) return raw.trim();
  // Default to all interfaces. Container runtimes (Railway, Docker, k8s) and external
  // health checks cannot reach a loopback-only relay. Local installs can opt back into
  // loopback by setting TELEGRAM_RELAY_HOST=127.0.0.1 explicitly.
  return '0.0.0.0';
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

let preferenceUpdateChain: Promise<void> = Promise.resolve();

function updateTelegramRelayPreferences(
  mutate: (current: TelegramRelayPreferences) => TelegramRelayPreferences
): Promise<void> {
  const next = preferenceUpdateChain.then(async () => {
    const preferences = await readTelegramRelayPreferences();
    await writeJsonAtomic(PREFERENCES_PATH, mutate(preferences));
  });
  preferenceUpdateChain = next.catch(() => undefined);
  return next;
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
  await updateTelegramRelayPreferences((preferences) => ({
    ...preferences,
    relayVerbosityByChatId: {
      ...(preferences.relayVerbosityByChatId || {}),
      [String(chatId)]: verbosity
    }
  }));
}

export async function setTelegramMissionLinkPreference(
  chatId: string | number,
  preference: TelegramMissionLinkPreference
): Promise<void> {
  await updateTelegramRelayPreferences((preferences) => ({
    ...preferences,
    missionLinksByChatId: {
      ...(preferences.missionLinksByChatId || {}),
      [String(chatId)]: preference
    }
  }));
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
  discardPendingMissionRelay(input.requestId);
  const subscription = {
    ...input,
    relayPort: input.relayPort || getRelayPort(),
    relayProfile: input.relayProfile || getRelayProfile()
  };
  registry.set(input.missionId, subscription);
  await persistRegistry();
}

export function registerPendingMissionRelay(input: Omit<MissionSubscription, 'missionId'>): void {
  registerPendingMissionRelayState(input, { relayPort: getRelayPort(), relayProfile: getRelayProfile() });
}

export {
  discardPendingMissionRelay,
  hasObservedTerminalMissionEvent,
  relayEventMatchesSubscription,
  relayIdentityMismatchPayload
};

async function bindPendingMissionRelayFromEvent(
  event: DeliverableRelayEvent
): Promise<MissionSubscription | null> {
  const claim = claimPendingMissionRelay(event, { relayPort: getRelayPort(), relayProfile: getRelayProfile() });
  if (!claim) return null;
  const { pending, subscription } = claim;
  registry.set(event.missionId, subscription);
  try {
    await persistRegistry();
    return subscription;
  } catch (error) {
    if (registry.get(event.missionId) === subscription) registry.delete(event.missionId);
    restorePendingMissionRelay(pending);
    throw error;
  }
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

function pruneMissionHandoffOutcomeCache(now = Date.now()): void {
  for (const [missionId, entry] of missionHandoffOutcomeCache.entries()) {
    if (now - entry.timestamp > MISSION_STATE_CACHE_TTL_MS) {
      missionHandoffOutcomeCache.delete(missionId);
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

export async function markLatestMissionRelayCancelledForChat(chatId: string | number, userId?: string | number): Promise<string | null> {
  await loadRegistry();
  const now = Date.now();
  const chatKey = String(chatId);
  const userKey = userId === undefined || userId === null ? null : String(userId);
  const candidates = Array.from(registry.values())
    .filter((entry) => entry.chatId === chatKey)
    .filter((entry) => !userKey || entry.userId === userKey)
    .filter((entry) => subscriptionBelongsToThisRelay(entry))
    .map((entry) => {
      const createdMs = Date.parse(entry.createdAt || '');
      return { entry, createdMs: Number.isFinite(createdMs) ? createdMs : 0 };
    })
    .filter(({ createdMs }) => !createdMs || now - createdMs <= MISSION_STATE_CACHE_TTL_MS)
    .sort((a, b) => b.createdMs - a.createdMs);

  const latest = candidates[0]?.entry;
  if (!latest?.missionId) return null;
  markMissionRelayCancelled(latest.missionId);
  return latest.missionId;
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

export function getMissionHandoffOutcome(missionId: string): 'failed' | 'canvas_ready' | null {
  pruneMissionHandoffOutcomeCache();
  const normalized = missionId.trim();
  return normalized ? missionHandoffOutcomeCache.get(normalized)?.outcome || null : null;
}

export function tryClaimMissionHandoffOutcome(
  missionId: string,
  outcome: 'failed' | 'canvas_ready'
): boolean {
  pruneMissionHandoffOutcomeCache();
  const normalized = missionId.trim();
  if (!normalized || missionHandoffOutcomeCache.has(normalized)) return false;
  missionHandoffOutcomeCache.set(normalized, { outcome, timestamp: Date.now() });
  if (outcome === 'failed') {
    pausedMissionCache.delete(normalized);
    clearHeartbeatForMission(normalized);
  }
  return true;
}

export function shouldSuppressMissionHandoff(missionId: string): boolean {
  pruneCancelledMissionCache();
  prunePausedMissionCache();
  const normalized = missionId.trim();
  return (
    cancelledMissionCache.has(normalized)
    || pausedMissionCache.has(normalized)
    || getMissionHandoffOutcome(normalized) === 'failed'
  );
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

function isProviderLevelCompletionEvent(event: DeliverableRelayEvent): boolean {
  return event.type === 'task_completed' && !event.taskId && !event.taskName;
}

function isTerminalSummaryEvent(event: DeliverableRelayEvent): boolean {
  return event.type === 'mission_completed' || isProviderLevelCompletionEvent(event);
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
    [OUTBOUND_TRACE_CONTEXT_KEY]: buildMissionRelayTraceContext(subscription, event, replyKind)
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
    completionDeliveryCache.set(event.missionId, Date.now());
    try {
      await saveCompletionDeliveryCache();
    } catch (error) {
      completionDeliveryCache.delete(event.missionId);
      throw error;
    }
    await handleMissionCompletionMemory(bot, chatId, subscription, event, completion.providerLabel, completion.response);
    return chunks.length;
  } finally {
    completionDeliveryInFlight.delete(event.missionId);
  }
}

function safeCompletionSummaryErrorDetail(error: unknown): string {
  if (error instanceof Error) {
    const prefix = error.name && error.name !== 'Error' ? `${error.name}: ` : '';
    return redactText(`${prefix}${error.message || 'unknown error'}`);
  }
  if (typeof error === 'string') return redactText(error);
  if (error && typeof error === 'object') {
    try {
      return redactText(JSON.stringify(error));
    } catch {
      return redactText(String(error));
    }
  }
  return redactText(String(error ?? 'unknown error'));
}

function formatCompletionSummaryDeliveryFailureLog(missionId: string, error: unknown): string {
  const missionRef = redactIdentifier(missionId, 'mission');
  const detail = safeCompletionSummaryErrorDetail(error).trim() || 'unknown error';
  return `[CompletionSummary] delivery failed mission=${missionRef} error=${detail}`;
}

function terminalDeliveryRetryBaseMs(): number {
  const configured = Number(process.env.SPARK_TERMINAL_DELIVERY_RETRY_BASE_MS || '1000');
  return Number.isFinite(configured) ? configured : 1000;
}

function ensureTerminalDeliveryCoordinator(bot: Telegraf): TerminalDeliveryCoordinator<MissionCompletionSummary> {
  if (terminalDeliveryCoordinator) return terminalDeliveryCoordinator;
  terminalDeliveryCoordinator = new TerminalDeliveryCoordinator({
    target: terminalDeliveryTarget(),
    retryBaseMs: terminalDeliveryRetryBaseMs(),
    resolve: (record) => fetchMissionCompletionSummary(record.missionId, {
      spawnerBaseUrl: spawnerUiUrl(), headers: spawnerAuthHeaders(), readyOpenLink: readyProjectOpenLink, attempts: 1
    }),
    deliver: async (record, completion) => {
      if (completionDeliveryCache.has(record.missionId)) return 'delivered';
      if (isMissionRelayPaused(record.missionId)) return 'paused';
      pruneCancelledMissionCache();
      if (cancelledMissionCache.has(record.missionId) || getMissionHandoffOutcome(record.missionId) === 'failed') {
        return 'discarded';
      }
      const subscription = registry.get(record.missionId);
      if (!subscription || !subscriptionBelongsToThisRelay(subscription)) {
        throw new Error('terminal relay subscription unavailable');
      }
      const chatId = parseRelayChatId(subscription.chatId);
      if (chatId === null) return 'discarded';
      const event: DeliverableRelayEvent = { type: record.eventType, missionId: record.missionId };
      const verbosity = await getTelegramRelayVerbosity(subscription.chatId);
      await sendFetchedCompletionSummary(bot, chatId, subscription, event, verbosity, completion);
      if (completionDeliveryCache.has(record.missionId)) return 'delivered';
      if (isMissionRelayPaused(record.missionId)) return 'paused';
      throw new Error('terminal delivery did not persist completion evidence');
    },
    onFailure: (missionId, reason) => {
      console.warn(formatCompletionSummaryDeliveryFailureLog(missionId, reason));
    }
  });
  return terminalDeliveryCoordinator;
}

async function queueTerminalDelivery(
  bot: Telegraf,
  event: DeliverableRelayEvent
): Promise<'queued' | 'duplicate'> {
  const coordinator = ensureTerminalDeliveryCoordinator(bot);
  if (completionDeliveryCache.has(event.missionId)) {
    await coordinator.cancel(event.missionId);
    return 'duplicate';
  }
  const result = await coordinator.enqueue({
    missionId: event.missionId,
    eventType: event.type === 'mission_completed' ? 'mission_completed' : 'task_completed',
    paused: isMissionRelayPaused(event.missionId)
  });
  return result.created ? 'queued' : 'duplicate';
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
    /\bread-only (?:sandbox|workspace|filesystem)\b/.test(normalized) ||
    /\bpatch (?:was )?rejected\b/.test(normalized) ||
    /\boperation not permitted\b/.test(normalized) ||
    /\bfailed to connect to 127\.0\.0\.1\b/.test(normalized) ||
    /\bunknown error\b/.test(normalized) ||
    /\bcould not finish\b/.test(normalized) ||
    /\b(?:mission|run|step)\s+failed\b/.test(normalized)
  );
}

function providerCompletionLooksStaged(text: string): boolean {
  const normalized = compactWhitespace(text).toLowerCase();
  if (!normalized) return false;
  return (
    /\b(?:mission|run|board)\s+(?:is\s+|shows\s+the\s+mission\s+in\s+)?`?created`?\b/.test(normalized) ||
    /\b(?:tasks?|steps?)\s+queued\b/.test(normalized) && /\b(?:created|canvas_ready|0%)\b/.test(normalized) ||
    /\bexecution\s+(?:is\s+)?(?:still\s+)?pending\b/.test(normalized) ||
    /\bqueued,\s*not\s+completed\b/.test(normalized) ||
    /\b(?:i(?:'ll|\s+will)|we(?:'ll|\s+will))\s+(?:now\s+)?(?:run|verify|inspect|check|perform|execute)\b.{0,260}\b(?:then\s+)?(?:return|report|send|provide)\b/.test(normalized) ||
    /\bcanvas_ready\b/.test(normalized) && /\b0%\b/.test(normalized)
  );
}

function providerCompletionKind(status: string | null | undefined, text: string): 'completed' | 'failed' {
  const normalizedStatus = status?.toLowerCase();
  if (normalizedStatus && ['failed', 'error', 'blocked'].includes(normalizedStatus)) return 'failed';
  if (providerCompletionLooksBlocked(text)) return 'failed';
  return 'completed';
}

function freeformFailureLines(text: string): string[] {
  const normalized = compactWhitespace(stripMarkdownFileLinks(stripThinkingAndMeta(text))).toLowerCase();
  const lines: string[] = [];
  if (/\bblocked before task start\b/.test(normalized)) {
    lines.push('Blocked before task start.');
  }
  if (/\bh70\b|\bskill api\b|\bapi\/h70-skills\b/.test(normalized)) {
    lines.push('Skill API was unavailable in the spawned lane.');
  }
  if (/\bread-only\b|\boperation not permitted\b|\bpatch (?:was )?rejected\b|\bcannot write\b|\bnot writable\b/.test(normalized)) {
    lines.push('The spawned runner or workspace could not write.');
  }
  if (/\bfailed to connect\b|\bconnection refused\b|\beconnrefused\b/.test(normalized)) {
    lines.push('A local service connection failed in the spawned lane.');
  }
  if (/\bunknown error\b/.test(normalized)) {
    lines.push('The provider only gave me `unknown error`, so I do not want to guess.');
  }
  if (lines.length === 0 && providerCompletionLooksBlocked(text)) {
    lines.push('The provider reported a blocker before completion.');
  }
  return Array.from(new Set(lines)).slice(0, 4);
}

export function renderTaskFailureBody(error: string, missionId: string): string {
  const cleaned = redactText(stripMissionControlBoilerplate(error))
    .split(/\r?\n/)
    .filter((line) => !/^\s*at\s+\S/.test(line))
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim();
  const detail = !cleaned || /^unknown error$/i.test(cleaned)
    ? 'The provider did not return a usable failure reason, so I will not guess.'
    : clipText(cleaned, 360);
  const safeMissionId = /^[A-Za-z0-9._:-]{1,120}$/.test(missionId) ? missionId : '';
  return compactTelegramBlocks(
    detail,
    'You can retry the goal with /run after checking the blocker.',
    safeMissionId
      ? `Check current state with /mission status ${safeMissionId}.`
      : 'Check current state with /mission status.'
  );
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

function stripVisibleMissionReferences(text: string): string {
  return text
    .split(/\r?\n/)
    .filter((line) => !/^\s*Mission:\s*(?:spark|mission|dispatch)-[\w-]+\s*$/i.test(line))
    .join('\n')
    .replace(/\b(?:spark|mission|dispatch)-\d{6,}\b/gi, 'this mission')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function looksLikeInternalProgress(message: string): boolean {
  const normalized = message.toLowerCase();
  return (
    /\bskill_loaded\b/.test(normalized) ||
    /\bloaded skills?\b/.test(normalized) ||
    /\bno handoff yet\b/.test(normalized) ||
    /\bpreparing the canvas\b/.test(normalized) ||
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

async function readyProjectOpenLink(
  previewUrl: string | null,
  projectPath: string | null,
  probe: (url: string) => Promise<boolean> = probePreviewReachability
): Promise<string | null> {
  const openLink = normalizePreviewLink(previewUrl, projectPath) || projectOpenLink(projectPath);
  if (!openLink) return null;
  if (/^https?:\/\//i.test(openLink)) {
    return await probe(openLink) ? openLink : null;
  }
  return openLink;
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

async function readyProjectOpenLinkFromEvent(event: DeliverableRelayEvent): Promise<string | null> {
  const projectPath = projectPathFromEvent(event);
  return readyProjectOpenLink(previewLinkFromEvent(event), projectPath);
}

function openProjectLines(openLink: string | null): string[] {
  return openLink ? ['Open it here:', openLink] : [];
}

const POLISH_LINES = [
  "Let me know if you'd like to polish anything.",
  'If you want changes, just tell me what to tweak next.',
  'Happy to tune anything that feels off.',
  "Tell me what you'd like adjusted and I can keep going."
] as const;

function nextPolishLine(seed = 'default'): string {
  return POLISH_LINES[stableHash(`polish:${seed}`) % POLISH_LINES.length] || POLISH_LINES[0];
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
  const headingLine = lines[start]?.trim() || '';
  const inlineContent = headingLine.replace(headingPattern, '').trim();
  for (const inlineBullet of inlineContent.split(/\s+-\s+/).map((item) => item.replace(/^[-*]\s+/, '').trim())) {
    if (!inlineBullet || inlineBullet === ':' || inlineBullet === '-') continue;
    if (!/\[[^\]]+\]\(|(?:[A-Za-z]:\\|\/(?:c|Users|home|root)\/)/i.test(inlineBullet)) {
      bullets.push(clipText(inlineBullet, 180));
    }
    if (bullets.length >= maxItems) break;
  }
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

function summarizeVerificationChecks(checks: string[]): string {
  const joined = checks.join(' ').toLowerCase();
  if (/\bfailed\b|\bfail\b|\berror\b|\bmissing\b|\bblocked\b/.test(joined)) {
    return 'Some checks passed, but one still needs attention.';
  }
  const hasBuild = /\bbuild\b|npm\s+run\s+build|dist\//.test(joined);
  const hasTest = /\btest\b|pytest|vitest|smoke/.test(joined);
  const hasVisual = /\bbrowser\b|chrome|mobile|visual|preview|opened/.test(joined);
  if (hasBuild && hasTest) return 'Checked it; the build and smoke tests passed.';
  if (hasBuild) return 'Checked it; the build passed.';
  if (hasVisual) return 'Checked it; the app opened cleanly.';
  return 'Checked it; the important checks passed.';
}

function summarizeStagedVerificationChecks(checks: string[]): string {
  const joined = checks.join(' ').toLowerCase();
  if (/\bfailed\b|\bfail\b|\berror\b|\bmissing\b|\bblocked\b/.test(joined)) {
    return 'The handoff is staged, but one check still needs attention.';
  }
  if (/\bcanvas_ready\b|\bcanvas is ready\b|\bcreated\b|\bqueued\b/.test(joined)) {
    return 'Canvas is ready; queued, not completed.';
  }
  return 'Staged the handoff; execution is still pending.';
}

function extractFreeformLeadSummary(text: string): string | null {
  const cleaned = stripVisibleMissionReferences(stripMarkdownFileLinks(stripThinkingAndMeta(text)));
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
  return '';
}

function completedTaskPhrase(taskLabel: string): string {
  const replacements: Array<[RegExp, string]> = [
    [/^build\s+and\s+(?:smoke[-\s]?)?check\b/i, 'built and checked'],
    [/^create\b/i, 'created'],
    [/^implement\b/i, 'implemented'],
    [/^polish\b/i, 'polished'],
    [/^verify\b/i, 'verified'],
    [/^check\b/i, 'checked'],
    [/^add\b/i, 'added'],
    [/^build\b/i, 'built'],
    [/^design\b/i, 'designed'],
    [/^write\b/i, 'wrote'],
    [/^wire\b/i, 'wired'],
    [/^set\s+up\b/i, 'set up']
  ];
  for (const [pattern, replacement] of replacements) {
    if (pattern.test(taskLabel)) {
      return taskLabel.replace(pattern, replacement);
    }
  }
  return `finished ${taskLabel}`;
}

function isProviderOnlyTaskLabel(taskLabel: string): boolean {
  return /^(?:codex|claude|zai|z\.ai|glm|minimax|openai|gpt|provider)$/i.test(taskLabel.trim());
}

function formatTaskCompletedMessage(event: DeliverableRelayEvent): string {
  const taskLabel = cleanTaskLabel(event.taskName || event.taskId || 'Build step');
  if (isProviderOnlyTaskLabel(taskLabel)) return '';
  const done = completedTaskPhrase(taskLabel);
  if (/^build\s+and\s+check\s+the\s+single[-\s]file\s+static\s+page$/i.test(taskLabel)) {
    return `nice, ${done}.`;
  }
  const taskNumber = Number(taskNumberFromEvent(event));
  if (Number.isFinite(taskNumber) && taskNumber > 0) {
    const templates = VOICE_LINES.taskDone;
    const template = templates[(taskNumber - 1) % templates.length] || templates[0];
    return template.replace(/\{task\}/g, taskLabel).replace(/\{done\}/g, done);
  }
  return voiceLine('taskDone', `${event.missionId}:${taskLabel}`, { task: taskLabel, done });
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
    const clean = stripVisibleMissionReferences(stripMarkdownFileLinks(stripThinkingAndMeta(input.response)));
    const cleanWithoutProvider = clean.replace(/^(?:Z\.AI|ZAI|Claude|Codex|MiniMax|GLM)(?:\s+GLM)?\s*:\s*/i, '').trim();
    if (!clean) {
      const openLink = input.openLink ? normalizePreviewLink(input.openLink, null) : null;
      if (openLink) {
        return [
          voiceLine('completed', `${input.missionId}:${provider}:empty-with-link`),
          '',
          ...openProjectLines(openLink),
          '',
          nextPolishLine(input.missionId)
        ].join('\n');
      }
      return [
        '⚪ The run finished, but it did not send useful final notes back.',
        '',
        'Open the preview or board if you want to inspect the result.'
      ].join('\n');
    }
    if (/^completed without (?:a )?(?:text response|final notes?|local preview url)\.?$/i.test(cleanWithoutProvider)) {
      const openLink = input.openLink ? normalizePreviewLink(input.openLink, null) : null;
      if (openLink) {
        return [
          voiceLine('completed', `${input.missionId}:${provider}:placeholder-with-link`),
          '',
          ...openProjectLines(openLink),
          '',
          nextPolishLine(input.missionId)
        ].join('\n');
      }
      return [
        '⚪ The run finished, but it did not send useful final notes back.',
        '',
        'Open the preview or board if you want to inspect what changed.'
      ].join('\n');
    }
    const looksStructured = clean.trim().startsWith('{') || clean.trim().startsWith('[');
    if (looksStructured) {
      return [
        '⚠️ Spark finished, but the final payload needs a look.',
        '',
        'Review',
        `• ${provider} returned structured output I could not summarize cleanly.`,
        '',
        'The canvas or board has the full record.'
      ].join('\n');
    }
    const projectPath = extractProjectPathFromText(input.response);
    const openLink = input.openLink !== undefined
      ? (input.openLink ? normalizePreviewLink(input.openLink, projectPath) : null)
      : projectOpenLink(projectPath);
    const shipped = extractSectionBullets(input.response, /^What shipped:/i, 4);
    const checks = extractSectionBullets(input.response, /^Verification passed:/i, 4);
    const lead = extractFreeformLeadSummary(input.response);
    const completionKind = providerCompletionKind(null, clean);
    const staged = completionKind !== 'failed' && providerCompletionLooksStaged(input.response);
    const lines = [staged
      ? '🛠️ Staged the handoff; execution is still pending.'
      : voiceLine(completionKind, `${input.missionId}:${provider}:freeform`)
    ];
    const failureLines = completionKind === 'failed' ? freeformFailureLines(input.response) : [];
    if (failureLines.length > 0) {
      lines.push('', 'What blocked it', ...failureLines.map((line) => `• ${line}`));
    } else if (lead) {
      lines.push('', lead);
    }
    if (completionKind === 'failed' && !openLink) {
      lines.push('', 'The board has the full trace if you want to inspect it.');
    }
    if (openLink) {
      lines.push('', ...openProjectLines(openLink));
    } else if (projectPath && input.previewPending) {
      lines.push('', 'Preview is not ready yet. The board can show the run meanwhile.');
    }
    const requestedMissionControlLinks = requestedMissionControlLinkLines(input.missionId, input.goal);
    if (requestedMissionControlLinks.length > 0) {
      lines.push('', 'Mission Control', ...requestedMissionControlLinks.map((line) => `• ${line}`));
    }
    if (shipped.length > 0) {
      lines.push('', 'Shipped', ...shipped.map((item) => `• ${item}`));
    }
    if (checks.length > 0) {
      if (verbosity === 'verbose') {
        lines.push('', 'Quality checks', ...checks.map((item) => `• ${item}`));
      } else {
        lines.push('', staged ? summarizeStagedVerificationChecks(checks) : summarizeVerificationChecks(checks));
      }
    }
    if (openLink) lines.push('', nextPolishLine(input.missionId));
    if (lines.length > 1) return lines.join('\n');
    return [
      `${provider} says:`,
      '',
      clean
    ].join('\n').trim();
  }

  const status = stringField(parsed, 'status');
  const rawSummary = stringField(parsed, 'summary') || stringField(parsed, 'message');
  const summary = rawSummary ? stripVisibleMissionReferences(rawSummary) : null;
  const completionKind = providerCompletionKind(status, [summary, input.response].filter(Boolean).join('\n'));
  const projectPath = stringField(parsed, 'project_path') || stringField(parsed, 'projectPath');
  const openLink = input.openLink !== undefined
    ? (input.openLink ? normalizePreviewLink(input.openLink, projectPath) : null)
    : projectOpenLink(projectPath);
  const verification = stringArray(parsed.verification);
  const nextActions = stringArray(parsed.next_actions || parsed.nextActions);

  if (verbosity === 'minimal') {
    return [
      voiceLine(completionKind, `${input.missionId}:${provider}:minimal`),
      summary ? clipText(summary, 240) : null,
      openLink ? openProjectLines(openLink).join('\n') : null
    ].filter(Boolean).join('\n');
  }

  const lines: string[] = [voiceLine(completionKind, `${input.missionId}:${provider}:structured`)];
  if (summary) {
    lines.push('', clipText(summary, verbosity === 'verbose' ? 700 : 420));
  } else if (input.goal) {
    lines.push('', `Goal: ${clipText(input.goal, 260)}`);
  }

  if (openLink) {
    lines.push('', ...openProjectLines(openLink));
  } else if (projectPath && input.previewPending) {
    lines.push('', 'Preview is not ready yet. The board can show the run meanwhile.');
  }
  const requestedMissionControlLinks = requestedMissionControlLinkLines(input.missionId, input.goal);
  if (requestedMissionControlLinks.length > 0) {
    lines.push('', 'Mission Control', ...requestedMissionControlLinks.map((line) => `• ${line}`));
  }

  if (verification.length > 0) {
    lines.push('', summarizeVerificationChecks(verification));
  }

  if (nextActions.length > 0) {
    lines.push('', 'Next');
    lines.push(...nextActions.slice(0, 4).map((item) => `• ${clipText(item, 180)}`));
  }

  if (openLink && completionKind === 'completed') {
    lines.push('', nextPolishLine(input.missionId));
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
    return ['mission_started', 'mission_completed'].includes(event.type);
  }
  return [
    'mission_started',
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
        verbosity === 'normal'
          ? 'I will keep the noise low and only ping when something useful changes.'
          : 'Builder and Spawner are attached behind the scenes.',
        missionReferenceLines(event.missionId, links).join('\n')
      );
    case 'dispatch_started':
      return null;
    case 'task_started':
      return null;
    case 'task_completed':
      return formatTaskCompletedMessage(event) || null;
    case 'task_progress':
    case 'progress':
    case 'provider_feedback':
    case 'log':
      const useful = usefulProgressSummary(message, taskLabel);
      if (!useful) return null;
      if (/^build\s+and\s+check\s+the\s+single[-\s]file\s+static\s+page$/i.test(cleanTaskLabel(taskLabel))) {
        return compactTelegramBlocks(
          voiceLine('progress', `${event.missionId}:${event.taskId || taskLabel}:${useful}`),
          useful
        );
      }
      return compactTelegramBlocks(
        voiceLine('progress', `${event.missionId}:${event.taskId || taskLabel}:${useful}`),
        progressFocusAddsSignal(useful, taskLabel) ? `Working on: ${cleanTaskLabel(taskLabel)}` : null,
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
  terminalDeliveryCoordinator?.stop();
  terminalDeliveryCoordinator = null;
  completionDeliveryCacheWriter = writeJsonAtomic;
  deliveryCache.clear();
  openTaskStartCache.clear();
  completionDeliveryCache.clear();
  completionDeliveryInFlight.clear();
  cancelledMissionCache.clear();
  pausedMissionCache.clear();
  missionHandoffOutcomeCache.clear();
  resetMissionRelayLifecycleForTests();
  verboseNarrationCounts.clear();
}

export function isCompletionDeliveryCachedForTests(missionId: string): boolean {
  return completionDeliveryCache.has(missionId);
}

export function claimCompletionDeliveryForTests(missionId: string): boolean {
  if (completionDeliveryCache.has(missionId) || completionDeliveryInFlight.has(missionId)) {
    return false;
  }
  completionDeliveryInFlight.add(missionId);
  return true;
}

export function releaseCompletionDeliveryClaimForTests(missionId: string): void {
  completionDeliveryInFlight.delete(missionId);
}

async function saveCompletionDeliveryCache(): Promise<void> {
  pruneCompletionDeliveryCache();
  await completionDeliveryCacheWriter(completionDeliveryPathForCurrentRelay(), Array.from(completionDeliveryCache.keys()));
}

async function loadCompletionDeliveryCache(): Promise<void> {
  const entries = (await readJsonFile<string[]>(completionDeliveryPathForCurrentRelay())) || [];
  for (const missionId of entries) {
    if (typeof missionId === 'string' && missionId.trim()) {
      completionDeliveryCache.set(missionId.trim(), Date.now());
    }
  }
}

export async function loadCompletionDeliveryCacheForTests(): Promise<void> {
  await loadCompletionDeliveryCache();
}

export function setCompletionDeliveryCacheWriterForTests(
  writer: typeof writeJsonAtomic | null
): void {
  completionDeliveryCacheWriter = writer || writeJsonAtomic;
}

export function resetMissionRelayRegistryForTests(): void {
  registry.clear();
  registryLoaded = false;
}

function claimVerboseNarrationSlot(
  event: DeliverableRelayEvent,
  chatId: string | number,
  verbosity: TelegramRelayVerbosity
): boolean {
  if (verbosity !== 'verbose') {
    return true;
  }
  if (['mission_started', 'mission_completed', 'mission_failed', 'task_failed', 'task_cancelled'].includes(event.type)) {
    return true;
  }
  const key = `${event.missionId}:${chatId}`;
  const count = verboseNarrationCounts.get(key) || 0;
  if (count >= 3) {
    return false;
  }
  verboseNarrationCounts.set(key, count + 1);
  return true;
}

export function claimVerboseNarrationSlotForTests(
  event: DeliverableRelayEvent,
  chatId: string | number,
  verbosity: TelegramRelayVerbosity
): boolean {
  return claimVerboseNarrationSlot(event, chatId, verbosity);
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

export function formatCompletionSummaryDeliveryFailureLogForTests(missionId: string, error: unknown): string {
  return formatCompletionSummaryDeliveryFailureLog(missionId, error);
}

export function resolveReadyProjectOpenLinkForTests(
  previewUrl: string | null,
  projectPath: string | null,
  probe?: (url: string) => Promise<boolean>
): Promise<string | null> {
  return readyProjectOpenLink(previewUrl, projectPath, probe);
}

function heartbeatKey(event: DeliverableRelayEvent): string {
  return event.missionId;
}

function heartbeatIntervalMs(verbosity: TelegramRelayVerbosity): number {
  if (verbosity === 'verbose') return 120_000;
  return 0;
}

export function heartbeatIntervalMsForTests(verbosity: TelegramRelayVerbosity): number {
  return heartbeatIntervalMs(verbosity);
}

function heartbeatStaleMs(): number {
  const parsed = Number.parseInt(process.env.SPARK_TELEGRAM_HEARTBEAT_STALE_MS || '', 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_HEARTBEAT_STALE_MS;
}

function isTerminalMissionStatus(status: string | undefined | null): boolean {
  return ['completed', 'failed', 'cancelled'].includes((status || '').toLowerCase());
}

function heartbeatSignalTokens(text: string): Set<string> {
  const stop = new Set(['the', 'and', 'for', 'with', 'into', 'from', 'this', 'that', 'step', 'task', 'build', 'project']);
  const tokens = text
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, ' ')
    .split(/\s+/)
    .map((token) => token.replace(/(?:ing|ed|es|s|e)$/i, ''))
    .filter((token) => token.length >= 4 && !stop.has(token));
  return new Set(tokens);
}

function heartbeatFocusAddsSignal(summary: string | null, taskLabel: string): boolean {
  if (!summary) return true;
  const summaryTokens = heartbeatSignalTokens(summary);
  const taskTokens = heartbeatSignalTokens(taskLabel);
  if (taskTokens.size === 0) return false;
  let overlap = 0;
  for (const token of taskTokens) {
    if (summaryTokens.has(token)) overlap += 1;
  }
  return overlap / taskTokens.size < 0.5;
}

function progressFocusAddsSignal(summary: string | null, taskLabel: string): boolean {
  if (!summary) return true;
  const cleanedSummary = summary.trim();
  if (!cleanedSummary) return true;
  const summaryTokens = heartbeatSignalTokens(cleanedSummary);
  const lower = cleanedSummary.toLowerCase();
  const concreteChange = /\b(added|created|implemented|wired|fixed|verified|expanded|present|passed|built|saved|connected|updated)\b/.test(lower);
  if (summaryTokens.size >= 4 && concreteChange) return false;
  return heartbeatFocusAddsSignal(cleanedSummary, taskLabel);
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
    lines.push(voiceLine('heartbeat', `${input.missionId}:${summary}`), '', `What changed: ${summary}`);
  } else {
    lines.push(
      voiceLine('heartbeat', `${input.missionId}:${taskLabel}`),
      '',
      'I will only nudge you when something actually changes.'
    );
  }

  if (summary && heartbeatFocusAddsSignal(summary, taskLabel)) {
    lines.push('', `Working on: ${taskLabel}`);
  }

  if (input.verbosity === 'verbose') {
    if (status && !['running', 'created'].includes(status.toLowerCase())) {
      lines.push(`Mission state: ${status}.`);
    }
  } else if (summary) {
    lines.push('', 'I will nudge you again when something actually changes.');
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
        bot.telegram
          .sendMessage(chatId, message, missionRelayTraceExtra(subscription, event, 'mission_heartbeat'))
          .catch((error) => {
            console.warn('[MissionRelay] Failed to send terminal heartbeat notice:', error);
          });
      } else {
        bot.telegram.sendMessage(
          chatId,
          [
            'This run has gone quiet, so I am stopping repeated pings.',
            '',
            'Check the board or canvas trace. If it looks stranded, use /mission status or /mission kill.'
          ].join('\n'),
          missionRelayTraceExtra(subscription, event, 'mission_heartbeat')
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

    bot.telegram
      .sendMessage(chatId, message, missionRelayTraceExtra(subscription, event, 'mission_heartbeat'))
      .catch((error) => {
        console.warn('[MissionRelay] Failed to send heartbeat:', error);
      });
  }, interval);

  timer.unref?.();
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
    '🟡 Mission memory needs your call.',
    'I will not save the completion log as memory automatically.',
    [
      'Options',
      ...approval.candidates.map((candidate, index) => `• ${index + 1}: ${candidate}`)
    ].join('\n'),
    [
      'Reply with `/remember 1`, `/remember 2`, `/remember 3`, or `/remember <edited lesson>`.'
    ].join('\n')
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

export { pruneRelayRateLimitEntries, readRelayJsonBody };

export function setMissionRelayRuntimeStatus(status: MissionRelayRuntimeStatus): void {
  relayRuntimeStatus = { ...status };
}

export function setMissionRelayRuntimeBuildIdentity(identity: RuntimeBuildIdentity | null): void {
  relayRuntimeBuildIdentity = identity ? { ...identity } : null;
}

export function missionRelayHealthPayload(): MissionRelayHealthPayload {
  const polling = relayRuntimeStatus.telegramPolling;
  const ready = (polling === 'active' || polling === 'disabled') && relayRuntimeBuildIdentity !== null;
  return {
    ok: ready,
    service: 'spark-telegram-bot',
    relay: getTelegramRelayIdentity(),
    pid: process.pid,
    build: relayRuntimeBuildIdentity,
    runtime: relayRuntimeStatus
  };
}

export async function startMissionRelay(bot: Telegraf): Promise<{ port: number }> {
  await loadRegistry();
  await loadCompletionDeliveryCache();

  if (relayServer) {
    return { port: getRelayPort() };
  }

		const port = getRelayPort();
		const terminalCoordinator = ensureTerminalDeliveryCoordinator(bot);

	relayServer = createServer(async (req, res) => {
  try {
    if (req.method === 'GET' && (req.url === '/' || req.url === '/health')) {
      const response = protectRelayHealthPayload(
        missionRelayHealthPayload(),
        req.headers['x-spark-telegram-relay-secret'],
        getRelaySecret()
      );
      writeJson(res, response.status, response.payload);
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

    const bodyOutcome = await readRelayJsonBody<RelayWebhookPayload>(req);
    if (bodyOutcome.kind === 'too_large') {
      writeJson(res, 413, {
        ok: false,
        error: 'payload_too_large',
        message: 'Spawner relay event exceeded the Telegram relay body limit.',
        max_bytes: RELAY_MAX_BODY_BYTES,
      });
      return;
    }
    if (bodyOutcome.kind === 'timeout') {
      writeJson(res, 408, {
        ok: false,
        error: 'relay_body_timeout',
        message: 'Spawner relay event body did not finish within the allowed window.',
      });
      return;
    }
    const payload = bodyOutcome.kind === 'ok' ? bodyOutcome.payload : null;
    const event = payload?.event;
    if (!payload || !shouldDeliverEvent(event)) {
      writeJson(res, 400, { ok: false, error: 'invalid_event' });
      return;
    }

    if (!shouldAcceptRelayEventForThisBot(event)) {
      writeJson(res, 202, { ok: true, ignored: 'foreign_relay_target' });
      return;
    }

    let subscription = registry.get(event.missionId);
    if (!subscription) {
      subscription = await bindPendingMissionRelayFromEvent(event) || undefined;
    }
    if (!subscription) {
      await refreshRegistry();
      subscription = registry.get(event.missionId);
    }
    if (!subscription) {
      subscription = await bindPendingMissionRelayFromEvent(event) || undefined;
    }
    if (!subscription) {
      writeJson(res, 202, { ok: true, ignored: 'unknown_mission' });
      return;
    }

    if (!relayEventMatchesSubscription(event, subscription)) {
      writeJson(res, 403, relayIdentityMismatchPayload());
      return;
    }

    observeTerminalMissionEvent(event);
    const isDefinitiveTerminalEvent = ['mission_completed', 'mission_failed', 'mission_cancelled'].includes(event.type);
    if (hasObservedTerminalMissionEvent(event.missionId) && !isDefinitiveTerminalEvent && event.type !== 'task_failed') {
      writeJson(res, 202, { ok: true, suppressed: 'mission_already_terminal' });
      return;
    }

    const failureDeliveryOwnsDedupe = event.type === 'task_failed' || event.type === 'mission_failed';
    if (!isTerminalSummaryEvent(event) && !failureDeliveryOwnsDedupe && shouldSkipDuplicate(event)) {
      writeJson(res, 202, { ok: true, duplicate: true });
      return;
    }

    if (shouldAcknowledgeRelayWithoutTelegramDelivery()) {
      writeJson(res, 200, { ok: true, smokeMode: true, eventType: event.type });
      return;
    }

    try {
      const chatId = parseRelayChatId(subscription.chatId);
      if (chatId === null) {
        writeJson(res, 400, { ok: false, error: 'invalid_chat_id' });
        return;
      }
      const verbosity = await getTelegramRelayVerbosity(subscription.chatId);
      const linkPreference = await getTelegramMissionLinkPreference(subscription.chatId);

      if (event.type === 'mission_cancelled') {
        const alreadySuppressed = shouldSuppressMissionHandoff(event.missionId);
        markMissionRelayCancelled(event.missionId);
        await terminalCoordinator.cancel(event.missionId);
        if (!alreadySuppressed) {
          const links = buildMissionSurfaceLinks(event.missionId, linkPreference, undefined, requestIdFromEvent(event));
          await bot.telegram.sendMessage(
            chatId,
            formatMissionRelayStateMessageForTelegram({ state: 'cancelled', missionId: event.missionId, links }),
            missionRelayTraceExtra(subscription, event, 'mission_cancelled')
          );
        }
        writeJson(res, 200, { ok: true, cancelled: true });
        return;
      }

      if (event.type === 'mission_paused') {
        const alreadyPaused = isMissionRelayPaused(event.missionId);
        markMissionRelayPaused(event.missionId);
        await terminalCoordinator.pause(event.missionId);
        if (!alreadyPaused) {
          const links = buildMissionSurfaceLinks(event.missionId, linkPreference, undefined, requestIdFromEvent(event));
          await bot.telegram.sendMessage(
            chatId,
            formatMissionRelayStateMessageForTelegram({ state: 'paused', missionId: event.missionId, links }),
            missionRelayTraceExtra(subscription, event, 'mission_paused')
          );
        }
        writeJson(res, 200, { ok: true, paused: true });
        return;
      }

      if (event.type === 'mission_resumed') {
        const wasPaused = isMissionRelayPaused(event.missionId);
        markMissionRelayResumed(event.missionId);
        await terminalCoordinator.resume(event.missionId);
        if (wasPaused) {
          const links = buildMissionSurfaceLinks(event.missionId, linkPreference, undefined, requestIdFromEvent(event));
          await bot.telegram.sendMessage(
            chatId,
            formatMissionRelayStateMessageForTelegram({ state: 'resumed', missionId: event.missionId, links }),
            missionRelayTraceExtra(subscription, event, 'mission_resumed')
          );
        }
        writeJson(res, 200, { ok: true, resumed: true });
        return;
      }

		      if (isTerminalSummaryEvent(event)) {
		        const queued = await queueTerminalDelivery(bot, event);
		        writeJson(res, 202, { ok: true, queued: 'completion_summary_delivery', duplicate: queued === 'duplicate' });
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
            await bot.telegram.sendMessage(
              chatId,
              `${prefix}${chunks[i]}`,
              missionRelayTraceExtra(subscription, event, 'mission_completion')
            );
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
        const sendFailure = () => bot.telegram.sendMessage(
          chatId,
          compactTelegramBlocks(
            voiceLine('failed', `${event.missionId}:${label}:task-failed`),
            `${label} could not finish this step.`,
            renderTaskFailureBody(failure.error, event.missionId)
          ),
          missionRelayTraceExtra(subscription, event, 'mission_failed')
        ).then(() => undefined);
        const delivery = event.type === 'task_failed'
          ? await deliverMissionFailureOnce(event.missionId, sendFailure)
          : (await sendFailure(), 'delivered' as const);
        if (event.type === 'task_failed') {
          tryClaimMissionHandoffOutcome(event.missionId, 'failed');
        }
        if (delivery === 'duplicate') {
          writeJson(res, 200, { ok: true, suppressed: 'mission_failure_handoff_already_claimed' });
          return;
        }
        writeJson(res, 200, { ok: true });
        return;
      }

      if (event.type === 'mission_failed') {
        const existingOutcome = getMissionHandoffOutcome(event.missionId);
        if (existingOutcome === 'canvas_ready') {
          writeJson(res, 200, { ok: true, suppressed: 'canvas_ready_handoff_already_sent' });
          return;
        }
        if (existingOutcome === 'failed') {
          writeJson(res, 200, { ok: true, suppressed: 'mission_failure_handoff_already_claimed' });
          return;
        }
        clearHeartbeatForMission(event.missionId);
        const progressMessage = formatProgressMessageForTelegram(event, subscription, verbosity, linkPreference, payload.summary);
        if (!progressMessage) {
          writeJson(res, 202, { ok: true, ignored: 'event_type_not_delivered' });
          return;
        }
        const chunks = chunkForTelegram(progressMessage);
        const delivery = await deliverMissionFailureOnce(event.missionId, async () => {
          for (let i = 0; i < chunks.length; i++) {
            const prefix = chunks.length > 1 ? `(part ${i + 1} of ${chunks.length})\n` : '';
            await bot.telegram.sendMessage(
              chatId,
              `${prefix}${chunks[i]}`,
              missionRelayTraceExtra(subscription, event, 'mission_progress')
            );
          }
        });
        tryClaimMissionHandoffOutcome(event.missionId, 'failed');
        writeJson(res, 200, {
          ok: true,
          chunks: delivery === 'delivered' ? chunks.length : 0,
          ...(delivery === 'duplicate' ? { suppressed: 'mission_failure_handoff_already_claimed' } : {})
        });
        return;
      }

      scheduleHeartbeat(bot, chatId, event, subscription, verbosity);

      const progressMessage = formatProgressMessageForTelegram(event, subscription, verbosity, linkPreference, payload.summary);
      if (!progressMessage) {
        writeJson(res, 202, { ok: true, ignored: 'event_type_not_delivered' });
        return;
      }
      if (!claimVerboseNarrationSlot(event, chatId, verbosity)) {
        writeJson(res, 202, { ok: true, ignored: 'verbose_narration_cap' });
        return;
      }

      const chunks = chunkForTelegram(progressMessage);
      for (let i = 0; i < chunks.length; i++) {
        const prefix = chunks.length > 1 ? `(part ${i + 1} of ${chunks.length})\n` : '';
        await bot.telegram.sendMessage(
          chatId,
          `${prefix}${chunks[i]}`,
          missionRelayTraceExtra(subscription, event, 'mission_progress')
        );
      }
      writeJson(res, 200, { ok: true, chunks: chunks.length });
    } catch (error) {
      console.error('[MissionRelay] Failed to deliver Telegram update:', error);
      writeJson(res, 500, { ok: false, error: 'delivery_failed' });
    }
  } catch (error) {
    console.error('[MissionRelay] Failed to handle relay request:', redactText(error instanceof Error ? error.message : String(error)));
    if (!res.headersSent && !res.writableEnded) {
      writeJson(res, 500, { ok: false, error: 'internal_error' });
    } else if (!res.writableEnded) {
      res.destroy();
    }
  }
  });

  await new Promise<void>((resolve, reject) => {
    relayServer!.once('error', reject);
    relayServer!.listen(port, getRelayHost(), () => {
      relayServer!.off('error', reject);
      resolve();
    });
  });

  await terminalCoordinator.recover();

  return { port };
}

export async function stopMissionRelayForTests(): Promise<void> {
  terminalDeliveryCoordinator?.stop();
  terminalDeliveryCoordinator = null;
  const server = relayServer;
  relayServer = null;
  if (!server) return;
  await new Promise<void>((resolve) => server.close(() => resolve()));
}
