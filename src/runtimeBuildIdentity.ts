import { createHash } from 'node:crypto';
import {
  closeSync,
  constants,
  fstatSync,
  lstatSync,
  openSync,
  readFileSync,
  readdirSync,
  type Stats
} from 'node:fs';
import path from 'node:path';

export type RuntimeBuildArtifact = 'dist-js-tree' | 'src-ts-tree';

export interface RuntimeBuildIdentity {
  schema: 'spark.telegram.loaded-runtime.v1';
  artifact: RuntimeBuildArtifact;
  sha256: string;
  fileCount: number;
  loadedAt: string;
}

const SHA256_PATTERN = /^[0-9a-f]{64}$/;

function runtimeArtifact(entryFile: string): RuntimeBuildArtifact {
  const normalized = path.resolve(entryFile).replace(/\\/g, '/');
  if (normalized.endsWith('/dist/index.js')) return 'dist-js-tree';
  if (normalized.endsWith('/src/index.ts')) return 'src-ts-tree';
  throw new Error('Telegram runtime entry is not a supported source or compiled artifact.');
}

function runtimeExtension(artifact: RuntimeBuildArtifact): '.js' | '.ts' {
  return artifact === 'dist-js-tree' ? '.js' : '.ts';
}

interface RuntimeTreeSnapshot {
  files: string[];
  directories: Map<string, Stats>;
}

function runtimeTreeSnapshot(root: string, extension: '.js' | '.ts'): RuntimeTreeSnapshot {
  const files: string[] = [];
  const directories = new Map<string, Stats>();
  const visit = (directory: string): void => {
    const directoryStat = lstatSync(directory);
    if (directoryStat.isSymbolicLink() || !directoryStat.isDirectory()) {
      throw new Error('Telegram runtime tree root or directory is not a regular directory.');
    }
    directories.set(directory, directoryStat);
    const entries = readdirSync(directory, { withFileTypes: true })
      .sort((left, right) => left.name < right.name ? -1 : left.name > right.name ? 1 : 0);
    for (const entry of entries) {
      const absolute = path.join(directory, entry.name);
      const stat = lstatSync(absolute);
      if (stat.isSymbolicLink()) {
        throw new Error('Telegram runtime tree contains a symbolic link and cannot be attested.');
      }
      if (stat.isDirectory()) {
        visit(absolute);
      } else if (stat.isFile() && entry.name.endsWith(extension)) {
        files.push(absolute);
      }
    }
  };
  visit(root);
  return { files, directories };
}

function sameFileIdentity(left: Stats, right: Stats): boolean {
  return left.isFile()
    && right.isFile()
    && left.dev === right.dev
    && left.ino === right.ino
    && left.size === right.size
    && left.mtimeMs === right.mtimeMs
    && left.ctimeMs === right.ctimeMs;
}

function sameDirectoryIdentity(left: Stats, right: Stats): boolean {
  return left.isDirectory()
    && right.isDirectory()
    && left.dev === right.dev
    && left.ino === right.ino
    && left.mtimeMs === right.mtimeMs
    && left.ctimeMs === right.ctimeMs;
}

function verifyRuntimeDirectories(directories: Map<string, Stats>): void {
  for (const [directory, expected] of directories) {
    const current = lstatSync(directory);
    if (current.isSymbolicLink() || !sameDirectoryIdentity(expected, current)) {
      throw new Error('Telegram runtime directory changed while its identity was captured.');
    }
  }
}

function readRuntimeFileNoFollow(
  absolute: string,
  beforeFileOpenForTest?: (path: string) => void
): Buffer {
  const before = lstatSync(absolute);
  if (before.isSymbolicLink() || !before.isFile()) {
    throw new Error('Telegram runtime tree contains a symbolic link or non-file artifact.');
  }
  beforeFileOpenForTest?.(absolute);
  let descriptor: number | null = null;
  try {
    descriptor = openSync(
      absolute,
      constants.O_RDONLY | (typeof constants.O_NOFOLLOW === 'number' ? constants.O_NOFOLLOW : 0)
    );
    const opened = fstatSync(descriptor);
    if (!sameFileIdentity(before, opened)) {
      throw new Error('Telegram runtime artifact changed while its identity was captured.');
    }
    const bytes = readFileSync(descriptor);
    const after = lstatSync(absolute);
    if (after.isSymbolicLink() || !sameFileIdentity(opened, after) || bytes.length !== opened.size) {
      throw new Error('Telegram runtime artifact changed while its identity was captured.');
    }
    return bytes;
  } catch (error) {
    if (error instanceof Error && /Telegram runtime artifact changed/.test(error.message)) throw error;
    throw new Error('Telegram runtime artifact could not be opened without following links.', { cause: error });
  } finally {
    if (descriptor !== null) closeSync(descriptor);
  }
}

