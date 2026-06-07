import { readJsonFile, resolveStatePath, writeJsonAtomic } from './jsonState';

export type SparkAccessProfile = 'chat' | 'builder' | 'agent' | 'developer' | 'operator';
export type SparkAccessRequirement = 'spawner_build' | 'external_research' | 'operating_system';
export type SparkRunnerWritableState = 'yes' | 'no' | 'unknown';

export interface SparkAccessRunnerCapability {
  runnerWritable: SparkRunnerWritableState;
  runnerLabel?: string;
  failureReason?: string;
}

interface SparkAccessPreferences {
  accessByChatId?: Record<string, SparkAccessProfile>;
}

const ACCESS_PATH = resolveStatePath('.spark-access-policy.json');
const BULLET = '\u2022';

export function normalizeSparkAccessProfile(value: unknown): SparkAccessProfile | null {
  if (typeof value !== 'string') return null;
  const normalized = value.trim().toLowerCase().replace(/[\s_+\-&]+/g, '');
  if (['1', 'access1', 'level1', 'accesslevel1', 'l1', 'chat', 'chatonly', 'private', 'conversation'].includes(normalized)) return 'chat';
  if (['2', 'access2', 'level2', 'accesslevel2', 'l2', 'builder', 'mission', 'missions', 'buildwhenasked', 'buildpermission'].includes(normalized)) return 'builder';
  if (['3', 'access3', 'level3', 'accesslevel3', 'l3', 'agent', 'tools', 'research', 'researchbuild', 'researchandbuild', 'web', 'github'].includes(normalized)) return 'agent';
  if (
    [
      '4',
      'access4',
      'level4',
      'accesslevel4',
      'l4',
      'developer',
      'dev',
      'workspaceaccess',
      'localworkspace',
      'localworkspaceaccess',
      'localproject',
      'localprojectaccess',
      'localrepo',
      'localrepoaccess',
      'sandbox',
      'sandboxed',
      'sandboxedlocal',
      'sandboxedlocalaccess'
    ].includes(normalized)
  ) return 'developer';
  if (
    [
      '5',
      'access5',
      'level5',
      'accesslevel5',
      'l5',
      'operator',
      'admin',
      'root',
      'wholecomputer',
      'wholemachine',
      'operatingsystem',
      'os',
      'fullaccess',
      'computeraccess'
    ].includes(normalized)
  ) return 'operator';
  return null;
}

function defaultSparkAccessProfile(): SparkAccessProfile {
  const configured = normalizeSparkAccessProfile(process.env.SPARK_AGENT_ACCESS_PROFILE);
  if (configured) return configured;
  if (sparkIsHostedRuntime() && !sparkHostedFullAccessAllowed()) return 'agent';
  return 'developer';
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
  return profile === 'agent' || profile === 'developer' || profile === 'operator';
}

export function sparkAccessAllowsWorkspaceBuilds(profile: SparkAccessProfile): boolean {
  return profile === 'developer' || profile === 'operator';
}

export function sparkAccessAllowsSpawnerBuilds(profile: SparkAccessProfile): boolean {
  return profile !== 'chat';
}

