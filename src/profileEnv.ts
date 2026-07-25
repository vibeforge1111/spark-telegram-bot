import { execFileSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

export function argValue(args: string[], name: string): string | null {
  const prefix = `--${name}=`;
  const inline = args.find((arg) => arg.startsWith(prefix));
  if (inline) return inline.slice(prefix.length);
  const index = args.indexOf(`--${name}`);
  if (index >= 0 && args[index + 1] && !args[index + 1].startsWith('--')) {
    return args[index + 1];
  }
  return null;
}

interface LoadEnvFileOptions {
  preserveKeys?: Set<string>;
}

const LEVEL5_GUARDRAIL_KEYS = new Set([
  'SPARK_ALLOW_HIGH_AGENCY_WORKERS',
  'SPARK_ALLOW_EXTERNAL_PROJECT_PATHS',
  'SPARK_CODEX_SANDBOX'
]);

export function loadEnvFileIntoProcess(
  file: string,
  env: NodeJS.ProcessEnv = process.env,
  options: LoadEnvFileOptions = {}
): void {
  if (!fs.existsSync(file)) return;
  let text: string;
  try {
    text = fs.readFileSync(file, 'utf-8');
  } catch {
    return;
  }
  for (const line of text.split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
    if (!match) continue;
    if (options.preserveKeys?.has(match[1])) continue;
    let value = match[2].trim();
    if (value.length >= 2 && value[0] === value[value.length - 1] && (value[0] === '"' || value[0] === "'")) {
      value = value.slice(1, -1);
    }
    env[match[1]] = value;
  }
}

export function sparkConfigModulesDir(env: NodeJS.ProcessEnv = process.env): string {
  return path.join(resolveSparkHome(env), 'config', 'modules');
}

export function sparkConfigAgentsDir(env: NodeJS.ProcessEnv = process.env): string {
  return path.join(resolveSparkHome(env), 'config', 'agents');
}

export function resolveSparkHome(env: NodeJS.ProcessEnv = process.env): string {
  return env.SPARK_HOME?.trim() || path.join(os.homedir(), '.spark');
}

export function resolveSparkCliCommand(env: NodeJS.ProcessEnv = process.env): string {
  const configured = env.SPARK_CLI_BIN?.trim();
  if (configured) return configured;
  const executable = process.platform === 'win32' ? 'spark.cmd' : 'spark';
  const installed = path.join(resolveSparkHome(env), 'bin', executable);
  if (env.SPARK_HOME?.trim() && fs.existsSync(installed)) {
    return installed;
  }
  const pathEntries = (env.PATH || '').split(path.delimiter).filter(Boolean);
  if (pathEntries.some((entry) => fs.existsSync(path.join(entry, executable)))) {
    return executable;
  }
  return fs.existsSync(installed) ? installed : executable;
}

export function safeAgentEnvName(agentName: string): string | null {
  const trimmed = agentName.trim();
  if (!/^[A-Za-z0-9._-]+$/.test(trimmed)) return null;
  return trimmed;
}

export function safeTelegramProfileName(profile: string): string | null {
  const trimmed = profile.trim();
  if (!/^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/.test(trimmed)) return null;
  return trimmed;
}

export function loadSparkAgentEnv(
  agentName: string,
  env: NodeJS.ProcessEnv = process.env,
  options: LoadEnvFileOptions = {}
): string[] {
  const safeName = safeAgentEnvName(agentName);
  if (!safeName) return [];
  const loaded: string[] = [];
  const agentsDir = sparkConfigAgentsDir(env);
  const files = [
    path.join(agentsDir, 'spark-common.env'),
    path.join(agentsDir, `${safeName}.env`)
  ];
  for (const file of files) {
    if (!fs.existsSync(file)) continue;
    loadEnvFileIntoProcess(file, env, options);
    loaded.push(file);
  }
  return loaded;
}

export function readSparkSecret(secretId: string, env: NodeJS.ProcessEnv = process.env): string | null {
  const viaPython = readSparkSecretViaPythonBridge(secretId, env);
  if (viaPython) return viaPython;

  try {
    const output = execFileSync(resolveSparkCliCommand(env), ['secrets', 'get', '--reveal', secretId], {
      encoding: 'utf-8',
      stdio: ['ignore', 'pipe', 'ignore']
    }).trim();
    return output || null;
  } catch {
    return null;
  }
}

export function sparkSecretPythonBridgeCommand(
  secretId: string,
  env: NodeJS.ProcessEnv = process.env
): { python: string; args: string[] } {
  const installedSparkCliSrc = path.join(resolveSparkHome(env), 'tools', 'spark-cli', 'src');
  const sparkCliSrc = env.SPARK_CLI_SRC || installedSparkCliSrc;
  const python = env.SPARK_CLI_PYTHON || env.SPARK_BUILDER_PYTHON || env.PYTHON || 'python';
  const script = [
    'import sys',
    `sys.path.insert(0, ${JSON.stringify(sparkCliSrc)})`,
    'from spark_cli.cli import fetch_secret',
    'value = fetch_secret(sys.argv[1])',
    'print(value or "")'
  ].join('; ');
  return { python, args: ['-c', script, secretId] };
}

function readSparkSecretViaPythonBridge(secretId: string, env: NodeJS.ProcessEnv = process.env): string | null {
  const command = sparkSecretPythonBridgeCommand(secretId, env);
  try {
    const output = execFileSync(command.python, command.args, {
      encoding: 'utf-8',
      stdio: ['ignore', 'pipe', 'ignore']
    }).trim();
    return output || null;
  } catch {
    return null;
  }
}

export function loadSparkTelegramProfileEnv(
  args: string[],
  env: NodeJS.ProcessEnv = process.env,
  options: { preserveExisting?: boolean } = {}
): string | null {
  const requestedProfile = argValue(args, 'profile') || env.SPARK_TELEGRAM_PROFILE?.trim() || null;
  if (!requestedProfile) return null;
  const profile = safeTelegramProfileName(requestedProfile);
  if (!profile) {
    env.SPARK_PROFILE_TOKEN_MISSING = 'invalid_telegram_profile';
    delete env.BOT_TOKEN;
    return null;
  }
  const preserveKeys = options.preserveExisting ? new Set(Object.keys(env)) : undefined;
  for (const key of LEVEL5_GUARDRAIL_KEYS) {
    preserveKeys?.delete(key);
  }
  const loadOptions = { preserveKeys };

  loadSparkAgentEnv('spark-telegram-bot', env, loadOptions);
  loadSparkAgentEnv(`spark-telegram-bot.${profile}`, env, loadOptions);

  const configDir = sparkConfigModulesDir(env);
  loadEnvFileIntoProcess(path.join(configDir, 'spark-telegram-bot.env'), env, loadOptions);
  loadEnvFileIntoProcess(path.join(configDir, `spark-telegram-bot.${profile}.env`), env, loadOptions);

  const profileSecretId = `telegram.profiles.${profile}.bot_token`;
  const nonPrimaryNamedProfile = profile !== 'default' && profile !== 'primary';
  const preserveBotToken = Boolean(
    !nonPrimaryNamedProfile &&
    options.preserveExisting &&
    preserveKeys?.has('BOT_TOKEN') &&
    env.BOT_TOKEN?.trim()
  );
  const profileToken = readSparkSecret(profileSecretId, env) || (profile === 'default' ? readSparkSecret('telegram.bot_token', env) : null);
  if (preserveBotToken) {
    delete env.SPARK_PROFILE_TOKEN_MISSING;
  } else if (profileToken) {
    env.BOT_TOKEN = profileToken;
    delete env.SPARK_PROFILE_TOKEN_MISSING;
  } else if (env.TEST_BOT_TOKEN?.trim()) {
    env.BOT_TOKEN = env.TEST_BOT_TOKEN.trim();
    delete env.SPARK_PROFILE_TOKEN_MISSING;
  } else {
    env.SPARK_PROFILE_TOKEN_MISSING = profileSecretId;
    delete env.BOT_TOKEN;
  }
  return profile;
}
