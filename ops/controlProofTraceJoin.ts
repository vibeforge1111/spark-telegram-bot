import {
  auditControlProofTraceJoins,
  formatControlProofTraceJoinReport
} from '../src/controlProofTraceJoin';

function argValue(args: string[], name: string): string | null {
  const index = args.indexOf(`--${name}`);
  return index === -1 ? null : args[index + 1] || null;
}

function hasFlag(args: string[], name: string): boolean {
  return args.includes(`--${name}`);
}

function usage(): string {
  return [
    'Control-proof trace join checker',
    '',
    'Usage:',
    '  npx ts-node ops/controlProofTraceJoin.ts',
    '  npx ts-node ops/controlProofTraceJoin.ts --json',
    '  npx ts-node ops/controlProofTraceJoin.ts --strict',
    '  npx ts-node ops/controlProofTraceJoin.ts --sample 100',
    '  npx ts-node ops/controlProofTraceJoin.ts --strict --require-live-evidence --min-route-rows 4',
    '  npx ts-node ops/controlProofTraceJoin.ts --natural-route-ledger /path/routes.jsonl',
    '',
    'Checks user intent -> route decision -> action/no-action -> reply joins using redacted request, trace, and proof refs.'
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
  const minRouteRowsRaw = argValue(args, 'min-route-rows');
  const minRouteRows = minRouteRowsRaw ? Number(minRouteRowsRaw) : undefined;
  if (minRouteRowsRaw && (!Number.isFinite(minRouteRows) || Number(minRouteRows) <= 0)) {
    throw new Error(`Invalid --min-route-rows value: ${minRouteRowsRaw}`);
  }
  const result = auditControlProofTraceJoins({
    sparkHome: argValue(args, 'spark-home') || undefined,
    naturalRouteLedger: argValue(args, 'natural-route-ledger') || undefined,
    finalAnswerAudit: argValue(args, 'final-answer-audit') || undefined,
    outboundAudit: argValue(args, 'outbound-audit') || undefined,
    sampleSize: sampleSize ? Math.trunc(sampleSize) : undefined,
    requireLiveEvidence: hasFlag(args, 'require-live-evidence'),
    minRouteRows: minRouteRows ? Math.trunc(minRouteRows) : undefined
  });
  if (hasFlag(args, 'json')) {
    console.log(JSON.stringify(result, null, 2));
  } else {
    console.log(formatControlProofTraceJoinReport(result).trimEnd());
  }
  if (hasFlag(args, 'strict') && !result.ok) {
    process.exitCode = 1;
  }
}

try {
  main();
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}
