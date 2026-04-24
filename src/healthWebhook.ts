import 'dotenv/config';
import axios from 'axios';

type CheckResult = {
  ok: boolean;
  label: string;
  detail: string;
};

function gatewayMode(): string {
  return process.env.TELEGRAM_GATEWAY_MODE?.trim().toLowerCase() || 'auto';
}

function smokeMode(): boolean {
  return process.env.TELEGRAM_SMOKE_MODE === '1';
}

function relayPort(): number {
  const parsed = Number(process.env.TELEGRAM_RELAY_PORT || '8788');
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 8788;
}

function webhookConfig():
  | {
      url: string;
      path: string;
      port: number;
    }
  | null {
  const url = process.env.TELEGRAM_WEBHOOK_URL?.trim();
  if (!url) {
    return null;
  }

  const parsed = new URL(url);
  const port = Number(process.env.TELEGRAM_WEBHOOK_PORT || '8443');
  if (!Number.isFinite(port) || port <= 0) {
    throw new Error('TELEGRAM_WEBHOOK_PORT must be a positive integer');
  }

  return {
    url,
    path: parsed.pathname || '/',
    port
  };
}

async function probeUrl(label: string, url: string): Promise<CheckResult> {
  return probeUrlStatus(label, url, null);
}

async function probeUrlStatus(
  label: string,
  url: string,
  expectedStatus: number | null
): Promise<CheckResult> {
  try {
    const response = await axios.get(url, {
      timeout: 4000,
      validateStatus: () => true
    });
    const ok = expectedStatus === null ? true : response.status === expectedStatus;
    return {
      ok,
      label,
      detail:
        expectedStatus === null
          ? `${response.status} ${response.statusText || 'response'}`
          : `expected ${expectedStatus}, got ${response.status} ${response.statusText || 'response'}`
    };
  } catch (error) {
    const detail =
      error instanceof Error ? error.message : 'unreachable';
    return { ok: false, label, detail };
  }
}

async function main(): Promise<void> {
  const results: CheckResult[] = [];
  const mode = gatewayMode();
  const smoke = smokeMode();
  const token = process.env.BOT_TOKEN?.trim();
  const webhook = webhookConfig();

  if (!token && !smoke) {
    console.error('BOT_TOKEN is required');
    process.exit(1);
  }

  console.log(`Gateway mode: ${mode}`);
  console.log(`Webhook configured: ${webhook ? 'yes' : 'no'}`);
  console.log(`Smoke mode: ${smoke ? 'yes' : 'no'}`);

  if (smoke) {
    results.push({
      ok: true,
      label: 'Telegram webhook info',
      detail: 'skipped in TELEGRAM_SMOKE_MODE'
    });
  } else {
    const telegramInfo = await axios.get(`https://api.telegram.org/bot${token}/getWebhookInfo`, {
      timeout: 4000,
      validateStatus: () => true
    });

    if (telegramInfo.status !== 200 || !telegramInfo.data?.ok) {
      results.push({
        ok: false,
        label: 'Telegram webhook info',
        detail: `HTTP ${telegramInfo.status}`
      });
    } else {
      const info = telegramInfo.data.result as {
        url?: string;
        pending_update_count?: number;
        last_error_message?: string;
        last_error_date?: number;
      };
      const url = info.url || '(none)';
      const pending = Number(info.pending_update_count || 0);
      const errorSuffix = info.last_error_message
        ? `, last_error=${info.last_error_message}`
        : '';
      results.push({
        ok: true,
        label: 'Telegram webhook info',
        detail: `url=${url}, pending=${pending}${errorSuffix}`
      });

      if (webhook) {
        results.push({
          ok: info.url === webhook.url,
          label: 'Telegram webhook owner',
          detail: info.url === webhook.url ? webhook.url : `expected ${webhook.url}, got ${url}`
        });
      } else if (mode === 'polling') {
        results.push({
          ok: !info.url,
          label: 'Polling ownership check',
          detail: info.url ? `unexpected webhook ${info.url}` : 'no active webhook'
        });
      }
    }
  }

  if (webhook) {
    results.push(await probeUrl('Public webhook URL', webhook.url));
    results.push(
      await probeUrlStatus(
        'Local webhook health route',
        `http://127.0.0.1:${webhook.port}/healthz`,
        200
      )
    );
  }

  results.push(
    await probeUrl('Local relay listener', `http://127.0.0.1:${relayPort()}/spawner-events`)
  );

  let failed = false;
  for (const result of results) {
    const prefix = result.ok ? '[ok]' : '[fail]';
    console.log(`${prefix} ${result.label}: ${result.detail}`);
    if (!result.ok) {
      failed = true;
    }
  }

  if (failed) {
    console.error('Webhook health: FAIL');
    process.exit(1);
  }

  console.log('Webhook health: OK');
}

void main().catch((error) => {
  console.error('Webhook health: FAIL');
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
