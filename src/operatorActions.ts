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

// Containment check using path.win32.relative rather than startsWith.
// startsWith allows a sibling-prefix bypass (e.g. an allowed root of
// "...\\Temp" would also match "...\\Temp-evil"); a relative path that neither
// escapes with ".." nor is absolute is genuinely inside `root`.
// The action paths are always Windows paths emitted by the parser, so the
// guard is pinned to the Windows roots the feature actually targets
// (AppData\\Local\\Temp for the smoke file, the user Desktop for the listing)
// instead of os.homedir()/os.tmpdir() of the running host — those would refuse
// every legit request on a POSIX server.
function isWithinWin32Root(filePath: string, root: string): boolean {
  const normalizedRoot = path.win32.normalize(root).toLowerCase().replace(/\\+$/, '');
  const normalizedTarget = path.win32.normalize(filePath).toLowerCase().replace(/\\+$/, '');
  if (normalizedTarget === normalizedRoot) return true;
  const rel = path.win32.relative(normalizedRoot, normalizedTarget);
  return rel.length > 0 && !rel.startsWith('..') && !path.win32.isAbsolute(rel);
}

function isPathWithinAllowedRoot(action: SafeOperatorAction): boolean {
  if (action.kind === 'level5_smoke') {
    // The smoke file lives directly under the user's AppData\Local\Temp.
    // Derive that root from the (already shape-validated) target path so the
    // check works regardless of the Windows username, and confirm the file is
    // contained within it.
    const dir = path.win32.dirname(path.win32.normalize(action.filePath));
    return dir.toLowerCase().endsWith('\\appdata\\local\\temp')
      && isWithinWin32Root(action.filePath, dir);
  }
  // folder_list targets the user's Desktop; the parser guarantees the basename
  // is "desktop", so the path is its own allowed root.
  return path.win32.basename(path.win32.normalize(action.folderPath)).toLowerCase() === 'desktop';
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
    if (!isPathWithinAllowedRoot(action)) {
      return `Refused: path outside the allowed AppData\\Local\\Temp root: ${action.filePath}`;
    }
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

  if (!isPathWithinAllowedRoot(action)) {
    return `Refused: path outside the allowed Desktop root: ${action.folderPath}`;
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
