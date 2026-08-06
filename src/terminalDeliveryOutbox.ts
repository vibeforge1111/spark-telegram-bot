import { readJsonFile, resolveStatePath, writeJsonAtomic } from './jsonState';

export type TerminalDeliveryEventType = 'mission_completed' | 'task_completed';
export type TerminalDeliveryState = 'pending' | 'paused' | 'exhausted';

export interface TerminalDeliveryTarget {
  relayProfile: string;
  relayPort: number;
}

export interface TerminalDeliveryOutboxRecord extends TerminalDeliveryTarget {
  schema: 'spark.telegram_terminal_delivery.v1';
  missionId: string;
  eventType: TerminalDeliveryEventType;
  state: TerminalDeliveryState;
  attempts: number;
  createdAt: string;
  updatedAt: string;
  nextAttemptAt: string | null;
  lastFailure: 'trace_unavailable' | 'telegram_delivery_failed' | 'persistence_failed' | null;
}

export interface TerminalDeliveryCoordinatorOptions<TCompletion> {
  target: TerminalDeliveryTarget;
  resolve: (record: TerminalDeliveryOutboxRecord) => Promise<TCompletion | null>;
  deliver: (
    record: TerminalDeliveryOutboxRecord,
    completion: TCompletion
  ) => Promise<'delivered' | 'paused' | 'discarded'>;
  onFailure: (missionId: string, reason: string) => void;
  retryBaseMs?: number;
  maxAttempts?: number;
}

const OUTBOX_TTL_MS = 24 * 60 * 60_000;
const MAX_CLOCK_SKEW_MS = 5 * 60_000;
let mutationChain: Promise<void> = Promise.resolve();

function safeSegment(value: string): string {
  return value.replace(/[^A-Za-z0-9_-]+/g, '-').replace(/^-+|-+$/g, '') || 'default';
}

function outboxPath(target: TerminalDeliveryTarget): string {
  return resolveStatePath(
    `.spark-terminal-delivery-outbox-${safeSegment(target.relayProfile)}-${target.relayPort}.json`
  );
}

function recordKey(record: Pick<TerminalDeliveryOutboxRecord, 'missionId' | 'relayProfile' | 'relayPort'>): string {
  return `${record.relayProfile}:${record.relayPort}:${record.missionId}`;
}

function validTarget(target: TerminalDeliveryTarget): boolean {
  return (
    /^[A-Za-z0-9_-]{1,64}$/.test(target.relayProfile) &&
    Number.isSafeInteger(target.relayPort) &&
    target.relayPort > 0 &&
    target.relayPort <= 65_535
  );
}

function validMissionId(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    value.length > 0 &&
    value.length <= 200 &&
    /^[A-Za-z0-9_.:-]+$/.test(value)
  );
}

function validIsoDate(value: unknown, now: number): value is string {
  if (typeof value !== 'string') return false;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) && parsed <= now + MAX_CLOCK_SKEW_MS;
}

function parseRecord(
  value: unknown,
  target: TerminalDeliveryTarget,
  now: number
): TerminalDeliveryOutboxRecord | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const record = value as Partial<TerminalDeliveryOutboxRecord>;
  if (
    record.schema !== 'spark.telegram_terminal_delivery.v1' ||
    !validMissionId(record.missionId) ||
    record.relayProfile !== target.relayProfile ||
    record.relayPort !== target.relayPort ||
    !['mission_completed', 'task_completed'].includes(String(record.eventType)) ||
    !['pending', 'paused', 'exhausted'].includes(String(record.state)) ||
    !Number.isSafeInteger(record.attempts) ||
    Number(record.attempts) < 0 ||
    Number(record.attempts) > 100 ||
    !validIsoDate(record.createdAt, now) ||
    !validIsoDate(record.updatedAt, now) ||
    (record.nextAttemptAt !== null && !validIsoDate(record.nextAttemptAt, now)) ||
    ![null, 'trace_unavailable', 'telegram_delivery_failed', 'persistence_failed'].includes(
      record.lastFailure as null | string
    )
  ) {
    return null;
  }
  if (now - Date.parse(record.createdAt) > OUTBOX_TTL_MS) return null;
  return record as TerminalDeliveryOutboxRecord;
}

async function readRecords(target: TerminalDeliveryTarget): Promise<TerminalDeliveryOutboxRecord[]> {
  if (!validTarget(target)) throw new Error('Invalid terminal delivery target.');
  const raw = await readJsonFile<unknown>(outboxPath(target));
  if (!Array.isArray(raw)) return [];
  const now = Date.now();
  const records = new Map<string, TerminalDeliveryOutboxRecord>();
  for (const value of raw) {
    const record = parseRecord(value, target, now);
    if (record) records.set(recordKey(record), record);
  }
  return Array.from(records.values());
}

