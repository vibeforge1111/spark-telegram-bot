import * as path from 'node:path';
import {
  checkRuntimeFreshness,
  formatRuntimeFreshnessReport
} from '../src/runtimeFreshness';

function hasFlag(name: string): boolean {
  return process.argv.includes(`--${name}`);
}

function argValue(name: string): string | null {
  const index = process.argv.indexOf(`--${name}`);
  if (index === -1) return null;
  return process.argv[index + 1] || null;
}

function argList(name: string): string[] {
  const value = argValue(name);
  if (!value) return [];
  return value.split(',').map((entry) => entry.trim()).filter(Boolean);
}

async function main(): Promise<void> {
  if (hasFlag('help')) {
    console.log([
      'Runtime freshness check',
      '',
      'Usage:',
      '  npx ts-node ops/runtimeFreshnessCheck.ts',
      '  npx ts-node ops/runtimeFreshnessCheck.ts --warn-only',
      '  npx ts-node ops/runtimeFreshnessCheck.ts --runtime C:/Users/USER/.spark/modules/spark-telegram-bot/source',
      '  npx ts-node ops/runtimeFreshnessCheck.ts --paths src/index.ts,dist/index.js',
      '',
      'Checks route-critical source and built files before live Telegram smoke.'
    ].join('\n'));
    return;
  }

  const sourceRoot = argValue('source') || path.resolve(__dirname, '..');
  const runtimeRoot = argValue('runtime') || undefined;
  const paths = argList('paths');
  const result = checkRuntimeFreshness({
    sourceRoot,
    runtimeRoot,
    paths: paths.length > 0 ? paths : undefined
  });

  if (hasFlag('json')) {
    console.log(JSON.stringify(result, null, 2));
  } else {
    console.log(formatRuntimeFreshnessReport(result).trimEnd());
  }

  if (!result.ok && !hasFlag('warn-only')) {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
