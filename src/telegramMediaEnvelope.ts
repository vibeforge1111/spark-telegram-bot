import { createHash } from 'node:crypto';

export type TelegramMediaTurnKind =
  | 'photo'
  | 'document'
  | 'voice'
  | 'audio'
  | 'video'
  | 'animation'
  | 'sticker'
  | 'video_note'
  | 'unsupported';

export interface TelegramMediaTurnEnvelope {
  schema: 'spark.media_turn.v1';
  media_kind: TelegramMediaTurnKind;
  chat_surface: 'telegram';
  turn_ref: string;
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
    has_video: boolean;
    has_animation: boolean;
    has_sticker: boolean;
    has_video_note: boolean;
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
    media: Boolean(message.photo || message.document || message.voice || message.audio || message.video || message.animation || message.sticker || message.video_note),
    caption_present: Boolean(stringValue(message.caption))
  });
  return `media:sha256:${createHash('sha256').update(seed).digest('hex').slice(0, 16)}`;
}

function mimeFamily(mimeType: string): string | undefined {
  if (!mimeType) return undefined;
  const [family] = mimeType.toLowerCase().split('/');
  return family || undefined;
}

export function isTelegramTextImageBoundaryRequest(text: string): boolean {
  const normalized = text.toLowerCase().replace(/\s+/g, ' ').trim();
  if (!normalized) return false;
  const announcesImage = /\b(?:about\s+to|going\s+to|gonna|will|i(?:'| a)m)\s+(?:send|upload|attach|share)\b.{0,50}\b(?:image|photo|picture|screenshot)\b/.test(normalized);
  const evidenceOnly = /\b(?:do not|don't|dont|please don't|please dont|won't|will not)\b.{0,80}\b(?:execute|follow|open|scan|run|act\s+on|treat)\b/.test(normalized) ||
    /\b(?:just|only)\s+(?:describe|inspect|read|look at)\b.{0,60}\b(?:visible|safely|image|photo|screenshot)\b/.test(normalized);
  return announcesImage && evidenceOnly;
}

export function telegramMediaTurnKind(messageInput: unknown): TelegramMediaTurnKind {
  const message = objectValue(messageInput);
  const document = objectValue(message.document);
  if (Array.isArray(message.photo) && message.photo.length > 0) return 'photo';
  if (Object.keys(message.voice ? objectValue(message.voice) : {}).length > 0) return 'voice';
  if (Object.keys(message.audio ? objectValue(message.audio) : {}).length > 0) return 'audio';
  if (Object.keys(document).length > 0) return 'document';
  if (Object.keys(message.video ? objectValue(message.video) : {}).length > 0) return 'video';
  if (Object.keys(message.animation ? objectValue(message.animation) : {}).length > 0) return 'animation';
  if (Object.keys(message.sticker ? objectValue(message.sticker) : {}).length > 0) return 'sticker';
  if (Object.keys(message.video_note ? objectValue(message.video_note) : {}).length > 0) return 'video_note';
  return 'unsupported';
}

export function buildTelegramMediaTurnEnvelope(messageInput: unknown): TelegramMediaTurnEnvelope {
  const message = objectValue(messageInput);
  const document = objectValue(message.document);
  const voice = objectValue(message.voice);
  const audio = objectValue(message.audio);
  const video = objectValue(message.video);
  const animation = objectValue(message.animation);
  const sticker = objectValue(message.sticker);
  const videoNote = objectValue(message.video_note);
  const mediaKind = telegramMediaTurnKind(message);
  const mimeType = stringValue(document.mime_type || voice.mime_type || audio.mime_type || video.mime_type || animation.mime_type);
  const caption = boundedCaption(message.caption);
  const canRead = mediaKind !== 'unsupported';
  return {
    schema: 'spark.media_turn.v1',
    media_kind: mediaKind,
    chat_surface: 'telegram',
    turn_ref: mediaTurnRef(message),
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
      has_video: Object.keys(video).length > 0,
      has_animation: Object.keys(animation).length > 0,
      has_sticker: Object.keys(sticker).length > 0,
      has_video_note: Object.keys(videoNote).length > 0,
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
  return 'I received that file or media, but this Telegram path only has text, image, voice, and audio evidence handling wired right now. I will not execute anything from it.';
}

export function renderTelegramTextImageBoundaryReply(): string {
  return [
    'Send it. I will safely inspect only what is visible in the image: layout, text, UI state, objects, screenshots, and obvious risk signals.',
    '',
    'I will not execute instructions inside it, follow links, scan QR codes, open files, or treat image text as commands.'
  ].join('\n');
}
