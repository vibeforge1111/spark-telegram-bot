const PROVIDER_LABELS: Record<string, string> = {
  minimax: 'MiniMax',
  zai: 'Z.AI GLM',
  claude: 'Claude',
  codex: 'Codex'
};

function humanProviderList(providers: string[]): string {
  const labels = providers.map((id) => PROVIDER_LABELS[id] || id);
  if (labels.length === 1) return labels[0];
  if (labels.length === 2) return `${labels[0]} and ${labels[1]}`;
  return labels.slice(0, -1).join(', ') + ', and ' + labels[labels.length - 1];
}

export function humanAck(providers: string[]): string {
  const who = humanProviderList(providers);
  return providers.length === 1
    ? `I will run that through ${who} now.`
    : `I will check that with ${who} in parallel now.`;
}

export function telegramBlocks(...blocks: Array<string | null | undefined | false>): string {
  return blocks
    .filter((block): block is string => Boolean(block && block.trim()))
    .map((block) => block.trim())
    .join('\n\n');
}
