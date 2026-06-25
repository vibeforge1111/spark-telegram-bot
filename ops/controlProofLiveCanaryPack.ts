import {
  CONTROL_PROOF_CANARY_TARGET,
  CONTROL_PROOF_LIVE_CANARY_CASES,
  buildControlProofCanaryObservationTemplate,
  formatControlProofCanaryObservationSummary,
  formatControlProofCanaryChecklist,
  formatControlProofCanaryCoverage,
  formatControlProofCanaryCopyPaste,
  formatControlProofCanaryLiveRunGuide,
  recordControlProofCanaryObservation,
  selectControlProofCanaryCases,
  summarizeControlProofCanaryCoverage,
  summarizeControlProofCanaryObservations,
  withControlProofCanaryRuntimeEvidence,
  type ControlProofCanaryObservationUpdate,
  type ControlProofCanaryMutationClass,
  type ControlProofCanaryVerdict
} from '../src/controlProofLiveCanaryPack';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { homedir } from 'node:os';
import { join } from 'node:path';

function argValue(args: string[], name: string): string | null {
  const index = args.indexOf(`--${name}`);
  if (index === -1) return null;
  return args[index + 1] || null;
}

function hasFlag(args: string[], name: string): boolean {
  return args.includes(`--${name}`);
}

function argList(args: string[], name: string): string[] {
  const values: string[] = [];
  for (let index = 0; index < args.length; index += 1) {
    if (args[index] === `--${name}` && args[index + 1]) values.push(args[index + 1]);
  }
  return values.flatMap((value) => value.split(',').map((entry) => entry.trim()).filter(Boolean));
}

function usage(): string {
  return [
    `${CONTROL_PROOF_CANARY_TARGET} control-proof canary pack`,
    '',
    'Usage:',
    '  npm run control:proof:canaries -- --list',
    '  npm run control:proof:canaries -- --copy-paste',
    '  npm run control:proof:canaries -- --checklist',
    '  npm run control:proof:canaries -- --coverage',
    '  npm run control:proof:canaries -- --include-actions --coverage --coverage-strict',
    '  npm run control:proof:canaries -- --run-guide --observations outputs/live-canary-observations.json --summary-out outputs/live-canary-summary.md --summary-json-out outputs/live-canary-summary.json',
    '  npm run control:proof:canaries -- --include-actions --release-bundle --out-dir outputs/live-canary --collect-runtime-evidence',
    '  npm run control:proof:canaries -- --json',
    '  npm run control:proof:canaries -- --observation-template',
    '  npm run control:proof:canaries -- --observation-template --out outputs/live-canary-observations.json',
    '  npm run control:proof:canaries -- --observation-template --collect-runtime-evidence --out outputs/live-canary-observations.json',
    '  npm run control:proof:canaries -- --observations outputs/live-canaries.json',
    '  npm run control:proof:canaries -- --observations outputs/live-canaries.json --refresh-runtime-evidence',
    '  npm run control:proof:canaries -- --observations outputs/live-canaries.json --release-check',
    '  npm run control:proof:canaries -- --observations outputs/live-canaries.json --stale-proof-run-guide',
    '  npm run control:proof:canaries -- --observations outputs/live-canaries.json --record-case cp-builder-001 --verdict pass --reply-file /tmp/reply.txt --mission-started false --no-other-side-effects --proof-join "Builder joined" --proof-panel "Harness Proof" --screenshot-ref /tmp/case.png --user-confirmation "confirmed"',
    '  npm run control:proof:canaries -- --observations outputs/live-canaries.json --summary-out outputs/live-canary-summary.md --summary-json-out outputs/live-canary-summary.json',
    '  npm run control:proof:canaries -- --case cp-builder-001 --checklist',
    '  npm run control:proof:canaries -- --cases cp-builder-001,cp-proof-001 --copy-paste',
    '  npm run control:proof:canaries -- --category streaming --list',
    '  npm run control:proof:canaries -- --include-actions --checklist',
    '',
    'Default selection excludes intentional live actions. Explicit --case/--cases can select them.'
  ].join('\n');
}

