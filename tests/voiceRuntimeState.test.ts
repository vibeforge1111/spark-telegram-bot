import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {
  buildTelegramVoiceBridgeRuntimeState,
  writeTelegramVoiceBridgeRuntimeState
} from '../src/voiceRuntimeState';

const tests: Array<{ name: string; fn: () => void | Promise<void> }> = [];

function test(name: string, fn: () => void | Promise<void>): void {
  tests.push({ name, fn });
}

const existingRuntimeState = {
  schema_version: 'spark.voice_runtime_state.v1',
  generated_at: '2026-06-02T08:00:00Z',
  surface: 'spark_os_healthcheck',
  stt: {
    provider_id: 'local_faster_whisper',
    ready: true,
  },
  tts: {
    provider_id: 'macos-say',
    ready: true,
    voice_id_masked: '',
  },
  telegram_delivery: {
    ready: false,
    last_send_voice_status: 'unknown',
    telegram_message_id_present: false,
  },
  latency: {
    synthesize_ms: 0,
  },
  claim_levels: {
    configured: true,
    synthesis_ready: true,
    delivery_ready: false,
    conversation_ready: false,
  },
  source_ledger: ['voice.status', 'voice_profile'],
};

test('records Telegram audio fallback as delivered without claiming native voice note readiness', () => {
  const state = buildTelegramVoiceBridgeRuntimeState({
    existingState: existingRuntimeState,
    voiceMedia: {
      filename: 'voice-reply.wav',
      mimeType: 'audio/wav',
      voiceCompatible: false,
      providerId: 'macos-say',
      voiceId: 'private-operator-voice-id',
      synthesisMs: 384,
    },
    sendMethod: 'sendAudio',
    telegramResult: { message_id: 123 },
    audioBytes: 117520,
    sentAtIso: '2026-06-02T09:10:00Z',
  });

  assert.equal(state.schema_version, 'spark.voice_runtime_state.v1');
  assert.equal(state.surface, 'telegram_bot_bridge');
  assert.deepEqual(state.stt, existingRuntimeState.stt);

  const delivery = state.telegram_delivery as Record<string, unknown>;
  assert.equal(delivery.ready, true);
  assert.equal(delivery.last_send_voice_status, 'document_fallback');
  assert.equal(delivery.send_method, 'sendAudio');
  assert.equal(delivery.native_voice_message_ready, false);
  assert.equal(delivery.telegram_message_id_present, true);

  const claims = state.claim_levels as Record<string, unknown>;
  assert.equal(claims.synthesis_ready, true);
  assert.equal(claims.delivery_ready, true);
  assert.equal(claims.conversation_ready, true);

  const tts = state.tts as Record<string, unknown>;
  assert.equal(tts.ready, true);
  assert.equal(tts.provider_id, 'macos-say');
  assert.equal(tts.voice_compatible, false);
  assert.equal(tts.audio_bytes, 117520);

  const serialized = JSON.stringify(state);
  assert.doesNotMatch(serialized, /private-operator-voice-id/);
  assert.match(serialized, /priv\.\.\.e-id/);
  assert.deepEqual(state.source_ledger, ['voice.status', 'voice_profile', 'telegram-bot-voice-bridge']);
});

test('records native Telegram voice delivery separately from audio fallback', () => {
  const state = buildTelegramVoiceBridgeRuntimeState({
    existingState: existingRuntimeState,
    voiceMedia: {
      filename: 'voice-reply.ogg',
      mimeType: 'audio/ogg',
      voiceCompatible: true,
      providerId: 'elevenlabs',
      voiceId: 'native-voice-id',
    },
    sendMethod: 'sendVoice',
    telegramResult: { result: { message_id: 456 } },
    audioBytes: 8192,
    sentAtIso: '2026-06-02T09:11:00Z',
  });

  const delivery = state.telegram_delivery as Record<string, unknown>;
  assert.equal(delivery.ready, true);
  assert.equal(delivery.last_send_voice_status, 'success');
  assert.equal(delivery.send_method, 'sendVoice');
  assert.equal(delivery.native_voice_message_ready, true);
  assert.equal(delivery.telegram_message_id_present, true);
});

test('writes sanitized runtime state to the Spark OS artifact path', async () => {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), 'spark-voice-runtime-state-'));
  const outputPath = path.join(tempDir, 'state', 'spark-voice-comms', 'voice-runtime-state.json');
  try {
    await writeTelegramVoiceBridgeRuntimeState(outputPath, {
      voiceMedia: {
        filename: 'voice-reply.wav',
        mimeType: 'audio/wav',
        voiceCompatible: false,
        providerId: 'macos-say',
        voiceId: 'secret-voice-id',
      },
      sendMethod: 'sendAudio',
      telegramResult: { message_id: 789 },
      audioBytes: 4096,
      sentAtIso: '2026-06-02T09:12:00Z',
    });

    const written = await readFile(outputPath, 'utf8');
    const state = JSON.parse(written) as Record<string, unknown>;
    const delivery = state.telegram_delivery as Record<string, unknown>;
    assert.equal(delivery.ready, true);
    assert.equal(delivery.telegram_message_id_present, true);
    assert.doesNotMatch(written, /secret-voice-id/);
    assert.match(written, /metadata only/);
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
});

void (async () => {
  for (const { name, fn } of tests) {
    try {
      await fn();
      console.log(`ok - ${name}`);
    } catch (error) {
      console.error(`not ok - ${name}`);
      throw error;
    }
  }
})();
