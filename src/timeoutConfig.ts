export const DEFAULT_AGENT_TIMEOUT_MS = 30 * 60 * 1000;
export const DEFAULT_BUILDER_BRIDGE_TIMEOUT_MS = 15 * 60 * 1000;
export const DEFAULT_CONTEXT_BRIDGE_TIMEOUT_MS = 15000;
export const DEFAULT_LOCAL_SERVICE_TIMEOUT_MS = 30 * 60 * 1000;
export const DEFAULT_SELF_BRIDGE_TIMEOUT_MS = 180 * 1000;
export const DEFAULT_WIKI_BRIDGE_TIMEOUT_MS = 90 * 1000;

export function parsePositiveIntegerEnvValue(value: string | undefined | null, fallbackMs: number): number {
  const raw = (value ?? '').trim();
  if (!/^\d+$/.test(raw)) return fallbackMs;
  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallbackMs;
}

export function positiveIntegerEnv(
  env: NodeJS.ProcessEnv,
  key: string,
  fallbackMs: number
): number {
  return parsePositiveIntegerEnvValue(env[key], fallbackMs);
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
