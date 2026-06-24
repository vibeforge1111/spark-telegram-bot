import assert from 'node:assert/strict';
import { authorizeTelegramMediaAction, mediaIngestStopBoundary } from '../src/telegramMediaAuthority';

function test(name: string, fn: () => void): void {
  try {
    fn();
    console.log(`ok - ${name}`);
  } catch (error) {
    console.error(`not ok - ${name}`);
    throw error;
  }
}

function mediaAuth(input: {
  route: 'media.image' | 'media.voice' | 'media.audio';
  text: string;
  toolName: 'telegram.media.image' | 'telegram.media.voice' | 'telegram.media.audio';
  action: string;
}) {
  return authorizeTelegramMediaAction({
    ...input,
    ownerSystem: 'spark-intelligence-builder',
    mutationClass: 'read_only',
    externalNetwork: true,
    userRef: 'user:qa',
    chatRef: 'chat:qa',
    accessProfile: 'admin'
  });
}

test('media ingest allows read-only image, voice, and audio analysis without action authority leakage', () => {
  const image = mediaAuth({
    route: 'media.image',
    text: '[image] Read this startup dashboard screenshot and tell me what looks wrong.',
    toolName: 'telegram.media.image',
    action: 'media.image.analyze'
  });
  const voice = mediaAuth({
    route: 'media.voice',
    text: '[voice] transcribe this note and answer the startup question',
    toolName: 'telegram.media.voice',
    action: 'media.voice.transcribe'
  });
  const audio = mediaAuth({
    route: 'media.audio',
    text: '[audio] transcribe this audio file and answer the startup question',
    toolName: 'telegram.media.audio',
    action: 'media.audio.transcribe'
  });

  assert.equal(image.allow, true);
  assert.equal(voice.allow, true);
  assert.equal(audio.allow, true);
  assert.equal(image.governorDecision?.outcome, 'read_only');
  assert.equal(voice.governorDecision?.outcome, 'read_only');
  assert.equal(audio.governorDecision?.outcome, 'read_only');
  assert.equal(image.harnessCore?.authorization.restrictions.write_allowed, false);
  assert.equal(voice.harnessCore?.authorization.restrictions.write_allowed, false);
  assert.equal(audio.harnessCore?.authorization.restrictions.write_allowed, false);
  assert.equal(image.harnessCore?.authorization.restrictions.network_allowed, true);
  assert.equal(voice.harnessCore?.authorization.restrictions.network_allowed, true);
  assert.equal(audio.harnessCore?.authorization.restrictions.network_allowed, true);
});

test('media ingest stop wording blocks the bridge before Builder receives media', () => {
  const image = mediaAuth({
    route: 'media.image',
    text: '[image] do not analyze this screenshot',
    toolName: 'telegram.media.image',
    action: 'media.image.analyze'
  });
  const voice = mediaAuth({
    route: 'media.voice',
    text: '[voice] no transcription right now',
    toolName: 'telegram.media.voice',
    action: 'media.voice.transcribe'
  });
  const audio = mediaAuth({
    route: 'media.audio',
    text: '[audio] no transcription right now',
    toolName: 'telegram.media.audio',
    action: 'media.audio.transcribe'
  });

  assert.equal(mediaIngestStopBoundary('[image] do not inspect this'), true);
  assert.equal(image.allow, false);
  assert.equal(voice.allow, false);
  assert.equal(audio.allow, false);
  assert.ok(image.reasonCodes.includes('tool_denied_by_policy'));
  assert.ok(voice.reasonCodes.includes('tool_denied_by_policy'));
  assert.ok(audio.reasonCodes.includes('tool_denied_by_policy'));
});
