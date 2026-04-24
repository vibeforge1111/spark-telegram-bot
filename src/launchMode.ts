export type TelegramLaunchMode = 'polling';

export interface TelegramLaunchConfig {
  mode: TelegramLaunchMode;
}

const WEBHOOK_ENV_KEYS = [
  'TELEGRAM_WEBHOOK_URL',
  'TELEGRAM_WEBHOOK_SECRET',
  'TELEGRAM_WEBHOOK_PORT'
] as const;

export function resolveTelegramLaunchConfig(env: NodeJS.ProcessEnv = process.env): TelegramLaunchConfig {
  const rawMode = (env.TELEGRAM_GATEWAY_MODE || env.TELEGRAM_INGRESS_MODE || '').trim().toLowerCase();
  if (rawMode === 'webhook') {
    throw new Error('Webhook mode is disabled in this launch build. Use TELEGRAM_GATEWAY_MODE=polling.');
  }
  if (rawMode && rawMode !== 'polling' && rawMode !== 'long-polling' && rawMode !== 'auto') {
    throw new Error('TELEGRAM_GATEWAY_MODE must be polling for this launch build.');
  }

  const configuredWebhookKeys = WEBHOOK_ENV_KEYS.filter((key) => Boolean(env[key]?.trim()));
  if (configuredWebhookKeys.length > 0) {
    throw new Error(
      `Webhook env is disabled in this launch build. Remove ${configuredWebhookKeys.join(', ')} and use long polling.`
    );
  }

  return { mode: 'polling' };
}

export function requireRelaySecret(env: NodeJS.ProcessEnv = process.env): string {
  const value = env.TELEGRAM_RELAY_SECRET?.trim();
  if (!value) {
    throw new Error('TELEGRAM_RELAY_SECRET is required so the local Spawner relay cannot be posted to anonymously.');
  }
  if (value.length < 24 || value.length > 256) {
    throw new Error('TELEGRAM_RELAY_SECRET must be 24-256 characters.');
  }
  if (!/^[A-Za-z0-9_-]+$/.test(value)) {
    throw new Error('TELEGRAM_RELAY_SECRET may only contain A-Z, a-z, 0-9, _ and -.');
  }
  return value;
}
