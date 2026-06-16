export const TELEGRAM_HTML_REPLY_OPTIONS = {
  parse_mode: 'HTML',
  disable_web_page_preview: true
} as const;

export function escapeTelegramHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

export function escapeTelegramHtmlAttribute(value: string): string {
  return escapeTelegramHtml(value).replace(/"/g, '&quot;');
}

export function telegramHtmlBold(value: string): string {
  return `<b>${escapeTelegramHtml(value)}</b>`;
}

export function telegramHtmlLink(label: string, href: string): string {
  return `<a href="${escapeTelegramHtmlAttribute(href)}">${escapeTelegramHtml(label)}</a>`;
}
