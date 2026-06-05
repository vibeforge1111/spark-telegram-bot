export function isTelegramImageMessage(message: unknown): boolean {
  if (!message || typeof message !== 'object') {
    return false;
  }
  const record = message as Record<string, unknown>;
  if (Array.isArray(record.photo) && record.photo.length > 0) {
    return true;
  }
  const document = record.document;
  return Boolean(
    document &&
    typeof document === 'object' &&
    typeof (document as Record<string, unknown>).mime_type === 'string' &&
    ((document as Record<string, unknown>).mime_type as string).startsWith('image/')
  );
}

export function telegramImageMemoryText(message: unknown): string {
  const record = (message && typeof message === 'object') ? message as Record<string, unknown> : null;
  const caption = typeof record?.caption === 'string' ? (record.caption as string).trim() : '';
  if (caption) {
    return `[image] ${caption}`;
  }
  const document = record?.document;
  const documentRecord = (document && typeof document === 'object') ? document as Record<string, unknown> : null;
  const fileName = typeof documentRecord?.file_name === 'string' ? (documentRecord.file_name as string).trim() : '';
  return fileName ? `[image] ${fileName}` : '[image]';
}

export function imageMessageHasCaption(message: unknown): boolean {
  if (!message || typeof message !== 'object') {
    return false;
  }
  const caption = (message as Record<string, unknown>).caption;
  return typeof caption === 'string' && caption.trim().length > 0;
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
