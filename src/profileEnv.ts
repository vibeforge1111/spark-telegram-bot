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
  for (const line of fs.readFileSync(file, 'utf-8').split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
    if (!match) continue;
    if (options.preserveKeys?.has(match[1])) continue;
    let value = match[2];
    if (value.length >= 2 && value[0] === value[value.length - 1] && (value[0] === '"' || value[0] === "'")) {
      value = value.slice(1, -1);
    }
    env[match[1]] = value;
  }
}

export function sparkConfigModulesDir(env: NodeJS.ProcessEnv = process.env): string {
  const sparkHome = env.SPARK_HOME?.trim() || path.join(os.homedir(), '.spark');
  return path.join(sparkHome, 'config', 'modules');
}

export function sparkConfigAgentsDir(env: NodeJS.ProcessEnv = process.env): string {
  const sparkHome = env.SPARK_HOME?.trim() || path.join(os.homedir(), '.spark');
  return path.join(sparkHome, 'config', 'agents');
}

export function safeAgentEnvName(agentName: string): string | null {
  const trimmed = agentName.trim();
  if (!/^[A-Za-z0-9._-]+$/.test(trimmed)) return null;
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

export function readSparkSecret(secretId: string): string | null {
  const viaPython = readSparkSecretViaPythonBridge(secretId);
  if (viaPython) return viaPython;

  try {
    const output = execFileSync('spark', ['secrets', 'get', '--reveal', secretId], {
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
  const sparkCliSrc = env.SPARK_CLI_SRC || path.join(os.homedir(), 'Desktop', 'spark-cli', 'src');
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

function readSparkSecretViaPythonBridge(secretId: string): string | null {
  const command = sparkSecretPythonBridgeCommand(secretId);
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
  const profile = argValue(args, 'profile') || env.SPARK_TELEGRAM_PROFILE?.trim() || null;
  if (!profile) return null;
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
  const profileToken = readSparkSecret(profileSecretId) || (profile === 'default' ? readSparkSecret('telegram.bot_token') : null);
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
