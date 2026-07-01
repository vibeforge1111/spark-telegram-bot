export const PENDING_CREATOR_MISSION_TTL_MS = 30 * 60 * 1000;

export type PendingCreatorMissionAction = 'run' | 'status' | 'validate';

export interface PendingCreatorMission {
  missionId: string;
  timestamp: number;
}

const creatorMissions = new Map<string, PendingCreatorMission>();

export function telegramPendingCreatorMissionKey(chatId: string | number | undefined, userId: string | number | undefined): string {
  return `${chatId ?? 'unknown'}-${userId ?? 'unknown'}`;
}

export function rememberPendingCreatorMission(key: string, entry: PendingCreatorMission): void {
  creatorMissions.set(key, entry);
}

export function getPendingCreatorMission(key: string): PendingCreatorMission | null {
  return creatorMissions.get(key) || null;
}

export function deletePendingCreatorMission(key: string): boolean {
  return creatorMissions.delete(key);
}

export function isPendingCreatorMissionExpired(entry: { timestamp: number }, now = Date.now()): boolean {
  return now - entry.timestamp > PENDING_CREATOR_MISSION_TTL_MS;
}

export function cleanupPendingCreatorMissions(now = Date.now()): number {
  let removed = 0;
  for (const [key, entry] of creatorMissions) {
    if (isPendingCreatorMissionExpired(entry, now)) {
      creatorMissions.delete(key);
      removed += 1;
    }
  }
  return removed;
}

export function parsePendingCreatorMissionAction(text: string): PendingCreatorMissionAction | null {
  const normalized = text.trim().toLowerCase().replace(/\s+/g, ' ');
  if (!normalized) return null;
  if (/^(?:run|start|execute|kick off|go|go ahead|do it|run it|start it|execute it|kick it off)(?:\s+(?:the\s+)?(?:(?:creator\s+)?mission|private\s+path|specialization\s+path|path|autoloop))?$/i.test(normalized)) {
    return 'run';
  }
  if (/^(?:validate|verify|test)(?:\s+(?:it|the\s+(?:creator\s+)?mission|the\s+private\s+path|the\s+specialization\s+path|the\s+path|the\s+benchmark(?:\s+pack)?|the\s+autoloop|the\s+evidence|the\s+capability\s+gain))?$/i.test(normalized) ||
    /^(?:run|start)\s+(?:validation|checks?|benchmarks?|benchmark\s+validation|the\s+checks?)(?:\s+(?:on|for)\s+(?:it|the\s+path|the\s+specialization\s+path|the\s+benchmark(?:\s+pack)?))?$/i.test(normalized)) {
    return 'validate';
  }
  if (/^(?:status|show status|check|check status|what'?s happening|what happened|where are we|show me status|show me what improved|what improved|did it improve|is it better yet|prepare it for review)(?:\s+(?:for\s+)?(?:it|the\s+(?:creator\s+)?mission|the\s+private\s+path|the\s+specialization\s+path|the\s+path|the\s+benchmark(?:\s+pack)?))?$/i.test(normalized)) {
    return 'status';
  }
  return null;
}
