export type ConversationRetentionBucket = 'recent' | 'notes' | 'interrupted' | 'frame';

export interface ConversationRetentionDiagnostics {
  maxUsers: number;
  userCounts: Record<ConversationRetentionBucket, number>;
  evictionCounts: Record<ConversationRetentionBucket, number>;
}

const DEFAULT_MAX_USERS = 500;
const MAX_CONFIGURED_USERS = 10_000;

function emptyBucketCounts(): Record<ConversationRetentionBucket, number> {
  return { recent: 0, notes: 0, interrupted: 0, frame: 0 };
}

export class ConversationRetentionPolicy {
  readonly maxUsers: number;
  private readonly evictionCounts = emptyBucketCounts();

  constructor(maxUsers: number = DEFAULT_MAX_USERS) {
    if (!Number.isSafeInteger(maxUsers) || maxUsers < 1 || maxUsers > MAX_CONFIGURED_USERS) {
      throw new Error('invalid conversation retention limit');
    }
    this.maxUsers = maxUsers;
  }

  set<V>(bucket: ConversationRetentionBucket, map: Map<number, V>, userId: number, value: V): void {
    // Reinsert existing users so Map order tracks the most recent successful write.
    map.delete(userId);
    map.set(userId, value);
    while (map.size > this.maxUsers) {
      const oldest = map.keys().next().value;
      if (typeof oldest !== 'number') break;
      map.delete(oldest);
      this.evictionCounts[bucket] += 1;
    }
  }

  totalEvictions(): number {
    return Object.values(this.evictionCounts).reduce((total, count) => total + count, 0);
  }

  diagnostics(maps: Record<ConversationRetentionBucket, Map<number, unknown>>): ConversationRetentionDiagnostics {
    return {
      maxUsers: this.maxUsers,
      userCounts: {
        recent: maps.recent.size,
        notes: maps.notes.size,
        interrupted: maps.interrupted.size,
        frame: maps.frame.size
      },
      evictionCounts: { ...this.evictionCounts }
    };
  }
}
