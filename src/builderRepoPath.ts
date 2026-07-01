import { existsSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

export function builderRepoCandidates(options: {
  cwd?: string;
  homeDir?: string;
} = {}): string[] {
  const cwd = options.cwd || process.cwd();
  const homeDir = options.homeDir || os.homedir();
  return [
    path.join(homeDir, '.spark', 'modules', 'spark-intelligence-builder', 'source'),
    path.join(cwd, '..', 'spark-intelligence-builder'),
    path.join(homeDir, 'Desktop', 'spark-intelligence-builder'),
  ];
}

export function resolveBuilderRepoPath(options: {
  configuredRepo?: string;
  cwd?: string;
  homeDir?: string;
  exists?: (targetPath: string) => boolean;
} = {}): string {
  const configuredRepo = options.configuredRepo?.trim();
  if (configuredRepo) {
    return path.resolve(configuredRepo);
  }
  const exists = options.exists || existsSync;
  const seen = new Set<string>();
  const resolvedCandidates = builderRepoCandidates(options)
    .map((candidate) => path.resolve(candidate))
    .filter((candidate) => {
      const key = candidate.toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  for (const candidate of resolvedCandidates) {
    if (exists(path.join(candidate, 'src', 'spark_intelligence', 'cli.py'))) {
      return candidate;
    }
  }
  return resolvedCandidates[0];
}
