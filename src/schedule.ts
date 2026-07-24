import axios from 'axios';
import { redactText } from './redaction';
import { spawnerAxiosOptions } from './spawnerAuth';
import { resolveSpawnerUiUrl } from './spawnerUrl';

const SPAWNER_UI_URL = resolveSpawnerUiUrl();

const DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function formatTime12(h: number, m: number): string {
  const hh = ((h + 11) % 12) + 1;
  const mm = String(m).padStart(2, '0');
  const suffix = h < 12 ? 'AM' : 'PM';
  return mm === '00' ? `${hh} ${suffix}` : `${hh}:${mm} ${suffix}`;
}

function isSimpleCronField(value: string, min: number, max: number, allowStep = false): boolean {
  if (value === '*') return true;
  const step = allowStep ? /^\*\/(\d+)$/.exec(value) : null;
  const raw = step?.[1] ?? value;
  if (!/^\d+$/.test(raw)) return false;
  const parsed = Number(raw);
  return Number.isSafeInteger(parsed) && parsed >= min && parsed <= max;
}

export function humanizeCron(cron: string): string {
  const parts = cron.trim().split(/\s+/);
  if (parts.length !== 5) return cron;
  const [minute, hour, dom, month, dow] = parts;
  if (
    !isSimpleCronField(minute, 0, 59, true)
    || !isSimpleCronField(hour, 0, 23, true)
    || !isSimpleCronField(dom, 1, 31)
    || !isSimpleCronField(month, 1, 12)
    || !isSimpleCronField(dow, 0, 7)
  ) return `Custom: ${cron}`;
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
    return `Every ${DOW[+dow === 7 ? 0 : +dow]} at ${formatTime12(+hour, +minute)}`;
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
    const timestamp = d.getTime();
    if (Number.isNaN(timestamp)) return iso;
    const ms = timestamp - Date.now();
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
  return `Run ${n} loop round${n === 1 ? '' : 's'} on ${p.chipKey ?? '(no chip)'}`;
}

export function formatScheduleError(error: unknown, fallback: string): string {
  const redacted = redactText(String(error ?? '')).replace(/\s+/g, ' ').trim().toLowerCase();
  if (/\b(?:timeout|timed out|econn(?:aborted|refused|reset)?|network|socket|unreachable|502|503|504)\b/.test(redacted)) {
    return 'schedule service unavailable';
  }
  if (/\b(?:invalid cron|cron (?:expression )?invalid)\b/.test(redacted)) return 'invalid timing expression';
  if (/\b(?:not found|404)\b/.test(redacted)) return 'schedule not found';
  if (/\b(?:denied|forbidden|401|403)\b/.test(redacted)) return 'schedule request denied';
  if (/\b(?:conflict|409)\b/.test(redacted)) return 'schedule conflict';
  return String(fallback || 'schedule request failed').replace(/\s+/g, ' ').trim().slice(0, 80) || 'schedule request failed';
}

function safeScheduleStatus(status: string): string {
  const redacted = redactText(status);
  if (redacted !== status) return 'private detail hidden';
  return redacted.replace(/\s+/g, ' ').trim().slice(0, 80);
}

function safeScheduleTimezone(timezone: unknown): string {
  if (typeof timezone !== 'string') return '';
  const normalized = timezone.trim();
  if (
    normalized.length === 0
    || normalized.length > 80
    || redactText(normalized) !== normalized
    || !/^[A-Za-z][A-Za-z0-9._+-]*(?:\/[A-Za-z0-9._+-]+)*$/.test(normalized)
  ) return '';
  return normalized;
}

export function formatScheduleList(schedules: ScheduleRecord[]): string {
  if (schedules.length === 0) {
    return [
      'No schedules yet. Add one with:',
      '/schedule "<cron>" mission <goal>',
      '/schedule "<cron>" loop <chipKey> [rounds]',
    ].join('\n');
  }
  const lines = [`Schedules (${schedules.length}):`, ''];
  for (const s of schedules) {
    const timezone = safeScheduleTimezone(s.timezone);
    lines.push(humanSummary(s));
    lines.push(`  Schedule: ${humanizeCron(s.cron)}${timezone ? ` (${timezone})` : ''}`);
    lines.push(`  Next: ${formatNextFireLocal(s.nextFireAt)}`);
    lines.push(`  Fires so far: ${s.fireCount}${s.lastStatus ? ` | last: ${safeScheduleStatus(s.lastStatus)}` : ''}`);
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
  timezone?: string | null;
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
    return { ok: Boolean(res.data?.ok), schedule: res.data?.schedule, error: res.data?.error ? formatScheduleError(res.data.error, 'create failed') : undefined };
  } catch (err: any) {
    return { ok: false, error: formatScheduleError(err?.response?.data?.error || err?.message, 'create failed') };
  }
}

export async function listSchedules(): Promise<{ ok: boolean; schedules?: ScheduleRecord[]; error?: string }> {
  try {
    const res = await axios.get(`${SPAWNER_UI_URL}/api/scheduled`, spawnerAxiosOptions(10000));
    return { ok: Boolean(res.data?.ok), schedules: res.data?.schedules || [], error: res.data?.error ? formatScheduleError(res.data.error, 'list failed') : undefined };
  } catch (err: any) {
    return { ok: false, error: formatScheduleError(err?.message, 'list failed') };
  }
}

export async function deleteSchedule(id: string): Promise<{ ok: boolean; error?: string }> {
  try {
    const res = await axios.delete(`${SPAWNER_UI_URL}/api/scheduled?id=${encodeURIComponent(id)}`, spawnerAxiosOptions(10000));
    return { ok: Boolean(res.data?.ok), error: res.data?.error ? formatScheduleError(res.data.error, 'delete failed') : undefined };
  } catch (err: any) {
    return { ok: false, error: formatScheduleError(err?.message, 'delete failed') };
  }
}
