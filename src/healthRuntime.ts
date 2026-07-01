import { runTelegramPollingHealth } from './healthPolling';
import { loadSparkTelegramProfileEnv } from './profileEnv';
import { telegramRelayIdentityFromEnv } from './relayIdentity';

export function relayHealthUrl(env: NodeJS.ProcessEnv = process.env): string {
  const { port, url } = telegramRelayIdentityFromEnv(env);
  if (url) {
    const healthUrl = new URL(url);
    healthUrl.pathname = '/health';
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
  const timeout = setTimeout(() => controller.abort(), 2500);
  try {
    const response = await fetchImpl(url, { signal: controller.signal });
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
    throw new Error(`Telegram relay runtime is not reachable at ${url}: ${message}`);
  } finally {
    clearTimeout(timeout);
  }
}

async function main(): Promise<void> {
  loadSparkTelegramProfileEnv(process.argv.slice(2), process.env, { preserveExisting: true });
  const missingProfileToken = process.env.SPARK_PROFILE_TOKEN_MISSING?.trim();
  if (missingProfileToken && !process.env.BOT_TOKEN?.trim()) {
    throw new Error(
      `Could not load ${missingProfileToken}. Run this from an approved Spark secret session, or set TEST_BOT_TOKEN for token health checks.`
    );
  }
  await runTelegramPollingHealth();
  const detail = await validateRelayRuntime();
  console.log(`Relay runtime: OK (${detail})`);
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
