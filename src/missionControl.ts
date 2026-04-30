export interface MissionControlEvent {
  type: string;
  missionId: string;
  missionName: string;
  taskId?: string;
  taskName?: string;
  message?: string;
  timestamp?: string;
  source: string;
  data?: Record<string, unknown>;
}

export interface ChipCreateMissionContext {
  missionId: string;
  missionName: string;
  brief: string;
  plannedTasks: Array<{ title: string; skills: string[] }>;
}

export type MissionControlPost = (url: string, payload: MissionControlEvent) => Promise<void>;

const DEFAULT_SPAWNER_UI_URL = 'http://127.0.0.1:3333';
const SOURCE = 'spark-telegram-bot';

function truncate(value: string, maxLength: number): string {
  const clean = value.replace(/\s+/g, ' ').trim();
  return clean.length > maxLength ? `${clean.slice(0, Math.max(0, maxLength - 3)).trim()}...` : clean;
}

function randomId(): string {
  return Math.random().toString(36).slice(2, 8);
}

function missionControlDisabled(): boolean {
  const raw = process.env.SPARK_MISSION_CONTROL_DISABLED || '';
  return ['1', 'true', 'yes', 'on'].includes(raw.trim().toLowerCase());
}

export function getMissionControlEventsUrl(): string | null {
  if (missionControlDisabled()) return null;
  const base = (
    process.env.SPAWNER_UI_URL ||
    process.env.MISSION_CONTROL_URL ||
    DEFAULT_SPAWNER_UI_URL
  ).trim();
  if (!base) return null;
  return `${base.replace(/\/+$/, '')}/api/events`;
}

export function buildChipCreateMissionContext(brief: string): ChipCreateMissionContext {
  const clean = brief.replace(/\s+/g, ' ').trim();
  return {
    missionId: `spark-chip-create-${Date.now()}-${randomId()}`,
    missionName: `Domain chip: ${truncate(clean, 72)}`,
    brief: clean,
    plannedTasks: [
      {
        title: 'Understand natural-language chip brief',
        skills: ['telegram-natural-language', 'domain-chip-creator'],
      },
      {
        title: 'Scaffold Spark-compatible domain chip',
        skills: ['domain-chip-creator', 'spark-intelligence-builder'],
      },
      {
        title: 'Report chip registration result',
        skills: ['mission-control', 'runtime-sync'],
      },
    ],
  };
}

async function defaultPostJson(url: string, payload: MissionControlEvent): Promise<void> {
  const controller = new AbortController();
  const timeoutMs = Number.parseInt(process.env.MISSION_CONTROL_POST_TIMEOUT_MS || '1200', 10) || 1200;
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });
    if (!response.ok) {
      const body = await response.text().catch(() => '');
      throw new Error(`Mission Control HTTP ${response.status}: ${body.slice(0, 200)}`);
    }
  } finally {
    clearTimeout(timeout);
  }
}

export async function emitMissionControlEvent(
  event: MissionControlEvent,
  post: MissionControlPost = defaultPostJson
): Promise<boolean> {
  const url = getMissionControlEventsUrl();
  if (!url) return false;
  try {
    await post(url, {
      ...event,
      timestamp: event.timestamp || new Date().toISOString(),
      source: event.source || SOURCE,
    });
    return true;
  } catch (error) {
    if (process.env.DEBUG_MISSION_CONTROL_EVENTS === '1') {
      console.warn('[MissionControl] event post failed:', error);
    }
    return false;
  }
}

export class ChipCreateMissionReporter {
  private disabled = false;

  constructor(
    private readonly context: ChipCreateMissionContext,
    private readonly post?: MissionControlPost
  ) {}

  private baseData(extra: Record<string, unknown> = {}): Record<string, unknown> {
    return {
      brief: this.context.brief,
      plannedTasks: this.context.plannedTasks,
      ...extra,
    };
  }

  private async emit(partial: Omit<MissionControlEvent, 'missionId' | 'missionName' | 'source'>): Promise<void> {
    if (this.disabled) return;
    const ok = await emitMissionControlEvent({
      missionId: this.context.missionId,
      missionName: this.context.missionName,
      source: SOURCE,
      ...partial,
    }, this.post);
    if (!ok) this.disabled = true;
  }

  async created(): Promise<void> {
    await this.emit({
      type: 'mission_created',
      message: `Creating domain chip from: ${truncate(this.context.brief, 120)}`,
      data: this.baseData(),
    });
  }

  async taskStarted(taskId: string, taskName: string, skills: string[] = []): Promise<void> {
    await this.emit({
      type: 'task_started',
      taskId,
      taskName,
      message: taskName,
      data: this.baseData({ skills }),
    });
  }

  async progress(message: string, extra: Record<string, unknown> = {}): Promise<void> {
    await this.emit({
      type: 'progress',
      message,
      data: this.baseData(extra),
    });
  }

  async taskCompleted(
    taskId: string,
    taskName: string,
    extra: Record<string, unknown> = {}
  ): Promise<void> {
    await this.emit({
      type: 'task_completed',
      taskId,
      taskName,
      message: `${taskName} completed`,
      data: this.baseData(extra),
    });
  }

  async taskFailed(taskId: string, taskName: string, error: string): Promise<void> {
    await this.emit({
      type: 'task_failed',
      taskId,
      taskName,
      message: error,
      data: this.baseData({ error }),
    });
  }

  async completed(extra: Record<string, unknown> = {}): Promise<void> {
    await this.emit({
      type: 'mission_completed',
      message: 'Domain chip creation completed',
      data: this.baseData(extra),
    });
  }

  async failed(error: string): Promise<void> {
    await this.emit({
      type: 'mission_failed',
      message: error,
      data: this.baseData({ error }),
    });
  }
}
