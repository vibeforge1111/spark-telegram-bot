import {
  repairFinalAnswerTraceAudit
} from '../src/finalAnswerTraceRepair';

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
    'Repair Telegram final-answer trace continuity',
    '',
    'Usage:',
    '  npm run control:proof:repair:final-answer -- --dry-run --json',
    '  npm run control:proof:repair:final-answer',
    '  npm run control:proof:repair:final-answer -- --spark-home /path/to/.spark',
    '  npm run control:proof:repair:final-answer -- --final-answer /path/final-answer-gate-audit.jsonl',
    '',
    'Backfills command-reply delivery proof from existing request/trace context and marks contextless suppressed Builder rows as non-execution proof.'
  ].join('\n');
}

function main(): void {
  const args = process.argv.slice(2);
  if (hasFlag(args, 'help')) {
    console.log(usage());
    return;
  }
  const result = repairFinalAnswerTraceAudit({
    sparkHome: argValue(args, 'spark-home') || undefined,
    finalAnswerPath: argValue(args, 'final-answer') || undefined,
    dryRun: hasFlag(args, 'dry-run'),
    backup: !hasFlag(args, 'no-backup')
  });
  if (hasFlag(args, 'json')) {
    console.log(JSON.stringify(result, null, 2));
    return;
  }
  console.log([
    'Telegram final-answer trace repair',
    `Rows read: ${result.rowsRead}`,
    `Rows written: ${result.rowsWritten}`,
    `Parse errors: ${result.parseErrors}`,
    `Suppressed non-execution marked: ${result.suppressedNonExecutionMarked}`,
    `Delivery proof backfilled: ${result.deliveryProofBackfilled}`,
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
