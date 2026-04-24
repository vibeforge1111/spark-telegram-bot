import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import { existsSync } from 'node:fs';
import type { Telegraf } from 'telegraf';
import { readJsonFile, resolveStatePath, writeJsonAtomic } from './jsonState';

type RelayEventType =
  | 'mission_created'
  | 'mission_started'
  | 'mission_paused'
  | 'mission_resumed'
  | 'mission_completed'
  | 'mission_failed'
  | 'task_started'
  | 'task_progress'
  | 'progress'
  | 'task_completed'
  | 'task_failed'
  | 'task_cancelled'
  | 'dispatch_started'
  | 'provider_feedback'
  | 'log';

interface MissionSubscription {
  missionId: string;
  chatId: string;
  userId: string;
  requestId: string;
  goal: string;
  createdAt: string;
  updateId?: number;
}

interface RelayWebhookPayload {
  type?: string;
  timestamp?: string;
  summary?: string;
  event?: {
    type?: RelayEventType;
    missionId?: string;
    taskId?: string;
    taskName?: string;
    message?: string;
    timestamp?: string;
    source?: string;
    data?: Record<string, unknown>;
  };
}

interface DeliverableRelayEvent {
  type: RelayEventType;
  missionId: string;
  taskId?: string;
  taskName?: string;
  message?: string;
  timestamp?: string;
  source?: string;
  data?: Record<string, unknown>;
}

const REGISTRY_PATH = resolveStatePath('.spark-spawner-missions.json');
const deliveryCache = new Map<string, number>();
const registry = new Map<string, MissionSubscription>();
let registryLoaded = false;
let relayServer: Server | null = null;

function getRelayPort(): number {
	const parsed = Number(process.env.TELEGRAM_RELAY_PORT || '8788');
	return Number.isFinite(parsed) && parsed > 0 ? parsed : 8788;
}

function getRelaySecret(): string | null {
	const value = process.env.TELEGRAM_RELAY_SECRET?.trim();
	return value ? value : null;
}

async function loadRegistry(): Promise<void> {
  if (registryLoaded) return;
  registryLoaded = true;

  if (!existsSync(REGISTRY_PATH)) return;

  try {
    const entries = await readJsonFile<MissionSubscription[]>(REGISTRY_PATH);
    if (!entries) {
      return;
    }
    for (const entry of entries) {
      if (entry?.missionId && entry.chatId) {
        registry.set(entry.missionId, entry);
      }
    }
  } catch (error) {
    console.warn('[MissionRelay] Failed to load registry:', error);
  }
}

async function refreshRegistry(): Promise<void> {
  registry.clear();
  registryLoaded = false;
  await loadRegistry();
}

async function persistRegistry(): Promise<void> {
  try {
    await writeJsonAtomic(REGISTRY_PATH, Array.from(registry.values()));
  } catch (error) {
    console.warn('[MissionRelay] Failed to persist registry:', error);
  }
}

export async function registerMissionRelay(input: MissionSubscription): Promise<void> {
  await loadRegistry();
  registry.set(input.missionId, input);
  await persistRegistry();
}

function shouldDeliverEvent(event: RelayWebhookPayload['event']): event is DeliverableRelayEvent {
  if (!event?.type || !event.missionId) return false;
  return [
    'mission_created',
    'mission_started',
    'dispatch_started',
    'task_started',
    'task_progress',
    'progress',
    'provider_feedback',
    'log',
    'task_completed',
    'task_failed',
    'task_cancelled',
    'mission_completed',
    'mission_failed'
  ].includes(event.type);
}

function stripThinkingAndMeta(text: string): string {
  let out = text;
  out = out.replace(/<think[\s\S]*?<\/think>/gi, '');
  out = out.replace(/<thinking[\s\S]*?<\/thinking>/gi, '');
  out = out.replace(/```(?:bash|shell|sh)?\s*curl\s+-X\s+POST[\s\S]*?\/api\/events[\s\S]*?```/gi, '');
  out = out.replace(/^\s*\*?\*?Mission ID:?\*?\*?\s*\S+\s*\n+/gim, '');
  out = out.replace(/\n{3,}/g, '\n\n');
  return out.trim();
}

const TELEGRAM_MESSAGE_LIMIT = 3800;

function chunkForTelegram(text: string, limit = TELEGRAM_MESSAGE_LIMIT): string[] {
  if (!text) return [];
  if (text.length <= limit) return [text];
  const chunks: string[] = [];
  let remaining = text;
  while (remaining.length > limit) {
    let cut = remaining.lastIndexOf('\n', limit);
    if (cut < limit * 0.5) cut = limit;
    chunks.push(remaining.slice(0, cut).trimEnd());
    remaining = remaining.slice(cut).trimStart();
  }
  if (remaining.length > 0) chunks.push(remaining);
  return chunks;
}

