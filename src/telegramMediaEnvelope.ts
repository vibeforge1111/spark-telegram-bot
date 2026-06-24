import { createHash } from 'node:crypto';

export type TelegramMediaTurnKind = 'photo' | 'document' | 'voice' | 'audio' | 'unsupported';

export interface TelegramMediaTurnEnvelope {
  schema: 'spark.media_turn.v1';
  media_kind: TelegramMediaTurnKind;
  chat_surface: 'telegram';
  turn_ref: string;
  caption_text?: string;
  analysis_policy: {
    can_read: boolean;
    can_store: false;
    can_execute: false;
  };
  authority: {
    requires_turn_intent: true;
    mutation_allowed: false;
  };
  source: {
    has_caption: boolean;
    has_photo: boolean;
    has_document: boolean;
    has_voice: boolean;
    has_audio: boolean;
    mime_family?: string;
    filename_present?: boolean;
  };
}

function objectValue(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function stringValue(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function boundedCaption(value: unknown): string {
  return stringValue(value).replace(/\s+/g, ' ').slice(0, 500);
}

function mediaTurnRef(message: Record<string, unknown>): string {
  const seed = JSON.stringify({
    message_id: message.message_id || '',
    date: message.date || '',
    media: Boolean(message.photo || message.document || message.voice || message.audio),
    caption_present: Boolean(stringValue(message.caption))
  });
  return `media:sha256:${createHash('sha256').update(seed).digest('hex').slice(0, 16)}`;
}

function mimeFamily(mimeType: string): string | undefined {
  if (!mimeType) return undefined;
  const [family] = mimeType.toLowerCase().split('/');
  return family || undefined;
}

export function telegramMediaTurnKind(messageInput: unknown): TelegramMediaTurnKind {
  const message = objectValue(messageInput);
  const document = objectValue(message.document);
  if (Array.isArray(message.photo) && message.photo.length > 0) return 'photo';
  if (Object.keys(message.voice ? objectValue(message.voice) : {}).length > 0) return 'voice';
  if (Object.keys(message.audio ? objectValue(message.audio) : {}).length > 0) return 'audio';
  if (Object.keys(document).length > 0) return 'document';
  return 'unsupported';
}

export function buildTelegramMediaTurnEnvelope(messageInput: unknown): TelegramMediaTurnEnvelope {
  const message = objectValue(messageInput);
  const document = objectValue(message.document);
  const voice = objectValue(message.voice);
  const audio = objectValue(message.audio);
  const mediaKind = telegramMediaTurnKind(message);
  const mimeType = stringValue(document.mime_type || voice.mime_type || audio.mime_type);
  const caption = boundedCaption(message.caption);
  const canRead = mediaKind !== 'unsupported';
  return {
    schema: 'spark.media_turn.v1',
    media_kind: mediaKind,
    chat_surface: 'telegram',
    turn_ref: mediaTurnRef(message),
    ...(caption ? { caption_text: caption } : {}),
    analysis_policy: {
      can_read: canRead,
      can_store: false,
      can_execute: false
    },
    authority: {
      requires_turn_intent: true,
      mutation_allowed: false
    },
    source: {
      has_caption: Boolean(caption),
      has_photo: Array.isArray(message.photo) && message.photo.length > 0,
      has_document: Object.keys(document).length > 0,
      has_voice: Object.keys(voice).length > 0,
      has_audio: Object.keys(audio).length > 0,
      ...(mimeFamily(mimeType) ? { mime_family: mimeFamily(mimeType) } : {}),
      ...(stringValue(document.file_name) ? { filename_present: true } : {})
    }
  };
}

export function attachTelegramMediaTurnEnvelope(updateInput: Record<string, unknown>): Record<string, unknown> {
  const update = JSON.parse(JSON.stringify(updateInput)) as Record<string, unknown>;
  const message = objectValue(update.message);
  if (!Object.keys(message).length) {
    return update;
  }
  const envelope = buildTelegramMediaTurnEnvelope(message);
  update.spark_media_turn = envelope;
  (update.message as Record<string, unknown>).spark_media_turn = envelope;
  return update;
}

export function renderUnsupportedTelegramMediaReply(): string {
  return 'I received that file, but this Telegram path only has text, image, voice, and audio evidence handling wired right now. I will not execute anything from the file.';
}
