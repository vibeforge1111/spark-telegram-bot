import type { AxiosRequestConfig } from 'axios';

export function spawnerAuthHeaders(env: NodeJS.ProcessEnv = process.env): Record<string, string> {
  const key =
    env.SPARK_BRIDGE_API_KEY?.trim() ||
    env.MCP_API_KEY?.trim() ||
    env.EVENTS_API_KEY?.trim() ||
    env.SPARK_UI_API_KEY?.trim();

  if (!key) return {};
  return {
    'x-api-key': key,
    'x-spawner-ui-key': key
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