const PROVIDER_DISPLAY_NAMES: Record<string, string> = {
  minimax: 'MiniMax',
  zai: 'Z.AI GLM',
  'z.ai': 'Z.AI GLM',
  glm: 'Z.AI GLM',
  claude: 'Claude',
  codex: 'Codex'
};

function humanizeProviderLabel(label: string): string {
  const key = label.trim().toLowerCase();
  return PROVIDER_DISPLAY_NAMES[key] || label;
}

function providerLabelFrom(event: DeliverableRelayEvent): string {
  const data = event.data;
  if (data && typeof data === 'object') {
    if (typeof data.providerLabel === 'string' && data.providerLabel) return data.providerLabel;
    if (typeof data.provider === 'string' && data.provider) return data.provider;
    if (typeof data.originalSource === 'string' && data.originalSource) return data.originalSource;
  }
  return event.source || event.taskName || 'provider';
}

function extractProviderResponse(event: DeliverableRelayEvent): { providerLabel: string; response: string } | null {
  const data = event.data;
  if (!data || typeof data !== 'object') return null;
  const raw = typeof data.response === 'string' ? data.response : '';
  const response = stripThinkingAndMeta(raw);
  if (!response) return null;
  return { providerLabel: providerLabelFrom(event), response };
}

function extractProviderFailure(event: DeliverableRelayEvent): { providerLabel: string; error: string } {
  const data = event.data;
  const error = data && typeof data === 'object' && typeof data.error === 'string' && data.error.trim()
    ? data.error.trim()
    : event.message?.trim() || 'unknown error';
  return { providerLabel: providerLabelFrom(event), error };
}

function shouldSkipDuplicate(event: DeliverableRelayEvent): boolean {
  const providerKey = typeof event.data?.provider === 'string' && event.data.provider
    ? event.data.provider
    : event.source || 'none';
  const signature = `${event.missionId}:${event.type}:${event.taskId || 'mission'}:${providerKey}`;
  const now = Date.now();
  const previous = deliveryCache.get(signature);
  if (typeof previous === 'number' && now - previous < 30_000) {
    return true;
  }

  deliveryCache.set(signature, now);
  if (deliveryCache.size > 500) {
    const cutoff = now - 30_000;
    for (const [key, timestamp] of deliveryCache.entries()) {
      if (timestamp < cutoff) {
        deliveryCache.delete(key);
      }
    }
  }

  return false;
}

async function registerFromEventIfPresent(event: DeliverableRelayEvent): Promise<void> {
  if (registry.has(event.missionId)) return;
  const data = event.data;
  if (!data || typeof data !== 'object') return;

  const chatId = typeof data.chatId === 'string' && data.chatId.trim() ? data.chatId.trim() : null;
  if (!chatId) return;

  await registerMissionRelay({
    missionId: event.missionId,
    chatId,
    userId: typeof data.userId === 'string' && data.userId.trim() ? data.userId.trim() : 'telegram',
    requestId: typeof data.requestId === 'string' && data.requestId.trim() ? data.requestId.trim() : event.missionId,
    goal: typeof data.goal === 'string' && data.goal.trim() ? data.goal.trim() : event.message || event.missionId,
    createdAt: new Date().toISOString()
  });
}

function formatRelayMessage(
  event: DeliverableRelayEvent,
  subscription: MissionSubscription,
  summary?: string
): string {
  const taskLabel = event.taskName || event.taskId || 'task';
  const lines = [
    `Mission: ${event.missionId}`,
    `Request: ${subscription.requestId}`
  ];

  switch (event.type) {
    case 'mission_created':
      lines.unshift('Spawner mission created');
      break;
    case 'mission_started':
      lines.unshift('Spawner mission started');
      break;
    case 'mission_paused':
      lines.unshift('Spawner mission paused');
      break;
    case 'mission_resumed':
      lines.unshift('Spawner mission resumed');
      break;
    case 'dispatch_started':
      lines.unshift('Spawner dispatch started');
      break;
    case 'task_started':
      lines.unshift(`Task started: ${taskLabel}`);
      break;
    case 'task_progress':
    case 'progress':
      lines.unshift(`Progress: ${taskLabel}`);
      break;
    case 'provider_feedback':
      lines.unshift(`Provider update: ${taskLabel}`);
      break;
    case 'log':
      lines.unshift('Spawner update');
      break;
    case 'mission_completed':
      lines.unshift('Spawner mission completed');
      break;
    case 'mission_failed':
      lines.unshift('Spawner mission failed');
      break;
    case 'task_failed':
      lines.unshift(`Task failed: ${taskLabel}`);
      break;
    case 'task_cancelled':
      lines.unshift(`Task cancelled: ${taskLabel}`);
      break;
  }

  if (summary) {
    lines.push(summary);
  } else if (event.message) {
    lines.push(event.message);
  }

  if (event.type === 'mission_completed' || event.type === 'mission_failed') {
    const providers = event.data?.providers;
    if (providers && typeof providers === 'object') {
      const providerLines = Object.entries(providers)
        .map(([providerId, value]) => {
          if (value && typeof value === 'object' && 'status' in value) {
            return `${providerId}: ${String((value as { status?: unknown }).status || 'unknown')}`;
          }
          return `${providerId}: ${String(value)}`;
        });
      if (providerLines.length > 0) {
        lines.push('Providers:');
        lines.push(...providerLines);
      }
    }
  }

  lines.push(`Check: /mission status ${event.missionId}`);
  return lines.join('\n');
}

