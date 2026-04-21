import { mind, Memory, telegramIdToMindId } from './mind';

// Admin Telegram IDs that use the shared memory pool (from .env)
// Using Telegram ID is SECURE - it cannot be faked or changed
const ADMIN_IDS: number[] = (process.env.ADMIN_TELEGRAM_IDS || '')
  .split(',')
  .map(id => parseInt(id.trim(), 10))
  .filter(id => !isNaN(id));

const SHARED_MIND_ID = '550e8400-e29b-41d4-a716-446655440000';

interface TelegramUser {
  id: number;
  username?: string;
  first_name?: string;
}

export class ConversationMemory {
  private mind = mind;

  // Check if user is an admin
  isAdmin(user: TelegramUser): boolean {
    return ADMIN_IDS.includes(user.id);
  }

  // Get Mind user ID for a Telegram user
  private getMindId(user: TelegramUser): string {
    // Admins share the main memory pool (verified by Telegram ID, not username)
    if (this.isAdmin(user)) {
      return SHARED_MIND_ID;
    }
    // Everyone else gets isolated memory
    return telegramIdToMindId(user.id);
  }

  // Store a message from a user
  async remember(user: TelegramUser, message: string): Promise<Memory> {
    const userLabel = user.username || user.first_name || `user_${user.id}`;
    const content = `Said: "${message}"`;

    return this.mind.createMemory({
      userId: this.getMindId(user),
      content,
      temporal_level: 2, // Situational - conversation context
      salience: 0.6,
      content_type: 'event',
    });
  }

  // Store something important the bot learned about a user
  async learnAboutUser(user: TelegramUser, insight: string): Promise<Memory> {
    const content = `LEARNED: ${insight}`;

    return this.mind.createMemory({
      userId: this.getMindId(user),
      content,
      temporal_level: 3, // Seasonal - persists longer
      salience: 0.8,
      content_type: 'observation',
    });
  }

  // Store a user preference
  async storePreference(user: TelegramUser, preference: string): Promise<Memory> {
    const content = `PREFERENCE: ${preference}`;

    return this.mind.createMemory({
      userId: this.getMindId(user),
      content,
      temporal_level: 4, // Identity - permanent
      salience: 0.9,
      content_type: 'decision',
    });
  }

  // Recall memories related to a query
  async recall(user: TelegramUser, query: string, limit: number = 5): Promise<Memory[]> {
    return this.mind.retrieveMemories(this.getMindId(user), query, limit);
  }

  // Recall all recent memories for a user
  async recallRecent(user: TelegramUser, limit: number = 5): Promise<Memory[]> {
    return this.mind.listMemories(this.getMindId(user), limit);
  }

  // Get context for responding
  async getContext(user: TelegramUser, currentMessage: string): Promise<string> {
    // Get memories related to the current topic
    const memories = await this.recall(user, currentMessage, 5);

    if (memories.length === 0) {
      return 'No prior memories.';
    }

    const memoryList = memories
      .map(m => `- ${m.content}`)
      .join('\n');

    return `Relevant memories:\n${memoryList}`;
  }

  // Get memory count for a user
  async getMemoryCount(user: TelegramUser): Promise<number> {
    const memories = await this.mind.listMemories(this.getMindId(user), 100);
    return memories.length;
  }

  // Check if Mind is available
  async isAvailable(): Promise<boolean> {
    return this.mind.isHealthy();
  }
}

export const conversation = new ConversationMemory();
