import { readFile, writeFile } from 'node:fs/promises';
import { summarizeR30LiveTelegramObservations } from '../src/r30LiveTelegramSummary';

function argValue(args: string[], name: string): string | undefined {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : undefined;
}

async function readJson(filePath: string) {
  return JSON.parse(await readFile(filePath, 'utf8'));
}

export async function writeR30LiveTelegramSummary(options: {
  observationsPath: string;
  screenshotManifestPath: string;
  outputPath: string;
  now?: string;
}) {
  const observations = await readJson(options.observationsPath);
  const screenshotManifest = await readJson(options.screenshotManifestPath);
  const summary = summarizeR30LiveTelegramObservations(observations, screenshotManifest, { now: options.now });
  await writeFile(options.outputPath, `${JSON.stringify(summary, null, 2)}\n`);
  return { outputPath: options.outputPath, summary };
}

if (require.main === module) {
  const args = process.argv.slice(2);
  const observationsPath = argValue(args, '--observations');
  const screenshotManifestPath = argValue(args, '--screenshots');
  const outputPath = argValue(args, '--output');
  const now = argValue(args, '--now');
  if (!observationsPath || !screenshotManifestPath || !outputPath) {
    console.error('Usage: ts-node ops/r30LiveTelegramSummary.ts --observations <observations.json> --screenshots <screenshot-manifest.json> --output <summary.json> [--now iso]');
    process.exit(1);
  } else {
    writeR30LiveTelegramSummary({ observationsPath, screenshotManifestPath, outputPath, now })
      .then((result) => {
        console.log(`Wrote R30 live Telegram summary: ${result.outputPath}`);
        console.log(`readyForRelease=${result.summary.summary.readyForRelease}`);
      })
      .catch((error) => {
        console.error(error);
        process.exitCode = 1;
      });
  }
}