function readJsonBody(req: IncomingMessage): Promise<RelayWebhookPayload | null> {
  return new Promise((resolve) => {
    const chunks: Buffer[] = [];
    let size = 0;

    req.on('data', (chunk: Buffer) => {
      size += chunk.length;
      if (size > 64 * 1024) {
        resolve(null);
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });

    req.on('end', () => {
      try {
        const parsed = JSON.parse(Buffer.concat(chunks).toString('utf-8')) as RelayWebhookPayload;
        resolve(parsed);
      } catch {
        resolve(null);
      }
    });

    req.on('error', () => resolve(null));
  });
}

function writeJson(res: ServerResponse, statusCode: number, body: Record<string, unknown>): void {
  res.statusCode = statusCode;
  res.setHeader('Content-Type', 'application/json');
  res.end(JSON.stringify(body));
}

export async function startMissionRelay(bot: Telegraf): Promise<{ port: number }> {
  await loadRegistry();

  if (relayServer) {
    return { port: getRelayPort() };
  }

  const port = getRelayPort();

	relayServer = createServer(async (req, res) => {
		if (req.method !== 'POST' || req.url !== '/spawner-events') {
			writeJson(res, 404, { ok: false, error: 'not_found' });
			return;
		}

		const relaySecret = getRelaySecret();
		if (relaySecret) {
			const secretHeader = req.headers['x-spark-telegram-relay-secret'];
			if (secretHeader !== relaySecret) {
				writeJson(res, 401, { ok: false, error: 'invalid_relay_secret' });
				return;
			}
		}

		const payload = await readJsonBody(req);
    const event = payload?.event;
    if (!payload || !shouldDeliverEvent(event)) {
      writeJson(res, 400, { ok: false, error: 'invalid_event' });
      return;
    }

    await registerFromEventIfPresent(event);

    let subscription = registry.get(event.missionId);
    if (!subscription) {
      await refreshRegistry();
      subscription = registry.get(event.missionId);
    }
    if (!subscription) {
      writeJson(res, 202, { ok: true, ignored: 'unknown_mission' });
      return;
    }

    if (shouldSkipDuplicate(event)) {
      writeJson(res, 202, { ok: true, duplicate: true });
      return;
    }

    try {
      const chatId = Number(subscription.chatId);

      if (event.type === 'task_completed') {
        const extracted = extractProviderResponse(event);
        if (!extracted) {
          writeJson(res, 202, { ok: true, ignored: 'no_response_text' });
          return;
        }
        const header = `${humanizeProviderLabel(extracted.providerLabel)} says:`;
        const chunks = chunkForTelegram(`${header}\n\n${extracted.response}`);
        for (let i = 0; i < chunks.length; i++) {
          const prefix = chunks.length > 1 ? `(part ${i + 1} of ${chunks.length})\n` : '';
          await bot.telegram.sendMessage(chatId, `${prefix}${chunks[i]}`);
        }
        writeJson(res, 200, { ok: true, chunks: chunks.length });
        return;
      }

      if (event.type === 'task_failed' || event.type === 'task_cancelled') {
        const failure = extractProviderFailure(event);
        const label = humanizeProviderLabel(failure.providerLabel);
        await bot.telegram.sendMessage(
          chatId,
          `${label} couldn't finish this one — ${failure.error.slice(0, 500)}`
        );
        writeJson(res, 200, { ok: true });
        return;
      }

      writeJson(res, 202, { ok: true, ignored: 'event_type_not_delivered' });
    } catch (error) {
      console.error('[MissionRelay] Failed to deliver Telegram update:', error);
      writeJson(res, 500, { ok: false, error: 'delivery_failed' });
    }
  });

  await new Promise<void>((resolve, reject) => {
    relayServer!.once('error', reject);
    relayServer!.listen(port, '127.0.0.1', () => {
      relayServer!.off('error', reject);
      resolve();
    });
  });

  return { port };
}
