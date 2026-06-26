import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import {
  checkSourceInventory,
  deriveLegacyPromptBlockedSources,
  formatSourceInventoryReport,
  parseCanonicalDocs,
  parseSourceInventory
} from '../src/controlProofSourceInventory';

function test(name: string, fn: () => void): void {
  try {
    fn();
    console.log(`ok - ${name}`);
  } catch (error) {
    console.error(`not ok - ${name}`);
    throw error;
  }
}

const ROOT = resolve(__dirname, '..');

test('parses inventory entries and canonical docs', () => {
  const inventory = [
    '| Source | Status | Fresh-turn boundary |',
    '| --- | --- | --- |',
    '| `docs/current.md` | active | Current source. |',
    '| `docs/history.md` | read-only evidence | Historical source. |'
  ].join('\n');
  const docsIndex = [
    '1. `docs/current.md`',
    '2. `docs/history.md`'
  ].join('\n');

  assert.deepEqual(parseSourceInventory(inventory).map((entry) => [entry.source, entry.status]), [
    ['docs/current.md', 'active'],
    ['docs/history.md', 'read-only evidence']
  ]);
  assert.deepEqual(parseCanonicalDocs(docsIndex), ['docs/current.md', 'docs/history.md']);
});

test('derives repo-local legacy prompt blocked sources', () => {
  const sources = deriveLegacyPromptBlockedSources([
    {
      id: 'legacy_plan',
      label: 'legacy plan',
      patterns: ['ops/legacy-plan.md', 'legacy-plan.md']
    },
    {
      id: 'historical_doc_folder',
      label: 'historical docs',
      patterns: ['docs/old-handoffs/', 'old-handoffs/']
    }
  ]);

  assert.deepEqual(sources, ['docs/old-handoffs/', 'ops/legacy-plan.md']);
});

test('fails when a canonical doc is not classified in the inventory', () => {
  const dir = mkdtempSync(join(tmpdir(), 'spark-source-inventory-'));
  const inventoryPath = join(dir, 'inventory.md');
  const docsIndexPath = join(dir, 'index.md');
  mkdirSync(join(dir, 'docs'), { recursive: true });
  writeFileSync(join(dir, 'docs/current.md'), 'current');
  writeFileSync(inventoryPath, [
    '| Source | Status | Fresh-turn boundary |',
    '| --- | --- | --- |',
    '| `docs/current.md` | active | Current source. |'
  ].join('\n'));
  writeFileSync(docsIndexPath, [
    '1. `docs/current.md`',
    '2. `docs/missing.md`'
  ].join('\n'));

  const result = checkSourceInventory({ repoRoot: dir, inventoryPath, docsIndexPath, legacyPromptBlockedSources: [] });

  assert.equal(result.ok, false);
  assert.deepEqual(result.gaps.map((gap) => gap.code), ['missing_canonical_doc_classification']);
  assert.match(formatSourceInventoryReport(result), /docs\/missing\.md is listed in the docs index/);
});

test('fails when an active inventory doc is missing from the canonical docs index', () => {
  const dir = mkdtempSync(join(tmpdir(), 'spark-source-inventory-'));
  const inventoryPath = join(dir, 'inventory.md');
  const docsIndexPath = join(dir, 'index.md');
  mkdirSync(join(dir, 'docs'), { recursive: true });
  writeFileSync(join(dir, 'docs/indexed.md'), 'indexed');
  writeFileSync(join(dir, 'docs/unindexed-active.md'), 'unindexed');
  writeFileSync(inventoryPath, [
    '| Source | Status | Fresh-turn boundary |',
    '| --- | --- | --- |',
    '| `docs/indexed.md` | active | Current source. |',
    '| `docs/unindexed-active.md` | active | Current source without routing. |'
  ].join('\n'));
  writeFileSync(docsIndexPath, [
    '1. `docs/indexed.md`'
  ].join('\n'));

  const result = checkSourceInventory({ repoRoot: dir, inventoryPath, docsIndexPath, legacyPromptBlockedSources: [] });

  assert.equal(result.ok, false);
  assert.equal(result.gaps.some((gap) => gap.code === 'active_doc_missing_from_docs_index'), true);
  assert.match(formatSourceInventoryReport(result), /docs\/unindexed-active\.md is marked active/);
});

test('fails when a prompt-surface blocked legacy source is not classified', () => {
  const dir = mkdtempSync(join(tmpdir(), 'spark-source-inventory-'));
  const inventoryPath = join(dir, 'inventory.md');
  const docsIndexPath = join(dir, 'index.md');
  mkdirSync(join(dir, 'docs'), { recursive: true });
  writeFileSync(join(dir, 'docs/current.md'), 'current');
  writeFileSync(inventoryPath, [
    '| Source | Status | Fresh-turn boundary |',
    '| --- | --- | --- |',
    '| `docs/current.md` | active | Current source. |'
  ].join('\n'));
  writeFileSync(docsIndexPath, [
    '1. `docs/current.md`'
  ].join('\n'));

  const result = checkSourceInventory({
    repoRoot: dir,
    inventoryPath,
    docsIndexPath,
    legacyPromptBlockedSources: ['ops/legacy-plan.md']
  });

  assert.equal(result.ok, false);
  assert.equal(result.gaps.some((gap) => gap.code === 'missing_legacy_prompt_source_classification'), true);
  assert.match(formatSourceInventoryReport(result), /is blocked from prompt\/UI surfaces but not classified/);
});

