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

const LIST_MARKER_PATTERN = /^((?:[-*]|\u2022|â€¢)\s+|\d+[.)]\s+)/;
const READABLE_CARD_SECTION_SEPARATOR = '---';

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

function linkLabelForUrl(url: string): string {
  try {
    const parsed = new URL(url);
    if (/\/preview\/[A-Za-z0-9_-]+\/index\.html$/i.test(parsed.pathname)) return 'Open preview';
    if (parsed.pathname === '/canvas') return 'Open canvas';
    if (parsed.pathname === '/kanban') return 'Open board';
    if (parsed.hostname === '127.0.0.1' || parsed.hostname === 'localhost') {
      return `Open ${parsed.pathname.replace(/^\/+/, '') || 'link'}`;
    }
    return parsed.hostname.replace(/^www\./i, '');
  } catch {
    return 'Open link';
  }
}

function inlineHtml(text: string): string {
  const urlPattern = /https?:\/\/[^\s<>"']+/gi;
  let html = '';
  let lastIndex = 0;
  for (const match of text.matchAll(urlPattern)) {
    const rawUrl = match[0];
    const start = match.index ?? 0;
    const trailing = rawUrl.match(/[),.;!?]+$/)?.[0] || '';
    const url = trailing ? rawUrl.slice(0, -trailing.length) : rawUrl;
    html += escapeHtml(text.slice(lastIndex, start));
    html += `<a href="${escapeHtml(url)}">${escapeHtml(linkLabelForUrl(url))}</a>`;
    html += escapeHtml(trailing);
    lastIndex = start + rawUrl.length;
  }
  html += escapeHtml(text.slice(lastIndex));
  return html;
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
  return lines.every((line) => LIST_MARKER_PATTERN.test(line));
}

function isSectionWithListParagraph(paragraph: string): boolean {
  const lines = paragraph.split('\n').map((line) => line.trim()).filter(Boolean);
  if (lines.length < 2) return false;
  const [section, ...items] = lines;
  if (!isReadableSectionLabel(section)) return false;
  return items.length > 0 && items.every((line) => LIST_MARKER_PATTERN.test(line));
}

function isReadableSectionLabel(line: string): boolean {
  const trimmed = line.trim();
  if (!trimmed || trimmed.length > HEADING_MAX_LENGTH) return false;
  if (LIST_MARKER_PATTERN.test(trimmed)) return false;
  if (/https?:\/\//i.test(trimmed)) return false;
  if (/[.!?]$/.test(trimmed)) return false;
  return true;
}

function splitReadableCardBlocks(text: string): string[] {
  const paragraphs = splitParagraphs(text);
  if (shouldRenderAsSpacedCard(paragraphs)) return paragraphs;

  const lines = text.split('\n').map((line) => line.trim()).filter(Boolean);
  if (lines.length < 3) return paragraphs;

  const blocks: string[] = [];
  let current: string[] = [];
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    const nextLine = lines[index + 1] || '';
    const startsSection = isReadableSectionLabel(line) && LIST_MARKER_PATTERN.test(nextLine);
    if (startsSection && current.length > 0) {
      blocks.push(current.join('\n'));
      current = [line];
      continue;
    }
    current.push(line);
  }
  if (current.length > 0) {
    blocks.push(current.join('\n'));
  }

  return shouldRenderAsSpacedCard(blocks) ? blocks : paragraphs;
}

function stripListMarker(line: string): string {
  return line.replace(LIST_MARKER_PATTERN, '').trim();
}

function listItemsToHtml(lines: string[]): string {
  const items = lines
    .map((line) => stripListMarker(line.trim()))
    .filter(Boolean)
    .map((item) => `<li>${inlineHtml(item)}</li>`)
    .join('');
  return `<ul>${items}</ul>`;
}

function lineToSpacedCardHtml(line: string): string {
  const trimmed = line.trim();
  if (!trimmed) return '';
  return inlineHtml(trimmed);
}

function paragraphToCardBlockHtml(paragraph: string, index: number, paragraphs: string[]): string {
  const lines = paragraph.split('\n').map((line) => line.trim()).filter(Boolean);
  if (!lines.length) return '';

  if (isSectionWithListParagraph(paragraph)) {
    const [section, ...items] = lines;
    return [
      '<blockquote>',
      `<p><b>${escapeHtml(section)}</b></p>`,
      listItemsToHtml(items),
      '</blockquote>'
    ].join('\n');
  }

  if (looksLikeHeading(paragraph, index, paragraphs)) {
    return `<h4>${escapeHtml(lines[0])}</h4>`;
  }

  return `<p>${lines.map(lineToSpacedCardHtml).join('<br>')}</p>`;
}

function shouldRenderAsSpacedCard(paragraphs: string[]): boolean {
  return paragraphs.some((paragraph) => isSectionWithListParagraph(paragraph));
}

function renderSpacedCard(paragraphs: string[]): string {
  return paragraphs
    .map((paragraph, index) => paragraphToCardBlockHtml(paragraph, index, paragraphs))
    .filter(Boolean)
    .join('\n');
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

  if (isSectionWithListParagraph(paragraph)) {
    const lines = paragraph.split('\n').map((line) => line.trim()).filter(Boolean);
    const [section, ...items] = lines;
    return `<h4>${escapeHtml(section)}</h4>\n${listItemsToHtml(items)}`;
  }

  if (isListParagraph(paragraph)) {
    return listItemsToHtml(paragraph.split('\n'));
  }

  if (looksLikeHeading(paragraph, index, paragraphs)) {
    return `<h4>${escapeHtml(paragraph)}</h4>`;
  }

  const normalized = paragraph
    .split('\n')
    .map((line) => inlineHtml(line.trim()))
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
    html: shouldRenderAsSpacedCard(paragraphs)
      ? renderSpacedCard(paragraphs)
      : paragraphs.map((paragraph, index) => paragraphToHtml(paragraph, index, paragraphs)).join('\n'),
    skip_entity_detection: false
  };
}

function paragraphToReadableHtmlMessage(paragraph: string, index: number, paragraphs: string[]): string {
  const lines = paragraph.split('\n').map((line) => line.trim()).filter(Boolean);
  if (!lines.length) return '';

  if (isSectionWithListParagraph(paragraph)) {
    const [section, ...items] = lines;
    return [
      `<b>${escapeHtml(section)}</b>`,
      ...items.map((item) => `• ${inlineHtml(stripListMarker(item))}`)
    ].join('\n');
  }

  if (looksLikeHeading(paragraph, index, paragraphs)) {
    return `<b>${escapeHtml(lines[0])}</b>`;
  }

  return lines.map((line) => {
    if (LIST_MARKER_PATTERN.test(line)) {
      return `• ${inlineHtml(stripListMarker(line))}`;
    }
    return inlineHtml(line);
  }).join('\n');
}

export function buildReadableTelegramHtmlMessageFromText(text: string): string | null {
  const prepared = trimForRichMessage(text);
  if (!prepared) return null;

  const paragraphs = splitReadableCardBlocks(prepared);
  if (!paragraphs.length || !shouldRenderAsSpacedCard(paragraphs)) return null;

  return paragraphs
    .map((paragraph, index) => paragraphToReadableHtmlMessage(paragraph, index, paragraphs))
    .filter(Boolean)
    .join(`\n\n${READABLE_CARD_SECTION_SEPARATOR}\n\n`);
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
