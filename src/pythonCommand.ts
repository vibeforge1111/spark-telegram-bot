import { accessSync, statSync } from 'node:fs';
import { constants as fsConstants } from 'node:fs';
import path from 'node:path';

const WINDOWS_SHELL_EXTENSIONS = new Set(['.bat', '.cmd', '.ps1']);

function hasPathSeparator(value: string): boolean {
  return value.includes('/') || value.includes('\\');
}

function assertSafePythonExecutable(candidate: string): string {
  const resolved = path.resolve(candidate);
  const extension = path.extname(resolved).toLowerCase();
  if (process.platform === 'win32' && WINDOWS_SHELL_EXTENSIONS.has(extension)) {
    throw new Error(`SPARK_BUILDER_PYTHON cannot point to a shell script: ${resolved}`);
  }
  const stat = statSync(resolved);
  if (!stat.isFile()) {
    throw new Error(`SPARK_BUILDER_PYTHON is not a file: ${resolved}`);
  }
  accessSync(resolved, fsConstants.F_OK);
  return resolved;
}

function pathCandidates(commandName: string, envPath: string): string[] {
  const extensions = process.platform === 'win32'
    ? (process.env.PATHEXT || '.EXE;.COM').split(';').filter(Boolean)
    : [''];
  return envPath
    .split(path.delimiter)
    .filter(Boolean)
    .flatMap((entry) => {
      const base = path.join(entry, commandName);
      if (path.extname(commandName)) {
        return [base];
      }
      return extensions.map((extension) => `${base}${extension.toLowerCase()}`);
    });
}

/**
 * Known alternative `python` command names, ordered by preference.
 * On Debian/Ubuntu under systemd, `python` is often absent while
 * `python3` is installed.  `python3.11` etc. are version-specific.
 */
const PYTHON_FALLBACKS = ['python3', 'python3.12', 'python3.11', 'python3.10'];

export function resolvePythonCommand(rawValue?: string, envPath = process.env.PATH || ''): string {
  const raw = (rawValue || 'python').trim() || 'python';

  // Absolute or relative path supplied via env – validate it eagerly so the
  // user gets a clear error during health checks, not mid-conversation.
  if (path.isAbsolute(raw) || hasPathSeparator(raw)) {
    return assertSafePythonExecutable(raw);
  }

  // Scan PATH for the configured command name.
  for (const candidate of pathCandidates(raw, envPath)) {
    try {
      return assertSafePythonExecutable(candidate);
    } catch {
      // Keep searching PATH.
    }
  }

  if (rawValue) {
    throw new Error(`SPARK_BUILDER_PYTHON was not found on PATH: ${raw}`);
  }

  // Default fallback: when no SPARK_BUILDER_PYTHON was configured and the
  // default `python` is not on PATH, try common alternatives before giving up.
  //
  // On many Linux distributions (Ubuntu, Debian, Fedora) running under
  // systemd, only `python3` is guaranteed to be available.  The `python`
  // symlink is a virtual package that is often not installed in minimal or
  // container-based environments.
  if (raw === 'python') {
    for (const fallback of PYTHON_FALLBACKS) {
      for (const candidate of pathCandidates(fallback, envPath)) {
        try {
          return assertSafePythonExecutable(candidate);
        } catch {
          // Keep searching.
        }
      }
    }
  }

  // Last resort: the calling code (builderBridge.ts) handles ENOENT by
  // logging a warning and falling back to the local conversation path.
  return raw;
}