function hashRuntimeTree(
  root: string,
  snapshot: RuntimeTreeSnapshot,
  beforeFileOpenForTest?: (path: string) => void
): string {
  const hash = createHash('sha256');
  verifyRuntimeDirectories(snapshot.directories);
  for (const absolute of snapshot.files) {
    verifyRuntimeDirectories(snapshot.directories);
    const relative = path.relative(root, absolute).replace(/\\/g, '/');
    const bytes = readRuntimeFileNoFollow(absolute, beforeFileOpenForTest);
    verifyRuntimeDirectories(snapshot.directories);
    const length = Buffer.alloc(8);
    length.writeBigUInt64BE(BigInt(bytes.length));
    hash.update(relative);
    hash.update('\0');
    hash.update(length);
    hash.update(bytes);
  }
  verifyRuntimeDirectories(snapshot.directories);
  return hash.digest('hex');
}

export function captureRuntimeBuildIdentity(
  entryFile: string,
  loadedAt = new Date().toISOString(),
  beforeFileOpenForTest?: (path: string) => void
): RuntimeBuildIdentity {
  const artifact = runtimeArtifact(entryFile);
  const root = path.dirname(path.resolve(entryFile));
  const snapshot = runtimeTreeSnapshot(root, runtimeExtension(artifact));
  if (snapshot.files.length === 0 || !snapshot.files.includes(path.resolve(entryFile))) {
    throw new Error('Telegram runtime tree does not contain its expected entry artifact.');
  }
  return {
    schema: 'spark.telegram.loaded-runtime.v1',
    artifact,
    sha256: hashRuntimeTree(root, snapshot, beforeFileOpenForTest),
    fileCount: snapshot.files.length,
    loadedAt
  };
}

export function captureInstalledRuntimeBuildIdentity(
  moduleFile: string,
  artifact: RuntimeBuildArtifact
): RuntimeBuildIdentity {
  const packageRoot = path.resolve(path.dirname(moduleFile), '..');
  const entryFile = artifact === 'dist-js-tree'
    ? path.join(packageRoot, 'dist', 'index.js')
    : path.join(packageRoot, 'src', 'index.ts');
  return captureRuntimeBuildIdentity(entryFile);
}

export function parseRuntimeBuildIdentity(value: unknown): RuntimeBuildIdentity {
  if (!value || typeof value !== 'object') {
    throw new Error('Telegram runtime did not report a valid loaded-artifact identity; restart it from the current build.');
  }
  const candidate = value as Partial<RuntimeBuildIdentity>;
  if (
    candidate.schema !== 'spark.telegram.loaded-runtime.v1'
    || (candidate.artifact !== 'dist-js-tree' && candidate.artifact !== 'src-ts-tree')
    || typeof candidate.sha256 !== 'string'
    || !SHA256_PATTERN.test(candidate.sha256)
    || !Number.isSafeInteger(candidate.fileCount)
    || Number(candidate.fileCount) <= 0
    || typeof candidate.loadedAt !== 'string'
    || !Number.isFinite(Date.parse(candidate.loadedAt))
  ) {
    throw new Error('Telegram runtime did not report a valid loaded-artifact identity; restart it from the current build.');
  }
  return candidate as RuntimeBuildIdentity;
}

export function assertLoadedRuntimeMatchesInstalled(
  loadedValue: unknown,
  installed: RuntimeBuildIdentity
): RuntimeBuildIdentity {
  const loaded = parseRuntimeBuildIdentity(loadedValue);
  if (
    loaded.artifact !== installed.artifact
    || loaded.sha256 !== installed.sha256
    || loaded.fileCount !== installed.fileCount
  ) {
    throw new Error('The running Telegram process loaded a different artifact generation than the current installed build; restart it before trusting health or supervised QA.');
  }
  return loaded;
}
