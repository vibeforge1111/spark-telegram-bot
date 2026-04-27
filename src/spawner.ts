import axios from 'axios';
import { telegramRelayIdentityFromEnv } from './relayIdentity';
import type { SkillTier } from './userTier';

const SPAWNER_UI_URL = process.env.SPAWNER_UI_URL || 'http://127.0.0.1:5173';
const SPARK_RUN_PROJECT_PATH = process.env.SPARK_RUN_PROJECT_PATH?.trim();
const DEFAULT_LOCAL_SERVICE_TIMEOUT_MS = 30_000;

type MissionAction = 'status' | 'pause' | 'resume' | 'kill';

interface RunGoalInput {
  goal: string;
  chatId: string;
  userId: string;
  requestId: string;
  tier?: SkillTier;
  providers?: string[];
  promptMode?: 'simple' | 'orchestrator';
}

interface RunGoalResult {
  success: boolean;
  missionId?: string;
  requestId?: string;
  providers?: string[];
  error?: string;
}

interface BoardEntry {
  missionId: string;
  missionName?: string | null;
  status: 'created' | 'running' | 'paused' | 'completed' | 'failed';
  lastEventType: string;
  lastUpdated: string;
  lastSummary: string;
  taskName: string | null;
  taskNames?: string[];
  taskCount?: number;
  telegramRelay?: {
    port?: number | null;
    profile?: string | null;
    url?: string | null;
  } | null;
  providerResults?: Array<{
    providerId?: string;
    status?: string;
    summary?: string;
  }>;
  providerSummary?: string;
}

const STALE_RUNNING_MISSION_MS = 15 * 60 * 1000;
const PROVIDER_LABELS: Record<string, string> = {
  claude: 'Claude',
  codex: 'Codex',
  minimax: 'MiniMax',
  zai: 'Z.AI'
};

type BoardBucket = 'running' | 'paused' | 'completed' | 'failed' | 'created';
type BoardSnapshot = Record<BoardBucket, BoardEntry[]>;

export function localServiceTimeoutMs(envKey: string, fallbackMs = DEFAULT_LOCAL_SERVICE_TIMEOUT_MS): number {
  const raw = process.env[envKey];
  if (!raw) return fallbackMs;
  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) && parsed >= 1000 ? parsed : fallbackMs;
}

function isRetryableLocalServiceError(err: any): boolean {
  const code = String(err?.code || '').toUpperCase();
  const message = String(err?.message || '').toLowerCase();
  return (
    code === 'ECONNABORTED' ||
    code === 'ECONNRESET' ||
    code === 'ETIMEDOUT' ||
    message.includes('timeout') ||
    message.includes('socket hang up')
  );
}

export async function postLocalServiceWithRetry<T = any>(
  url: string,
  body: unknown,
  timeoutMs = DEFAULT_LOCAL_SERVICE_TIMEOUT_MS
): Promise<{ data: T }> {
  try {
    return await axios.post(url, body, { timeout: timeoutMs });
  } catch (err: any) {
    if (!isRetryableLocalServiceError(err)) throw err;
    try {
      return await axios.post(url, body, { timeout: timeoutMs });
    } catch (retryErr: any) {
      const original = err?.message || 'local service request failed';
      const retry = retryErr?.message || 'retry failed';
      retryErr.message = `${retry} after retry. First attempt: ${original}`;
      throw retryErr;
    }
  }
}

function normalizeBucket(value: unknown): BoardEntry[] {
  return Array.isArray(value) ? value as BoardEntry[] : [];
}

function isFreshRunningEntry(entry: BoardEntry): boolean {
  const ageMs = Date.now() - Date.parse(entry.lastUpdated);
  return !Number.isFinite(ageMs) || ageMs < STALE_RUNNING_MISSION_MS;
}

async function fetchBoardSnapshot(): Promise<BoardSnapshot> {
  const res = await axios.get(`${SPAWNER_UI_URL}/api/mission-control/board`, { timeout: 10000 });
  const board = res.data?.board || {};
  return {
    running: normalizeBucket(board.running).filter(isFreshRunningEntry),
    paused: normalizeBucket(board.paused),
    completed: normalizeBucket(board.completed),
    failed: normalizeBucket(board.failed),
    created: normalizeBucket(board.created)
  };
}

function latestBoardEntry(board: BoardSnapshot): BoardEntry | null {
  const entries = [
    ...board.running,
    ...board.paused,
    ...board.completed,
    ...board.failed,
    ...board.created
  ];
  entries.sort((a, b) => Date.parse(b.lastUpdated || '') - Date.parse(a.lastUpdated || ''));
  return entries[0] || null;
}

function providerNames(entry: BoardEntry): string {
  const names = (entry.providerResults || [])
    .map((provider) => provider.providerId)
    .filter((name): name is string => Boolean(name?.trim()));

  if (names.length > 0) {
    return [...new Set(names)].map(formatProviderLabel).join(', ');
  }

  const summaryPrefix = entry.providerSummary?.match(/^([^:]+):/)?.[1]?.trim();
  return formatProviderLabel(summaryPrefix || entry.taskName || 'unknown');
}

function formatProviderLabel(providerId: string): string {
  const normalized = providerId.trim().toLowerCase();
  return PROVIDER_LABELS[normalized] || providerId.trim();
}

