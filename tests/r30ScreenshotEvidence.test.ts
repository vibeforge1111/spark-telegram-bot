import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { screenshotDigestForFile, validateScreenshotManifest } from '../src/r30ScreenshotEvidence';
import { writeR30ScreenshotManifest } from '../ops/r30ScreenshotManifest';

type AsyncTest = () => Promise<void> | void;
const tests: { name: string; fn: AsyncTest }[] = [];

function test(name: string, fn: AsyncTest): void {
  tests.push({ name, fn });
}

test('computes screenshot digest refs from actual file bytes', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'r30-screenshot-evidence-'));
  const filePath = path.join(root, 'proof.png');
  await writeFile(filePath, 'telegram screenshot bytes');
  const entry = screenshotDigestForFile(filePath);

  assert.match(entry.ref, /^screenshot:sha256:[a-f0-9]{64}$/);
  assert.equal(entry.ref, `screenshot:sha256:${entry.sha256}`);
});

test('validates manifest entries against local file bytes', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'r30-screenshot-evidence-'));
  const filePath = path.join(root, 'proof.png');
  await writeFile(filePath, 'telegram screenshot bytes');
  const entry = screenshotDigestForFile(filePath);
  const validation = validateScreenshotManifest({
    schema_version: 'spark.r30.screenshot_manifest.v1',
    generated_at: '2026-07-01T00:00:00.000Z',
    entries: [{ ...entry, captured_for_case_id: 'r30-prd-fast-001' }]
  });

  assert.equal(validation.passed, true);
  assert.ok(validation.refs.has(entry.ref));
  assert.equal(validation.entriesByRef.get(entry.ref)?.[0].captured_for_case_id, 'r30-prd-fast-001');
});

test('rejects missing files and digest mismatches', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'r30-screenshot-evidence-'));
  const filePath = path.join(root, 'proof.png');
  await writeFile(filePath, 'telegram screenshot bytes');
  const entry = screenshotDigestForFile(filePath);
  await writeFile(filePath, 'changed bytes');
  const validation = validateScreenshotManifest({
    schema_version: 'spark.r30.screenshot_manifest.v1',
    generated_at: '2026-07-01T00:00:00.000Z',
    entries: [
      { ...entry, captured_for_case_id: 'r30-prd-fast-001' },
      { ref: `screenshot:sha256:${'b'.repeat(64)}`, sha256: 'b'.repeat(64), file_path: path.join(root, 'missing.png') }
    ]
  });

  assert.equal(validation.passed, false);
  assert.match(validation.failures.join('\n'), /sha256 does not match file bytes/);
  assert.match(validation.failures.join('\n'), /file_path must exist/);
});

test('writes screenshot manifest CLI output from files and case ids', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'r30-screenshot-evidence-'));
  const first = path.join(root, 'first.png');
  const second = path.join(root, 'second.png');
  const outputPath = path.join(root, 'manifest.json');
  await writeFile(first, 'first screenshot');
  await writeFile(second, 'second screenshot');

  const result = await writeR30ScreenshotManifest({
    outputPath,
    files: [first, second],
    caseIds: ['r30-prd-fast-001', 'r30-daily-fast-001']
  });
  const saved = JSON.parse(await readFile(outputPath, 'utf8'));

  assert.equal(result.manifest.entries.length, 2);
  assert.equal(saved.schema_version, 'spark.r30.screenshot_manifest.v1');
  assert.equal(saved.entries[0].captured_for_case_id, 'r30-prd-fast-001');
  assert.match(saved.entries[0].ref, /^screenshot:sha256:[a-f0-9]{64}$/);
});

async function run() {
  for (const entry of tests) {
    await entry.fn();
    console.log(`ok - ${entry.name}`);
  }
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
