import { readFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

const tryParse = (s: string) => { try { return JSON.parse(s); } catch { return {} as any; } };


export type CapabilityGardenSummary = {
  present: boolean;
  cardCount: number;
  statusCounts: Record<string, number>;
  surfaceCounts: Record<string, number>;
  cards: Array<{
    id: string;
    ownerRepo: string;
    surfaceType: string;
    status: string;
    blockerCount: number;
    nextAction: string;
  }>;
  error?: string;
};

function objectValue(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function arrayValue(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function stringValue(value: unknown): string {
  return String(value || '').trim();
}

function numberValue(value: unknown): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function countBy(items: Array<Record<string, unknown>>, key: string): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const item of items) {
    const value = stringValue(item[key]) || 'unknown';
    counts[value] = (counts[value] || 0) + 1;
  }
  return Object.fromEntries(Object.entries(counts).sort(([a], [b]) => a.localeCompare(b)));
}

export function resolveCapabilityCatalogPath(env: NodeJS.ProcessEnv = process.env): string {
  const configured = env.SPARK_SYSTEM_MAP_DIR || env.SPARK_OS_SYSTEM_MAP_DIR;
  const root = configured && configured.trim()
    ? configured.trim()
    : path.join(os.homedir(), '.spark', 'state', 'system-map');
  return path.join(root, 'capability-catalog.json');
}

export function summarizeCapabilityCatalog(payload: unknown): CapabilityGardenSummary {
  const root = objectValue(payload);
  const cards = arrayValue(root.capability_cards).map(objectValue);
  const projected = cards.slice(0, 7).map((card) => ({
    id: stringValue(card.id),
    ownerRepo: stringValue(card.owner_repo),
    surfaceType: stringValue(card.surface_type) || 'unknown',
    status: stringValue(card.status) || 'unknown',
    blockerCount: arrayValue(card.blockers).length,
    nextAction: stringValue(card.next_action)
  }));
  return {
    present: Object.keys(root).length > 0,
    cardCount: cards.length,
    statusCounts: countBy(cards, 'status'),
    surfaceCounts: countBy(cards, 'surface_type'),
    cards: projected
  };
}

export async function readCapabilityGardenSummary(catalogPath = resolveCapabilityCatalogPath()): Promise<CapabilityGardenSummary> {
  try {
    const raw = await readFile(catalogPath, 'utf-8');
    return summarizeCapabilityCatalog(tryParse(raw));
  } catch (error) {
    return {
      present: false,
      cardCount: 0,
      statusCounts: {},
      surfaceCounts: {},
      cards: [],
      error: error instanceof Error ? error.message : String(error)
    };
  }
}

function countText(counts: Record<string, number>, preferred: string[]): string {
  const parts = preferred
    .map((key) => [key, numberValue(counts[key])] as const)
    .filter(([, count]) => count > 0)
    .map(([key, count]) => `${key}=${count}`);
  return parts.length ? parts.join(', ') : 'none yet';
}

export function renderCapabilityGardenSummary(summary: CapabilityGardenSummary): string {
  if (!summary.present) {
    return [
      'Capability garden is not compiled yet.',
      '',
      'Move',
      '• Run `spark os compile`, then try `/capabilities` again.'
    ].join('\n');
  }

  const localArtifacts = numberValue(summary.statusCounts['local-artifacts']);
  const headline = localArtifacts > 0
    ? 'Capability garden needs review.'
    : summary.cardCount > 0
      ? 'Capability garden is visible.'
      : 'Capability garden is empty.';
  const lines = [
    headline,
    '',
    'State',
    `• ${summary.cardCount} cards`,
    `• Status: ${countText(summary.statusCounts, ['local-artifacts', 'schema-shaped', 'seen'])}`,
    `• Surfaces: ${countText(summary.surfaceCounts, ['creator-system', 'specialization-path'])}`,
    '',
    'Review',
    '• Cards are evidence, not trust.',
    '• Gate verdicts, privacy review, rollback refs, and publication proof still decide promotion.'
  ];

  if (summary.cards.length) {
    lines.push('', 'Top cards');
    for (const card of summary.cards.slice(0, 3)) {
      lines.push(`• ${card.id || card.ownerRepo}: ${card.status}${card.blockerCount ? ` (${card.blockerCount} blockers)` : ''}`);
    }
  }

  lines.push('', 'Workspace', '• Full evidence: `spark os capabilities --json`');
  return lines.join('\n');
}
