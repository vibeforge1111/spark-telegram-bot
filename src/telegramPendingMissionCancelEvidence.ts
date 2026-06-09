export const MISSION_CANCEL_CONFIRMATION_TTL_MS = 5 * 60 * 1000;

export interface PendingMissionCancelConfirmation {
  missionId: string;
  title: string;
  timestamp: number;
}

const missionCancelConfirmations = new Map<string, PendingMissionCancelConfirmation>();

export function telegramPendingMissionCancelKey(chatId: string | number | undefined, userId: string | number | undefined): string {
  return `${chatId ?? 'unknown'}-${userId ?? 'unknown'}`;
}

export function rememberPendingMissionCancelConfirmation(key: string, entry: PendingMissionCancelConfirmation): void {
  missionCancelConfirmations.set(key, entry);
}

export function getPendingMissionCancelConfirmation(key: string): PendingMissionCancelConfirmation | null {
  return missionCancelConfirmations.get(key) || null;
}

export function deletePendingMissionCancelConfirmation(key: string): boolean {
  return missionCancelConfirmations.delete(key);
}

export function isPendingMissionCancelConfirmationExpired(entry: { timestamp: number }, now = Date.now()): boolean {
  return now - entry.timestamp > MISSION_CANCEL_CONFIRMATION_TTL_MS;
}

export function cleanupPendingMissionCancelConfirmations(now = Date.now()): number {
  let removed = 0;
  for (const [key, entry] of missionCancelConfirmations) {
    if (isPendingMissionCancelConfirmationExpired(entry, now)) {
      missionCancelConfirmations.delete(key);
      removed += 1;
    }
  }
  return removed;
}

export function isMissionCancelConfirmationText(text: string): boolean {
  const normalized = text.trim().toLowerCase().replace(/\s+/g, ' ');
  return (
    /^(?:yes[,\s]+)?(?:cancel|kill|stop)\s+(?:it|that|that\s+mission|this\s+mission|the\s+mission)$/.test(normalized) ||
    /^confirm\s+(?:cancel|kill|stop)(?:\s+(?:it|that|that\s+mission|this\s+mission|the\s+mission))?$/.test(normalized)
  );
}
