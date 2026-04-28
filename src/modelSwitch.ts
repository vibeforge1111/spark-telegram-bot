import { access, mkdir, readFile, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { resolveChatProviderConfig } from './llm';
import { resolveChatDefaultProvider, resolveMissionDefaultProvider } from './providerRouting';

type ProviderId = 'zai' | 'codex' | 'anthropic' | 'openai' | 'openrouter' | 'huggingface' | 'minimax' | 'ollama';
type ModelRole = 'agent' | 'mission';

interface ProviderSpec {
  provider: ProviderId;
  botProvider: string;
  defaultModel: string;
  authMode: string;
  baseUrl?: string;
  requiredEnv?: string[];
  cliCommand?: string;
}

const PROVIDERS: Record<ProviderId, ProviderSpec> = {
  zai: {
    provider: 'zai',
    botProvider: 'zai',
    defaultModel: 'glm-5.1',
    authMode: 'api_key',
    baseUrl: process.env.ZAI_BASE_URL || 'https://api.z.ai/api/coding/paas/v4/',
    requiredEnv: ['ZAI_API_KEY']
  },
  codex: {
    provider: 'codex',
    botProvider: 'codex',
    defaultModel: 'gpt-5.5',
    authMode: 'codex_oauth',
    requiredEnv: [],
    cliCommand: process.env.CODEX_PATH || process.env.SPARK_CODEX_PATH || 'codex'
  },
  anthropic: {
    provider: 'anthropic',
    botProvider: 'claude',
    defaultModel: 'sonnet',
    authMode: 'claude_oauth',
    requiredEnv: [],
    cliCommand: process.env.CLAUDE_PATH || process.env.SPARK_CLAUDE_PATH || 'claude'
  },
  openai: {
    provider: 'openai',
    botProvider: 'openai',
    defaultModel: 'gpt-5.5',
    authMode: 'api_key',
    baseUrl: process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1',
    requiredEnv: ['OPENAI_API_KEY']
  },
  openrouter: {
    provider: 'openrouter',
    botProvider: 'openrouter',
    defaultModel: 'openai/gpt-5.5',
    authMode: 'api_key',
    baseUrl: process.env.OPENROUTER_BASE_URL || 'https://openrouter.ai/api/v1',
    requiredEnv: ['OPENROUTER_API_KEY']
  },
  huggingface: {
    provider: 'huggingface',
    botProvider: 'huggingface',
    defaultModel: 'deepseek-ai/DeepSeek-R1:fastest',
    authMode: 'api_key',
    baseUrl: process.env.HUGGINGFACE_BASE_URL || 'https://router.huggingface.co/v1',
    requiredEnv: ['HF_TOKEN', 'HUGGINGFACE_API_KEY']
  },
  minimax: {
    provider: 'minimax',
    botProvider: 'minimax',
    defaultModel: 'MiniMax-M2.7',
    authMode: 'api_key',
    baseUrl: process.env.MINIMAX_BASE_URL || 'https://api.minimax.io/v1',
    requiredEnv: ['MINIMAX_API_KEY']
  },
  ollama: {
    provider: 'ollama',
    botProvider: 'ollama',
    defaultModel: 'kimi-k2.5:cloud',
    authMode: 'local',
    baseUrl: process.env.OLLAMA_URL || 'http://localhost:11434',
    requiredEnv: []
  }
};

const PROVIDER_ALIASES: Record<string, ProviderId> = {
  zai: 'zai',
  glm: 'zai',
  'z.ai': 'zai',
  codex: 'codex',
  openai: 'openai',
  gpt: 'openai',
  claude: 'anthropic',
  anthropic: 'anthropic',
  openrouter: 'openrouter',
  router: 'openrouter',
  hf: 'huggingface',
  huggingface: 'huggingface',
  minimax: 'minimax',
  mini: 'minimax',
  ollama: 'ollama'
};

function moduleConfigDir(): string {
  return process.env.SPARK_MODULE_CONFIG_DIR || path.join(os.homedir(), '.spark', 'config', 'modules');
}

function envFiles(): string[] {
  const dir = moduleConfigDir();
  const profile = process.env.SPARK_TELEGRAM_PROFILE?.trim();
  const files = [
    path.join(dir, 'spark-telegram-bot.env'),
    profile ? path.join(dir, `spark-telegram-bot.${profile}.env`) : '',
    path.join(dir, 'spawner-ui.env'),
    path.join(dir, 'spark-intelligence-builder.env')
  ].filter(Boolean);
  return Array.from(new Set(files));
}

async function fileExists(filePath: string): Promise<boolean> {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

function serializeEnvValue(value: string): string {
  if (/[\r\n]/.test(value)) throw new Error('Environment values cannot contain newlines');
  return value;
}

export function normalizeModelProvider(value: string | undefined | null): ProviderId | null {
  const normalized = value?.trim().toLowerCase();
  if (!normalized) return null;
  return PROVIDER_ALIASES[normalized] || null;
}

export function normalizeModelRole(value: string | undefined | null): ModelRole | null {
  const normalized = value?.trim().toLowerCase();
  if (!normalized || normalized === 'status') return null;
  if (['agent', 'chat', 'brain', 'default'].includes(normalized)) return 'agent';
  if (['mission', 'missions', 'build', 'builder', 'spawner'].includes(normalized)) return 'mission';
  return null;
}

export function providerIsConfigured(provider: ProviderId, env: NodeJS.ProcessEnv = process.env): boolean {
  const spec = PROVIDERS[provider];
  if (spec.cliCommand) return true;
  if (!spec.requiredEnv || spec.requiredEnv.length === 0) return true;
  return spec.requiredEnv.some((key) => Boolean(env[key]?.trim()));
}

function applyToEnv(role: ModelRole, provider: ProviderId, model?: string, env: NodeJS.ProcessEnv = process.env): Record<string, string> {
  const spec = PROVIDERS[provider];
  const selectedModel = model?.trim() || (role === 'mission' && provider === 'anthropic' ? 'opus' : spec.defaultModel);
  const updates: Record<string, string> = {};

  if (role === 'agent') {
    for (const prefix of ['SPARK_CHAT_LLM', 'SPARK_BUILDER_LLM', 'SPARK_MEMORY_LLM']) {
      updates[`${prefix}_PROVIDER`] = spec.provider;
      updates[`${prefix}_BOT_PROVIDER`] = spec.botProvider;
      updates[`${prefix}_MODEL`] = selectedModel;
      updates[`${prefix}_AUTH_MODE`] = spec.authMode;
      if (spec.baseUrl) updates[`${prefix}_BASE_URL`] = spec.baseUrl;
    }
    updates.SPARK_LLM_PROVIDER = spec.provider;
    updates.BOT_DEFAULT_PROVIDER = spec.botProvider;
    updates.SPARK_BOT_DEFAULT_PROVIDER = spec.botProvider;
  } else {
    updates.SPARK_MISSION_LLM_PROVIDER = spec.botProvider === 'claude' ? 'claude' : spec.provider;
    updates.SPARK_MISSION_LLM_BOT_PROVIDER = spec.botProvider;
    updates.SPARK_MISSION_LLM_MODEL = selectedModel;
    updates.SPARK_MISSION_LLM_AUTH_MODE = spec.authMode;
    updates.DEFAULT_MISSION_PROVIDER = spec.botProvider;
  }

  for (const [key, value] of Object.entries(updates)) {
    env[key] = value;
  }
  return updates;
}

function updateEnvContent(content: string, updates: Record<string, string>): string {
  const seen = new Set<string>();
  const lines = content.split(/\r?\n/).map((line) => {
    const match = line.match(/^([A-Za-z_][A-Za-z0-9_]*)=/);
    if (!match || !(match[1] in updates)) return line;
    seen.add(match[1]);
    return `${match[1]}=${serializeEnvValue(updates[match[1]])}`;
  });
  for (const [key, value] of Object.entries(updates)) {
    if (!seen.has(key)) lines.push(`${key}=${serializeEnvValue(value)}`);
  }
  return lines.join('\n').replace(/\n*$/, '\n');
}

async function persistEnvUpdates(updates: Record<string, string>): Promise<string[]> {
  const changed: string[] = [];
  for (const filePath of envFiles()) {
    if (!(await fileExists(filePath))) continue;
    const before = await readFile(filePath, 'utf8');
    const after = updateEnvContent(before, updates);
    if (after !== before) {
      await mkdir(path.dirname(filePath), { recursive: true });
      await writeFile(filePath, after, 'utf8');
      changed.push(filePath);
    }
  }
  return changed;
}

export function renderModelStatus(): string {
  const chat = resolveChatProviderConfig();
  const missionProvider = resolveMissionDefaultProvider();
  const missionModel = process.env.SPARK_MISSION_LLM_MODEL || process.env.CODEX_MODEL || process.env.SPARK_CODEX_MODEL || 'default';
  return [
    'Spark model routing',
    '',
    `Agent chat: ${chat.provider}${chat.model ? ` (${chat.model})` : ''}`,
    `Missions: ${missionProvider}${missionModel ? ` (${missionModel})` : ''}`,
    '',
    'Change it:',
    '/model agent zai',
    '/model agent codex',
    '/model agent claude',
    '/model mission codex',
    '/model mission claude',
    '',
    'Use /diagnose after changing to verify the route.'
  ].join('\n');
}

export async function switchModelRoute(role: ModelRole, provider: ProviderId, model?: string): Promise<string> {
  if (!providerIsConfigured(provider)) {
    const spec = PROVIDERS[provider];
    const needed = spec.requiredEnv?.join(' or ') || spec.cliCommand || 'provider setup';
    return `I cannot switch to ${provider} yet because it is not configured. Set up ${needed}, then try again.`;
  }

  const updates = applyToEnv(role, provider, model);
  const changedFiles = await persistEnvUpdates(updates);
  const spec = PROVIDERS[provider];
  const selectedModel = model?.trim() || (role === 'mission' && provider === 'anthropic' ? 'opus' : spec.defaultModel);
  const label = role === 'agent' ? 'Agent chat/runtime/memory' : 'Missions';
  return [
    `${label} now uses ${spec.botProvider === 'claude' ? 'claude' : provider} (${selectedModel}).`,
    changedFiles.length > 0 ? 'Saved for future Spark restarts.' : 'Applied to this running bot.',
    'Run /diagnose to verify it.'
  ].join('\n');
}

