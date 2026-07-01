export const VALID_MISSION_PROVIDER_IDS = new Set([
  'minimax',
  'zai',
  'claude',
  'codex',
  'openai',
  'kimi',
  'openrouter',
  'huggingface',
  'lmstudio',
  'ollama',
]);
export const VALID_CHAT_PROVIDER_IDS = new Set([
  ...VALID_MISSION_PROVIDER_IDS,
  'anthropic',
]);

export function normalizeProviderId(value: string | undefined | null): string | null {
  const normalized = value?.trim().toLowerCase();
  return normalized || null;
}

export function resolveKnownProviderId(value: string | undefined | null): string | null {
  const normalized = normalizeProviderId(value);
  return normalized && VALID_MISSION_PROVIDER_IDS.has(normalized) ? normalized : null;
}

export function resolveKnownChatProviderId(value: string | undefined | null): string | null {
  const normalized = normalizeProviderId(value);
  return normalized && VALID_CHAT_PROVIDER_IDS.has(normalized) ? normalized : null;
}

function parseAllowedProviders(raw: string | undefined | null, validIds: Set<string>): Set<string> | null {
  const tokens = (raw || '')
    .split(/[,\s]+/)
    .map((token) => token.trim().toLowerCase())
    .filter(Boolean);
  if (tokens.length === 0 || tokens.includes('*') || tokens.includes('all')) return null;

  const allowed = new Set<string>();
  for (const token of tokens) {
    if (validIds.has(token)) allowed.add(token);
  }
  return allowed;
}

export function resolveAllowedMissionProviders(env: NodeJS.ProcessEnv = process.env): Set<string> | null {
  return parseAllowedProviders(
    env.SPARK_ALLOWED_MISSION_PROVIDERS || env.SPARK_ALLOWED_LLM_PROVIDERS || env.SPARK_ALLOWED_PROVIDERS,
    VALID_MISSION_PROVIDER_IDS
  );
}

export function resolveAllowedChatProviders(env: NodeJS.ProcessEnv = process.env): Set<string> | null {
  return parseAllowedProviders(
    env.SPARK_ALLOWED_CHAT_PROVIDERS || env.SPARK_ALLOWED_LLM_PROVIDERS || env.SPARK_ALLOWED_PROVIDERS,
    VALID_CHAT_PROVIDER_IDS
  );
}

export function missionProviderAllowed(providerId: string, env: NodeJS.ProcessEnv = process.env): boolean {
  const allowed = resolveAllowedMissionProviders(env);
  return !allowed || allowed.has(providerId);
}

export function chatProviderAllowed(providerId: string, env: NodeJS.ProcessEnv = process.env): boolean {
  const allowed = resolveAllowedChatProviders(env);
  return !allowed || allowed.has(providerId);
}

export function filterAllowedMissionProviders(providerIds: string[], env: NodeJS.ProcessEnv = process.env): string[] {
  const allowed = resolveAllowedMissionProviders(env);
  if (!allowed) return providerIds;
  return providerIds.filter((providerId) => allowed.has(providerId));
}

export function formatAllowedMissionProviders(env: NodeJS.ProcessEnv = process.env): string {
  const allowed = resolveAllowedMissionProviders(env);
  return allowed ? [...allowed].join(', ') : 'any configured provider';
}

export function resolveChatDefaultProvider(env: NodeJS.ProcessEnv = process.env): string {
  const provider = (
    resolveKnownChatProviderId(env.SPARK_CHAT_LLM_PROVIDER) ||
    resolveKnownChatProviderId(env.SPARK_CHAT_LLM_BOT_PROVIDER) ||
    resolveKnownChatProviderId(env.BOT_DEFAULT_PROVIDER) ||
    'not_configured'
  );
  return provider !== 'not_configured' && !chatProviderAllowed(provider, env) ? 'not_configured' : provider;
}

export function resolveMissionDefaultProvider(
  env: NodeJS.ProcessEnv = process.env,
  spawnerDefaultProvider?: string | null
): string {
  const candidates = [
    resolveKnownProviderId(env.SPARK_MISSION_LLM_BOT_PROVIDER),
    resolveKnownProviderId(env.SPARK_MISSION_LLM_PROVIDER),
    resolveKnownProviderId(env.DEFAULT_MISSION_PROVIDER),
    resolveKnownProviderId(spawnerDefaultProvider),
    resolveKnownProviderId(env.SPARK_BOT_DEFAULT_PROVIDER),
    resolveKnownProviderId(env.BOT_DEFAULT_PROVIDER),
    'codex'
  ].filter((provider): provider is string => Boolean(provider));

  const allowed = resolveAllowedMissionProviders(env);
  return candidates.find((provider) => missionProviderAllowed(provider, env)) || allowed?.values().next().value || 'codex';
}
