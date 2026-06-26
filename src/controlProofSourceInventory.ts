import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

export type SourceInventoryStatus = 'active' | 'read-only evidence' | 'archive candidate' | 'delete candidate';

export type SourceInventoryEntry = {
  source: string;
  status: SourceInventoryStatus | string;
  boundary: string;
  line: number;
};

export type SourceInventoryGap = {
  code: string;
  message: string;
};

export type SourceInventoryCheckResult = {
  ok: boolean;
  inventoryPath: string;
  docsIndexPath: string;
  entries: SourceInventoryEntry[];
  canonicalDocs: string[];
  gaps: SourceInventoryGap[];
};

const ALLOWED_STATUSES = new Set<SourceInventoryStatus>([
  'active',
  'read-only evidence',
  'archive candidate',
  'delete candidate'
]);

export function parseSourceInventory(markdown: string): SourceInventoryEntry[] {
  return markdown
    .split(/\r?\n/)
    .map((line, index) => ({ line, lineNumber: index + 1 }))
    .flatMap(({ line, lineNumber }) => {
      const match = line.match(/^\|\s*`([^`]+)`\s*\|\s*([^|]+?)\s*\|\s*([^|]+?)\s*\|$/);
      if (!match || match[1] === 'Source') return [];
      return [{
        source: match[1].trim(),
        status: match[2].trim(),
        boundary: match[3].trim(),
        line: lineNumber
      }];
    });
}

export function parseCanonicalDocs(markdown: string): string[] {
  const docs = new Set<string>();
  for (const line of markdown.split(/\r?\n/)) {
    const match = line.match(/^\d+\.\s+`([^`]+)`/);
    if (match) docs.add(match[1].trim());
  }
  return [...docs].sort();
}

function entryMatchesSource(entry: SourceInventoryEntry, source: string): boolean {
  if (entry.source === source) return true;
  return entry.source.endsWith('/*') && source.startsWith(entry.source.slice(0, -1));
}

export function checkSourceInventory(options: {
  repoRoot: string;
  inventoryPath?: string;
  docsIndexPath?: string;
}): SourceInventoryCheckResult {
  const inventoryPath = options.inventoryPath ?? resolve(options.repoRoot, 'docs/SPARK_LEGACY_SOURCE_INVENTORY_2026-06-26.md');
  const docsIndexPath = options.docsIndexPath ?? resolve(options.repoRoot, 'docs/SPARK_CONTROL_PROOF_DOCS_INDEX_2026-06-24.md');
  const inventory = readFileSync(inventoryPath, 'utf8');
  const docsIndex = readFileSync(docsIndexPath, 'utf8');
  const entries = parseSourceInventory(inventory);
  const canonicalDocs = parseCanonicalDocs(docsIndex);
  const gaps: SourceInventoryGap[] = [];

  if (entries.length === 0) {
    gaps.push({ code: 'no_inventory_entries', message: 'No source inventory table entries were found.' });
  }

  for (const entry of entries) {
    if (!ALLOWED_STATUSES.has(entry.status as SourceInventoryStatus)) {
      gaps.push({
        code: 'invalid_status',
        message: `${entry.source} has unsupported status "${entry.status}" on line ${entry.line}.`
      });
    }
    if (!entry.boundary || entry.boundary === '---') {
      gaps.push({
        code: 'missing_boundary',
        message: `${entry.source} is missing a fresh-turn boundary on line ${entry.line}.`
      });
    }
  }

  for (const doc of canonicalDocs) {
    if (!entries.some((entry) => entryMatchesSource(entry, doc))) {
      gaps.push({
        code: 'missing_canonical_doc_classification',
        message: `${doc} is listed in the docs index but not classified in the legacy source inventory.`
      });
    }
  }

  const statusesBySource = new Map<string, Set<string>>();
  for (const entry of entries) {
    const statuses = statusesBySource.get(entry.source) ?? new Set<string>();
    statuses.add(entry.status);
    statusesBySource.set(entry.source, statuses);
  }

  for (const [source, statuses] of statusesBySource) {
    if (statuses.size <= 1) continue;
    const values = [...statuses].sort();
    const allowedHistoricalPair = values.length === 2 && values.includes('read-only evidence') && values.includes('archive candidate');
    if (!allowedHistoricalPair) {
      gaps.push({
        code: 'conflicting_statuses',
        message: `${source} has conflicting inventory statuses: ${values.join(', ')}.`
      });
    }
  }

  return {
    ok: gaps.length === 0,
    inventoryPath,
    docsIndexPath,
    entries,
    canonicalDocs,
    gaps
  };
}

export function formatSourceInventoryReport(result: SourceInventoryCheckResult): string {
  const lines = [
    'Control-proof source inventory',
    `Status: ${result.ok ? 'clean' : 'gaps found'}`,
    `Inventory entries: ${result.entries.length}`,
    `Canonical docs checked: ${result.canonicalDocs.length}`,
    `Gaps: ${result.gaps.length}`
  ];

  if (result.gaps.length > 0) {
    lines.push('', 'Gap details:');
    for (const gap of result.gaps) {
      lines.push(`- ${gap.code}: ${gap.message}`);
    }
  }

  return lines.join('\n');
}
