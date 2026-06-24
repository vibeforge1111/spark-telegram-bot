import {
  CONTROL_PROOF_CANARY_TARGET,
  CONTROL_PROOF_LIVE_CANARY_CASES,
  buildControlProofCanaryObservationTemplate,
  formatControlProofCanaryObservationSummary,
  formatControlProofCanaryChecklist,
  formatControlProofCanaryCopyPaste,
  recordControlProofCanaryObservation,
  selectControlProofCanaryCases,
  summarizeControlProofCanaryObservations,
  withControlProofCanaryRuntimeEvidence,
  type ControlProofCanaryObservationUpdate,
  type ControlProofCanaryVerdict
} from '../src/controlProofLiveCanaryPack';
import { readFileSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { homedir } from 'node:os';

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
    '  npm run control:proof:canaries -- --observation-template --collect-runtime-evidence --out outputs/live-canary-observations.json',
    '  npm run control:proof:canaries -- --observations outputs/live-canaries.json',
    '  npm run control:proof:canaries -- --observations outputs/live-canaries.json --record-case cp-builder-001 --verdict pass --reply-file /tmp/reply.txt --mission-started false --proof-join "Builder joined" --proof-panel "Harness Proof" --screenshot-ref /tmp/case.png --user-confirmation "confirmed"',
    '  npm run control:proof:canaries -- --case cp-builder-001 --checklist',
    '  npm run control:proof:canaries -- --cases cp-builder-001,cp-proof-001 --copy-paste',
    '  npm run control:proof:canaries -- --category streaming --list',
    '  npm run control:proof:canaries -- --include-actions --checklist',
    '',
    'Default selection excludes intentional live actions. Explicit --case/--cases can select them.'
  ].join('\n');
}

function readTextArg(args: string[], name: string): string | undefined {
  const inline = argValue(args, name);
  if (inline !== null) return inline;
  const filePath = argValue(args, `${name}-file`);
  if (filePath !== null) return readFileSync(filePath, 'utf8');
  return undefined;
}

function optionalBooleanArg(args: string[], name: string): boolean | null | undefined {
  const value = argValue(args, name);
  if (value === null) return undefined;
  if (/^(true|yes|1)$/i.test(value)) return true;
  if (/^(false|no|0)$/i.test(value)) return false;
  if (/^(null|unknown|n\/a)$/i.test(value)) return null;
  throw new Error(`Invalid boolean for --${name}: ${value}`);
}

function observationUpdateFromArgs(args: string[]): ControlProofCanaryObservationUpdate {
  const id = argValue(args, 'record-case');
  if (!id) throw new Error('--record-case requires a case id.');
  const verdict = argValue(args, 'verdict');
  const sideEffects = {
    filesChanged: optionalBooleanArg(args, 'files-changed'),
    memoryWritten: optionalBooleanArg(args, 'memory-written'),
    missionStarted: optionalBooleanArg(args, 'mission-started'),
    externalNetworkCalled: optionalBooleanArg(args, 'external-network-called'),
    accessChanged: optionalBooleanArg(args, 'access-changed'),
    providerChanged: optionalBooleanArg(args, 'provider-changed'),
    mediaHandled: optionalBooleanArg(args, 'media-handled'),
    notes: readTextArg(args, 'side-effects-notes')
  };
  return {
    id,
    verdict: verdict ? verdict as ControlProofCanaryVerdict : undefined,
    reply: readTextArg(args, 'reply'),
    proofJoin: readTextArg(args, 'proof-join'),
    proofPanel: readTextArg(args, 'proof-panel'),
    screenshotRefs: argValue(args, 'screenshot-ref') !== null ? argList(args, 'screenshot-ref') : undefined,
    userConfirmation: readTextArg(args, 'user-confirmation'),
    notes: readTextArg(args, 'notes'),
    sideEffects: Object.fromEntries(Object.entries(sideEffects).filter(([, value]) => value !== undefined))
  };
}

function collectRuntimeEvidence(): ReturnType<typeof collectRuntimeEvidenceFromCommands> {
  return collectRuntimeEvidenceFromCommands([
    ['spark_live_status', 'spark', ['live', 'status']],
    ['provider_status', 'spark', ['providers', 'test', '--role', 'chat']],
    ['runtime_sync', 'npm', ['run', 'sync:check']],
    ['control_proof_audit', 'npm', ['run', 'control:proof:audit', '--', '--sample', '100']]
  ]);
}

function collectRuntimeEvidenceFromCommands(commands: [string, string, string[]][]) {
  const byLabel = new Map<string, string>();
  for (const [label, command, args] of commands) {
    const result = spawnSync(command, args, {
      cwd: process.cwd(),
      encoding: 'utf8',
      maxBuffer: 1024 * 1024,
      timeout: 30_000
    });
    byLabel.set(label, summarizeCommandResult(command, args, result.status, result.stdout, result.stderr, result.error));
  }
  return {
    sparkLiveStatus: byLabel.get('spark_live_status') || null,
    providerStatus: byLabel.get('provider_status') || null,
    runtimeSync: byLabel.get('runtime_sync') || null,
    controlProofAudit: byLabel.get('control_proof_audit') || null,
    notes: 'Collected locally by control-proof canary CLI before live Telegram observation.'
  };
}

function summarizeCommandResult(
  command: string,
  args: string[],
  status: number | null,
  stdout: string,
  stderr: string,
  error?: Error
): string {
  const output = [stdout, stderr, error ? error.message : '']
    .join('\n')
    .replaceAll(homedir(), '<home>')
    .replace(/\b\d{8,}\b/g, '<redacted-number>')
    .replace(/\b[A-Za-z0-9_-]{32,}\b/g, '<redacted-token>')
    .replace(/\s+\n/g, '\n')
    .trim();
  const snippet = output.length > 2400
    ? `${output.slice(0, 1200)}\n...\n${output.slice(-1200)}`
    : output;
  return [
    `$ ${command} ${args.join(' ')}`,
    `exit=${status === null ? 'unknown' : status}`,
    snippet || '<no output>'
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
    let observations = JSON.parse(readFileSync(observationsPath, 'utf8'));
    const recordCaseId = argValue(args, 'record-case');
    if (recordCaseId) {
      observations = recordControlProofCanaryObservation(observations, observationUpdateFromArgs(args));
      const outputPath = outPath || observationsPath;
      writeFileSync(outputPath, `${JSON.stringify(observations, null, 2)}\n`, 'utf8');
      console.log(`Recorded control-proof observation for ${recordCaseId}: ${outputPath}`);
    }
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
    const template = buildControlProofCanaryObservationTemplate(selected);
    const withEvidence = hasFlag(args, 'collect-runtime-evidence')
      ? withControlProofCanaryRuntimeEvidence(template, collectRuntimeEvidence())
      : template;
    const output = JSON.stringify(withEvidence, null, 2);
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
