import { execFile } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import { withHiddenWindows } from './hiddenProcess';

const execFileAsync = promisify(execFile);

export type CapabilityGardenSummary = {
  present: boolean;
  cardCount: number;
  statusCounts: Record<string, number>;
  surfaceCounts: Record<string, number>;
  cards: Array<{
    id: string;
    ownerRepo: string;
    surfaceType: string;
    status: string;
    blockerCount: number;
    nextAction: string;
  }>;
  error?: string;
};

function objectValue(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function arrayValue(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function stringValue(value: unknown): string {
  return String(value || '').trim();
}

function numberValue(value: unknown): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function countBy(items: Array<Record<string, unknown>>, key: string): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const item of items) {
    const value = stringValue(item[key]) || 'unknown';
    counts[value] = (counts[value] || 0) + 1;
  }
  return Object.fromEntries(Object.entries(counts).sort(([a], [b]) => a.localeCompare(b)));
}

export function resolveCapabilityCatalogPath(env: NodeJS.ProcessEnv = process.env): string {
  const configured = env.SPARK_SYSTEM_MAP_DIR || env.SPARK_OS_SYSTEM_MAP_DIR;
  const root = configured && configured.trim()
    ? configured.trim()
    : path.join(os.homedir(), '.spark', 'state', 'system-map');
  return path.join(root, 'capability-catalog.json');
}

export function summarizeCapabilityCatalog(payload: unknown): CapabilityGardenSummary {
  const root = objectValue(payload);
  const cards = arrayValue(root.capability_cards).map(objectValue);
  const projected = cards.slice(0, 7).map((card) => ({
    id: stringValue(card.id),
    ownerRepo: stringValue(card.owner_repo),
    surfaceType: stringValue(card.surface_type) || 'unknown',
    status: stringValue(card.status) || 'unknown',
    blockerCount: arrayValue(card.blockers).length,
    nextAction: stringValue(card.next_action)
  }));
  return {
    present: Object.keys(root).length > 0,
    cardCount: cards.length,
    statusCounts: countBy(cards, 'status'),
    surfaceCounts: countBy(cards, 'surface_type'),
    cards: projected
  };
}

export type SparkOsCompileAttempt = {
  attempted: boolean;
  succeeded: boolean;
  detail: string;
};

export type SparkOsCompileRunner = (
  args: string[]
) => Promise<{ code: number; stdout: string; stderr: string }>;

const NO_COMPILE_ATTEMPT: SparkOsCompileAttempt = {
  attempted: false,
  succeeded: false,
  detail: ''
};

export async function runSparkOsCompile(
  runner: SparkOsCompileRunner = defaultSparkOsCompileRunner
): Promise<SparkOsCompileAttempt> {
  try {
    const { code, stdout, stderr } = await runner(['os', 'compile']);
    const detail = [stdout, stderr].map((value) => String(value || '').trim()).filter(Boolean).join('\n');
    if (code === 0) {
      return {
        attempted: true,
        succeeded: true,
        detail: detail || 'spark os compile finished successfully.'
      };
    }
    return {
      attempted: true,
      succeeded: false,
      detail: detail || `spark os compile exited with code ${code}.`
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      attempted: true,
      succeeded: false,
      detail: `spark os compile failed: ${message}`
    };
  }
}

function childProcessText(value: unknown): string {
  if (Buffer.isBuffer(value)) {
    return value.toString('utf8');
  }
  return typeof value === 'string' ? value : '';
}

async function defaultSparkOsCompileRunner(args: string[]): Promise<{ code: number; stdout: string; stderr: string }> {
  try {
    const { stdout, stderr } = await execFileAsync('spark', args, withHiddenWindows({
      timeout: 120_000,
      maxBuffer: 1024 * 1024
    }));
    return { code: 0, stdout: String(stdout || ''), stderr: String(stderr || '') };
  } catch (error: unknown) {
    const err = error as NodeJS.ErrnoException & { stdout?: unknown; stderr?: unknown };
    const stderr = childProcessText(err.stderr) || (error instanceof Error ? error.message : String(error));
    return {
      code: typeof err.code === 'number' ? err.code : 1,
      stdout: childProcessText(err.stdout),
      stderr
    };
  }
}

