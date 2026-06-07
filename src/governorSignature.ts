import { createHmac, randomUUID } from 'node:crypto';
import type { GovernorDecisionV1 } from './harnessCoreVNext';

const SIGNATURE_SCHEMA_VERSION = 'governor-decision-signature-v1';
const SIGNATURE_ALGORITHM = 'hmac-sha256';

export interface GovernorDecisionSignatureV1 {
  schema_version: typeof SIGNATURE_SCHEMA_VERSION;
  alg: typeof SIGNATURE_ALGORITHM;
  key_id: string;
  nonce: string;
  created_at: string;
  signature: string;
}

export type SignedGovernorDecisionV1<T extends GovernorDecisionV1 = GovernorDecisionV1> = T & {
  signature: GovernorDecisionSignatureV1;
};

interface SignGovernorDecisionInput {
  key: string;
  key_id?: string;
  nonce?: string;
  created_at?: string;
}

function envValue(env: NodeJS.ProcessEnv, name: string): string {
  return (env[name] || '').trim();
}

export function governorHmacKey(env: NodeJS.ProcessEnv = process.env): string {
  return envValue(env, 'SPARK_GOVERNOR_HMAC_KEY');
}

export function governorHmacKeyId(env: NodeJS.ProcessEnv = process.env): string {
  return envValue(env, 'SPARK_GOVERNOR_HMAC_KEY_ID') || 'local';
}

function canonicalHarnessCoreJson(value: unknown): string {
  if (value === undefined) return 'null';
  if (value === null || typeof value !== 'object') return JSON.stringify(value) ?? 'null';
  if (Array.isArray(value)) {
    return `[${value.map((item) => canonicalHarnessCoreJson(item)).join(',')}]`;
  }
  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, entryValue]) => entryValue !== undefined)
    .sort(([left], [right]) => left.localeCompare(right));
  return `{${entries
    .map(([key, entryValue]) => `${JSON.stringify(key)}:${canonicalHarnessCoreJson(entryValue)}`)
    .join(',')}}`;
}

function unsignedGovernorDecision(decision: Record<string, unknown>): Record<string, unknown> {
  const { signature: _signature, ...unsigned } = decision;
  return unsigned;
}

export function governorDecisionSignaturePayload(
  decision: Record<string, unknown>,
  signature: Omit<GovernorDecisionSignatureV1, 'signature'>
): string {
  return canonicalHarnessCoreJson({
    decision: unsignedGovernorDecision(decision),
    signature
  });
}

function hmacSha256Hex(payload: string, key: string): string {
  return createHmac('sha256', key).update(payload, 'utf8').digest('hex');
}

export function signGovernorDecision<T extends GovernorDecisionV1>(
  decision: T,
  input: SignGovernorDecisionInput
): SignedGovernorDecisionV1<T> {
  const key = input.key.trim();
  if (!key) throw new Error('key is required');
  const signature: Omit<GovernorDecisionSignatureV1, 'signature'> = {
    schema_version: SIGNATURE_SCHEMA_VERSION,
    alg: SIGNATURE_ALGORITHM,
    key_id: input.key_id?.trim() || 'local',
    nonce: input.nonce || randomUUID(),
    created_at: input.created_at || new Date().toISOString()
  };
  return {
    ...decision,
    signature: {
      ...signature,
      signature: hmacSha256Hex(governorDecisionSignaturePayload(decision as unknown as Record<string, unknown>, signature), key)
    }
  };
}

export function signGovernorDecisionIfConfigured<T extends GovernorDecisionV1>(
  decision: T,
  env: NodeJS.ProcessEnv = process.env
): T | SignedGovernorDecisionV1<T> {
  const key = governorHmacKey(env);
  if (!key) return decision;
  return signGovernorDecision(decision, {
    key,
    key_id: governorHmacKeyId(env)
  });
}
