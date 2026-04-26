export interface TelegramRelayIdentity {
  port: number;
  profile: string;
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

export function telegramRelayIdentityFromEnv(env: NodeJS.ProcessEnv = process.env): TelegramRelayIdentity {
  return {
    port: normalizeTelegramRelayPort(env.TELEGRAM_RELAY_PORT),
    profile: normalizeTelegramRelayProfile(env.SPARK_TELEGRAM_PROFILE)
  };
}
