import { execFile } from 'node:child_process';
import { mkdir } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import { resolvePythonCommand } from './pythonCommand';
import { withHiddenWindows } from './hiddenProcess';
import { builderBridgeTimeoutMs, positiveIntegerEnv } from './timeoutConfig';
import { buildChipCreateMissionContext, ChipCreateMissionReporter } from './missionControl';
import { resolveBuilderRepoPath } from './builderRepoPath';

const execFileAsync = promisify(execFile);

export interface ChipCreateResult {
  ok: boolean;
  chipKey?: string;
  chipPath?: string;
  routerInvokable?: boolean;
  proofArtifacts?: ChipProofArtifactSummary;
  warnings?: string[];
  error?: string;
}

export interface ChipProofArtifactSummary {
  schemaVersion?: string;
  benchmarkPack?: boolean;
  autoloopPolicy?: boolean;
  proofCapsule?: boolean;
  builderCommandReceipt?: boolean;
  builderCommandReceiptRef?: string;
  builderCommandReceiptStatus?: string;
  builderCommandHasGovernorDecisionJson?: boolean;
  builderCommandGovernorHash?: string;
  qaEvidenceLanePacket?: boolean;
  qaEvidenceLanePacketRef?: string;
  consumerTransferTrialContract?: boolean;
  consumerTransferTrialContractRef?: string;
  consumerTransferTrialBinding?: boolean;
  consumerTransferTrialBindingRef?: string;
  consumerTransferTrialBindingStatus?: string;
  consumerTransferSupported?: boolean;
  blindJudgeScoreBinding?: boolean;
  blindJudgeScoreBindingRef?: string;
  blindJudgeScoreBindingStatus?: string;
  blindJudgeScoreBound?: boolean;
  qualitySupported?: boolean;
  safetyJudgeBinding?: boolean;
  safetyJudgeBindingRef?: string;
  safetyJudgeBindingStatus?: string;
  safetyClear?: boolean;
  adversaryReportBinding?: boolean;
  adversaryReportBindingRef?: string;
  adversaryReportBindingStatus?: string;
  adversaryClear?: boolean;
  evaluateRunContract?: boolean;
  evaluateRunContractRef?: string;
  evaluateInputRef?: string;
  evaluateOutputRef?: string;
  evaluateExpectedOutputSchema?: string;
  benchmarkCaseCount?: number;
  benchmarkCaseLanes?: {
    development?: number;
    heldOut?: number;
    noOp?: number;
    adversarial?: number;
  };
  trapCaseCount?: number;
  sealedEvaluationContract?: boolean;
  sealedEvaluationContractRef?: string;
  sealedFixtureManifest?: boolean;
  sealedFixtureManifestRef?: string;
  sealedEvaluationBinding?: boolean;
  sealedEvaluationBindingRef?: string;
  sealedEvaluationSupported?: boolean;
  hiddenCaseContentInChip?: boolean;
  promotionTier?: string;
  reviewRolePacketCount?: number;
  reviewRolePackets?: {
    blindJudge?: boolean;
    adversary?: boolean;
    safetyJudge?: boolean;
    consumer?: boolean;
    operator?: boolean;
  };
  qaEvidenceLaneBlockers?: string[];
  qaEvidenceLaneNextEvidence?: string[];
  promotionBlocked?: boolean;
  networkAbsorbable?: boolean;
  consumerTransferClaimed?: boolean;
  operatorPublicationApproved?: boolean;
}

interface ChipCreateConfig {
  pythonCommand: string;
  builderRepo: string;
  builderHome: string;
  outputDir: string;
  chipLabsRoot: string;
  timeoutMs: number;
}

interface ChipCreateJsonPayload {
  ok: boolean;
  chip_key?: string | null;
  chip_path?: string | null;
  router_invokable?: boolean;
  proof_artifacts?: Record<string, unknown>;
  warnings?: string[];
  error?: string | null;
}

export interface ChipCreateOptions {
  governorDecision?: unknown;
}

function boolValue(value: unknown): boolean | undefined {
  return typeof value === 'boolean' ? value : undefined;
}

