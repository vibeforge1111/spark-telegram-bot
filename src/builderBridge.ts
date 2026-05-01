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

export interface BuilderMemoryDashboardInput {
  userId: number | string;
  limit?: number;
}

export interface BuilderMemoryDashboardResult {
  replyText: string;
  payload: Record<string, unknown>;
}

export interface BuilderMemorySessionSearchInput {
  userId: number | string;
  query: string;
  limit?: number;
}

export interface BuilderMemorySessionSearchResult {
  replyText: string;
  payload: Record<string, unknown>;
}

export interface BuilderMemorySourceInput {
  userId: number | string;
  query: string;
  limit?: number;
}

export interface BuilderMemorySourceResult {
  replyText: string;
  payload: Record<string, unknown>;
}

export interface BuilderMemoryFeedbackInput {
  userId: number | string;
  chatId: number | string;
  verdict: string;
  note: string;
  targetEventId?: string | null;
  targetTraceRef?: string | null;
}

export interface BuilderMemoryFeedbackResult {
  replyText: string;
  payload: Record<string, unknown>;
}

export interface BuilderMemoryFeedbackReviewInput {
  userId: number | string;
  limit?: number;
}

export interface BuilderMemoryFeedbackReviewResult {
  replyText: string;
  payload: Record<string, unknown>;
}

export interface MemoryFeedbackCommand {
  verdict: string;
  note: string;
  targetEventId?: string;
  targetTraceRef?: string;
}

export interface MemoryFeedbackTarget {
  eventId?: string;
  traceRef?: string;
  label?: string;
}

export interface BuilderWikiStatusResult {
  replyText: string;
  payload: Record<string, unknown>;
}

export interface BuilderWikiInventoryResult {
  replyText: string;
  payload: Record<string, unknown>;
}

export interface BuilderWikiQueryResult {
  replyText: string;
  payload: Record<string, unknown>;
}

