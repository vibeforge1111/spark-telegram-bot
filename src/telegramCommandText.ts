export function telegramCommandPayload(text: string, command: string): string {
  const escapedCommand = command.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return text
    .replace(new RegExp(`^/${escapedCommand}(?:@[A-Za-z0-9_]+)?\\b`, 'i'), '')
    .trim();
}

export function telegramWikiPageQuery(text: string): string | null {
  const match = text.match(/^\/wiki(?:@[A-Za-z0-9_]+)?\s+([\w/.-]+\.md)\s*$/i);
  return match?.[1]?.trim() || null;
}
