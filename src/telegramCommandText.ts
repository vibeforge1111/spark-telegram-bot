export function telegramCommandPayload(text: string, command: string): string {
  const escapedCommand = command.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return text
    .replace(new RegExp(`^/${escapedCommand}(?:@[A-Za-z0-9_]+)?\\b`, 'i'), '')
    .trim();
}
