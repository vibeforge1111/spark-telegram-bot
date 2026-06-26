import {
  CONTROL_PROOF_CANARY_TARGET,
  CONTROL_PROOF_LIVE_CANARY_CASES,
  buildControlProofCanaryObservationTemplate,
  formatControlProofCanaryObservationSummary,
  formatControlProofCanaryChecklist,
  formatControlProofCanaryCoverage,
  formatControlProofCanaryCopyPaste,
  formatControlProofCanaryLiveRunGuide,
  isProofPanelRecaptureIssue,
  recordControlProofCanaryObservation,
  repairStaleProofPanelAuditLines,
  selectControlProofCanaryCases,
  summarizeControlProofAuditRuntimeEvidence,
  summarizeControlProofCanaryCoverage,
  summarizeControlProofCanaryObservations,
  withControlProofCanaryRuntimeEvidence,
  type ControlProofCanaryObservationUpdate,
  type ControlProofCanaryMutationClass,
  type ControlProofCanaryVerdict
} from '../src/controlProofLiveCanaryPack';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { homedir } from 'node:os';
import { basename, dirname, join } from 'node:path';

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
    '  npm run control:proof:canaries -- --observations outputs/live-canary/live-canary-observations.json --refresh-runtime-evidence',
    '  npm run control:proof:canaries -- --observations outputs/live-canaries.json --release-check',
    '  npm run control:proof:canaries -- --observations outputs/live-canaries.json --publish-check',
    '  npm run control:proof:canaries -- --observations outputs/live-canaries.json --summary-frozen-at-collected',
    '  npm run control:proof:canaries -- --observations outputs/live-canaries.json --stale-proof-run-guide',
    '  npm run control:proof:canaries -- --observations outputs/live-canaries.json --repair-stale-proof-panels',
    '  npm run control:proof:canaries -- --observations outputs/live-canaries.json --record-case cp-builder-001 --verdict pass --reply-file /tmp/reply.txt --mission-started false --no-other-side-effects --proof-join "Builder joined" --proof-panel "Harness Proof" --screenshot-file /tmp/case.png --user-confirmation "confirmed"',
    '  npm run control:proof:canaries -- --observations outputs/live-canaries.json --summary-out outputs/live-canary-summary.md --summary-json-out outputs/live-canary-summary.json',
    '  npm run control:proof:canaries -- --case cp-builder-001 --checklist',
    '  npm run control:proof:canaries -- --cases cp-builder-001,cp-proof-001 --copy-paste',
    '  npm run control:proof:canaries -- --category streaming --list',
    '  npm run control:proof:canaries -- --include-actions --checklist',
    '',
    'Default selection excludes intentional live actions. Explicit --case/--cases can select them.',
    '--release-check is the full release gate only when the packet is the complete canary pack; selected-case packets prove selected cases only.',
    '--publish-check additionally requires publish readiness: no release caveats, no handoffs, and fresh full-pack evidence.',
    '--summary-frozen-at-collected is for checked fixture regeneration only; do not use it for live release claims or to bypass --refresh-runtime-evidence.'
  ].join('\n');
}

function serializeControlProofCanarySummaryJson(
  summary: ReturnType<typeof summarizeControlProofCanaryObservations>,
  coverage: ReturnType<typeof summarizeControlProofCanaryCoverage>
): string {
  return `${JSON.stringify(controlProofCanarySummaryJsonPayload(summary, coverage), null, 2)}\n`;
}

function controlProofCanarySummaryJsonPayload(
  summary: ReturnType<typeof summarizeControlProofCanaryObservations>,
  coverage: ReturnType<typeof summarizeControlProofCanaryCoverage>
): Record<string, unknown> {
  return {
    summary: {
      ...summary,
      gateScope: coverage.releasePackComplete ? 'full_release_pack' : 'selected_case_gate'
    },
    coverage: {
      ...coverage,
      gateScope: coverage.releasePackComplete ? 'full_release_pack' : 'selected_case_gate',
      categoryCounts: Object.fromEntries(coverage.categoryCounts),
      riskCounts: Object.fromEntries(coverage.riskCounts),
      mutationCounts: Object.fromEntries(coverage.mutationCounts),
      authorityCounts: Object.fromEntries(coverage.authorityCounts)
    }
  };
}

