import assert from 'node:assert/strict';
import {
  attachTelegramMediaTurnEnvelope,
  buildTelegramMediaTurnEnvelope,
  renderUnsupportedTelegramMediaReply,
  telegramMediaTurnKind
} from '../src/telegramMediaEnvelope';

function test(name: string, fn: () => void): void {
  try {
    fn();
    console.log(`ok - ${name}`);
  } catch (error) {
    console.error(`not ok - ${name}`);
    throw error;
  }
}

test('builds typed envelopes for photo and captioned photo turns', () => {
  const photo = buildTelegramMediaTurnEnvelope({
    message_id: 20,
    photo: [{ file_id: 'private-photo-id' }]
  });
  const captioned = buildTelegramMediaTurnEnvelope({
    message_id: 21,
    caption: 'Describe this screenshot only.',
    photo: [{ file_id: 'private-photo-id' }]
  });

  assert.equal(photo.schema, 'spark.media_turn.v1');
  assert.equal(photo.media_kind, 'photo');
  assert.equal(photo.source.has_photo, true);
  assert.equal(photo.source.has_caption, false);
  assert.equal(photo.analysis_policy.can_read, true);
  assert.equal(photo.analysis_policy.can_store, false);
  assert.equal(photo.analysis_policy.can_execute, false);
  assert.equal(captioned.source.has_caption, true);
  assert.equal(captioned.authority.requires_turn_intent, true);
  assert.doesNotMatch(JSON.stringify(captioned), /Describe this screenshot only/);
  assert.doesNotMatch(JSON.stringify(captioned), /private-photo-id/);
});

test('builds document and unsupported envelopes without raw filenames', () => {
  const document = buildTelegramMediaTurnEnvelope({
    message_id: 22,
    document: {
      file_id: 'private-doc-id',
      file_name: 'private-plan.pdf',
      mime_type: 'application/pdf'
    }
  });
  const unsupported = buildTelegramMediaTurnEnvelope({ message_id: 23 });

  assert.equal(telegramMediaTurnKind({ document: { mime_type: 'application/pdf' } }), 'document');
  assert.equal(document.media_kind, 'document');
  assert.equal(document.source.mime_family, 'application');
  assert.equal(document.source.filename_present, true);
  assert.equal(document.analysis_policy.can_execute, false);
  assert.equal(unsupported.media_kind, 'unsupported');
  assert.equal(unsupported.analysis_policy.can_read, false);
  assert.doesNotMatch(JSON.stringify(document), /private-plan|private-doc-id/);
});

test('builds voice and audio envelopes as evidence-only media turns', () => {
  const voice = buildTelegramMediaTurnEnvelope({
    message_id: 24,
    voice: { file_id: 'private-voice-id', mime_type: 'audio/ogg' }
  });
  const audio = buildTelegramMediaTurnEnvelope({
    message_id: 25,
    audio: { file_id: 'private-audio-id', mime_type: 'audio/mpeg' }
  });

  assert.equal(voice.media_kind, 'voice');
  assert.equal(voice.source.has_voice, true);
  assert.equal(voice.source.mime_family, 'audio');
  assert.equal(audio.media_kind, 'audio');
  assert.equal(audio.source.has_audio, true);
  assert.equal(audio.authority.mutation_allowed, false);
  assert.doesNotMatch(JSON.stringify({ voice, audio }), /private-(voice|audio)-id/);
});

test('builds typed unsupported media envelopes without raw file identifiers', () => {
  const video = buildTelegramMediaTurnEnvelope({
    message_id: 26,
    video: { file_id: 'private-video-id', mime_type: 'video/mp4', file_name: 'secret-demo.mp4' }
  });
  const animation = buildTelegramMediaTurnEnvelope({
    message_id: 27,
    animation: { file_id: 'private-animation-id', mime_type: 'video/mp4' }
  });
  const sticker = buildTelegramMediaTurnEnvelope({
    message_id: 28,
    sticker: { file_id: 'private-sticker-id', emoji: 'x' }
  });
  const videoNote = buildTelegramMediaTurnEnvelope({
    message_id: 29,
    video_note: { file_id: 'private-video-note-id', duration: 4 }
  });

  assert.equal(telegramMediaTurnKind({ video: { mime_type: 'video/mp4' } }), 'video');
  assert.equal(telegramMediaTurnKind({ animation: { mime_type: 'video/mp4' } }), 'animation');
  assert.equal(telegramMediaTurnKind({ sticker: { emoji: 'x' } }), 'sticker');
  assert.equal(telegramMediaTurnKind({ video_note: { duration: 4 } }), 'video_note');
  assert.equal(video.media_kind, 'video');
  assert.equal(video.source.has_video, true);
  assert.equal(video.source.mime_family, 'video');
  assert.equal(video.analysis_policy.can_execute, false);
  assert.equal(animation.media_kind, 'animation');
  assert.equal(animation.source.has_animation, true);
  assert.equal(sticker.media_kind, 'sticker');
  assert.equal(sticker.source.has_sticker, true);
  assert.equal(videoNote.media_kind, 'video_note');
  assert.equal(videoNote.source.has_video_note, true);
  assert.doesNotMatch(JSON.stringify({ video, animation, sticker, videoNote }), /private-|secret-demo|emoji/);
});

test('attaches a media envelope to update and message without mutating the original update', () => {
  const update = {
    update_id: 10,
    message: {
      message_id: 20,
      caption: 'Use this as evidence only.',
      photo: [{ file_id: 'private-photo-id' }]
    }
  };
  const enriched = attachTelegramMediaTurnEnvelope(update);

  assert.equal((enriched as any).spark_media_turn.schema, 'spark.media_turn.v1');
  assert.equal((enriched.message as any).spark_media_turn.media_kind, 'photo');
  assert.equal((update.message as any).spark_media_turn, undefined);
});

test('unsupported media reply is human and does not sound like raw policy', () => {
  const reply = renderUnsupportedTelegramMediaReply();

  assert.match(reply, /I received that file/);
  assert.match(reply, /will not execute anything/);
  assert.doesNotMatch(reply, /tool_not_allowed_by_policy|owner_mismatch|route_not_selected/i);
});
