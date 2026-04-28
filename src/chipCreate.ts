import { execFile } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import { resolvePythonCommand } from './pythonCommand';
import { withHiddenWindows } from './hiddenProcess';
import { buildChipCreateMissionContext, ChipCreateMissionReporter } from './missionControl';

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

interface ChipCreateJsonPayload {
  ok: boolean;
  chip_key?: string | null;
  chip_path?: string | null;
  router_invokable?: boolean;
  warnings?: string[];
  error?: string | null;
}

export function parseChipCreateJson(stdout: string): ChipCreateResult | null {
  const trimmed = stdout.trim();
  if (!trimmed) return null;
  let parsed: ChipCreateJsonPayload;
  try {
    parsed = JSON.parse(trimmed) as ChipCreateJsonPayload;
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== 'object' || typeof parsed.ok !== 'boolean') {
    return null;
  }
  return {
    ok: Boolean(parsed.ok),
    chipKey: parsed.chip_key ?? undefined,
    chipPath: parsed.chip_path ?? undefined,
    routerInvokable: Boolean(parsed.router_invokable),
    warnings: parsed.warnings ?? [],
    error: parsed.error ?? undefined,
  };
}

export function formatChipCreateProcessError(err: any): string {
  const stdout = typeof err?.stdout === 'string' ? err.stdout : '';
  const stdoutResult = parseChipCreateJson(stdout);
  if (stdoutResult?.error) {
    return stdoutResult.error;
  }

  const stderr = typeof err?.stderr === 'string' ? err.stderr.trim().slice(-400) : '';
  const stderrResult = parseChipCreateJson(stderr);
  if (stderrResult?.error) {
    return stderrResult.error;
  }

  const message = err?.message || 'chip create failed';
  return stderr ? `${message}: ${stderr}` : message;
}

function resolveConfig(): ChipCreateConfig {
  const builderRepo = path.resolve(
    process.env.SPARK_BUILDER_REPO || path.join(process.cwd(), '..', 'spark-intelligence-builder')
  );
  return {
    pythonCommand: resolvePythonCommand(process.env.SPARK_BUILDER_PYTHON),
    builderRepo,
    builderHome: path.resolve(
      process.env.SPARK_BUILDER_HOME || path.join(os.homedir(), '.spark', 'state', 'spark-intelligence')
    ),
    outputDir: path.resolve(
      process.env.CHIP_CREATE_OUTPUT_DIR || path.join(os.homedir(), '.spark', 'chips')
    ),
    chipLabsRoot: path.resolve(
      process.env.CHIP_LABS_ROOT || path.join(os.homedir(), '.spark', 'domain-chip-labs')
    ),
    timeoutMs: Number.parseInt(process.env.CHIP_CREATE_TIMEOUT_MS || '180000', 10) || 180000,
  };
}

export async function createChipFromPrompt(prompt: string): Promise<ChipCreateResult> {
  const clean = prompt.trim();
  if (!clean) {
    return { ok: false, error: 'empty prompt' };
  }
  const reporter = new ChipCreateMissionReporter(buildChipCreateMissionContext(clean));
  await reporter.created();
  await reporter.taskStarted(
    'task-brief',
    'Understand natural-language chip brief',
    ['telegram-natural-language', 'domain-chip-creator']
  );
  await reporter.taskCompleted('task-brief', 'Understand natural-language chip brief');
  await reporter.taskStarted(
    'task-scaffold',
    'Scaffold Spark-compatible domain chip',
    ['domain-chip-creator', 'spark-intelligence-builder']
  );
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
    await reporter.progress('Running Spark chip scaffolder...', {
      outputDir: config.outputDir,
      chipLabsRoot: config.chipLabsRoot,
    });
    const { stdout } = await execFileAsync(config.pythonCommand, args, withHiddenWindows({
      cwd: config.builderRepo,
      timeout: config.timeoutMs,
      env: { ...process.env, PYTHONIOENCODING: 'utf-8' },
      maxBuffer: 10 * 1024 * 1024,
    }));
    const parsed = parseChipCreateJson(stdout);
    if (!parsed) {
      await reporter.taskFailed('task-scaffold', 'Scaffold Spark-compatible domain chip', 'chip create returned invalid JSON');
      await reporter.failed('chip create returned invalid JSON');
      return { ok: false, error: 'chip create returned invalid JSON' };
    }
    if (parsed.ok) {
      await reporter.taskCompleted('task-scaffold', 'Scaffold Spark-compatible domain chip', {
        chipKey: parsed.chipKey,
        chipPath: parsed.chipPath,
        routerInvokable: parsed.routerInvokable,
        warnings: parsed.warnings ?? [],
      });
      await reporter.completed({
        chipKey: parsed.chipKey,
        chipPath: parsed.chipPath,
        routerInvokable: parsed.routerInvokable,
        warnings: parsed.warnings ?? [],
      });
    } else {
      const error = parsed.error || 'chip create failed';
      await reporter.taskFailed('task-scaffold', 'Scaffold Spark-compatible domain chip', error);
      await reporter.failed(error);
    }
    return parsed;
  } catch (err: any) {
    const error = formatChipCreateProcessError(err);
    await reporter.taskFailed('task-scaffold', 'Scaffold Spark-compatible domain chip', error);
    await reporter.failed(error);
    return { ok: false, error };
  }
}
