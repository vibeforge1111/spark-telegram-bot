import { runTelegramPollingHealth } from './healthPolling';
import { loadSparkTelegramProfileEnv } from './profileEnv';
import { telegramRelayIdentityFromEnv } from './relayIdentity';

export const DEFAULT_RELAY_HEALTH_TIMEOUT_MS = 8000;

export function relayHealthTimeoutMs(env: NodeJS.ProcessEnv = process.env): number {
  const configured = Number.parseInt(env.SPARK_TELEGRAM_RELAY_HEALTH_TIMEOUT_MS || '', 10);
  if (!Number.isFinite(configured) || configured <= 0) {
    return DEFAULT_RELAY_HEALTH_TIMEOUT_MS;
  }
  return Math.max(500, Math.min(30_000, configured));
}

export function relayHealthUrl(env: NodeJS.ProcessEnv = process.env): string {
  const { port, url } = telegramRelayIdentityFromEnv(env);
  if (url) {
    const healthUrl = new URL(url);
    const segments = healthUrl.pathname.split('/').filter(Boolean);
    if (segments.at(-1) === 'spawner-events') {
      segments[segments.length - 1] = 'health';
      healthUrl.pathname = `/${segments.join('/')}`;
    } else {
      healthUrl.pathname = '/health';
    }
    healthUrl.search = '';
    healthUrl.hash = '';
    return healthUrl.toString();
  }
  return `http://127.0.0.1:${port}/health`;
}

export async function validateRelayRuntime(
  fetchImpl: typeof fetch = fetch,
  env: NodeJS.ProcessEnv = process.env
): Promise<string> {
  const url = relayHealthUrl(env);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), relayHealthTimeoutMs(env));
  try {
    const relaySecret = env.TELEGRAM_RELAY_SECRET?.trim();
    const response = await fetchImpl(url, {
      signal: controller.signal,
      headers: relaySecret
        ? { 'x-spark-telegram-relay-secret': relaySecret }
        : undefined
    });
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    const payload = await response.json() as {
      relay?: { profile?: string; port?: number };
      pid?: number;
      runtime?: {
        telegramPolling?: string;
        pollingActive?: boolean;
        pollingLastErrorAt?: string | null;
        pollingLastError?: string | null;
        pollingStoppedAt?: string | null;
      };
    };
    const pollingState = payload.runtime?.telegramPolling;
    if (!pollingState) {
      throw new Error('Telegram polling status is missing');
    }
    if (pollingState !== 'active' && pollingState !== 'disabled' && pollingState !== 'disabled_smoke') {
      const lastError = payload.runtime?.pollingLastError ? `: ${payload.runtime.pollingLastError}` : '';
      const stoppedAt = payload.runtime?.pollingStoppedAt ? ` at ${payload.runtime.pollingStoppedAt}` : '';
      throw new Error(`Telegram polling is ${pollingState}${stoppedAt}${lastError}`);
    }
    const profile = payload.relay?.profile || telegramRelayIdentityFromEnv(env).profile;
    const port = payload.relay?.port || new URL(url).port;
    const polling = ` polling=${pollingState}`;
    return `${profile}@${port}${payload.pid ? ` pid=${payload.pid}` : ''}${polling}`;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Telegram relay runtime is not reachable at ${url}: ${message}`, { cause: error });
  } finally {
    clearTimeout(timeout);
  }
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const json = args.includes('--json');
  loadSparkTelegramProfileEnv(args, process.env, { preserveExisting: true });
  const missingProfileToken = process.env.SPARK_PROFILE_TOKEN_MISSING?.trim();
  if (missingProfileToken && !process.env.BOT_TOKEN?.trim()) {
    throw new Error(
      `Could not load ${missingProfileToken}. Run this from an approved Spark secret session, or set TEST_BOT_TOKEN for token health checks.`
    );
  }
  const polling = await runTelegramPollingHealth({ output: json ? 'silent' : 'text' });
  const detail = await validateRelayRuntime();
  console.log(json
    ? JSON.stringify({ status: 'ok', detail, telegram: polling })
    : `Relay runtime: OK (${detail})`);
}

if (require.main === module) {
  (async () => {
    try {
      await main();
    } catch (error) {
      console.error(`Telegram runtime health: FAILED - ${(error as Error).message}`);
      process.exit(1);
    }
  })();
}
