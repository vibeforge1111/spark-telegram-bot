import 'dotenv/config';
import { config as loadEnv } from 'dotenv';
import path from 'node:path';
import { Telegraf } from 'telegraf';
import { buildSparkChatSystemPrompt } from './llm';
import { requireRelaySecret, resolveTelegramLaunchConfig } from './launchMode';

loadEnv({ path: path.join(__dirname, '..', '.env.override'), override: true, quiet: true });

function telegramErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    const cause = (error as Error & { cause?: unknown }).cause;
    if (cause instanceof Error && cause.message.trim()) {
      return `${error.message}: ${cause.message}`;
    }
    return error.message;
  }
  return String(error);
}

export function describeTelegramTokenError(error: unknown): string {
  const message = telegramErrorMessage(error);
  const lower = message.toLowerCase();
  if (message.includes('404') || lower.includes('not found')) {
    return 'Telegram rejected BOT_TOKEN. Create or rotate the token in BotFather, then run `spark setup --bot-token <token>` or `spark fix telegram`.';
  }
  if (message.includes('401') || lower.includes('unauthorized')) {
    return 'Telegram rejected BOT_TOKEN as unauthorized. Rotate it in BotFather, then update Spark with the new token.';
  }
  if (
    lower.includes('request to https://api.telegram.org/') ||
    lower.includes('fetch failed') ||
    lower.includes('network') ||
    lower.includes('timeout') ||
    lower.includes('econnreset') ||
    lower.includes('enotfound') ||
    lower.includes('etimedout') ||
    lower.includes('eai_again')
  ) {
    return 'Telegram token check could not reach Telegram API. Check network/proxy/DNS access, then retry `npm run health:polling`; do not rotate the bot token unless Telegram returns 401 or 404.';
  }
  return `Telegram token check failed: ${message}`;
}

async function validateTelegramToken(token: string): Promise<string> {
  if (process.env.TELEGRAM_HEALTH_SKIP_API === '1') {
    return 'skipped';
  }
  const bot = new Telegraf(token);
  try {
    const me = await bot.telegram.getMe();
    await bot.telegram.getWebhookInfo();
    return me.username ? `@${me.username}` : String(me.id);
  } catch (error) {
    throw new Error(describeTelegramTokenError(error));
  }
}

export async function runTelegramPollingHealth(): Promise<void> {
  const launch = resolveTelegramLaunchConfig();
  requireRelaySecret();

  const botToken = process.env.BOT_TOKEN?.trim();
  if (!botToken) {
    throw new Error('BOT_TOKEN is required for Telegram long polling.');
  }

  const primer = buildSparkChatSystemPrompt();
  for (const required of ['Builder', 'domain-chip-memory', 'Spark Researcher', 'Spawner UI', '/remember <text>', '/run <goal>']) {
    if (!primer.includes(required)) {
      throw new Error(`Spark self-knowledge primer is missing ${required}.`);
    }
  }

  const identity = await validateTelegramToken(botToken);
  console.log('Telegram health: OK');
  console.log(`Bot token: accepted${identity === 'skipped' ? ' (API check skipped)' : ` (${identity})`}`);
  console.log(`Ingress mode: ${launch.mode}`);
  console.log('Webhook ingress: disabled for this launch build');
  console.log('Relay auth: configured');
}

if (require.main === module) {
  (async () => {
    try {
      await runTelegramPollingHealth();
    } catch (error) {
      console.error(`Telegram health: FAILED - ${(error as Error).message}`);
      process.exit(1);
    }
  })();
}
