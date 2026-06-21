import { isMissionExecutionConfirmation, isNoExecutionBoundary } from './conversationIntent';

export const DOMAIN_CHIP_BUILD_TTL_MS = 30 * 60 * 1000;

export interface PendingDomainChipBuild {
  brief: string;
  prd: string;
  projectName: string;
  buildMode: 'direct' | 'advanced_prd';
  buildModeReason: string;
  capabilityProposalPacket?: Record<string, unknown>;
  timestamp: number;
}

const domainChipBuilds = new Map<string, PendingDomainChipBuild>();

export function telegramPendingDomainChipKey(chatId: string | number | undefined, userId: string | number | undefined): string {
  return `${chatId ?? 'unknown'}-${userId ?? 'unknown'}`;
}

export function rememberPendingDomainChipBuild(key: string, entry: PendingDomainChipBuild): void {
  domainChipBuilds.set(key, entry);
}

export function getPendingDomainChipBuild(key: string): PendingDomainChipBuild | null {
  return domainChipBuilds.get(key) || null;
}

export function deletePendingDomainChipBuild(key: string): boolean {
  return domainChipBuilds.delete(key);
}

export function isPendingDomainChipBuildExpired(entry: { timestamp: number }, now = Date.now()): boolean {
  return now - entry.timestamp > DOMAIN_CHIP_BUILD_TTL_MS;
}

export function cleanupPendingDomainChipBuilds(now = Date.now()): number {
  let removed = 0;
  for (const [key, entry] of domainChipBuilds) {
    if (isPendingDomainChipBuildExpired(entry, now)) {
      domainChipBuilds.delete(key);
      removed += 1;
    }
  }
  return removed;
}

export function isDomainChipPendingStart(text: string): boolean {
  const normalized = text.trim().toLowerCase();
  return /^(?:go|start|run|build|create|make|ship|do it|build it|create it|make it|start it)$/i.test(normalized) ||
    /^(?:please\s+)?(?:go ahead(?: and)?\s+)?(?:start|run|build|create|make|ship)\s+(?:it|this|that|the|this\s+domain[-\s]*chip|that\s+domain[-\s]*chip|the\s+domain[-\s]*chip|the\s+pending\s+domain[-\s]*chip)(?:\s+(?:now|with\b.*|using\b.*))?$/i.test(normalized) ||
    /^(?:please\s+)?(?:go ahead(?: and)?\s+)?use\s+(?:the\s+)?(?:default|defaults|recommended\s+defaults)(?:\s+(?:for|on)\s+(?:it|this|that|this\s+domain[-\s]*chip|that\s+domain[-\s]*chip|the\s+domain[-\s]*chip))?$/i.test(normalized) ||
    isMissionExecutionConfirmation(text);
}

export function isBareDomainChipPendingYes(text: string): boolean {
  return /^(?:yes|yeah|yep|ok|okay|sure|perfect)$/i.test(text.trim());
}

export function isDomainChipPendingCancel(text: string): boolean {
  return isNoExecutionBoundary(text) || /^(?:cancel|stop|never mind|nevermind|not now|no)$/i.test(text.trim());
}

export function isDomainChipPendingDirection(text: string): boolean {
  const normalized = text.trim().toLowerCase().replace(/\s+/g, ' ');
  if (!normalized || normalized.length > 260) return false;
  if (isDomainChipPendingStart(normalized) || isDomainChipPendingCancel(normalized)) return true;
  if (/^(?:what|which|how|why|can|could|should|would|do|does|did|is|are|will)\b/.test(normalized)) return false;
  if (/\b(?:test|tests|testing|unit\s+test|qa|bug\s+hunter|bug\s+hunt|edge\s+cases?|spawner|mission\s+control|workflow|prs?|publish|merge|ship)\b/.test(normalized)) {
    return false;
  }
  return /\b(?:names?|rationale|usage\s+angle|vibe|style|tone|output|outputs?|luxury|absurd|consumer|sci[-\s]*fi|surreal|weird|funny|serious|enterprise|developer|technical|visual|image|poster|prompt|prompts|boundar(?:y|ies)|scope|scoped|narrower|hooks?|activation|limits?|router|contracts?|fraud|chargeback|risk|compliance|support)\b/.test(normalized);
}

export function pendingDomainChipPrdWithUserDirection(pending: PendingDomainChipBuild, text: string): string {
  if (isDomainChipPendingStart(text)) {
    return `${pending.prd}\n\n## Pre-build direction\n\nUse the default direction: surreal-but-usable outputs, short rationale, usage angle, and router-safe tests.`;
  }
  return `${pending.prd}\n\n## User direction before build\n\n${text.trim()}`;
}
