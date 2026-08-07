import type { DeliverableRelayEvent, MissionSubscription } from './missionRelay';

const MISSION_STATE_CACHE_TTL_MS = 6 * 60 * 60_000;
const PENDING_MISSION_RELAY_TTL_MS = 15 * 60_000;
const PENDING_MISSION_RELAY_MAX_ENTRIES = 200;

export type PendingMissionSubscription = Omit<MissionSubscription, 'missionId'> & { expiresAt: number };

const pendingMissionRelays = new Map<string, PendingMissionSubscription>();
const missionFailureDeliveryCache = new Map<string, number>();
const missionFailureDeliveryInFlight = new Map<string, { startedAt: number; promise: Promise<void> }>();
const terminalMissionEventCache = new Map<string, number>();

function eventRequestId(event: DeliverableRelayEvent): string | null {
  const value = event.data?.requestId;
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function eventTraceRef(event: DeliverableRelayEvent): string | undefined {
  const value = event.data?.traceRef ?? event.data?.trace_ref;
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function prunePendingMissionRelays(now = Date.now()): void {
  for (const [requestId, entry] of pendingMissionRelays) {
    if (entry.expiresAt <= now) pendingMissionRelays.delete(requestId);
  }
  while (pendingMissionRelays.size >= PENDING_MISSION_RELAY_MAX_ENTRIES) {
    const oldest = pendingMissionRelays.keys().next().value;
    if (oldest === undefined) break;
    pendingMissionRelays.delete(oldest);
  }
}

export function registerPendingMissionRelayState(
  input: Omit<MissionSubscription, 'missionId'>,
  target: { relayPort: number; relayProfile: string }
): void {
  const requestId = input.requestId.trim();
  if (!requestId) return;
  prunePendingMissionRelays();
  pendingMissionRelays.set(requestId, {
    ...input,
    requestId,
    relayPort: input.relayPort || target.relayPort,
    relayProfile: input.relayProfile || target.relayProfile,
    expiresAt: Date.now() + PENDING_MISSION_RELAY_TTL_MS
  });
}

export function discardPendingMissionRelay(requestId: string): void {
  pendingMissionRelays.delete(requestId.trim());
}

export function claimPendingMissionRelay(
  event: DeliverableRelayEvent,
  target: { relayPort: number; relayProfile: string }
): { pending: PendingMissionSubscription; subscription: MissionSubscription } | null {
  prunePendingMissionRelays();
  const requestId = eventRequestId(event);
  if (!requestId) return null;
  const pending = pendingMissionRelays.get(requestId);
  const traceRef = eventTraceRef(event);
  if (
    !pending
    || (pending.relayPort !== undefined && pending.relayPort !== target.relayPort)
    || (pending.relayProfile !== undefined && pending.relayProfile !== target.relayProfile)
    || (pending.traceRef && pending.traceRef !== traceRef)
  ) return null;

  pendingMissionRelays.delete(requestId);
  const { expiresAt: _expiresAt, ...pendingSubscription } = pending;
  return { pending, subscription: { ...pendingSubscription, missionId: event.missionId } };
}

export function restorePendingMissionRelay(pending: PendingMissionSubscription): void {
  if (pending.expiresAt > Date.now() && !pendingMissionRelays.has(pending.requestId)) {
    pendingMissionRelays.set(pending.requestId, pending);
  }
}

function pruneMissionTerminalCaches(now = Date.now()): void {
  for (const cache of [missionFailureDeliveryCache, terminalMissionEventCache]) {
    for (const [missionId, timestamp] of cache) {
      if (now - timestamp > MISSION_STATE_CACHE_TTL_MS) cache.delete(missionId);
    }
  }
  for (const [missionId, entry] of missionFailureDeliveryInFlight) {
    if (now - entry.startedAt > MISSION_STATE_CACHE_TTL_MS) missionFailureDeliveryInFlight.delete(missionId);
  }
}

export async function deliverMissionFailureOnce(
  missionId: string,
  send: () => Promise<void>
): Promise<'delivered' | 'duplicate'> {
  pruneMissionTerminalCaches();
  if (missionFailureDeliveryCache.has(missionId)) return 'duplicate';
  const existing = missionFailureDeliveryInFlight.get(missionId);
  if (existing) {
    try {
      await existing.promise;
    } catch {
      // The waiting webhook can take over the retry.
    }
    return deliverMissionFailureOnce(missionId, send);
  }

  const promise = send();
  const entry = { startedAt: Date.now(), promise };
  missionFailureDeliveryInFlight.set(missionId, entry);
  try {
    await promise;
    missionFailureDeliveryCache.set(missionId, Date.now());
    return 'delivered';
  } finally {
    if (missionFailureDeliveryInFlight.get(missionId) === entry) {
      missionFailureDeliveryInFlight.delete(missionId);
    }
  }
}

export function observeTerminalMissionEvent(event: DeliverableRelayEvent): void {
  if (
    event.type === 'task_failed'
    || event.type === 'mission_completed'
    || event.type === 'mission_failed'
    || event.type === 'mission_cancelled'
  ) {
    pruneMissionTerminalCaches();
    terminalMissionEventCache.set(event.missionId, Date.now());
  }
}

export function hasObservedTerminalMissionEvent(missionId: string): boolean {
  pruneMissionTerminalCaches();
  return terminalMissionEventCache.has(missionId)
    || missionFailureDeliveryCache.has(missionId)
    || missionFailureDeliveryInFlight.has(missionId);
}

function normalizeRelayIdentityValue(value: unknown): string | null {
  if (typeof value === 'string' && value.trim()) return value.trim();
  if (typeof value === 'number' && Number.isFinite(value)) return String(Math.trunc(value));
  return null;
}

export function relayEventMatchesSubscription(
  event: DeliverableRelayEvent,
  subscription: MissionSubscription
): boolean {
  if (event.missionId !== subscription.missionId) return false;
  const data = event.data && typeof event.data === 'object' ? event.data : {};
  const chatId = normalizeRelayIdentityValue(data.chatId);
  const userId = normalizeRelayIdentityValue(data.userId);
  if (!chatId && !userId) return true;
  return Boolean(chatId && userId && chatId === subscription.chatId && userId === subscription.userId);
}

export function relayIdentityMismatchPayload(): Record<string, unknown> {
  return {
    ok: false,
    error: 'relay_identity_mismatch',
    message: 'Spawner and Telegram disagree on relay identity for this mission event.',
    repair: 'Run spark restart telegram-starter, or run spark setup telegram-starter --resume if the relay profile/port changed.'
  };
}

export function resetMissionRelayLifecycleForTests(): void {
  pendingMissionRelays.clear();
  missionFailureDeliveryCache.clear();
  missionFailureDeliveryInFlight.clear();
  terminalMissionEventCache.clear();
}
