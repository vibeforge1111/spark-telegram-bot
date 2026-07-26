import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { R30_LIVE_TELEGRAM_CASES, R30_LIVE_TELEGRAM_REQUIRED_CASE_IDS } from '../src/r30LiveTelegramCases';

const DEFAULT_OUTPUT_DIR = '/Users/alchemistab/.spark/modules/spark-telegram-bot/source/outputs/r30-live-telegram-proof-pack';
const DEFAULT_CHIP_ID = 'domain-chip-daily-schedule-reliability-r30-persisted-context-qa';
const DEFAULT_SPAWNER_URL = process.env.SPAWNER_UI_PUBLIC_URL || 'http://127.0.0.1:3334';

function observationTemplate() {
  return {
    schema_version: 'spark.r30.live_telegram_observations.v1',
    target: 'SparkRecursive_bot',
    generatedAt: new Date().toISOString(),
    verdictValues: ['pass', 'fail', 'blocked', 'needs-retest', 'untested'],
    evidence: {
      collectedAt: '',
      sparkLiveStatus: '',
      providerStatus: '',
      runtimeSync: '',
      controlProofAudit: '',
      liveTraceJoin: '',
      notes: 'Fill after the operator manually sends each prompt in Telegram Desktop.'
    },
    cases: R30_LIVE_TELEGRAM_CASES.map((entry) => ({
      id: entry.id,
      promptHash: entry.promptHash,
      category: entry.id.includes('boundary') ? 'boundary' : 'domain_chip_fast_path',
      prompt: entry.prompt,
      expected: {
        authority: entry.expectedAuthority,
        mutationClass: entry.expectedMutationClass,
        route: entry.expectedRoute,
        replyShape: entry.expectedReplyShape,
        sideEffect: entry.sideEffectExpectation,
        proofJoin: 'Live /proof or route telemetry must show the expected route joined to Telegram evidence with no latest proof gaps.',
        capture: {
          observedReply: true,
          sideEffects: true,
          proofPanel: true,
          screenshot: true,
          userConfirmation: true
        }
      },
      observed: {
        verdict: 'untested',
        reply: '',
        sideEffects: {
          filesChanged: null,
          memoryWritten: null,
          missionStarted: null,
          externalNetworkCalled: null,
          accessChanged: null,
          providerChanged: null,
          calendarMutated: null,
          crmMutated: null,
          repoMutated: null,
          autoloopStarted: null,
          notes: ''
        },
        proofJoin: '',
        proofPanel: '',
        screenshotRefs: [],
        userConfirmation: '',
        notes: null
      }
    }))
  };
}

function summaryTemplate() {
  return {
    schema_version: 'spark.r30.live_telegram_summary.v1',
    summary: {
      target: 'SparkRecursive_bot',
      generatedAt: new Date().toISOString(),
      runtimeEvidenceCollectedAt: '',
      runtimeEvidenceMaxAgeHours: 1,
      runtimeEvidenceExpiresAt: '',
      totalCases: R30_LIVE_TELEGRAM_CASES.length,
      verdictCounts: {
        pass: 0,
        fail: 0,
        blocked: 0,
        'needs-retest': 0,
        untested: R30_LIVE_TELEGRAM_CASES.length
      },
      readyForRelease: false,
      readyForPublish: false,
      releaseBlockers: ['live_r30_cases_untested'],
      publishBlockers: ['publish_not_in_scope'],
      missingPacketEvidence: ['live_observations_pending'],
      invalidPacketEvidence: [],
      stalePacketEvidence: [],
      gateScope: 'selected_case_gate',
      cases: R30_LIVE_TELEGRAM_CASES.map((entry) => ({
        id: entry.id,
        promptHash: entry.promptHash,
        category: entry.id.includes('boundary') ? 'boundary' : 'domain_chip_fast_path',
        verdict: 'untested',
        expectedRoute: entry.expectedRoute,
        expectedAuthority: entry.expectedAuthority,
        expectedMutationClass: entry.expectedMutationClass,
        expectedReplyShape: entry.expectedReplyShape,
        missingCaptures: ['verdict', 'observed_reply', 'side_effects', 'proof_join', 'proof_panel', 'screenshot', 'user_confirmation']
      }))
    }
  };
}

function evidenceTemplate(spawnerUrl: string, outputDir: string) {
  return {
    schema_version: 'spark.r30.live_telegram_canary.v1',
    status: 'pending',
    target: 'SparkRecursive_bot',
    proof_scope: 'r30_domain_chip_fastpath_live_telegram',
    generated_at: new Date().toISOString(),
    observed_at: '',
    sent_by_operator: true,
    agent_sent_external_message: false,
    observation_packet_ref: path.join(outputDir, 'r30-live-canary-observations.template.json'),
    summary_json_ref: path.join(outputDir, 'r30-live-canary-summary.template.json'),
    screenshot_digest_manifest_ref: path.join(outputDir, 'screenshot-manifest.template.json'),
    required_case_ids: R30_LIVE_TELEGRAM_REQUIRED_CASE_IDS,
    spawner_detail_url: `${spawnerUrl.replace(/\/+$/, '')}/loop-engineering/${DEFAULT_CHIP_ID}`
  };
}

function screenshotManifestTemplate() {
  return {
    schema_version: 'spark.r30.screenshot_manifest.v1',
    generated_at: new Date().toISOString(),
    entries: R30_LIVE_TELEGRAM_CASES.map((entry) => ({
      ref: 'screenshot:sha256:<computed-from-file>',
      file_path: '<absolute-local-screenshot-path>',
      sha256: '<computed-from-file>',
      captured_for_case_id: entry.id
    }))
  };
}