async function writeRecords(
  target: TerminalDeliveryTarget,
  records: TerminalDeliveryOutboxRecord[]
): Promise<void> {
  await writeJsonAtomic(outboxPath(target), records);
}

function serialize<T>(operation: () => Promise<T>): Promise<T> {
  const next = mutationChain.then(operation, operation);
  mutationChain = next.then(() => undefined, () => undefined);
  return next;
}

export async function loadTerminalDeliveryOutbox(
  target: TerminalDeliveryTarget
): Promise<TerminalDeliveryOutboxRecord[]> {
  return serialize(async () => {
    const records = await readRecords(target);
    await writeRecords(target, records);
    return records;
  });
}

export async function enqueueTerminalDelivery(input: {
  missionId: string;
  eventType: TerminalDeliveryEventType;
  target: TerminalDeliveryTarget;
  paused?: boolean;
}): Promise<{ created: boolean; record: TerminalDeliveryOutboxRecord }> {
  return serialize(async () => {
    if (!validMissionId(input.missionId)) throw new Error('Invalid terminal delivery mission id.');
    const records = await readRecords(input.target);
    const key = recordKey({ ...input.target, missionId: input.missionId });
    const existing = records.find((record) => recordKey(record) === key);
    if (existing) return { created: false, record: existing };
    const now = new Date().toISOString();
    const record: TerminalDeliveryOutboxRecord = {
      schema: 'spark.telegram_terminal_delivery.v1',
      missionId: input.missionId,
      eventType: input.eventType,
      relayProfile: input.target.relayProfile,
      relayPort: input.target.relayPort,
      state: input.paused ? 'paused' : 'pending',
      attempts: 0,
      createdAt: now,
      updatedAt: now,
      nextAttemptAt: null,
      lastFailure: null
    };
    records.push(record);
    await writeRecords(input.target, records);
    return { created: true, record };
  });
}

export async function updateTerminalDelivery(
  target: TerminalDeliveryTarget,
  missionId: string,
  update: Partial<Pick<TerminalDeliveryOutboxRecord, 'state' | 'attempts' | 'nextAttemptAt' | 'lastFailure'>>
): Promise<TerminalDeliveryOutboxRecord | null> {
  return serialize(async () => {
    const records = await readRecords(target);
    const key = recordKey({ ...target, missionId });
    const index = records.findIndex((record) => recordKey(record) === key);
    if (index < 0) return null;
    records[index] = {
      ...records[index],
      ...update,
      updatedAt: new Date().toISOString()
    };
    await writeRecords(target, records);
    return records[index];
  });
}

export async function removeTerminalDelivery(
  target: TerminalDeliveryTarget,
  missionId: string
): Promise<boolean> {
  return serialize(async () => {
    const records = await readRecords(target);
    const key = recordKey({ ...target, missionId });
    const remaining = records.filter((record) => recordKey(record) !== key);
    if (remaining.length === records.length) return false;
    await writeRecords(target, remaining);
    return true;
  });
}

export function resetTerminalDeliveryOutboxForTests(): void {
  mutationChain = Promise.resolve();
}

export function terminalDeliveryOutboxPathForTests(target: TerminalDeliveryTarget): string {
  return outboxPath(target);
}

export class TerminalDeliveryCoordinator<TCompletion> {
  private readonly scheduled = new Set<string>();
  private readonly active = new Set<string>();
  private readonly timers = new Map<string, ReturnType<typeof setTimeout>>();
  private readonly retryBaseMs: number;
  private readonly maxAttempts: number;
  private stopped = false;

  constructor(private readonly options: TerminalDeliveryCoordinatorOptions<TCompletion>) {
    this.retryBaseMs = Math.max(25, Math.min(options.retryBaseMs ?? 1000, 5000));
    this.maxAttempts = Math.max(2, Math.min(options.maxAttempts ?? 8, 12));
  }

  async enqueue(input: {
    missionId: string;
    eventType: TerminalDeliveryEventType;
    paused?: boolean;
  }): Promise<{ created: boolean; record: TerminalDeliveryOutboxRecord }> {
    if (this.stopped) throw new Error('Terminal delivery coordinator is stopped.');
    const result = await enqueueTerminalDelivery({ ...input, target: this.options.target });
    if (result.record.state === 'pending') this.schedule(result.record);
    return result;
  }

