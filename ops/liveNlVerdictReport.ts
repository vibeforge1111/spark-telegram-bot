import fs from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import {
  formatLiveNlVerdictReport,
  parseLiveNlCommandCases,
  selectLiveNlCommandCases
} from '../src/liveNlVerdict';

function argValue(args: string[], name: string): string | null {
  const index = args.indexOf(`--${name}`);
  if (index === -1) return null;
  return args[index + 1] || null;
}

function hasFlag(args: string[], name: string): boolean {
  return args.includes(`--${name}`);
}

function argList(args: string[], name: string): string[] {
  const value = argValue(args, name);
  if (!value) return [];
  return value.split(',').map((entry) => entry.trim()).filter(Boolean);
}

function timestampForFile(date = new Date()): string {
  return date.toISOString().replace(/[:.]/g, '-');
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const casesPath = path.join(__dirname, 'natural-language-live-commands.json');
  try {
    const allCases = parseLiveNlCommandCases(JSON.parse(fs.readFileSync(casesPath, 'utf8')));
  } catch (error) {
    console.error('readFileSync failed:', error);
    throw error;
  }
  const suite = argValue(args, 'suite');
  const selected = selectLiveNlCommandCases(allCases, {
    caseId: argValue(args, 'case'),
    caseIds: argList(args, 'cases'),
    suite,
    includeRisky: hasFlag(args, 'include-risky')
  });

  if (selected.length === 0) {
    throw new Error('No matching command cases.');
  }

  const report = formatLiveNlVerdictReport(selected, { suite });
  if (hasFlag(args, 'stdout')) {
    console.log(report);
    return;
  }

  const outPath = path.resolve(
    argValue(args, 'out') || path.join(__dirname, 'reports', `natural-language-live-verdict-${timestampForFile()}.md`)
  );
  await mkdir(path.dirname(outPath), { recursive: true });
  await writeFile(outPath, report, 'utf8');
  console.log(`Wrote ${selected.length} verdict case(s) to ${outPath}`);
}

void main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
