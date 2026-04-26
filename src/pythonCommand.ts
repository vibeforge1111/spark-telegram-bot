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

export function resolvePythonCommand(rawValue?: string, envPath = process.env.PATH || ''): string {
  const raw = (rawValue || 'python').trim() || 'python';
  if (path.isAbsolute(raw) || hasPathSeparator(raw)) {
    return assertSafePythonExecutable(raw);
  }

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
  return raw;
}