  async recover(): Promise<number> {
    if (this.stopped) return 0;
    const records = await loadTerminalDeliveryOutbox(this.options.target);
    for (const record of records) {
      if (record.state === 'pending') this.schedule(record, this.recoveryDelay(record));
    }
    return records.filter((record) => record.state === 'pending').length;
  }

  async pause(missionId: string): Promise<void> {
    this.clearSchedule(missionId);
    await updateTerminalDelivery(this.options.target, missionId, {
      state: 'paused',
      nextAttemptAt: null
    });
  }

  async resume(missionId: string): Promise<void> {
    const record = await updateTerminalDelivery(this.options.target, missionId, {
      state: 'pending',
      nextAttemptAt: null
    });
    if (record) this.schedule(record);
  }

  async cancel(missionId: string): Promise<void> {
    this.clearSchedule(missionId);
    await removeTerminalDelivery(this.options.target, missionId);
  }

  stop(): void {
    this.stopped = true;
    for (const timer of this.timers.values()) clearTimeout(timer);
    this.timers.clear();
    this.scheduled.clear();
    this.active.clear();
  }

  isScheduledForTests(missionId: string): boolean {
    return this.scheduled.has(missionId);
  }

  private recoveryDelay(record: TerminalDeliveryOutboxRecord): number {
    if (!record.nextAttemptAt) return this.retryBaseMs;
    return Math.max(0, Date.parse(record.nextAttemptAt) - Date.now());
  }

  private schedule(record: TerminalDeliveryOutboxRecord, delayMs = this.retryBaseMs): void {
    if (this.stopped || this.scheduled.has(record.missionId) || this.active.has(record.missionId)) return;
    this.scheduled.add(record.missionId);
    const timer = setTimeout(() => {
      this.timers.delete(record.missionId);
      this.scheduled.delete(record.missionId);
      this.active.add(record.missionId);
      void this.run(record).finally(() => this.active.delete(record.missionId));
    }, Math.max(0, delayMs));
    timer.unref?.();
    this.timers.set(record.missionId, timer);
  }

  private clearSchedule(missionId: string): void {
    const timer = this.timers.get(missionId);
    if (timer) clearTimeout(timer);
    this.timers.delete(missionId);
    this.scheduled.delete(missionId);
  }

  private async run(record: TerminalDeliveryOutboxRecord): Promise<void> {
    let retry: { record: TerminalDeliveryOutboxRecord; delayMs: number } | null = null;
    try {
      const completion = await this.options.resolve(record);
      if (this.stopped) return;
      if (!completion) {
        retry = await this.prepareRetry(record, 'trace_unavailable');
        return;
      }
      const outcome = await this.options.deliver(record, completion);
      if (outcome === 'paused') {
        await updateTerminalDelivery(this.options.target, record.missionId, {
          state: 'paused',
          nextAttemptAt: null
        });
        return;
      }
      await removeTerminalDelivery(this.options.target, record.missionId);
    } catch (error) {
      this.options.onFailure(record.missionId, error instanceof Error ? error.message : String(error));
      try {
        retry = await this.prepareRetry(record, 'telegram_delivery_failed');
      } catch (persistError) {
        this.options.onFailure(record.missionId, persistError instanceof Error ? persistError.message : String(persistError));
      }
    } finally {
      if (retry && !this.stopped) {
        const pending = retry;
        setTimeout(() => this.schedule(pending.record, pending.delayMs), 0).unref?.();
      }
    }
  }

  private async prepareRetry(
    record: TerminalDeliveryOutboxRecord,
    failure: TerminalDeliveryOutboxRecord['lastFailure']
  ): Promise<{ record: TerminalDeliveryOutboxRecord; delayMs: number } | null> {
    const attempts = record.attempts + 1;
    if (attempts >= this.maxAttempts) {
      await updateTerminalDelivery(this.options.target, record.missionId, {
        state: 'exhausted',
        attempts,
        nextAttemptAt: null,
        lastFailure: failure
      });
      this.options.onFailure(record.missionId, 'terminal delivery exhausted bounded retries');
      return null;
    }
    const delayMs = Math.min(this.retryBaseMs * (2 ** Math.max(0, attempts - 1)), 30_000);
    const updated = await updateTerminalDelivery(this.options.target, record.missionId, {
      state: 'pending',
      attempts,
      nextAttemptAt: new Date(Date.now() + delayMs).toISOString(),
      lastFailure: failure
    });
    return updated ? { record: updated, delayMs } : null;
  }
}
