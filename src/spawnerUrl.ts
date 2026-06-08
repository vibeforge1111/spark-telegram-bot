export const DEFAULT_SPAWNER_UI_URL = 'http://127.0.0.1:3333';

export function normalizeSpawnerUrlEnv(env: NodeJS.ProcessEnv = process.env): void {
  if (!env.SPAWNER_UI_URL && env.SPARK_SPAWNER_URL) {
    env.SPAWNER_UI_URL = env.SPARK_SPAWNER_URL;
  }
}

export function resolveSpawnerUiUrl(env: NodeJS.ProcessEnv = process.env): string {
  return (env.SPAWNER_UI_URL || env.SPARK_SPAWNER_URL || DEFAULT_SPAWNER_UI_URL).trim();
}

export function resolveSpawnerPublicUrl(env: NodeJS.ProcessEnv = process.env): string {
  return (
    env.SPAWNER_UI_PUBLIC_URL ||
    env.PUBLIC_SPAWNER_UI_URL ||
    env.SPAWNER_PUBLIC_URL ||
    resolveSpawnerUiUrl(env)
  ).trim();
}

export function resolveProjectPreviewBaseUrl(env: NodeJS.ProcessEnv = process.env): string {
  return (env.SPARK_PROJECT_PREVIEW_URL || resolveSpawnerPublicUrl(env)).trim();
}

export function resolveTelegramSpawnerSurfaceUrl(env: NodeJS.ProcessEnv = process.env): string {
  return (
    env.SPAWNER_TELEGRAM_SURFACE_URL ||
    env.SPARK_TELEGRAM_SPAWNER_URL ||
    resolveSpawnerUiUrl(env)
  ).trim();
}

normalizeSpawnerUrlEnv();
