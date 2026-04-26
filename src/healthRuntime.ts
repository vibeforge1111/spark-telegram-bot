import { runTelegramPollingHealth } from './healthPolling';

export function relayHealthUrl(env: NodeJS.ProcessEnv = process.env): string {
  const parsed = Number(env.TELEGRAM_RELAY_PORT || '8788');
  const port = Number.isFinite(parsed) && parsed > 0 ? Math.trunc(parsed) : 8788;
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
    const profile = payload.relay?.profile || env.SPARK_TELEGRAM_PROFILE || 'default';
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
