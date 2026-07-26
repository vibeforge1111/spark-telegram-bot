import type { AxiosRequestConfig } from 'axios';

export type SpawnerAuthMode = 'bridge' | 'events';

function spawnerControlKey(env: NodeJS.ProcessEnv, mode: SpawnerAuthMode): string | undefined {
  if (mode === 'events') {
    return env.EVENTS_API_KEY?.trim() ||
      env.MCP_API_KEY?.trim() ||
      env.SPARK_BRIDGE_API_KEY?.trim();
  }
  return env.SPARK_BRIDGE_API_KEY?.trim() ||
    env.MCP_API_KEY?.trim() ||
    env.EVENTS_API_KEY?.trim();
}

export function spawnerAuthHeaders(
  env: NodeJS.ProcessEnv = process.env,
  options: { mode?: SpawnerAuthMode } = {}
): Record<string, string> {
  const mode = options.mode || 'bridge';
  const controlKey =
    spawnerControlKey(env, mode);
  const uiKey = env.SPARK_UI_API_KEY?.trim() || controlKey;
  const workspaceId = env.SPARK_WORKSPACE_ID?.trim();

  if (!controlKey && !uiKey) return {};
  return {
    ...(controlKey ? { 'x-api-key': controlKey } : {}),
    ...(uiKey ? { 'x-spawner-ui-key': uiKey } : {}),
    ...(workspaceId ? { 'x-spawner-workspace-id': workspaceId } : {})
  };
}

export function spawnerAxiosOptions<T = unknown>(
  timeout: number,
  options: AxiosRequestConfig<T> = {},
  auth: { mode?: SpawnerAuthMode } = {}
): AxiosRequestConfig<T> {
  return {
    ...options,
    timeout,
    headers: {
      ...spawnerAuthHeaders(process.env, auth),
      ...(options.headers || {})
    }
  };
}
