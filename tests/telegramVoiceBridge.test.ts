import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildVoiceBridgeUpdate } from '../src/telegramVoiceBridge';

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
          return 'https://api.telegram.org/file/bot123/voice/file.ogg';
        },
      },
    },
    async (url: string | URL | Request) => {
      assert.equal(String(url), 'https://api.telegram.org/file/bot123/voice/file.ogg');
      return fakeResponse(Buffer.from('voice-bytes'), {
        'content-length': '11',
        'content-type': 'audio/ogg',
      });
    }
  );

  const message = enriched.message as any;
  assert.equal(message.spark_media.audio_base64, Buffer.from('voice-bytes').toString('base64'));
  assert.equal(message.spark_media.mime_type, 'audio/ogg');
  assert.equal(message.spark_media.filename, 'telegram-voice.ogg');
  assert.equal(message.spark_media.source, 'telegram_runner_download');
  assert.equal((update.message as any).spark_media, undefined);
});

test('leaves the update unchanged when Telegram download is unavailable', async () => {
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

  assert.equal(enriched, update);
});

test('falls back when voice byte limit env has a unit suffix', async () => {
  const originalLimit = process.env.SPARK_TELEGRAM_VOICE_DOWNLOAD_MAX_BYTES;
  process.env.SPARK_TELEGRAM_VOICE_DOWNLOAD_MAX_BYTES = '1kb';
  const update = {
    update_id: 12,
    message: {
      message_id: 22,
      voice: {
        file_id: 'voice-file-id',
        mime_type: 'audio/ogg',
      },
    },
  };

  try {
    const enriched = await buildVoiceBridgeUpdate(
      {
        update,
        telegram: {
          async getFileLink(): Promise<string> {
            return 'https://api.telegram.org/file/bot123/voice/file.ogg';
          },
        },
      },
      async () => fakeResponse(Buffer.from('voice-bytes'), {
        'content-length': '11',
        'content-type': 'audio/ogg',
      })
    );

    assert.equal((enriched.message as any).spark_media.size_bytes, 11);
  } finally {
    if (originalLimit === undefined) delete process.env.SPARK_TELEGRAM_VOICE_DOWNLOAD_MAX_BYTES;
    else process.env.SPARK_TELEGRAM_VOICE_DOWNLOAD_MAX_BYTES = originalLimit;
  }
});

test('rejects a file link whose host is not api.telegram.org without fetching', async () => {
  const update = {
    update_id: 13,
    message: {
      message_id: 23,
      voice: {
        file_id: 'voice-file-id',
        mime_type: 'audio/ogg',
      },
    },
  };

  let fetched = false;
  const enriched = await buildVoiceBridgeUpdate(
    {
      update,
      telegram: {
        async getFileLink(): Promise<string> {
          return 'https://evil.example/file.ogg';
        },
      },
    },
    async () => {
      fetched = true;
      return fakeResponse(Buffer.from('voice-bytes'), {
        'content-length': '11',
        'content-type': 'audio/ogg',
      });
    }
  );

  // The host check throws before fetch; buildVoiceBridgeUpdate swallows the
  // error and leaves the update unchanged.
  assert.equal(fetched, false);
  assert.equal((enriched.message as any).spark_media, undefined);
});
