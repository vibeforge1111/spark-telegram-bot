import { readJsonFile, resolveStatePath, writeJsonAtomic } from './jsonState';

export type SparkAccessProfile = 'chat' | 'builder' | 'agent' | 'developer';

interface SparkAccessPreferences {
  accessByChatId?: Record<string, SparkAccessProfile>;
}

const ACCESS_PATH = resolveStatePath('.spark-access-policy.json');

export function normalizeSparkAccessProfile(value: unknown): SparkAccessProfile | null {
  if (typeof value !== 'string') return null;
  const normalized = value.trim().toLowerCase().replace(/[\s_-]+/g, '');
  if (['chat', 'private', 'conversation'].includes(normalized)) return 'chat';
  if (['builder', 'mission', 'missions', 'build'].includes(normalized)) return 'builder';
  if (['agent', 'tools', 'research', 'web', 'github'].includes(normalized)) return 'agent';
  if (['developer', 'dev', 'workspace', 'full'].includes(normalized)) return 'developer';
  return null;
}

function defaultSparkAccessProfile(): SparkAccessProfile {
  return normalizeSparkAccessProfile(process.env.SPARK_AGENT_ACCESS_PROFILE) || 'builder';
}

async function readPreferences(): Promise<SparkAccessPreferences> {
  return (await readJsonFile<SparkAccessPreferences>(ACCESS_PATH)) || {};
}

export async function getSparkAccessProfile(chatId: string | number): Promise<SparkAccessProfile> {
  const preferences = await readPreferences();
  const configured = preferences.accessByChatId?.[String(chatId)];
  return normalizeSparkAccessProfile(configured) || defaultSparkAccessProfile();
}

export async function setSparkAccessProfile(
  chatId: string | number,
  profile: SparkAccessProfile
): Promise<void> {
  const preferences = await readPreferences();
  await writeJsonAtomic(ACCESS_PATH, {
    ...preferences,
    accessByChatId: {
      ...(preferences.accessByChatId || {}),
      [String(chatId)]: profile
    }
  });
}

export function sparkAccessAllowsExternalResearch(profile: SparkAccessProfile): boolean {
  return profile === 'agent' || profile === 'developer';
}

export function sparkAccessAllowsWorkspaceBuilds(profile: SparkAccessProfile): boolean {
  return profile === 'developer';
}

export function describeSparkAccessProfile(profile: SparkAccessProfile): string {
  switch (profile) {
    case 'chat':
      return 'Chat mode: Spark can talk, remember, recall, diagnose, and answer from configured memory. It will not start missions or inspect external links from natural chat.';
    case 'agent':
      return 'Agent mode: Spark can use Spawner missions for public web/GitHub research, repo inspection, diagnostics, and build planning when you ask.';
    case 'developer':
      return 'Developer mode: Spark can use Spawner/Codex missions for local workspace build work, public web/GitHub research, diagnostics, and repo inspection. It still must not reveal secrets or run destructive actions without explicit approval.';
    case 'builder':
    default:
      return 'Builder mode: Spark can use memory, Builder, Spawner, and explicit build or /run requests. Public web/GitHub inspection from casual chat stays off until you switch to agent or developer mode.';
  }
}

export function renderSparkAccessStatus(profile: SparkAccessProfile): string {
  return [
    `Spark access: ${profile}`,
    describeSparkAccessProfile(profile),
    '',
    'Change it with:',
    '/access chat',
    '/access builder',
    '/access agent',
    '/access developer'
  ].join('\n');
}
