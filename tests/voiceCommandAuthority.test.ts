import assert from 'node:assert/strict';
import test from 'node:test';

import { resolveVoiceCommandAuthoritySpec } from '../src/voiceCommandAuthority';

test('binds Voice self-test variants to the Voice-owned network tool', () => {
  for (const text of ['/voice self-test', '/voice self test', '/voice selftest']) {
    assert.deepEqual(resolveVoiceCommandAuthoritySpec(text), {
      toolName: 'voice.self_test.run',
      ownerSystem: 'spark-voice-comms',
      mutationClass: 'external_network',
      action: 'voice.self_test.run'
    });
  }
});

test('binds Voice diagnostics to the diagnostics tool without changing status authority', () => {
  for (const text of ['/voice doctor', '/voice diagnose']) {
    assert.deepEqual(resolveVoiceCommandAuthoritySpec(text), {
      toolName: 'voice.diagnostics.run',
      ownerSystem: 'spark-voice-comms',
      mutationClass: 'read_only',
      action: 'voice.diagnostics.run'
    });
  }

  assert.deepEqual(resolveVoiceCommandAuthoritySpec('/voice status'), {
    toolName: 'voice.status',
    ownerSystem: 'spark-voice-comms',
    mutationClass: 'read_only',
    action: 'voice.status'
  });
});

test('keeps setup and conversational fallbacks on their existing authority lanes', () => {
  assert.equal(resolveVoiceCommandAuthoritySpec('/voice onboard local').toolName, 'voice.onboard');
  assert.equal(resolveVoiceCommandAuthoritySpec('/voice find a warmer voice').toolName, 'voice.command');
});