function formatLatestMission(entry: BoardEntry): string[] {
  const title = entry.missionName || entry.taskName || 'Unnamed mission';
  const tasks = entry.taskNames && entry.taskNames.length > 0
    ? entry.taskNames.slice(0, 3).join(', ')
    : entry.taskName || null;
  const lines = [
    `Mission: ${entry.missionId}`,
    `Status: ${entry.status}`,
    `Title: ${title}`
  ];

  if (tasks) lines.push(`Tasks: ${tasks}`);
  lines.push(`Provider: ${providerNames(entry)}`);
  if (entry.telegramRelay?.profile || entry.telegramRelay?.port) {
    const target = [entry.telegramRelay.profile, entry.telegramRelay.port ? `:${entry.telegramRelay.port}` : '']
      .filter(Boolean)
      .join('');
    lines.push(`Relay: ${target}`);
  }
  if (entry.providerSummary) lines.push(`Result: ${entry.providerSummary}`);
  return lines;
}

export const spawner = {
  async isAvailable(): Promise<boolean> {
    try {
      const res = await axios.get(`${SPAWNER_UI_URL}/api/providers`, { timeout: 3000 });
      return Array.isArray(res.data?.providers);
    } catch {
      return false;
    }
  },

  async runGoal(input: RunGoalInput): Promise<RunGoalResult> {
    try {
      const relay = telegramRelayIdentityFromEnv();
      const res = await postLocalServiceWithRetry(
        `${SPAWNER_UI_URL}/api/spark/run`,
        {
          goal: input.goal,
          chatId: input.chatId,
          userId: input.userId,
          requestId: input.requestId,
          telegramRelay: relay,
          ...(input.tier ? { tier: input.tier } : {}),
          ...(SPARK_RUN_PROJECT_PATH ? { projectPath: SPARK_RUN_PROJECT_PATH } : {}),
          ...(input.providers && input.providers.length > 0 ? { providers: input.providers } : {}),
          ...(input.promptMode ? { promptMode: input.promptMode } : {})
        },
        localServiceTimeoutMs('SPARK_SPAWNER_RUN_TIMEOUT_MS')
      );

      return {
        success: Boolean(res.data?.success),
        missionId: res.data?.missionId,
        requestId: res.data?.requestId,
        providers: Array.isArray(res.data?.providers) ? res.data.providers : []
      };
    } catch (err: any) {
      return {
        success: false,
        error: err.response?.data?.error || err.message
      };
    }
  },

  async missionCommand(action: MissionAction, missionId: string): Promise<{ success: boolean; message: string }> {
    try {
      const res = await axios.post(
        `${SPAWNER_UI_URL}/api/mission-control/command`,
        {
          action,
          missionId,
          source: 'telegram'
        },
        { timeout: 10000 }
      );

      if (res.data?.ok === false) {
        return {
          success: false,
          message: res.data?.error || `Mission ${missionId} command was rejected.`
        };
      }

      if (action === 'status') {
        const status = res.data?.status;
        const providers = status?.providers
          ? Object.entries(status.providers).map(([id, value]) => `${id}: ${value}`).join('\n')
          : '(none)';
        const lines = [
          `Mission: ${missionId}`,
          ...(status?.boardStatus ? [`Board: ${status.boardStatus}`] : []),
          `Paused: ${status?.paused ? 'yes' : 'no'}`,
          `Complete: ${status?.allComplete ? 'yes' : 'no'}`,
          'Providers:',
          providers
        ];
        if (status?.lastUpdated) {
          lines.push(`Updated: ${status.lastUpdated}`);
        }
        return { success: true, message: lines.join('\n') };
      }

      return {
        success: Boolean(res.data?.ok),
        message: res.data?.message || `${action} sent for ${missionId}`
      };
    } catch (err: any) {
      return {
        success: false,
        message: err.response?.data?.error || err.message
      };
    }
  },

  async board(): Promise<{ success: boolean; message: string }> {
    try {
      const board = await fetchBoardSnapshot();
      const sections: Array<[string, BoardEntry[]]> = [
        ['Running', board.running],
        ['Paused', board.paused],
        ['Completed', board.completed],
        ['Failed', board.failed],
        ['Created', board.created]
      ];

      const lines = ['Spawner Board'];
      for (const [label, entries] of sections) {
        lines.push('');
        lines.push(`${label}: ${entries.length}`);
        if (entries.length === 0) {
          lines.push('- none');
          continue;
        }

        for (const entry of entries.slice(0, 5)) {
          const task = entry.taskName ? ` | ${entry.taskName}` : '';
          lines.push(`- ${entry.missionId}${task}`);
        }
      }

      return {
        success: true,
        message: lines.join('\n')
      };
    } catch (err: any) {
      return {
        success: false,
        message: err.response?.data?.error || err.message
      };
    }
  },

  async latestKanbanSummary(): Promise<{ success: boolean; message: string }> {
    try {
      const latest = latestBoardEntry(await fetchBoardSnapshot());
      if (!latest) {
        return {
          success: true,
          message: 'Kanban has no missions yet.'
        };
      }

      return {
        success: true,
        message: [
          'The latest mission is visible on Kanban.',
          '',
          ...formatLatestMission(latest)
        ].join('\n')
      };
    } catch (err: any) {
      return {
        success: false,
        message: err.response?.data?.error || err.message
      };
    }
  },

  async latestProviderSummary(): Promise<{ success: boolean; message: string }> {
    try {
      const latest = latestBoardEntry(await fetchBoardSnapshot());
      if (!latest) {
        return {
          success: true,
          message: 'I do not see any Spawner jobs on Kanban yet.'
        };
      }

      return {
        success: true,
        message: [
          `The latest Spawner job was handled by: ${providerNames(latest)}`,
          '',
          ...formatLatestMission(latest)
        ].join('\n')
      };
    } catch (err: any) {
      return {
        success: false,
        message: err.response?.data?.error || err.message
      };
    }
  }
};
