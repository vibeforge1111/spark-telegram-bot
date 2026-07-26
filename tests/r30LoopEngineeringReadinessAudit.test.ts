import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { runR30LoopEngineeringReadinessAudit } from '../ops/r30LoopEngineeringReadinessAudit';
import { R30_LIVE_TELEGRAM_REQUIRED_CASE_IDS } from '../src/liveTelegramCanaryEvidence';
import { R30_LIVE_TELEGRAM_CASES } from '../src/r30LiveTelegramCases';
import { summarizeR30LiveTelegramObservations } from '../src/r30LiveTelegramSummary';
import { screenshotDigestForFile } from '../src/r30ScreenshotEvidence';

type AsyncTest = () => Promise<void> | void;
const tests: { name: string; fn: AsyncTest }[] = [];

function test(name: string, fn: AsyncTest): void {
  tests.push({ name, fn });
}

async function writeJson(filePath: string, value: unknown): Promise<void> {
  await writeText(filePath, `${JSON.stringify(value, null, 2)}\n`);
}

async function writeText(filePath: string, value: string): Promise<void> {
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, value);
}

async function createFixture() {
  const root = await mkdtemp(path.join(os.tmpdir(), 'r30-readiness-audit-'));
  const chipRoot = path.join(root, 'chip');
  const telegramRoot = path.join(root, 'telegram');
  const spawnerRoot = path.join(root, 'spawner');
  const evidenceRoot = path.join(root, 'evidence');
  const outputDir = path.join(root, 'out');

  for (const ref of [
    'spark-chip.json',
    'created-artifact-manifest.json',
    'domain-chip/manifest.json',
    'benchmark/manifest.json'
  ]) {
    await writeJson(path.join(chipRoot, ref), { ok: true });
  }
  await writeText(path.join(chipRoot, 'benchmark/cases.jsonl'), '{"id":"case"}\n');
  await writeText(path.join(chipRoot, 'benchmark/traps.jsonl'), '{"id":"trap"}\n');
  await writeText(path.join(chipRoot, 'benchmark/scoring_rubric.md'), '# Rubric\n');

  await writeJson(path.join(chipRoot, 'reports/chip-benefit-ab.json'), {
    ab_status: 'pass',
    blind_evaluation_verified: true,
    meaningful_utility_delta: true,
    effective_utility_delta: 12.5
  });
  await writeJson(path.join(chipRoot, 'reports/long-loop-trend.json'), {
    trend_status: 'pass',
    rounds_observed: 5
  });
  for (const id of ['001', '002', '003', '004', '005']) {
    await writeJson(path.join(chipRoot, `reports/autoloop-round-${id}.json`), {
      round_status: 'passed',
      keep_candidate: true
    });
  }
  await writeJson(path.join(chipRoot, 'reports/sealed-evaluation-binding.json'), {
    sealed_evaluation_supported: true,
    role_separation: true,
    generator_self_scored: false
  });
  await writeJson(path.join(chipRoot, 'reports/watchtower-check.json'), {
    watchtower_executed: true,
    watchtower_status: 'passed',
    check_count: 7
  });
  await writeJson(path.join(chipRoot, 'reports/rollback-check.json'), {
    rollback_executed: true,
    rollback_status: 'passed'
  });
  await writeJson(path.join(chipRoot, 'reports/consumer-transfer-trial-binding.json'), {
    transfer_report_status: 'pass',
    transfer_passed: true
  });
  await writeJson(path.join(chipRoot, 'reports/proof-auditor-check.json'), {
    proof_auditor_status: 'passed'
  });
  await writeJson(path.join(chipRoot, 'reports/loop-gate-check.json'), {
    ux_readability_score: 10
  });
  await writeText(path.join(chipRoot, 'reports/human-onboarding-rubric.md'), '# Human Onboarding\n');
  await writeJson(path.join(chipRoot, 'distilled-runtime/daily-schedule-reliability-r30-persisted-context-qa-fast-path.json'), {
    runtime_state: 'private_candidate_supported_local_telegram_handler_passed_live_telegram_unproven',
    runtime_modes: {
      quick_answer: { allowed_now: false },
      review_packet: { allowed_now: false }
    }
  });
  await writeJson(path.join(chipRoot, 'reports/r30-controlled-loop/final-allowed-disallowed-claims-matrix.json'), {
    objective_status: 'partial_private_candidate_pass_local_telegram_handler_passed_live_fast_path_unproven',
    disallowed_claims: [
      { claim: 'Daily Schedule Telegram fast path is proven live.' },
      { claim: 'Daily Schedule is published, activated, globally registered, or network absorbable.' },
      { claim: 'Daily Schedule loop-mode prompts are operationally handed to a live autoloop from Telegram.' },
      { claim: 'Daily Schedule can mutate real calendars, CRMs, repos, or send external messages.' },
      { claim: 'R30 Loop Engineering is fully complete.' }
    ]
  });

  await writeJson(path.join(telegramRoot, 'outputs/r30-domain-chip-fastpath-canary/local-handler-canary.json'), {
    summary: { status: 'pass', passed: 8, total: 8 },
    live_send_performed: false,
    external_mutation_performed: false
  });
  await writeText(path.join(telegramRoot, 'src/loopEngineeringStatus.ts'), 'export const route = "loop_engineering.status"; export async function fetchLoopEngineeringStatusPacket() {}\n');
  await writeText(path.join(telegramRoot, 'src/index.ts'), 'import { fetchLoopEngineeringStatusPacket } from "./loopEngineeringStatus"; console.log("loop_engineering.status", fetchLoopEngineeringStatusPacket);\n');
  await writeText(path.join(telegramRoot, 'tests/loopEngineeringStatus.test.ts'), 'console.log("ok");\n');

  for (const ref of [
    'docs/LOOP_ENGINEERING_MANAGEMENT_PRD.md',
    'src/lib/server/loop-engineering-registry.ts',
    'src/lib/server/loop-engineering-registry.test.ts',
    'src/routes/api/loop-engineering/chips/+server.ts',
    'src/routes/api/loop-engineering/chips/[chipId]/+server.ts',
    'src/routes/loop-engineering/+page.server.ts',
    'src/routes/loop-engineering/+page.svelte',
    'src/routes/loop-engineering/[chipId]/+page.server.ts',
    'src/routes/loop-engineering/[chipId]/+page.svelte'
  ]) {
    await writeText(path.join(spawnerRoot, ref), 'ok\n');
  }

  await writeText(
    path.join(evidenceRoot, 'R30_LOOP_ENGINEERING_SPAWNER_MANAGEMENT_SLICE_2026-07-01.md'),
    'Telegram activation blocked\n10/12\nno horizontal overflow\nconsole error count: 0\n'
  );
  await writeText(
    path.join(evidenceRoot, 'R30_LOOP_ENGINEERING_TELEGRAM_STATUS_ROUTE_2026-07-01.md'),
    'loop_engineering.status\n10/12\nliveTelegramProven\nfalse\nnot live Telegram Desktop proof\n'
  );

  return { root, chipRoot, telegramRoot, spawnerRoot, evidenceRoot, outputDir };
}

