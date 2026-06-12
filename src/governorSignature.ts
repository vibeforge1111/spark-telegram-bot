import {
  harnessCoreGovernorDecisionSignaturePayload as governorDecisionSignaturePayload,
  signHarnessCoreGovernorDecision,
  type GovernorDecisionSignatureV1,
  type GovernorDecisionV1
} from '@spark/harness-core';

export { governorDecisionSignaturePayload, type GovernorDecisionSignatureV1 };

function envValue(env: NodeJS.ProcessEnv, name: string): string {
  return (env[name] || '').trim();
}

export function governorHmacKey(env: NodeJS.ProcessEnv = process.env): string {
  return envValue(env, 'SPARK_GOVERNOR_HMAC_KEY');
}

export function governorHmacKeyId(env: NodeJS.ProcessEnv = process.env): string {
  return envValue(env, 'SPARK_GOVERNOR_HMAC_KEY_ID') || 'local';
}

export function signGovernorDecisionIfConfigured<T extends GovernorDecisionV1>(
  decision: T,
  env: NodeJS.ProcessEnv = process.env
): T | (T & { signature: GovernorDecisionSignatureV1 }) {
  const key = governorHmacKey(env);
  if (!key) return decision;
  return signHarnessCoreGovernorDecision(decision, {
    key,
    key_id: governorHmacKeyId(env)
  });
}