function serializeControlProofCanarySummaryJson(
  summary: ReturnType<typeof summarizeControlProofCanaryObservations>,
  coverage: ReturnType<typeof summarizeControlProofCanaryCoverage>
): string {
  return `${JSON.stringify({
    summary,
    coverage: {
      ...coverage,
      categoryCounts: Object.fromEntries(coverage.categoryCounts),
      riskCounts: Object.fromEntries(coverage.riskCounts),
      mutationCounts: Object.fromEntries(coverage.mutationCounts),
      authorityCounts: Object.fromEntries(coverage.authorityCounts)
    }
  }, null, 2)}\n`;
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

type ControlProofSideEffectFlagName =
  | 'files-changed'
  | 'memory-written'
  | 'mission-started'
  | 'external-network-called'
  | 'access-changed'
  | 'provider-changed'
  | 'media-handled';

const CONTROL_PROOF_SIDE_EFFECT_FLAGS: ControlProofSideEffectFlagName[] = [
  'files-changed',
  'memory-written',
  'mission-started',
  'external-network-called',
  'access-changed',
  'provider-changed',
  'media-handled'
];

const STALE_PROOF_STARTER_CASE_IDS = ['cp-builder-001', 'cp-proof-001', 'cp-streaming-001', 'cp-streaming-002'];

function sideEffectFlagForMutationClass(mutationClass: ControlProofCanaryMutationClass): ControlProofSideEffectFlagName | null {
  if (mutationClass === 'writes_files') return 'files-changed';
  if (mutationClass === 'writes_memory') return 'memory-written';
  if (mutationClass === 'launches_mission') return 'mission-started';
  if (mutationClass === 'external_network') return 'external-network-called';
  if (mutationClass === 'updates_access_setting') return 'access-changed';
  if (mutationClass === 'switches_provider') return 'provider-changed';
  if (mutationClass === 'media_read') return 'media-handled';
  return null;
}

function observationUpdateFromArgs(args: string[]): ControlProofCanaryObservationUpdate {
  const id = argValue(args, 'record-case');
  if (!id) throw new Error('--record-case requires a case id.');
  const canary = CONTROL_PROOF_LIVE_CANARY_CASES.find((entry) => entry.id === id);
  if (!canary) throw new Error(`Unknown control-proof canary id: ${id}`);
  const verdict = argValue(args, 'verdict');
  const screenshotRefs = argList(args, 'screenshot-ref');
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
  if (hasFlag(args, 'no-other-side-effects')) {
    const expectedFlag = sideEffectFlagForMutationClass(canary.expectedMutationClass);
    for (const flag of CONTROL_PROOF_SIDE_EFFECT_FLAGS) {
      if (flag !== expectedFlag && optionalBooleanArg(args, flag) === undefined) {
        const key = flag.replace(/-([a-z])/g, (_, char: string) => char.toUpperCase()) as keyof typeof sideEffects;
        sideEffects[key] = false as never;
      }
    }
  }
  return {
    id,
    verdict: verdict ? verdict as ControlProofCanaryVerdict : undefined,
    reply: readTextArg(args, 'reply'),
    proofJoin: readTextArg(args, 'proof-join'),
    proofPanel: readTextArg(args, 'proof-panel'),
    screenshotRefs: screenshotRefs.length > 0 ? screenshotRefs : undefined,
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
    ['spark_os_compile', 'spark', ['os', 'compile', '--json']],
    ['control_proof_audit', 'npm', ['run', 'control:proof:audit', '--', '--sample', '100', '--fresh-strict']]
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
    byLabel.set(label, summarizeCommandResult(label, command, args, result.status, result.stdout, result.stderr, result.error));
  }
  return {
    collectedAt: new Date().toISOString(),
    sparkLiveStatus: byLabel.get('spark_live_status') || null,
    providerStatus: byLabel.get('provider_status') || null,
    runtimeSync: byLabel.get('runtime_sync') || null,
    sparkOsCompile: byLabel.get('spark_os_compile') || null,
    controlProofAudit: byLabel.get('control_proof_audit') || null,
    notes: 'Collected locally by control-proof canary CLI. Refresh after Spark restarts or proof-audit changes.'
  };
}

function summarizeCommandResult(
  label: string,
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
    .replace(/\/var\/folders\/[^\s)]+/g, '<tmp>')
    .replace(/\b([A-Za-z0-9_-]+)@\d{3,6}\b/g, '$1@<redacted-port>')
    .replace(/\bpid=\d+\b/gi, 'pid=<redacted-pid>')
    .replace(/\b(?:https?:\/\/)?(?:127\.0\.0\.1|localhost):\d{2,6}\b/g, '<local-url>')
    .replace(/\b\d{8,}\b/g, '<redacted-number>')
    .replace(/\b[A-Za-z0-9_-]{32,}\b/g, '<redacted-token>')
    .replace(/\s+\n/g, '\n')
    .trim();
  const maxOutputLength = label === 'control_proof_audit' || label === 'spark_os_compile' ? 24_000 : 2400;
  const snippet = output.length > maxOutputLength
    ? `${output.slice(0, 1200)}\n...\n${output.slice(-1200)}`
    : output;
  return [
    `$ ${command} ${args.join(' ')}`,
    `exit=${status === null ? 'unknown' : status}`,
    snippet || '<no output>'
  ].join('\n');
}