function inferredBundleSummaryPaths(observationsPath: string): { summaryPath: string; summaryJsonPath: string } | null {
  if (basename(observationsPath) !== 'live-canary-observations.json') return null;
  const baseDir = dirname(observationsPath);
  return {
    summaryPath: join(baseDir, 'live-canary-summary.md'),
    summaryJsonPath: join(baseDir, 'live-canary-summary.json')
  };
}

function readTextArg(args: string[], name: string): string | undefined {
  const inline = argValue(args, name);
  if (inline !== null) return inline;
  const filePath = argValue(args, `${name}-file`);
  if (filePath !== null) return readFileSync(filePath, 'utf8');
  return undefined;
}

function screenshotRefsFromArgs(args: string[]): string[] {
  const explicitRefs = argList(args, 'screenshot-ref');
  const fileRefs = argList(args, 'screenshot-file').map((filePath) => {
    const digest = createHash('sha256').update(readFileSync(filePath)).digest('hex');
    return `screenshot:sha256:${digest}`;
  });
  return [...explicitRefs, ...fileRefs];
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
  const screenshotRefs = screenshotRefsFromArgs(args);
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

type RuntimeEvidenceCommand = {
  label: string;
  command: string;
  args: string[];
  timeoutMs?: number;
};

function collectRuntimeEvidence(): ReturnType<typeof collectRuntimeEvidenceFromCommands> {
  return collectRuntimeEvidenceFromCommands([
    { label: 'spark_live_status', command: 'spark', args: ['live', 'status'] },
    { label: 'provider_status', command: 'spark', args: ['providers', 'test', '--role', 'chat'] },
    { label: 'runtime_sync', command: 'npm', args: ['run', 'sync:check'] },
    { label: 'spark_os_compile', command: 'spark', args: ['os', 'compile', '--json'], timeoutMs: 600_000 },
    {
      label: 'control_proof_audit',
      command: 'npm',
      args: ['run', 'control:proof:audit', '--', '--sample', '100', '--fresh-strict'],
      timeoutMs: 60_000
    },
    {
      label: 'route_confidence_legacy_repair_dry_run',
      command: 'npm',
      args: ['run', 'control:proof:repair:route-confidence', '--', '--dry-run', '--json'],
      timeoutMs: 60_000
    },
    {
      label: 'builder_gateway_legacy_repair_dry_run',
      command: 'npm',
      args: ['run', 'control:proof:repair:legacy', '--', '--plane', 'builder_gateway', '--dry-run', '--json'],
      timeoutMs: 60_000
    },
    {
      label: 'spawner_prd_trace_legacy_repair_dry_run',
      command: 'npm',
      args: ['run', 'control:proof:repair:legacy', '--', '--plane', 'spawner_prd_trace', '--dry-run', '--json'],
      timeoutMs: 60_000
    }
  ]);
}

function collectRuntimeEvidenceFromCommands(commands: RuntimeEvidenceCommand[]) {
  const byLabel = new Map<string, string>();
  const rawStdoutByLabel = new Map<string, string>();
  for (const { label, command, args, timeoutMs = 30_000 } of commands) {
    const startedAt = Date.now();
    console.error(`[runtime-evidence] start ${label}: ${[command, ...args].join(' ')}`);
    const result = spawnSync(command, args, {
      cwd: process.cwd(),
      encoding: 'utf8',
      maxBuffer: 1024 * 1024,
      timeout: timeoutMs
    });
    const elapsedMs = Date.now() - startedAt;
    console.error(`[runtime-evidence] done ${label}: exit=${result.status ?? 'error'} elapsed_ms=${elapsedMs}`);
    rawStdoutByLabel.set(label, result.stdout || '');
    byLabel.set(label, summarizeCommandResult(label, command, args, result.status, result.stdout, result.stderr, result.error));
  }
  const sparkOsCompileStdout = rawStdoutByLabel.get('spark_os_compile') || '';
  const releaseBlockHandoff = releaseBlockHandoffFromSparkOsCompile(sparkOsCompileStdout);
  const duplicateTruthHandoff = duplicateTruthHandoffFromSparkOsCompile(sparkOsCompileStdout);
  const legacyRepairDryRun = legacyRepairDryRunNotes(rawStdoutByLabel);
  const notes = [
    'Collected locally by control-proof canary CLI. Refresh after Spark restarts or proof-audit changes.',
    legacyRepairDryRun,
    releaseBlockHandoff,
    duplicateTruthHandoff
  ].filter(Boolean).join('\n');
  return {
    collectedAt: new Date().toISOString(),
    sparkLiveStatus: byLabel.get('spark_live_status') || null,
    providerStatus: byLabel.get('provider_status') || null,
    runtimeSync: byLabel.get('runtime_sync') || null,
    sparkOsCompile: byLabel.get('spark_os_compile') || null,
    controlProofAudit: byLabel.get('control_proof_audit') || null,
    controlProofAuditSummary: summarizeControlProofAuditRuntimeEvidence(byLabel.get('control_proof_audit') || null),
    notes
  };
}

function legacyRepairDryRunNotes(rawStdoutByLabel: Map<string, string>): string | null {
  const rows = [
    legacyRepairDryRunLine(
      'telegram_route_confidence',
      rawStdoutByLabel.get('route_confidence_legacy_repair_dry_run') || ''
    ),
    legacyRepairDryRunLine(
      'builder_gateway',
      rawStdoutByLabel.get('builder_gateway_legacy_repair_dry_run') || ''
    ),
    legacyRepairDryRunLine(
      'spawner_prd_trace',
      rawStdoutByLabel.get('spawner_prd_trace_legacy_repair_dry_run') || ''
    )
  ].filter((line): line is string => Boolean(line));
  return rows.length ? ['Legacy repair dry-run:', ...rows.map((line) => `- ${line}`)].join('\n') : null;
}

function legacyRepairDryRunLine(plane: string, stdout: string): string | null {
  const parsed = parseLastJsonObject(stdout);
  if (!parsed) return null;
  const changedRows = safeNonNegativeInteger(parsed.changedRows);
  const rowsRead = safeNonNegativeInteger(parsed.rowsRead);
  const parseErrors = safeNonNegativeInteger(parsed.parseErrors);
  const additions = safeNonNegativeInteger(parsed.legacyGapCapsulesAdded);
  if (changedRows === null || rowsRead === null || parseErrors === null || additions === null) return null;
  return `${plane}: changed_rows=${changedRows}; rows_read=${rowsRead}; capsules_added=${additions}; parse_errors=${parseErrors}`;
}

function parseLastJsonObject(stdout: string): Record<string, unknown> | null {
  const text = String(stdout || '').trim();
  const start = text.lastIndexOf('{');
  const end = text.lastIndexOf('}');
  if (start === -1 || end === -1 || end < start) return null;
  try {
    const parsed = JSON.parse(text.slice(start, end + 1));
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? parsed as Record<string, unknown>
      : null;
  } catch {
    return null;
  }
}

function repoBoardFromSparkOsCompile(stdout: string): Record<string, unknown> | null {
  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(stdout) as Record<string, unknown>;
  } catch {
    return null;
  }
  const outputs = parsed.outputs && typeof parsed.outputs === 'object' && !Array.isArray(parsed.outputs)
    ? parsed.outputs as Record<string, unknown>
    : {};
  const repoBoardPath = typeof outputs.repo_board === 'string' ? outputs.repo_board : null;
  if (!repoBoardPath) return null;
  try {
    return JSON.parse(readFileSync(repoBoardPath, 'utf8')) as Record<string, unknown>;
  } catch {
    return null;
  }
}

