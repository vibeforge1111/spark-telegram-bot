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
  }
};