function writeReleaseBundle(
  cases: typeof CONTROL_PROOF_LIVE_CANARY_CASES,
  outDir: string,
  collectEvidence: boolean
): void {
  mkdirSync(outDir, { recursive: true });
  const observationsPath = join(outDir, 'live-canary-observations.json');
  const runGuidePath = join(outDir, 'live-canary-run-guide.md');
  const copyPastePath = join(outDir, 'live-canary-copy-paste.md');
  const checklistPath = join(outDir, 'live-canary-checklist.md');
  const coveragePath = join(outDir, 'live-canary-coverage.md');
  const summaryPath = join(outDir, 'live-canary-summary.md');
  const summaryJsonPath = join(outDir, 'live-canary-summary.json');
  const readmePath = join(outDir, 'README.md');
  const template = buildControlProofCanaryObservationTemplate(cases);
  const observations = collectEvidence
    ? withControlProofCanaryRuntimeEvidence(template, collectRuntimeEvidence())
    : template;
  const summary = summarizeControlProofCanaryObservations(observations);
  const coverage = summarizeControlProofCanaryCoverage(cases);

  writeFileSync(observationsPath, `${JSON.stringify(observations, null, 2)}\n`, 'utf8');
  writeFileSync(runGuidePath, `${formatControlProofCanaryLiveRunGuide(cases, { observationsPath, summaryPath, summaryJsonPath })}\n`, 'utf8');
  writeFileSync(copyPastePath, `${formatControlProofCanaryCopyPaste(cases)}\n`, 'utf8');
  writeFileSync(checklistPath, `${formatControlProofCanaryChecklist(cases)}\n`, 'utf8');
  writeFileSync(coveragePath, `${formatControlProofCanaryCoverage(cases)}\n`, 'utf8');
  writeFileSync(summaryPath, formatControlProofCanaryObservationSummary(summary), 'utf8');
  writeFileSync(summaryJsonPath, serializeControlProofCanarySummaryJson(summary, coverage), 'utf8');
  writeFileSync(readmePath, formatReleaseBundleReadme({
    observationsPath,
    runGuidePath,
    copyPastePath,
    checklistPath,
    coveragePath,
    summaryPath,
    summaryJsonPath,
    fullReleasePack: coverage.releasePackComplete
  }), 'utf8');

  console.log([
    `Wrote control-proof live canary bundle: ${outDir}`,
    `- README: ${readmePath}`,
    `- observations: ${observationsPath}`,
    `- run guide: ${runGuidePath}`,
    `- copy-paste prompts: ${copyPastePath}`,
    `- checklist: ${checklistPath}`,
    `- coverage: ${coveragePath}`,
    `- summary: ${summaryPath}`,
    `- summary JSON: ${summaryJsonPath}`,
    `Release gate: ${summary.readyForRelease ? 'ready' : 'not ready'}`
  ].join('\n'));
}

