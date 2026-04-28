// Telegram admin check + short-session context adapters.
// Long-term memory lives in Spark Intelligence Builder (SIB). This module keeps
// a small in-process context buffer so plain chat can stay coherent immediately
// after the user says "remember that..." while durable memory catches up.
import { readJsonFile, resolveStatePath, writeJsonAtomic } from './jsonState';

export function parseTelegramUserIds(raw: string | undefined): number[] {
  return (raw || '')
    .split(',')
    .map((id) => id.trim())
    .filter((id) => /^[1-9]\d*$/.test(id))
    .map((id) => Number(id))
    .filter((id) => Number.isSafeInteger(id) && id > 0);
}

const ADMIN_IDS: number[] = parseTelegramUserIds(process.env.ADMIN_TELEGRAM_IDS);

const ALLOWED_IDS: number[] = (
  parseTelegramUserIds(process.env.ALLOWED_TELEGRAM_IDS || process.env.TELEGRAM_ALLOWED_USER_IDS)
);

const PUBLIC_CHAT_ENABLED = process.env.TELEGRAM_PUBLIC_CHAT_ENABLED === '1';

interface TelegramUser {
  id: number;
  username?: string;
  first_name?: string;
}

interface ConversationSnapshot {
  recentByUser?: Record<string, string[]>;
  notesByUser?: Record<string, string[]>;
  interruptedByUser?: Record<string, PendingTaskRecovery>;
}

export interface PendingTaskRecovery {
  message: string;
  failure: string;
  stage?: string;
  recordedAt: string;
}

export interface Memory {
  memory_id: string;
  content: string;
  temporal_level: number;
  salience: number;
  content_type?: string;
  created_at?: string;
}

export class ConversationMemory {
  private readonly recentByUser = new Map<number, string[]>();
  private readonly notesByUser = new Map<number, string[]>();
  private readonly interruptedByUser = new Map<number, PendingTaskRecovery>();
  private readonly maxRecent = 8;
  private readonly maxNotes = 12;
  private loaded = false;
  private readonly statePath = resolveStatePath('.spark-conversation-memory.json');

  isAdmin(user: TelegramUser): boolean {
    return ADMIN_IDS.includes(user.id);
  }

  isAllowed(user: TelegramUser): boolean {
    return PUBLIC_CHAT_ENABLED || this.isAdmin(user) || ALLOWED_IDS.includes(user.id);
  }

  hasAnyOperatorConfigured(): boolean {
    return ADMIN_IDS.length > 0 || ALLOWED_IDS.length > 0 || PUBLIC_CHAT_ENABLED;
  }

  private userKey(user: TelegramUser): number {
    return user.id;
  }

  private async ensureLoaded(): Promise<void> {
    if (this.loaded) return;
    const snapshot = await readJsonFile<ConversationSnapshot>(this.statePath);
    if (snapshot?.recentByUser) {
      for (const [key, value] of Object.entries(snapshot.recentByUser)) {
        const userId = Number(key);
        if (Number.isSafeInteger(userId) && userId > 0 && Array.isArray(value)) {
          this.recentByUser.set(userId, value.filter((item) => typeof item === 'string').slice(-this.maxRecent));
        }
      }
    }
    if (snapshot?.notesByUser) {
      for (const [key, value] of Object.entries(snapshot.notesByUser)) {
        const userId = Number(key);
        if (Number.isSafeInteger(userId) && userId > 0 && Array.isArray(value)) {
          this.notesByUser.set(userId, value.filter((item) => typeof item === 'string').slice(-this.maxNotes));
        }
      }
    }
    if (snapshot?.interruptedByUser) {
      for (const [key, value] of Object.entries(snapshot.interruptedByUser)) {
        const userId = Number(key);
        if (
          Number.isSafeInteger(userId) &&
          userId > 0 &&
          value &&
          typeof value.message === 'string' &&
          typeof value.failure === 'string' &&
          typeof value.recordedAt === 'string'
        ) {
          this.interruptedByUser.set(userId, {
            message: value.message,
            failure: value.failure,
            stage: typeof value.stage === 'string' ? value.stage : undefined,
            recordedAt: value.recordedAt
          });
        }
      }
    }
    this.loaded = true;
  }

  private recordFromMap(map: Map<number, string[]>): Record<string, string[]> {
    const record: Record<string, string[]> = {};
    for (const [key, value] of map.entries()) {
      record[String(key)] = value;
    }
    return record;
  }

  private async persist(): Promise<void> {
    const interruptedByUser: Record<string, PendingTaskRecovery> = {};
    for (const [key, value] of this.interruptedByUser.entries()) {
      interruptedByUser[String(key)] = value;
    }
    await writeJsonAtomic(this.statePath, {
      recentByUser: this.recordFromMap(this.recentByUser),
      notesByUser: this.recordFromMap(this.notesByUser),
      interruptedByUser
    });
  }

