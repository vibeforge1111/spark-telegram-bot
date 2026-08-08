import type { NaturalRouteOwnerSystem } from './naturalRouteDecision';
import type { SparkHarnessMutationClass } from './harnessContract';

export type VoiceCommandAuthoritySpec = {
  toolName: string;
  ownerSystem: NaturalRouteOwnerSystem;
  mutationClass: SparkHarnessMutationClass;
  action: string;
};

function voiceCommandMutatesRuntime(text: string): boolean {
  return /\b(?:onboard|onboarding|setup|set\s+up|install|configure|enable|disable|reset|prepare|connect|write|save)\b/i.test(text);
}

export function resolveVoiceCommandAuthoritySpec(text: string): VoiceCommandAuthoritySpec {
  if (/^\/voice\s+(?:speak|ask|answer)\b/i.test(text)) {
    return {
      toolName: 'voice.speak',
      ownerSystem: 'spark-voice-comms',
      mutationClass: 'external_network',
      action: 'voice.speak'
    };
  }
  if (/^\/voice\s+self(?:-|\s)?test\b/i.test(text)) {
    return {
      toolName: 'voice.self_test.run',
      ownerSystem: 'spark-voice-comms',
      mutationClass: 'external_network',
      action: 'voice.self_test.run'
    };
  }
  if (/^\/voice\s+(?:doctor|diagnose)\b/i.test(text)) {
    return {
      toolName: 'voice.diagnostics.run',
      ownerSystem: 'spark-voice-comms',
      mutationClass: 'read_only',
      action: 'voice.diagnostics.run'
    };
  }
  if (/^\/voice\s+(?:status|probe)\b/i.test(text) || /^\/voice\s*$/i.test(text)) {
    return {
      toolName: 'voice.status',
      ownerSystem: 'spark-voice-comms',
      mutationClass: 'read_only',
      action: 'voice.status'
    };
  }
  if (/^\/voice\s+install\b/i.test(text)) {
    return {
      toolName: 'voice.install',
      ownerSystem: 'spark-voice-comms',
      mutationClass: 'writes_files',
      action: 'voice.install'
    };
  }
  if (/^\/voice\s+(?:onboard|onboarding|setup|set\s+up|configure|enable|disable|reset|prepare|connect)\b/i.test(text)) {
    return {
      toolName: 'voice.onboard',
      ownerSystem: 'spark-voice-comms',
      mutationClass: 'writes_files',
      action: 'voice.onboard'
    };
  }
  return {
    toolName: 'voice.command',
    ownerSystem: 'spark-intelligence-builder',
    mutationClass: voiceCommandMutatesRuntime(text) ? 'writes_files' : 'read_only',
    action: voiceCommandMutatesRuntime(text) ? 'voice.configure' : 'voice.status_or_reply'
  };
}
