import fs from 'node:fs';
import path from 'node:path';
import {
  appendNaturalRouteExecutionRecord,
  formatNaturalRouteLedgerSummary,
  summarizeNaturalRouteExecutionRecords
} from '../src/naturalRouteLedger';
import {
  createNaturalRouteReplayLedgerRecords,
  formatNaturalRouteReplaySummary,
  parseNaturalRouteReplayCases,
  runNaturalRouteReplayCases
} from '../src/naturalRouteReplay';

interface Args {
  fixturePath: string;
  ledgerPath: string | null;
  profile: string;
}

function readArgValue(args: string[], name: string): string | null {
  const index = args.indexOf(name);
  if (index === -1) return null;
  return args[index + 1] || null;
}

function parseArgs(argv: string[]): Args {
  return {
    fixturePath: path.resolve(
      readArgValue(argv, '--fixture') || path.join(__dirname, '..', 'tests', 'fixtures', 'natural-route-replay-cases.jsonl')
    ),
    ledgerPath: readArgValue(argv, '--ledger'),
    profile: readArgValue(argv, '--profile') || 'local_replay_dry_run'
  };
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  try {
    const cases = parseNaturalRouteReplayCases(fs.readFileSync(args.fixturePath, 'utf8'));
  } catch (error) {
    console.error('readFileSync failed:', error);
    throw error;
  }
  const replay = runNaturalRouteReplayCases(cases);
  const records = createNaturalRouteReplayLedgerRecords(replay, { profile: args.profile });

  console.log(formatNaturalRouteReplaySummary(replay));
  console.log('');
  console.log(formatNaturalRouteLedgerSummary(summarizeNaturalRouteExecutionRecords(records)));

  if (args.ledgerPath) {
    const resolvedLedgerPath = path.resolve(args.ledgerPath);
    for (const record of records) {
      await appendNaturalRouteExecutionRecord(record, resolvedLedgerPath);
    }
    console.log('');
    console.log(`Wrote ${records.length} redacted dry-run ledger records to ${resolvedLedgerPath}`);
  } else {
    console.log('');
    console.log('Dry-run ledger was not written. Pass --ledger <path> to persist redacted records.');
  }

  if (replay.failed > 0) {
    process.exitCode = 1;
  }
}

void main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
