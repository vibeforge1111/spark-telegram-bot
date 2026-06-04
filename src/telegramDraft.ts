import { randomInt } from 'node:crypto';
import { sanitizeOutbound } from './outboundSanitize';
import { redactText } from './redaction';

export interface TelegramDraftApi {
  callApi(method: string, payload: Record<string, unknown>): Promise<unknown>;
}

export interface TelegramDraftStreamer {
  push(text: string): Promise<void>;
}

export type TelegramStreamingConfigAction =
  | { kind: 'status' }
  | { kind: 'set'; key: 'SPARK_TELEGRAM_CHAT_STREAMING' | 'SPARK_TELEGRAM_DRAFT_INTERVAL_MS'; value: string };

const TELEGRAM_DRAFT_TEXT_LIMIT = 3500;
const FULL_REPLY_DRAFT_PREVIEW_MIN_CHARS = 40;
const TELEGRAM_DRAFT_LOCAL_PATH_PATTERN =
  /\b[A-Z]:\\[^\s`'"]+|(?<![\w.])\/(?:Users|home|tmp|var|private|Volumes|workspace|mnt|root)\/[^\s`'"]+/gi;

export function telegramDraftStreamingEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  return env.SPARK_TELEGRAM_CHAT_STREAMING === '1';
}

export function telegramDraftsSupportedForContext(ctx: any, env: NodeJS.ProcessEnv = process.env): boolean {
  if (!telegramDraftStreamingEnabled(env)) return false;
  if (!ctx?.chat?.id) return false;
  return ctx.chat.type === 'private';
}

export function createTelegramDraftId(): number {
  return randomInt(1, 2_147_483_647);
}

export function telegramDraftIntervalMs(env: NodeJS.ProcessEnv = process.env): number {
  const parsed = Number(env.SPARK_TELEGRAM_DRAFT_INTERVAL_MS || 700);
  if (!Number.isFinite(parsed)) return 700;
  return Math.max(0, parsed);
}

