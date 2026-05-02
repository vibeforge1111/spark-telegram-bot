import { runTelegramPollingHealth } from './healthPolling';
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
    const payload = await response.json() as { relay?: { profile?: string; port?: number }; pid?: number };
    const profile = payload.relay?.profile || telegramRelayIdentityFromEnv(env).profile;
    const port = payload.relay?.port || new URL(url).port;
    return `${profile}@${port}${payload.pid ? ` pid=${payload.pid}` : ''}`;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Telegram relay runtime is not reachable at ${url}: ${message}`);
  } finally {
    clearTimeout(timeout);
  }
}

async function main(): Promise<void> {
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
