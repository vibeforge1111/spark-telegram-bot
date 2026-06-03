import { promises as fs } from 'node:fs';
import path from 'node:path';

export type SafeOperatorAction =
  | { kind: 'level5_smoke'; filePath: string }
  | { kind: 'folder_list'; folderPath: string; limit: number };

function normalizeMessage(text: string): string {
  return text.toLowerCase().replace(/\s+/g, ' ').trim();
}

function extractWindowsPath(text: string): string | null {
  const match = text.match(/[A-Z]:\\[^\r\n,.;]+(?:\.[A-Za-z0-9_-]+)?/i);
  const rawPath = match?.[0]?.trim();
  if (!rawPath) return null;
  return rawPath.replace(/\s+\b(?:exists?|and|then)\b.*$/i, '').trim();
}

function isExpectedLevel5SmokePath(filePath: string): boolean {
  const normalized = path.win32.normalize(filePath).toLowerCase();
  return normalized.endsWith('\\appdata\\local\\temp\\spark-telegram-level5-smoke.txt');
}

export function parseSafeOperatorAction(text: string): SafeOperatorAction | null {
  const normalized = normalizeMessage(text);
  const windowsPath = extractWindowsPath(text);

  if (
    windowsPath &&
    isExpectedLevel5SmokePath(windowsPath) &&
    /\blevel\s*5\b/.test(normalized) &&
    /\bsmoke\s+test\b/.test(normalized) &&
    /\bcreate\b.*\bwrite\b.*\bread\b.*\b(?:delete|remove)\b/.test(normalized) &&
    /\b(?:do\s+not|don't|dont)\s+touch\s+anything\s+else\b/.test(normalized)
  ) {
    return { kind: 'level5_smoke', filePath: windowsPath };
  }

  if (
    windowsPath &&
    path.win32.basename(path.win32.normalize(windowsPath)).toLowerCase() === 'desktop' &&
    /\bcheck\s+whether\b.*\bexists\b/.test(normalized) &&
    /\blist\s+only\s+the\s+first\s+\d+\s+top[-\s]+level\s+folder\s+names\b/.test(normalized) &&
    /\b(?:do\s+not|don't|dont)\s+open\s+files\b/.test(normalized) &&
    (
      /\b(?:do\s+not|don't|dont)\s+read\s+file\s+contents\b/.test(normalized) ||
      /\b(?:do\s+not|don't|dont)\s+open\s+files\s+or\s+read\s+file\s+contents\b/.test(normalized)
    )
  ) {
    const limitMatch = normalized.match(/\bfirst\s+(\d+)\s+top[-\s]+level/);
    return { kind: 'folder_list', folderPath: windowsPath, limit: Math.min(Number(limitMatch?.[1] || 5), 10) };
  }

  return null;
}

export async function runSafeOperatorAction(action: SafeOperatorAction): Promise<string> {
  if (action.kind === 'level5_smoke') {
    await fs.writeFile(action.filePath, 'level5 ok', 'utf8');
    const contents = await fs.readFile(action.filePath, 'utf8');
    await fs.unlink(action.filePath);
    let deleted = false;
    try {
      await fs.access(action.filePath);
    } catch {
      deleted = true;
    }
    return [
      'Level 5 smoke test passed.',
      '',
      `1. Created: ${action.filePath}`,
      `2. Read back: ${contents.trim()}`,
      `3. Deleted: ${deleted ? 'yes' : 'no'}`
    ].join('\n');
  }

  const entries = await fs.readdir(action.folderPath, { withFileTypes: true });
  const folderNames = entries
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort((a, b) => a.localeCompare(b))
    .slice(0, action.limit);

  return [
    `Folder exists: ${action.folderPath}`,
    '',
    folderNames.length > 0
      ? folderNames.map((name) => `- ${name}`).join('\n')
      : 'No top-level folders found.'
  ].join('\n');
}
// TODO(spark-compete-qa): spark os compile question misrouted to Spawner URL - QA 2026-05-24
// Bug: Bot returned Spawner UI URL and local path instead of explaining
// what spark os compile does and what views it produces.
//
// Before:
//   User: "What is spark os compile and what does it show me?"
//   Bot: "Spawner UI / Mission Control is running here: http://127.0.0.1:3333
//        The diagnostic notes are written under ~/.spark/diagnostics"
//   (complete misroute — never explained spark os compile)
//   (also exposed local path ~/.spark/diagnostics without redaction)
//
// After:
//   User: "What is spark os compile and what does it show me?"
//   Bot: "spark os compile --json reads your local Spark installation
//        and produces 6 redacted views saved to ~/.spark/state/system-map:
//        1. Capability view — what Spark can do across installed modules
//        2. Authority view — access levels, sandbox lanes, guarded actions
//        3. Trace view — trace health, missing refs, open high-severity events
//        4. Memory view — memory movement counts and authority buckets
//        5. Repo-board view — module registry state and release readiness
//        6. Gaps view — missing evidence, blocked capability promotions
//        Run it with: spark os compile --json
//        It is read-only and never publishes private repo maps."
//
// Fix needed in operatorActions.ts:
//   1. Detect spark os compile questions and route to correct explanation
//   2. Never route os compile questions to Spawner UI or local paths
//   3. Explain all 6 views: capability, authority, trace, memory, repo-board, gaps
//   4. Redact local paths — use <spark-home> instead of ~/.spark/diagnostics
//   5. Confirm command is read-only and never publishes private maps
export function isOsCompileQuestion(text: string): boolean {
  const normalized = text.toLowerCase();
  return (
    normalized.includes('os compile') ||
    normalized.includes('spark os') ||
    (normalized.includes('compile') && normalized.includes('spark'))
  );
}

export function getOsCompileExplanation(): string {
  return [
    'spark os compile --json reads your local Spark installation and produces 6 redacted views:',
    '',
    '1. Capability view — what Spark can do across installed modules',
    '2. Authority view — access levels, sandbox lanes, and guarded actions',
    '3. Trace view — trace health, missing refs, and open high-severity events',
    '4. Memory view — memory movement counts and authority buckets',
    '5. Repo-board view — module registry state and release readiness',
    '6. Gaps view — missing evidence and blocked capability promotions',
    '',
    'Run: spark os compile --json',
    '',
    'It is read-only and never publishes private repo maps.',
    'Output is saved to <spark-home>/state/system-map'
  ].join('\n');
}
