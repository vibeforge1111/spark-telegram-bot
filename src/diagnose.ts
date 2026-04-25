// /diagnose — one-shot health/trace for the full stack: bot, SIB gateway,
// codex-shim, spawner-ui, per-provider ping tests, chip state. Designed to be
// run from Telegram and fit in a single message.

import axios from 'axios';

const SPAWNER_UI_URL = process.env.SPAWNER_UI_URL || 'http://127.0.0.1:5173';
const CODEX_SHIM_URL = process.env.CODEX_SHIM_URL || 'http://127.0.0.1:8790';
const BOT_DEFAULT_PROVIDER = (process.env.BOT_DEFAULT_PROVIDER || 'codex').toLowerCase();

interface PingResult {
  providerId: string;
  ok: boolean;
  ms?: number;
  error?: string;
}

async function httpStatus(url: string, timeoutMs = 3000): Promise<{ ok: boolean; status?: number; err?: string }> {
  try {
    const res = await axios.get(url, { timeout: timeoutMs, validateStatus: () => true });
    return { ok: res.status < 500, status: res.status };
  } catch (err: any) {
    return { ok: false, err: err.code || err.message };
  }
}

async function pingProvider(providerId: string): Promise<PingResult> {
  const started = Date.now();
  try {
    const run = await axios.post(
      `${SPAWNER_UI_URL}/api/spark/run`,
      {
        goal: 'Reply with exactly: PING_OK',
        chatId: 'diag',
        userId: 'diag',
        requestId: `diag-${providerId}-${started}`,
        providers: [providerId],
        promptMode: 'simple'
      },
      { timeout: 10000 }
    );
    const missionId = run.data?.missionId;
    if (!missionId) return { providerId, ok: false, error: 'no missionId' };

    // poll results endpoint
    for (let i = 0; i < 25; i++) {
      await new Promise((r) => setTimeout(r, 2000));
      try {
        const res = await axios.get(`${SPAWNER_UI_URL}/api/mission-control/results`, {
          params: { missionId },
          timeout: 3000
        });
        const result = (res.data?.results || [])[0];
        if (result?.status === 'completed') {
          return { providerId, ok: true, ms: Date.now() - started };
        }
        if (result?.status === 'failed') {
          return { providerId, ok: false, ms: Date.now() - started, error: result.error?.slice(0, 120) || 'failed' };
        }
      } catch {
        // keep polling
      }
    }
    return { providerId, ok: false, error: 'timeout' };
  } catch (err: any) {
    return { providerId, ok: false, error: err.response?.data?.error || err.message };
  }
}

async function getSibChipState(): Promise<{ activeChips: string[]; pinnedChips: string[] } | null> {
  // Ask the SIB gateway via CLI-simulation endpoint — simplest reliable shape.
  // Shelling out to python would work too, but the attachments endpoint is
  // cheaper if available. We just probe via the ask-telegram result metadata.
  try {
    const res = await axios.post(
      'http://127.0.0.1:5173/api/spark/run',
      {
        goal: 'ping',
        chatId: 'diag',
        userId: 'diag',
        requestId: `diag-chips-${Date.now()}`,
        providers: ['codex'],
        promptMode: 'simple'
      },
      { timeout: 5000 }
    );
    // This dispatch path doesn't return chip state, so we return null.
    // Chip state comes from SIB doctor — left to future diagnose enrichment.
    return null;
  } catch {
    return null;
  }
}

export async function buildDiagnoseReport(adminId: number): Promise<string> {
  const started = Date.now();
  const lines: string[] = ['🩺 Diagnostic Report', ''];

  // --- Local services ---
  const [botRelay, shimHealth, spawnerProviders] = await Promise.all([
    httpStatus('http://127.0.0.1:8788/', 2000),
    httpStatus(`${CODEX_SHIM_URL}/health`, 2000),
    httpStatus(`${SPAWNER_UI_URL}/api/providers`, 3000)
  ]);

  lines.push('Services');
  lines.push(`• Bot mission relay (:8788): ${botRelay.ok ? '✅' : `❌ ${botRelay.err || botRelay.status}`}`);
  lines.push(`• Spawner UI (:5173): ${spawnerProviders.ok ? '✅' : `❌ ${spawnerProviders.err || spawnerProviders.status}`}`);
  lines.push(`• Codex shim (:8790): ${shimHealth.ok ? '✅' : `❌ ${shimHealth.err || shimHealth.status}`}`);
  lines.push('');

  // --- Providers configured on spawner ---
  let providerList: Array<{ id: string; label: string; model: string; envKeyConfigured: boolean; kind?: string; requiresApiKey?: boolean }> = [];
  if (spawnerProviders.ok) {
    try {
      const res = await axios.get(`${SPAWNER_UI_URL}/api/providers`, { timeout: 3000 });
      providerList = res.data?.providers || [];
    } catch {
      // ignore
    }
  }

  lines.push('Providers (Spawner)');
  for (const p of providerList) {
    // terminal_cli providers (claude, codex) use local CLI auth, not API keys.
    const ready = p.requiresApiKey === false ? true : p.envKeyConfigured;
    const kindNote = p.kind === 'terminal_cli' ? ' (local CLI)' : '';
    const icon = ready ? '✅' : '❌ key missing';
    lines.push(`• ${p.label} [${p.id}] ${p.model}${kindNote} ${icon}`);
  }
  lines.push('');

  // --- Routing ---
  lines.push('Routing');
  lines.push(`• Telegram /run default: ${BOT_DEFAULT_PROVIDER}`);
  lines.push(`• Telegram plain chat: SIB → Codex (via shim :8790)`);
  lines.push(`• Spawner missions default: ${process.env.DEFAULT_MISSION_PROVIDER || 'codex (in spawner-ui .env)'}`);
  lines.push(`• Overrides: "claude, ...", "minimax: ...", "glm, ...", "all models: ..."`);
  lines.push('');

  // --- Live pings per provider ---
  lines.push('Provider ping (PING_OK test)');
  const pings = await Promise.all([
    pingProvider('codex'),
    pingProvider('claude'),
    pingProvider('zai'),
    pingProvider('minimax')
  ]);
  for (const p of pings) {
    const icon = p.ok ? '✅' : '❌';
    const ms = p.ms ? `${(p.ms / 1000).toFixed(1)}s` : '';
    const err = p.error ? ` (${p.error})` : '';
    lines.push(`• ${p.providerId} ${icon} ${ms}${err}`);
  }
  lines.push('');

  // --- Mission board ---
  try {
    const res = await axios.get(`${SPAWNER_UI_URL}/api/mission-control/board`, { timeout: 3000 });
    const board = res.data?.board || {};
    const running = (board.running || []).length;
    const completed = (board.completed || []).length;
    const failed = (board.failed || []).length;
    lines.push(`Mission board: ${running} running / ${completed} completed / ${failed} failed`);
  } catch {
    lines.push('Mission board: ❌ unreachable');
  }

  lines.push('');
  lines.push(`Admin ID: ${adminId}`);
  lines.push(`Total diagnose time: ${((Date.now() - started) / 1000).toFixed(1)}s`);

  return lines.join('\n');
}
