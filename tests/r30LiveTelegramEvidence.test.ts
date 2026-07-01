import assert from 'node:assert/strict';
import { mkdtemp, readFile, stat, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { writeR30LiveTelegramEvidence } from '../ops/r30LiveTelegramEvidence';
import { R30_LIVE_TELEGRAM_CASES } from '../src/r30LiveTelegramCases';
import { summarizeR30LiveTelegramObservations } from '../src/r30LiveTelegramSummary';
import { screenshotDigestForFile } from '../src/r30ScreenshotEvidence';
import { validateLiveTelegramCanaryEvidence } from '../src/liveTelegramCanaryEvidence';

type AsyncTest = () => Promise<void> | void;
const tests: { name: string; fn: AsyncTest }[] = [];

function test(name: string, fn: AsyncTest): void {
  tests.push({ name, fn });
}

async function exists(filePath: string): Promise<boolean> {
  try {
    await stat(filePath);
    return true;
  } catch {
    return false;
  }
}

async function writeJson(filePath: string, value: unknown): Promise<void> {
  await writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`);
}

async function makePacketFiles(options: { incomplete?: boolean } = {}) {
  const root = await mkdtemp(path.join(os.tmpdir(), 'r30-live-evidence-'));
  const screenshotEntries = [];
  const screenshotRefs = new Map<string, string>();
  for (const entry of R30_LIVE_TELEGRAM_CASES) {
    const screenshotPath = path.join(root, `${entry.id}.png`);
    await writeFile(screenshotPath, `screenshot bytes ${entry.id}`);
    const digest = screenshotDigestForFile(screenshotPath);
    screenshotEntries.push({ ...digest, captured_for_case_id: entry.id });
    screenshotRefs.set(entry.id, digest.ref);
  }
  const observations = {
    schema_version: 'spark.r30.live_telegram_observations.v1',
    target: 'SparkRecursive_bot',
    generatedAt: '2099-01-01T00:00:00.000Z',
    evidence: { collectedAt: '2099-01-01T00:00:00.000Z' },
    cases: R30_LIVE_TELEGRAM_CASES.map((entry) => ({
      id: entry.id,
      promptHash: entry.promptHash,
      prompt: entry.prompt,
      expected: {
        route: entry.expectedRoute,
        authority: entry.expectedAuthority,
        mutationClass: entry.expectedMutationClass,
        replyShape: entry.expectedReplyShape
      },
      observed: {
        verdict: options.incomplete && entry.id === 'r30-daily-fast-001' ? 'untested' : 'pass',
        reply: options.incomplete && entry.id === 'r30-daily-fast-001' ? '' : 'Spark gave a natural read-only answer.',
        sideEffects: {
          filesChanged: false,
          memoryWritten: false,
          missionStarted: false,
          externalNetworkCalled: false,
          accessChanged: false,
          providerChanged: false,
          calendarMutated: false,
          crmMutated: false,
          repoMutated: false,
          autoloopStarted: false
        },
        proofJoin: `Live /proof joined ${entry.expectedRoute} to Telegram evidence with no latest proof gaps.`,
        proofPanel: 'Harness Proof Intent: chat_only\nAudit fresh-strict: clean',
        screenshotRefs: [screenshotRefs.get(entry.id)],
        userConfirmation: `Manually sent and observed in Telegram with SparkRecursive_bot for ${entry.id}.`,
        notes: null
      }
    }))
  };
  const screenshotManifest = {
    schema_version: 'spark.r30.screenshot_manifest.v1',
    generated_at: '2099-01-01T00:00:00.000Z',
    entries: screenshotEntries
  };
  const summary = summarizeR30LiveTelegramObservations(observations, screenshotManifest);
  const observationsPath = path.join(root, 'observations.json');
  const screenshotManifestPath = path.join(root, 'screenshots.json');
  const summaryPath = path.join(root, 'summary.json');
  const outputPath = path.join(root, 'live-telegram-canary.json');
  await writeJson(observationsPath, observations);
  await writeJson(screenshotManifestPath, screenshotManifest);
  await writeJson(summaryPath, summary);
  return { observationsPath, screenshotManifestPath, summaryPath, outputPath };
}

test('writes final evidence index only after validation passes', async () => {
  const files = await makePacketFiles();
  const result = await writeR30LiveTelegramEvidence({
    observationsPath: files.observationsPath,
    summaryPath: files.summaryPath,
    screenshotManifestPath: files.screenshotManifestPath,
    outputPath: files.outputPath,
    generatedAt: '2099-01-01T00:00:00.000Z',
    observedAt: '2099-01-01T00:10:00.000Z'
  });
  const saved = JSON.parse(await readFile(files.outputPath, 'utf8'));

  assert.equal(result.validation.passed, true);
  assert.equal(saved.schema_version, 'spark.r30.live_telegram_canary.v1');
  assert.equal(saved.status, 'pass');
  assert.equal(validateLiveTelegramCanaryEvidence(saved).passed, true);
});

test('does not write final evidence when observations are incomplete', async () => {
  const files = await makePacketFiles({ incomplete: true });
  await assert.rejects(
    () => writeR30LiveTelegramEvidence({
      observationsPath: files.observationsPath,
      summaryPath: files.summaryPath,
      screenshotManifestPath: files.screenshotManifestPath,
      outputPath: files.outputPath,
      generatedAt: '2099-01-01T00:00:00.000Z',
      observedAt: '2099-01-01T00:10:00.000Z'
    }),
    /R30 live Telegram evidence is not valid/
  );
  assert.equal(await exists(files.outputPath), false);
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
