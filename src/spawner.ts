import axios from 'axios';

const SPAWNER_UI_URL = process.env.SPAWNER_UI_URL || 'http://127.0.0.1:4174';

type MissionAction = 'status' | 'pause' | 'resume' | 'kill';

interface RunGoalInput {
  goal: string;
  chatId: string;
  userId: string;
  requestId: string;
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
  status: 'created' | 'running' | 'paused' | 'completed' | 'failed';
  lastEventType: string;
  lastUpdated: string;
  lastSummary: string;
  taskName: string | null;
}

const STALE_RUNNING_MISSION_MS = 15 * 60 * 1000;

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
      const res = await axios.post(
        `${SPAWNER_UI_URL}/api/spark/run`,
        {
          goal: input.goal,
          chatId: input.chatId,
          userId: input.userId,
          requestId: input.requestId,
          projectPath: 'C:/Users/USER/Desktop'
        },
        { timeout: 15000 }
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

      if (action === 'status') {
        const status = res.data?.status;
        const providers = status?.providers
          ? Object.entries(status.providers).map(([id, value]) => `${id}: ${value}`).join('\n')
          : '(none)';
        return {
          success: true,
          message: [
            `Mission: ${missionId}`,
            `Paused: ${status?.paused ? 'yes' : 'no'}`,
            `Complete: ${status?.allComplete ? 'yes' : 'no'}`,
            'Providers:',
            providers
          ].join('\n')
        };
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
      const res = await axios.get(`${SPAWNER_UI_URL}/api/mission-control/board`, { timeout: 10000 });
      const board = res.data?.board || {};
      const runningEntries = (Array.isArray(board.running) ? board.running : []).filter((entry: BoardEntry) => {
        const ageMs = Date.now() - Date.parse(entry.lastUpdated);
        return !Number.isFinite(ageMs) || ageMs < STALE_RUNNING_MISSION_MS;
      });
      const sections: Array<[string, BoardEntry[]]> = [
        ['Running', runningEntries],
        ['Paused', Array.isArray(board.paused) ? board.paused : []],
        ['Completed', Array.isArray(board.completed) ? board.completed : []],
        ['Failed', Array.isArray(board.failed) ? board.failed : []],
        ['Created', Array.isArray(board.created) ? board.created : []]
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
  }
};
