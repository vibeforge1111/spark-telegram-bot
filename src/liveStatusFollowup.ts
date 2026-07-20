import type { RecentConversationTurn } from './conversation';

export function cleanSparkStatusLine(line: string, label: string): string {
  return line
    .replace(new RegExp(`^\\[OK\\]\\s+${label}:\\s*`, 'i'), '')
    .replace(/\s*\|\s*/g, ' | ')
    .replace(/\s+/g, ' ')
    .trim();
}

function liveStatusFollowupKind(text: string): 'notice' | 'working' | 'open' | null {
  const normalized = text.toLowerCase().replace(/\s+/g, ' ').trim();
  if (/\bwhat should i notice first\b|\bwhat matters first\b/.test(normalized)) return 'notice';
  if (/\bis (?:it|spark|the (?:stack|loop|system)) still working\b/.test(normalized)) return 'working';
  if (/\bwhere can i open (?:it|spark|mission control)\b/.test(normalized)) return 'open';
  return null;
}

export async function resolveLiveStatusFollowup(
  text: string,
  recentTurns: RecentConversationTurn[],
  readFreshStatus: () => Promise<string>
): Promise<string | null> {
  const kind = liveStatusFollowupKind(text);
  if (!kind) return null;
  const hasRecentLiveStatus = recentTurns.some((turn) => (
    turn.role === 'assistant' && /Spark is (?:healthy|needs attention) right now/i.test(turn.text)
  ));
  if (!hasRecentLiveStatus) return null;
  if (kind === 'working') return readFreshStatus();
  if (kind === 'open') {
    return 'You can open Mission Control at http://127.0.0.1:3333. That is the clearest place to inspect the live system; Telegram can stay our conversation surface.';
  }
  return 'The first thing to notice is that Spawner, Telegram, and Mission Control are all healthy on fresh runtime state. The risk to watch next is drift after future changes, not a current outage.';
}
