import { existsSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import path from 'node:path';

const LEVEL5_ENV = {
  SPARK_ALLOW_HIGH_AGENCY_WORKERS: '1',
  SPARK_ALLOW_EXTERNAL_PROJECT_PATHS: '1',
  SPARK_CODEX_SANDBOX: 'danger-full-access',
} as const;

function flagEnabled(value: unknown): boolean {
  return ['1', 'true', 'yes', 'on'].includes(String(value || '').trim().toLowerCase());
}

function readEnvFile(file: string): Record<string, string> {
  if (!existsSync(file)) return {};
  const values: Record<string, string> = {};
  for (const line of readFileSync(file, 'utf8').split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#') || !trimmed.includes('=')) continue;
    const [rawKey, ...rawValue] = trimmed.split('=');
    const key = rawKey.trim().replace(/^\uFEFF/, '');
    const value = rawValue.join('=').trim().replace(/^['"]|['"]$/g, '');
    values[key] = value;
  }
  return values;
}

function modulesDir(env: NodeJS.ProcessEnv | Record<string, string | undefined>): string {
  const sparkHome = env.SPARK_HOME?.trim() || path.join(homedir(), '.spark');
  return path.join(sparkHome, 'config', 'modules');
}

function fullLevel5Bundle(values: Record<string, string | undefined>): boolean {
  return Object.entries(LEVEL5_ENV).every(([key, expected]) => values[key] === expected);
}

function persistedTelegramLevel5Env(env: NodeJS.ProcessEnv | Record<string, string | undefined>): Record<string, string> {
  if (env !== process.env && !env.SPARK_HOME) return {};
  const root = modulesDir(env);
  const profile = env.SPARK_TELEGRAM_PROFILE?.trim();
  const candidates = [
    path.join(root, 'spark-telegram-bot.env'),
    profile ? path.join(root, `spark-telegram-bot.${profile}.env`) : '',
  ].filter(Boolean);
  const merged: Record<string, string> = {};
  for (const file of candidates) {
    Object.assign(merged, readEnvFile(file));
  }
  return fullLevel5Bundle(merged) ? merged : {};
}

export function effectiveLevel5RuntimeEnv<T extends NodeJS.ProcessEnv | Record<string, string | undefined>>(env: T = process.env as T): T {
  if (
    flagEnabled(env.SPARK_ALLOW_HIGH_AGENCY_WORKERS) &&
    flagEnabled(env.SPARK_ALLOW_EXTERNAL_PROJECT_PATHS) &&
    String(env.SPARK_CODEX_SANDBOX || '').trim() === 'danger-full-access'
  ) {
    return env;
  }

  const persisted = persistedTelegramLevel5Env(env);
  if (!persisted.SPARK_CODEX_SANDBOX) return env;
  return {
    ...env,
    SPARK_ALLOW_HIGH_AGENCY_WORKERS: persisted.SPARK_ALLOW_HIGH_AGENCY_WORKERS,
    SPARK_ALLOW_EXTERNAL_PROJECT_PATHS: persisted.SPARK_ALLOW_EXTERNAL_PROJECT_PATHS,
    SPARK_CODEX_SANDBOX: persisted.SPARK_CODEX_SANDBOX,
  };
}

export function level5RuntimeGuardrailsActive(env: NodeJS.ProcessEnv | Record<string, string | undefined> = process.env): boolean {
  const effective = effectiveLevel5RuntimeEnv(env);
  return (
    flagEnabled(effective.SPARK_ALLOW_HIGH_AGENCY_WORKERS) &&
    flagEnabled(effective.SPARK_ALLOW_EXTERNAL_PROJECT_PATHS) &&
    String(effective.SPARK_CODEX_SANDBOX || '').trim() === 'danger-full-access'
  );
}
