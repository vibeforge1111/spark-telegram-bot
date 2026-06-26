import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { LEGACY_PROMPT_SURFACE_BLOCKED_REFS } from './controlProofLegacyPromptSurface';

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
  legacyPromptBlockedSources: string[];
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

function parseCanonicalDocNotes(markdown: string): Map<string, string> {
  const notes = new Map<string, string>();
  let currentDoc: string | null = null;
  let currentLines: string[] = [];

  function flush(): void {
    if (!currentDoc) return;
    notes.set(currentDoc, currentLines.join('\n'));
  }

  for (const line of markdown.split(/\r?\n/)) {
    const match = line.match(/^\d+\.\s+`([^`]+)`/);
    if (match) {
      flush();
      currentDoc = match[1].trim();
      currentLines = [line];
      continue;
    }
    if (currentDoc) currentLines.push(line);
  }
  flush();
  return notes;
}

export function deriveLegacyPromptBlockedSources(blockedRefs = LEGACY_PROMPT_SURFACE_BLOCKED_REFS): string[] {
  const sources = new Set<string>();
  for (const ref of blockedRefs) {
    for (const pattern of ref.patterns) {
      if (/^(docs|ops|outputs|src)\//.test(pattern)) {
        sources.add(pattern);
      }
    }
  }
  return [...sources].sort();
}

function entryMatchesSource(entry: SourceInventoryEntry, source: string): boolean {
  if (entry.source === source) return true;
  return entry.source.endsWith('/*') && source.startsWith(entry.source.slice(0, -1));
}

function sourceExists(repoRoot: string, source: string): boolean {
  if (source.includes('*')) {
    if (!source.endsWith('/*')) return false;
    const dir = resolve(repoRoot, source.slice(0, -2));
    if (!existsSync(dir)) return false;
    return readdirSync(dir).length > 0;
  }
  return existsSync(resolve(repoRoot, source));
}

function requiredEvidenceFilesForSource(source: string, status: string): string[] {
  if (status !== 'active') return [];
  if (source !== 'outputs/live-canary-full/*' && source !== 'outputs/live-canary-safe-first/*') return [];
  return [
    'live-canary-observations.json',
    'live-canary-summary.md',
    'live-canary-summary.json'
  ];
}

function hasHistoricalAuthorityGuard(entry: SourceInventoryEntry): boolean {
  if (entry.status === 'active') return true;
  return /\b(?:not (?:fresh-turn authority|authority|release proof|a release gate|everyday release proof|action authority|the active prompt|control-proof readiness|sparkrecursive release|publish proof|live Bot API delivery)|source material only|(?:historical|style) context only|use only|only until|only when|not load into prompts|superseded by|current authority is|outrank|claim_scope=legacy_breadth|release_gate=none)\b/i.test(entry.boundary);
}

function hasStatusSpecificBoundary(entry: SourceInventoryEntry): boolean {
  if (entry.status === 'active') {
    return /\b(?:current|active|authority|source|gate|proof|rules?|behavior|contract|router|inventory|packet|prompt|workplan|standard)\b/i.test(entry.boundary);
  }
  if (entry.status === 'read-only evidence') {
    return /\b(?:read-only|evidence|source material|historical|history|promotion|promoted|breadth|drift|proves|helper|current authority is|superseded by|claim_scope=legacy_breadth|release_gate=none|style context only|supports classification)\b/i.test(entry.boundary);
  }
  if (entry.status === 'archive candidate') {
    return /\b(?:archive|historical context|do not load into prompts|owner review|extract(?:ed|ion)|move to)\b/i.test(entry.boundary);
  }
  if (entry.status === 'delete candidate') {
    return /\b(?:delete|remove|owner[- ]reviewed|owner review|duplicated|unsafe|misleading|no remaining audit value)\b/i.test(entry.boundary);
  }
  return false;
}

function hasNonActiveCanonicalBoundary(note: string): boolean {
  return /\b(?:read-only|historical|previous|older|superseded|prefer the|not (?:the )?(?:active|current|release|publish|authority)|not control-proof readiness|not the new control-proof release gate)\b/i.test(note);
}

export function checkSourceInventory(options: {
  repoRoot: string;
  inventoryPath?: string;
  docsIndexPath?: string;
  legacyPromptBlockedSources?: string[];
}): SourceInventoryCheckResult {
  const inventoryPath = options.inventoryPath ?? resolve(options.repoRoot, 'docs/SPARK_LEGACY_SOURCE_INVENTORY_2026-06-26.md');
  const docsIndexPath = options.docsIndexPath ?? resolve(options.repoRoot, 'docs/SPARK_CONTROL_PROOF_DOCS_INDEX_2026-06-24.md');
  const inventory = readFileSync(inventoryPath, 'utf8');
  const docsIndex = readFileSync(docsIndexPath, 'utf8');
  const entries = parseSourceInventory(inventory);
  const canonicalDocs = parseCanonicalDocs(docsIndex);
  const canonicalDocNotes = parseCanonicalDocNotes(docsIndex);
  const legacyPromptBlockedSources = options.legacyPromptBlockedSources ?? deriveLegacyPromptBlockedSources();
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
    if (!hasHistoricalAuthorityGuard(entry)) {
      gaps.push({
        code: 'missing_historical_authority_guard',
        message: `${entry.source} is ${entry.status} but its boundary does not explicitly say it is not fresh-turn authority.`
      });
    }
    if (!hasStatusSpecificBoundary(entry)) {
      gaps.push({
        code: 'missing_status_specific_boundary',
        message: `${entry.source} is ${entry.status} but its boundary does not explain the status-specific control rule.`
      });
    }
    if (!sourceExists(options.repoRoot, entry.source)) {
      gaps.push({
        code: 'missing_source',
        message: `${entry.source} is classified in the source inventory but does not exist.`
      });
    }
    for (const file of requiredEvidenceFilesForSource(entry.source, entry.status)) {
      const dir = entry.source.slice(0, -2);
      if (!existsSync(resolve(options.repoRoot, dir, file))) {
        gaps.push({
          code: 'missing_required_evidence_file',
          message: `${entry.source} is classified as active canary evidence but is missing ${file}.`
        });
      }
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

  for (const doc of canonicalDocs) {
    const matchingEntries = entries.filter((entry) => entryMatchesSource(entry, doc));
    if (matchingEntries.length === 0) continue;
    const statuses = new Set(matchingEntries.map((entry) => entry.status));
    if (statuses.has('active')) continue;
    const note = canonicalDocNotes.get(doc) || '';
    if (!hasNonActiveCanonicalBoundary(note)) {
      gaps.push({
        code: 'non_active_doc_missing_index_boundary',
        message: `${doc} is listed in the canonical docs index as ${[...statuses].sort().join(', ')} but the index entry does not mark it historical, previous, read-only, superseded, or non-authoritative.`
      });
    }
  }

  for (const entry of entries) {
    const activeConcreteDoc = entry.status === 'active' && /^docs\/.+\.md$/.test(entry.source);
    if (activeConcreteDoc && !canonicalDocs.includes(entry.source)) {
      gaps.push({
        code: 'active_doc_missing_from_docs_index',
        message: `${entry.source} is marked active in the source inventory but is not listed in the canonical docs index.`
      });
    }
  }

  for (const source of legacyPromptBlockedSources) {
    if (!entries.some((entry) => entryMatchesSource(entry, source))) {
      gaps.push({
        code: 'missing_legacy_prompt_source_classification',
        message: `${source} is blocked from prompt/UI surfaces but not classified in the legacy source inventory.`
      });
    }
  }

  const statusesBySource = new Map<string, Set<string>>();
  const countsBySourceStatus = new Map<string, number>();
  for (const entry of entries) {
    const statuses = statusesBySource.get(entry.source) ?? new Set<string>();
    statuses.add(entry.status);
    statusesBySource.set(entry.source, statuses);

    const sourceStatusKey = `${entry.source}\u0000${entry.status}`;
    countsBySourceStatus.set(sourceStatusKey, (countsBySourceStatus.get(sourceStatusKey) ?? 0) + 1);
  }

  for (const [sourceStatusKey, count] of countsBySourceStatus) {
    if (count <= 1) continue;
    const [source, status] = sourceStatusKey.split('\u0000');
    gaps.push({
      code: 'duplicate_source_status',
      message: `${source} has ${count} inventory rows with status ${status}; each source/status boundary must be unique.`
    });
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
    legacyPromptBlockedSources,
    gaps
  };
}

export function formatSourceInventoryReport(result: SourceInventoryCheckResult): string {
  const lines = [
    'Control-proof source inventory',
    `Status: ${result.ok ? 'clean' : 'gaps found'}`,
    `Inventory entries: ${result.entries.length}`,
    `Canonical docs checked: ${result.canonicalDocs.length}`,
    `Legacy prompt blocked sources checked: ${result.legacyPromptBlockedSources.length}`,
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
