import type { AxiosRequestConfig } from 'axios';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

export type SpawnerAuthMode = 'bridge' | 'events';

function envFileValue(key: string, dir: string): string | undefined {
  const envPath = path.join(dir, '.env');
  if (!existsSync(envPath)) return undefined;
  const lines = readFileSync(envPath, 'utf-8').split(/\r?\n/);
  for (const line of [...lines].reverse()) {
    const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)=(.*)\s*$/);
    if (!match || match[1] !== key) continue;
    const value = match[2].trim().replace(/^(['"])(.*)\1$/, '$2').trim();
    return value || undefined;
  }
  return undefined;
}

function envValue(key: string, env: NodeJS.ProcessEnv, envFileDir?: string): string | undefined {
  const direct = env[key]?.trim();
  if (direct) return direct;
  const dirs = [
    envFileDir,
    process.cwd(),
    path.join(__dirname, '..')
  ].filter((dir): dir is string => Boolean(dir));
  for (const dir of dirs) {
    const value = envFileValue(key, dir);
    if (value) return value;
  }
  return undefined;
}

function spawnerControlKey(
  env: NodeJS.ProcessEnv,
  mode: SpawnerAuthMode,
  envFileDir?: string
): string | undefined {
  if (mode === 'events') {
    return envValue('EVENTS_API_KEY', env, envFileDir) ||
      envValue('MCP_API_KEY', env, envFileDir) ||
      envValue('SPARK_BRIDGE_API_KEY', env, envFileDir) ||
      envValue('SPARK_UI_API_KEY', env, envFileDir) ||
      undefined;
  }
  return envValue('SPARK_BRIDGE_API_KEY', env, envFileDir) ||
    envValue('MCP_API_KEY', env, envFileDir) ||
    envValue('EVENTS_API_KEY', env, envFileDir) ||
    envValue('SPARK_UI_API_KEY', env, envFileDir) ||
    undefined;
}

export function spawnerAuthHeaders(
  env: NodeJS.ProcessEnv = process.env,
  options: { mode?: SpawnerAuthMode; envFileDir?: string } = {}
): Record<string, string> {
  const mode = options.mode || 'bridge';
  const controlKey =
    spawnerControlKey(env, mode, options.envFileDir);
  const uiKey = envValue('SPARK_UI_API_KEY', env, options.envFileDir) || controlKey;
  const workspaceId = envValue('SPARK_WORKSPACE_ID', env, options.envFileDir);

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
