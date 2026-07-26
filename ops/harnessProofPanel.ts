import { projectHarnessProof } from '../src/harnessProofProjection';

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
    'Harness Proof panel',
    '',
    'Usage:',
    '  npx ts-node ops/harnessProofPanel.ts --latest',
    '  npx ts-node ops/harnessProofPanel.ts --ref turn:sha256:<hash>',
    '  npx ts-node ops/harnessProofPanel.ts --trace trace:sha256:<hash>',
    '  npx ts-node ops/harnessProofPanel.ts --spark-home /path/to/.spark',
    '  npx ts-node ops/harnessProofPanel.ts --json',
    '  npx ts-node ops/harnessProofPanel.ts --strict',
    '',
    'Renders one redacted inspect-only proof panel without printing raw trace rows.'
  ].join('\n');
}

function main(): void {
  const args = process.argv.slice(2);
  if (hasFlag(args, 'help')) {
    console.log(usage());
    return;
  }
  const proofRef = argValue(args, 'ref');
  const traceRef = argValue(args, 'trace');
  const projection = projectHarnessProof({
    sparkHome: argValue(args, 'spark-home') || undefined,
    proofRef: proofRef || undefined,
    traceRef: traceRef || undefined
  });
  if (hasFlag(args, 'json')) {
    console.log(JSON.stringify(projection, null, 2));
  } else {
    console.log(projection.panel);
  }
  if (!projection.ok && hasFlag(args, 'strict')) {
    process.exitCode = 1;
  }
}

try {
  main();
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}
