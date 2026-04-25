// Telegram admin check + short-session context adapters.
// Long-term memory lives in Spark Intelligence Builder (SIB). This module keeps
// a small in-process context buffer so plain chat can stay coherent immediately
// after the user says "remember that..." while durable memory catches up.

const ADMIN_IDS: number[] = (process.env.ADMIN_TELEGRAM_IDS || '')
  .split(',')
  .map((id) => parseInt(id.trim(), 10))
  .filter((id) => !isNaN(id));

const ALLOWED_IDS: number[] = (
  process.env.ALLOWED_TELEGRAM_IDS ||
  process.env.TELEGRAM_ALLOWED_USER_IDS ||
  ''
)
  .split(',')
  .map((id) => parseInt(id.trim(), 10))
  .filter((id) => !isNaN(id));

const PUBLIC_CHAT_ENABLED = process.env.TELEGRAM_PUBLIC_CHAT_ENABLED === '1';

interface TelegramUser {
  id: number;
  username?: string;
  first_name?: string;
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
  private readonly maxRecent = 8;
  private readonly maxNotes = 12;

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

  private pushBounded(map: Map<number, string[]>, key: number, value: string, limit: number): void {
    const normalized = value.trim();
    if (!normalized) return;
    const items = map.get(key) || [];
    const deduped = items.filter((item) => item.toLowerCase() !== normalized.toLowerCase());
    deduped.push(normalized);
    map.set(key, deduped.slice(-limit));
  }

  async remember(user: TelegramUser, message: string): Promise<Memory | null> {
    this.pushBounded(this.recentByUser, this.userKey(user), `User: ${message}`, this.maxRecent);
    return null;
  }

  async learnAboutUser(user: TelegramUser, insight: string): Promise<Memory | null> {
    this.pushBounded(this.notesByUser, this.userKey(user), insight, this.maxNotes);
    return null;
  }

  async storePreference(user: TelegramUser, preference: string): Promise<Memory | null> {
    this.pushBounded(this.notesByUser, this.userKey(user), `Preference: ${preference}`, this.maxNotes);
    return null;
  }

  async recall(_user: TelegramUser, _query: string, _limit: number = 5): Promise<Memory[]> {
    return [];
  }

  async recallRecent(_user: TelegramUser, _limit: number = 5): Promise<Memory[]> {
    return [];
  }

  async getContext(user: TelegramUser, _currentMessage: string): Promise<string> {
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

    if (recent.length > 0) {
      lines.push('Recent Telegram turns:');
      for (const item of recent.slice(-4)) {
        lines.push(`- ${item}`);
      }
    }

    return lines.length > 0 ? lines.join('\n') : 'No prior memories.';
  }

  async getMemoryCount(user: TelegramUser): Promise<number> {
    const key = this.userKey(user);
    return (this.notesByUser.get(key) || []).length + (this.recentByUser.get(key) || []).length;
  }

  async isAvailable(): Promise<boolean> {
    return true;
  }
}

export const conversation = new ConversationMemory();
