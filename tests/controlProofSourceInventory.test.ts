import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import {
  checkSourceInventory,
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

  const result = checkSourceInventory({ repoRoot: dir, inventoryPath, docsIndexPath });

  assert.equal(result.ok, false);
  assert.deepEqual(result.gaps.map((gap) => gap.code), ['missing_canonical_doc_classification']);
  assert.match(formatSourceInventoryReport(result), /docs\/missing\.md is listed in the docs index/);
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
    '| `docs/missing.md` | read-only evidence | Historical source. |'
  ].join('\n'));
  writeFileSync(docsIndexPath, '');

  const result = checkSourceInventory({ repoRoot: dir, inventoryPath, docsIndexPath });

  assert.equal(result.ok, false);
  assert.deepEqual(result.gaps.map((gap) => gap.code), ['missing_source']);
  assert.match(formatSourceInventoryReport(result), /docs\/missing\.md is classified/);
});

test('accepts wildcard source rows only when the directory has entries', () => {
  const dir = mkdtempSync(join(tmpdir(), 'spark-source-inventory-'));
  const inventoryPath = join(dir, 'inventory.md');
  const docsIndexPath = join(dir, 'index.md');
  mkdirSync(join(dir, 'outputs/live-canary-full'), { recursive: true });
  writeFileSync(join(dir, 'outputs/live-canary-full/summary.md'), 'ok');
  writeFileSync(inventoryPath, [
    '| Source | Status | Fresh-turn boundary |',
    '| --- | --- | --- |',
    '| `outputs/live-canary-full/*` | active | Current packet. |'
  ].join('\n'));
  writeFileSync(docsIndexPath, '');

  const result = checkSourceInventory({ repoRoot: dir, inventoryPath, docsIndexPath });

  assert.equal(result.ok, true);
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
    '| `docs/history.md` | read-only evidence | Historical source. |',
    '| `docs/history.md` | archive candidate | Archive after extraction. |'
  ].join('\n'));
  writeFileSync(docsIndexPath, [
    '1. `docs/current.md`'
  ].join('\n'));

  const result = checkSourceInventory({ repoRoot: dir, inventoryPath, docsIndexPath });

  assert.equal(result.ok, true);
});

test('current source inventory classifies every canonical doc index entry', () => {
  const result = checkSourceInventory({ repoRoot: ROOT });

  assert.equal(formatSourceInventoryReport(result), [
    'Control-proof source inventory',
    'Status: clean',
    `Inventory entries: ${result.entries.length}`,
    `Canonical docs checked: ${result.canonicalDocs.length}`,
    'Gaps: 0'
  ].join('\n'));
});
