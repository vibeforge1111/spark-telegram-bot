// Telegram admin check + no-op memory adapters.
// Long-term memory lives in Spark Intelligence Builder (SIB) now — this module
// only keeps the API surface the rest of the bot expects.

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
  isAdmin(user: TelegramUser): boolean {
    return ADMIN_IDS.includes(user.id);
  }

  isAllowed(user: TelegramUser): boolean {
    return PUBLIC_CHAT_ENABLED || this.isAdmin(user) || ALLOWED_IDS.includes(user.id);
  }

  hasAnyOperatorConfigured(): boolean {
    return ADMIN_IDS.length > 0 || ALLOWED_IDS.length > 0 || PUBLIC_CHAT_ENABLED;
  }

  async remember(_user: TelegramUser, _message: string): Promise<Memory | null> {
    return null;
  }

  async learnAboutUser(_user: TelegramUser, _insight: string): Promise<Memory | null> {
    return null;
  }

  async storePreference(_user: TelegramUser, _preference: string): Promise<Memory | null> {
    return null;
  }

  async recall(_user: TelegramUser, _query: string, _limit: number = 5): Promise<Memory[]> {
    return [];
  }

  async recallRecent(_user: TelegramUser, _limit: number = 5): Promise<Memory[]> {
    return [];
  }

  async getContext(_user: TelegramUser, _currentMessage: string): Promise<string> {
    return 'No prior memories.';
  }

  async getMemoryCount(_user: TelegramUser): Promise<number> {
    return 0;
  }

  async isAvailable(): Promise<boolean> {
    return true;
  }
}

export const conversation = new ConversationMemory();
