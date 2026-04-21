import axios from 'axios';
import crypto from 'crypto';

const MIND_API_URL = process.env.MIND_API_URL || 'http://localhost:8080';

export interface Memory {
  memory_id: string;
  content: string;
  temporal_level: number;
  salience: number;
  content_type?: string;
  created_at?: string;
}

export interface CreateMemoryInput {
  content: string;
  userId: string; // Required - Telegram user's Mind ID
  temporal_level?: number; // 1=immediate, 2=situational, 3=seasonal, 4=identity
  salience?: number; // 0.0 to 1.0
  content_type?: string; // observation, event, decision, reflection
}

// Convert Telegram user ID to a deterministic UUID for Mind
export function telegramIdToMindId(telegramId: number): string {
  const hash = crypto.createHash('sha256').update(`telegram:${telegramId}`).digest('hex');
  // Format as UUID: xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx
  return [
    hash.slice(0, 8),
    hash.slice(8, 12),
    '4' + hash.slice(13, 16), // Version 4
    ((parseInt(hash[16], 16) & 0x3) | 0x8).toString(16) + hash.slice(17, 20), // Variant
    hash.slice(20, 32),
  ].join('-');
}

export class MindClient {
  private baseUrl: string;

  constructor(baseUrl?: string) {
    this.baseUrl = baseUrl || MIND_API_URL;
  }

  async isHealthy(): Promise<boolean> {
    try {
      const res = await axios.get(`${this.baseUrl}/health`, { timeout: 2000 });
      // Handle both formats: 'ok' (mind_server.py) or {status: 'healthy'} (Mind Lite)
      return res.data === 'ok' || res.data?.status === 'healthy';
    } catch {
      return false;
    }
  }

  async createMemory(input: CreateMemoryInput): Promise<Memory> {
    const payload = {
      content: input.content,
      temporal_level: input.temporal_level ?? 2,
      salience: input.salience ?? 0.7,
      content_type: input.content_type ?? 'observation',
      user_id: input.userId,
    };

    const res = await axios.post(`${this.baseUrl}/v1/memories/`, payload);
    return res.data;
  }

  async retrieveMemories(userId: string, query: string, limit: number = 5): Promise<Memory[]> {
    const res = await axios.post(`${this.baseUrl}/v1/memories/retrieve`, {
      query,
      limit,
      user_id: userId,
    });
    return res.data.memories || [];
  }

  async listMemories(userId: string, limit: number = 10): Promise<Memory[]> {
    const res = await axios.get(`${this.baseUrl}/v1/memories/`, {
      params: { limit, user_id: userId },
    });
    return res.data || [];
  }

  async deleteMemory(memoryId: string): Promise<void> {
    await axios.delete(`${this.baseUrl}/v1/memories/${memoryId}`);
  }

  async getStats(userId?: string): Promise<{ total_memories: number }> {
    const res = await axios.get(`${this.baseUrl}/v1/stats`, {
      params: userId ? { user_id: userId } : {},
    });
    return res.data;
  }
}

export const mind = new MindClient();
