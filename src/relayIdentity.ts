export interface TelegramRelayIdentity {
  port: number;
  profile: string;
  url?: string;
}

export const DEFAULT_TELEGRAM_RELAY_PORT = 8788;
export const PRIMARY_TELEGRAM_RELAY_PROFILE = 'primary';

export function normalizeTelegramRelayPort(value: unknown): number {
  const parsed = Number(value || DEFAULT_TELEGRAM_RELAY_PORT);
  return Number.isFinite(parsed) && parsed > 0 ? Math.trunc(parsed) : DEFAULT_TELEGRAM_RELAY_PORT;
}

export function normalizeTelegramRelayProfile(value: unknown): string {
  return typeof value === 'string' && value.trim() ? value.trim() : PRIMARY_TELEGRAM_RELAY_PROFILE;
}

export function normalizeTelegramRelayUrl(value: unknown): string | undefined {
  if (typeof value !== 'string' || !value.trim()) {
    return undefined;
  }
  try {
    const parsed = new URL(value.trim());
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return undefined;
    }
    if (!parsed.pathname || parsed.pathname === '/') {
      parsed.pathname = '/spawner-events';
    }
    parsed.hash = '';
    return parsed.toString();
  } catch {
    return undefined;
  }
}

export function telegramRelayIdentityFromEnv(env: NodeJS.ProcessEnv = process.env): TelegramRelayIdentity {
  const identity: TelegramRelayIdentity = {
    port: normalizeTelegramRelayPort(env.TELEGRAM_RELAY_PORT),
    profile: normalizeTelegramRelayProfile(env.SPARK_TELEGRAM_PROFILE)
  };
  const url = normalizeTelegramRelayUrl(env.TELEGRAM_RELAY_URL || env.SPARK_TELEGRAM_RELAY_URL);
  if (url) {
    identity.url = url;
  }
  return identity;
}
