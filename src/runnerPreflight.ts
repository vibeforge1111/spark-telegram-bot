import { mkdir, readFile, unlink, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { resolveStatePath } from './jsonState';

export type RunnerWritableState = 'yes' | 'no' | 'unknown';

export interface RunnerPreflight {
  runnerWritable: RunnerWritableState;
  runnerLabel: string;
  checkedAt: string;
  latencyMs: number;
  failureReason?: string;
}

export async function probeTelegramRunnerWritability(): Promise<RunnerPreflight> {
  const startedAt = Date.now();
  const checkedAt = new Date().toISOString();
  const marker = resolveStatePath(`.spark-runner-preflight-${process.pid}-${startedAt}.tmp`);
  const tempMarker = path.join(os.tmpdir(), `.spark-telegram-runner-preflight-${process.pid}-${startedAt}.tmp`);
  try {
    await mkdir(path.dirname(marker), { recursive: true });
    await writeFile(marker, `spark runner preflight ${checkedAt}\n`, { encoding: 'utf-8', flag: 'wx' });
    await writeFile(tempMarker, `spark runner temp preflight ${checkedAt}\n`, { encoding: 'utf-8', flag: 'wx' });
    await readFile(tempMarker, 'utf-8');
    await unlink(tempMarker).catch(() => {});
    await unlink(marker).catch(() => {});
    return {
      runnerWritable: 'yes',
      runnerLabel: 'telegram bot runner writable (state and temp preflight write/read/delete ok)',
      checkedAt,
      latencyMs: Date.now() - startedAt,
    };
  } catch (error) {
    await unlink(tempMarker).catch(() => {});
    await unlink(marker).catch(() => {});
    const failureReason = compactRunnerPreflightError(error);
    return {
      runnerWritable: 'no',
      runnerLabel: `telegram bot runner read-only (${failureReason})`,
      checkedAt,
      latencyMs: Date.now() - startedAt,
      failureReason,
    };
  }
}

function compactRunnerPreflightError(error: unknown): string {
  const code = typeof error === 'object' && error && 'code' in error ? String((error as any).code || '') : '';
  if (code) return code.slice(0, 48);
  const message = error instanceof Error ? error.message : String(error || 'unknown_error');
  return message.replace(/\s+/g, ' ').slice(0, 48) || 'unknown_error';
}