test('fails when a classified source path does not exist', () => {
  const dir = mkdtempSync(join(tmpdir(), 'spark-source-inventory-'));
  const inventoryPath = join(dir, 'inventory.md');
  const docsIndexPath = join(dir, 'index.md');
  mkdirSync(join(dir, 'docs'), { recursive: true });
  writeFileSync(join(dir, 'docs/current.md'), 'current');
  writeFileSync(join(dir, 'docs/history.md'), 'history');
  writeFileSync(inventoryPath, [
    '| Source | Status | Fresh-turn boundary |',
    '| --- | --- | --- |',
    '| `docs/missing.md` | read-only evidence | Not fresh-turn authority; historical source. |'
  ].join('\n'));
  writeFileSync(docsIndexPath, '');

  const result = checkSourceInventory({ repoRoot: dir, inventoryPath, docsIndexPath, legacyPromptBlockedSources: [] });

  assert.equal(result.ok, false);
  assert.deepEqual(result.gaps.map((gap) => gap.code), ['missing_source']);
  assert.match(formatSourceInventoryReport(result), /docs\/missing\.md is classified/);
});

test('fails when historical rows do not explicitly deny fresh-turn authority', () => {
  const dir = mkdtempSync(join(tmpdir(), 'spark-source-inventory-'));
  const inventoryPath = join(dir, 'inventory.md');
  const docsIndexPath = join(dir, 'index.md');
  mkdirSync(join(dir, 'docs'), { recursive: true });
  writeFileSync(join(dir, 'docs/history.md'), 'history');
  writeFileSync(inventoryPath, [
    '| Source | Status | Fresh-turn boundary |',
    '| --- | --- | --- |',
    '| `docs/history.md` | read-only evidence | Useful historical context. |'
  ].join('\n'));
  writeFileSync(docsIndexPath, '');

  const result = checkSourceInventory({ repoRoot: dir, inventoryPath, docsIndexPath, legacyPromptBlockedSources: [] });

  assert.equal(result.ok, false);
  assert.equal(result.gaps.some((gap) => gap.code === 'missing_historical_authority_guard'), true);
  assert.match(formatSourceInventoryReport(result), /does not explicitly say it is not fresh-turn authority/);
});

test('accepts wildcard source rows only when the directory has entries', () => {
  const dir = mkdtempSync(join(tmpdir(), 'spark-source-inventory-'));
  const inventoryPath = join(dir, 'inventory.md');
  const docsIndexPath = join(dir, 'index.md');
  mkdirSync(join(dir, 'docs/codex-handoffs'), { recursive: true });
  writeFileSync(join(dir, 'docs/codex-handoffs/handoff.md'), 'ok');
  writeFileSync(inventoryPath, [
    '| Source | Status | Fresh-turn boundary |',
    '| --- | --- | --- |',
    '| `docs/codex-handoffs/*` | archive candidate | Not fresh-turn authority; archive after extracting useful history. |'
  ].join('\n'));
  writeFileSync(docsIndexPath, '');

  const result = checkSourceInventory({ repoRoot: dir, inventoryPath, docsIndexPath, legacyPromptBlockedSources: [] });

  assert.equal(result.ok, true);
});

test('fails when source status has only a vague boundary', () => {
  const dir = mkdtempSync(join(tmpdir(), 'spark-source-inventory-'));
  const inventoryPath = join(dir, 'inventory.md');
  const docsIndexPath = join(dir, 'index.md');
  mkdirSync(join(dir, 'docs'), { recursive: true });
  writeFileSync(join(dir, 'docs/history.md'), 'history');
  writeFileSync(inventoryPath, [
    '| Source | Status | Fresh-turn boundary |',
    '| --- | --- | --- |',
    '| `docs/history.md` | archive candidate | Not fresh-turn authority; maybe useful later. |'
  ].join('\n'));
  writeFileSync(docsIndexPath, '');

  const result = checkSourceInventory({ repoRoot: dir, inventoryPath, docsIndexPath, legacyPromptBlockedSources: [] });

  assert.equal(result.ok, false);
  assert.ok(result.gaps.some((gap) => gap.code === 'missing_status_specific_boundary'));
  assert.match(formatSourceInventoryReport(result), /status-specific control rule/);
});

