import { execFile } from 'node:child_process';
import { access, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { constants as fsConstants } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import { resolvePythonCommand } from './pythonCommand';
import { redactText } from './redaction';
import { builderBridgeTimeoutMs, positiveIntegerEnv } from './timeoutConfig';
import { withHiddenWindows } from './hiddenProcess';

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

export interface BuilderDiagnosticsScanJson {
  failure_line_count?: unknown;
  scanned_line_count?: unknown;
  findings?: unknown;
  sources?: unknown;
  service_checks?: unknown;
  counts_by_failure_class?: unknown;
  counts_by_subsystem?: unknown;
  markdown_path?: unknown;
}

export interface BuilderDiagnosticsScanResult {
  replyText: string;
  markdownPath: string;
}

export interface BuilderConversationColdContextInput {
  userId: number | string;
  currentMessage: string;
}

export interface BuilderConversationColdContextResult {
  used: boolean;
  contextText: string;
  sourceCount: number;
  bridgeMode: string;
  error?: string;
}

export interface BuilderSelfAwarenessInput {
  userId: number | string;
  chatId: number | string;
  currentMessage?: string;
}

export interface BuilderSelfAwarenessResult {
  replyText: string;
  payload: Record<string, unknown>;
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
    timeoutMs: builderBridgeTimeoutMs(),
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
  const env: NodeJS.ProcessEnv = {
    ...process.env,
    PYTHONPATH: existingPythonPath ? `${sourcePath}${path.delimiter}${existingPythonPath}` : sourcePath,
  };
  if (process.env.BOT_TOKEN && !env.TELEGRAM_BOT_TOKEN) {
    env.TELEGRAM_BOT_TOKEN = process.env.BOT_TOKEN;
  }
  return env;
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

function stringValue(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function arrayValue(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function objectValue(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function truncateForPrompt(text: string, maxChars: number): string {
  const trimmed = text.replace(/\s+/g, ' ').trim();
  if (trimmed.length <= maxChars) {
    return trimmed;
  }
  return `${trimmed.slice(0, Math.max(0, maxChars - 16)).trim()} [truncated]`;
}

function claimText(value: unknown): string {
  const item = objectValue(value);
  return stringValue(item.claim);
}

function compactSelfAwarenessClaim(text: string): string {
  return text
    .replace('Spark Intelligence Builder', 'Builder')
    .replace('Spark Local Work', 'Local Work')
    .replace(/ is visible in the Builder registry with status=([^.]+)\./, ': $1')
    .replace(/ is not fully healthy or available: status=([^.]+)\. Main limit: /, ': $1 - ')
    .replace('Recent tool_result_received:', 'Route worked recently:')
    .replace('Registry visibility does not prove a chip, browser route, provider, or workflow succeeded this turn.', 'Registry visibility is not proof a route worked this turn.')
    .replace('Spark cannot inspect secrets, hidden prompts, private infrastructure, or deployment health unless a safe diagnostic surface exposes them.', 'I need safe redacted diagnostics for secret-bound or private systems.')
    .replace('Add per-capability last_success_at, last_failure_reason, and eval coverage fields.', 'Track last_success_at, last_failure_reason, latency, and eval coverage per capability.');
}

function formatClaimLines(title: string, claims: unknown, limit: number, compact = false): string[] {
  const items = arrayValue(claims)
    .map(claimText)
    .filter(Boolean)
    .map((item) => compact ? compactSelfAwarenessClaim(item) : item)
    .slice(0, limit);
  if (!items.length) {
    return [];
  }
  return [title, ...items.map((item) => `- ${item}`), ''];
}

export function compactColdMemoryQuery(text: string, maxChars = 1600): string {
  const normalized = text.replace(/\s+/g, ' ').trim();
  if (normalized.length <= maxChars) {
    return normalized;
  }
  return `${normalized.slice(0, Math.max(0, maxChars - 16)).trim()} [truncated]`;
}

function shouldIncludeColdMemoryItem(item: Record<string, unknown>): boolean {
  const lane = stringValue(item.lane);
  const sourceClass = stringValue(item.source_class);
  if (!lane || !stringValue(item.text)) {
    return false;
  }
  if (lane === 'wiki_packets' || sourceClass === 'obsidian_llm_wiki_packets') {
    return false;
  }
  return true;
}

export function formatConversationColdMemoryContext(payload: unknown, maxChars = 3000): {
  contextText: string;
  sourceCount: number;
} {
  const root = objectValue(payload);
  const packet = objectValue(root.context_packet);
  const sections = arrayValue(packet.sections);
  const lines = [
    '[Spark Cold Memory Context]',
    'Use this as supporting retrieved memory only. Newer conversation frame context wins.',
    ''
  ];
  let usedChars = lines.join('\n').length;
  let sourceCount = 0;

  for (const sectionValue of sections) {
    const section = objectValue(sectionValue);
    const items = arrayValue(section.items).map(objectValue).filter(shouldIncludeColdMemoryItem);
    if (!items.length) {
      continue;
    }
    const sectionName = stringValue(section.section) || 'retrieved_memory';
    const sectionLines = [`[${sectionName}]`];
    for (const item of items) {
      const text = truncateForPrompt(stringValue(item.text), 700);
      if (!text) {
        continue;
      }
      const lane = stringValue(item.lane) || 'memory';
      const predicate = stringValue(item.predicate);
      const source = predicate ? `${lane}/${predicate}` : lane;
      const line = `- ${source}: ${text}`;
      if (usedChars + sectionLines.join('\n').length + line.length > maxChars) {
        break;
      }
      sectionLines.push(line);
      sourceCount += 1;
    }
    if (sectionLines.length > 1) {
      lines.push(...sectionLines, '');
      usedChars = lines.join('\n').length;
    }
    if (usedChars >= maxChars) {
      break;
    }
  }

  return {
    contextText: sourceCount > 0 ? lines.join('\n').trim() : '',
    sourceCount
  };
}

export function formatDiagnosticsScanReply(report: BuilderDiagnosticsScanJson): string {
  const findings = Array.isArray(report.findings) ? report.findings.length : 0;
  const sources = Array.isArray(report.sources) ? report.sources.length : 0;
  const markdownPath = String(report.markdown_path || '').trim();
  return [
    'Diagnostics scan complete',
    '',
    `Log scan`,
    `- Scanned: ${numericValue(report.scanned_line_count)} lines from ${sources} sources`,
    `- Failures: ${numericValue(report.failure_line_count)}`,
    `- Findings: ${findings}`,
    '',
    `Connector health`,
    `- ${formatServiceCheckCounts(report.service_checks)}`,
    '',
    `Subsystems`,
    `- ${formatTopCounts(report.counts_by_subsystem)}`,
    '',
    `Failure classes`,
    `- ${formatTopCounts(report.counts_by_failure_class)}`,
    '',
    markdownPath
      ? 'Markdown note attached below.'
      : 'Markdown note was not written.'
  ].join('\n');
}

export function formatSelfAwarenessReply(payload: unknown): string {
  const root = objectValue(payload);
  const wikiRefresh = objectValue(root.wiki_refresh);
  const wikiContext = objectValue(root.wiki_context);
  const routes = arrayValue(root.natural_language_routes)
    .map((item) => stringValue(item))
    .filter(Boolean)
    .slice(0, 2);
  const lines = [
    'Spark self-awareness',
    '',
    'Short version: I can see some live Spark systems, but I should still prove a route worked before I sound certain.',
    '',
    `Workspace: ${stringValue(root.workspace_id) || 'default'}`,
    `Checked: ${stringValue(root.generated_at) || 'unknown'}`,
    '',
    ...formatClaimLines('What looks live', root.observed_now, 4, true),
    ...formatClaimLines('What I recently proved', root.recently_verified, 2, true),
    ...formatClaimLines('Where I still lack', root.lacks, 3, true),
    ...formatClaimLines('What I should improve next', root.improvement_options, 3, true),
  ];
  if (routes.length) {
    lines.push('Good next probes');
    lines.push(...routes.map((item) => `- ${item.replace(/^Ask:\s*/, '')}`));
    lines.push('');
  }
  if (Object.keys(wikiRefresh).length || Object.keys(wikiContext).length) {
    const generatedCount = numericValue(wikiRefresh.generated_file_count);
    const wikiStatus = stringValue(wikiContext.wiki_status) || 'unknown';
    const wikiRecords = numericValue(wikiContext.wiki_record_count);
    lines.push('Knowledge notes');
    lines.push(`- Wiki refreshed ${generatedCount} system pages and found ${wikiRecords} supporting hits (${wikiStatus}).`);
    lines.push('- I should use that as background, not as live truth.');
    lines.push('');
  }
  lines.push('Core rule: I can try the right route, but I should name missing evidence before claiming certainty.');
  return lines.join('\n').replace(/\n{3,}/g, '\n\n').trim();
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

export async function runBuilderDiagnosticsScan(): Promise<BuilderDiagnosticsScanResult> {
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
    withHiddenWindows({
      cwd: config.builderRepo,
      env: pythonSourceEnv(config),
      timeout: config.timeoutMs,
      maxBuffer: 1024 * 1024,
    })
  );
  const trimmedStdout = stdout.trim();
  if (!trimmedStdout) {
    throw new Error(`Diagnostics scan returned empty stdout. stderr=${stderr.trim()}`);
  }
  const parsed = JSON.parse(trimmedStdout) as BuilderDiagnosticsScanJson;
  return {
    replyText: formatDiagnosticsScanReply(parsed),
    markdownPath: String(parsed.markdown_path || '').trim(),
  };
}

export async function runBuilderSelfAwarenessStatus(
  input: BuilderSelfAwarenessInput
): Promise<BuilderSelfAwarenessResult> {
  const config = resolveBridgeConfig();
  const bridgeAvailable = await ensureBridgeAvailable(config);
  if (!bridgeAvailable) {
    throw new Error(`Builder bridge unavailable. repo=${config.builderRepo} home=${config.builderHome}`);
  }

  const { stdout, stderr } = await execFileAsync(
    config.pythonCommand,
    pythonModuleInvocation(config, 'spark_intelligence.cli', [
      'self',
      'status',
      '--home',
      config.builderHome,
      '--human-id',
      `human:telegram:${String(input.userId).trim()}`,
      '--session-id',
      `session:telegram:${String(input.chatId).trim()}:${String(input.userId).trim()}`,
      '--channel-kind',
      'telegram',
      '--user-message',
      input.currentMessage || 'Show Spark self-awareness status and improvement options.',
      '--refresh-wiki',
      '--json',
    ]),
    withHiddenWindows({
      cwd: config.builderRepo,
      env: pythonSourceEnv(config),
      timeout: positiveIntegerEnv(process.env, 'SPARK_SELF_BRIDGE_TIMEOUT_MS', Math.min(config.timeoutMs, 30000)),
      maxBuffer: 1024 * 1024,
    })
  );
  const trimmedStdout = stdout.trim();
  if (!trimmedStdout) {
    throw new Error(`Builder self-awareness returned empty stdout. stderr=${redactText(stderr.trim())}`);
  }
  const payload = JSON.parse(trimmedStdout) as Record<string, unknown>;
  return {
    payload,
    replyText: formatSelfAwarenessReply(payload),
  };
}

export async function runBuilderConversationColdContext(
  input: BuilderConversationColdContextInput
): Promise<BuilderConversationColdContextResult> {
  const config = resolveBridgeConfig();
  if (config.mode === 'off') {
    return {
      used: false,
      contextText: '',
      sourceCount: 0,
      bridgeMode: config.mode,
    };
  }

  const bridgeAvailable = await ensureBridgeAvailable(config);
  if (!bridgeAvailable) {
    return {
      used: false,
      contextText: '',
      sourceCount: 0,
      bridgeMode: config.mode,
      error: `Builder bridge unavailable. repo=${config.builderRepo} home=${config.builderHome}`,
    };
  }

  const currentMessage = compactColdMemoryQuery(input.currentMessage);
  if (!currentMessage) {
    return {
      used: false,
      contextText: '',
      sourceCount: 0,
      bridgeMode: config.mode,
    };
  }

  try {
    const { stdout, stderr } = await execFileAsync(
      config.pythonCommand,
      pythonModuleInvocation(config, 'spark_intelligence.cli', [
        'memory',
        'inspect-capsule',
        '--home',
        config.builderHome,
        '--query',
        currentMessage,
        '--subject',
        `human:telegram:${String(input.userId).trim()}`,
        '--limit',
        '6',
        '--no-record-activity',
        '--json',
      ]),
      withHiddenWindows({
        cwd: config.builderRepo,
        env: pythonSourceEnv(config),
        timeout: positiveIntegerEnv(process.env, 'SPARK_CONTEXT_BRIDGE_TIMEOUT_MS', Math.min(config.timeoutMs, 6000)),
        maxBuffer: 1024 * 1024,
      })
    );
    const trimmedStdout = stdout.trim();
    if (!trimmedStdout) {
      throw new Error(`Builder memory context returned empty stdout. stderr=${redactText(stderr.trim())}`);
    }
    const formatted = formatConversationColdMemoryContext(JSON.parse(trimmedStdout));
    return {
      used: formatted.sourceCount > 0,
      contextText: formatted.contextText,
      sourceCount: formatted.sourceCount,
      bridgeMode: config.mode,
    };
  } catch (error) {
    console.warn('[BuilderBridge] Cold memory context unavailable:', error);
    return {
      used: false,
      contextText: '',
      sourceCount: 0,
      bridgeMode: config.mode,
      error: error instanceof Error ? error.message : String(error),
    };
  }
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
      withHiddenWindows({
        cwd: config.builderRepo,
        env: pythonSourceEnv(config),
        timeout: config.timeoutMs,
        maxBuffer: 1024 * 1024,
      })
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
