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

function normalizedWindowsPath(value: string): string {
  return path.win32.normalize(value).replace(/[\\/]+$/, '').toLowerCase();
}

function expectedLevel5SmokePaths(env: NodeJS.ProcessEnv): string[] {
  const roots = [
    env.TEMP?.trim(),
    env.TMP?.trim(),
    env.USERPROFILE?.trim() ? path.win32.join(env.USERPROFILE.trim(), 'AppData', 'Local', 'Temp') : null
  ].filter((value): value is string => Boolean(value && path.win32.isAbsolute(value)));
  return roots.map((root) => normalizedWindowsPath(path.win32.join(root, 'spark-telegram-level5-smoke.txt')));
}

function isExpectedLevel5SmokePath(filePath: string, env: NodeJS.ProcessEnv): boolean {
  const normalized = path.win32.normalize(filePath).toLowerCase();
  return expectedLevel5SmokePaths(env).includes(normalized);
}

function ownedFolderInspectionRoot(env: NodeJS.ProcessEnv): string | null {
  const configured = env.SPARK_PROJECT_ROOT?.trim();
  if (configured && path.win32.isAbsolute(configured)) return normalizedWindowsPath(configured);
  const userProfile = env.USERPROFILE?.trim();
  if (!userProfile || !path.win32.isAbsolute(userProfile)) return null;
  return normalizedWindowsPath(path.win32.join(userProfile, 'Desktop'));
}

function isOwnedFolderInspectionPath(folderPath: string, env: NodeJS.ProcessEnv): boolean {
  const ownerRoot = ownedFolderInspectionRoot(env);
  return Boolean(ownerRoot && normalizedWindowsPath(folderPath) === ownerRoot);
}

export function classifySafeOperatorAction(text: string): SafeOperatorAction | null {
  const normalized = normalizeMessage(text);
  const windowsPath = extractWindowsPath(text);

  if (
    windowsPath &&
    normalizedWindowsPath(windowsPath).endsWith('\\appdata\\local\\temp\\spark-telegram-level5-smoke.txt') &&
    /\blevel\s*5\b/.test(normalized) &&
    /\bsmoke\s+test\b/.test(normalized) &&
    /\bcreate\b.*\bwrite\b.*\bread\b.*\b(?:delete|remove)\b/.test(normalized) &&
    /\b(?:do\s+not|don't|dont)\s+touch\s+anything\s+else\b/.test(normalized)
  ) {
    return { kind: 'level5_smoke', filePath: windowsPath };
  }

  if (
    windowsPath &&
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

export function parseSafeOperatorAction(text: string, env: NodeJS.ProcessEnv = process.env): SafeOperatorAction | null {
  const candidate = classifySafeOperatorAction(text);
  if (candidate?.kind === 'level5_smoke') {
    return isExpectedLevel5SmokePath(candidate.filePath, env) ? candidate : null;
  }
  if (candidate?.kind === 'folder_list') {
    return isOwnedFolderInspectionPath(candidate.folderPath, env) ? candidate : null;
  }
  return null;
}

export function operatorActionRootBoundaryReply(): string {
  return "I can run that bounded check only inside the active Spark workspace or this Windows user's approved temporary folder. Nothing was opened or changed.";
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