test('reports incomplete and blocked when live Telegram evidence is absent', async () => {
  const fixture = await createFixture();
  const report = await runR30LoopEngineeringReadinessAudit(fixture);

  assert.equal(report.status, 'incomplete');
  assert.equal(report.summary.blocked, 1);
  assert.equal(report.summary.failed, 0);
  assert.equal(report.summary.missing, 0);
  assert.ok(report.summary.hard_blockers.includes('live_telegram_user_observed_canary'));
  assert.ok(report.summary.disallowed_claims.some((claim) => /R30 Loop Engineering is complete/i.test(claim)));
  assert.ok(report.summary.disallowed_claims.some((claim) => /Live Telegram fast-path proof exists/i.test(claim)));
  assert.equal(report.requirements.find((item) => item.id === 'spawner_loop_management_surface')?.status, 'passed');
  assert.equal(report.requirements.find((item) => item.id === 'telegram_loop_status_route')?.status, 'passed');
});

test('reports ready only when approved live Telegram evidence is present', async () => {
  const fixture = await createFixture();
  const liveEvidencePath = path.join(fixture.root, 'live-telegram-canary.json');
  const observationPacketRef = path.join(fixture.root, 'r30-live-canary-observations.json');
  const summaryJsonRef = path.join(fixture.root, 'r30-live-canary-summary.json');
  const screenshotManifestRef = path.join(fixture.root, 'screenshot-manifest.json');
  const screenshotEntries = [];
  const screenshotRefs = new Map<string, string>();
  for (const entry of R30_LIVE_TELEGRAM_CASES) {
    const screenshotPath = path.join(fixture.root, `${entry.id}.png`);
    await writeText(screenshotPath, `telegram screenshot bytes for ${entry.id}`);
    const digestEntry = screenshotDigestForFile(screenshotPath);
    screenshotRefs.set(entry.id, digestEntry.ref);
    screenshotEntries.push({ ...digestEntry, captured_for_case_id: entry.id });
  }
  await writeJson(screenshotManifestRef, {
    schema_version: 'spark.r30.screenshot_manifest.v1',
    generated_at: '2026-07-01T00:00:00.000Z',
    entries: screenshotEntries
  });
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
        authority: entry.expectedAuthority,
        mutationClass: entry.expectedMutationClass,
        route: entry.expectedRoute,
        replyShape: entry.expectedReplyShape
      },
      observed: {
        verdict: 'pass',
        reply: 'Spark gave a natural read-only answer for the requested R30 loop engineering case.',
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
        proofJoin: `Live /proof joined ${entry.expectedRoute} to the Telegram outbound proof capsule and showed no latest proof gaps.`,
        proofPanel: 'Harness Proof Intent: chat_only\nAudit actionable: clean\nAudit fresh-strict: clean\nLatest proof gaps: none',
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
  await writeJson(observationPacketRef, observations);
  await writeJson(summaryJsonRef, summarizeR30LiveTelegramObservations(observations, screenshotManifest));
  await writeJson(liveEvidencePath, {
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
    required_case_ids: [...R30_LIVE_TELEGRAM_REQUIRED_CASE_IDS]
  });
  await writeJson(path.join(fixture.chipRoot, 'reports/r30-controlled-loop/final-allowed-disallowed-claims-matrix.json'), {
    objective_status: 'complete',
    allowed_claims: [
      { claim: 'R30 Loop Engineering has live Telegram Desktop proof for the selected Domain Chip fast-path cases.' }
    ],
    disallowed_claims: [
      { claim: 'Daily Schedule is published, activated, globally registered, or network absorbable.' },
      { claim: 'Daily Schedule loop-mode prompts are operationally handed to a live autoloop from Telegram.' },
      { claim: 'Daily Schedule can mutate real calendars, CRMs, repos, or send external messages.' }
    ]
  });

  const report = await runR30LoopEngineeringReadinessAudit({ ...fixture, liveEvidencePath });

  assert.equal(report.status, 'ready');
  assert.equal(report.summary.blocked, 0);
  assert.equal(report.summary.hard_blockers.length, 0);
  assert.ok(report.summary.allowed_claims.some((claim) => /valid operator-sent live Telegram Desktop proof/i.test(claim)));
  assert.ok(!report.summary.disallowed_claims.some((claim) => /R30 Loop Engineering is complete/i.test(claim)));
  assert.ok(!report.summary.disallowed_claims.some((claim) => /Live Telegram fast-path proof exists/i.test(claim)));
  assert.ok(report.summary.disallowed_claims.some((claim) => /published, activated, globally registered, or network absorbable/i.test(claim)));
  assert.equal(report.requirements.find((item) => item.id === 'live_telegram_user_observed_canary')?.status, 'passed');
  assert.equal(report.requirements.find((item) => item.id === 'claims_matrix_boundaries')?.status, 'passed');
});

