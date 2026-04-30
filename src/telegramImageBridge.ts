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
