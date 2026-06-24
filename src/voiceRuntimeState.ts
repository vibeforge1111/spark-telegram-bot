import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

export interface TelegramVoiceBridgeMedia {
  mimeType: string;
  filename: string;
  voiceCompatible: boolean;
  providerId?: string;
  voiceId?: string;
  spokenText?: string;
  synthesisMs?: number;
}

export interface TelegramVoiceBridgeDeliveryInput {
  existingState?: Record<string, unknown>;
  voiceMedia: TelegramVoiceBridgeMedia;
  sendMethod: 'sendVoice' | 'sendAudio' | 'sendDocument';
  telegramResult?: unknown;
  audioBytes: number;
  sentAtIso?: string;
  traceContext?: {
    requestId?: string | null;
    traceRef?: string | null;
    proofRef?: string | null;
  };
}

function objectValue(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function arrayValue(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function maskIdentifier(value: string | undefined): string {
  const text = String(value || '').trim();
  if (!text) return '';
  if (text.length <= 8) return '***';
  return `${text.slice(0, 4)}...${text.slice(-4)}`;
}

function telegramMessageIdPresent(value: unknown): boolean {
  const payload = objectValue(value);
  const result = objectValue(payload.result);
  return result.message_id !== undefined || payload.message_id !== undefined;
}

function cleanTraceValue(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function mergeSources(existing: Record<string, unknown>): string[] {
  return Array.from(new Set([
    ...arrayValue(existing.source_ledger).map(String),
    'telegram-bot-voice-bridge',
  ]));
}

export function buildTelegramVoiceBridgeRuntimeState(input: TelegramVoiceBridgeDeliveryInput): Record<string, unknown> {
  const existing = input.existingState?.schema_version === 'spark.voice_runtime_state.v1'
    ? JSON.parse(JSON.stringify(input.existingState)) as Record<string, unknown>
    : {};
  const stt = objectValue(existing.stt);
  const priorTts = objectValue(existing.tts);
  const sentAt = input.sentAtIso || new Date().toISOString().replace(/\.\d{3}Z$/, 'Z');
  const nativeVoiceMessageReady = input.sendMethod === 'sendVoice';
  const sendStatus = nativeVoiceMessageReady ? 'success' : 'document_fallback';
  const tts = {
    ...priorTts,
    provider_id: input.voiceMedia.providerId || priorTts.provider_id || 'unknown',
    ready: true,
    mime_type: input.voiceMedia.mimeType,
    voice_compatible: input.voiceMedia.voiceCompatible,
    audio_bytes: Math.max(0, input.audioBytes),
    voice_id_masked: maskIdentifier(input.voiceMedia.voiceId) || priorTts.voice_id_masked || '',
  };
  const latency = objectValue(existing.latency);
  if (input.voiceMedia.synthesisMs !== undefined) {
    latency.synthesize_ms = Math.max(0, Math.round(input.voiceMedia.synthesisMs));
  }
  const requestId = cleanTraceValue(input.traceContext?.requestId);
  const traceRef = cleanTraceValue(input.traceContext?.traceRef);
  const proofRef = cleanTraceValue(input.traceContext?.proofRef);
  return {
    schema_version: 'spark.voice_runtime_state.v1',
    generated_at: sentAt,
    surface: 'telegram_bot_bridge',
    ...(requestId ? { request_id: requestId } : {}),
    ...(traceRef ? { trace_ref: traceRef } : {}),
    ...(proofRef ? { harness_proof_ref: proofRef } : {}),
    trace_continuity: {
      request_joined: Boolean(requestId),
      trace_joined: Boolean(traceRef),
      proof_joined: Boolean(proofRef),
      proof_storage: proofRef ? 'redacted_ref_only' : 'missing',
    },
    dm_voice_replies: existing.dm_voice_replies || 'unknown',
    canonical_chip_key: 'spark-voice-comms',
    legacy_alias_visible: Boolean(existing.legacy_alias_visible),
    stt,
    tts,
    telegram_delivery: {
      ready: true,
      last_send_voice_at: sentAt,
      last_send_voice_at_present: true,
      last_send_voice_status: sendStatus,
      last_failure_reason: '',
      last_failure_reason_present: false,
      telegram_message_id_present: telegramMessageIdPresent(input.telegramResult),
      send_method: input.sendMethod,
      native_voice_message_ready: nativeVoiceMessageReady,
    },
    latency,
    claim_levels: {
      ...objectValue(existing.claim_levels),
      configured: true,
      synthesis_ready: true,
      delivery_ready: true,
      conversation_ready: Boolean(objectValue(existing.stt).ready),
    },
    source_ledger: mergeSources(existing),
    redaction: 'metadata only; raw audio, transcript bodies, provider secrets, and unmasked voice ids omitted',
  };
}

export async function writeTelegramVoiceBridgeRuntimeState(
  outputPath: string,
  input: Omit<TelegramVoiceBridgeDeliveryInput, 'existingState'>
): Promise<Record<string, unknown>> {
  let existingState: Record<string, unknown> = {};
  try {
    existingState = JSON.parse(await readFile(outputPath, 'utf8')) as Record<string, unknown>;
  } catch {
    existingState = {};
  }
  const runtimeState = buildTelegramVoiceBridgeRuntimeState({ ...input, existingState });
  await mkdir(path.dirname(outputPath), { recursive: true });
  await writeFile(outputPath, JSON.stringify(runtimeState, null, 2), 'utf8');
  return runtimeState;
}