export interface BuilderWikiAnswerResult {
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

function formatSelfAwarenessStyleLens(styleLens: unknown): string[] {
  const lens = objectValue(styleLens);
  if (!Object.keys(lens).length) {
    return [];
  }
  const lines = ['How I am tuned for you'];
  const summary = stringValue(lens.persona_summary);
  const styleSentence = stringValue(lens.style_sentence);
  const rules = arrayValue(lens.behavioral_rules)
    .map((item) => stringValue(item))
    .filter(Boolean)
    .slice(0, 2);
  if (summary) {
    lines.push(`- I should ${humanizeStyleInstruction(summary)}.`);
  }
  if (styleSentence) {
    lines.push(`- Tone: ${styleSentence}.`);
  }
  if (rules.length && !summary) {
    lines.push(`- Style promises: ${rules.join('; ')}.`);
  }
  if (lens.user_deltas_applied) {
    lines.push('- I should let that tuning shape the answer, while keeping the evidence visible.');
  }
  lines.push('');
  return lines;
}

function humanizeStyleInstruction(value: string): string {
  const parts = value
    .replace(/\n/g, ';')
    .split(';')
    .map((part) => part.trim().replace(/[.]+$/, ''))
    .filter(Boolean)
    .slice(0, 3)
    .map((part) => {
      const lower = part.toLowerCase();
      if (lower.startsWith('do not say ')) {
        part = `avoid saying ${part.slice(11)}`;
      } else if (lower.startsWith("don't say ")) {
        part = `avoid saying ${part.slice(10)}`;
      } else if (lower.startsWith('dont say ')) {
        part = `avoid saying ${part.slice(9)}`;
      } else if (lower.startsWith('do not claim ')) {
        part = `avoid claiming ${part.slice(13)}`;
      } else if (lower.startsWith("don't claim ")) {
        part = `avoid claiming ${part.slice(12)}`;
      } else if (lower.startsWith('dont claim ')) {
        part = `avoid claiming ${part.slice(11)}`;
      } else if (lower.startsWith('do not ')) {
        part = `avoid ${part.slice(7)}`;
      } else if (lower.startsWith("don't ")) {
        part = `avoid ${part.slice(6)}`;
      } else if (lower.startsWith('dont ')) {
        part = `avoid ${part.slice(5)}`;
      }
      return part.slice(0, 1).toLowerCase() + part.slice(1);
    });
  if (!parts.length) {
    return value;
  }
  if (parts.length === 1) {
    return parts[0];
  }
  if (parts.length === 2) {
    return `${parts[0]} and ${parts[1]}`;
  }
  return `${parts.slice(0, -1).join(', ')}, and ${parts[parts.length - 1]}`;
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
  const styleLens = objectValue(root.style_lens);
  const routes = arrayValue(root.natural_language_routes)
    .map((item) => stringValue(item))
    .filter(Boolean)
    .slice(0, 2);
  const lines = [
    'Spark self-awareness',
    '',
    Object.keys(styleLens).length
      ? 'Short version: I can see the live Spark stack. I should keep the answer grounded, but it should sound like your Spark instead of a pasted status report.'
      : 'Short version: I can see the live Spark stack. I should stay grounded and prove a route worked before I sound certain.',
    '',
    `Workspace: ${stringValue(root.workspace_id) || 'default'}`,
    `Checked: ${stringValue(root.generated_at) || 'unknown'}`,
    '',
    ...formatSelfAwarenessStyleLens(styleLens),
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

export function formatMemoryDashboardReply(payload: unknown): string {
  const root = objectValue(payload);
  const counts = objectValue(root.counts);
  const scope = objectValue(root.scope);
  const humanRows = arrayValue(root.human_view).map(objectValue).slice(0, 6);
  const movementPaths = arrayValue(root.movement_paths).map(objectValue).slice(0, 4);
  const blockers = arrayValue(root.recent_blockers).map(objectValue).slice(0, 3);
  const movementKeys = ['captured', 'blocked', 'promoted', 'saved', 'decayed', 'summarized', 'retrieved'];
  const movement = movementKeys
    .map((key) => `${key}: ${numericValue(counts[key])}`)
    .join(', ');
  const lines = [
    'Spark memory movement',
    '',
    `Scope: ${stringValue(scope.human_id) ? 'this Telegram user' : 'all recent memory'}`,
    `Movement: ${movement}`,
  ];
  if (humanRows.length) {
    lines.push('', 'Recent trace');
    for (const row of humanRows) {
      const movementName = stringValue(row.movement) || 'memory';
      const line = stringValue(row.line) || stringValue(row.summary) || stringValue(row.event_type);
      if (line) {
        lines.push(`- ${movementName}: ${truncateForPrompt(line, 170)}`);
      }
    }
  } else {
    lines.push('', 'Recent trace');
    lines.push('- No scoped memory movement found yet.');
  }
  if (movementPaths.length) {
    lines.push('', 'Movement paths');
    for (const path of movementPaths) {
      const line = stringValue(path.line);
      if (line) {
        lines.push(`- ${truncateForPrompt(line, 170)}`);
      }
    }
  }
  if (blockers.length) {
    lines.push('', 'Blocked writes');
    for (const row of blockers) {
      const predicate = stringValue(row.predicate) || stringValue(row.event_type) || 'memory';
      const reason = stringValue(row.reason) || 'policy gate';
      lines.push(`- ${predicate}: ${reason}`);
    }
  }
  lines.push('', 'Rule: this shows memory movement, not a promise that every mention became durable memory.');
  return lines.join('\n').replace(/\n{3,}/g, '\n\n').trim();
}

export function formatMemorySessionSearchReply(payload: unknown): string {
  const root = objectValue(payload);
  const sessions = arrayValue(root.sessions).map(objectValue).slice(0, 4);
  const lines = [
    'Spark memory search',
    '',
    `Query: ${stringValue(root.query) || 'unknown'}`,
    `Status: ${stringValue(root.status) || 'unknown'} (${numericValue(root.matched_event_count)} matches)`,
  ];
  if (sessions.length) {
    lines.push('', 'Best sessions');
    for (const session of sessions) {
      const events = arrayValue(session.events).map(objectValue).slice(0, 2);
      lines.push(`- ${stringValue(session.session_id) || 'session:unknown'} (${numericValue(session.matched_event_count)} hits)`);
      for (const event of events) {
        const role = stringValue(event.role) || 'memory';
        const snippet = stringValue(event.snippet);
        if (snippet) {
          lines.push(`  ${role}: ${truncateForPrompt(snippet, 170)}`);
        }
      }
    }
  } else {
    lines.push('', 'No matching captured sessions found for that phrasing.');
  }
  lines.push('', 'Rule: this is episodic evidence, not durable truth by itself.');
  return lines.join('\n').replace(/\n{3,}/g, '\n\n').trim();
}

export function formatMemorySourceReply(payload: unknown): string {
  const root = objectValue(payload);
  const selected = arrayValue(root.selected_sources).map(objectValue).slice(0, 4);
  const sourceMix = objectEntries(root.source_mix)
    .map(([source, count]) => `${source}=${numericValue(count)}`)
    .join(', ');
  const lines = [
    'Memory source explanation',
    '',
    `Query: ${truncateForPrompt(stringValue(root.query) || 'unknown', 180)}`,
    `Source: ${stringValue(root.source_class) || 'none'} (${stringValue(root.source_authority) || 'unknown'}, ${stringValue(root.confidence) || 'unknown'})`,
    `Why: ${truncateForPrompt(stringValue(root.why_source_won) || 'No source explanation available.', 220)}`,
  ];
  if (sourceMix) {
    lines.push(`Mix: ${sourceMix}`);
  }
  lines.push(
    `Gates: stale_current=${stringValue(root.stale_current_status) || 'unknown'} source_mix=${stringValue(root.source_mix_status) || 'unknown'}`
  );
  if (selected.length) {
    lines.push('', 'Selected evidence');
    for (const source of selected) {
      const label = stringValue(source.predicate) || stringValue(source.source_class) || 'memory';
      const preview = stringValue(source.preview);
      lines.push(`- ${label}: ${truncateForPrompt(preview || stringValue(source.reason) || 'selected', 150)}`);
    }
  } else {
    lines.push('', 'Selected evidence');
    lines.push('- Nothing strong enough was selected; Spark should abstain or ask for more context.');
  }
  lines.push('', 'Rule: this explains evidence; it is not durable truth by itself.');
  return lines.join('\n').replace(/\n{3,}/g, '\n\n').trim();
}

const MEMORY_FEEDBACK_VERDICTS = new Set(['good', 'bad', 'ugly', 'wrong', 'missing', 'useful', 'not_useful']);

function normalizeMemoryFeedbackVerdict(value: string): string | null {
  const normalized = value.trim().toLowerCase().replace(/[\s-]+/g, '_');
  return MEMORY_FEEDBACK_VERDICTS.has(normalized) ? normalized : null;
}

export function parseMemoryFeedbackCommand(text: string): MemoryFeedbackCommand | null {
  const match = text.match(/^\/memory(?:@\w+)?\s+(good|bad|ugly|wrong|missing|useful|not[-_\s]?useful|feedback)\b\s*([\s\S]*)$/i);
  if (!match) return null;
  let verb = match[1].trim();
  let rest = (match[2] || '').trim();
  if (verb.toLowerCase() === 'feedback') {
    const firstToken = rest.match(/^(good|bad|ugly|wrong|missing|useful|not[-_\s]?useful)\b\s*([\s\S]*)$/i);
    if (firstToken) {
      verb = firstToken[1];
      rest = (firstToken[2] || '').trim();
    } else {
      verb = 'useful';
    }
  }
  const verdict = normalizeMemoryFeedbackVerdict(verb);
  if (!verdict || !rest) return null;

  const targetEvent = rest.match(/\b(evt[-_A-Za-z0-9]+)\b/);
  const targetTrace = rest.match(/\btrace[:=]([A-Za-z0-9_.:-]+)\b/i);
  const targetEventId = targetEvent?.[1];
  const targetTraceRef = targetTrace?.[1];
  let note = rest;
  if (targetEventId) note = note.replace(targetEventId, '').trim();
  if (targetTrace?.[0]) note = note.replace(targetTrace[0], '').trim();
  note = note.replace(/^(?:because|:|-)\s*/i, '').trim();
  if (!note) return null;
  return { verdict, note, targetEventId, targetTraceRef };
}

export function selectMemoryFeedbackTargetFromPayload(payload: unknown): MemoryFeedbackTarget | null {
  const root = objectValue(payload);
  const agentRows = arrayValue(root.agent_view).map(objectValue);
  for (const row of agentRows) {
    const eventId = stringValue(row.event_id);
    if (eventId) {
      return {
        eventId,
        traceRef: stringValue(row.trace_ref) || undefined,
        label: stringValue(row.predicate) || stringValue(row.event_type) || undefined,
      };
    }
  }
  const sessions = arrayValue(root.sessions).map(objectValue);
  for (const session of sessions) {
    const events = arrayValue(session.events).map(objectValue);
    for (const event of events) {
      const eventId = stringValue(event.event_id);
      if (eventId) {
        return {
          eventId,
          traceRef: stringValue(event.trace_ref) || undefined,
          label: stringValue(event.snippet) || stringValue(event.role) || undefined,
        };
      }
    }
  }
  const selectedSources = arrayValue(root.selected_sources).map(objectValue);
  for (const source of selectedSources) {
    const eventId = stringValue(source.event_id);
    if (eventId) {
      return {
        eventId,
        traceRef: stringValue(source.source_ref) || undefined,
        label: stringValue(source.predicate) || stringValue(source.source_class) || undefined,
      };
    }
  }
  return null;
}

export function formatMemoryFeedbackReply(payload: unknown): string {
  const root = objectValue(payload);
  const target = objectValue(root.target);
  const targetLabel =
    stringValue(target.event_id) ||
    stringValue(root.target_event_id) ||
    stringValue(root.target_trace_ref) ||
    'general memory review';
  const lines = [
    'Memory feedback recorded',
    '',
    `Verdict: ${stringValue(root.verdict) || 'recorded'}`,
    `Target: ${targetLabel}`,
    `Note: ${truncateForPrompt(stringValue(root.note) || 'saved for review', 220)}`,
    '',
    'I will treat this as review evidence, not as durable memory truth.',
  ];
  return lines.join('\n').replace(/\n{3,}/g, '\n\n').trim();
}

export function formatMemoryFeedbackReviewReply(payload: unknown): string {
  const root = objectValue(payload);
  const counts = objectValue(root.counts);
  const recent = arrayValue(root.recent_feedback).map(objectValue).slice(0, 4);
  const queue = arrayValue(root.review_queue).map(objectValue).slice(0, 4);
  const lines = [
    'Memory feedback review',
    '',
    `Feedback: total ${numericValue(counts.total_feedback)}, targeted ${numericValue(counts.targeted_feedback)}, general ${numericValue(counts.general_feedback)}`,
    `Signals: bad ${numericValue(counts.bad)}, wrong ${numericValue(counts.wrong)}, missing ${numericValue(counts.missing)}, useful ${numericValue(counts.useful)}`,
  ];
  if (recent.length) {
    lines.push('', 'Recent feedback');
    for (const item of recent) {
      const target = objectValue(item.target);
      const targetLabel =
        stringValue(target.event_id) ||
        stringValue(item.target_event_id) ||
        stringValue(target.predicate) ||
        'general';
      lines.push(`- ${stringValue(item.verdict) || 'feedback'} on ${targetLabel}: ${truncateForPrompt(stringValue(item.note), 130)}`);
    }
  } else {
    lines.push('', 'Recent feedback');
    lines.push('- No memory feedback recorded for this Telegram user yet.');
  }
  if (queue.length) {
    lines.push('', 'Needs review');
    for (const item of queue) {
      const label = stringValue(item.predicate) || stringValue(item.event_type) || 'memory decision';
      const movement = stringValue(item.movement_hint) || 'review';
      lines.push(`- ${movement}: ${truncateForPrompt(label, 130)}`);
    }
  }
  lines.push('', 'Rule: feedback is review evidence, not durable memory truth.');
  return lines.join('\n').replace(/\n{3,}/g, '\n\n').trim();
}

export function formatWikiStatusReply(payload: unknown): string {
  const root = objectValue(payload);
  const healthy = Boolean(root.healthy || root.valid);
  const missingBootstrap = arrayValue(root.missing_bootstrap_files);
  const missingSystem = arrayValue(root.missing_system_compile_files);
  const warnings = arrayValue(root.warnings).map((item) => stringValue(item)).filter(Boolean).slice(0, 4);
  const generatedCount = numericValue(root.refreshed_file_count);
  const wikiStatus = stringValue(root.wiki_retrieval_status) || 'unknown';
  const wikiRecords = numericValue(root.wiki_record_count);
  const lines = [
    'Spark LLM wiki',
    '',
    `Health: ${healthy ? 'ready' : 'needs attention'}`,
    `Vault: ${stringValue(root.output_dir) || 'unknown'}`,
    `Pages: ${numericValue(root.markdown_page_count)} markdown`,
    `Retrieval: ${wikiStatus} (${wikiRecords} hits)`,
    `Knowledge priority: ${root.project_knowledge_first ? 'project/system first' : 'not confirmed'}`,
    `Missing: ${missingBootstrap.length + missingSystem.length ? `${missingBootstrap.length} bootstrap, ${missingSystem.length} generated` : 'none'}`,
  ];
  if (root.refreshed) {
    lines.push(`Refresh: regenerated ${generatedCount} system pages`);
  }
  if (warnings.length) {
    lines.push('', 'Warnings');
    lines.push(...warnings.map((item) => `- ${item}`));
  }
  lines.push('', 'Rule: wiki is supporting project knowledge; live traces and status still win for current truth.');
  return lines.join('\n').replace(/\n{3,}/g, '\n\n').trim();
}

export function formatWikiInventoryReply(payload: unknown): string {
  const root = objectValue(payload);
  const pages = arrayValue(root.pages).map(objectValue).slice(0, 10);
  const sections = objectEntries(root.section_counts)
    .filter(([, count]) => typeof count === 'number')
    .map(([section, count]) => `${section}: ${count}`)
    .join(', ') || 'none';
  const missing = arrayValue(root.missing_expected_files).map((item) => stringValue(item)).filter(Boolean);
  const lines = [
    'Spark LLM wiki inventory',
    '',
    `Vault: ${stringValue(root.output_dir) || 'unknown'}`,
    `Pages: ${numericValue(root.page_count)} total, ${numericValue(root.returned_page_count)} shown`,
    `Sections: ${sections}`,
    `Missing expected: ${missing.length ? missing.length : 'none'}`,
  ];
  if (root.refreshed) {
    lines.push(`Refresh: regenerated ${numericValue(root.refreshed_file_count)} system pages`);
  }
  if (pages.length) {
    lines.push('', 'Top pages');
    for (const page of pages) {
      const pagePath = stringValue(page.path);
      const title = stringValue(page.title) || pagePath;
      const summary = stringValue(page.summary);
      lines.push(`- ${pagePath}: ${title}`);
      if (summary) {
        lines.push(`  ${summary}`);
      }
    }
  }
  if (missing.length) {
    lines.push('', 'Missing');
    lines.push(...missing.slice(0, 8).map((item) => `- ${item}`));
  }
  lines.push('', 'Rule: this lists available project knowledge; retrieval and live traces decide what to use for an answer.');
  return lines.join('\n').replace(/\n{3,}/g, '\n\n').trim();
}

export function formatWikiQueryReply(payload: unknown): string {
  const root = objectValue(payload);
  const hits = arrayValue(root.hits).map(objectValue).slice(0, 5);
  const warnings = arrayValue(root.warnings).map((item) => stringValue(item)).filter(Boolean).slice(0, 4);
  const lines = [
    'Spark LLM wiki query',
    '',
    `Query: ${stringValue(root.query) || 'unknown'}`,
    `Retrieval: ${stringValue(root.wiki_retrieval_status) || 'unknown'} (${numericValue(root.hit_count)} hits)`,
    `Knowledge priority: ${root.project_knowledge_first ? 'project/system first' : 'not confirmed'}`,
  ];
  if (root.refreshed) {
    lines.push(`Refresh: regenerated ${numericValue(root.refreshed_file_count)} system pages`);
  }
  if (hits.length) {
    lines.push('', 'Relevant packets');
    for (const hit of hits) {
      const title = stringValue(hit.title) || stringValue(hit.source_path) || 'wiki packet';
      const sourcePath = stringValue(hit.source_path);
      const text = truncateForPrompt(stringValue(hit.text), 360);
      lines.push(`- ${title}`);
      if (sourcePath) {
        lines.push(`  source: ${sourcePath}`);
      }
      if (text) {
        lines.push(`  ${text}`);
      }
    }
  } else {
    lines.push('', 'No matching wiki packets found for that phrasing.');
  }
  if (warnings.length) {
    lines.push('', 'Warnings');
    lines.push(...warnings.map((item) => `- ${item}`));
  }
  lines.push('', 'Rule: these are supporting packets, not live truth; live status and traces still win.');
  return lines.join('\n').replace(/\n{3,}/g, '\n\n').trim();
}

export function formatWikiAnswerReply(payload: unknown): string {
  const root = objectValue(payload);
  const sources = arrayValue(root.sources).map(objectValue).slice(0, 4);
  const missing = arrayValue(root.missing_live_verification).map((item) => stringValue(item)).filter(Boolean).slice(0, 4);
  const warnings = arrayValue(root.warnings).map((item) => stringValue(item)).filter(Boolean).slice(0, 4);
  const liveSelf = objectValue(root.live_self_awareness);
  const observed = arrayValue(liveSelf.observed_now).map(objectValue).map((item) => stringValue(item.claim)).filter(Boolean).slice(0, 2);
  const lacks = arrayValue(liveSelf.lacks).map(objectValue).map((item) => stringValue(item.claim)).filter(Boolean).slice(0, 2);
  const improvements = arrayValue(liveSelf.improvement_options).map(objectValue).map((item) => stringValue(item.claim)).filter(Boolean).slice(0, 2);
  const lines = [
    'Spark LLM wiki answer',
    '',
    stringValue(root.answer) || 'I could not build a wiki-backed answer for that question.',
    '',
    `Evidence: ${stringValue(root.evidence_level) || 'unknown'} (${numericValue(root.hit_count)} wiki hits)`,
    `Knowledge priority: ${root.project_knowledge_first ? 'project/system first' : 'not confirmed'}`,
  ];
  if (stringValue(root.live_context_status) === 'included') {
    lines.push('', 'Live self snapshot');
    if (observed.length) {
      lines.push('What looks live');
      lines.push(...observed.map((item) => `- ${compactSelfAwarenessClaim(item)}`));
    }
    if (lacks.length) {
      lines.push('Where I still lack');
      lines.push(...lacks.map((item) => `- ${compactSelfAwarenessClaim(item)}`));
    }
    if (improvements.length) {
      lines.push('Best next improvements');
      lines.push(...improvements.map((item) => `- ${compactSelfAwarenessClaim(item)}`));
    }
  }
  if (sources.length) {
    lines.push('', 'Sources');
    for (const source of sources) {
      const title = stringValue(source.title) || 'wiki source';
      const sourcePath = stringValue(source.source_path);
      lines.push(sourcePath ? `- ${title}: ${sourcePath}` : `- ${title}`);
    }
  }
  if (missing.length) {
    lines.push('', 'Still needs live verification');
    lines.push(...missing.map((item) => `- ${item}`));
  }
  if (warnings.length) {
    lines.push('', 'Warnings');
    lines.push(...warnings.map((item) => `- ${item}`));
  }
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

export async function runBuilderMemoryDashboard(
  input: BuilderMemoryDashboardInput
): Promise<BuilderMemoryDashboardResult> {
  const config = resolveBridgeConfig();
  const bridgeAvailable = await ensureBridgeAvailable(config);
  if (!bridgeAvailable) {
    throw new Error(`Builder bridge unavailable. repo=${config.builderRepo} home=${config.builderHome}`);
  }

  const userId = String(input.userId).trim();
  const { stdout, stderr } = await execFileAsync(
    config.pythonCommand,
    pythonModuleInvocation(config, 'spark_intelligence.cli', [
      'memory',
      'dashboard',
      '--home',
      config.builderHome,
      '--human-id',
      `human:telegram:${userId}`,
      '--agent-id',
      `agent:human:telegram:${userId}`,
      '--limit',
      String(input.limit || 40),
      '--json',
    ]),
    withHiddenWindows({
      cwd: config.builderRepo,
      env: pythonSourceEnv(config),
      timeout: positiveIntegerEnv(process.env, 'SPARK_MEMORY_DASHBOARD_TIMEOUT_MS', Math.min(config.timeoutMs, 10000)),
      maxBuffer: 1024 * 1024,
    })
  );
  const trimmedStdout = stdout.trim();
  if (!trimmedStdout) {
    throw new Error(`Builder memory dashboard returned empty stdout. stderr=${redactText(stderr.trim())}`);
  }
  const payload = JSON.parse(trimmedStdout) as Record<string, unknown>;
  return {
    payload,
    replyText: formatMemoryDashboardReply(payload),
  };
}

export async function runBuilderMemorySessionSearch(
  input: BuilderMemorySessionSearchInput
): Promise<BuilderMemorySessionSearchResult> {
  const config = resolveBridgeConfig();
  const bridgeAvailable = await ensureBridgeAvailable(config);
  if (!bridgeAvailable) {
    throw new Error(`Builder bridge unavailable. repo=${config.builderRepo} home=${config.builderHome}`);
  }

  const userId = String(input.userId).trim();
  const { stdout, stderr } = await execFileAsync(
    config.pythonCommand,
    pythonModuleInvocation(config, 'spark_intelligence.cli', [
      'memory',
      'search-sessions',
      '--home',
      config.builderHome,
      '--human-id',
      `human:telegram:${userId}`,
      '--agent-id',
      `agent:human:telegram:${userId}`,
      '--query',
      input.query,
      '--limit',
      String(input.limit || 4),
      '--json',
    ]),
    withHiddenWindows({
      cwd: config.builderRepo,
      env: pythonSourceEnv(config),
      timeout: positiveIntegerEnv(process.env, 'SPARK_MEMORY_SEARCH_TIMEOUT_MS', Math.min(config.timeoutMs, 10000)),
      maxBuffer: 1024 * 1024,
    })
  );
  const trimmedStdout = stdout.trim();
  if (!trimmedStdout) {
    throw new Error(`Builder memory search returned empty stdout. stderr=${redactText(stderr.trim())}`);
  }
  const payload = JSON.parse(trimmedStdout) as Record<string, unknown>;
  return {
    payload,
    replyText: formatMemorySessionSearchReply(payload),
  };
}

export async function runBuilderMemorySource(
  input: BuilderMemorySourceInput
): Promise<BuilderMemorySourceResult> {
  const config = resolveBridgeConfig();
  const bridgeAvailable = await ensureBridgeAvailable(config);
  if (!bridgeAvailable) {
    throw new Error(`Builder bridge unavailable. repo=${config.builderRepo} home=${config.builderHome}`);
  }

  const userId = String(input.userId).trim();
  const { stdout, stderr } = await execFileAsync(
    config.pythonCommand,
    pythonModuleInvocation(config, 'spark_intelligence.cli', [
      'memory',
      'explain-source',
      '--home',
      config.builderHome,
      '--query',
      input.query,
      '--subject',
      `human:telegram:${userId}`,
      '--limit',
      String(input.limit || 5),
      '--json',
    ]),
    withHiddenWindows({
      cwd: config.builderRepo,
      env: pythonSourceEnv(config),
      timeout: positiveIntegerEnv(process.env, 'SPARK_MEMORY_SOURCE_TIMEOUT_MS', Math.min(config.timeoutMs, 10000)),
      maxBuffer: 1024 * 1024,
    })
  );
  const trimmedStdout = stdout.trim();
  if (!trimmedStdout) {
    throw new Error(`Builder memory source explanation returned empty stdout. stderr=${redactText(stderr.trim())}`);
  }
  const payload = JSON.parse(trimmedStdout) as Record<string, unknown>;
  return {
    payload,
    replyText: formatMemorySourceReply(payload),
  };
}

export async function runBuilderMemoryFeedback(
  input: BuilderMemoryFeedbackInput
): Promise<BuilderMemoryFeedbackResult> {
  const config = resolveBridgeConfig();
  const bridgeAvailable = await ensureBridgeAvailable(config);
  if (!bridgeAvailable) {
    throw new Error(`Builder bridge unavailable. repo=${config.builderRepo} home=${config.builderHome}`);
  }

  const userId = String(input.userId).trim();
  const chatId = String(input.chatId).trim();
  const args = pythonModuleInvocation(config, 'spark_intelligence.cli', [
    'memory',
    'record-feedback',
    '--home',
    config.builderHome,
    '--human-id',
    `human:telegram:${userId}`,
    '--agent-id',
    `agent:human:telegram:${userId}`,
    '--session-id',
    `session:telegram:${chatId}:${userId}`,
    '--surface',
    'telegram',
    '--verdict',
    input.verdict,
    '--note',
    input.note,
    '--json',
  ]);
  if (input.targetEventId) {
    args.push('--target-event-id', input.targetEventId);
  }
  if (input.targetTraceRef) {
    args.push('--target-trace-ref', input.targetTraceRef);
  }

  const { stdout, stderr } = await execFileAsync(
    config.pythonCommand,
    args,
    withHiddenWindows({
      cwd: config.builderRepo,
      env: pythonSourceEnv(config),
      timeout: positiveIntegerEnv(process.env, 'SPARK_MEMORY_FEEDBACK_TIMEOUT_MS', Math.min(config.timeoutMs, 10000)),
      maxBuffer: 1024 * 1024,
    })
  );
  const trimmedStdout = stdout.trim();
  if (!trimmedStdout) {
    throw new Error(`Builder memory feedback returned empty stdout. stderr=${redactText(stderr.trim())}`);
  }
  const payload = JSON.parse(trimmedStdout) as Record<string, unknown>;
  return {
    payload,
    replyText: formatMemoryFeedbackReply(payload),
  };
}

export async function runBuilderMemoryFeedbackReview(
  input: BuilderMemoryFeedbackReviewInput
): Promise<BuilderMemoryFeedbackReviewResult> {
  const config = resolveBridgeConfig();
  const bridgeAvailable = await ensureBridgeAvailable(config);
  if (!bridgeAvailable) {
    throw new Error(`Builder bridge unavailable. repo=${config.builderRepo} home=${config.builderHome}`);
  }

  const userId = String(input.userId).trim();
  const { stdout, stderr } = await execFileAsync(
    config.pythonCommand,
    pythonModuleInvocation(config, 'spark_intelligence.cli', [
      'memory',
      'review-feedback',
      '--home',
      config.builderHome,
      '--human-id',
      `human:telegram:${userId}`,
      '--agent-id',
      `agent:human:telegram:${userId}`,
      '--limit',
      String(input.limit || 20),
      '--json',
    ]),
    withHiddenWindows({
      cwd: config.builderRepo,
      env: pythonSourceEnv(config),
      timeout: positiveIntegerEnv(process.env, 'SPARK_MEMORY_FEEDBACK_TIMEOUT_MS', Math.min(config.timeoutMs, 10000)),
      maxBuffer: 1024 * 1024,
    })
  );
  const trimmedStdout = stdout.trim();
  if (!trimmedStdout) {
    throw new Error(`Builder memory feedback review returned empty stdout. stderr=${redactText(stderr.trim())}`);
  }
  const payload = JSON.parse(trimmedStdout) as Record<string, unknown>;
  return {
    payload,
    replyText: formatMemoryFeedbackReviewReply(payload),
  };
}

export async function runBuilderWikiStatus(input: { refresh?: boolean } = {}): Promise<BuilderWikiStatusResult> {
  const config = resolveBridgeConfig();
  const bridgeAvailable = await ensureBridgeAvailable(config);
  if (!bridgeAvailable) {
    throw new Error(`Builder bridge unavailable. repo=${config.builderRepo} home=${config.builderHome}`);
  }

  const args = [
    'wiki',
    'status',
    '--home',
    config.builderHome,
    '--json',
  ];
  if (input.refresh !== false) {
    args.push('--refresh');
  }

  let stdout = '';
  let stderr = '';
  try {
    const result = await execFileAsync(
      config.pythonCommand,
      pythonModuleInvocation(config, 'spark_intelligence.cli', args),
      withHiddenWindows({
        cwd: config.builderRepo,
        env: pythonSourceEnv(config),
        timeout: positiveIntegerEnv(process.env, 'SPARK_WIKI_BRIDGE_TIMEOUT_MS', Math.min(config.timeoutMs, 30000)),
        maxBuffer: 1024 * 1024,
      })
    );
    stdout = result.stdout;
    stderr = result.stderr;
  } catch (error) {
    const maybeOutput = error as { stdout?: unknown; stderr?: unknown };
    stdout = typeof maybeOutput.stdout === 'string' ? maybeOutput.stdout : '';
    stderr = typeof maybeOutput.stderr === 'string' ? maybeOutput.stderr : '';
    if (!stdout.trim()) {
      throw error;
    }
  }

  const trimmedStdout = stdout.trim();
  if (!trimmedStdout) {
    throw new Error(`Builder wiki status returned empty stdout. stderr=${redactText(stderr.trim())}`);
  }
  const payload = JSON.parse(trimmedStdout) as Record<string, unknown>;
  return {
    payload,
    replyText: formatWikiStatusReply(payload),
  };
}

export async function runBuilderWikiInventory(input: { refresh?: boolean; limit?: number } = {}): Promise<BuilderWikiInventoryResult> {
  const config = resolveBridgeConfig();
  const bridgeAvailable = await ensureBridgeAvailable(config);
  if (!bridgeAvailable) {
    throw new Error(`Builder bridge unavailable. repo=${config.builderRepo} home=${config.builderHome}`);
  }

  const args = [
    'wiki',
    'inventory',
    '--home',
    config.builderHome,
    '--limit',
    String(input.limit || 12),
    '--json',
  ];
  if (input.refresh !== false) {
    args.push('--refresh');
  }

  const { stdout, stderr } = await execFileAsync(
    config.pythonCommand,
    pythonModuleInvocation(config, 'spark_intelligence.cli', args),
    withHiddenWindows({
      cwd: config.builderRepo,
      env: pythonSourceEnv(config),
      timeout: positiveIntegerEnv(process.env, 'SPARK_WIKI_BRIDGE_TIMEOUT_MS', Math.min(config.timeoutMs, 30000)),
      maxBuffer: 1024 * 1024,
    })
  );
  const trimmedStdout = stdout.trim();
  if (!trimmedStdout) {
    throw new Error(`Builder wiki inventory returned empty stdout. stderr=${redactText(stderr.trim())}`);
  }
  const payload = JSON.parse(trimmedStdout) as Record<string, unknown>;
  return {
    payload,
    replyText: formatWikiInventoryReply(payload),
  };
}

export async function runBuilderWikiQuery(
  input: { query: string; refresh?: boolean; limit?: number }
): Promise<BuilderWikiQueryResult> {
  const config = resolveBridgeConfig();
  const bridgeAvailable = await ensureBridgeAvailable(config);
  if (!bridgeAvailable) {
    throw new Error(`Builder bridge unavailable. repo=${config.builderRepo} home=${config.builderHome}`);
  }

  const args = [
    'wiki',
    'query',
    input.query,
    '--home',
    config.builderHome,
    '--limit',
    String(input.limit || 5),
    '--json',
  ];
  if (input.refresh !== false) {
    args.push('--refresh');
  }

  let stdout = '';
  let stderr = '';
  try {
    const result = await execFileAsync(
      config.pythonCommand,
      pythonModuleInvocation(config, 'spark_intelligence.cli', args),
      withHiddenWindows({
        cwd: config.builderRepo,
        env: pythonSourceEnv(config),
        timeout: positiveIntegerEnv(process.env, 'SPARK_WIKI_BRIDGE_TIMEOUT_MS', Math.min(config.timeoutMs, 30000)),
        maxBuffer: 1024 * 1024,
      })
    );
    stdout = result.stdout;
    stderr = result.stderr;
  } catch (error) {
    const maybeOutput = error as { stdout?: unknown; stderr?: unknown };
    stdout = typeof maybeOutput.stdout === 'string' ? maybeOutput.stdout : '';
    stderr = typeof maybeOutput.stderr === 'string' ? maybeOutput.stderr : '';
    if (!stdout.trim()) {
      throw error;
    }
  }

  const trimmedStdout = stdout.trim();
  if (!trimmedStdout) {
    throw new Error(`Builder wiki query returned empty stdout. stderr=${redactText(stderr.trim())}`);
  }
  const payload = JSON.parse(trimmedStdout) as Record<string, unknown>;
  return {
    payload,
    replyText: formatWikiQueryReply(payload),
  };
}

export async function runBuilderWikiAnswer(
  input: { question: string; refresh?: boolean; limit?: number; userId?: number | string; chatId?: number | string; currentMessage?: string }
): Promise<BuilderWikiAnswerResult> {
  const config = resolveBridgeConfig();
  const bridgeAvailable = await ensureBridgeAvailable(config);
  if (!bridgeAvailable) {
    throw new Error(`Builder bridge unavailable. repo=${config.builderRepo} home=${config.builderHome}`);
  }

  const args = [
    'wiki',
    'answer',
    input.question,
    '--home',
    config.builderHome,
    '--limit',
    String(input.limit || 5),
    '--json',
  ];
  if (input.userId !== undefined && input.userId !== null) {
    args.push('--human-id', `human:telegram:${String(input.userId).trim()}`);
  }
  if (input.chatId !== undefined && input.chatId !== null && input.userId !== undefined && input.userId !== null) {
    args.push('--session-id', `session:telegram:${String(input.chatId).trim()}:${String(input.userId).trim()}`);
  }
  if (input.chatId !== undefined || input.userId !== undefined) {
    args.push('--channel-kind', 'telegram');
  }
  if (input.currentMessage) {
    args.push('--user-message', input.currentMessage);
  }
  if (input.refresh !== false) {
    args.push('--refresh');
  }

  let stdout = '';
  let stderr = '';
  try {
    const result = await execFileAsync(
      config.pythonCommand,
      pythonModuleInvocation(config, 'spark_intelligence.cli', args),
      withHiddenWindows({
        cwd: config.builderRepo,
        env: pythonSourceEnv(config),
        timeout: positiveIntegerEnv(process.env, 'SPARK_WIKI_BRIDGE_TIMEOUT_MS', Math.min(config.timeoutMs, 30000)),
        maxBuffer: 1024 * 1024,
      })
    );
    stdout = result.stdout;
    stderr = result.stderr;
  } catch (error) {
    const maybeOutput = error as { stdout?: unknown; stderr?: unknown };
    stdout = typeof maybeOutput.stdout === 'string' ? maybeOutput.stdout : '';
    stderr = typeof maybeOutput.stderr === 'string' ? maybeOutput.stderr : '';
    if (!stdout.trim()) {
      throw error;
    }
  }

  const trimmedStdout = stdout.trim();
  if (!trimmedStdout) {
    throw new Error(`Builder wiki answer returned empty stdout. stderr=${redactText(stderr.trim())}`);
  }
  const payload = JSON.parse(trimmedStdout) as Record<string, unknown>;
  return {
    payload,
    replyText: formatWikiAnswerReply(payload),
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
