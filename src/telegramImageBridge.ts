export function isTelegramImageMessage(message: any): boolean {
  if (!message || typeof message !== 'object') {
    return false;
  }
  if (Array.isArray(message.photo) && message.photo.length > 0) {
    return true;
  }
  const document = message.document;
  return Boolean(
    document &&
    typeof document === 'object' &&
    typeof document.mime_type === 'string' &&
    document.mime_type.startsWith('image/')
  );
}

export function telegramImageMemoryText(message: any): string {
  const caption = typeof message?.caption === 'string' ? message.caption.trim() : '';
  if (caption) {
    return `[image] ${caption}`;
  }
  const fileName = typeof message?.document?.file_name === 'string' ? message.document.file_name.trim() : '';
  return fileName ? `[image] ${fileName}` : '[image]';
}

export function imageMessageHasCaption(message: any): boolean {
  return typeof message?.caption === 'string' && message.caption.trim().length > 0;
}

export function buildContextualImageUpdate(
  update: Record<string, unknown>,
  recentMessages: string[]
): Record<string, unknown> {
  const cloned = JSON.parse(JSON.stringify(update)) as Record<string, unknown>;
  const message = cloned.message;
  if (!message || typeof message !== 'object') {
    return cloned;
  }
  const messageRecord = message as Record<string, unknown>;
  if (typeof messageRecord.caption === 'string' && messageRecord.caption.trim()) {
    return cloned;
  }
  const context = recentMessages
    .map((item) => String(item || '').trim())
    .filter(Boolean)
    .slice(-6);
  if (!context.length) {
    return cloned;
  }
  messageRecord.caption = [
    'The user shared this image without a caption.',
    'Use the recent Telegram context to infer the likely request when the image is clearly related.',
    'If the context does not make the intent clear, briefly describe the image and ask one specific follow-up.',
    '',
    'Recent Telegram context:',
    ...context.map((item) => `- ${item}`),
  ].join('\n');
  return cloned;
}