function formatReleaseBundleReadme(paths: {
  observationsPath: string;
  runGuidePath: string;
  copyPastePath: string;
  checklistPath: string;
  coveragePath: string;
  summaryPath: string;
  summaryJsonPath: string;
  fullReleasePack: boolean;
}): string {
  const checkFlag = paths.fullReleasePack ? '--release-check' : '--strict';
  const checkName = paths.fullReleasePack ? 'release check' : 'selected-case strict check';
  const readinessRule = paths.fullReleasePack
    ? 'The release gate is ready only when the release check reports every selected case as pass with required captures present, required category coverage is complete, and the full release pack is present.'
    : 'This selected-case gate is ready when every case in this bundle passed with required captures present and top-level runtime evidence is clean. It is not the full release gate until the complete canary pack is run.';
  return [
    '# SparkRecursive_bot Control-Proof Live Canary Bundle',
    '',
    'This folder is the live Telegram release packet. It starts not ready until each selected case has a recorded verdict and required captures.',
    '',
    '## Files',
    '',
    `- Observation packet: ${paths.observationsPath}`,
    `- Run guide: ${paths.runGuidePath}`,
    `- Copy-paste prompts: ${paths.copyPastePath}`,
    `- Checklist: ${paths.checklistPath}`,
    `- Coverage: ${paths.coveragePath}`,
    `- Current summary: ${paths.summaryPath}`,
    `- Current summary JSON: ${paths.summaryJsonPath}`,
    '',
    '## Run Order',
    '',
    '1. Open the run guide and copy only the Telegram prompt blocks into SparkRecursive_bot.',
    '2. Capture the reply, screenshot path, proof panel text, side effects, and user confirmation for each case.',
    '3. Run the matching `--record-case` command from the run guide after each prompt. The command refreshes the current summaries.',
    `4. Re-run the ${checkName}:`,
    '',
    '```bash',
    `npm run control:proof:canaries -- --observations '${paths.observationsPath.replace(/'/g, `'\\''`)}' ${checkFlag}`,
    '```',
    '',
    readinessRule,
    '',
    '## Side-Effect Proof',
    '',
    'For no-action and read-only cases, record the prompted side-effect flag as `false` when no mutation occurred. Notes alone are not enough.',
    '',
    'For action cases, the run guide includes `--no-other-side-effects`. Keep it in the record command unless an unrelated mutation really happened; the flag records every non-expected side effect as `false` so the packet proves the action did not smuggle a mission, file write, provider switch, memory write, network call, or media handling.',
    '',
    'If an unrelated side effect did happen, remove `--no-other-side-effects`, record the actual true flag, and mark the case `fail` or `needs-retest` with a short note.',
    ''
  ].join('\n');
}

function canaryCasesFromObservations(observations: { cases?: Array<{ id?: string }> }) {
  const byId = new Map(CONTROL_PROOF_LIVE_CANARY_CASES.map((entry) => [entry.id, entry]));
  return (observations.cases || []).map((entry) => {
    const id = entry.id || '';
    const canary = byId.get(id);
    if (!canary) throw new Error(`Unknown observed canary id: ${id}`);
    return canary;
  });
}

function prioritizeStaleProofCaseIds(caseIds: string[]): string[] {
  const seen = new Set<string>();
  return [
    ...STALE_PROOF_STARTER_CASE_IDS,
    ...caseIds
  ].filter((id) => {
    if (!caseIds.includes(id) || seen.has(id)) return false;
    seen.add(id);
    return true;
  });
}

