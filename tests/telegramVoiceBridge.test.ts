import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildVoiceBridgeUpdate, voiceBridgeDownloadLog } from '../src/telegramVoiceBridge';

function fakeResponse(body: Buffer, headers: Record<string, string> = {}): Response {
  return {
    ok: true,
    status: 200,
    statusText: 'OK',
    headers: {
      get(name: string): string | null {
        return headers[name.toLowerCase()] || null;
      },
    },
    async arrayBuffer(): Promise<ArrayBuffer> {
      const arrayBuffer = new ArrayBuffer(body.length);
      new Uint8Array(arrayBuffer).set(body);
      return arrayBuffer;
    },
  } as Response;
}

test('voice download timing uses bounded structured diagnostics', () => {
  const parsed = JSON.parse(voiceBridgeDownloadLog(12.9, 44, 'audio/ogg /Users/operator/private'));
  assert.deepEqual(parsed, {
    event: 'voice_bridge_download',
    downloadMs: 12,
    bytes: 44,
    mime: 'audio/ogg [REDACTED_PATH]'
  });
});

test('downloads Telegram voice bytes through the active runner context', async () => {
  const update = {
    update_id: 10,
    message: {
      message_id: 20,
      voice: {
        file_id: 'voice-file-id',
        mime_type: 'audio/ogg',
        duration: 3,
      },
    },
  };

  const enriched = await buildVoiceBridgeUpdate(
    {
      update,
      telegram: {
        async getFileLink(fileId: string): Promise<string> {
          assert.equal(fileId, 'voice-file-id');
          return 'https://telegram.example/file.ogg';
        },
      },
    },
    async (url: string | URL | Request) => {
      assert.equal(String(url), 'https://telegram.example/file.ogg');
      return fakeResponse(Buffer.from('voice-bytes'), {
        'content-length': '11',
        'content-type': 'audio/ogg',
      });
    }
  );

  const message = enriched.message as any;
  assert.equal(message.spark_media_turn.schema, 'spark.media_turn.v1');
  assert.equal(message.spark_media_turn.media_kind, 'voice');
  assert.equal(message.spark_media.audio_base64, Buffer.from('voice-bytes').toString('base64'));
  assert.equal(message.spark_media.mime_type, 'audio/ogg');
  assert.equal(message.spark_media.filename, 'telegram-voice.ogg');
  assert.equal(message.spark_media.source, 'telegram_runner_download');
  assert.equal((update.message as any).spark_media, undefined);
  assert.equal((update.message as any).spark_media_turn, undefined);
  assert.doesNotMatch(JSON.stringify(enriched), /voice-file-id/);
});

test('downloads Telegram audio bytes as audio, not voice, media evidence', async () => {
  const update = {
    update_id: 12,
    message: {
      message_id: 22,
      audio: {
        file_id: 'audio-file-id',
        mime_type: 'audio/mpeg',
        duration: 7,
      },
    },
  };

  const enriched = await buildVoiceBridgeUpdate(
    {
      update,
      telegram: {
        async getFileLink(fileId: string): Promise<string> {
          assert.equal(fileId, 'audio-file-id');
          return 'https://telegram.example/file.mp3';
        },
      },
    },
    async (url: string | URL | Request) => {
      assert.equal(String(url), 'https://telegram.example/file.mp3');
      return fakeResponse(Buffer.from('audio-bytes'), {
        'content-length': '11',
        'content-type': 'audio/mpeg',
      });
    }
  );

  const message = enriched.message as any;
  assert.equal(message.spark_media_turn.schema, 'spark.media_turn.v1');
  assert.equal(message.spark_media_turn.media_kind, 'audio');
  assert.equal(message.spark_media.audio_base64, Buffer.from('audio-bytes').toString('base64'));
  assert.equal(message.spark_media.mime_type, 'audio/mpeg');
  assert.equal(message.spark_media.filename, 'telegram-audio.mp3');
  assert.equal(message.spark_media.source, 'telegram_runner_download');
  assert.equal((update.message as any).spark_media, undefined);
  assert.equal((update.message as any).spark_media_turn, undefined);
  assert.doesNotMatch(JSON.stringify(enriched), /audio-file-id/);
});

