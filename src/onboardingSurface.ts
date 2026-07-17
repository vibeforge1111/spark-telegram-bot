export interface TelegramStartWelcomeInput {
  name: string;
  allowed: boolean;
  admin: boolean;
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
    '• /spark — compact system status'
  ];
  if (input.admin) {
    lines.push(
      '',
      'Spawner Control',
      '• /run <goal> — start a mission',
      '• /board — show mission state',
      '• /mission <status|pause|resume|kill> <missionId> — inspect or control a mission',
      '• /creator plan <brief> — plan a Loop Engineering path',
      '• /creator run <missionId> — execute a planned path',
      '• /creator status <missionId> — show readiness and validation',
      '• /creator validate <missionId> [maxCommands] — run validation gates',
      '',
      'Evidence',
      '• /authority — inspect compiled authority evidence',
      '• /capabilities — inspect available capability evidence',
      '• /ledger — review capability-ledger evidence',
      '',
      'Operator tools',
      '• /workspaces — show local project folders',
      '• /model or /models — inspect model routing',
      '• /wiki — inspect Spark LLM wiki health',
      '• /context — show Agent Operating Context',
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
