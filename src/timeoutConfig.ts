export const DEFAULT_AGENT_TIMEOUT_MS = 30 * 60 * 1000;
export const DEFAULT_BUILDER_BRIDGE_TIMEOUT_MS = 15 * 60 * 1000;
export const DEFAULT_CONTEXT_BRIDGE_TIMEOUT_MS = 15000;
export const DEFAULT_LOCAL_SERVICE_TIMEOUT_MS = 30 * 60 * 1000;
export const DEFAULT_SELF_BRIDGE_TIMEOUT_MS = 90 * 1000;
export const DEFAULT_WIKI_BRIDGE_TIMEOUT_MS = 90 * 1000;

// positiveIntegerEnv reads a numeric env var and falls back to fallbackMs
// when the value is missing OR not a clean positive integer. The earlier
// `Number.parseInt(env[key] || '', 10)` form silently accepted suffixed
// inputs such as '30s' / '5m' (parseInt strips the suffix and returns 30
// / 5, both of which pass Number.isFinite && > 0), so an operator setting
// SPARK_TELEGRAM_HANDLER_TIMEOUT_MS=30s expecting "30 seconds" got 30 ms
// instead of the documented default. The regex gate requires the env to
// be all-digits (after trim) before parseInt is consulted.
export function positiveIntegerEnv(
  env: NodeJS.ProcessEnv,
  key: string,
  fallbackMs: number
): number {
  const raw = (env[key] ?? '').trim();
  if (!/^\d+$/.test(raw)) return fallbackMs;
  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallbackMs;
}

export function telegramHandlerTimeoutMs(env: NodeJS.ProcessEnv = process.env): number {
  return positiveIntegerEnv(env, 'SPARK_TELEGRAM_HANDLER_TIMEOUT_MS', DEFAULT_AGENT_TIMEOUT_MS);
}

export function chatCommandTimeoutMs(env: NodeJS.ProcessEnv = process.env): number {
  return positiveIntegerEnv(env, 'SPARK_CHAT_COMMAND_TIMEOUT_MS', DEFAULT_AGENT_TIMEOUT_MS);
}

export function builderBridgeTimeoutMs(env: NodeJS.ProcessEnv = process.env): number {
  return positiveIntegerEnv(env, 'SPARK_BUILDER_TIMEOUT_MS', DEFAULT_BUILDER_BRIDGE_TIMEOUT_MS);
}

export function contextBridgeTimeoutMs(
  env: NodeJS.ProcessEnv = process.env,
  builderTimeoutMs = builderBridgeTimeoutMs(env)
): number {
  return positiveIntegerEnv(
    env,
    'SPARK_CONTEXT_BRIDGE_TIMEOUT_MS',
    Math.min(builderTimeoutMs, DEFAULT_CONTEXT_BRIDGE_TIMEOUT_MS)
  );
}

export function localServiceDefaultTimeoutMs(env: NodeJS.ProcessEnv = process.env): number {
  return positiveIntegerEnv(env, 'SPARK_LOCAL_SERVICE_TIMEOUT_MS', DEFAULT_LOCAL_SERVICE_TIMEOUT_MS);
}

export function selfAwarenessBridgeTimeoutMs(
  env: NodeJS.ProcessEnv = process.env,
  builderTimeoutMs = builderBridgeTimeoutMs(env)
): number {
  return positiveIntegerEnv(
    env,
    'SPARK_SELF_BRIDGE_TIMEOUT_MS',
    Math.min(builderTimeoutMs, DEFAULT_SELF_BRIDGE_TIMEOUT_MS)
  );
}

export function wikiBridgeTimeoutMs(
  env: NodeJS.ProcessEnv = process.env,
  builderTimeoutMs = builderBridgeTimeoutMs(env)
): number {
  return positiveIntegerEnv(
    env,
    'SPARK_WIKI_BRIDGE_TIMEOUT_MS',
    Math.min(builderTimeoutMs, DEFAULT_WIKI_BRIDGE_TIMEOUT_MS)
  );
}