test('keeps the media envelope when Telegram download is unavailable', async () => {
  const update = {
    update_id: 11,
    message: {
      message_id: 21,
      voice: {
        file_id: 'voice-file-id',
      },
    },
  };

  const enriched = await buildVoiceBridgeUpdate(
    {
      update,
      telegram: {
        async getFileLink(): Promise<string> {
          throw new Error('temporary Telegram failure');
        },
      },
    },
    async () => {
      throw new Error('should not fetch');
    }
  );

  assert.notEqual(enriched, update);
  assert.equal((enriched.message as any).spark_media, undefined);
  assert.equal((enriched.message as any).spark_media_turn.schema, 'spark.media_turn.v1');
  assert.equal((enriched.message as any).spark_media_turn.media_kind, 'voice');
  assert.doesNotMatch(JSON.stringify(enriched), /voice-file-id/);
});

test('logs the configured voice size limit and remediation for oversized media', async () => {
  const previousLimit = process.env.SPARK_TELEGRAM_VOICE_DOWNLOAD_MAX_BYTES;
  const previousWarn = console.warn;
  const warnings: string[] = [];
  process.env.SPARK_TELEGRAM_VOICE_DOWNLOAD_MAX_BYTES = '1024';
  console.warn = (...args: unknown[]) => warnings.push(args.map(String).join(' '));
  try {
    const enriched = await buildVoiceBridgeUpdate(
      {
        update: {
          update_id: 13,
          message: { message_id: 23, voice: { file_id: 'oversized-file' } },
        },
        telegram: {
          async getFileLink(): Promise<string> {
            return 'https://telegram.example/large.ogg';
          },
        },
      },
      async () => fakeResponse(Buffer.alloc(0), { 'content-length': '2048' })
    );

    assert.equal((enriched.message as any).spark_media, undefined);
    assert.match(warnings.join('\n'), /2\.0 KiB; limit 1\.0 KiB/);
    assert.match(warnings.join('\n'), /SPARK_TELEGRAM_VOICE_DOWNLOAD_MAX_BYTES/);
    assert.doesNotMatch(warnings.join('\n'), /oversized-file/);
  } finally {
    console.warn = previousWarn;
    if (previousLimit === undefined) delete process.env.SPARK_TELEGRAM_VOICE_DOWNLOAD_MAX_BYTES;
    else process.env.SPARK_TELEGRAM_VOICE_DOWNLOAD_MAX_BYTES = previousLimit;
  }
});

test('stops a chunked voice download as soon as it exceeds the configured limit', async () => {
  const previousLimit = process.env.SPARK_TELEGRAM_VOICE_DOWNLOAD_MAX_BYTES;
  const previousWarn = console.warn;
  const warnings: string[] = [];
  let cancelled = false;
  process.env.SPARK_TELEGRAM_VOICE_DOWNLOAD_MAX_BYTES = '1024';
  console.warn = (...args: unknown[]) => warnings.push(args.map(String).join(' '));
  try {
    const response = new Response(new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new Uint8Array(800));
        controller.enqueue(new Uint8Array(800));
      },
      cancel() {
        cancelled = true;
      },
    }), { headers: { 'content-type': 'audio/ogg' } });
    const enriched = await buildVoiceBridgeUpdate(
      {
        update: {
          update_id: 14,
          message: { message_id: 24, voice: { file_id: 'chunked-oversized-file' } },
        },
        telegram: {
          async getFileLink(): Promise<string> {
            return 'https://telegram.example/chunked.ogg';
          },
        },
      },
      async () => response
    );

    assert.equal(cancelled, true);
    assert.equal((enriched.message as any).spark_media, undefined);
    assert.match(warnings.join('\n'), /limit 1\.0 KiB/);
    assert.doesNotMatch(warnings.join('\n'), /chunked-oversized-file/);
  } finally {
    console.warn = previousWarn;
    if (previousLimit === undefined) delete process.env.SPARK_TELEGRAM_VOICE_DOWNLOAD_MAX_BYTES;
    else process.env.SPARK_TELEGRAM_VOICE_DOWNLOAD_MAX_BYTES = previousLimit;
  }
});
