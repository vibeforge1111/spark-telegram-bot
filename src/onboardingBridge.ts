import { appendFile, mkdir } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { redactIdentifier } from './redaction';

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
  const sparkHome = env.SPARK_HOME?.trim() || path.join(os.homedir(), '.spark');
  return env.SPARK_ONBOARDING_EVENT_PATH || path.join(sparkHome, 'state', 'onboarding', 'telegram-first-message.jsonl');
}

export function extractStartSession(text: unknown): string | null {
  if (typeof text !== 'string') return null;
  const match = text.trim().match(/^\/start(?:@\w+)?\s+([A-Za-z0-9_-]{1,64})\b/);
  return match ? match[1] : null;
}

export async function recordTelegramFirstMessage(event: TelegramFirstMessageEvent, eventPath = onboardingEventPath()): Promise<void> {
  const { chat_id: chatId, user_id: userId, ...rest } = event;
  const record = {
    ...rest,
    chat_id_present: String(chatId ?? '').trim().length > 0,
    user_id_present: String(userId ?? '').trim().length > 0,
    chat_ref: redactIdentifier(chatId, 'chat'),
    user_ref: redactIdentifier(userId, 'user')
  };
  await mkdir(path.dirname(eventPath), { recursive: true });
  await appendFile(eventPath, `${JSON.stringify(record)}\n`, 'utf-8');
}
