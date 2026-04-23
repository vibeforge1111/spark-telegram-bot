import axios from 'axios';

const SPAWNER_UI_URL = process.env.SPAWNER_UI_URL || 'http://127.0.0.1:4174';

export interface ScheduleRecord {
  id: string;
  cron: string;
  action: 'mission' | 'loop';
  payload: Record<string, unknown>;
  chatId?: string | null;
  createdAt: string;
  lastFiredAt: string | null;
  nextFireAt: string | null;
  fireCount: number;
  lastStatus: string | null;
  enabled: boolean;
}

export async function createSchedule(input: {
  cron: string;
  action: 'mission' | 'loop';
  payload: Record<string, unknown>;
  chatId: string;
}): Promise<{ ok: boolean; schedule?: ScheduleRecord; error?: string }> {
  try {
    const res = await axios.post(`${SPAWNER_UI_URL}/api/scheduled`, input, { timeout: 10000 });
    return { ok: Boolean(res.data?.ok), schedule: res.data?.schedule, error: res.data?.error };
  } catch (err: any) {
    return { ok: false, error: err?.response?.data?.error || err?.message || 'create failed' };
  }
}

export async function listSchedules(): Promise<{ ok: boolean; schedules?: ScheduleRecord[]; error?: string }> {
  try {
    const res = await axios.get(`${SPAWNER_UI_URL}/api/scheduled`, { timeout: 10000 });
    return { ok: Boolean(res.data?.ok), schedules: res.data?.schedules || [], error: res.data?.error };
  } catch (err: any) {
    return { ok: false, error: err?.message || 'list failed' };
  }
}

export async function deleteSchedule(id: string): Promise<{ ok: boolean; error?: string }> {
  try {
    const res = await axios.delete(`${SPAWNER_UI_URL}/api/scheduled?id=${encodeURIComponent(id)}`, { timeout: 10000 });
    return { ok: Boolean(res.data?.ok), error: res.data?.error };
  } catch (err: any) {
    return { ok: false, error: err?.message || 'delete failed' };
  }
}