function markdownPack(spawnerUrl: string): string {
  return [
    '# R30 Live Telegram Proof Pack',
    '',
    'Use this pack only for operator-sent Telegram Desktop proof. The agent must not send Telegram messages or mutate external systems.',
    '',
    '## Copy-Paste Prompts',
    '',
    ...R30_LIVE_TELEGRAM_CASES.flatMap((entry, index) => [
      `${index + 1}. ${entry.id}`,
      '',
      `Expected route: \`${entry.expectedRoute}\``,
      `Authority: \`${entry.expectedAuthority}\``,
      `Mutation class: \`${entry.expectedMutationClass}\``,
      `Reply shape: ${entry.expectedReplyShape}`,
      `Side-effect expectation: ${entry.sideEffectExpectation}`,
      '',
      '```text',
      entry.prompt,
      '```',
      ''
    ]),
    '## What To Capture',
    '',
    '- Telegram Desktop screenshot showing the operator prompt and Spark reply.',
    '- `/proof` output or route telemetry proving the expected route/proof join for each case.',
    '- A generated screenshot digest manifest for each case; do not hand-type screenshot digests.',
    '- Operator confirmation saying each prompt was manually sent in Telegram and observed in `SparkRecursive_bot`.',
    '- Side-effect booleans showing no mission, autoloop, file edit, schedule mutation, provider/access change, calendar/CRM/repo mutation, or agent-sent external message.',
    '',
    'After screenshots are captured, generate the private digest manifest with:',
    '',
    '```bash',
    'npm run r30:screenshot-manifest -- --output outputs/r30-live-telegram-proof-pack/screenshot-manifest.json --cases r30-prd-fast-001,r30-daily-fast-001,r30-daily-loop-advisory-001,r30-boundary-meta-timezone-001 <screenshot-1> <screenshot-2> <screenshot-3> <screenshot-4>',
    '```',
    '',
    'After observations and the screenshot manifest are filled, derive the summary instead of hand-authoring pass/fail:',
    '',
    '```bash',
    'npm run r30:live-telegram:summary -- --observations outputs/r30-live-telegram-proof-pack/r30-live-canary-observations.json --screenshots outputs/r30-live-telegram-proof-pack/screenshot-manifest.json --output outputs/r30-live-telegram-proof-pack/r30-live-canary-summary.json',
    '```',
    '',
    'Then write the final evidence index only after validation passes:',
    '',
    '```bash',
    'npm run r30:live-telegram:evidence -- --observations outputs/r30-live-telegram-proof-pack/r30-live-canary-observations.json --summary outputs/r30-live-telegram-proof-pack/r30-live-canary-summary.json --screenshots outputs/r30-live-telegram-proof-pack/screenshot-manifest.json --output outputs/r30-domain-chip-fastpath-canary/live-telegram-canary.json',
    '```',
    '',
    '## Pass Conditions',
    '',
    '- Required case IDs pass: `r30-prd-fast-001`, `r30-daily-fast-001`, `r30-daily-loop-advisory-001`, `r30-boundary-meta-timezone-001`.',
    '- Summary has `readyForRelease: true`, no release blockers, no missing/invalid/stale packet evidence, and fresh runtime evidence.',
    '- Gate scope is either `selected_case_gate` for these four cases or `full_release_pack`.',
    '- Each required case has `verdict: pass` and `missingCaptures: []`.',
    '- Natural replies do not leak raw paths, ids, traces, policy reason codes, or robotic standalone headings.',
    '- Publish readiness is not required; publish blockers do not block this live Telegram proof.',
    '',
    '## Evidence Template',
    '',
    'Use `live-telegram-canary.template.json` only as a shape reference. The final index should be written by the validation command above.',
    ''
  ].join('\n');
}

export async function writeR30LiveTelegramProofPack(options: { outputDir?: string; spawnerUrl?: string } = {}) {
  const outputDir = options.outputDir || DEFAULT_OUTPUT_DIR;
  const spawnerUrl = options.spawnerUrl || DEFAULT_SPAWNER_URL;
  await mkdir(outputDir, { recursive: true });
  const markdownPath = path.join(outputDir, 'operator-proof-pack.md');
  const templatePath = path.join(outputDir, 'live-telegram-canary.template.json');
  const observationTemplatePath = path.join(outputDir, 'r30-live-canary-observations.template.json');
  const summaryTemplatePath = path.join(outputDir, 'r30-live-canary-summary.template.json');
  const screenshotManifestTemplatePath = path.join(outputDir, 'screenshot-manifest.template.json');
  await writeFile(markdownPath, markdownPack(spawnerUrl));
  await writeFile(templatePath, `${JSON.stringify(evidenceTemplate(spawnerUrl, outputDir), null, 2)}\n`);
  await writeFile(observationTemplatePath, `${JSON.stringify(observationTemplate(), null, 2)}\n`);
  await writeFile(summaryTemplatePath, `${JSON.stringify(summaryTemplate(), null, 2)}\n`);
  await writeFile(screenshotManifestTemplatePath, `${JSON.stringify(screenshotManifestTemplate(), null, 2)}\n`);
  return { outputDir, markdownPath, templatePath, observationTemplatePath, summaryTemplatePath, screenshotManifestTemplatePath };
}

if (require.main === module) {
  const outputIndex = process.argv.indexOf('--output-dir');
  const spawnerIndex = process.argv.indexOf('--spawner-url');
  writeR30LiveTelegramProofPack({
    outputDir: outputIndex >= 0 ? process.argv[outputIndex + 1] : undefined,
    spawnerUrl: spawnerIndex >= 0 ? process.argv[spawnerIndex + 1] : undefined
  })
    .then((result) => {
      console.log(`Wrote R30 live Telegram proof pack: ${result.outputDir}`);
    })
    .catch((error) => {
      console.error(error);
      process.exitCode = 1;
    });
}