export async function readCapabilityGardenSummary(catalogPath = resolveCapabilityCatalogPath()): Promise<CapabilityGardenSummary> {
  try {
    const raw = await readFile(catalogPath, 'utf-8');
    return summarizeCapabilityCatalog(JSON.parse(raw));
  } catch (error) {
    return {
      present: false,
      cardCount: 0,
      statusCounts: {},
      surfaceCounts: {},
      cards: [],
      error: error instanceof Error ? error.message : String(error)
    };
  }
}

export async function readCapabilityGardenSummaryEnsuringCompiled(options: {
  catalogPath?: string;
  compileRunner?: SparkOsCompileRunner;
  autoCompile?: boolean;
} = {}): Promise<{ summary: CapabilityGardenSummary; compile: SparkOsCompileAttempt }> {
  const catalogPath = options.catalogPath ?? resolveCapabilityCatalogPath();
  let summary = await readCapabilityGardenSummary(catalogPath);
  if (summary.present || options.autoCompile === false) {
    return { summary, compile: NO_COMPILE_ATTEMPT };
  }

  const compile = await runSparkOsCompile(options.compileRunner);
  if (compile.succeeded) {
    summary = await readCapabilityGardenSummary(catalogPath);
  }
  return { summary, compile };
}

function countText(counts: Record<string, number>, preferred: string[]): string {
  const parts = preferred
    .map((key) => [key, numberValue(counts[key])] as const)
    .filter(([, count]) => count > 0)
    .map(([key, count]) => `${key}=${count}`);
  return parts.length ? parts.join(', ') : 'none yet';
}

export function renderCapabilityGardenSummary(
  summary: CapabilityGardenSummary,
  compile: SparkOsCompileAttempt = NO_COMPILE_ATTEMPT
): string {
  if (!summary.present) {
    const lines = [
      'Capability garden is not compiled yet.',
      '',
      'Move',
      '• Run `spark os compile`, then try `/capabilities` again.'
    ];
    if (compile.attempted) {
      lines.push('', 'Auto-compile');
      lines.push(compile.succeeded
        ? '• Compile finished, but capability-catalog.json is still missing.'
        : `• ${compile.detail}`);
      if (!compile.succeeded) {
        lines.push('• Fix the compile error above, then run `/capabilities` again.');
      }
    }
    return lines.join('\n');
  }

  const localArtifacts = numberValue(summary.statusCounts['local-artifacts']);
  const headline = localArtifacts > 0
    ? 'Capability garden needs review.'
    : summary.cardCount > 0
      ? 'Capability garden is visible.'
      : 'Capability garden is empty.';
  const lines = [
    headline,
    '',
    'State',
    `• ${summary.cardCount} cards`,
    `• Status: ${countText(summary.statusCounts, ['local-artifacts', 'schema-shaped', 'seen'])}`,
    `• Surfaces: ${countText(summary.surfaceCounts, ['creator-system', 'specialization-path'])}`,
    '',
    'Review',
    '• Cards are evidence, not trust.',
    '• Gate verdicts, privacy review, rollback refs, and publication proof still decide promotion.'
  ];

  if (summary.cards.length) {
    lines.push('', 'Top cards');
    for (const card of summary.cards.slice(0, 3)) {
      lines.push(`• ${card.id || card.ownerRepo}: ${card.status}${card.blockerCount ? ` (${card.blockerCount} blockers)` : ''}`);
    }
  }

  lines.push('', 'Workspace', '• Full evidence: `spark os capabilities --json`');
  return lines.join('\n');
}