function releaseBlockHandoffFromSparkOsCompile(stdout: string): string | null {
  const repoBoard = repoBoardFromSparkOsCompile(stdout);
  if (!repoBoard) return null;
  const repos = Array.isArray(repoBoard.repos) ? repoBoard.repos : [];
  const lines = repos
    .map((item) => releaseBlockHandoffLine(item))
    .filter((line): line is string => Boolean(line));
  if (lines.length === 0) return null;
  return ['Repo release-block handoff:', ...lines.map((line) => `- ${line}`)].join('\n');
}

function releaseBlockHandoffLine(item: unknown): string | null {
  if (!item || typeof item !== 'object' || Array.isArray(item)) return null;
  const record = item as Record<string, unknown>;
  if (safeHandoffToken(record.release_eligibility) !== 'blocked') return null;
  const repo = safeRepoNameFromBoardItem(record);
  const reason = safeHandoffText(record.do_not_merge_reason);
  const behind = safeNonNegativeInteger(record.behind);
  const nextSafeAction = safeHandoffText(record.next_safe_action);
  if (!repo) return null;
  return [
    `${repo}: release_blocked repo_release_blocks`,
    reason ? `reason: ${reason}` : null,
    behind !== null ? `behind=${behind}` : null,
    nextSafeAction ? `next safe action: ${nextSafeAction}` : null
  ].filter(Boolean).join('; ');
}