  private async pushBounded(map: Map<number, string[]>, key: number, value: string, limit: number): Promise<void> {
    await this.ensureLoaded();
    const normalized = value.trim();
    if (!normalized) return;
    const items = map.get(key) || [];
    const deduped = items.filter((item) => item.toLowerCase() !== normalized.toLowerCase());
    deduped.push(normalized);
    map.set(key, deduped.slice(-limit));
    await this.persist();
  }

  async remember(user: TelegramUser, message: string): Promise<Memory | null> {
    await this.pushBounded(this.recentByUser, this.userKey(user), `User: ${message}`, this.maxRecent);
    return null;
  }

  async rememberAssistantReply(user: TelegramUser, message: string): Promise<Memory | null> {
    await this.pushBounded(this.recentByUser, this.userKey(user), `Spark: ${message}`, this.maxRecent);
    return null;
  }

  async learnAboutUser(user: TelegramUser, insight: string): Promise<Memory | null> {
    await this.pushBounded(this.notesByUser, this.userKey(user), insight, this.maxNotes);
    return null;
  }

  async recordInterruptedTask(
    user: TelegramUser,
    input: { message: string; failure: string; stage?: string }
  ): Promise<void> {
    await this.ensureLoaded();
    const message = input.message.trim();
    const failure = input.failure.trim();
    if (!message || !failure) return;
    this.interruptedByUser.set(this.userKey(user), {
      message,
      failure,
      stage: input.stage?.trim() || undefined,
      recordedAt: new Date().toISOString()
    });
    await this.persist();
  }

  async getPendingTaskRecovery(user: TelegramUser): Promise<PendingTaskRecovery | null> {
    await this.ensureLoaded();
    return this.interruptedByUser.get(this.userKey(user)) || null;
  }

  async storePreference(user: TelegramUser, preference: string): Promise<Memory | null> {
    await this.pushBounded(this.notesByUser, this.userKey(user), `Preference: ${preference}`, this.maxNotes);
    return null;
  }

  async recall(_user: TelegramUser, _query: string, _limit: number = 5): Promise<Memory[]> {
    return [];
  }

  async recallRecent(_user: TelegramUser, _limit: number = 5): Promise<Memory[]> {
    return [];
  }

  async getContext(user: TelegramUser, _currentMessage: string): Promise<string> {
    await this.ensureLoaded();
    const key = this.userKey(user);
    const notes = this.notesByUser.get(key) || [];
    const recent = this.recentByUser.get(key) || [];
    const lines: string[] = [];

    if (notes.length > 0) {
      lines.push('Session notes from this chat:');
      for (const note of notes) {
        lines.push(`- ${note}`);
      }
    }

    const interrupted = this.interruptedByUser.get(key);
    if (interrupted) {
      lines.push('Interrupted task to recover:');
      lines.push(`- User request: ${interrupted.message}`);
      lines.push(`- Failure: ${interrupted.failure}`);
      if (interrupted.stage) lines.push(`- Stage: ${interrupted.stage}`);
    }

    if (recent.length > 0) {
      lines.push('Recent Telegram turns:');
      for (const item of recent.slice(-4)) {
        lines.push(`- ${item}`);
      }
    }

    return lines.length > 0 ? lines.join('\n') : 'No prior memories.';
  }

  async getRecentMessages(user: TelegramUser, limit: number = 6): Promise<string[]> {
    await this.ensureLoaded();
    const key = this.userKey(user);
    const recent = this.recentByUser.get(key) || [];
    return recent
      .filter((item) => !/^Spark:\s*/i.test(item))
      .slice(-Math.max(1, limit))
      .map((item) => item.replace(/^User:\s*/i, '').trim())
      .filter(Boolean);
  }

  async getMemoryCount(user: TelegramUser): Promise<number> {
    await this.ensureLoaded();
    const key = this.userKey(user);
    return (this.notesByUser.get(key) || []).length + (this.recentByUser.get(key) || []).length;
  }

  async isAvailable(): Promise<boolean> {
    return true;
  }
}

export const conversation = new ConversationMemory();

export function isPendingTaskRecoveryQuestion(text: string): boolean {
  const normalized = text.toLowerCase().replace(/\s+/g, ' ').trim();
  return (
    /\bwhat happened\b/.test(normalized) ||
    /\bis it fine now\b/.test(normalized) ||
    /\bare we good now\b/.test(normalized) ||
    /\bdid it recover\b/.test(normalized) ||
    /\byou timed out\b/.test(normalized) ||
    /\bit timed out\b/.test(normalized) ||
    /\bwhat was i asking\b/.test(normalized) ||
    /\bwhat were we doing\b/.test(normalized) ||
    /\bwhere did we leave off\b/.test(normalized)
  );
}

export function renderPendingTaskRecoveryReply(task: PendingTaskRecovery): string {
  return [
    'I recovered the last interrupted task.',
    '',
    `The interrupted request was: ${task.message}`,
    `Failure: ${task.failure}`,
    task.stage ? `Stage: ${task.stage}` : null,
    '',
    'I can resume from that instead of starting from scratch.'
  ].filter(Boolean).join('\n');
}
