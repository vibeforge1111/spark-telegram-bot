export const VALID_PROVIDER_IDS = new Set(['minimax', 'zai', 'claude', 'codex']);

export function normalizeProviderId(value: string | undefined | null): string | null {
  const normalized = value?.trim().toLowerCase();
  return normalized || null;
}

export function resolveKnownProviderId(value: string | undefined | null): string | null {
  const normalized = normalizeProviderId(value);
  return normalized && VALID_PROVIDER_IDS.has(normalized) ? normalized : null;
}

export function resolveChatDefaultProvider(env: NodeJS.ProcessEnv = process.env): string {
  return resolveKnownProviderId(env.BOT_DEFAULT_PROVIDER) || 'codex';
}

export function resolveMissionDefaultProvider(
  env: NodeJS.ProcessEnv = process.env,
  spawnerDefaultProvider?: string | null
): string {
  return (
    resolveKnownProviderId(env.SPARK_MISSION_LLM_BOT_PROVIDER) ||
    resolveKnownProviderId(env.SPARK_MISSION_LLM_PROVIDER) ||
    resolveKnownProviderId(env.DEFAULT_MISSION_PROVIDER) ||
    resolveKnownProviderId(spawnerDefaultProvider) ||
    resolveKnownProviderId(env.SPARK_BOT_DEFAULT_PROVIDER) ||
    resolveKnownProviderId(env.BOT_DEFAULT_PROVIDER) ||
    'codex'
  );
}
