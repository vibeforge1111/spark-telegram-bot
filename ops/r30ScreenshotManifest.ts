import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { screenshotDigestForFile } from '../src/r30ScreenshotEvidence';

const DEFAULT_OUTPUT = '/Users/alchemistab/.spark/modules/spark-telegram-bot/source/outputs/r30-live-telegram-proof-pack/screenshot-manifest.json';

function parseArgs(argv: string[]) {
  const outputIndex = argv.indexOf('--output');
  const casesIndex = argv.indexOf('--cases');
  const outputPath = outputIndex >= 0 ? argv[outputIndex + 1] : DEFAULT_OUTPUT;
  const caseIds = casesIndex >= 0 ? argv[casesIndex + 1].split(',').map((item) => item.trim()).filter(Boolean) : [];
  const files = argv.filter((arg, index) => {
    if (arg === '--output' || arg === '--cases') return false;
    if (index > 0 && (argv[index - 1] === '--output' || argv[index - 1] === '--cases')) return false;
    return !arg.startsWith('--');
  });
  return { outputPath, caseIds, files };
}

export async function writeR30ScreenshotManifest(options: { outputPath?: string; files: string[]; caseIds?: string[] }) {
  const outputPath = options.outputPath || DEFAULT_OUTPUT;
  const entries = options.files.map((filePath, index) => ({
    ...screenshotDigestForFile(filePath),
    ...(options.caseIds?.[index] ? { captured_for_case_id: options.caseIds[index] } : {})
  }));
  const manifest = {
    schema_version: 'spark.r30.screenshot_manifest.v1',
    generated_at: new Date().toISOString(),
    entries
  };
  await mkdir(path.dirname(outputPath), { recursive: true });
  await writeFile(outputPath, `${JSON.stringify(manifest, null, 2)}\n`);
  return { outputPath, manifest };
}

if (require.main === module) {
  const { outputPath, caseIds, files } = parseArgs(process.argv.slice(2));
  if (files.length === 0) {
    console.error('Usage: ts-node ops/r30ScreenshotManifest.ts --output <manifest.json> [--cases id1,id2] <screenshot...>');
    process.exit(1);
  } else {
    writeR30ScreenshotManifest({ outputPath, files, caseIds })
      .then((result) => {
        console.log(`Wrote R30 screenshot manifest: ${result.outputPath}`);
        for (const entry of result.manifest.entries) console.log(`${entry.ref} ${entry.file_path}`);
      })
      .catch((error) => {
        console.error(error);
        process.exitCode = 1;
      });
  }
}