export function prepareTelegramDraftText(text: string): string {
  const sanitized = sanitizeOutbound(text).trim();
  if (sanitized.length <= TELEGRAM_DRAFT_TEXT_LIMIT) return sanitized;
  return sanitized.slice(0, TELEGRAM_DRAFT_TEXT_LIMIT - 1).trimEnd();
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function safeTelegramDraftFailureDetail(error: unknown): string {
  const detail = error instanceof Error ? error.message : String(error);
  const redacted = redactText(detail).replace(TELEGRAM_DRAFT_LOCAL_PATH_PATTERN, '<local-path>').trim();
  return redacted || 'draft update failed';
}

function sliceAtWord(text: string, target: number): string {
  const bounded = Math.max(1, Math.min(target, text.length));
  const window = text.slice(0, bounded + 18);
  const match = window.match(/[\s.,;:!?][^\s.,;:!?]*$/);
  const cut = match?.index && match.index > Math.floor(bounded * 0.6) ? match.index : bounded;
  return text.slice(0, cut).trim();
}

export function buildTelegramDraftPreviewTexts(text: string): string[] {
  const prepared = prepareTelegramDraftText(text);
  if (!prepared) return [];
  if (prepared.length <= FULL_REPLY_DRAFT_PREVIEW_MIN_CHARS) return [prepared];

  const previews = [
    sliceAtWord(prepared, Math.ceil(prepared.length * 0.45)),
    prepared,
  ].filter(Boolean);

  return [...new Set(previews)];
}

export async function replayTelegramDraftPreview(
  ctx: any,
  api: TelegramDraftApi | undefined,
  text: string,
  env: NodeJS.ProcessEnv = process.env
): Promise<void> {
  if (!api?.callApi || !telegramDraftsSupportedForContext(ctx, env)) return;
  if (env.SPARK_TELEGRAM_DRAFT_PREVIEW_FULL_REPLIES === '0') return;

  const previews = buildTelegramDraftPreviewTexts(text);
  if (!previews.length) return;

  const chatId = ctx.chat.id;
  const draftId = createTelegramDraftId();
  const intervalMs = Math.min(telegramDraftIntervalMs(env), 1200);
  try {
    for (let index = 0; index < previews.length; index += 1) {
      await api.callApi('sendMessageDraft', {
        chat_id: chatId,
        draft_id: draftId,
        text: previews[index],
      });
      if (index < previews.length - 1 && intervalMs > 0) {
        await delay(intervalMs);
      }
    }
  } catch (error) {
    console.warn(`[TelegramDraft] ignored full-reply draft preview failure: ${safeTelegramDraftFailureDetail(error)}`);
  }
}

export function parseTelegramStreamingConfigText(text: string): TelegramStreamingConfigAction | null {
  const trimmed = text.trim();
  if (/^\/?streaming(?:\s+status)?$/i.test(trimmed) || /^\/?drafts(?:\s+status)?$/i.test(trimmed)) {
    return { kind: 'status' };
  }

  const toggleMatch =
    trimmed.match(/^\/?(?:streaming|drafts)\s+(on|off|true|false|1|0)$/i) ||
    trimmed.match(/^SPARK_TELEGRAM_CHAT_STREAMING\s*=\s*(on|off|true|false|1|0)$/i);
  if (toggleMatch) {
    const raw = toggleMatch[1].toLowerCase();
    const value = raw === 'on' || raw === 'true' || raw === '1' ? '1' : '0';
    return { kind: 'set', key: 'SPARK_TELEGRAM_CHAT_STREAMING', value };
  }

  const intervalMatch =
    trimmed.match(/^\/?(?:streaming|drafts)\s+(?:interval|interval_ms|draft_interval)\s+(\d+)$/i) ||
    trimmed.match(/^SPARK_TELEGRAM_DRAFT_INTERVAL_MS\s*=\s*(\d+)$/i);
  if (intervalMatch) {
    const value = String(Math.min(10_000, Math.max(0, Number(intervalMatch[1]))));
    return { kind: 'set', key: 'SPARK_TELEGRAM_DRAFT_INTERVAL_MS', value };
  }

  return null;
}

export function renderTelegramStreamingConfigStatus(env: NodeJS.ProcessEnv = process.env): string {
  const enabled = telegramDraftStreamingEnabled(env);
  const interval = telegramDraftIntervalMs(env);
  return [
    'Telegram draft streaming',
    `Status: ${enabled ? 'on' : 'off'}`,
    `Draft interval: ${interval}ms`,
    '',
    'Private chats only. Builder-routed replies may still return as full messages.'
  ].join('\n');
}

export function createTelegramDraftStreamer(
  ctx: any,
  api: TelegramDraftApi | undefined,
  env: NodeJS.ProcessEnv = process.env
): TelegramDraftStreamer | null {
  if (!api?.callApi || !telegramDraftsSupportedForContext(ctx, env)) return null;

  const chatId = ctx.chat.id;
  const draftId = createTelegramDraftId();
  const intervalMs = telegramDraftIntervalMs(env);
  let lastSentAt = 0;
  let lastText = '';
  let disabled = false;

  return {
    async push(text: string): Promise<void> {
      if (disabled) return;
      const draftText = prepareTelegramDraftText(text);
      if (!draftText || draftText === lastText) return;

      const now = Date.now();
      if (lastSentAt && now - lastSentAt < intervalMs) return;

      try {
        await api.callApi('sendMessageDraft', {
          chat_id: chatId,
          draft_id: draftId,
          text: draftText,
        });
        lastSentAt = now;
        lastText = draftText;
      } catch (error) {
        disabled = true;
        console.warn(`[TelegramDraft] disabled after sendMessageDraft failure: ${safeTelegramDraftFailureDetail(error)}`);
      }
    },
  };
}
