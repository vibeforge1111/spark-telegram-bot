import assert from 'node:assert/strict';
import { formatChipCreateProcessError, parseChipCreateJson, resolveConfig } from '../src/chipCreate';
import {
  buildChipCreateMissionContext,
  ChipCreateMissionReporter,
  type MissionControlEvent,
} from '../src/missionControl';

async function test(name: string, fn: () => void | Promise<void>): Promise<void> {
  try {
    await fn();
    console.log(`ok - ${name}`);
  } catch (error) {
    console.error(`not ok - ${name}`);
    throw error;
  }
}

async function main(): Promise<void> {
  await test('prefers Spark-standard Domain Chip Labs root env over legacy chip labs env', () => {
    const originalEnv = { ...process.env };
    try {
      process.env.SPARK_DOMAIN_CHIP_LABS_ROOT = '/tmp/spark-domain-chip-labs-standard';
      process.env.CHIP_LABS_ROOT = '/tmp/legacy-chip-labs';

      const config = resolveConfig();

      assert.equal(config.chipLabsRoot, '/tmp/spark-domain-chip-labs-standard');
    } finally {
      for (const key of Object.keys(process.env)) {
        if (!(key in originalEnv)) delete process.env[key];
      }
      Object.assign(process.env, originalEnv);
    }
  });

  await test('parses successful chip create JSON', () => {
    const result = parseChipCreateJson(JSON.stringify({
      ok: true,
      chip_key: 'domain-chip-ascii-art',
      chip_path: 'C:\\Users\\USER\\.spark\\chips\\domain-chip-ascii-art',
      router_invokable: true,
      proof_artifacts: {
        schema_version: 'spark-domain-chip.proof_artifact_summary.v1',
        benchmark_pack: true,
        autoloop_policy: true,
        proof_capsule: true,
        builder_command_receipt: true,
        builder_command_receipt_ref: 'reports/builder-command-receipt.json',
        builder_command_receipt_status: 'verified',
        builder_command_has_governor_decision_json: true,
        builder_command_governor_hash: 'abc123',
        qa_evidence_lane_packet: true,
        qa_evidence_lane_packet_ref: 'reports/qa-evidence-lane-packet.json',
        consumer_transfer_trial_contract: true,
        consumer_transfer_trial_contract_ref: 'reports/consumer-transfer-trial-contract.json',
        consumer_transfer_trial_binding: true,
        consumer_transfer_trial_binding_ref: 'reports/consumer-transfer-trial-binding.json',
        consumer_transfer_trial_binding_status: 'awaiting_report',
        consumer_transfer_supported: false,
        blind_judge_score_binding: true,
        blind_judge_score_binding_ref: 'reports/blind-judge-score-binding.json',
        blind_judge_score_binding_status: 'awaiting_scorecard',
        blind_judge_score_bound: false,
        quality_supported: false,
        safety_judge_binding: true,
        safety_judge_binding_ref: 'reports/safety-judge-binding.json',
        safety_judge_binding_status: 'awaiting_report',
        safety_clear: false,
        adversary_report_binding: true,
        adversary_report_binding_ref: 'reports/adversary-report-binding.json',
        adversary_report_binding_status: 'awaiting_report',
        adversary_clear: false,
        evaluate_run_contract: true,
        evaluate_run_contract_ref: 'benchmark/evaluate-run-contract.json',
        evaluate_input_ref: 'benchmark/cases.jsonl',
        evaluate_output_ref: 'reports/local-evaluate-smoke.json',
        evaluate_expected_output_schema: 'spark-domain-chip.local_evaluate_smoke.v1',
        benchmark_case_count: 14,
        benchmark_case_lanes: {
          development: 5,
          held_out: 5,
          no_op: 1,
          adversarial: 3,
        },
        trap_case_count: 3,
        promotion_tier: 'candidate_review',
        review_role_packets: {
          blind_judge: true,
          adversary: true,
          safety_judge: true,
          consumer: true,
          operator: true,
        },
        review_role_packet_count: 5,
        promotion_blocked: true,
        network_absorbable: false,
        consumer_transfer_claimed: false,
        operator_publication_approved: false,
      },
      warnings: [],
      error: null,
    }));

    assert.deepEqual(result, {
      ok: true,
      chipKey: 'domain-chip-ascii-art',
      chipPath: 'C:\\Users\\USER\\.spark\\chips\\domain-chip-ascii-art',
      routerInvokable: true,
      proofArtifacts: {
        schemaVersion: 'spark-domain-chip.proof_artifact_summary.v1',
        benchmarkPack: true,
        autoloopPolicy: true,
        proofCapsule: true,
        builderCommandReceipt: true,
        builderCommandReceiptRef: 'reports/builder-command-receipt.json',
        builderCommandReceiptStatus: 'verified',
        builderCommandHasGovernorDecisionJson: true,
        builderCommandGovernorHash: 'abc123',
        qaEvidenceLanePacket: true,
        qaEvidenceLanePacketRef: 'reports/qa-evidence-lane-packet.json',
        consumerTransferTrialContract: true,
        consumerTransferTrialContractRef: 'reports/consumer-transfer-trial-contract.json',
        consumerTransferTrialBinding: true,
        consumerTransferTrialBindingRef: 'reports/consumer-transfer-trial-binding.json',
        consumerTransferTrialBindingStatus: 'awaiting_report',
        consumerTransferSupported: false,
        blindJudgeScoreBinding: true,
        blindJudgeScoreBindingRef: 'reports/blind-judge-score-binding.json',
        blindJudgeScoreBindingStatus: 'awaiting_scorecard',
        blindJudgeScoreBound: false,
        qualitySupported: false,
        safetyJudgeBinding: true,
        safetyJudgeBindingRef: 'reports/safety-judge-binding.json',
        safetyJudgeBindingStatus: 'awaiting_report',
        safetyClear: false,
        adversaryReportBinding: true,
        adversaryReportBindingRef: 'reports/adversary-report-binding.json',
        adversaryReportBindingStatus: 'awaiting_report',
        adversaryClear: false,
        evaluateRunContract: true,
        evaluateRunContractRef: 'benchmark/evaluate-run-contract.json',
        evaluateInputRef: 'benchmark/cases.jsonl',
        evaluateOutputRef: 'reports/local-evaluate-smoke.json',
        evaluateExpectedOutputSchema: 'spark-domain-chip.local_evaluate_smoke.v1',
        benchmarkCaseCount: 14,
        benchmarkCaseLanes: {
          development: 5,
          heldOut: 5,
          noOp: 1,
          adversarial: 3,
        },
        trapCaseCount: 3,
        promotionTier: 'candidate_review',
        reviewRolePacketCount: 5,
        reviewRolePackets: {
          blindJudge: true,
          adversary: true,
          safetyJudge: true,
          consumer: true,
          operator: true,
        },
        qaEvidenceLaneBlockers: undefined,
        qaEvidenceLaneNextEvidence: undefined,
        promotionBlocked: true,
        networkAbsorbable: false,
        consumerTransferClaimed: false,
        operatorPublicationApproved: false,
      },
      warnings: [],
      error: undefined,
    });
  });

  await test('extracts JSON error from failed Python stdout', () => {
    const message = formatChipCreateProcessError({
      message: 'Command failed: python -m spark_intelligence.cli chips create',
      stdout: JSON.stringify({
        ok: false,
        chip_key: null,
        chip_path: null,
        router_invokable: false,
        warnings: [],
        error: 'chip-labs root not found: C:\\Users\\USER\\.spark\\domain-chip-labs',
      }),
      stderr: '',
    });

    assert.equal(message, 'chip-labs root not found: C:\\Users\\USER\\.spark\\domain-chip-labs');
  });

  await test('emits mission-control lifecycle events for chip creation', async () => {
    const previousUrl = process.env.SPAWNER_UI_URL;
    process.env.SPAWNER_UI_URL = 'http://127.0.0.1:4174';
    try {
      const events: MissionControlEvent[] = [];
      const context = buildChipCreateMissionContext('creates us cool images out of ASCII patterns');
      const reporter = new ChipCreateMissionReporter(context, async (_url, payload) => {
        events.push(payload);
      });

      await reporter.created();
      await reporter.taskStarted('task-scaffold', 'Scaffold Spark-compatible domain chip', ['domain-chip-creator']);
      await reporter.taskCompleted('task-scaffold', 'Scaffold Spark-compatible domain chip', {
        chipKey: 'domain-chip-ascii-art',
        routerInvokable: true,
      });
      await reporter.completed({ chipKey: 'domain-chip-ascii-art' });

      assert.equal(events.length, 4);
      assert.match(events[0].missionId, /^spark-chip-create-/);
      assert.equal(events[0].type, 'mission_created');
      assert.equal(events[1].taskId, 'task-scaffold');
      assert.equal(events[2].type, 'task_completed');
      assert.equal(events[3].type, 'mission_completed');
      assert.deepEqual(events[0].data?.plannedTasks, context.plannedTasks);
    } finally {
      if (previousUrl === undefined) delete process.env.SPAWNER_UI_URL;
      else process.env.SPAWNER_UI_URL = previousUrl;
    }
  });
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
