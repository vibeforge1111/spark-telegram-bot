import { execFile } from 'node:child_process';
import { access, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { constants as fsConstants } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import { resolvePythonCommand } from './pythonCommand';
import { redactText } from './redaction';

const execFileAsync = promisify(execFile);

type BuilderBridgeMode = 'auto' | 'off' | 'required';

interface BuilderBridgeConfig {
  mode: BuilderBridgeMode;
  pythonCommand: string;
  builderRepo: string;
  builderHome: string;
  timeoutMs: number;
}

export interface BuilderBridgeStatus {
  mode: BuilderBridgeMode;
  available: boolean;
  builderRepo: string;
  builderHome: string;
}

export interface BuilderBridgeReply {
  used: boolean;
  responseText: string;
  decision: string;
  bridgeMode: string;
  routingDecision: string;
}

interface BuilderDiagnosticsScanJson {
  failure_line_count?: unknown;
  scanned_line_count?: unknown;
  findings?: unknown;
  sources?: unknown;
  service_checks?: unknown;
  counts_by_failure_class?: unknown;
  counts_by_subsystem?: unknown;
  markdown_path?: unknown;
}

function parseBridgeMode(): BuilderBridgeMode {
  const raw = (process.env.SPARK_BUILDER_BRIDGE_MODE || 'auto').trim().toLowerCase();
  if (raw === 'auto' || raw === 'off' || raw === 'required') {
    return raw;
  }
  throw new Error('SPARK_BUILDER_BRIDGE_MODE must be one of: auto, off, required');
}

function resolveBridgeConfig(): BuilderBridgeConfig {
  const builderRepo = path.resolve(
    process.env.SPARK_BUILDER_REPO || path.join(process.cwd(), '..', 'spark-intelligence-builder')
  );

  return {
    mode: parseBridgeMode(),
    pythonCommand: resolvePythonCommand(process.env.SPARK_BUILDER_PYTHON),
    builderRepo,
    builderHome: path.resolve(
      process.env.SPARK_BUILDER_HOME || path.join(os.homedir(), '.spark', 'state', 'spark-intelligence')
    ),
    timeoutMs: Number.parseInt(process.env.SPARK_BUILDER_TIMEOUT_MS || '45000', 10) || 45000,
  };
}

async function pathExists(targetPath: string): Promise<boolean> {
  try {
    await access(targetPath, fsConstants.F_OK);
    return true;
  } catch {
    return false;
  }
}

async function ensureBridgeAvailable(config: BuilderBridgeConfig): Promise<boolean> {
  const [repoExists, homeExists] = await Promise.all([
    pathExists(config.builderRepo),
    pathExists(config.builderHome),
  ]);
  return repoExists && homeExists;
}

function candidateDiagnosticsRepos(config: BuilderBridgeConfig): string[] {
  return [
    process.env.SPARK_DIAGNOSTICS_BUILDER_REPO || '',
    config.builderRepo,
    path.join(os.homedir(), '.spark', 'modules', 'spark-intelligence-builder', 'source'),
    path.join(os.homedir(), 'Desktop', 'spark-intelligence-builder'),
  ].filter(Boolean);
}

async function resolveDiagnosticsBridgeConfig(config: BuilderBridgeConfig): Promise<BuilderBridgeConfig> {
  const seen = new Set<string>();
  for (const candidate of candidateDiagnosticsRepos(config)) {
    const builderRepo = path.resolve(candidate);
    const key = builderRepo.toLowerCase();
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    const [cliExists, diagnosticsExists] = await Promise.all([
      pathExists(path.join(builderRepo, 'src', 'spark_intelligence', 'cli.py')),
      pathExists(path.join(builderRepo, 'src', 'spark_intelligence', 'diagnostics', 'agent.py')),
    ]);
    if (cliExists && diagnosticsExists) {
      return { ...config, builderRepo };
    }
  }
  return config;
}

function pythonSourceEnv(config: BuilderBridgeConfig): NodeJS.ProcessEnv {
  const sourcePath = path.join(config.builderRepo, 'src');
  const existingPythonPath = process.env.PYTHONPATH || '';
  return {
    ...process.env,
    PYTHONPATH: existingPythonPath ? `${sourcePath}${path.delimiter}${existingPythonPath}` : sourcePath,
  };
}

function pythonModuleInvocation(config: BuilderBridgeConfig, moduleName: string, args: string[]): string[] {
  const sourcePath = path.join(config.builderRepo, 'src');
  return [
    '-c',
    [
      'import runpy, sys',
      'sys.path.insert(0, sys.argv[1])',
      `sys.argv = [${JSON.stringify(moduleName)}, *sys.argv[2:]]`,
      `runpy.run_module(${JSON.stringify(moduleName)}, run_name="__main__")`,
    ].join('; '),
    sourcePath,
    ...args,
  ];
}

function numericValue(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}

function objectEntries(value: unknown): [string, unknown][] {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return [];
  }
  return Object.entries(value as Record<string, unknown>);
}

function formatTopCounts(value: unknown): string {
  const entries = objectEntries(value)
    .filter(([, count]) => typeof count === 'number')
    .sort((a, b) => Number(b[1]) - Number(a[1]))
    .slice(0, 4)
    .map(([key, count]) => `${key}: ${count}`);
  return entries.length ? entries.join(', ') : 'none';
}

