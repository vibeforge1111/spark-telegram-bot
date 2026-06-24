import {
  CONTROL_PROOF_CANARY_TARGET,
  CONTROL_PROOF_LIVE_CANARY_CASES,
  buildControlProofCanaryObservationTemplate,
  formatControlProofCanaryObservationSummary,
  formatControlProofCanaryChecklist,
  formatControlProofCanaryCopyPaste,
  selectControlProofCanaryCases,
  summarizeControlProofCanaryObservations
} from '../src/controlProofLiveCanaryPack';
import { readFileSync, writeFileSync } from 'node:fs';

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

function usage(): string {
  return [
    `${CONTROL_PROOF_CANARY_TARGET} control-proof canary pack`,
    '',
    'Usage:',
    '  npm run control:proof:canaries -- --list',
    '  npm run control:proof:canaries -- --copy-paste',
    '  npm run control:proof:canaries -- --checklist',
    '  npm run control:proof:canaries -- --json',
    '  npm run control:proof:canaries -- --observation-template',
    '  npm run control:proof:canaries -- --observation-template --out outputs/live-canary-observations.json',
    '  npm run control:proof:canaries -- --observations outputs/live-canaries.json',
    '  npm run control:proof:canaries -- --case cp-builder-001 --checklist',
    '  npm run control:proof:canaries -- --cases cp-builder-001,cp-proof-001 --copy-paste',
    '  npm run control:proof:canaries -- --category streaming --list',
    '  npm run control:proof:canaries -- --include-actions --checklist',
    '',
    'Default selection excludes intentional live actions. Explicit --case/--cases can select them.'
  ].join('\n');
}

function main(): void {
  const args = process.argv.slice(2);
  if (hasFlag(args, 'help') || args.length === 0) {
    console.log(usage());
    return;
  }
  const outPath = argValue(args, 'out');

  const observationsPath = argValue(args, 'observations');
  if (observationsPath) {
    const observations = JSON.parse(readFileSync(observationsPath, 'utf8'));
    const summary = summarizeControlProofCanaryObservations(observations);
    if (hasFlag(args, 'json')) {
      console.log(JSON.stringify(summary, null, 2));
    } else {
      console.log(formatControlProofCanaryObservationSummary(summary).trimEnd());
    }
    if (!summary.readyForRelease && hasFlag(args, 'strict')) {
      process.exitCode = 1;
    }
    return;
  }

  const selected = selectControlProofCanaryCases(CONTROL_PROOF_LIVE_CANARY_CASES, {
    caseId: argValue(args, 'case'),
    caseIds: argList(args, 'cases'),
    category: argValue(args, 'category'),
    includeActions: hasFlag(args, 'include-actions')
  });

  if (selected.length === 0) {
    throw new Error('No matching control-proof canary cases.');
  }

  if (hasFlag(args, 'json')) {
    const output = JSON.stringify({ target: CONTROL_PROOF_CANARY_TARGET, cases: selected }, null, 2);
    if (outPath) {
      writeFileSync(outPath, `${output}\n`, 'utf8');
      console.log(`Wrote control-proof canaries: ${outPath}`);
    } else {
      console.log(output);
    }
    return;
  }

  if (hasFlag(args, 'observation-template')) {
    const output = JSON.stringify(buildControlProofCanaryObservationTemplate(selected), null, 2);
    if (outPath) {
      writeFileSync(outPath, `${output}\n`, 'utf8');
      console.log(`Wrote control-proof observation template: ${outPath}`);
    } else {
      console.log(output);
    }
    return;
  }

  if (hasFlag(args, 'copy-paste')) {
    console.log(formatControlProofCanaryCopyPaste(selected));
    return;
  }

  if (hasFlag(args, 'checklist')) {
    console.log(formatControlProofCanaryChecklist(selected));
    return;
  }

  if (hasFlag(args, 'list')) {
    for (const entry of selected) {
      console.log([
        entry.id,
        entry.category,
        entry.risk,
        entry.expectedAuthority,
        entry.expectedMutationClass,
        entry.expectedReplyShape
      ].join('\t'));
    }
    return;
  }

  console.log(usage());
}

try {
  main();
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}
