import {
  harnessCoreGovernorDecisionSignaturePayload as governorDecisionSignaturePayload,
  signHarnessCoreGovernorDecision,
  type GovernorDecisionSignatureV1,
  type GovernorDecisionV1
} from '@spark/harness-core';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

export { governorDecisionSignaturePayload, type GovernorDecisionSignatureV1 };

function envValue(env: NodeJS.ProcessEnv, name: string): string {
  return (env[name] || '').trim();
}

function readEnvFileValue(file: string, name: string): string {
  try {
    if (!fs.existsSync(file)) return '';
    for (const line of fs.readFileSync(file, 'utf-8').split(/\r?\n/)) {
      const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
      if (!match || match[1] !== name) continue;
      let value = match[2].trim();
      if (value.length >= 2 && value[0] === value[value.length - 1] && (value[0] === '"' || value[0] === "'")) {
        value = value.slice(1, -1);
      }
      return value.trim();
    }
  } catch {
    return '';
  }
  return '';
}

function sparkGovernorEnvFileValue(env: NodeJS.ProcessEnv, name: string): string {
  const explicitFile = env.SPARK_GOVERNOR_ENV_FILE?.trim();
  if (explicitFile) {
    const value = readEnvFileValue(path.resolve(explicitFile), name);
    if (value) return value;
  }

  const sparkHome = env.SPARK_HOME?.trim();
  if (!sparkHome && env !== process.env) return '';
  return readEnvFileValue(path.join(sparkHome || path.join(os.homedir(), '.spark'), '.env'), name);
}

export function governorHmacKey(env: NodeJS.ProcessEnv = process.env): string {
  return envValue(env, 'SPARK_GOVERNOR_HMAC_KEY') || sparkGovernorEnvFileValue(env, 'SPARK_GOVERNOR_HMAC_KEY');
}

export function governorHmacKeyId(env: NodeJS.ProcessEnv = process.env): string {
  return envValue(env, 'SPARK_GOVERNOR_HMAC_KEY_ID') || sparkGovernorEnvFileValue(env, 'SPARK_GOVERNOR_HMAC_KEY_ID') || 'local';
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
