import { createHash } from 'node:crypto';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

export type RuntimeFreshnessPathStatus = 'match' | 'changed' | 'missing_source' | 'missing_runtime';

export interface RuntimeFreshnessPathResult {
  relPath: string;
  sourceHash: string | null;
  runtimeHash: string | null;
  status: RuntimeFreshnessPathStatus;
}

export interface RuntimeFreshnessSummary {
  checked: number;
  matched: number;
  changed: number;
  missingSource: number;
  missingRuntime: number;
}

export interface RuntimeFreshnessResult {
  ok: boolean;
  sourceRoot: string;
  runtimeRoot: string;
  sourceFingerprint: string;
  runtimeFingerprint: string;
  summary: RuntimeFreshnessSummary;
  paths: RuntimeFreshnessPathResult[];
}

export interface RuntimeFreshnessOptions {
  sourceRoot?: string;
  runtimeRoot?: string;
  paths?: string[];
}

const MODULE_ID = 'spark-telegram-bot';

export const HARNESS_CORE_RUNTIME_PATHS = [
  'src/harnessContract.ts',
  'src/harnessCoreVNext.ts',
  'src/harnessCoreLedger.ts',
  'src/telegramActionAuthority.ts',
  'src/telegramCommandAuthority.ts',
  'src/telegramMediaAuthority.ts',
  'src/legacyAuthorityInventory.ts',
  'src/spawner.ts',
  'src/schedule.ts',
  'dist/harnessContract.js',
  'dist/harnessCoreVNext.js',
  'dist/harnessCoreLedger.js',
  'dist/telegramActionAuthority.js',
  'dist/telegramCommandAuthority.js',
  'dist/telegramMediaAuthority.js',
  'dist/legacyAuthorityInventory.js',
  'dist/spawner.js',
  'dist/schedule.js',
  'node_modules/@spark/harness-core/package.json',
  'node_modules/@spark/harness-core/SOURCE_MANIFEST.md',
  'node_modules/@spark/harness-core/ts-dist/index.js',
  'node_modules/@spark/harness-core/ts-dist/index.d.ts',
  'node_modules/@spark/harness-core/ts-dist-esm/index.mjs'
];

export const ROUTE_CRITICAL_RUNTIME_PATHS = [
  'package.json',
  'package-lock.json',
  'tsconfig.json',
  'spark.toml',
  ...HARNESS_CORE_RUNTIME_PATHS,
  'src/index.ts',
  'src/builderBridge.ts',
  'src/builderRepoPath.ts',
  'src/conversationIntent.ts',
  'src/conversationFrame.ts',
  'src/buildIntent.ts',
  'src/operatorActions.ts',
  'src/routeTypes.ts',
  'src/naturalRouteDecision.ts',
  'src/conversationSmoke.ts',
  'src/naturalRouteTelemetry.ts',
  'src/naturalRouteLedger.ts',
  'src/liveNlVerdict.ts',
  'src/profileEnv.ts',
  'src/memoryDoctorBridge.ts',
  'src/llm.ts',
  'src/missionRelay.ts',
  'src/recursive.ts',
  'src/pathLoop.ts',
  'src/healthRuntime.ts',
  'src/telegramDraft.ts',
  'src/telegramRichMessage.ts',
  'src/telegramVoiceBridge.ts',
  'src/voiceCaption.ts',
  'src/commandTelemetry.ts',
  'src/spawnerUrl.ts',
  'ops/runtimeFreshnessCheck.ts',
  'ops/realtimeConversationSmoke.ts',
  'ops/realtime-conversation-smoke.json',
  'ops/liveNlCommandSuite.ts',
  'ops/natural-language-live-commands.json',
  'ops/routeBoundaryHandlerHarness.ts',
  'dist/index.js',
  'dist/builderBridge.js',
  'dist/builderRepoPath.js',
  'dist/conversationIntent.js',
  'dist/conversationFrame.js',
  'dist/buildIntent.js',
  'dist/operatorActions.js',
  'dist/routeTypes.js',
  'dist/naturalRouteDecision.js',
  'dist/conversationSmoke.js',
  'dist/naturalRouteTelemetry.js',
  'dist/naturalRouteLedger.js',
  'dist/liveNlVerdict.js',
  'dist/profileEnv.js',
  'dist/memoryDoctorBridge.js',
  'dist/llm.js',
  'dist/missionRelay.js',
  'dist/recursive.js',
  'dist/pathLoop.js',
  'dist/healthRuntime.js',
  'dist/telegramDraft.js',
  'dist/telegramRichMessage.js',
  'dist/telegramVoiceBridge.js',
  'dist/voiceCaption.js',
  'dist/commandTelemetry.js',
  'dist/spawnerUrl.js'
];

