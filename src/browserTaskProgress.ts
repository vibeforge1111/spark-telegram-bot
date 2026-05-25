import { readJsonFile, resolveStatePath, writeJsonAtomic } from './jsonState';

type BrowserTaskStartEntry = {
  startedAt: string;
  expiresAtMs: number;
};

type BrowserTaskProgressState = {
  startedByMessage: Record<string, BrowserTaskStartEntry>;
};

const BROWSER_TASK_PROGRESS_PATH = resolveStatePath('.spark-browser-task-progress.json');
const BROWSER_TASK_START_TTL_MS = 6 * 60 * 60 * 1000;

function browserTaskMessageKey(ctx: any): string | null {
  const chatId = ctx?.chat?.id ?? ctx?.message?.chat?.id;
  const userId = ctx?.from?.id ?? ctx?.message?.from?.id;
  const messageId = ctx?.message?.message_id;
  const updateId = ctx?.update?.update_id;
  if (chatId == null || userId == null) {
    return null;
  }
  const turnId = messageId != null
    ? `message:${String(messageId)}`
    : updateId != null
      ? `update:${String(updateId)}`
      : null;
  if (!turnId) {
    return null;
  }
  return `${String(chatId)}:${String(userId)}:${turnId}`;
}

function pruneBrowserTaskProgress(state: BrowserTaskProgressState, nowMs: number): BrowserTaskProgressState {
  const startedByMessage: Record<string, BrowserTaskStartEntry> = {};
  for (const [key, entry] of Object.entries(state.startedByMessage || {})) {
    if (entry && typeof entry.expiresAtMs === 'number' && entry.expiresAtMs > nowMs) {
      startedByMessage[key] = entry;
    }
  }
  return { startedByMessage };
}

export async function shouldSendBrowserTaskStartNotice(ctx: any, nowMs = Date.now()): Promise<boolean> {
  const key = browserTaskMessageKey(ctx);
  if (!key) {
    return true;
  }

  const current = await readJsonFile<BrowserTaskProgressState>(BROWSER_TASK_PROGRESS_PATH)
    || { startedByMessage: {} };
  const next = pruneBrowserTaskProgress(current, nowMs);
  if (next.startedByMessage[key]) {
    if (Object.keys(next.startedByMessage).length !== Object.keys(current.startedByMessage || {}).length) {
      await writeJsonAtomic(BROWSER_TASK_PROGRESS_PATH, next).catch(() => {});
    }
    return false;
  }

  next.startedByMessage[key] = {
    startedAt: new Date(nowMs).toISOString(),
    expiresAtMs: nowMs + BROWSER_TASK_START_TTL_MS
  };
  await writeJsonAtomic(BROWSER_TASK_PROGRESS_PATH, next).catch(() => {});
  return true;
}
