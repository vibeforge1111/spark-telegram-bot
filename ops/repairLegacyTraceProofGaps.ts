import {
  repairLegacyTraceProofGaps,
  type LegacyTraceProofPlane
} from '../src/legacyTraceProofRepair';

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
    'Repair Builder/Spawner legacy trace proof gaps',
    '',
    'Usage:',
    '  npm run control:proof:repair:legacy -- --plane builder_gateway --dry-run --json',
    '  npm run control:proof:repair:legacy -- --plane spawner_prd_trace',
    '  npm run control:proof:repair:legacy -- --plane builder_gateway --audit /path/gateway-trace.jsonl',
    '',
    'Adds compact legacy proof-gap capsules to historical Builder/Spawner rows that already have redacted proof refs, without promoting them to fresh authority.'
  ].join('\n');
}

function parsePlane(value: string | null): LegacyTraceProofPlane {
  if (value === 'builder_gateway' || value === 'spawner_prd_trace') return value;
  throw new Error('Missing or invalid --plane. Use builder_gateway or spawner_prd_trace.');
}

function main(): void {
  const args = process.argv.slice(2);
  if (hasFlag(args, 'help')) {
    console.log(usage());
    return;
  }
  const result = repairLegacyTraceProofGaps({
    plane: parsePlane(argValue(args, 'plane')),
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
    'Legacy trace proof-gap repair',
    `Plane: ${result.plane}`,
    `Rows read: ${result.rowsRead}`,
    `Rows written: ${result.rowsWritten}`,
    `Parse errors: ${result.parseErrors}`,
    `Legacy gap capsules added: ${result.legacyGapCapsulesAdded}`,
    `Already had capsule: ${result.alreadyHadCapsule}`,
    `Not legacy gap: ${result.notLegacyGap}`,
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