function main(): void {
  const args = process.argv.slice(2);
  if (hasFlag(args, 'help') || args.length === 0) {
    console.log(usage());
    return;
  }
  const outPath = argValue(args, 'out');

  const observationsPath = argValue(args, 'observations');
  if (observationsPath && !hasFlag(args, 'run-guide')) {
    let observations = JSON.parse(readFileSync(observationsPath, 'utf8'));
    const recordCaseId = argValue(args, 'record-case');
    const summaryOutPath = argValue(args, 'summary-out');
    const summaryJsonOutPath = argValue(args, 'summary-json-out');
    const releaseCheck = hasFlag(args, 'release-check');
    const refreshRuntimeEvidence = hasFlag(args, 'refresh-runtime-evidence');
    if (refreshRuntimeEvidence) {
      observations = withControlProofCanaryRuntimeEvidence(observations, collectRuntimeEvidence());
      const outputPath = outPath || observationsPath;
      writeFileSync(outputPath, `${JSON.stringify(observations, null, 2)}\n`, 'utf8');
      console.log(`Refreshed control-proof runtime evidence: ${outputPath}`);
    }
    if (recordCaseId) {
      observations = recordControlProofCanaryObservation(observations, observationUpdateFromArgs(args));
      const outputPath = outPath || observationsPath;
      writeFileSync(outputPath, `${JSON.stringify(observations, null, 2)}\n`, 'utf8');
      console.log(`Recorded control-proof observation for ${recordCaseId}: ${outputPath}`);
    }
    const summary = summarizeControlProofCanaryObservations(observations);
    if (hasFlag(args, 'stale-proof-run-guide')) {
      const staleProofCaseIds = summary.cases
        .filter((entry) => entry.missingCaptures.includes('proof_panel_legacy_gap_stale'))
        .map((entry) => entry.id);
      if (staleProofCaseIds.length === 0) {
        console.log('No stale proof-panel recaptures found.');
      } else {
        const cases = selectControlProofCanaryCases(CONTROL_PROOF_LIVE_CANARY_CASES, {
          caseIds: prioritizeStaleProofCaseIds(staleProofCaseIds),
          includeActions: true
        });
        console.log(formatControlProofCanaryLiveRunGuide(cases, {
          observationsPath,
          summaryPath: summaryOutPath || undefined,
          summaryJsonPath: summaryJsonOutPath || undefined
        }));
      }
      return;
    }
    const coverageRequested = hasFlag(args, 'coverage') || hasFlag(args, 'coverage-strict') || releaseCheck;
    const coverage = coverageRequested
      ? summarizeControlProofCanaryCoverage(canaryCasesFromObservations(observations))
      : null;
    if (summaryOutPath) {
      writeFileSync(summaryOutPath, formatControlProofCanaryObservationSummary(summary), 'utf8');
      console.log(`Wrote control-proof observation summary: ${summaryOutPath}`);
    }
    if (summaryJsonOutPath) {
      const summaryCoverage = coverage || summarizeControlProofCanaryCoverage(canaryCasesFromObservations(observations));
      writeFileSync(summaryJsonOutPath, serializeControlProofCanarySummaryJson(summary, summaryCoverage), 'utf8');
      console.log(`Wrote control-proof observation summary JSON: ${summaryJsonOutPath}`);
    }
    if (hasFlag(args, 'json')) {
      console.log(JSON.stringify(coverage ? { summary, coverage: {
        ...coverage,
        categoryCounts: Object.fromEntries(coverage.categoryCounts),
        riskCounts: Object.fromEntries(coverage.riskCounts),
        mutationCounts: Object.fromEntries(coverage.mutationCounts),
        authorityCounts: Object.fromEntries(coverage.authorityCounts)
      } } : summary, null, 2));
    } else {
      console.log(formatControlProofCanaryObservationSummary(summary).trimEnd());
      if (coverageRequested) {
        console.log('');
        console.log(formatControlProofCanaryCoverage(canaryCasesFromObservations(observations)));
      }
    }
    if (
      (!summary.readyForRelease && (hasFlag(args, 'strict') || releaseCheck))
      || (coverage && (hasFlag(args, 'coverage-strict') || releaseCheck) && !coverage.coverageComplete)
      || (coverage && releaseCheck && !coverage.releasePackComplete)
    ) {
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

  if (hasFlag(args, 'release-bundle')) {
    const outDir = argValue(args, 'out-dir');
    if (!outDir) throw new Error('--release-bundle requires --out-dir.');
    writeReleaseBundle(selected, outDir, hasFlag(args, 'collect-runtime-evidence'));
    return;
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

  if (hasFlag(args, 'coverage')) {
    const coverage = summarizeControlProofCanaryCoverage(selected);
    console.log(formatControlProofCanaryCoverage(selected));
    if (hasFlag(args, 'coverage-strict') && !coverage.coverageComplete) {
      process.exitCode = 1;
    }
    return;
  }

  if (hasFlag(args, 'run-guide')) {
    const runGuide = formatControlProofCanaryLiveRunGuide(selected, {
      observationsPath: observationsPath || undefined,
      summaryPath: argValue(args, 'summary-out') || undefined,
      summaryJsonPath: argValue(args, 'summary-json-out') || undefined
    });
    if (outPath) {
      writeFileSync(outPath, `${runGuide}\n`, 'utf8');
      console.log(`Wrote control-proof run guide: ${outPath}`);
    } else {
      console.log(runGuide);
    }
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

function formatCanaryCliError(error: unknown): string {
  return String(error instanceof Error ? error.message : error)
    .replaceAll(homedir(), '<home>')
    .replaceAll(process.cwd(), '<repo>')
    .replace(/\/var\/folders\/[^\s)]+/g, '<tmp>')
    .replace(/\b[A-Za-z0-9_-]{32,}\b/g, '<redacted-token>');
}

try {
  main();
} catch (error) {
  console.error(`Control-proof canary error: ${formatCanaryCliError(error)}`);
  process.exitCode = 1;
}
