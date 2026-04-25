import { readJsonFile, resolveStatePath, writeJsonAtomic } from './jsonState';

export type SparkAccessProfile = 'chat' | 'builder' | 'agent' | 'developer';

interface SparkAccessPreferences {
  accessByChatId?: Record<string, SparkAccessProfile>;
}

const ACCESS_PATH = resolveStatePath('.spark-access-policy.json');

export function normalizeSparkAccessProfile(value: unknown): SparkAccessProfile | null {
  if (typeof value !== 'string') return null;
  const normalized = value.trim().toLowerCase().replace(/[\s_-]+/g, '');
  if (['1', 'level1', 'l1', 'chat', 'private', 'conversation'].includes(normalized)) return 'chat';
  if (['2', 'level2', 'l2', 'builder', 'mission', 'missions', 'build'].includes(normalized)) return 'builder';
  if (['3', 'level3', 'l3', 'agent', 'tools', 'research', 'web', 'github'].includes(normalized)) return 'agent';
  if (['4', 'level4', 'l4', 'developer', 'dev', 'workspace', 'full'].includes(normalized)) return 'developer';
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
      return 'Level 1 - Chat: Spark can talk, remember, recall, diagnose, and answer from configured memory. It will not start missions or inspect external links from natural chat.';
    case 'agent':
      return 'Level 3 - Agent: Spark can use Spawner missions for public web/GitHub research, repo inspection, diagnostics, and build planning when you ask.';
    case 'developer':
      return 'Level 4 - Developer: Spark can use Spawner/Codex missions for local workspace build work, public web/GitHub research, diagnostics, and repo inspection. It still must not reveal secrets or run destructive actions without explicit approval.';
    case 'builder':
    default:
      return 'Level 2 - Builder: Spark can use memory, Builder, Spawner, and explicit build or /run requests. Public web/GitHub inspection from casual chat stays off until you switch to Level 3 or 4.';
  }
}

export function sparkAccessLevel(profile: SparkAccessProfile): number {
  switch (profile) {
    case 'chat':
      return 1;
    case 'agent':
      return 3;
    case 'developer':
      return 4;
    case 'builder':
    default:
      return 2;
  }
}

export function sparkAccessLabel(profile: SparkAccessProfile): string {
  switch (profile) {
    case 'chat':
      return 'Level 1 - Chat';
    case 'agent':
      return 'Level 3 - Agent';
    case 'developer':
      return 'Level 4 - Developer';
    case 'builder':
    default:
      return 'Level 2 - Builder';
  }
}

export function renderSparkAccessStatus(profile: SparkAccessProfile): string {
  return [
    `Spark access: ${sparkAccessLabel(profile)}`,
    describeSparkAccessProfile(profile),
    '',
    'Change it with:',
    '/access 1  Chat only',
    '/access 2  Builder and explicit missions',
    '/access 3  Agent web/GitHub research',
    '/access 4  Developer workspace builds'
  ].join('\n');
}