function safeNonNegativeInteger(value: unknown): number | null {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed >= 0 ? parsed : null;
}

function safeRepoNameFromBoardItem(record: Record<string, unknown>): string | null {
  const repo = safeHandoffToken(record.repo);
  if (repo && repo !== 'source') return repo;
  const path = String(record.path || '');
  const moduleMatch = path.match(/\/modules\/([^/]+)\/source$/);
  return safeHandoffToken(moduleMatch?.[1]);
}

function duplicateTruthHandoffFromSparkOsCompile(stdout: string): string | null {
  const repoBoard = repoBoardFromSparkOsCompile(stdout);
  if (!repoBoard) return null;
  const duplicateTruths = repoBoard.duplicate_truths && typeof repoBoard.duplicate_truths === 'object' && !Array.isArray(repoBoard.duplicate_truths)
    ? repoBoard.duplicate_truths as Record<string, unknown>
    : {};
  const items = Array.isArray(duplicateTruths.items) ? duplicateTruths.items : [];
  const lines = items
    .map((item) => duplicateTruthHandoffLine(item))
    .filter((line): line is string => Boolean(line));
  if (lines.length === 0) return null;
  return ['Duplicate-truth handoff:', ...lines.map((line) => `- ${line}`)].join('\n');
}

function duplicateTruthHandoffLine(item: unknown): string | null {
  if (!item || typeof item !== 'object' || Array.isArray(item)) return null;
  const record = item as Record<string, unknown>;
  const ownerRepo = safeHandoffToken(record.owner_repo);
  const severity = safeHandoffToken(record.severity);
  const classification = safeHandoffToken(record.classification);
  const nextSafeAction = safeHandoffText(record.next_safe_action);
  if (!ownerRepo || !severity || !classification) return null;
  return [
    `${ownerRepo}: ${severity} ${classification}`,
    nextSafeAction ? `next safe action: ${nextSafeAction}` : null
  ].filter(Boolean).join('; ');
}

function safeHandoffToken(value: unknown): string | null {
  const text = String(value || '').trim();
  if (!text || !/^[a-z0-9_.-]+$/i.test(text)) return null;
  return text;
}

