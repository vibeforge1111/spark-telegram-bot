export type SparkLiveSummary = {
  liveReady: boolean;
  spawnerOk: boolean;
  telegramOk: boolean;
  spawnerText: string;
  telegramText: string;
  profilesText: string;
  rolesText: string;
  supervisionText: string;
};

function firstMatchingLine(output: string, pattern: RegExp): string {
  return output
    .split(/\r?\n/)
    .map((line) => line.trim())
    .find((line) => pattern.test(line)) || '';
}

function cleanSparkStatusLine(line: string, label: string): string {
  return line
    .replace(new RegExp(`^\\[OK\\]\\s+${label}:\\s*`, 'i'), '')
    .replace(/\s*\|\s*/g, ' | ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function parseSparkLiveSummary(liveStatus: string, deepVerify: string): SparkLiveSummary {
  const spawnerLine = firstMatchingLine(liveStatus, /\[OK\]\s+spawner-ui|spawner-ui:/i);
  const telegramLine = firstMatchingLine(liveStatus, /\[OK\]\s+spark-telegram-bot|spark-telegram-bot:/i);
  const profilesLine = firstMatchingLine(liveStatus, /Telegram profiles:/i);
  const rolesLine = firstMatchingLine(liveStatus, /LLM roles:/i);
  const supervised = deepVerify.match(/Runtime processes are running under Spark supervision:\s*([^\n]+)/i)?.[1]?.trim() || '';
  const liveReady = /\[OK\]\s+Spark Live is ready/i.test(liveStatus);
  const spawnerOk = /\[OK\]\s+spawner-ui/i.test(spawnerLine);
  const telegramOk = /\[OK\]\s+spark-telegram-bot/i.test(telegramLine);
  const spawnerProviderBits = spawnerLine.match(/(\d+\s+providers listed).*?(\d+\s+configured)/i);
  const spawnerWorkspace = spawnerLine.match(/workspace=([^|]+)/i)?.[1]?.trim();
  const telegramRuntime = telegramLine.match(/\(([^)]*polling=active[^)]*)\)/i)?.[1]?.trim();
  return {
    liveReady,
    spawnerOk,
    telegramOk,
    spawnerText: spawnerOk
      ? [
          spawnerProviderBits ? `${spawnerProviderBits[1]}, ${spawnerProviderBits[2]}` : 'healthy',
          spawnerWorkspace ? `workspace ${spawnerWorkspace}` : ''
        ].filter(Boolean).join('; ')
      : (spawnerLine ? cleanSparkStatusLine(spawnerLine, 'spawner-ui') : 'not reported by live status'),
    telegramText: telegramOk
      ? (telegramRuntime ? `polling active (${telegramRuntime.replace(/\s+/g, ' ')})` : 'polling active')
      : (telegramLine ? cleanSparkStatusLine(telegramLine, 'spark-telegram-bot') : 'not reported by live status'),
    profilesText: profilesLine.replace(/^Telegram profiles:\s*/i, '').trim(),
    rolesText: rolesLine.replace(/^LLM roles:\s*/i, '').trim(),
    supervisionText: supervised.replace(/\.+$/, '')
  };
}

export function renderSparkLiveSummary(
  summary: SparkLiveSummary,
  opts: { restartGuidance?: boolean; rawDetails?: boolean; includeAction?: boolean; sourceDisclosure?: boolean } = {}
): string {
  const healthy = summary.liveReady && summary.spawnerOk && summary.telegramOk;
  const includeAction = opts.includeAction ?? true;

  if (!opts.rawDetails) {
    const state = healthy
      ? 'Spark is healthy right now.'
      : 'Spark needs attention right now.';
    const liveFacts = healthy
      ? 'Spawner is reachable, Telegram is polling, and Mission Control is ready'
      : `Spawner ${summary.spawnerOk ? 'is reachable' : 'needs attention'}, Telegram ${summary.telegramOk ? 'is polling' : 'needs attention'}, and Mission Control ${summary.liveReady ? 'is ready' : 'is not fully ready'}`;
    const sourcePrefix = opts.sourceDisclosure
      ? "I'm using fresh runtime state here, not memory; it shows "
      : '';
    let followUp = `${sourcePrefix}${liveFacts}`;
    if (includeAction) {
      followUp += healthy
        ? (opts.restartGuidance
            ? '; no restart is needed, and restarting now would mostly add churn'
            : '; no repair action is needed')
        : (opts.restartGuidance
            ? '; do not blindly restart before confirming which supervised surface is down'
            : '; repair the unhealthy surface, then rerun this fresh check');
    }
    return `${state} ${followUp}.`;
  }

  const lines: string[] = [
    healthy ? '✅ Spark is healthy right now.' : '⚠️ Spark needs attention right now.'
  ];

  if (opts.sourceDisclosure) {
    lines.push('', "I'm using fresh runtime state here, not memory.");
  }

  lines.push(
    '',
    'Live loop',
    `• Spawner: ${summary.spawnerOk ? 'reachable' : 'needs attention'}.`,
    `• Telegram: ${summary.telegramOk ? 'polling' : 'needs attention'}.`,
    `• Mission Control: ${summary.liveReady ? 'ready' : 'not fully ready'}.`
  );

  if (opts.rawDetails) {
    lines.push(
      '',
      'Raw proof',
      `• Spawner: ${summary.spawnerText}.`,
      `• Telegram: ${summary.telegramText}.`,
      summary.profilesText ? `• Profiles: ${summary.profilesText}.` : '',
      summary.rolesText ? `• Models: ${summary.rolesText}.` : '',
      summary.supervisionText ? `• Supervision: ${summary.supervisionText}.` : ''
    );
  }

  if (includeAction) {
    lines.push(
      '',
      healthy
        ? (opts.restartGuidance
            ? 'No restart needed. Restarting now would mostly add churn.'
            : 'No repair action needed right now.')
        : (opts.restartGuidance
            ? 'Do not blindly restart. Start or restart only after confirming which supervised surface is down.'
            : 'Next step: repair the unhealthy surface, then rerun this fresh check.')
    );
  }
  return lines.join('\n').replace(/\n{3,}/g, '\n\n').trim();
}

export function shouldShowRawSparkLiveDetails(text: string): boolean {
  if (/\b(?:no|without|hide|omit|skip|exclude)\s+(?:raw|debug|details?|pids?|pid|supervision|exact|full)\b/i.test(text)) {
    return false;
  }
  return /\b(?:raw|debug|details?|pids?|pid|supervision|exact|full)\b/i.test(text);
}