test('keeps readiness incomplete when live evidence is weak or fake-looking', async () => {
  const fixture = await createFixture();
  const liveEvidencePath = path.join(fixture.root, 'live-telegram-canary.json');
  await writeJson(path.join(fixture.chipRoot, 'reports/r30-controlled-loop/final-allowed-disallowed-claims-matrix.json'), {
    objective_status: 'complete',
    disallowed_claims: [
      { claim: 'Daily Schedule is published, activated, globally registered, or network absorbable.' },
      { claim: 'Daily Schedule loop-mode prompts are operationally handed to a live autoloop from Telegram.' },
      { claim: 'Daily Schedule can mutate real calendars, CRMs, repos, or send external messages.' }
    ]
  });
  await writeJson(liveEvidencePath, {
    status: 'pass',
    sent_by_operator: true,
    agent_sent_external_message: false,
    route_telemetry_captured: true,
    screenshot_refs: ['/tmp/nonexistent-r30-proof.png']
  });

  const report = await runR30LoopEngineeringReadinessAudit({ ...fixture, liveEvidencePath });

  assert.equal(report.status, 'incomplete');
  assert.equal(report.summary.failed, 2);
  assert.equal(report.requirements.find((item) => item.id === 'live_telegram_user_observed_canary')?.status, 'failed');
  assert.equal(report.requirements.find((item) => item.id === 'claims_matrix_boundaries')?.status, 'failed');
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
