export interface TelegramStartWelcomeInput {
  name: string;
  allowed: boolean;
  admin: boolean;
}

export type PostInstallPath = 'telegram' | 'cli';

export function postInstallFirstRunPath(text: string): PostInstallPath | 'clarify' | null {
  const normalized = text.toLowerCase().replace(/\s+/g, ' ').trim();
  const installedSpark =
    /\bspark\b/.test(normalized) &&
    (
      /\b(?:just|finished?|done|completed?)\b.{0,30}\binstall(?:ed|ing)?\b/.test(normalized) ||
      /\bafter\s+install(?:ing)?\b/.test(normalized) ||
      (/\bwhat\s+(?:should|do)\s+(?:i|we)\s+(?:do|run|try|start)\s+(?:first|next)\b/.test(normalized) && /\binstall\b/.test(normalized))
    );
  if (!installedSpark) return null;
  if (/\btelegram\b|\bbot\b/.test(normalized)) return 'telegram';
  if (/\b(?:cli|command.?line|terminal|local)\b/.test(normalized)) return 'cli';
  return 'clarify';
}

export function renderPostInstallFirstRunReply(path: PostInstallPath | 'clarify'): string {
  if (path === 'telegram') {
    return 'Send /start to the Spark bot. Once it replies, /diagnose will check the connected systems.';
  }
  if (path === 'cli') {
    return 'Run `spark verify --onboarding`. It will show what installed cleanly and what still needs attention; keep any raw output local unless you redact it first.';
  }
  return 'Are you continuing in Telegram or in the local CLI? I’ll give you the single next check for that path.';
}

export function renderTelegramStartWelcome(input: TelegramStartWelcomeInput): string {
  const name = input.name.trim() || 'friend';
  if (!input.allowed) {
    return [
      `Hey ${name} — I’m Spark.`,
      'This bot is private right now.',
      'Send /myid so the owner can give you access.'
    ].join('\n');
  }
  if (input.admin) {
    return [
      `Hey ${name} — I’m Spark.`,
      'Chat naturally, or use /run to start a mission.',
      '/diagnose checks health; /help shows everything else.'
    ].join('\n');
  }
  return [
    `Hey ${name} — I’m Spark.`,
    'Chat naturally, or use /remember and /recall when you want memory.',
    '/diagnose checks health; /help shows everything else.'
  ].join('\n');
}

export function renderTelegramHelp(input: { admin: boolean }): string {
  const lines = [
    'Spark commands',
    '',
    'Memory',
    '• /remember <text> — save something important',
    '• /recall <topic> — ask what I remember',
    '• /about — ask what I know about you',
    '• /forget <text> — forget a saved detail',
    '',
    'Health',
    '• /status — current Spark status',
    '• /diagnose — check the connected systems',
    '• /spark — compact system status',
    '',
    'Spark Intelligence',
    '• /resonance — inspect the current resonance state',
    '• /insights — review recent cognitive insights',
    '• /lessons — review recent surprise lessons',
    '• /voice — inspect voice readiness'
  ];
  if (input.admin) {
    lines.push(
      '',
      'Spawner Control',
      '• /run <goal> — start a mission',
      '• /runminimax, /runglm, /runzai, /runclaude, /runcodex — pin a provider',
      '• /run2 or /runall — run provider consensus',
      '• /board — show mission state',
      '• /schedule "<cron>" mission|loop ... — schedule a mission or chip loop',
      '• /schedules — manage scheduled work',
      '• /mission <status|pause|resume|kill> <missionId> — inspect or control a mission',
      '• /creator plan <brief> — plan a Loop Engineering path',
      '• /creator run <missionId> — execute a planned path',
      '• /creator status <missionId> — show readiness and validation',
      '• /creator validate <missionId> [maxCommands] — run validation gates',
      '• /chip create <description> — scaffold a domain chip',
      '• /loop <chip_key> [rounds] — run a chip autoloop',
      '• /recursive <action> — inspect or run specialization-path recursion',
      '• /process — process queued intelligence events',
      '• /reflect — run a reflection pass',
      '',
      'Evidence',
      '• /authority — inspect compiled authority evidence',
      '• /capabilities — inspect available capability evidence',
      '• /ledger — review capability-ledger evidence',
      '',
      'Operator tools',
      '• /workspaces or /workspace — show local project folders',
      '• /model or /models — inspect model routing',
      '• /wiki — inspect Spark LLM wiki health',
      '• /context — show Agent Operating Context',
      '• /aoc, /blackbox, /trace, /memory_flow — compact evidence aliases',
      '• /route_probe <route> or /nl_route <text> — inspect routing evidence',
      '• /conversation_context — show conversation diagnostics',
      '• /updates <minimal|normal|verbose> — tune mission updates',
      '• /access <1|2|3|4|5> — choose this chat’s access',
      '• /access 5 — approve Level 5 setup from Telegram',
      '• /access_setup — set up the Level 4 workspace',
      '• /docker_doctor — inspect Docker readiness',
      '• /docker_smoke confirm — run the no-secret sandbox smoke'
    );
  }
  return lines.join('\n');
}
