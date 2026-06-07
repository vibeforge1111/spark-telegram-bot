export const DEFAULT_SPAWNER_UI_URL = 'http://127.0.0.1:3333';

function firstNonBlank(...values: Array<string | undefined>): string | undefined {
  for (const value of values) {
    if (typeof value === 'string' && value.trim()) {
      return value.trim();
    }
  }
  return undefined;
}

export function normalizeSpawnerUrlEnv(env: NodeJS.ProcessEnv = process.env): void {
  if (!env.SPAWNER_UI_URL?.trim() && env.SPARK_SPAWNER_URL?.trim()) {
    env.SPAWNER_UI_URL = env.SPARK_SPAWNER_URL.trim();
  }
}

export function resolveSpawnerUiUrl(env: NodeJS.ProcessEnv = process.env): string {
  return firstNonBlank(env.SPAWNER_UI_URL, env.SPARK_SPAWNER_URL) || DEFAULT_SPAWNER_UI_URL;
}

export function resolveSpawnerPublicUrl(env: NodeJS.ProcessEnv = process.env): string {
  return (
    firstNonBlank(env.SPAWNER_UI_PUBLIC_URL, env.PUBLIC_SPAWNER_UI_URL, env.SPAWNER_PUBLIC_URL) ||
    resolveSpawnerUiUrl(env)
  );
}

export function resolveProjectPreviewBaseUrl(env: NodeJS.ProcessEnv = process.env): string {
  return firstNonBlank(env.SPARK_PROJECT_PREVIEW_URL) || resolveSpawnerPublicUrl(env);
}

normalizeSpawnerUrlEnv();
