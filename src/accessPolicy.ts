import { readJsonFile, resolveStatePath, writeJsonAtomic } from './jsonState';

export type SparkAccessProfile = 'chat' | 'builder' | 'agent' | 'developer';
export type SparkAccessRequirement = 'spawner_build' | 'external_research' | 'operating_system';

interface SparkAccessPreferences {
  accessByChatId?: Record<string, SparkAccessProfile>;
}

const ACCESS_PATH = resolveStatePath('.spark-access-policy.json');

export function normalizeSparkAccessProfile(value: unknown): SparkAccessProfile | null {
  if (typeof value !== 'string') return null;
  const normalized = value.trim().toLowerCase().replace(/[\s_+\-&]+/g, '');
  if (['1', 'level1', 'l1', 'chat', 'chatonly', 'private', 'conversation'].includes(normalized)) return 'chat';
  if (['2', 'level2', 'l2', 'builder', 'mission', 'missions', 'build', 'buildwhenasked', 'buildpermission'].includes(normalized)) return 'builder';
  if (['3', 'level3', 'l3', 'agent', 'tools', 'research', 'researchbuild', 'researchandbuild', 'web', 'github'].includes(normalized)) return 'agent';
  if (
    [
      '4',
      'level4',
      'l4',
      'developer',
      'dev',
      'workspace',
      'operatingsystem',
      'os',
      'localproject',
      'localrepo',
      'full',
      'fullaccess'
    ].includes(normalized)
  ) return 'developer';
  return null;
}

function defaultSparkAccessProfile(): SparkAccessProfile {
  return normalizeSparkAccessProfile(process.env.SPARK_AGENT_ACCESS_PROFILE) || 'agent';
}

async function readPreferences(): Promise<SparkAccessPreferences> {
  return (await readJsonFile<SparkAccessPreferences>(ACCESS_PATH)) || {};
}

export async function getSparkAccessProfile(chatId: string | number): Promise<SparkAccessProfile> {
  const preferences = await readPreferences();
  const configured = preferences.accessByChatId?.[String(chatId)];
  return normalizeSparkAccessProfile(configured) || defaultSparkAccessProfile();
}

