export const DEFAULT_AGENT_TIMEOUT_MS = 30 * 60 * 1000;
export const DEFAULT_BUILDER_BRIDGE_TIMEOUT_MS = 15 * 60 * 1000;
export const DEFAULT_LOCAL_SERVICE_TIMEOUT_MS = 30 * 60 * 1000;

export function positiveIntegerEnv(
  env: NodeJS.ProcessEnv,
  key: string,
  fallbackMs: number
): number {
  const parsed = Number.parseInt(env[key] || '', 10);
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

export function localServiceDefaultTimeoutMs(env: NodeJS.ProcessEnv = process.env): number {
  return positiveIntegerEnv(env, 'SPARK_LOCAL_SERVICE_TIMEOUT_MS', DEFAULT_LOCAL_SERVICE_TIMEOUT_MS);
}
