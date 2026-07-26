import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { summarizeR30LiveTelegramObservations } from '../src/r30LiveTelegramSummary';
import { R30_LIVE_TELEGRAM_CASES } from '../src/r30LiveTelegramCases';
import { screenshotDigestForFile } from '../src/r30ScreenshotEvidence';
import { writeR30LiveTelegramSummary } from '../ops/r30LiveTelegramSummary';

type AsyncTest = () => Promise<void> | void;
const tests: { name: string; fn: AsyncTest }[] = [];

function test(name: string, fn: AsyncTest): void {
  tests.push({ name, fn });
}

test('uses the emitted plain-chat QA action for the timezone boundary case', () => {
  const boundary = R30_LIVE_TELEGRAM_CASES.find((entry) => entry.id === 'r30-boundary-meta-timezone-001');
  assert.equal(boundary?.expectedRoute, 'plain_chat.qa_boundary');
});

async function makePackets(options: { incompleteCaseId?: string } = {}) {
  const root = await mkdtemp(path.join(os.tmpdir(), 'r30-live-summary-'));
  const entries = [];
  const refs = new Map<string, string>();
  for (const entry of R30_LIVE_TELEGRAM_CASES) {
    const screenshotPath = path.join(root, `${entry.id}.png`);
    await writeFile(screenshotPath, `screenshot bytes ${entry.id}`);
    const digest = screenshotDigestForFile(screenshotPath);
    refs.set(entry.id, digest.ref);
    entries.push({ ...digest, captured_for_case_id: entry.id });
  }
  const observations = {
    schema_version: 'spark.r30.live_telegram_observations.v1',
    target: 'SparkRecursive_bot',
    generatedAt: '2026-07-01T00:00:00.000Z',
    evidence: { collectedAt: '2026-07-01T00:00:00.000Z' },
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
        verdict: options.incompleteCaseId === entry.id ? 'untested' : 'pass',
        reply: options.incompleteCaseId === entry.id ? '' : 'Spark gave a natural read-only answer.',
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
        proofJoin: `Live /proof joined ${entry.expectedRoute} to Telegram proof with no latest proof gaps.`,
        proofPanel: 'Harness Proof Intent: chat_only\nAudit fresh-strict: clean',
        screenshotRefs: [refs.get(entry.id)],
        userConfirmation: `Manually sent and observed in Telegram with SparkRecursive_bot for ${entry.id}.`,
        notes: null
      }
    }))
  };
  const screenshotManifest = {
    schema_version: 'spark.r30.screenshot_manifest.v1',
    generated_at: '2026-07-01T00:00:00.000Z',
    entries
  };
  return { root, observations, screenshotManifest };
}

test('derives a release-ready selected-case summary from complete observations', async () => {
  const { observations, screenshotManifest } = await makePackets();
  const summary = summarizeR30LiveTelegramObservations(observations, screenshotManifest, { now: '2026-07-01T00:30:00.000Z' });

  assert.equal(summary.schema_version, 'spark.r30.live_telegram_summary.v1');
  assert.equal(summary.summary.readyForRelease, true);
  assert.equal(summary.summary.releaseBlockers.length, 0);
  assert.equal(summary.summary.verdictCounts.pass, R30_LIVE_TELEGRAM_CASES.length);
  assert.ok(summary.summary.cases.every((entry: any) => entry.missingCaptures.length === 0));
});

test('derives blockers when observations are incomplete', async () => {
  const { observations, screenshotManifest } = await makePackets({ incompleteCaseId: 'r30-daily-fast-001' });
  const summary = summarizeR30LiveTelegramObservations(observations, screenshotManifest, { now: '2026-07-01T00:30:00.000Z' });

  assert.equal(summary.summary.readyForRelease, false);
  assert.ok(summary.summary.releaseBlockers.some((item: string) => /r30-daily-fast-001/.test(item)));
  const daily = summary.summary.cases.find((entry: any) => entry.id === 'r30-daily-fast-001');
  assert.ok(daily);
  assert.ok(daily.missingCaptures.includes('verdict'));
  assert.ok(daily.missingCaptures.includes('observed_reply'));
});

test('derives packet blockers for duplicate and unknown observation cases', async () => {
  const { observations, screenshotManifest } = await makePackets();
  observations.cases.push({ ...observations.cases[0] });
  observations.cases.push({ ...observations.cases[0], id: 'r30-unknown-case-001' });
  const summary = summarizeR30LiveTelegramObservations(observations, screenshotManifest, { now: '2026-07-01T00:30:00.000Z' });

  assert.equal(summary.summary.readyForRelease, false);
  assert.ok(summary.summary.invalidPacketEvidence.some((item: string) => /duplicate_case/.test(item)));
  assert.ok(summary.summary.invalidPacketEvidence.some((item: string) => /unknown_case/.test(item)));
});

test('writes derived summary from observation and screenshot files', async () => {
  const { root, observations, screenshotManifest } = await makePackets();
  const observationsPath = path.join(root, 'observations.json');
  const screenshotsPath = path.join(root, 'screenshots.json');
  const outputPath = path.join(root, 'summary.json');
  await writeFile(observationsPath, `${JSON.stringify(observations, null, 2)}\n`);
  await writeFile(screenshotsPath, `${JSON.stringify(screenshotManifest, null, 2)}\n`);

  const result = await writeR30LiveTelegramSummary({
    observationsPath,
    screenshotManifestPath: screenshotsPath,
    outputPath,
    now: '2026-07-01T00:30:00.000Z'
  });
  const saved = JSON.parse(await readFile(outputPath, 'utf8'));

  assert.equal(result.summary.summary.readyForRelease, true);
  assert.equal(saved.summary.readyForRelease, true);
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
