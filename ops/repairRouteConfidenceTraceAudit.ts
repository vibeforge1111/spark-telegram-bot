import {
  repairRouteConfidenceTraceAudit
} from '../src/routeConfidenceTraceRepair';

function argValue(args: string[], name: string): string | null {
  const index = args.indexOf(`--${name}`);
  if (index === -1) return null;
  return args[index + 1] || null;
}

function hasFlag(args: string[], name: string): boolean {
  return args.includes(`--${name}`);
}

function usage(): string {
  return [
    'Repair Telegram route-confidence proof continuity',
    '',
    'Usage:',
    '  npm run control:proof:repair:route-confidence -- --dry-run --json',
    '  npm run control:proof:repair:route-confidence',
    '  npm run control:proof:repair:route-confidence -- --spark-home /path/to/.spark',
    '  npm run control:proof:repair:route-confidence -- --audit /path/route-confidence-audit.jsonl',
    '',
    'Adds legacy authority-gap proof capsules to historical route-confidence rows that predate Harness proof metadata.'
  ].join('\n');
}

function main(): void {
  const args = process.argv.slice(2);
  if (hasFlag(args, 'help')) {
    console.log(usage());
    return;
  }
  const result = repairRouteConfidenceTraceAudit({
    sparkHome: argValue(args, 'spark-home') || undefined,
    auditPath: argValue(args, 'audit') || undefined,
    dryRun: hasFlag(args, 'dry-run'),
    backup: !hasFlag(args, 'no-backup')
  });
  if (hasFlag(args, 'json')) {
    console.log(JSON.stringify(result, null, 2));
    return;
  }
  console.log([
    'Telegram route-confidence trace repair',
    `Rows read: ${result.rowsRead}`,
    `Rows written: ${result.rowsWritten}`,
    `Parse errors: ${result.parseErrors}`,
    `Legacy gap capsules added: ${result.legacyGapCapsulesAdded}`,
    `Already had proof: ${result.alreadyHadProof}`,
    `Changed rows: ${result.changedRows}`,
    `Backup: ${result.backupPath || (result.dryRun ? 'dry-run' : 'none')}`
  ].join('\n'));
}

try {
  main();
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}
