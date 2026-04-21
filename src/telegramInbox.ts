import { existsSync } from 'node:fs';
import path from 'node:path';
import type { Telegraf } from 'telegraf';
import { readJsonFile, writeJsonAtomic } from './jsonState';

interface QueuedTelegramUpdate {
  updateId: number | null;
  receivedAt: string;
  payload: Record<string, unknown>;
}

const INBOX_PATH = path.join(process.cwd(), '.spark-telegram-inbox.json');

let queueLoaded = false;
let queue: QueuedTelegramUpdate[] = [];
let processorStarted = false;
let processorScheduled = false;
let processorActive = false;
let boundBot: Telegraf | null = null;

async function loadQueue(): Promise<void> {
  if (queueLoaded) {
    return;
  }

  queueLoaded = true;
  if (!existsSync(INBOX_PATH)) {
    queue = [];
    return;
  }

  try {
    const parsed = await readJsonFile<QueuedTelegramUpdate[]>(INBOX_PATH);
    queue = Array.isArray(parsed) ? parsed : [];
  } catch (error) {
    console.warn('[TelegramInbox] Failed to load inbox:', error);
    queue = [];
  }
}

async function persistQueue(): Promise<void> {
  await writeJsonAtomic(INBOX_PATH, queue);
}

function scheduleProcessor(delayMs = 0): void {
  if (!processorStarted || processorScheduled) {
    return;
  }

  processorScheduled = true;
  setTimeout(() => {
    processorScheduled = false;
    void processQueue();
  }, delayMs);
}

async function processQueue(): Promise<void> {
  if (processorActive || !boundBot) {
    return;
  }

  processorActive = true;

  try {
    await loadQueue();

    while (queue.length > 0 && boundBot) {
      const next = queue[0];
      try {
        await boundBot.handleUpdate(next.payload as any);
        queue.shift();
        await persistQueue();
      } catch (error) {
        console.error('[TelegramInbox] Failed to process queued update:', error);
        scheduleProcessor(1_000);
        break;
      }
    }
  } finally {
    processorActive = false;
  }
}

export async function enqueueTelegramUpdate(payload: Record<string, unknown>): Promise<void> {
  await loadQueue();
  queue.push({
    updateId: typeof payload.update_id === 'number' ? payload.update_id : null,
    receivedAt: new Date().toISOString(),
    payload
  });
  await persistQueue();
  scheduleProcessor();
}

export async function startTelegramInboxProcessor(bot: Telegraf): Promise<void> {
  boundBot = bot;
  processorStarted = true;
  await loadQueue();
  scheduleProcessor();
}