export async function getConfiguredSparkAccessProfile(chatId: string | number): Promise<SparkAccessProfile | null> {
  const preferences = await readPreferences();
  const configured = preferences.accessByChatId?.[String(chatId)];
  return normalizeSparkAccessProfile(configured);
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

export function sparkAccessAllowsSpawnerBuilds(profile: SparkAccessProfile): boolean {
  return profile !== 'chat';
}

export function sparkAccessAllowsOperatingSystemWork(profile: SparkAccessProfile): boolean {
  return profile === 'developer';
}

export function sparkAccessAllows(profile: SparkAccessProfile, requirement: SparkAccessRequirement): boolean {
  switch (requirement) {
    case 'spawner_build':
      return sparkAccessAllowsSpawnerBuilds(profile);
    case 'external_research':
      return sparkAccessAllowsExternalResearch(profile);
    case 'operating_system':
      return sparkAccessAllowsOperatingSystemWork(profile);
  }
}

export function sparkIsHostedRuntime(env: NodeJS.ProcessEnv = process.env): boolean {
  const spawnerHost = (env.SPARK_SPAWNER_HOST || '').trim();
  const allowedHosts = (env.SPARK_ALLOWED_HOSTS || '').trim();
  return (
    env.SPARK_LIVE_CONTAINER === '1' ||
    spawnerHost === '0.0.0.0' ||
    spawnerHost === '::' ||
    allowedHosts.length > 0
  );
}

export function sparkHostedFullAccessAllowed(env: NodeJS.ProcessEnv = process.env): boolean {
  return ['1', 'true', 'yes', 'on'].includes(String(env.SPARK_ALLOW_HOSTED_FULL_ACCESS || '').trim().toLowerCase());
}

export function validateSparkAccessProfileForRuntime(
  profile: SparkAccessProfile,
  env: NodeJS.ProcessEnv = process.env
): { ok: true } | { ok: false; message: string } {
  if (profile !== 'developer' || !sparkIsHostedRuntime(env) || sparkHostedFullAccessAllowed(env)) {
    return { ok: true };
  }

  return {
    ok: false,
    message: [
      'Full Access is locked for hosted Spark Live right now.',
      '',
      'Use /access 3 for the default hosted experience: chat, memory, public research, and requested Spawner builds.',
      'Only enable /access 4 on a hosted/VPS install after operator approval guardrails are ready.',
      '',
      'Operator override: set SPARK_ALLOW_HOSTED_FULL_ACCESS=1 and restart Spark Live.'
    ].join('\n')
  };
}

export function sparkMissionNeedsOperatingSystemAccess(goal: string, projectPath?: string | null): boolean {
  if (projectPath) return true;
  const normalized = goal.toLowerCase();
  return (
    /\b(?:local\s+workspace|local\s+project|local\s+repo|local\s+files?|operating\s+system|my\s+machine|this\s+machine|filesystem|file\s+system)\b/.test(normalized) ||
    /\b(?:c:\\|\/users\/|\/home\/|~\/|\.spark\\|\.spark\/)\b/i.test(goal)
  );
}

export function renderSparkAccessDenial(profile: SparkAccessProfile, requirement: SparkAccessRequirement): string {
  if (requirement === 'operating_system') {
    return [
      `This needs ${sparkAccessLabel('developer')}, but this chat is at ${sparkAccessLabel(profile)}.`,
      'Use `/access 4` when you want Spark to work across the operating system or local projects.'
    ].join('\n');
  }
  if (requirement === 'external_research') {
    return [
      `This needs ${sparkAccessLabel('agent')} or ${sparkAccessLabel('developer')}, but this chat is at ${sparkAccessLabel(profile)}.`,
      'Use `/access 3` for public links/docs/GitHub research, or `/access 4` for Full Access.'
    ].join('\n');
  }
  return [
    `This needs ${sparkAccessLabel('builder')} or higher, but this chat is at ${sparkAccessLabel(profile)}.`,
    'Use `/access 2` when you want Spark to build through Spawner after you ask.'
  ].join('\n');
}

export function describeSparkAccessProfile(profile: SparkAccessProfile): string {
  switch (profile) {
    case 'chat':
      return 'Level 1 - Chat Only: Spark can talk, remember, recall, diagnose, and answer from configured memory. It cannot start Spawner builds.';
    case 'agent':
      return 'Level 3 - Research + Build: Default. Spark can inspect public links, docs, and GitHub repos when you ask. It can also use Spawner for explicit build requests.';
    case 'developer':
      return 'Level 4 - Full Access: Spark can use Spawner/Codex for operating-system work, local project builds, debugging, repo inspection, public research, and deeper missions. It still must not reveal secrets or run destructive actions without explicit approval.';
    case 'builder':
    default:
      return 'Level 2 - Build When Asked: Spark can use Spawner only when you clearly ask it to build something or run a mission. Public web/GitHub inspection stays off until Level 3 or 4.';
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
      return 'Level 1 - Chat Only';
    case 'agent':
      return 'Level 3 - Research + Build';
    case 'developer':
      return 'Level 4 - Full Access';
    case 'builder':
    default:
      return 'Level 2 - Build When Asked';
  }
}

export function renderSparkAccessStatus(profile: SparkAccessProfile): string {
  return [
    `Spark access: ${sparkAccessLabel(profile)}`,
    describeSparkAccessProfile(profile),
    '',
    renderSparkAccessLevelGuide(),
    '',
    'Change it with:',
    '/access 1  Chat Only',
    '/access 2  Build When Asked',
    '/access 3  Research + Build (default)',
    '/access 4  Full Access'
  ].join('\n');
}

export function renderSparkAccessRuntimeHint(profile: SparkAccessProfile): string {
  if (profile === 'developer') {
    return [
      `Current Spark access: ${sparkAccessLabel(profile)}.`,
      'For local desktop, filesystem, repo, debugging, or project-inspection requests, do not say you cannot inspect local files as a blanket limitation.',
      'Plain chat cannot directly read the filesystem, but this chat can hand the work to Spawner/Codex for local operating-system work when the user asks.',
      'If you are not already executing through that path, say you can use the local agent path and ask for or infer the target safely.'
    ].join('\n');
  }

  if (profile === 'agent') {
    return [
      `Current Spark access: ${sparkAccessLabel(profile)}.`,
      'Spark can research public links, docs, GitHub repos, and run requested Spawner missions.',
      'Do not claim local filesystem access at this level. Use /access 4 when the user asks Spark to inspect local desktop files, local repos, or the operating system.'
    ].join('\n');
  }

  if (profile === 'builder') {
    return [
      `Current Spark access: ${sparkAccessLabel(profile)}.`,
      'Spark can run explicit Spawner builds when the user clearly asks.',
      'Do not claim public web research or local filesystem access unless the user raises access.'
    ].join('\n');
  }

  return [
    `Current Spark access: ${sparkAccessLabel(profile)}.`,
    'Do not claim local filesystem access or mission execution access at this level.',
    'Spark can chat, remember, recall, and diagnose configured local state.'
  ].join('\n');
}

export function renderSparkAccessLevelGuide(): string {
  return [
    'What each level means:',
    '',
    '1. Chat Only',
    '- Talk with Spark, save memories, recall notes, and run diagnostics.',
    '- Spark will not start builds or missions.',
    '',
    '2. Build When Asked',
    '- Spark can start a Spawner build only after you clearly ask.',
    '- Good when you want control before anything gets built.',
    '',
    '3. Research + Build (recommended)',
    '- Spark can research public links, docs, and GitHub repos when you ask.',
    '- Spark can also start builds and missions you request.',
    '- Spark will not work across your computer or local project files.',
    '',
    '4. Full Access',
    '- Spark can help with local projects, debugging, files, and deeper build missions.',
    '- Good when you want Spark to feel like a real local agent.',
    '- Spark still must not reveal secrets or run destructive actions without clear approval.'
  ].join('\n');
}

export function renderSparkAccessOnboarding(defaultProfile: SparkAccessProfile = 'agent'): string {
  return [
    'Choose how much access this Telegram chat has.',
    '',
    renderSparkAccessLevelGuide(),
    '',
    '/access 1  Chat Only',
    '/access 2  Build When Asked',
    '/access 3  Research + Build (recommended)',
    '/access 4  Full Access',
    '',
    `Default right now: ${sparkAccessLabel(defaultProfile)}.`,
    'You can change this later anytime by sending /access 1, /access 2, /access 3, or /access 4.'
  ].join('\n');
}
