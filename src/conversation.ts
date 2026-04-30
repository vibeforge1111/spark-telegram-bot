// Telegram admin check + short-session context adapters.
// Long-term memory lives in Spark Intelligence Builder (SIB). This module keeps
// a small in-process context buffer so plain chat can stay coherent immediately
// after the user says "remember that..." while durable memory catches up.
import { readJsonFile, resolveStatePath, writeJsonAtomic } from './jsonState';
import {
  buildConversationFrameFromState,
  emptyRollingConversationFrameState,
  renderConversationFrameDiagnostics,
  updateRollingConversationFrameState,
  type ConversationFrame,
  type RollingConversationFrameState
} from './conversationFrame';

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
  frameStateByUser?: Record<string, RollingConversationFrameState>;
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

export interface ResolvedOptionReference {
  ordinal: number;
  choice: string;
  source: string;
}

export interface RecentConversationTurn {
  role: 'user' | 'assistant';
  text: string;
}

const ORDINAL_WORDS: Record<string, number> = {
  first: 1,
  second: 2,
  third: 3,
  fourth: 4,
  fifth: 5,
  sixth: 6,
  seventh: 7,
  eighth: 8,
  ninth: 9,
  tenth: 10
};

const NUMBER_WORDS: Record<string, number> = {
  one: 1,
  two: 2,
  three: 3,
  four: 4,
  five: 5,
  six: 6,
  seven: 7,
  eight: 8,
  nine: 9,
  ten: 10
};

function compactLine(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}

