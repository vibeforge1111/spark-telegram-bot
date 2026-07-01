import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {
  R30_LIVE_TELEGRAM_REQUIRED_CASE_IDS,
  validateLiveTelegramCanaryEvidence
} from '../src/liveTelegramCanaryEvidence';
import { R30_LIVE_TELEGRAM_CASES } from '../src/r30LiveTelegramCases';
import { writeR30LiveTelegramProofPack } from '../ops/r30LiveTelegramProofPack';
import { screenshotDigestForFile } from '../src/r30ScreenshotEvidence';
import { summarizeR30LiveTelegramObservations } from '../src/r30LiveTelegramSummary';

type AsyncTest = () => Promise<void> | void;
const tests: { name: string; fn: AsyncTest }[] = [];

function test(name: string, fn: AsyncTest): void {
  tests.push({ name, fn });
}

async function writeJson(filePath: string, value: unknown): Promise<void> {
  await writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`);
}

function observedCase(id: string, screenshotRef: string, overrides: Record<string, unknown> = {}) {
  const canonical = R30_LIVE_TELEGRAM_CASES.find((entry) => entry.id === id);
  assert.ok(canonical);
  return {
    id,
    promptHash: canonical.promptHash,
    prompt: canonical.prompt,
    expected: {
      route: canonical.expectedRoute,
      authority: canonical.expectedAuthority,
      mutationClass: canonical.expectedMutationClass,
      replyShape: canonical.expectedReplyShape,
      capture: {
        observedReply: true,
        sideEffects: true,
        proofPanel: true,
        screenshot: true,
        userConfirmation: true
      }
    },
    observed: {
      verdict: 'pass',
      reply: 'Spark gave a natural, read-only answer for the requested R30 case without launching work.',
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
      proofJoin: `Live /proof joined ${canonical.expectedRoute} to the Telegram outbound proof capsule and showed no latest proof gaps.`,
      proofPanel: 'Harness Proof Intent: chat_only\nAudit actionable: clean\nAudit fresh-strict: clean\nLatest proof gaps: none',
      screenshotRefs: [screenshotRef],
      userConfirmation: `Manually sent and observed in Telegram with SparkRecursive_bot for ${id}.`,
      notes: null,
      ...(overrides.observed as Record<string, unknown> || {})
    },
    ...Object.fromEntries(Object.entries(overrides).filter(([key]) => key !== 'observed'))
  };
}

async function packetFixture(options: {
  omitCase?: string;
  stale?: boolean;
  observedOverrides?: Record<string, Record<string, unknown>>;
  summaryOverrides?: Record<string, unknown>;
  evidenceOverrides?: Record<string, unknown>;
  manifestMode?: 'valid' | 'missing-ref' | 'missing-entry' | 'missing-file' | 'digest-mismatch' | 'wrong-case';
  forgedSummary?: boolean;
} = {}) {
  const root = await mkdtemp(path.join(os.tmpdir(), 'r30-live-canary-packet-'));
  const observationPacketRef = path.join(root, 'r30-live-canary-observations.json');
  const summaryJsonRef = path.join(root, 'r30-live-canary-summary.json');
  const screenshotManifestRef = path.join(root, 'screenshot-manifest.json');
  const caseIds = R30_LIVE_TELEGRAM_REQUIRED_CASE_IDS.filter((id) => id !== options.omitCase);
  const generatedAt = options.stale ? '2026-06-30T00:00:00.000Z' : '2026-07-01T00:00:00.000Z';
  const expires = options.stale ? '2026-06-30T01:00:00.000Z' : '2026-07-01T01:00:00.000Z';
  const screenshotEntries = [];
  const screenshotRefs = new Map<string, string>();
  for (const id of caseIds) {
    const filePath = path.join(root, `${id}.png`);
    await writeFile(filePath, `telegram screenshot bytes for ${id}`);
    const entry = screenshotDigestForFile(filePath);
    screenshotRefs.set(id, entry.ref);
    if (options.manifestMode !== 'missing-entry' || id !== 'r30-prd-fast-001') {
      screenshotEntries.push({
        ...entry,
        ...(options.manifestMode === 'wrong-case' && id === 'r30-prd-fast-001'
          ? { captured_for_case_id: 'r30-daily-fast-001' }
          : { captured_for_case_id: id })
      });
    }
    if (options.manifestMode === 'digest-mismatch' && id === 'r30-prd-fast-001') {
      await writeFile(filePath, 'changed screenshot bytes');
    }
    if (options.manifestMode === 'missing-file' && id === 'r30-prd-fast-001') {
      screenshotEntries[screenshotEntries.length - 1].file_path = path.join(root, 'missing.png');
    }
  }
  if (options.manifestMode !== 'missing-ref') {
    await writeJson(screenshotManifestRef, {
      schema_version: 'spark.r30.screenshot_manifest.v1',
      generated_at: '2026-07-01T00:00:00.000Z',
      entries: screenshotEntries
    });
  }
  const observations = {
    schema_version: 'spark.r30.live_telegram_observations.v1',
    target: 'SparkRecursive_bot',
    generatedAt,
    evidence: { collectedAt: generatedAt },
    cases: caseIds.map((id) => observedCase(id, screenshotRefs.get(id) || '', options.observedOverrides?.[id] || {}))
  };
  const summary = {
    ...summarizeR30LiveTelegramObservations(observations, {
      schema_version: 'spark.r30.screenshot_manifest.v1',
      generated_at: '2026-07-01T00:00:00.000Z',
      entries: screenshotEntries
    }, { now: '2026-07-01T00:30:00.000Z' }),
    ...(options.forgedSummary
      ? {
        summary: {
          target: 'SparkRecursive_bot',
          readyForRelease: true,
          readyForPublish: false,
          releaseBlockers: [],
          missingPacketEvidence: [],
          invalidPacketEvidence: [],
          stalePacketEvidence: [],
          runtimeEvidenceExpiresAt: expires,
          gateScope: 'selected_case_gate',
          cases: caseIds.map((id) => {
            const canonical = R30_LIVE_TELEGRAM_CASES.find((entry) => entry.id === id);
            assert.ok(canonical);
            return {
              id,
              promptHash: canonical.promptHash,
              verdict: 'pass',
              expectedRoute: canonical.expectedRoute,
              expectedAuthority: canonical.expectedAuthority,
              expectedMutationClass: canonical.expectedMutationClass,
              expectedReplyShape: canonical.expectedReplyShape,
              missingCaptures: []
            };
          })
        }
      }
      : {})
  };
  if (options.stale) {
    summary.summary.runtimeEvidenceExpiresAt = '2026-06-30T01:00:00.000Z';
    summary.summary.stalePacketEvidence = ['runtime_evidence_expired'];
    summary.summary.releaseBlockers = ['runtime_evidence_expired'];
    summary.summary.readyForRelease = false;
  }
  Object.assign(summary.summary, options.summaryOverrides || {});
  await writeJson(observationPacketRef, observations);
  await writeJson(summaryJsonRef, summary);
  return {
    schema_version: 'spark.r30.live_telegram_canary.v1',
    status: 'pass',
    target: 'SparkRecursive_bot',
    proof_scope: 'r30_domain_chip_fastpath_live_telegram',
    generated_at: '2026-07-01T00:00:00.000Z',
    observed_at: '2026-07-01T00:10:00.000Z',
    sent_by_operator: true,
    agent_sent_external_message: false,
    observation_packet_ref: observationPacketRef,
    summary_json_ref: summaryJsonRef,
    screenshot_digest_manifest_ref: screenshotManifestRef,
    required_case_ids: [...R30_LIVE_TELEGRAM_REQUIRED_CASE_IDS],
    ...options.evidenceOverrides
  };
}

test('accepts a focused fresh selected-case R30 Telegram proof packet', async () => {
  const validation = validateLiveTelegramCanaryEvidence(await packetFixture(), { now: '2026-07-01T00:30:00.000Z' });
  assert.equal(validation.passed, true);
  assert.deepEqual(validation.failures, []);
});

test('rejects a selected-case packet missing one required R30 case', async () => {
  const validation = validateLiveTelegramCanaryEvidence(await packetFixture({ omitCase: 'r30-daily-loop-advisory-001' }), { now: '2026-07-01T00:30:00.000Z' });
  assert.equal(validation.passed, false);
  assert.match(validation.failures.join('\n'), /observation case missing r30-daily-loop-advisory-001/);
});

test('rejects stale runtime evidence', async () => {
  const validation = validateLiveTelegramCanaryEvidence(await packetFixture({ stale: true }), { now: '2026-07-01T00:30:00.000Z' });
  assert.equal(validation.passed, false);
  assert.match(validation.failures.join('\n'), /runtimeEvidenceExpiresAt/);
});

test('rejects weak screenshot refs, missing proof joins, raw leaks, and side effects', async () => {
  const validation = validateLiveTelegramCanaryEvidence(await packetFixture({
    observedOverrides: {
      'r30-prd-fast-001': {
        observed: {
          screenshotRefs: ['/tmp/fake.png'],
          proofJoin: 'missing proof',
          reply: 'Status:\n/Users/alchemistab/raw/path',
          sideEffects: {
            filesChanged: false,
            memoryWritten: false,
            missionStarted: true,
            externalNetworkCalled: false,
            accessChanged: false,
            providerChanged: false
          }
        }
      }
    }
  }), { now: '2026-07-01T00:30:00.000Z' });
  assert.equal(validation.passed, false);
  const failures = validation.failures.join('\n');
  assert.match(failures, /proofJoin/);
  assert.match(failures, /screenshot:sha256/);
  assert.match(failures, /sideEffects/);
  assert.match(failures, /raw internals/);
  assert.match(failures, /robotic heading/);
});

test('rejects forged passing summaries when observations are incomplete', async () => {
  const validation = validateLiveTelegramCanaryEvidence(await packetFixture({
    forgedSummary: true,
    observedOverrides: {
      'r30-daily-fast-001': {
        observed: {
          verdict: 'untested',
          reply: '',
          proofJoin: ''
        }
      }
    }
  }), { now: '2026-07-01T00:30:00.000Z' });

  assert.equal(validation.passed, false);
  assert.match(validation.failures.join('\n'), /must match derived observations/);
});

test('rejects missing screenshot manifest, missing entries, digest mismatch, and wrong case binding', async () => {
  for (const mode of ['missing-ref', 'missing-entry', 'missing-file', 'digest-mismatch', 'wrong-case'] as const) {
    const validation = validateLiveTelegramCanaryEvidence(await packetFixture({ manifestMode: mode }), { now: '2026-07-01T00:30:00.000Z' });
    assert.equal(validation.passed, false, mode);
  }
});

test('rejects agent-sent or decorative evidence refs', async () => {
  const validation = validateLiveTelegramCanaryEvidence(await packetFixture({
    evidenceOverrides: {
      sent_by_operator: false,
      agent_sent_external_message: true,
      observation_packet_ref: '/tmp/not-a-real-r30-observation.json'
    }
  }), { now: '2026-07-01T00:30:00.000Z' });
  assert.equal(validation.passed, false);
  const failures = validation.failures.join('\n');
  assert.match(failures, /sent_by_operator/);
  assert.match(failures, /agent_sent_external_message/);
  assert.match(failures, /observation_packet_ref/);
});

test('writes an operator prompt pack and pending evidence index template', async () => {
  const outputDir = await mkdtemp(path.join(os.tmpdir(), 'r30-proof-pack-'));
  const result = await writeR30LiveTelegramProofPack({ outputDir, spawnerUrl: 'http://127.0.0.1:3334' });
  const markdown = await readFile(result.markdownPath, 'utf8');
  const template = JSON.parse(await readFile(result.templatePath, 'utf8'));

  assert.match(markdown, /r30-prd-fast-001/);
  assert.match(markdown, /r30-daily-loop-advisory-001/);
  assert.match(markdown, /operator-sent Telegram Desktop proof/i);
  assert.equal(template.status, 'pending');
  assert.equal(template.target, 'SparkRecursive_bot');
  assert.equal(template.proof_scope, 'r30_domain_chip_fastpath_live_telegram');
  assert.equal(template.sent_by_operator, true);
  assert.equal(template.agent_sent_external_message, false);
  assert.match(template.screenshot_digest_manifest_ref, /screenshot-manifest\.template\.json$/);
  assert.deepEqual(template.required_case_ids, [...R30_LIVE_TELEGRAM_REQUIRED_CASE_IDS]);
  assert.doesNotMatch(markdown, /\/Users\/|\/tmp\//);
  assert.match(markdown, /screenshot digest manifest/i);
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
