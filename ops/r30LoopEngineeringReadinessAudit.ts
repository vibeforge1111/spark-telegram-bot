import { existsSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { validateLiveTelegramCanaryEvidence } from '../src/liveTelegramCanaryEvidence';

type RequirementStatus = 'passed' | 'failed' | 'missing' | 'blocked';

type RequirementResult = {
  id: string;
  label: string;
  status: RequirementStatus;
  evidence_refs: string[];
  detail: string;
};

export type R30ReadinessAuditReport = {
  schema_version: 'spark.r30.loop_engineering_readiness_audit.v1';
  generated_at: string;
  status: 'incomplete' | 'ready';
  claim_scope: 'private_candidate_and_local_telegram_handler_until_live_user_observed_canary';
  requirements: RequirementResult[];
  summary: {
    passed: number;
    failed: number;
    missing: number;
    blocked: number;
    total: number;
    hard_blockers: string[];
    allowed_claims: string[];
    disallowed_claims: string[];
  };
};

const DEFAULT_CHIP_ROOT = '/Users/alchemistab/.spark/chips/domain-chip-daily-schedule-reliability-r30-persisted-context-qa';
const DEFAULT_TELEGRAM_ROOT = '/Users/alchemistab/.spark/modules/spark-telegram-bot/source';
const DEFAULT_SPAWNER_ROOT = '/Users/alchemistab/.spark/modules/spawner-ui/source';
const DEFAULT_EVIDENCE_ROOT = '/Users/alchemistab/Documents/Codex/2026-06-28/can/outputs';

function joinRef(root: string, ref: string): string {
  return path.isAbsolute(ref) ? ref : path.join(root, ref);
}

async function readJson<T = any>(filePath: string): Promise<T | null> {
  try {
    return JSON.parse(await readFile(filePath, 'utf8')) as T;
  } catch {
    return null;
  }
}

async function readText(filePath: string): Promise<string | null> {
  try {
    return await readFile(filePath, 'utf8');
  } catch {
    return null;
  }
}

function existsAll(root: string, refs: string[]): boolean {
  return refs.every((ref) => existsSync(joinRef(root, ref)));
}

function result(
  id: string,
  label: string,
  status: RequirementStatus,
  evidenceRefs: string[],
  detail: string
): RequirementResult {
  return { id, label, status, evidence_refs: evidenceRefs, detail };
}

function claimsMatrixBoundaryCheck(matrix: any, livePassed: boolean): { passed: boolean; detail: string } {
  const disallowedText = JSON.stringify(matrix?.disallowed_claims || []);
  const objectiveStatus = String(matrix?.objective_status || '');
  const hasLiveBoundary = /proven live/i.test(disallowedText);
  const hasCompletionBoundary = /fully complete/i.test(disallowedText);
  const hasPublicationBoundary = /publish|published|activat|globally registered|network absorbable|network absorption/i.test(disallowedText);
  const hasMutationBoundary = /mutate|calendar|CRM|repo|external messages?/i.test(disallowedText);
  const hasAutoloopBoundary = /operationally handed to a live autoloop|live autoloop handoff|start a live autoloop/i.test(disallowedText);
  const permanentBoundaries = hasPublicationBoundary && hasMutationBoundary && hasAutoloopBoundary;
  const preLiveOk = !livePassed && objectiveStatus !== 'complete' && hasLiveBoundary && hasCompletionBoundary && permanentBoundaries;
  const postLiveOk = livePassed && objectiveStatus === 'complete' && !hasLiveBoundary && !hasCompletionBoundary && permanentBoundaries;
  return {
    passed: preLiveOk || postLiveOk,
    detail: `objective_status=${objectiveStatus}; live_passed=${livePassed}; live_boundary=${hasLiveBoundary}; completion_boundary=${hasCompletionBoundary}; permanent_boundaries=${permanentBoundaries}.`
  };
}

function allowedClaimsFor(livePassed: boolean): string[] {
  return [
    'Daily Schedule private candidate evidence passes the local evidence gates listed as passed in this audit.',
    'PRD Writing and Daily Schedule local Telegram handler replay canary passed for covered prompts.',
    ...(livePassed
      ? ['R30 Loop Engineering has valid operator-sent live Telegram Desktop proof for the selected Domain Chip fast-path cases.']
      : [])
  ];
}

function disallowedClaimsFor(livePassed: boolean): string[] {
  return [
    ...(livePassed ? [] : [
      'R30 Loop Engineering is complete.',
      'Live Telegram fast-path proof exists.'
    ]),
    'The agent sent Telegram messages or mutated external systems.',
    'Daily Schedule is published, activated, globally registered, or network absorbable.',
    'Daily Schedule loop-mode advisories operationally start a live autoloop from Telegram.'
  ];
}

function markdownSummary(report: R30ReadinessAuditReport): string {
  const lines = [
    '# R30 Loop Engineering Readiness Audit',
    '',
    `Generated: ${report.generated_at}`,
    `Status: ${report.status}`,
    `Claim scope: ${report.claim_scope}`,
    '',
    `Passed: ${report.summary.passed}/${report.summary.total}`,
    `Missing: ${report.summary.missing}`,
    `Failed: ${report.summary.failed}`,
    `Blocked: ${report.summary.blocked}`,
    '',
    '## Requirements',
    ''
  ];

  for (const item of report.requirements) {
    lines.push(`- ${item.status.toUpperCase()} ${item.id}: ${item.label}`);
    lines.push(`  - ${item.detail}`);
  }

  lines.push(
    '',
    '## Hard Blockers',
    '',
    ...(report.summary.hard_blockers.length > 0 ? report.summary.hard_blockers.map((blocker) => `- ${blocker}`) : ['- none']),
    '',
    '## Allowed Claims',
    '',
    ...report.summary.allowed_claims.map((claim) => `- ${claim}`),
    '',
    '## Disallowed Claims',
    '',
    ...report.summary.disallowed_claims.map((claim) => `- ${claim}`)
  );

  return `${lines.join('\n')}\n`;
}

export async function runR30LoopEngineeringReadinessAudit(options: {
  chipRoot?: string;
  telegramRoot?: string;
  spawnerRoot?: string;
  evidenceRoot?: string;
  outputDir?: string;
  liveEvidencePath?: string;
} = {}): Promise<R30ReadinessAuditReport> {
  const chipRoot = options.chipRoot || DEFAULT_CHIP_ROOT;
  const telegramRoot = options.telegramRoot || DEFAULT_TELEGRAM_ROOT;
  const spawnerRoot = options.spawnerRoot || DEFAULT_SPAWNER_ROOT;
  const evidenceRoot = options.evidenceRoot || DEFAULT_EVIDENCE_ROOT;
  const liveEvidencePath = options.liveEvidencePath || path.join(telegramRoot, 'outputs', 'r30-domain-chip-fastpath-canary', 'live-telegram-canary.json');
  const requirements: RequirementResult[] = [];

  requirements.push(result(
    'private_chip_created',
    'Private Daily Schedule Domain Chip artifacts exist.',
    existsAll(chipRoot, ['spark-chip.json', 'created-artifact-manifest.json', 'domain-chip/manifest.json']) ? 'passed' : 'missing',
    ['spark-chip.json', 'created-artifact-manifest.json', 'domain-chip/manifest.json'],
    'Requires private chip metadata and manifest artifacts.'
  ));

  requirements.push(result(
    'benchmark_pack_present',
    'Benchmark manifest, cases, traps, and scoring rubric exist.',
    existsAll(chipRoot, ['benchmark/manifest.json', 'benchmark/cases.jsonl', 'benchmark/traps.jsonl', 'benchmark/scoring_rubric.md']) ? 'passed' : 'missing',
    ['benchmark/manifest.json', 'benchmark/cases.jsonl', 'benchmark/traps.jsonl', 'benchmark/scoring_rubric.md'],
    'Requires benchmark materials before usefulness claims.'
  ));

  const ab = await readJson(joinRef(chipRoot, 'reports/chip-benefit-ab.json'));
  requirements.push(result(
    'same_budget_ab',
    'No-chip vs chip-assisted A/B has meaningful blind usefulness delta or no-safe-win.',
    ab?.ab_status === 'pass' && ab?.blind_evaluation_verified === true && (ab?.meaningful_utility_delta === true || ab?.no_safe_win_approved === true) ? 'passed' : ab ? 'failed' : 'missing',
    ['reports/chip-benefit-ab.json'],
    ab ? `A/B status=${ab.ab_status}; delta=${ab.effective_utility_delta}; blind=${ab.blind_evaluation_verified}.` : 'A/B report missing.'
  ));

  const longLoop = await readJson(joinRef(chipRoot, 'reports/long-loop-trend.json'));
  const roundRefs = ['001', '002', '003', '004', '005'].map((id) => `reports/autoloop-round-${id}.json`);
  const rounds = await Promise.all(roundRefs.map((ref) => readJson(joinRef(chipRoot, ref))));
  const roundsPassed = rounds.every((round: any) => round?.round_status === 'passed' && round?.keep_candidate === true);
  requirements.push(result(
    'five_round_autoloop',
    'Five persisted autoloop rounds passed and long-loop trend passed.',
    longLoop?.trend_status === 'pass' && longLoop?.rounds_observed >= 5 && roundsPassed ? 'passed' : longLoop ? 'failed' : 'missing',
    ['reports/long-loop-trend.json', ...roundRefs],
    longLoop ? `rounds_observed=${longLoop.rounds_observed}; trend=${longLoop.trend_status}.` : 'Long-loop trend report missing.'
  ));

  const sealed = await readJson(joinRef(chipRoot, 'reports/sealed-evaluation-binding.json'));
  requirements.push(result(
    'sealed_separated_evaluator',
    'Sealed separated evaluator binding passed and generator did not self-score.',
    sealed?.sealed_evaluation_supported === true && sealed?.role_separation === true && sealed?.generator_self_scored === false ? 'passed' : sealed ? 'failed' : 'missing',
    ['reports/sealed-evaluation-binding.json', 'reports/r30-controlled-loop/sealed-evaluator-report-v2.json'],
    sealed ? `sealed=${sealed.sealed_evaluation_supported}; role_separation=${sealed.role_separation}; generator_self_scored=${sealed.generator_self_scored}.` : 'Sealed binding missing.'
  ));

  const watchtower = await readJson(joinRef(chipRoot, 'reports/watchtower-check.json'));
  requirements.push(result(
    'watchtower',
    'Watchtower checks executed and passed.',
    watchtower?.watchtower_executed === true && watchtower?.watchtower_status === 'passed' ? 'passed' : watchtower ? 'failed' : 'missing',
    ['reports/watchtower-check.json'],
    watchtower ? `watchtower=${watchtower.watchtower_status}; checks=${watchtower.check_count}.` : 'Watchtower report missing.'
  ));

  const rollback = await readJson(joinRef(chipRoot, 'reports/rollback-check.json'));
  requirements.push(result(
    'rollback',
    'Rollback readiness executed and passed.',
    rollback?.rollback_executed === true && rollback?.rollback_status === 'passed' ? 'passed' : rollback ? 'failed' : 'missing',
    ['reports/rollback-check.json'],
    rollback ? `rollback=${rollback.rollback_status}; executed=${rollback.rollback_executed}.` : 'Rollback report missing.'
  ));

  const transfer = await readJson(joinRef(chipRoot, 'reports/consumer-transfer-trial-binding.json'));
  requirements.push(result(
    'cold_consumer_transfer',
    'Cold consumer transfer trial passed.',
    transfer?.transfer_report_status === 'pass' && transfer?.transfer_passed === true ? 'passed' : transfer ? 'failed' : 'missing',
    ['reports/consumer-transfer-trial-binding.json', 'reports/consumer-transfer-report.json'],
    transfer ? `transfer=${transfer.transfer_report_status}; passed=${transfer.transfer_passed}.` : 'Consumer transfer binding missing.'
  ));

  const proofAuditor = await readJson(joinRef(chipRoot, 'reports/proof-auditor-check.json'));
  const loopGate = await readJson(joinRef(chipRoot, 'reports/loop-gate-check.json'));
  requirements.push(result(
    'proof_auditor_and_readability',
    'Proof auditor passed and human onboarding/readability score is at least 9.',
    proofAuditor?.proof_auditor_status === 'passed' && loopGate?.ux_readability_score >= 9 ? 'passed' : proofAuditor && loopGate ? 'failed' : 'missing',
    ['reports/proof-auditor-check.json', 'reports/loop-gate-check.json', 'reports/human-onboarding-rubric.md'],
    proofAuditor && loopGate ? `proof_auditor=${proofAuditor.proof_auditor_status}; ux=${loopGate.ux_readability_score}.` : 'Proof auditor or loop gate missing.'
  ));

  const runtime = await readJson(joinRef(chipRoot, 'distilled-runtime/daily-schedule-reliability-r30-persisted-context-qa-fast-path.json'));
  requirements.push(result(
    'distilled_runtime_contract',
    'Distilled fast Telegram runtime contract exists and keeps live quick/review modes gated.',
    runtime?.runtime_state === 'private_candidate_supported_local_telegram_handler_passed_live_telegram_unproven'
      && runtime?.runtime_modes?.quick_answer?.allowed_now === false
      && runtime?.runtime_modes?.review_packet?.allowed_now === false
      ? 'passed'
      : runtime ? 'failed' : 'missing',
    ['distilled-runtime/daily-schedule-reliability-r30-persisted-context-qa-fast-path.json'],
    runtime ? `runtime_state=${runtime.runtime_state}; quick_allowed=${runtime.runtime_modes?.quick_answer?.allowed_now}.` : 'Runtime contract missing.'
  ));

  const localCanary = await readJson(joinRef(telegramRoot, 'outputs/r30-domain-chip-fastpath-canary/local-handler-canary.json'));
  requirements.push(result(
    'local_telegram_handler_canary',
    'PRD and Daily Schedule local Telegram handler canary passed without live sends.',
    localCanary?.summary?.status === 'pass' && localCanary?.live_send_performed === false && localCanary?.external_mutation_performed === false ? 'passed' : localCanary ? 'failed' : 'missing',
    [joinRef(telegramRoot, 'outputs/r30-domain-chip-fastpath-canary/local-handler-canary.json')],
    localCanary ? `canary=${localCanary.summary?.status}; cases=${localCanary.summary?.passed}/${localCanary.summary?.total}; live_send=${localCanary.live_send_performed}.` : 'Local Telegram handler canary missing.'
  ));

  const spawnerFiles = [
    'docs/LOOP_ENGINEERING_MANAGEMENT_PRD.md',
    'src/lib/server/loop-engineering-registry.ts',
    'src/lib/server/loop-engineering-registry.test.ts',
    'src/routes/api/loop-engineering/chips/+server.ts',
    'src/routes/api/loop-engineering/chips/[chipId]/+server.ts',
    'src/routes/loop-engineering/+page.server.ts',
    'src/routes/loop-engineering/+page.svelte',
    'src/routes/loop-engineering/[chipId]/+page.server.ts',
    'src/routes/loop-engineering/[chipId]/+page.svelte'
  ];
  requirements.push(result(
    'spawner_loop_management_surface',
    'Spawner has a read-only Loop Engineering management PRD, registry, board, detail page, and API.',
    existsAll(spawnerRoot, spawnerFiles) ? 'passed' : 'missing',
    spawnerFiles.map((ref) => joinRef(spawnerRoot, ref)),
    'Requires the management surface that tracks chips, benchmark evals, loop results, activation boundaries, and next proof steps.'
  ));

  const statusRouteSource = await readText(joinRef(telegramRoot, 'src/loopEngineeringStatus.ts'));
  const indexSource = await readText(joinRef(telegramRoot, 'src/index.ts'));
  const hasStatusRoute = Boolean(
    statusRouteSource?.includes('loop_engineering.status')
      && statusRouteSource.includes('fetchLoopEngineeringStatusPacket')
      && indexSource?.includes('fetchLoopEngineeringStatusPacket')
      && indexSource.includes('loop_engineering.status')
  );
  requirements.push(result(
    'telegram_loop_status_route',
    'Telegram has a read-only Loop Engineering status route backed by Spawner evidence.',
    hasStatusRoute && existsAll(telegramRoot, ['src/loopEngineeringStatus.ts', 'tests/loopEngineeringStatus.test.ts']) ? 'passed' : 'missing',
    [joinRef(telegramRoot, 'src/loopEngineeringStatus.ts'), joinRef(telegramRoot, 'tests/loopEngineeringStatus.test.ts'), joinRef(telegramRoot, 'src/index.ts')],
    hasStatusRoute ? 'Route source confirms loop_engineering.status packet integration.' : 'Status route source or top-level handler integration missing.'
  ));

  const spawnerEvidenceRef = 'R30_LOOP_ENGINEERING_SPAWNER_MANAGEMENT_SLICE_2026-07-01.md';
  const spawnerEvidence = await readText(joinRef(evidenceRoot, spawnerEvidenceRef));
  const spawnerEvidencePassed = Boolean(
    spawnerEvidence?.includes('Telegram activation blocked')
      && spawnerEvidence.includes('10/12')
      && spawnerEvidence.includes('no horizontal overflow')
      && spawnerEvidence.includes('console error count: 0')
  );
  requirements.push(result(
    'spawner_management_evidence_note',
    'Spawner management slice has evidence for registry counts, detail readiness, and browser QA.',
    spawnerEvidencePassed ? 'passed' : spawnerEvidence ? 'failed' : 'missing',
    [joinRef(evidenceRoot, spawnerEvidenceRef)],
    spawnerEvidence ? `evidence_contains_runtime_truth=${spawnerEvidencePassed}.` : 'Spawner management evidence note missing.'
  ));

  const telegramEvidenceRef = 'R30_LOOP_ENGINEERING_TELEGRAM_STATUS_ROUTE_2026-07-01.md';
  const telegramEvidence = await readText(joinRef(evidenceRoot, telegramEvidenceRef));
  const telegramEvidencePassed = Boolean(
    telegramEvidence?.includes('loop_engineering.status')
      && telegramEvidence.includes('10/12')
      && telegramEvidence.includes('liveTelegramProven')
      && telegramEvidence.includes('false')
      && telegramEvidence.includes('not live Telegram Desktop proof')
  );
  requirements.push(result(
    'telegram_status_route_evidence_note',
    'Telegram status route evidence preserves local-only proof and live Telegram boundary.',
    telegramEvidencePassed ? 'passed' : telegramEvidence ? 'failed' : 'missing',
    [joinRef(evidenceRoot, telegramEvidenceRef)],
    telegramEvidence ? `evidence_preserves_live_boundary=${telegramEvidencePassed}.` : 'Telegram status route evidence note missing.'
  ));

  const liveEvidence = await readJson(liveEvidencePath);
  const liveValidation = liveEvidence ? validateLiveTelegramCanaryEvidence(liveEvidence) : null;
  requirements.push(result(
    'live_telegram_user_observed_canary',
    'Approved live Telegram canary was observed with screenshot and route telemetry, without agent-sent external messages.',
    liveValidation?.passed ? 'passed' : liveEvidence ? 'failed' : 'blocked',
    [liveEvidencePath],
    liveEvidence ? `status=${liveEvidence.status}; validation_failures=${liveValidation?.failures.join('; ') || 'none'}.` : 'Blocked until an approved operator sends the Telegram prompt and captures screenshot plus route telemetry.'
  ));

  const matrix = await readJson(joinRef(chipRoot, 'reports/r30-controlled-loop/final-allowed-disallowed-claims-matrix.json'));
  const matrixBoundary = claimsMatrixBoundaryCheck(matrix, liveValidation?.passed === true);
  requirements.push(result(
    'claims_matrix_boundaries',
    'Allowed/disallowed claims matrix preserves live, mutation, publication, and completion boundaries.',
    matrixBoundary.passed ? 'passed' : matrix ? 'failed' : 'missing',
    ['reports/r30-controlled-loop/final-allowed-disallowed-claims-matrix.json'],
    matrix ? matrixBoundary.detail : 'Claims matrix missing.'
  ));

  const counts = {
    passed: requirements.filter((item) => item.status === 'passed').length,
    failed: requirements.filter((item) => item.status === 'failed').length,
    missing: requirements.filter((item) => item.status === 'missing').length,
    blocked: requirements.filter((item) => item.status === 'blocked').length
  };
  const hardBlockers = requirements
    .filter((item) => item.status !== 'passed')
    .map((item) => item.id);
  const status = hardBlockers.length === 0 ? 'ready' : 'incomplete';
  const livePassedForClaims = liveValidation?.passed === true;
  const report: R30ReadinessAuditReport = {
    schema_version: 'spark.r30.loop_engineering_readiness_audit.v1',
    generated_at: new Date().toISOString(),
    status,
    claim_scope: 'private_candidate_and_local_telegram_handler_until_live_user_observed_canary',
    requirements,
    summary: {
      ...counts,
      total: requirements.length,
      hard_blockers: hardBlockers,
      allowed_claims: allowedClaimsFor(livePassedForClaims),
      disallowed_claims: disallowedClaimsFor(livePassedForClaims)
    }
  };

  const outputDir = options.outputDir || path.join(telegramRoot, 'outputs', 'r30-loop-engineering-readiness-audit');
  await mkdir(outputDir, { recursive: true });
  await writeFile(path.join(outputDir, 'readiness-audit.json'), `${JSON.stringify(report, null, 2)}\n`);
  await writeFile(path.join(outputDir, 'readiness-audit.md'), markdownSummary(report));
  return report;
}

if (require.main === module) {
  const outputIndex = process.argv.indexOf('--output-dir');
  const liveIndex = process.argv.indexOf('--live-evidence');
  const allowIncomplete = process.argv.includes('--allow-incomplete');
  runR30LoopEngineeringReadinessAudit({
    outputDir: outputIndex >= 0 ? process.argv[outputIndex + 1] : undefined,
    liveEvidencePath: liveIndex >= 0 ? process.argv[liveIndex + 1] : undefined
  })
    .then((report) => {
      console.log(`R30 readiness audit: ${report.status} (${report.summary.passed}/${report.summary.total} passed)`);
      if (report.status !== 'ready' && !allowIncomplete) process.exitCode = 1;
    })
    .catch((error) => {
      console.error(error);
      process.exitCode = 1;
    });
}
