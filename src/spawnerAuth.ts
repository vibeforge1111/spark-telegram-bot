import type { AxiosRequestConfig } from 'axios';

export function spawnerAuthHeaders(env: NodeJS.ProcessEnv = process.env): Record<string, string> {
  const controlKey =
    env.SPARK_BRIDGE_API_KEY?.trim() ||
    env.MCP_API_KEY?.trim() ||
    env.EVENTS_API_KEY?.trim() ||
    env.SPARK_UI_API_KEY?.trim();
  const uiKey = env.SPARK_UI_API_KEY?.trim() || controlKey;

  if (!controlKey && !uiKey) return {};
  return {
    ...(controlKey ? { 'x-api-key': controlKey } : {}),
    ...(uiKey ? { 'x-spawner-ui-key': uiKey } : {})
  };
}

export function spawnerAxiosOptions<T = unknown>(
  timeout: number,
  options: AxiosRequestConfig<T> = {}
): AxiosRequestConfig<T> {
  return {
    ...options,
    timeout,
    headers: {
      ...spawnerAuthHeaders(),
      ...(options.headers || {})
    }
  };
}
