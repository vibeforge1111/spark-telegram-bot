import {
  auditControlProofTraceContinuity,
  formatControlProofTraceAuditReport
} from '../src/controlProofTraceAudit';

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
    'Control-proof trace continuity audit',
    '',
    'Usage:',
    '  npx ts-node ops/controlProofTraceAudit.ts',
    '  npx ts-node ops/controlProofTraceAudit.ts --json',
    '  npx ts-node ops/controlProofTraceAudit.ts --sample 100',
    '  npx ts-node ops/controlProofTraceAudit.ts --spark-home /path/to/.spark',
    '  npx ts-node ops/controlProofTraceAudit.ts --strict',
    '  npx ts-node ops/controlProofTraceAudit.ts --blocking-strict',
    '  npx ts-node ops/controlProofTraceAudit.ts --fresh-strict',
    '',
    'Summarizes trace join coverage and raw-ref risks without printing raw trace rows.',
    '--strict fails on any visible gap. --blocking-strict allows complete, backed legacy proof gaps but fails silent, partial, or leaking gaps.',
    '--fresh-strict applies blocking-strict checks and also fails when any latest producer row still carries a proof gap marker.'
  ].join('\n');
}

function main(): void {
  const args = process.argv.slice(2);
  if (hasFlag(args, 'help')) {
    console.log(usage());
    return;
  }
  const sampleRaw = argValue(args, 'sample');
  const sampleSize = sampleRaw ? Number(sampleRaw) : undefined;
  if (sampleRaw && (!Number.isFinite(sampleSize) || Number(sampleSize) <= 0)) {
    throw new Error(`Invalid --sample value: ${sampleRaw}`);
  }
  const result = auditControlProofTraceContinuity({
    sparkHome: argValue(args, 'spark-home') || undefined,
    sampleSize: sampleSize ? Math.trunc(sampleSize) : undefined
  });
  if (hasFlag(args, 'json')) {
    console.log(JSON.stringify(result, null, 2));
  } else {
    console.log(formatControlProofTraceAuditReport(result).trimEnd());
  }
  if (!result.ok && hasFlag(args, 'strict')) {
    process.exitCode = 1;
  } else if (!result.blockingOk && hasFlag(args, 'blocking-strict')) {
    process.exitCode = 1;
  } else if (hasFlag(args, 'fresh-strict') && !result.freshStrictOk) {
    process.exitCode = 1;
  }
}

try {
  main();
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}
