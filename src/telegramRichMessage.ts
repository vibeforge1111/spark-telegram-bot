import { sanitizeOutbound } from './outboundSanitize';

export interface TelegramRichMessageApi {
  callApi(method: string, payload: Record<string, unknown>): Promise<unknown>;
}

export interface InputRichMessage {
  html: string;
  skip_entity_detection?: boolean;
}

type TelegramChatId = string | number;

const HEADING_MAX_LENGTH = 72;
const RICH_MESSAGE_TEXT_LIMIT = 3900;
const DEFAULT_RICH_MESSAGE_ENABLED = true;

const EXTRA_FIELDS_ALLOWED_FOR_RICH_MESSAGES = new Set([
  'allow_paid_broadcast',
  'business_connection_id',
  'direct_messages_topic_id',
  'disable_notification',
  'message_effect_id',
  'message_thread_id',
  'protect_content',
  'reply_markup',
  'reply_parameters',
  'suggested_post_parameters'
]);

export function telegramRichMessagesEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  if (env.SPARK_TELEGRAM_RICH_MESSAGES === '0') return false;
  if (env.SPARK_TELEGRAM_RICH_MESSAGES === '1') return true;
  return DEFAULT_RICH_MESSAGE_ENABLED;
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function trimForRichMessage(text: string): string {
  const sanitized = sanitizeOutbound(text).trim();
  if (sanitized.length <= RICH_MESSAGE_TEXT_LIMIT) return sanitized;
  return sanitized.slice(0, RICH_MESSAGE_TEXT_LIMIT - 1).trimEnd();
}

function splitParagraphs(text: string): string[] {
  return text
    .split(/\n{2,}/)
    .map((part) => part.trim())
    .filter(Boolean);
}

function isListParagraph(paragraph: string): boolean {
  const lines = paragraph.split('\n').map((line) => line.trim()).filter(Boolean);
  if (lines.length < 2) return false;
  return lines.every((line) => /^((?:[-*]|\u2022)\s+|\d+[.)]\s+)/.test(line));
}

function stripListMarker(line: string): string {
  return line.replace(/^((?:[-*]|\u2022)\s+|\d+[.)]\s+)/, '').trim();
}

function looksLikeHeading(paragraph: string, index: number, paragraphs: string[]): boolean {
  if (paragraph.includes('\n')) return false;
  if (paragraph.length > HEADING_MAX_LENGTH) return false;
  if (/https?:\/\//i.test(paragraph)) return false;
  if (/[.!?]$/.test(paragraph)) return false;
  if (index === 0) return paragraphs.length > 1;

  const next = paragraphs[index + 1] || '';
  return isListParagraph(next);
}

function paragraphToHtml(paragraph: string, index: number, paragraphs: string[]): string {
  if (/^```[\s\S]*```$/.test(paragraph)) {
    const code = paragraph.replace(/^```[a-z0-9_-]*\n?/i, '').replace(/```$/, '').trim();
    return `<pre><code>${escapeHtml(code)}</code></pre>`;
  }

  if (isListParagraph(paragraph)) {
    const items = paragraph
      .split('\n')
      .map((line) => stripListMarker(line.trim()))
      .filter(Boolean)
      .map((item) => `<li>${escapeHtml(item)}</li>`)
      .join('');
    return `<ul>${items}</ul>`;
  }

  if (looksLikeHeading(paragraph, index, paragraphs)) {
    return `<h4>${escapeHtml(paragraph)}</h4>`;
  }

  const normalized = paragraph
    .split('\n')
    .map((line) => escapeHtml(line.trim()))
    .filter(Boolean)
    .join('<br>');
  return `<p>${normalized}</p>`;
}

export function buildInputRichMessageFromText(text: string): InputRichMessage | null {
  const prepared = trimForRichMessage(text);
  if (!prepared) return null;

  const paragraphs = splitParagraphs(prepared);
  if (!paragraphs.length) return null;

  return {
    html: paragraphs.map((paragraph, index) => paragraphToHtml(paragraph, index, paragraphs)).join('\n'),
    skip_entity_detection: false
  };
}

export function stripRichUnsupportedExtra(extra: unknown): Record<string, unknown> {
  if (!extra || typeof extra !== 'object') return {};

  const clean: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(extra as Record<string, unknown>)) {
    if (EXTRA_FIELDS_ALLOWED_FOR_RICH_MESSAGES.has(key)) {
      clean[key] = value;
    }
  }
  return clean;
}

export async function sendTelegramRichMessage(
  api: TelegramRichMessageApi,
  chatId: TelegramChatId,
  text: string,
  extra?: unknown
): Promise<unknown> {
  const richMessage = buildInputRichMessageFromText(text);
  if (!richMessage) return null;

  return api.callApi('sendRichMessage', {
    chat_id: chatId,
    rich_message: richMessage,
    ...stripRichUnsupportedExtra(extra)
  });
}