export function defaultRuntimeRoot(): string {
  if (process.env.SPARK_TELEGRAM_RUNTIME_ROOT) {
    return path.resolve(process.env.SPARK_TELEGRAM_RUNTIME_ROOT);
  }
  const fallback = path.join(os.homedir(), '.spark', 'modules', MODULE_ID, 'source');
  const installedJson = path.join(os.homedir(), '.spark', 'state', 'installed.json');
  if (!fs.existsSync(installedJson)) return fallback;
  try {
    const installed = JSON.parse(fs.readFileSync(installedJson, 'utf8')) as Record<string, { path?: string; source?: string }>;
    const record = installed[MODULE_ID];
    const configured = record?.path || record?.source;
    return configured ? path.resolve(configured) : fallback;
  } catch {
    return fallback;
  }
}

function normalizeRelPath(relPath: string): string {
  return relPath.replace(/\\/g, '/').replace(/^\/+/, '');
}

function fileHash(absPath: string): string | null {
  if (!fs.existsSync(absPath)) return null;
  const stat = fs.statSync(absPath);
  if (!stat.isFile()) return null;
  return createHash('sha256').update(fs.readFileSync(absPath)).digest('hex');
}

function statusFor(sourceHash: string | null, runtimeHash: string | null): RuntimeFreshnessPathStatus {
  if (!sourceHash) return 'missing_source';
  if (!runtimeHash) return 'missing_runtime';
  return sourceHash === runtimeHash ? 'match' : 'changed';
}

function fingerprint(paths: RuntimeFreshnessPathResult[], side: 'source' | 'runtime'): string {
  const hash = createHash('sha256');
  for (const entry of paths) {
    const value = side === 'source' ? entry.sourceHash : entry.runtimeHash;
    hash.update(entry.relPath);
    hash.update('\0');
    hash.update(value || 'missing');
    hash.update('\n');
  }
  return hash.digest('hex').slice(0, 16);
}

export function checkRuntimeFreshness(options: RuntimeFreshnessOptions = {}): RuntimeFreshnessResult {
  const sourceRoot = path.resolve(options.sourceRoot || path.join(__dirname, '..'));
  const runtimeRoot = path.resolve(options.runtimeRoot || defaultRuntimeRoot());
  const relPaths = (options.paths && options.paths.length > 0 ? options.paths : ROUTE_CRITICAL_RUNTIME_PATHS)
    .map(normalizeRelPath);

  const paths = relPaths.map((relPath) => {
    const sourceHash = fileHash(path.join(sourceRoot, relPath));
    const runtimeHash = fileHash(path.join(runtimeRoot, relPath));
    return {
      relPath,
      sourceHash,
      runtimeHash,
      status: statusFor(sourceHash, runtimeHash)
    };
  });

  const summary = paths.reduce<RuntimeFreshnessSummary>(
    (acc, entry) => {
      acc.checked += 1;
      if (entry.status === 'match') acc.matched += 1;
      if (entry.status === 'changed') acc.changed += 1;
      if (entry.status === 'missing_source') acc.missingSource += 1;
      if (entry.status === 'missing_runtime') acc.missingRuntime += 1;
      return acc;
    },
    { checked: 0, matched: 0, changed: 0, missingSource: 0, missingRuntime: 0 }
  );

  return {
    ok: summary.checked > 0 && summary.matched === summary.checked,
    sourceRoot,
    runtimeRoot,
    sourceFingerprint: fingerprint(paths, 'source'),
    runtimeFingerprint: fingerprint(paths, 'runtime'),
    summary,
    paths
  };
}

export function formatRuntimeFreshnessReport(result: RuntimeFreshnessResult): string {
  const lines = [
    result.ok ? 'Runtime freshness: in sync.' : 'Runtime freshness: DRIFT detected.',
    `Source: ${result.sourceRoot}`,
    `Runtime: ${result.runtimeRoot}`,
    `Source fingerprint: ${result.sourceFingerprint}`,
    `Runtime fingerprint: ${result.runtimeFingerprint}`,
    `Checked: ${result.summary.checked} route-critical path(s), ${result.summary.matched} matched, ${result.summary.changed} changed, ${result.summary.missingRuntime} missing in runtime, ${result.summary.missingSource} missing in source.`
  ];

  const drift = result.paths.filter((entry) => entry.status !== 'match');
  if (drift.length > 0) {
    lines.push('', 'Drift:');
    for (const entry of drift.slice(0, 25)) {
      lines.push(`- ${entry.relPath}: ${entry.status}`);
    }
    if (drift.length > 25) {
      lines.push(`- ... ${drift.length - 25} more`);
    }
    lines.push('', 'Next: build the tested checkout, sync the live runtime, restart the profile, then rerun this check before trusting Telegram smoke.');
  }

  return `${lines.join('\n')}\n`;
}
