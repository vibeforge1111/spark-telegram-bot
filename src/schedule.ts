import axios from 'axios';
import { spawnerAxiosOptions } from './spawnerAuth';

const SPAWNER_UI_URL = process.env.SPAWNER_UI_URL || 'http://127.0.0.1:3333';

const DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function formatTime12(h: number, m: number): string {
  const hh = ((h + 11) % 12) + 1;
  const mm = String(m).padStart(2, '0');
  const suffix = h < 12 ? 'AM' : 'PM';
  return mm === '00' ? `${hh} ${suffix}` : `${hh}:${mm} ${suffix}`;
}

export function humanizeCron(cron: string): string {
  const parts = cron.trim().split(/\s+/);
  if (parts.length !== 5) return cron;
  const [minute, hour, dom, month, dow] = parts;
  if (hour === '*' && dom === '*' && month === '*' && dow === '*') {
    if (minute === '*') return 'Every minute';
    const m = /^\*\/(\d+)$/.exec(minute);
    if (m) return `Every ${m[1]} minute${m[1] === '1' ? '' : 's'}`;
    if (/^\d+$/.test(minute)) return `At ${minute} min past every hour`;
  }
  if (dom === '*' && month === '*' && dow === '*') {
    const h = /^\*\/(\d+)$/.exec(hour);
    if (h && /^\d+$/.test(minute)) return `Every ${h[1]} hour${h[1] === '1' ? '' : 's'} at :${minute.padStart(2, '0')}`;
    if (/^\d+$/.test(hour) && /^\d+$/.test(minute)) return `Daily at ${formatTime12(+hour, +minute)}`;
  }
  if (/^\d+$/.test(minute) && /^\d+$/.test(hour) && dom === '*' && month === '*' && /^\d$/.test(dow)) {
    return `Every ${DOW[+dow]} at ${formatTime12(+hour, +minute)}`;
  }
  if (/^\d+$/.test(minute) && /^\d+$/.test(hour) && /^\d+$/.test(dom) && month === '*' && dow === '*') {
    return `Monthly on day ${dom} at ${formatTime12(+hour, +minute)}`;
  }
  if (/^\d+$/.test(minute) && /^\d+$/.test(hour) && /^\d+$/.test(dom) && /^\d+$/.test(month) && dow === '*') {
    return `Yearly on ${MON[+month - 1]} ${dom} at ${formatTime12(+hour, +minute)}`;
  }
  return `Custom: ${cron}`;
}

export function formatNextFireLocal(iso: string | null): string {
  if (!iso) return '-';
  try {
    const d = new Date(iso);
    const ms = d.getTime() - Date.now();
    const local = d.toLocaleString(undefined, {
      weekday: 'short',
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
    });
    if (ms <= 0) return `${local} (due now)`;
    const s = Math.floor(ms / 1000);
    let rel: string;
    if (s < 60) rel = `${s}s`;
    else if (s < 3600) rel = `${Math.floor(s / 60)}m`;
    else if (s < 86_400) rel = `${Math.floor(s / 3600)}h`;
    else rel = `${Math.floor(s / 86_400)}d`;
    return `${local} (in ${rel})`;
  } catch {
    return iso;
  }
}

export function humanSummary(rec: ScheduleRecord): string {
  if (rec.action === 'mission') {
    const goal = String((rec.payload as { goal?: string }).goal ?? '(no goal)');
    return `Run mission "${goal}"`;
  }
  const p = rec.payload as { chipKey?: string; rounds?: number };
  const n = p.rounds ?? 1;
  return `Run ${n} loop round${n === 1 ? '' : 's'} on ${p.chipKey}`;
}

export function formatScheduleList(schedules: ScheduleRecord[]): string {
  if (schedules.length === 0) return 'No schedules.';
  const lines = [`Schedules (${schedules.length}):`, ''];
  for (const s of schedules) {
    lines.push(humanSummary(s));
    lines.push(`  Schedule: ${humanizeCron(s.cron)}`);
    lines.push(`  Next: ${formatNextFireLocal(s.nextFireAt)}`);
    lines.push(`  Fires so far: ${s.fireCount}${s.lastStatus ? ` | last: ${s.lastStatus.slice(0, 80)}` : ''}`);
    lines.push(`  Id: ${s.id}`);
    lines.push('');
  }
  return lines.join('\n').trim();
}

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
    const res = await axios.post(`${SPAWNER_UI_URL}/api/scheduled`, input, spawnerAxiosOptions(10000));
    return { ok: Boolean(res.data?.ok), schedule: res.data?.schedule, error: res.data?.error };
  } catch (err: any) {
    return { ok: false, error: err?.response?.data?.error || err?.message || 'create failed' };
  }
}

export async function listSchedules(): Promise<{ ok: boolean; schedules?: ScheduleRecord[]; error?: string }> {
  try {
    const res = await axios.get(`${SPAWNER_UI_URL}/api/scheduled`, spawnerAxiosOptions(10000));
    return { ok: Boolean(res.data?.ok), schedules: res.data?.schedules || [], error: res.data?.error };
  } catch (err: any) {
    return { ok: false, error: err?.message || 'list failed' };
  }
}

export async function deleteSchedule(id: string): Promise<{ ok: boolean; error?: string }> {
  try {
    const res = await axios.delete(`${SPAWNER_UI_URL}/api/scheduled?id=${encodeURIComponent(id)}`, spawnerAxiosOptions(10000));
    return { ok: Boolean(res.data?.ok), error: res.data?.error };
  } catch (err: any) {
    return { ok: false, error: err?.message || 'delete failed' };
  }
}
