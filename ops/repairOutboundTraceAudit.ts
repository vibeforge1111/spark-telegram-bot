import {
  repairOutboundTraceAudit
} from '../src/outboundTraceRepair';

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
    'Repair Telegram outbound trace continuity',
    '',
    'Usage:',
    '  npm run control:proof:repair:outbound -- --dry-run --json',
    '  npm run control:proof:repair:outbound',
    '  npm run control:proof:repair:outbound -- --spark-home /path/to/.spark',
    '  npm run control:proof:repair:outbound -- --outbound /path/node-outbound-audit.jsonl --final-answer /path/final-answer-gate-audit.jsonl',
    '',
    'Joins outbound delivery rows to final-answer proof by request/trace keys, and marks contextless historical deliveries as not execution proof.'
  ].join('\n');
}

function main(): void {
  const args = process.argv.slice(2);
  if (hasFlag(args, 'help')) {
    console.log(usage());
    return;
  }
  const result = repairOutboundTraceAudit({
    sparkHome: argValue(args, 'spark-home') || undefined,
    outboundPath: argValue(args, 'outbound') || undefined,
    finalAnswerPath: argValue(args, 'final-answer') || undefined,
    dryRun: hasFlag(args, 'dry-run'),
    backup: !hasFlag(args, 'no-backup')
  });
  if (hasFlag(args, 'json')) {
    console.log(JSON.stringify(result, null, 2));
    return;
  }
  console.log([
    'Telegram outbound trace repair',
    `Rows read: ${result.rowsRead}`,
    `Rows written: ${result.rowsWritten}`,
    `Parse errors: ${result.parseErrors}`,
    `Final-answer rows read: ${result.finalAnswerRowsRead}`,
    `Proof joined: ${result.proofJoined}`,
    `Delivery-local marked: ${result.deliveryLocalMarked}`,
    `Proof gaps marked: ${result.proofGapMarked}`,
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