export function optionOrdinalFromText(text: string): number | null {
  const normalized = text.toLowerCase().replace(/\s+/g, ' ').trim();
  const numeric = normalized.match(/(?:\b(?:no\.?|number|option)\s*|#\s*)([1-9]\d*)\b/);
  if (numeric?.[1]) return Number(numeric[1]);

  const wordNumber = normalized.match(/(?:\b(?:no\.?|number|option)\s*|#\s*)(one|two|three|four|five|six|seven|eight|nine|ten)\b/);
  if (wordNumber?.[1]) return NUMBER_WORDS[wordNumber[1]] || null;

  const ordinalDigit = normalized.match(/\b([1-9]\d*)(?:st|nd|rd|th)\s*(?:one|option|idea|direction|item|path|choice)?\b/);
  if (ordinalDigit?.[1]) return Number(ordinalDigit[1]);

  if (/\b(?:the\s+)?latter\b/.test(normalized)) return 2;

  for (const [word, value] of Object.entries(ORDINAL_WORDS)) {
    if (new RegExp(`\\b(?:the\\s+|that\\s+)?${word}\\s*(?:one|option|idea|direction|item|path|choice)?\\b`, 'i').test(normalized)) {
      return value;
    }
  }
  return null;
}

function cleanOptionText(text: string): string {
  return compactLine(text)
    .replace(/^["'`]+|["'`]+$/g, '')
    .replace(/^[*_]+|[*_]+$/g, '')
    .replace(/[.!?]+$/g, '')
    .trim();
}

export function extractAssistantOptions(message: string): string[] {
  const withoutPrefix = message.replace(/^Spark:\s*/i, '').trim();
  const lines = withoutPrefix.split(/\r?\n/);
  const groupedBullets: string[][] = [];
  let currentBullets: string[] = [];

  for (const line of lines) {
    if (/^\s*\d+[.)]\s+/.test(line)) {
      if (currentBullets.length > 0) groupedBullets.push(currentBullets);
      currentBullets = [];
      continue;
    }

    const bullet = line.match(/^\s*[-*]\s+(.+?)\s*$/)?.[1];
    if (bullet) currentBullets.push(cleanOptionText(bullet));
  }
  if (currentBullets.length > 0) groupedBullets.push(currentBullets);

  const firstNestedGroup = groupedBullets.find((group) => group.length >= 2);
  if (firstNestedGroup) return firstNestedGroup.filter(Boolean).slice(0, 10);

  const numbered = lines
    .map((line) => line.match(/^\s*\d+[.)]\s+(.+?)\s*$/)?.[1])
    .filter((line): line is string => Boolean(line && line.trim()))
    .map(cleanOptionText)
    .filter(Boolean);
  if (numbered.length >= 2) return numbered;

  const bullets = lines
    .map((line) => line.match(/^\s*[-*]\s+(.+?)\s*$/)?.[1])
    .filter((line): line is string => Boolean(line && line.trim()))
    .map(cleanOptionText)
    .filter(Boolean);
  if (bullets.length >= 2) return bullets;

  const twoWay = withoutPrefix.match(/\btwo\s+(?:ways|paths|options|directions)\b[^:]*:\s*([\s\S]+)/i);
  const body = twoWay?.[1]
    ?.split(/\n\s*(?:which|what|where|how|do you|does it|that sets)\b/i)[0]
    ?.trim();
  if (!body) return [];

  const parts = body
    .split(/\s*,?\s+or\s+/i)
    .map(cleanOptionText)
    .filter(Boolean);
  return parts.length >= 2 ? parts.slice(0, 10) : [];
}

export class ConversationMemory {
  private readonly recentByUser = new Map<number, string[]>();
  private readonly notesByUser = new Map<number, string[]>();
  private readonly interruptedByUser = new Map<number, PendingTaskRecovery>();
  private readonly frameStateByUser = new Map<number, RollingConversationFrameState>();
  private readonly maxRecent = 40;
  private readonly maxNotes = 20;
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
    if (snapshot?.frameStateByUser) {
      for (const [key, value] of Object.entries(snapshot.frameStateByUser)) {
        const userId = Number(key);
        if (Number.isSafeInteger(userId) && userId > 0 && value && typeof value === 'object') {
          this.frameStateByUser.set(userId, value);
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
    const frameStateByUser: Record<string, RollingConversationFrameState> = {};
    for (const [key, value] of this.frameStateByUser.entries()) {
      frameStateByUser[String(key)] = value;
    }
    await writeJsonAtomic(this.statePath, {
      recentByUser: this.recordFromMap(this.recentByUser),
      notesByUser: this.recordFromMap(this.notesByUser),
      interruptedByUser,
      frameStateByUser
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
    await this.updateRollingFrame(user, 'user', message);
    return null;
  }

  async rememberAssistantReply(user: TelegramUser, message: string): Promise<Memory | null> {
    await this.pushBounded(this.recentByUser, this.userKey(user), `Spark: ${message}`, this.maxRecent);
    await this.updateRollingFrame(user, 'assistant', message);
    return null;
  }

  private async updateRollingFrame(user: TelegramUser, role: 'user' | 'assistant', text: string): Promise<void> {
    await this.ensureLoaded();
    const key = this.userKey(user);
    const previous = this.frameStateByUser.get(key) || emptyRollingConversationFrameState();
    const next = updateRollingConversationFrameState(previous, {
      role,
      text,
      createdAt: new Date().toISOString()
    });
    this.frameStateByUser.set(key, next);
    await this.persist();
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
      for (const item of recent.slice(-12)) {
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

  async getRecentTurns(user: TelegramUser, limit: number = 16): Promise<RecentConversationTurn[]> {
    await this.ensureLoaded();
    const key = this.userKey(user);
    const recent = this.recentByUser.get(key) || [];
    return recent
      .slice(-Math.max(1, limit))
      .map((item) => {
        const assistant = item.match(/^Spark:\s*(.+)$/is);
        if (assistant) {
          return { role: 'assistant' as const, text: assistant[1].trim() };
        }
        const userMatch = item.match(/^User:\s*(.+)$/is);
        return { role: 'user' as const, text: (userMatch?.[1] || item).trim() };
      })
      .filter((turn) => turn.text.length > 0);
  }

  async resolveRecentOptionReference(user: TelegramUser, text: string): Promise<ResolvedOptionReference | null> {
    const ordinal = optionOrdinalFromText(text);
    const wantsLast = /\b(?:last|final|bottom)\s+(?:one|option|idea|direction|item|path|choice)?\b/i.test(text);
    if (!ordinal && !wantsLast) return null;

    await this.ensureLoaded();
    const recent = this.recentByUser.get(this.userKey(user)) || [];
    for (const item of [...recent].reverse()) {
      if (!/^Spark:\s*/i.test(item)) continue;
      const options = extractAssistantOptions(item);
      const resolvedOrdinal = wantsLast ? options.length : ordinal;
      if (!resolvedOrdinal) continue;
      const choice = options[resolvedOrdinal - 1];
      if (choice) {
        return {
          ordinal: resolvedOrdinal,
          choice,
          source: item.replace(/^Spark:\s*/i, '').trim()
        };
      }
    }
    return null;
  }

  async getConversationFrame(user: TelegramUser, currentMessage: string): Promise<ConversationFrame> {
    await this.ensureLoaded();
    const key = this.userKey(user);
    const state = this.frameStateByUser.get(key) || emptyRollingConversationFrameState();
    if (state.hotTurns.length > 0 || state.warmSummary || state.artifacts.length > 0) {
      return buildConversationFrameFromState(currentMessage, state);
    }
    const recentTurns = await this.getRecentTurns(user, 24);
    return buildConversationFrameFromState(currentMessage, {
      ...emptyRollingConversationFrameState(),
      hotTurns: recentTurns
    });
  }

  async getConversationFrameDiagnostics(user: TelegramUser): Promise<string> {
    await this.ensureLoaded();
    const key = this.userKey(user);
    return renderConversationFrameDiagnostics(this.frameStateByUser.get(key) || emptyRollingConversationFrameState());
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
