import type { BuildLane } from './buildIntent';
import { isNoExecutionBoundary } from './conversationIntent';

export const BUILD_CLARIFICATION_TTL_MS = 30 * 60 * 1000;

export interface PendingBuildClarification {
  requestId: string;
  prd: string;
  projectName: string;
  projectPath: string | null;
  buildMode: 'direct' | 'advanced_prd';
  buildModeReason: string;
  buildLane?: BuildLane;
  buildLaneReason?: string;
  capabilityProposalPacket?: Record<string, unknown>;
  executionAuthority?: unknown;
  questions: string[];
  addedAssumptions: string[];
  timestamp: number;
}

const buildClarifications = new Map<string, PendingBuildClarification>();

export function telegramPendingBuildKey(chatId: string | number | undefined, userId: string | number | undefined): string {
  return `${chatId ?? 'unknown'}-${userId ?? 'unknown'}`;
}

export function rememberPendingBuildClarification(key: string, entry: PendingBuildClarification): void {
  buildClarifications.set(key, entry);
}

export function getPendingBuildClarification(key: string): PendingBuildClarification | null {
  return buildClarifications.get(key) || null;
}

export function deletePendingBuildClarification(key: string): boolean {
  return buildClarifications.delete(key);
}

export function cleanupPendingBuildClarifications(now = Date.now()): number {
  let removed = 0;
  for (const [key, entry] of buildClarifications) {
    if (isPendingBuildClarificationExpired(entry, now)) {
      buildClarifications.delete(key);
      removed += 1;
    }
  }
  return removed;
}

export function isPendingBuildClarificationExpired(
  entry: { timestamp: number },
  now = Date.now()
): boolean {
  return now - entry.timestamp > BUILD_CLARIFICATION_TTL_MS;
}

export function isPendingClarificationAlternativeRequest(text: string): boolean {
  const normalized = text.trim().toLowerCase().replace(/\s+/g, ' ');
  if (!normalized) return false;
  return [
    /\bwhat\s+else\s+(?:would\s+you\s+)?(?:recommend|suggest|try|build|make|create)\b/,
    /\b(?:something|anything)\s+(?:different|else)\b.*\b(?:recommend|suggest|try|build|make|create)\b/,
    /\b(?:try|do|explore)\s+something\s+different\b/,
    /\b(?:other|different)\s+(?:ideas?|directions?|options?|recommendations?|suggestions?)\b/
  ].some((pattern) => pattern.test(normalized));
}

function isPendingClarificationSteeringAnswer(text: string): boolean {
  const normalized = text.trim().toLowerCase().replace(/\s+/g, ' ');
  if (!normalized || normalized.length > 180) return false;
  if (/[?]/.test(normalized)) return false;
  if (isNoExecutionBoundary(normalized) || isPendingClarificationAlternativeRequest(normalized)) return false;
  if (/^(?:but|and|also|because|why|what|where|when|who|how|should|could|would)\b/.test(normalized)) return false;
  const hasSteeringLanguage = /\b(?:feel|tone|style|vibe|direction|make it|closer to|more|less|playful|weird|practical|premium|chill|atmospheric|fast|score|score-chasing|strange|surreal|useful|simple|polished|dark|bright|fun|serious|cozy|sharp|experimental|arcade|puzzle|narrative)\b/.test(normalized);
  const looksLikePreferenceList =
    /\b(?:and|but|with|without|somewhat|kind of|kinda|closer to)\b/.test(normalized) &&
    !/\b(?:build|create|make|run|start|launch|ship|mission|canvas|kanban)\b/.test(normalized);
  return hasSteeringLanguage || looksLikePreferenceList;
}

export function isPendingClarificationFollowup(text: string): boolean {
  const normalized = text.trim().toLowerCase().replace(/\s+/g, ' ');
  if (!normalized) return false;
  if (isNoExecutionBoundary(normalized) || isPendingClarificationAlternativeRequest(normalized)) return false;
  if (/^(?:go|run|start|ship|yes|yep|yeah|ok|okay|sure|perfect|do it|let'?s go|default|defaults|skip)$/i.test(normalized)) {
    return true;
  }
  const startsWithConfirmation = /^(?:yes|yeah|yep|ok|okay|sure|perfect|sounds good|great|cool)\b/.test(normalized);
  const contextualObject = /\b(?:it|this|that|the project|the dashboard|the app|the build)\b/.test(normalized);
  const action = /\b(?:build|create|make|ship|start|run|do|use|analyz|analyse)\b/.test(normalized);
  return (
    contextualObject &&
    action &&
    (startsWithConfirmation || /\b(?:create|build|make|ship|start|run|do)\s+(?:it|this|that)\b/.test(normalized))
  ) || isPendingClarificationSteeringAnswer(normalized);
}

export function shouldUsePendingClarificationForMessage(
  entry: { timestamp: number } | null | undefined,
  text: string,
  now = Date.now()
): boolean {
  if (!entry) return false;
  if (isPendingBuildClarificationExpired(entry, now)) return false;
  return true;
}

export function pendingBuildClarificationForMessage(key: string, text: string): PendingBuildClarification | null {
  const entry = getPendingBuildClarification(key);
  if (!entry) return null;
  if (!shouldUsePendingClarificationForMessage(entry, text)) {
    deletePendingBuildClarification(key);
    return null;
  }
  return entry;
}