function safeHandoffText(value: unknown): string | null {
  const text = String(value || '')
    .replaceAll(homedir(), '<home>')
    .replace(/\b[A-Fa-f0-9]{8,}\b/g, '<redacted-ref>')
    .replace(/\b[A-Za-z0-9_-]{32,}\b/g, redactLongToken)
    .replace(/\s+/g, ' ')
    .trim();
  if (!text) return null;
  return text.slice(0, 240);
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
    .replace(/\/var\/folders\/[^\s)"']+/g, '<tmp>')
    .replace(/\b([A-Za-z0-9_-]+)@\d{3,6}\b/g, '$1@<redacted-port>')
    .replace(/\bpid=\d+\b/gi, 'pid=<redacted-pid>')
    .replace(/\b(?:https?:\/\/)?(?:127\.0\.0\.1|localhost):\d{2,6}\b/g, '<local-url>')
    .replace(/\b\d{8,}\b/g, '<redacted-number>')
    .replace(/\b[A-Za-z0-9_-]{32,}\b/g, redactLongToken)
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

const SAFE_LONG_RUNTIME_EVIDENCE_TOKENS = new Set([
  'builder_gateway_trace_legacy_repair',
  'current_unresolved_high_severity_open_count',
  'historical_missing_trace_ref_count',
  'historical_open_high_severity_events',
  'latest_clean_historical_window_debt',
  'latest_clean_historical_window_debt_group_count',
  'latest_clean_window_debt_group_count',
  'latest_unresolved_high_severity_event_created_at',
  'latest_missing_source_group_count',
  'local_runtime_test_artifact',
  'owner_sets',
  'route_confidence_legacy_repair',
  'spawner_prd_trace_legacy_repair',
  'unresolved_high_severity_source_group_count',
  'unresolved_high_severity_open_count',
]);

function redactLongToken(token: string): string {
  return SAFE_LONG_RUNTIME_EVIDENCE_TOKENS.has(token) ? token : '<redacted-token>';
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
  const proofRecaptureGuidePath = join(outDir, 'live-canary-proof-recapture-guide.md');
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
    proofRecaptureGuidePath,
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
  proofRecaptureGuidePath: string;
  fullReleasePack: boolean;
}): string {
  const checkFlag = paths.fullReleasePack ? '--release-check' : '--strict';
  const checkName = paths.fullReleasePack ? 'release check' : 'selected-case strict check';
  const publishCheckCommand = `npm run control:proof:canaries -- --observations '${paths.observationsPath.replace(/'/g, `'\\''`)}' --publish-check`;
  const proofRecaptureCommand = `npm run control:proof:canaries -- --observations '${paths.observationsPath.replace(/'/g, `'\\''`)}' --stale-proof-run-guide --out '${paths.proofRecaptureGuidePath.replace(/'/g, `'\\''`)}'`;
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
    `- Focused proof recapture guide: ${paths.proofRecaptureGuidePath}`,
    '',
    '## Run Order',
    '',
    '1. Open the run guide and copy only the Telegram prompt blocks into SparkRecursive_bot.',
    '2. Capture the reply, local screenshot file, side effects, and user confirmation for each case. Capture proof-panel text only when that case says `Capture proof panel: yes` in the run guide.',
    '3. Run the matching `--record-case` command from the run guide after each prompt. The command refreshes the current summaries and records screenshot files as digest refs.',
    `4. Re-run the ${checkName}:`,
    '',
    '```bash',
    `npm run control:proof:canaries -- --observations '${paths.observationsPath.replace(/'/g, `'\\''`)}' ${checkFlag}`,
    '```',
    '',
    ...(paths.fullReleasePack ? [
      'For publish or registry claims, run the publish check too:',
      '',
      '```bash',
      publishCheckCommand,
      '```',
      '',
    ] : []),
    readinessRule,
    '',
    '`--release-check` treats runtime evidence older than one hour as stale. Refresh runtime evidence immediately before making a release or publish claim.',
    '',
    'If the summary prints `Recapture hint` for stale `/proof` panel captures, generate the focused guide instead of rerunning unrelated cases first:',
    '',
    '```bash',
    proofRecaptureCommand,
    '```',
    '',
    'The focused guide includes only cases whose recorded proof panel is missing required readiness fields, such as `Audit actionable`, `Audit fresh-strict`, `Audit posture`, `Blocking gap planes`, or the derived `Evidence capsule gaps` row; its generated record commands refresh the current summary files.',
    '',
    'The summaries print both `Runtime evidence collected` and `Runtime evidence expires`; the expiry timestamp is the freshness deadline for release claims.',
    '',
    'If `spark os compile --json` is otherwise clean but reports repo release blocks or duplicate-truth drift, the summary stays release-check ready and prints the drift under `Release caveats`. Blocked repo release counts are labeled `repo_release_blocks`; runtime-ahead-of-registry-pin rows are labeled `registry_pin_drift`; explicitly classified local proof runtimes are labeled `local_runtime_test_artifacts`; other duplicate-truth rows are labeled `duplicate_truth_drift`. Treat these as publish/registry handoff items, not as hidden Telegram proof. Unhanded dirty runtime compile evidence still makes the packet not ready; dirty owner repos are acceptable only when they are surfaced as sanitized `repo_release_blocks` handoffs.',
    '',
    'When caveats or handoffs exist, the human summary also prints `Release note: ready with caveats` so the Telegram canary gate cannot be mistaken for publish/registry completion.',
    '',
    'When the observation packet includes release-block or duplicate-truth handoff notes, the markdown and JSON summaries also print `Release handoffs` so the owner repo and next safe action are visible without reading raw system-map artifacts.',
    '',
    'The JSON summary also carries `packetEvidenceDetails` beside the compatibility arrays `missingPacketEvidence`, `invalidPacketEvidence`, and `stalePacketEvidence`. Automation should use the structured detail objects for proof-gap reasons, timestamps, and freshness windows instead of parsing the markdown lines.',
    '',
    'The JSON summary `cases` array carries safe Harness metadata for each canary: `expectedRoute`, `expectedAuthority`, `expectedMutationClass`, `expectedReplyShape`, optional sanitized `sourceRefs`, verdict, and missing capture names. It intentionally omits raw Telegram prompts, observed replies, proof-panel bodies, screenshots, and user confirmations; read the observation packet only when reviewed live evidence is needed.',
    '',
    'The JSON summary carries `controlProofAuditDetails` from the fresh-strict trace audit. Automation should use `controlProofAuditDetails.actionableStatus`, `controlProofAuditDetails.freshStrictOk`, `controlProofAuditDetails.gapPosture`, and `controlProofAuditDetails.legacyGapBackingDetails` to verify each visible historical proof-gap plane has complete backing, no latest gap, `releaseBlocking=false`, matching `proofGapMarked` and plane `proofGap` counts, and a safe repair source/command instead of scraping the raw audit transcript or `Legacy gap backing` prose. Use `legacyRepairDryRunDetails` to confirm the matching dry-runs reported `changedRows=0`, `capsulesAdded=0`, and `parseErrors=0` without scraping runtime notes.',
    '',
    'The JSON summary carries `gateScope` beside the compatibility booleans `readyForRelease` and `readyForPublish`. Automation should read `readyForRelease=true` as full release readiness only when `gateScope=full_release_pack`; `gateScope=selected_case_gate` proves the selected cases only.',
    '',
    'The human coverage report carries `Release-check scope` beside `Full release pack`. Operators should read `Release-check scope: full release readiness` as the full-pack release boundary and `Release-check scope: selected cases only; not a full release claim` as focused confidence only.',
    '',
    'The JSON summary carries `gateDecisionDetails` beside the compatibility booleans `readyForRelease` and `readyForPublish`. Automation should use it to explain gate readiness from structured packet-evidence blockers, failing case ids, release caveat details, handoff details, per-action `handoffActionDetails` with normalized `releaseBlocking`/`publishBlocking` impact, and per-blocker `blockerDetails` joins instead of reconstructing the decision from prose lines. When audit gap families are release-blocking, read `gateDecisionDetails.release.blockerDetails.control_proof_audit_blocking_gaps`; it joins the audit family, backing status, plane labels, and release/publish impact without scraping the raw audit transcript. When publish is blocked by `release_gate_not_ready`, read `gateDecisionDetails.publish.blockerDetails.release_gate_not_ready.releaseBlockerDetails`; it carries the joined release blocker details that made release not ready.',
    '',
    'Refreshing runtime evidence for this standard bundle observation file also refreshes `live-canary-summary.md` and `live-canary-summary.json`.',
    '',
    'For live Telegram visual checks, pass local captures with `--screenshot-file`; the observation packet should keep redacted `screenshot:sha256:<digest>` refs. Keep raw screenshots outside the repo unless the user explicitly asks to preserve the image itself.',
    '',
    'Refreshing runtime evidence also refreshes the packet `generatedAt` timestamp to the strict `evidence.collectedAt` value. A release packet whose generated timestamp predates its runtime evidence, uses loose timestamp prose, or is more than five minutes future-dated is stale metadata and must not be used for release claims.',
    '',
    '## Side-Effect Proof',
    '',
    'Every record command should prove side effects explicitly. For no-action and read-only cases, keep `--no-other-side-effects` in the generated command and record the prompted side-effect flag as `false` when no mutation occurred. Notes alone are not enough.',
    '',
    'For action cases, `--no-other-side-effects` records every non-expected side effect as `false` so the packet proves the action did not smuggle a mission, file write, provider switch, memory write, network call, or media handling.',
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
    let summaryOutPath = argValue(args, 'summary-out');
    let summaryJsonOutPath = argValue(args, 'summary-json-out');
    const releaseCheck = hasFlag(args, 'release-check');
    const publishCheck = hasFlag(args, 'publish-check');
    const refreshRuntimeEvidence = hasFlag(args, 'refresh-runtime-evidence');
    const repairStaleProofPanels = hasFlag(args, 'repair-stale-proof-panels');
    const summaryFrozenAtCollected = hasFlag(args, 'summary-frozen-at-collected');
    const inferredSummaryPaths = inferredBundleSummaryPaths(observationsPath);
    if (inferredSummaryPaths) {
      summaryOutPath ||= inferredSummaryPaths.summaryPath;
      summaryJsonOutPath ||= inferredSummaryPaths.summaryJsonPath;
    }
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
    if (repairStaleProofPanels) {
      const result = repairStaleProofPanelAuditLines(observations);
      observations = result.observations;
      const outputPath = outPath || observationsPath;
      writeFileSync(outputPath, `${JSON.stringify(observations, null, 2)}\n`, 'utf8');
      console.log([
        `Repaired stale proof-panel audit lines: ${outputPath}`,
        `Changed cases: ${result.changedCases.length ? result.changedCases.join(', ') : 'none'}`
      ].join('\n'));
    }
    const strictFreshSummary = releaseCheck || publishCheck || refreshRuntimeEvidence || Boolean(recordCaseId) || repairStaleProofPanels || summaryFrozenAtCollected;
    const summary = summarizeControlProofCanaryObservations(
      observations,
      {
        ...(strictFreshSummary ? { maxRuntimeEvidenceAgeHours: 1 } : {}),
        ...(summaryFrozenAtCollected ? { now: observations.evidence?.collectedAt } : {})
      }
    );
    if (hasFlag(args, 'stale-proof-run-guide')) {
      const staleProofCaseIds = summary.cases
        .filter((entry) => entry.missingCaptures.some(isProofPanelRecaptureIssue))
        .map((entry) => entry.id);
      if (staleProofCaseIds.length === 0) {
        console.log('No stale proof-panel recaptures found.');
      } else {
        const cases = selectControlProofCanaryCases(CONTROL_PROOF_LIVE_CANARY_CASES, {
          caseIds: prioritizeStaleProofCaseIds(staleProofCaseIds),
          includeActions: true
        });
        const runGuide = formatControlProofCanaryLiveRunGuide(cases, {
          observationsPath,
          summaryPath: summaryOutPath || undefined,
          summaryJsonPath: summaryJsonOutPath || undefined
        });
        if (outPath) {
          writeFileSync(outPath, `${runGuide}\n`, 'utf8');
          console.log(`Wrote control-proof stale proof run guide: ${outPath}`);
        } else {
          console.log(runGuide);
        }
      }
      return;
    }
    const coverageRequested = hasFlag(args, 'coverage') || hasFlag(args, 'coverage-strict') || releaseCheck || publishCheck;
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
      if (coverage) {
        console.log(JSON.stringify(controlProofCanarySummaryJsonPayload(summary, coverage), null, 2));
      } else {
        console.log(JSON.stringify(summary, null, 2));
      }
    } else {
      console.log(formatControlProofCanaryObservationSummary(summary).trimEnd());
      if (coverageRequested) {
        console.log('');
        console.log(formatControlProofCanaryCoverage(canaryCasesFromObservations(observations)));
      }
    }
    if (
      (!summary.readyForRelease && (hasFlag(args, 'strict') || releaseCheck))
      || (!summary.readyForPublish && publishCheck)
      || (coverage && (hasFlag(args, 'coverage-strict') || releaseCheck) && !coverage.coverageComplete)
      || (coverage && releaseCheck && !coverage.releasePackComplete)
      || (coverage && publishCheck && !coverage.coverageComplete)
      || (coverage && publishCheck && !coverage.releasePackComplete)
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
