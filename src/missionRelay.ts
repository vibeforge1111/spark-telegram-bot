import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import { existsSync } from 'node:fs';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { Telegraf } from 'telegraf';

type RelayEventType =
  | 'mission_created'
  | 'mission_started'
  | 'mission_paused'
  | 'mission_resumed'
  | 'mission_completed'
  | 'mission_failed'
  | 'task_started'
  | 'task_completed'
  | 'task_failed'
  | 'task_cancelled';

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

const REGISTRY_PATH = path.join(process.cwd(), '.spark-spawner-missions.json');
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
    const raw = await readFile(REGISTRY_PATH, 'utf-8');
    const entries = JSON.parse(raw) as MissionSubscription[];
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
    await writeFile(
      REGISTRY_PATH,
      JSON.stringify(Array.from(registry.values()), null, 2),
      'utf-8'
    );
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
    'mission_paused',
    'mission_resumed',
    'mission_completed',
    'mission_failed',
    'task_failed',
    'task_cancelled'
  ].includes(event.type);
}

function shouldSkipDuplicate(event: DeliverableRelayEvent): boolean {
  const signature = `${event.missionId}:${event.type}:${event.taskId || 'mission'}`;
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
      await bot.telegram.sendMessage(
        Number(subscription.chatId),
        formatRelayMessage(event, subscription, payload.summary)
      );
      writeJson(res, 200, { ok: true });
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
