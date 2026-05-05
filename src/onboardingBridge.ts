import { appendFile, mkdir } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

export interface TelegramFirstMessageEvent {
  event: 'telegram_first_message';
  session: string;
  replied: true;
  ts: string;
  chat_id?: string;
  user_id?: string;
  profile?: string;
}

export function onboardingEventPath(env: NodeJS.ProcessEnv = process.env): string {
  return env.SPARK_ONBOARDING_EVENT_PATH || path.join(os.homedir(), '.spark', 'state', 'onboarding', 'telegram-first-message.jsonl');
}

export function extractStartSession(text: unknown): string | null {
  if (typeof text !== 'string') return null;
  const match = text.trim().match(/^\/start(?:@\w+)?\s+([A-Za-z0-9_-]{1,64})\b/);
  return match ? match[1] : null;
}

export async function recordTelegramFirstMessage(event: TelegramFirstMessageEvent, eventPath = onboardingEventPath()): Promise<void> {
  await mkdir(path.dirname(eventPath), { recursive: true });
  await appendFile(eventPath, `${JSON.stringify(event)}\n`, 'utf-8');
}

