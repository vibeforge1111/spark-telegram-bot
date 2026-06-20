export const DEFAULT_TELEGRAM_POLLING_RETRY_MS = 15_000;

export function telegramStartupErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error || 'unknown error');
}

export function isRecoverableTelegramStartupError(error: unknown): boolean {
  const message = telegramStartupErrorMessage(error).toLowerCase();
  if (/\b(?:401|403|404)\b/.test(message)) return false;
  if (/unauthorized|forbidden|not found|bot_token|bot token|terminated by other getupdates request|conflict/.test(message)) {
    return false;
  }
  return /etimedout|econnreset|econnrefused|enotfound|eai_again|socket hang up|network|timeout|temporarily unavailable|bad gateway|service unavailable|gateway timeout/.test(message);
}

export function telegramPollingRetryDelayMs(env: NodeJS.ProcessEnv = process.env): number {
  const raw = Number(env.TELEGRAM_POLLING_RETRY_MS || env.TELEGRAM_STARTUP_RETRY_MS || '');
  if (!Number.isFinite(raw) || raw <= 0) return DEFAULT_TELEGRAM_POLLING_RETRY_MS;
  return Math.min(Math.max(Math.trunc(raw), 1_000), 120_000);
}
