import { redactText } from './redaction';
import { attachTelegramMediaTurnEnvelope } from './telegramMediaEnvelope';

const DEFAULT_VOICE_DOWNLOAD_MAX_BYTES = 20 * 1024 * 1024;

function voiceDownloadMaxBytes(): number {
  const parsed = Number.parseInt(process.env.SPARK_TELEGRAM_VOICE_DOWNLOAD_MAX_BYTES || '', 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_VOICE_DOWNLOAD_MAX_BYTES;
}

function objectValue(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

function mediaExtension(mimeType: string): string {
  const normalized = mimeType.toLowerCase();
  if (normalized.includes('ogg') || normalized.includes('opus')) return '.ogg';
  if (normalized.includes('mpeg') || normalized.includes('mp3')) return '.mp3';
  if (normalized.includes('wav')) return '.wav';
  if (normalized.includes('mp4') || normalized.includes('m4a')) return '.m4a';
  return '.audio';
}

function redactTelegramVoiceAudioMessage(message: Record<string, unknown>): Record<string, unknown> {
  const clean = { ...message };
  for (const key of ['voice', 'audio']) {
    const media = objectValue(clean[key]);
    if (!media) continue;
    const mediaClean = { ...media };
    delete mediaClean.file_id;
    delete mediaClean.file_unique_id;
    clean[key] = mediaClean;
  }
  return clean;
}

async function responseBuffer(response: Response): Promise<Buffer> {
  return Buffer.from(await response.arrayBuffer());
}

export async function buildVoiceBridgeUpdate(
  ctx: any,
  fetchImpl: typeof fetch = fetch
): Promise<Record<string, unknown>> {
  const update = objectValue(ctx?.update) || {};
  const message = objectValue(update.message);
  if (!message) {
    return update;
  }

  const voice = objectValue(message.voice);
  const audio = objectValue(message.audio);
  const media = voice || audio;
  if (!media) {
    return update;
  }
  const envelopedUpdate = attachTelegramMediaTurnEnvelope(update);
  const envelopedMessage = redactTelegramVoiceAudioMessage(objectValue(envelopedUpdate.message) || message);
  const redactedEnvelopedUpdate = {
    ...envelopedUpdate,
    message: envelopedMessage,
  };

  const fileId = String(media.file_id || '').trim();
  if (!fileId || !ctx?.telegram?.getFileLink) {
    return redactedEnvelopedUpdate;
  }

  try {
    const startedAt = Date.now();
    const maxBytes = voiceDownloadMaxBytes();
    const fileLink = await ctx.telegram.getFileLink(fileId);
    const response = await fetchImpl(fileLink);
    if (!response.ok) {
      throw new Error(`HTTP ${response.status} ${response.statusText || ''}`.trim());
    }
    const contentLength = Number.parseInt(response.headers.get('content-length') || '', 10);
    if (Number.isFinite(contentLength) && contentLength > maxBytes) {
      throw new Error(`Telegram voice file is too large (${contentLength} bytes).`);
    }

    const audioBuffer = await responseBuffer(response);
    if (audioBuffer.length > maxBytes) {
      throw new Error(`Telegram voice file is too large (${audioBuffer.length} bytes).`);
    }

    const mimeType = String(media.mime_type || response.headers.get('content-type') || (voice ? 'audio/ogg' : 'application/octet-stream'));
    const filename = `${voice ? 'telegram-voice' : 'telegram-audio'}${mediaExtension(mimeType)}`;
    const downloadMs = Date.now() - startedAt;
    console.log(`[VoiceBridgeTiming] runner_download_ms=${downloadMs} bytes=${audioBuffer.length} mime=${mimeType}`);
    return {
      ...redactedEnvelopedUpdate,
      message: {
        ...envelopedMessage,
        spark_media: {
          audio_base64: audioBuffer.toString('base64'),
          filename,
          mime_type: mimeType,
          source: 'telegram_runner_download',
          size_bytes: audioBuffer.length,
          download_ms: downloadMs,
        },
      },
    };
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    console.warn(`[VoiceBridge] runner media download unavailable: ${redactText(detail)}`);
    return redactedEnvelopedUpdate;
  }
}