function formatServiceCheckCounts(value: unknown): string {
  if (!Array.isArray(value)) {
    return 'none';
  }
  const counts = new Map<string, number>();
  for (const item of value) {
    if (!item || typeof item !== 'object') {
      continue;
    }
    const status = String((item as Record<string, unknown>).status || 'unknown').trim() || 'unknown';
    counts.set(status, (counts.get(status) || 0) + 1);
  }
  if (counts.size === 0) {
    return 'none';
  }
  return Array.from(counts.entries())
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([status, count]) => `${status}: ${count}`)
    .join(', ');
}

function formatDiagnosticsScanReply(report: BuilderDiagnosticsScanJson): string {
  const findings = Array.isArray(report.findings) ? report.findings.length : 0;
  const sources = Array.isArray(report.sources) ? report.sources.length : 0;
  const markdownPath = String(report.markdown_path || '').trim();
  return [
    'Diagnostics scan complete.',
    `Scanned ${numericValue(report.scanned_line_count)} log lines from ${sources} sources.`,
    `Failure lines: ${numericValue(report.failure_line_count)}. Findings: ${findings}.`,
    `Subsystems: ${formatTopCounts(report.counts_by_subsystem)}.`,
    `Failure classes: ${formatTopCounts(report.counts_by_failure_class)}.`,
    `Connector checks: ${formatServiceCheckCounts(report.service_checks)}.`,
    markdownPath ? `Obsidian note: ${markdownPath}` : 'Obsidian note: not written.'
  ].join('\n');
}

export async function getBuilderBridgeStatus(): Promise<BuilderBridgeStatus> {
  const config = resolveBridgeConfig();
  return {
    mode: config.mode,
    available: await ensureBridgeAvailable(config),
    builderRepo: config.builderRepo,
    builderHome: config.builderHome,
  };
}

export async function runBuilderDiagnosticsScan(): Promise<string> {
  const config = await resolveDiagnosticsBridgeConfig(resolveBridgeConfig());
  const bridgeAvailable = await ensureBridgeAvailable(config);
  if (!bridgeAvailable) {
    throw new Error(`Builder bridge unavailable. repo=${config.builderRepo} home=${config.builderHome}`);
  }

  const { stdout, stderr } = await execFileAsync(
    config.pythonCommand,
    pythonModuleInvocation(config, 'spark_intelligence.cli', [
      'diagnostics',
      'scan',
      '--home',
      config.builderHome,
      '--json',
    ]),
    {
      cwd: config.builderRepo,
      env: pythonSourceEnv(config),
      timeout: config.timeoutMs,
      maxBuffer: 1024 * 1024,
    }
  );
  const trimmedStdout = stdout.trim();
  if (!trimmedStdout) {
    throw new Error(`Diagnostics scan returned empty stdout. stderr=${stderr.trim()}`);
  }
  return formatDiagnosticsScanReply(JSON.parse(trimmedStdout) as BuilderDiagnosticsScanJson);
}

export async function runBuilderTelegramBridge(updatePayload: Record<string, unknown>): Promise<BuilderBridgeReply> {
  const config = resolveBridgeConfig();
  if (config.mode === 'off') {
    return {
      used: false,
      responseText: '',
      decision: '',
      bridgeMode: '',
      routingDecision: '',
    };
  }

  const bridgeAvailable = await ensureBridgeAvailable(config);
  if (!bridgeAvailable) {
    if (config.mode === 'required') {
      throw new Error(
        `Builder bridge is required but unavailable. repo=${config.builderRepo} home=${config.builderHome}`
      );
    }
    return {
      used: false,
      responseText: '',
      decision: '',
      bridgeMode: '',
      routingDecision: '',
    };
  }

  const tempDir = await mkdtemp(path.join(os.tmpdir(), 'spark-builder-telegram-'));
  const updatePath = path.join(tempDir, 'update.json');
  try {
    await writeFile(updatePath, JSON.stringify(updatePayload, null, 2), 'utf-8');

    const { stdout, stderr } = await execFileAsync(
      config.pythonCommand,
      pythonModuleInvocation(config, 'spark_intelligence.cli', [
        'gateway',
        'simulate-telegram-update',
        updatePath,
        '--home',
        config.builderHome,
        '--origin',
        'telegram-runtime',
        '--json',
      ]),
      {
        cwd: config.builderRepo,
        env: pythonSourceEnv(config),
        timeout: config.timeoutMs,
        maxBuffer: 1024 * 1024,
      }
    );

    const trimmedStdout = stdout.trim();
    if (!trimmedStdout) {
      throw new Error(`Builder bridge returned empty stdout. stderr=${redactText(stderr.trim())}`);
    }

    const parsed = JSON.parse(trimmedStdout) as {
      decision?: unknown;
      detail?: {
        response_text?: unknown;
        bridge_mode?: unknown;
        routing_decision?: unknown;
      };
    };

    const detail = parsed.detail || {};
    return {
      used: true,
      responseText: String(detail.response_text || '').trim(),
      decision: String(parsed.decision || '').trim(),
      bridgeMode: String(detail.bridge_mode || '').trim(),
      routingDecision: String(detail.routing_decision || '').trim(),
    };
  } catch (error) {
    if (config.mode === 'required') {
      throw error;
    }
    console.warn('[BuilderBridge] Falling back to local conversation path:', error);
    return {
      used: false,
      responseText: '',
      decision: '',
      bridgeMode: '',
      routingDecision: '',
    };
  } finally {
    await rm(tempDir, { recursive: true, force: true }).catch(() => {});
  }
}
