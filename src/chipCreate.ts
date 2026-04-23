import { execFile } from 'node:child_process';
import path from 'node:path';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

export interface ChipCreateResult {
  ok: boolean;
  chipKey?: string;
  chipPath?: string;
  routerInvokable?: boolean;
  warnings?: string[];
  error?: string;
}

interface ChipCreateConfig {
  pythonCommand: string;
  builderRepo: string;
  builderHome: string;
  outputDir: string;
  chipLabsRoot: string;
  timeoutMs: number;
}

function resolveConfig(): ChipCreateConfig {
  const builderRepo = path.resolve(
    process.env.SPARK_BUILDER_REPO || path.join(process.cwd(), '..', 'spark-intelligence-builder')
  );
  return {
    pythonCommand: (process.env.SPARK_BUILDER_PYTHON || 'python').trim() || 'python',
    builderRepo,
    builderHome: path.resolve(
      process.env.SPARK_BUILDER_HOME || path.join(builderRepo, '.tmp-home-live-telegram-real')
    ),
    outputDir: path.resolve(
      process.env.CHIP_CREATE_OUTPUT_DIR || 'C:/Users/USER/Desktop'
    ),
    chipLabsRoot: path.resolve(
      process.env.CHIP_LABS_ROOT || 'C:/Users/USER/Desktop/spark-domain-chip-labs'
    ),
    timeoutMs: Number.parseInt(process.env.CHIP_CREATE_TIMEOUT_MS || '180000', 10) || 180000,
  };
}

export async function createChipFromPrompt(prompt: string): Promise<ChipCreateResult> {
  const clean = prompt.trim();
  if (!clean) {
    return { ok: false, error: 'empty prompt' };
  }
  const config = resolveConfig();
  const args = [
    '-m', 'spark_intelligence.cli', 'chips', 'create',
    '--home', config.builderHome,
    '--prompt', clean,
    '--output-dir', config.outputDir,
    '--chip-labs-root', config.chipLabsRoot,
    '--json',
  ];
  try {
    const { stdout } = await execFileAsync(config.pythonCommand, args, {
      cwd: config.builderRepo,
      timeout: config.timeoutMs,
      env: { ...process.env, PYTHONIOENCODING: 'utf-8' },
      maxBuffer: 10 * 1024 * 1024,
    });
    const parsed = JSON.parse(stdout) as {
      ok: boolean;
      chip_key?: string | null;
      chip_path?: string | null;
      router_invokable?: boolean;
      warnings?: string[];
      error?: string | null;
    };
    return {
      ok: Boolean(parsed.ok),
      chipKey: parsed.chip_key ?? undefined,
      chipPath: parsed.chip_path ?? undefined,
      routerInvokable: Boolean(parsed.router_invokable),
      warnings: parsed.warnings ?? [],
      error: parsed.error ?? undefined,
    };
  } catch (err: any) {
    const stderr = typeof err?.stderr === 'string' ? err.stderr.slice(-400) : '';
    const message = err?.message || 'chip create failed';
    return { ok: false, error: stderr ? `${message}: ${stderr}` : message };
  }
}