export function sparkAccessAllowsOperatingSystemWork(profile: SparkAccessProfile): boolean {
  return profile === 'developer' || profile === 'operator';
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

function envFlagEnabled(value: unknown): boolean {
  return ['1', 'true', 'yes', 'on'].includes(String(value || '').trim().toLowerCase());
}

export function sparkHighAgencyWorkersAllowed(env: NodeJS.ProcessEnv = process.env): boolean {
  return envFlagEnabled(env.SPARK_ALLOW_HIGH_AGENCY_WORKERS);
}

export function sparkLevel5RuntimeGuardrailsActive(env: NodeJS.ProcessEnv = process.env): boolean {
  return (
    envFlagEnabled(env.SPARK_ALLOW_HIGH_AGENCY_WORKERS) &&
    envFlagEnabled(env.SPARK_ALLOW_EXTERNAL_PROJECT_PATHS) &&
    String(env.SPARK_CODEX_SANDBOX || '').trim() === 'danger-full-access'
  );
}

export function validateSparkAccessProfileForRuntime(
  profile: SparkAccessProfile,
  env: NodeJS.ProcessEnv = process.env
): { ok: true } | { ok: false; message: string } {
  if (profile === 'operator' && !sparkLevel5RuntimeGuardrailsActive(env)) {
    return {
      ok: false,
      message: [
        'Access level 5 needs one clear confirmation before Spark uses whole-computer operator mode.',
        '',
        'Safe path:',
        '1. Send `/access 5` from this trusted local Telegram admin chat.',
        '2. Tap Confirm.',
        '3. Spark will prepare the guardrails and restart itself if needed.',
        '',
        'Until then, use `/access 4` for sandboxed local work inside the Spark workspace.'
      ].join('\n')
    };
  }

  if ((profile !== 'developer' && profile !== 'operator') || !sparkIsHostedRuntime(env) || sparkHostedFullAccessAllowed(env)) {
    return { ok: true };
  }

  return {
    ok: false,
    message: [
      `${sparkAccessLabel(profile)} is locked for hosted Spark Live right now.`,
      '',
      'Use /access 3 for the default hosted experience: chat, memory, public research, and requested Spawner builds.',
      'Only enable local or whole-computer access on a hosted/VPS install after operator approval guardrails are ready.',
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
      `This operating system request needs ${sparkAccessLabel('developer')} for sandboxed local work, or ${sparkAccessLabel('operator')} for whole-computer work, but this chat is at ${sparkAccessLabel(profile)}.`,
      'You can say "change my access level to 4" or send `/access 4` for Spark sandbox workspaces, or `/access 5` only when you really want whole-computer operator mode.'
    ].join('\n');
  }
  if (requirement === 'external_research') {
    return [
      `This needs ${sparkAccessLabel('agent')} or higher, but this chat is at ${sparkAccessLabel(profile)}.`,
      'You can say "change my access level to 3" for public links/docs/GitHub research, or "change my access level to 4" when you also want sandboxed local project access. Level 5 is only for rare whole-computer operator work.'
    ].join('\n');
  }
  return [
    `This needs ${sparkAccessLabel('builder')} or higher, but this chat is at ${sparkAccessLabel(profile)}.`,
    'You can say "change my access level to 2" or send `/access 2` when you want Spark to build through Spawner after you ask.'
  ].join('\n');
}

export function describeSparkAccessProfile(profile: SparkAccessProfile): string {
  switch (profile) {
    case 'chat':
      return 'Chat, memory, recall, and diagnostics. No builds or missions.';
    case 'agent':
      return 'Public web/docs/GitHub research plus requested builds. No local files.';
    case 'developer':
      return 'Sandboxed local work inside approved Spark workspaces. Setup: `/access_setup`.';
    case 'operator':
      return 'Whole-computer operator work on a trusted local install. Setup: `/access 5` + Confirm.';
    case 'builder':
    default:
      return 'Requested Spawner builds and missions. No public research or local files.';
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
    case 'operator':
      return 5;
    case 'builder':
    default:
      return 2;
  }
}

export function sparkAccessLabel(profile: SparkAccessProfile): string {
  switch (profile) {
    case 'chat':
      return 'Access level 1';
    case 'agent':
      return 'Access level 3';
    case 'developer':
      return 'Access level 4';
    case 'operator':
      return 'Access level 5';
    case 'builder':
    default:
      return 'Access level 2';
  }
}

export function renderSparkAccessStatus(profile: SparkAccessProfile): string {
  return [
    `Spark access: ${sparkAccessLabel(profile)}`,
    renderSparkAccessCurrentSummary(profile),
    '',
    renderSparkAccessLevelGuide(),
    '',
    'Change anytime: `/access 1` through `/access 5`.'
  ].join('\n');
}

function renderSparkAccessCurrentSummary(profile: SparkAccessProfile): string {
  const rows: string[] = [];
  switch (profile) {
    case 'chat':
      rows.push('Chat, memory, recall, and diagnostics are on.');
      rows.push('Builds, research routes, and local files are off.');
      break;
    case 'builder':
      rows.push('Requested Spawner builds and missions are on.');
      rows.push('Public research and local files are off.');
      break;
    case 'agent':
      rows.push('Public links, docs, GitHub research, and requested builds are on.');
      rows.push('Local files are off.');
      break;
    case 'developer':
      rows.push('Sandboxed local work is on inside approved Spark workspaces.');
      rows.push('Good default for local builders: repo help, debugging, files, and missions.');
      rows.push('Setup helper: `/access_setup`.');
      break;
    case 'operator':
      rows.push('Whole-computer operator work is on for this trusted local install.');
      rows.push('Use this only when Spark truly needs files outside Spark workspaces.');
      break;
  }
  return ['Current', ...rows.map((row) => `${BULLET} ${row}`)].join('\n');
}

function renderRunnerCapabilitySummary(runner?: SparkAccessRunnerCapability): string | null {
  if (!runner) return null;
  if (runner.runnerWritable === 'yes') {
    return 'Runner: writable here.';
  }
  if (runner.runnerWritable === 'no') {
    const reason = runner.failureReason ? ` (${runner.failureReason})` : '';
    return `Runner: read-only${reason}. Use a writable route for edits.`;
  }
  return 'Runner: not checked yet.';
}

export function renderSparkAccessCapabilityStatus(profile: SparkAccessProfile, runner?: SparkAccessRunnerCapability): string {
  const runnerSummary = renderRunnerCapabilitySummary(runner) || 'Runner: not checked yet.';
  const canDoLocalHere = (profile === 'developer' || profile === 'operator') && runner?.runnerWritable === 'yes';
  const localVerdict = canDoLocalHere
    ? 'Verdict: local work is allowed here.'
    : profile === 'developer'
      ? 'Verdict: sandboxed local work is allowed, but edits need a writable runner.'
      : profile === 'operator'
        ? 'Verdict: whole-computer work is allowed only with writable runner and guardrails.'
        : 'Verdict: local filesystem work is off at this level.';

  return [
    `Access: ${sparkAccessLabel(profile)}.`,
    runnerSummary,
    localVerdict
  ].join('\n');
}

export function renderSparkAccessBriefStatus(profile: SparkAccessProfile, runner?: SparkAccessRunnerCapability): string {
  const runnerSummary = renderRunnerCapabilitySummary(runner);
  if (profile === 'developer') {
    const lines = [
      `You are on ${sparkAccessLabel(profile)}.`,
      'Spark can work inside approved Spark workspaces, inspect repos, debug, research, and run requested missions.',
      'Workspace setup: `/access_setup`.',
      runnerSummary,
      'Use `/access 3` for no local files, or `/access 5` for rare whole-computer work.'
    ].filter(Boolean);
    return lines.join('\n\n');
  }

  if (profile === 'operator') {
    const lines = [
      `You are already on ${sparkAccessLabel(profile)}.`,
      '\u2022 Whole-computer operator mode is active for this trusted install.',
      runnerSummary,
      '\u2022 Safety checks still stay on for secrets, deletes, publishing, and deploys.',
      'Use `/access 4` to return to the safer workspace sandbox.'
    ].filter(Boolean);
    return lines.join('\n\n');
  }

  if (profile === 'agent') {
    return [
      `You are on ${sparkAccessLabel(profile)}.`,
      'Public research and requested missions are allowed. Local files are off.',
      'Use `/access 4` for workspace files.'
    ].join('\n\n');
  }

  if (profile === 'builder') {
    return [
      `You are on ${sparkAccessLabel(profile)}.`,
      'Requested builds and missions are allowed. Public research and local files are off.',
      'Use `/access 3` for research, or `/access 4` for workspace files.'
    ].join('\n\n');
  }

  return [
    `You are on ${sparkAccessLabel(profile)}.`,
    'Chat, memory, recall, and diagnostics are allowed. Builds are off.',
    'Use `/access 2` for requested builds.'
  ].join('\n\n');
}

export function renderSparkAccessChangeSummary(profile: SparkAccessProfile, runner?: SparkAccessRunnerCapability): string {
  const confirmation = renderSparkAccessChangeConfirmation(profile);
  if (profile === 'operator') {
    const runnerLine = runner?.runnerWritable === 'no'
      ? 'One note: this runner still looks read-only, so Spark may route some local work through Mission Control.'
      : 'Spark can use this trusted local machine for operator work.';
    return [
      confirmation,
      '',
      runnerLine,
      'I will still ask before deleting important files, exposing secrets, publishing, or deploying.',
      'Use /access 4 when you want the safer workspace sandbox again.',
    ].join('\n');
  }
  if (profile === 'developer') {
    const runnerLine = runner?.runnerWritable === 'no'
      ? 'This runner looks read-only, so I may route write work through Mission Control.'
      : 'I can work inside the safe Spark workspace on this machine.';
    return [
      confirmation,
      '',
      runnerLine,
      'Use /access 5 only when you want whole-computer operator mode.',
    ].join('\n');
  }
  return confirmation;
}

export function renderSparkAccessLevel5ConfirmationPrompt(): string {
  return [
    'Access level 5 lets Spark use this trusted local machine for operator work.',
    '',
    'I will still ask before deleting important files, exposing secrets, publishing, or deploying.',
    'Tap Confirm only if you want whole-computer operator mode for this chat.',
  ].join('\n');
}

export function renderSparkAccessChangeConfirmation(profile: SparkAccessProfile): string {
  return `Done - I changed this chat setting to ${sparkAccessLabel(profile)}.`;
}

export function renderSparkAccessConversationHelp(profile: SparkAccessProfile): string {
  return [
    `This chat is on ${sparkAccessLabel(profile)}.`,
    '',
    'Levels:',
    '1 - Chat, memory, recall, diagnostics',
    '2 - Requested builds and missions',
    '3 - Public research plus requested builds',
    '4 - Workspace files and local debugging',
    '5 - Whole-computer operator mode',
    '',
    'Local edits still need a writable runner. If this route is read-only, Spark should say so.',
    '',
    'Change it with `/access 1` through `/access 5`.'
  ].join('\n');
}

export function renderSparkAccessRuntimeHint(profile: SparkAccessProfile): string {
  if (profile === 'developer') {
    return [
      `Current Spark access: ${sparkAccessLabel(profile)}.`,
      'For sandboxed local workspace, repo, debugging, or project-inspection requests, check runner writability before claiming the work is possible here.',
      'Access level 4 means authorized inside approved Spark sandboxes, not automatically writable in every runner.',
      'If the Level 4 workspace is missing, use `/access_setup` instead of dumping Docker, SSH, or filesystem commands into chat.',
      'If this runner is read-only, say "allowed, blocked here" and route through a writable Spawner/Codex mission or a writable chat runner.'
    ].join('\n');
  }

  if (profile === 'operator') {
    return [
      `Current Spark access: ${sparkAccessLabel(profile)}.`,
      'Whole-computer operator mode is authorized only for trusted local installs with high-agency guardrails.',
      'Still check runner writability before promising edits, and prefer sandboxed Level 4 unless the user explicitly needs files outside Spark workspaces.'
    ].join('\n');
  }

  if (profile === 'agent') {
    return [
      `Current Spark access: ${sparkAccessLabel(profile)}.`,
      'Spark can research public links, docs, GitHub repos, and run requested Spawner missions.',
      'Do not claim local filesystem access at this level. Use /access 4 for sandboxed Spark workspaces, or /access 5 for whole-computer operator mode on trusted local installs.'
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
    'Levels:',
    `${BULLET} 1 - Chat, memory, recall, diagnostics. No builds.`,
    `${BULLET} 2 - Requested builds and missions.`,
    `${BULLET} 3 - Public research plus requested builds. No local files.`,
    `${BULLET} 4 - Workspace files and local debugging (\`/access 4\`). Recommended; setup: \`/access_setup\`.`,
    `${BULLET} 5 - Whole-computer operator mode (\`/access 5\`). Confirm once.`,
    '',
    'Safety stays on: Spark still asks before secrets, destructive actions, publishing, or deploying.'
  ].join('\n');
}

export function renderSparkAccessOnboarding(defaultProfile: SparkAccessProfile = defaultSparkAccessProfile()): string {
  return [
    'Choose how much access this Telegram chat has.',
    '',
    renderSparkAccessLevelGuide(),
    '',
    `Default right now: ${sparkAccessLabel(defaultProfile)}.`,
    'Change it anytime with `/access 1` through `/access 5`.'
  ].join('\n');
}

// spark-compete: defensive guard audit