function numberValue(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function stringValue(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function objectValue(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : undefined;
}

function stringListValue(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const items = value
    .map((item) => typeof item === 'string' ? item.trim() : '')
    .filter(Boolean);
  return items.length ? items : undefined;
}

function parseBenchmarkCaseLanes(value: unknown): ChipProofArtifactSummary['benchmarkCaseLanes'] | undefined {
  const lanes = objectValue(value);
  if (!lanes) return undefined;
  return {
    development: numberValue(lanes.development),
    heldOut: numberValue(lanes.held_out),
    noOp: numberValue(lanes.no_op),
    adversarial: numberValue(lanes.adversarial),
  };
}

function parseProofArtifactSummary(value: unknown): ChipProofArtifactSummary | undefined {
  const root = objectValue(value);
  if (!root) return undefined;
  const reviewRolePackets = objectValue(root.review_role_packets);
  return {
    schemaVersion: typeof root.schema_version === 'string' ? root.schema_version : undefined,
    benchmarkPack: boolValue(root.benchmark_pack),
    autoloopPolicy: boolValue(root.autoloop_policy),
    proofCapsule: boolValue(root.proof_capsule),
    builderCommandReceipt: boolValue(root.builder_command_receipt),
    builderCommandReceiptRef: stringValue(root.builder_command_receipt_ref),
    builderCommandReceiptStatus: stringValue(root.builder_command_receipt_status),
    builderCommandHasGovernorDecisionJson: boolValue(root.builder_command_has_governor_decision_json),
    builderCommandGovernorHash: stringValue(root.builder_command_governor_hash),
    qaEvidenceLanePacket: boolValue(root.qa_evidence_lane_packet),
    qaEvidenceLanePacketRef: stringValue(root.qa_evidence_lane_packet_ref),
    consumerTransferTrialContract: boolValue(root.consumer_transfer_trial_contract),
    consumerTransferTrialContractRef: stringValue(root.consumer_transfer_trial_contract_ref),
    consumerTransferTrialBinding: boolValue(root.consumer_transfer_trial_binding),
    consumerTransferTrialBindingRef: stringValue(root.consumer_transfer_trial_binding_ref),
    consumerTransferTrialBindingStatus: stringValue(root.consumer_transfer_trial_binding_status),
    consumerTransferSupported: boolValue(root.consumer_transfer_supported),
    blindJudgeScoreBinding: boolValue(root.blind_judge_score_binding),
    blindJudgeScoreBindingRef: stringValue(root.blind_judge_score_binding_ref),
    blindJudgeScoreBindingStatus: stringValue(root.blind_judge_score_binding_status),
    blindJudgeScoreBound: boolValue(root.blind_judge_score_bound),
    qualitySupported: boolValue(root.quality_supported),
    safetyJudgeBinding: boolValue(root.safety_judge_binding),
    safetyJudgeBindingRef: stringValue(root.safety_judge_binding_ref),
    safetyJudgeBindingStatus: stringValue(root.safety_judge_binding_status),
    safetyClear: boolValue(root.safety_clear),
    adversaryReportBinding: boolValue(root.adversary_report_binding),
    adversaryReportBindingRef: stringValue(root.adversary_report_binding_ref),
    adversaryReportBindingStatus: stringValue(root.adversary_report_binding_status),
    adversaryClear: boolValue(root.adversary_clear),
    evaluateRunContract: boolValue(root.evaluate_run_contract),
    evaluateRunContractRef: stringValue(root.evaluate_run_contract_ref),
    evaluateInputRef: stringValue(root.evaluate_input_ref),
    evaluateOutputRef: stringValue(root.evaluate_output_ref),
    evaluateExpectedOutputSchema: stringValue(root.evaluate_expected_output_schema),
    benchmarkCaseCount: numberValue(root.benchmark_case_count),
    benchmarkCaseLanes: parseBenchmarkCaseLanes(root.benchmark_case_lanes),
    trapCaseCount: numberValue(root.trap_case_count),
    ...('sealed_evaluation_contract' in root ? { sealedEvaluationContract: boolValue(root.sealed_evaluation_contract) } : {}),
    ...('sealed_evaluation_contract_ref' in root ? { sealedEvaluationContractRef: stringValue(root.sealed_evaluation_contract_ref) } : {}),
    ...('sealed_fixture_manifest' in root ? { sealedFixtureManifest: boolValue(root.sealed_fixture_manifest) } : {}),
    ...('sealed_fixture_manifest_ref' in root ? { sealedFixtureManifestRef: stringValue(root.sealed_fixture_manifest_ref) } : {}),
    ...('sealed_evaluation_binding' in root ? { sealedEvaluationBinding: boolValue(root.sealed_evaluation_binding) } : {}),
    ...('sealed_evaluation_binding_ref' in root ? { sealedEvaluationBindingRef: stringValue(root.sealed_evaluation_binding_ref) } : {}),
    ...('sealed_evaluation_supported' in root ? { sealedEvaluationSupported: boolValue(root.sealed_evaluation_supported) } : {}),
    ...('hidden_case_content_in_chip' in root ? { hiddenCaseContentInChip: boolValue(root.hidden_case_content_in_chip) } : {}),
    promotionTier: stringValue(root.promotion_tier),
    reviewRolePacketCount: numberValue(root.review_role_packet_count),
    reviewRolePackets: reviewRolePackets ? {
      blindJudge: boolValue(reviewRolePackets.blind_judge),
      adversary: boolValue(reviewRolePackets.adversary),
      safetyJudge: boolValue(reviewRolePackets.safety_judge),
      consumer: boolValue(reviewRolePackets.consumer),
      operator: boolValue(reviewRolePackets.operator),
    } : undefined,
    qaEvidenceLaneBlockers: stringListValue(root.qa_evidence_lane_blockers),
    qaEvidenceLaneNextEvidence: stringListValue(root.qa_evidence_lane_next_evidence),
    promotionBlocked: boolValue(root.promotion_blocked),
    networkAbsorbable: boolValue(root.network_absorbable),
    consumerTransferClaimed: boolValue(root.consumer_transfer_claimed),
    operatorPublicationApproved: boolValue(root.operator_publication_approved),
  };
}

export function parseChipCreateJson(stdout: string): ChipCreateResult | null {
  const trimmed = stdout.trim();
  if (!trimmed) return null;
  let parsed: ChipCreateJsonPayload;
  try {
    parsed = JSON.parse(trimmed) as ChipCreateJsonPayload;
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== 'object' || typeof parsed.ok !== 'boolean') {
    return null;
  }
  return {
    ok: Boolean(parsed.ok),
    chipKey: parsed.chip_key ?? undefined,
    chipPath: parsed.chip_path ?? undefined,
    routerInvokable: Boolean(parsed.router_invokable),
    proofArtifacts: parseProofArtifactSummary(parsed.proof_artifacts),
    warnings: parsed.warnings ?? [],
    error: parsed.error ?? undefined,
  };
}

export function formatChipCreateProcessError(err: any): string {
  const stdout = typeof err?.stdout === 'string' ? err.stdout : '';
  const stdoutResult = parseChipCreateJson(stdout);
  if (stdoutResult?.error) {
    return stdoutResult.error;
  }

  const stderr = typeof err?.stderr === 'string' ? err.stderr.trim().slice(-400) : '';
  const stderrResult = parseChipCreateJson(stderr);
  if (stderrResult?.error) {
    return stderrResult.error;
  }

  const message = err?.message || 'chip create failed';
  return stderr || message;
}

export function chipCreateRepairGuidance(error: unknown): string | null {
  const detail = error instanceof Error ? error.message : String(error || '');
  if (!/chip-labs root not found|domain[-\s]+chip[-\s]+labs.+(?:missing|not found)/i.test(detail)) {
    return null;
  }
  return "I couldn’t create that chip because Domain Chip Labs isn’t installed or configured. Ask your Spark admin to install it, then try `/chip create` again.";
}

export function resolveConfig(): ChipCreateConfig {
  const builderRepo = resolveBuilderRepoPath({ configuredRepo: process.env.SPARK_BUILDER_REPO });
  return {
    pythonCommand: resolvePythonCommand(process.env.SPARK_BUILDER_PYTHON),
    builderRepo,
    builderHome: path.resolve(
      process.env.SPARK_BUILDER_HOME || path.join(os.homedir(), '.spark', 'state', 'spark-intelligence')
    ),
    outputDir: path.resolve(
      process.env.CHIP_CREATE_OUTPUT_DIR || path.join(os.homedir(), '.spark', 'chips')
    ),
    chipLabsRoot: path.resolve(
      process.env.SPARK_DOMAIN_CHIP_LABS_ROOT ||
      process.env.CHIP_LABS_ROOT ||
      path.join(os.homedir(), '.spark', 'domain-chip-labs')
    ),
    timeoutMs: positiveIntegerEnv(process.env, 'CHIP_CREATE_TIMEOUT_MS', builderBridgeTimeoutMs()),
  };
}

function pythonPathWithBuilderSrc(builderRepo: string, currentPythonPath: string | undefined): string {
  const builderSrc = path.join(builderRepo, 'src');
  const existing = (currentPythonPath || '')
    .split(path.delimiter)
    .map((entry) => entry.trim())
    .filter(Boolean);
  return Array.from(new Set([builderSrc, ...existing])).join(path.delimiter);
}

export async function ensureChipOutputDirectory(outputDir: string): Promise<void> {
  await mkdir(outputDir, { recursive: true });
}

export async function createChipFromPrompt(prompt: string, options: ChipCreateOptions = {}): Promise<ChipCreateResult> {
  const clean = prompt.trim();
  if (!clean) {
    return {
      ok: false,
      error: 'No chip brief provided. Try /chip create <natural language description of the domain chip you want>.'
    };
  }
  const reporter = new ChipCreateMissionReporter(buildChipCreateMissionContext(clean));
  await reporter.created();
  await reporter.taskStarted(
    'task-brief',
    'Understand natural-language chip brief',
    ['telegram-natural-language', 'domain-chip-creator']
  );
  await reporter.taskCompleted('task-brief', 'Understand natural-language chip brief');
  await reporter.taskStarted(
    'task-scaffold',
    'Scaffold Spark-compatible domain chip',
    ['domain-chip-creator', 'spark-intelligence-builder']
  );
  const config = resolveConfig();
  const args = [
    '-m', 'spark_intelligence.cli', 'chips', 'create',
    '--home', config.builderHome,
    '--prompt', clean,
    '--output-dir', config.outputDir,
    '--chip-labs-root', config.chipLabsRoot,
    '--json',
  ];
  if (options.governorDecision) {
    args.push('--governor-decision-json', JSON.stringify(options.governorDecision));
  }
  try {
    await ensureChipOutputDirectory(config.outputDir);
    await reporter.progress('Running Spark chip scaffolder...', {
      outputDir: config.outputDir,
      chipLabsRoot: config.chipLabsRoot,
    });
    const { stdout } = await execFileAsync(config.pythonCommand, args, withHiddenWindows({
      cwd: config.builderRepo,
      timeout: config.timeoutMs,
      env: {
        ...process.env,
        PYTHONIOENCODING: 'utf-8',
        PYTHONPATH: pythonPathWithBuilderSrc(config.builderRepo, process.env.PYTHONPATH),
      },
      maxBuffer: 10 * 1024 * 1024,
    }));
    const parsed = parseChipCreateJson(stdout);
    if (!parsed) {
      await reporter.taskFailed('task-scaffold', 'Scaffold Spark-compatible domain chip', 'chip create returned invalid JSON');
      await reporter.failed('chip create returned invalid JSON');
      return { ok: false, error: 'chip create returned invalid JSON' };
    }
    if (parsed.ok) {
      await reporter.taskCompleted('task-scaffold', 'Scaffold Spark-compatible domain chip', {
        chipKey: parsed.chipKey,
        chipPath: parsed.chipPath,
        routerInvokable: parsed.routerInvokable,
        warnings: parsed.warnings ?? [],
      });
      await reporter.completed({
        chipKey: parsed.chipKey,
        chipPath: parsed.chipPath,
        routerInvokable: parsed.routerInvokable,
        warnings: parsed.warnings ?? [],
      });
    } else {
      const error = parsed.error || 'chip create failed';
      await reporter.taskFailed('task-scaffold', 'Scaffold Spark-compatible domain chip', error);
      await reporter.failed(error);
    }
    return parsed;
  } catch (err: any) {
    const error = formatChipCreateProcessError(err);
    await reporter.taskFailed('task-scaffold', 'Scaffold Spark-compatible domain chip', error);
    await reporter.failed(error);
    return { ok: false, error };
  }
}
