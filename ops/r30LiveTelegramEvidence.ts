import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { validateLiveTelegramCanaryEvidence } from '../src/liveTelegramCanaryEvidence';
import { R30_LIVE_TELEGRAM_REQUIRED_CASE_IDS } from '../src/r30LiveTelegramCases';

function argValue(args: string[], name: string): string | undefined {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : undefined;
}

async function readJson(filePath: string) {
  return JSON.parse(await readFile(filePath, 'utf8'));
}

export async function writeR30LiveTelegramEvidence(options: {
  observationsPath: string;
  summaryPath: string;
  screenshotManifestPath: string;
  outputPath: string;
  observedAt?: string;
  generatedAt?: string;
}) {
  const observationsPath = path.resolve(options.observationsPath);
  const summaryPath = path.resolve(options.summaryPath);
  const screenshotManifestPath = path.resolve(options.screenshotManifestPath);
  await Promise.all([readJson(observationsPath), readJson(summaryPath), readJson(screenshotManifestPath)]);

  const evidence = {
    schema_version: 'spark.r30.live_telegram_canary.v1',
    status: 'pass',
    target: 'SparkRecursive_bot',
    proof_scope: 'r30_domain_chip_fastpath_live_telegram',
    generated_at: options.generatedAt || new Date().toISOString(),
    observed_at: options.observedAt || new Date().toISOString(),
    sent_by_operator: true,
    agent_sent_external_message: false,
    observation_packet_ref: observationsPath,
    summary_json_ref: summaryPath,
    screenshot_digest_manifest_ref: screenshotManifestPath,
    required_case_ids: [...R30_LIVE_TELEGRAM_REQUIRED_CASE_IDS]
  };
  const validation = validateLiveTelegramCanaryEvidence(evidence);
  if (!validation.passed) {
    throw new Error(`R30 live Telegram evidence is not valid:\n${validation.failures.join('\n')}`);
  }
  await mkdir(path.dirname(options.outputPath), { recursive: true });
  await writeFile(options.outputPath, `${JSON.stringify(evidence, null, 2)}\n`);
  return { outputPath: options.outputPath, evidence, validation };
}

if (require.main === module) {
  const args = process.argv.slice(2);
  const observationsPath = argValue(args, '--observations');
  const summaryPath = argValue(args, '--summary');
  const screenshotManifestPath = argValue(args, '--screenshots');
  const outputPath = argValue(args, '--output');
  const observedAt = argValue(args, '--observed-at');
  if (!observationsPath || !summaryPath || !screenshotManifestPath || !outputPath) {
    console.error('Usage: ts-node ops/r30LiveTelegramEvidence.ts --observations <observations.json> --summary <summary.json> --screenshots <screenshot-manifest.json> --output <live-telegram-canary.json> [--observed-at iso]');
    process.exit(1);
  } else {
    writeR30LiveTelegramEvidence({ observationsPath, summaryPath, screenshotManifestPath, outputPath, observedAt })
      .then((result) => {
        console.log(`Wrote validated R30 live Telegram evidence: ${result.outputPath}`);
      })
      .catch((error) => {
        console.error(error.message || error);
        process.exitCode = 1;
      });
  }
}
