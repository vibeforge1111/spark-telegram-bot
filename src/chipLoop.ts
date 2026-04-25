import { execFile } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

export interface LoopResult {
  ok: boolean;
  chipKey?: string;
  roundsCompleted?: number;
  totalRounds?: number;
  history?: Array<{
    round_index: number;
    suggestions_count: number;
    best_verdict: string | null;
    best_metric: number | null;
  }>;
  statusPath?: string;
  error?: string;
}

interface LoopConfig {
  pythonCommand: string;
  builderRepo: string;
  builderHome: string;
  timeoutMs: number;
}

function resolveConfig(): LoopConfig {
  const builderRepo = path.resolve(
    process.env.SPARK_BUILDER_REPO || path.join(process.cwd(), '..', 'spark-intelligence-builder')
  );
  return {
    pythonCommand: (process.env.SPARK_BUILDER_PYTHON || 'python').trim() || 'python',
    builderRepo,
    builderHome: path.resolve(
      process.env.SPARK_BUILDER_HOME || path.join(os.homedir(), '.spark', 'state', 'spark-intelligence')
    ),
    timeoutMs: Number.parseInt(process.env.CHIP_LOOP_TIMEOUT_MS || '900000', 10) || 900000,
  };
}

export async function runChipLoop(chipKey: string, rounds: number, suggestLimit = 3): Promise<LoopResult> {
  if (!chipKey) return { ok: false, error: 'empty chip key' };
  const config = resolveConfig();
  const args = [
    '-m', 'spark_intelligence.cli', 'loops', 'run',
    '--home', config.builderHome,
    '--chip', chipKey,
    '--rounds', String(rounds),
    '--suggest-limit', String(suggestLimit),
    '--json',
  ];
  try {
    const { stdout } = await execFileAsync(config.pythonCommand, args, {
      cwd: config.builderRepo,
      timeout: config.timeoutMs,
      env: { ...process.env, PYTHONIOENCODING: 'utf-8' },
      maxBuffer: 10 * 1024 * 1024,
    });
    const parsed = JSON.parse(stdout);
    return {
      ok: Boolean(parsed.ok),
      chipKey: parsed.chip_key,
      roundsCompleted: parsed.rounds_completed,
      totalRounds: parsed.total_rounds,
      history: parsed.history,
      statusPath: parsed.status_path,
      error: parsed.error ?? undefined,
    };
  } catch (err: any) {
    const stderr = typeof err?.stderr === 'string' ? err.stderr.slice(-400) : '';
    return { ok: false, error: err?.message ? `${err.message}${stderr ? ': ' + stderr : ''}` : 'loop exec failed' };
  }
}