test('requires delete candidates to prove owner-reviewed removal meaning', () => {
  const dir = mkdtempSync(join(tmpdir(), 'spark-source-inventory-'));
  const inventoryPath = join(dir, 'inventory.md');
  const docsIndexPath = join(dir, 'index.md');
  mkdirSync(join(dir, 'docs'), { recursive: true });
  writeFileSync(join(dir, 'docs/unsafe.md'), 'unsafe');
  writeFileSync(inventoryPath, [
    '| Source | Status | Fresh-turn boundary |',
    '| --- | --- | --- |',
    '| `docs/unsafe.md` | delete candidate | Not fresh-turn authority; historical source. |'
  ].join('\n'));
  writeFileSync(docsIndexPath, '');

  const result = checkSourceInventory({ repoRoot: dir, inventoryPath, docsIndexPath, legacyPromptBlockedSources: [] });

  assert.equal(result.ok, false);
  assert.ok(result.gaps.some((gap) => gap.code === 'missing_status_specific_boundary'));
});

test('requires active canary evidence folders to contain core packet files', () => {
  const dir = mkdtempSync(join(tmpdir(), 'spark-source-inventory-'));
  const inventoryPath = join(dir, 'inventory.md');
  const docsIndexPath = join(dir, 'index.md');
  mkdirSync(join(dir, 'outputs/live-canary-full'), { recursive: true });
  writeFileSync(join(dir, 'outputs/live-canary-full/live-canary-summary.md'), 'summary');
  writeFileSync(inventoryPath, [
    '| Source | Status | Fresh-turn boundary |',
    '| --- | --- | --- |',
    '| `outputs/live-canary-full/*` | active | Current full proof packet. |'
  ].join('\n'));
  writeFileSync(docsIndexPath, '');

  const result = checkSourceInventory({ repoRoot: dir, inventoryPath, docsIndexPath, legacyPromptBlockedSources: [] });

  assert.equal(result.ok, false);
  assert.deepEqual(result.gaps.map((gap) => gap.code), [
    'missing_required_evidence_file',
    'missing_required_evidence_file'
  ]);
  assert.match(formatSourceInventoryReport(result), /missing live-canary-observations\.json/);
  assert.match(formatSourceInventoryReport(result), /missing live-canary-summary\.json/);
});

test('accepts read-only evidence plus archive candidate as a historical duplicate', () => {
  const dir = mkdtempSync(join(tmpdir(), 'spark-source-inventory-'));
  const inventoryPath = join(dir, 'inventory.md');
  const docsIndexPath = join(dir, 'index.md');
  mkdirSync(join(dir, 'docs'), { recursive: true });
  writeFileSync(join(dir, 'docs/current.md'), 'current');
  writeFileSync(join(dir, 'docs/history.md'), 'history');
  writeFileSync(inventoryPath, [
    '| Source | Status | Fresh-turn boundary |',
    '| --- | --- | --- |',
    '| `docs/current.md` | active | Current source. |',
    '| `docs/history.md` | read-only evidence | Not fresh-turn authority; historical source. |',
    '| `docs/history.md` | archive candidate | Not fresh-turn authority; archive after extraction. |'
  ].join('\n'));
  writeFileSync(docsIndexPath, [
    '1. `docs/current.md`'
  ].join('\n'));

  const result = checkSourceInventory({ repoRoot: dir, inventoryPath, docsIndexPath, legacyPromptBlockedSources: [] });

  assert.equal(result.ok, true);
});

test('fails duplicate rows with the same source and status', () => {
  const dir = mkdtempSync(join(tmpdir(), 'spark-source-inventory-'));
  const inventoryPath = join(dir, 'inventory.md');
  const docsIndexPath = join(dir, 'index.md');
  mkdirSync(join(dir, 'docs'), { recursive: true });
  writeFileSync(join(dir, 'docs/history.md'), 'history');
  writeFileSync(inventoryPath, [
    '| Source | Status | Fresh-turn boundary |',
    '| --- | --- | --- |',
    '| `docs/history.md` | read-only evidence | Not fresh-turn authority; historical source. |',
    '| `docs/history.md` | read-only evidence | Not fresh-turn authority; source material only. |'
  ].join('\n'));
  writeFileSync(docsIndexPath, '');

  const result = checkSourceInventory({ repoRoot: dir, inventoryPath, docsIndexPath, legacyPromptBlockedSources: [] });

  assert.equal(result.ok, false);
  assert.ok(result.gaps.some((gap) => gap.code === 'duplicate_source_status'));
  assert.match(formatSourceInventoryReport(result), /each source\/status boundary must be unique/);
});

test('current source inventory classifies every canonical doc index entry', () => {
  const result = checkSourceInventory({ repoRoot: ROOT });

  assert.equal(formatSourceInventoryReport(result), [
    'Control-proof source inventory',
    'Status: clean',
    `Inventory entries: ${result.entries.length}`,
    `Canonical docs checked: ${result.canonicalDocs.length}`,
    `Legacy prompt blocked sources checked: ${result.legacyPromptBlockedSources.length}`,
    'Gaps: 0'
  ].join('\n'));
});
