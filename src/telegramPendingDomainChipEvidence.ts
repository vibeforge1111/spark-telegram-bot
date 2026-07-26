import { rm } from 'node:fs/promises';
import { isMissionExecutionConfirmation, isNoExecutionBoundary } from './conversationIntent';
import { readJsonFile, resolveStatePath, writeJsonAtomic } from './jsonState';

export const DOMAIN_CHIP_BUILD_TTL_MS = 30 * 60 * 1000;
export const LAST_CREATED_DOMAIN_CHIP_TTL_MS = 24 * 60 * 60 * 1000;

export interface PendingDomainChipBuild {
  brief: string;
  prd: string;
  projectName: string;
  buildMode: 'direct' | 'advanced_prd';
  buildModeReason: string;
  capabilityProposalPacket?: Record<string, unknown>;
  timestamp: number;
}

export interface LastCreatedDomainChipContext {
  chipKey: string;
  projectName: string;
  createdAt: number;
}

const domainChipBuilds = new Map<string, PendingDomainChipBuild>();
const lastCreatedDomainChips = new Map<string, LastCreatedDomainChipContext>();

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

function lastCreatedDomainChipStatePath(key: string): string {
  return resolveStatePath(`domain-chip-last-created-${key.replace(/[^a-zA-Z0-9_.-]/g, '_')}.json`);
}

function isValidDomainChipKey(value: unknown): value is string {
  return typeof value === 'string' && /^domain-chip-[a-z0-9][a-z0-9-]{1,120}$/.test(value);
}

export async function rememberLastCreatedDomainChip(
  key: string,
  entry: LastCreatedDomainChipContext
): Promise<void> {
  if (!isValidDomainChipKey(entry.chipKey)) return;
  const normalized = {
    chipKey: entry.chipKey.toLowerCase(),
    projectName: entry.projectName || entry.chipKey,
    createdAt: entry.createdAt || Date.now()
  };
  lastCreatedDomainChips.set(key, normalized);
  await writeJsonAtomic(lastCreatedDomainChipStatePath(key), normalized);
}

export async function clearLastCreatedDomainChipForTests(key: string): Promise<void> {
  lastCreatedDomainChips.delete(key);
  await rm(lastCreatedDomainChipStatePath(key), { force: true });
}

export async function getLastCreatedDomainChip(
  key: string,
  now = Date.now()
): Promise<LastCreatedDomainChipContext | null> {
  const cached = lastCreatedDomainChips.get(key);
  if (cached && now - cached.createdAt <= LAST_CREATED_DOMAIN_CHIP_TTL_MS) {
    return cached;
  }
  const persisted = await readJsonFile<LastCreatedDomainChipContext>(
    lastCreatedDomainChipStatePath(key)
  );
  if (!persisted || !isValidDomainChipKey(persisted.chipKey)) return null;
  if (now - Number(persisted.createdAt || 0) > LAST_CREATED_DOMAIN_CHIP_TTL_MS) {
    return null;
  }
  lastCreatedDomainChips.set(key, persisted);
  return persisted;
}

export function formatLastCreatedDomainChipContext(
  entry: LastCreatedDomainChipContext | null
): string | null {
  if (!entry || !isValidDomainChipKey(entry.chipKey)) return null;
  return `Domain Chip created: ${entry.chipKey}`;
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
  return /^(?:go|start|run|build|create|make|ship|do it|build it|create it|make it|start it|use defaults?|use your defaults?|defaults?|recommended defaults?|doesn'?t matter|dont care|whatever|your call)$/i.test(normalized) ||
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
  if (/\b(?:unit\s+test|qa|bug\s+hunter|bug\s+hunt|spawner|mission\s+control|prs?|publish|merge|ship)\b/.test(normalized)) {
    return false;
  }
  return /\b(?:names?|rationale|usage\s+angle|vibe|style|tone|output|outputs?|workflow|checklist|benchmark|benchmarks|evals?|edge\s+cases?|held[-\s]*out|trap|watchtower|rollback|loop|autoloop|improvement|consumer|safety|privacy|serious|enterprise|developer|technical|visual|image|poster|prompt|prompts)\b/.test(normalized);
}

export function pendingDomainChipPrdWithUserDirection(pending: PendingDomainChipBuild, text: string): string {
  const basePrompt = `build a domain chip for ${pending.brief.trim()}`;
  if (isDomainChipPendingStart(text)) {
    return `${basePrompt}\n\n## Pre-build direction\n\nUse the default Loop Engineering direction: build the private starter kit with a domain-specific playbook, benchmark pack, held-out/trap/no-op cases, autoloop policy, watchtower checks, rollback, and a readable review packet.`;
  }
  return `${basePrompt}\n\n## User direction before build\n\n${text.trim()}`;
}
