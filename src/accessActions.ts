import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { spawnHidden, withHiddenWindows } from './hiddenProcess';
import { effectiveLevel5RuntimeEnv } from './level5RuntimeEnv';
import { redactText } from './redaction';

const execFileAsync = promisify(execFile);

export type SparkAccessActionId =
  | 'workspace_setup'
  | 'docker_doctor'
  | 'docker_smoke'
  | 'level5_enable'
  | 'level5_disable';

export type SparkAccessActionRunPolicy =
  | 'auto_safe'
  | 'auto_read_only'
  | 'confirm_once'
  | 'explicit_opt_in';

export interface SparkAccessAction {
  id: SparkAccessActionId;
  command: string[];
  runPolicy: SparkAccessActionRunPolicy;
  confirmation?: string;
  timeoutMs: number;
}

export type SparkCommandRunner = (
  args: string[],
  timeoutMs: number
) => Promise<{ stdout: string; stderr: string }>;

export interface SparkAccessActionExecution {
  reply: string;
  payload: Record<string, unknown> | null;
  needsSparkRestart: boolean;
}

export const SPARK_ACCESS_ACTIONS: Record<SparkAccessActionId, SparkAccessAction> = {
  workspace_setup: {
    id: 'workspace_setup',
    command: ['access', 'setup', '--json'],
    runPolicy: 'auto_safe',
    timeoutMs: 60_000,
  },
  docker_doctor: {
    id: 'docker_doctor',
    command: ['sandbox', 'docker', 'doctor', '--json'],
    runPolicy: 'auto_read_only',
    timeoutMs: 30_000,
  },
  docker_smoke: {
    id: 'docker_smoke',
    command: ['sandbox', 'docker', 'smoke', '--json'],
    runPolicy: 'confirm_once',
    confirmation: 'Run Docker sandbox test',
    timeoutMs: 180_000,
  },
  level5_enable: {
    id: 'level5_enable',
    command: ['access', 'setup', '--level', '5', '--enable-high-agency', '--json'],
    runPolicy: 'explicit_opt_in',
    confirmation: 'Enable whole-computer operator mode',
    timeoutMs: 60_000,
  },
  level5_disable: {
    id: 'level5_disable',
    command: ['access', 'disable-level5', '--json'],
    runPolicy: 'confirm_once',
    confirmation: 'Return to workspace sandbox',
    timeoutMs: 60_000,
  },
};

const ACTION_COMMANDS: Record<SparkAccessActionId, string> = {
  workspace_setup: '/access_setup',
  docker_doctor: '/docker_doctor',
  docker_smoke: '/docker_smoke',
  level5_enable: '/level5_setup',
  level5_disable: '/level5_disable',
};

const ACTION_LABELS: Record<SparkAccessActionId, string> = {
  workspace_setup: 'Set up safe workspace',
  docker_doctor: 'Check runner',
  docker_smoke: 'Test sandbox',
  level5_enable: 'Confirm Access Level 5',
  level5_disable: 'Return to Level 4',
};

export function accessActionNeedsConfirmation(actionId: SparkAccessActionId): boolean {
  const policy = SPARK_ACCESS_ACTIONS[actionId].runPolicy;
  return policy === 'confirm_once' || policy === 'explicit_opt_in';
}

export function sparkAccessActionCommandText(actionId: SparkAccessActionId): string {
  return ACTION_COMMANDS[actionId];
}

export function sparkAccessActionLabel(actionId: SparkAccessActionId): string {
  return ACTION_LABELS[actionId];
}

export function formatSparkAccessActionConfirmationPrompt(actionId: SparkAccessActionId): string {
  const command = sparkAccessActionCommandText(actionId);
  const hint = actionId === 'docker_smoke'
    ? 'This runs a no-secret Docker sandbox smoke. It may build or use a local image, but should not mount your home folder, Spark secrets, or the Docker socket.'
    : actionId === 'level5_enable'
      ? 'Level 5 is whole-computer operator mode. Spark will write local guardrail env files and require a restart before it becomes active.'
      : 'This changes Spark access guardrail state and requires confirmation.';
  return [hint, '', `To continue, send ${command} confirm or tap Confirm.`].join('\n');
}

export function buildSparkAccessActionKeyboard(profile: string): { reply_markup: { inline_keyboard: Array<Array<{ text: string; callback_data: string }>> } } {
  const rows: Array<Array<{ text: string; callback_data: string }>> = [
    [
      buttonForAction('workspace_setup'),
      buttonForAction('docker_doctor'),
    ],
    [
      buttonForAction('docker_smoke'),
    ],
  ];
  return { reply_markup: { inline_keyboard: rows } };
}

export function buildSparkAccessChangeKeyboard(profile: string): { reply_markup: { inline_keyboard: Array<Array<{ text: string; callback_data: string }>> } } | undefined {
  if (profile === 'developer') {
    return {
      reply_markup: {
        inline_keyboard: [[buttonForAction('workspace_setup')]],
      },
    };
  }
  return undefined;
}

export function buildSparkAccessLevel5ConfirmKeyboard(): { reply_markup: { inline_keyboard: Array<Array<{ text: string; callback_data: string }>> } } {
  return {
    reply_markup: {
      inline_keyboard: [[
        {
          text: 'Confirm Access Level 5',
          callback_data: 'spark_access_level:operator:confirm',
        },
      ]],
    },
  };
}

export function buildSparkAccessConfirmationKeyboard(actionId: SparkAccessActionId): { reply_markup: { inline_keyboard: Array<Array<{ text: string; callback_data: string }>> } } {
  return {
    reply_markup: {
      inline_keyboard: [[
        {
          text: actionId === 'level5_enable' ? 'Confirm Access Level 5' : `Confirm: ${sparkAccessActionLabel(actionId)}`,
          callback_data: `spark_access:${actionId}:confirm`,
        },
      ]],
    },
  };
}

function buttonForAction(actionId: SparkAccessActionId): { text: string; callback_data: string } {
  return {
    text: sparkAccessActionLabel(actionId),
    callback_data: `spark_access:${actionId}`,
  };
}

export async function runSparkAccessAction(
  actionId: SparkAccessActionId,
  runner: SparkCommandRunner = defaultSparkCommandRunner
): Promise<string> {
  return (await runSparkAccessActionDetailed(actionId, runner)).reply;
}

export async function runSparkAccessActionDetailed(
  actionId: SparkAccessActionId,
  runner: SparkCommandRunner = defaultSparkCommandRunner
): Promise<SparkAccessActionExecution> {
  const action = SPARK_ACCESS_ACTIONS[actionId];
  let result: { stdout: string; stderr: string };
  try {
    result = await runner(action.command, action.timeoutMs);
  } catch (error) {
    const anyError = error as { stdout?: unknown; stderr?: unknown; message?: unknown };
    const failedPayload = parseSparkJson(
      Buffer.isBuffer(anyError.stdout) ? anyError.stdout.toString('utf8') : String(anyError.stdout || '')
    );
    if (failedPayload) {
      return {
        reply: formatSparkAccessActionReply(actionId, failedPayload),
        payload: failedPayload,
        needsSparkRestart: false,
      };
    }
    const output = redactText([
      anyError.stdout,
      anyError.stderr,
      anyError.message,
    ].filter(Boolean).map(String).join('\n').trim());
    const nonInteractive = /non-interactive|interactive terminal|requires?.*confirmation/i.test(output);
    const reply = nonInteractive && (actionId === 'level5_enable' || actionId === 'level5_disable')
      ? [
          'Spark could not change the Level 5 service lane from this Telegram process because the Spark CLI requires an interactive confirmation.',
          'Run `spark access disable-level5` in a trusted local terminal, then restart Spark Live. The Telegram chat access setting can still be lowered separately.'
        ].join('\n')
      : formatSparkAccessActionFailureReply(actionId, output || error);
    return {
      reply,
      payload: {
        ok: false,
        error: nonInteractive ? 'non_interactive_confirmation_required' : 'command_failed'
      },
      needsSparkRestart: false,
    };
  }
  const payload = parseSparkJson(result.stdout);
  if (!payload) {
    const output = redactText([result.stdout, result.stderr].filter(Boolean).join('\n').trim());
    return {
      reply: [`Spark action ran, but did not return JSON: ${action.id}`, output || 'No output.'].join('\n'),
      payload: null,
      needsSparkRestart: false,
    };
  }
  return {
    reply: formatSparkAccessActionReply(actionId, payload),
    payload,
    needsSparkRestart: accessActionNeedsSparkRestart(actionId, payload),
  };
}

async function defaultSparkCommandRunner(args: string[], timeoutMs: number): Promise<{ stdout: string; stderr: string }> {
  try {
  const { stdout, stderr } = await execFileAsync(
    '/data/data/com.termux/files/usr/bin/bash',
    [process.env.SPARK_BIN || '/data/data/com.termux/files/home/.spark/bin/spark', ...args] as string[],
    withHiddenWindows({
      timeout: timeoutMs,
      maxBuffer: 1024 * 1024,
      env: effectiveLevel5RuntimeEnv(process.env),
    })
  );
  return {
    stdout: Buffer.isBuffer(stdout) ? stdout.toString('utf8') : String(stdout || ''),
    stderr: Buffer.isBuffer(stderr) ? stderr.toString('utf8') : String(stderr || ''),
  };
  } catch (err: any) {
    return {
      stdout: Buffer.isBuffer(err.stdout) ? err.stdout.toString('utf8') : String(err.stdout || ''),
      stderr: Buffer.isBuffer(err.stderr) ? err.stderr.toString('utf8') : String(err.stderr || ''),
    };
  }
}

function parseSparkJson(stdout: string): Record<string, unknown> | null {
  const trimmed = stdout.trim();
  if (!trimmed) return null;
  try {
    const parsed = JSON.parse(trimmed);
    return parsed && typeof parsed === 'object' ? parsed as Record<string, unknown> : null;
  } catch {
    return null;
  }
}

export function formatSparkAccessActionReply(actionId: SparkAccessActionId, payload: Record<string, unknown>): string {
  const ok = payload.ok !== false;
  if (actionId === 'workspace_setup') {
    return [
      ok ? 'Safe workspace setup is ready.' : 'Safe workspace setup needs attention.',
      accessSummary(payload),
      nextLine(payload),
    ].filter(Boolean).join('\n');
  }
  if (actionId === 'docker_doctor') {
    return [
      ok ? 'Docker sandbox check passed.' : 'Docker sandbox is not ready yet.',
      String(payload.next || ''),
    ].filter(Boolean).join('\n');
  }
  if (actionId === 'docker_smoke') {
    return [
      ok ? 'Docker sandbox smoke passed.' : 'Docker sandbox smoke failed.',
      'This smoke is designed to run without Spark secrets, home-folder mounts, or Docker socket access.',
      String(payload.next || ''),
    ].filter(Boolean).join('\n');
  }
  if (actionId === 'level5_enable') {
    const state = objectValue(payload.level5);
    const stateMachine = objectValue(payload.state_machine);
    const activation = String(state.activation_state || '');
    const activeForServices = state.service_enabled === true || stateMachine.service_can_operate_whole_computer === true;
    const effectiveCodexSandbox = String(state.effective_codex_sandbox || '');
    const fullAccessEffective = effectiveCodexSandbox === 'danger-full-access';
    const sandboxProofLine = activeForServices
      ? fullAccessEffective
        ? 'Effective Codex sandbox: danger-full-access.'
        : `Attention: effective Codex sandbox is ${effectiveCodexSandbox || 'unknown'}, so Level 5 is not full-access yet.`
      : '';
    return [
      ok ? 'Level 5 guardrails were configured.' : 'Level 5 setup did not complete.',
      activation ? `Activation state: ${activation}.` : '',
      activeForServices
        ? fullAccessEffective
          ? 'Whole-computer operator mode is active for Telegram and Spawner.'
          : 'Level 5 service restart is visible, but full access is blocked until the effective Codex sandbox is danger-full-access.'
        : 'Spark needs to reload Telegram and Spawner before whole-computer operator mode becomes active.',
      sandboxProofLine,
      nextLine(payload),
    ].filter(Boolean).join('\n');
  }
  if (actionId === 'level5_disable') {
    return [
      'Level 5 guardrails were disabled.',
      'Spark needs to reload Telegram and Spawner to return this runtime to workspace-sandbox mode.',
      nextLine(payload),
    ].filter(Boolean).join('\n');
  }
  return ok ? 'Spark access action finished.' : 'Spark access action failed.';
}

export function formatSparkAccessActionFailureReply(actionId: SparkAccessActionId, error: unknown): string {
  const detail = compactAccessActionFailureDetail(error);
  if (actionId === 'workspace_setup') {
    return [
      'Safe workspace setup could not complete.',
      'The Spark CLI may be unavailable, the workspace may not be writable, or local setup may be incomplete.',
      'Send /diagnose here, or ask the device holder to run `spark access setup --json` locally.',
      'Do not paste tokens, .env files, private keys, full logs, or secrets into chat.',
      detail ? `Redacted detail: ${detail}` : '',
    ].filter(Boolean).join('\n\n');
  }

  return [
    `${sparkAccessActionLabel(actionId)} could not complete.`,
    'Send /diagnose here, or ask the device holder to run the matching Spark command locally.',
    'Do not paste tokens, .env files, private keys, full logs, or secrets into chat.',
    detail ? `Redacted detail: ${detail}` : '',
  ].filter(Boolean).join('\n\n');
}

export function accessActionNeedsSparkRestart(actionId: SparkAccessActionId, payload: Record<string, unknown>): boolean {
  if (actionId !== 'level5_enable' && actionId !== 'level5_disable') return false;
  const level5 = objectValue(payload.level5);
  const stateMachine = objectValue(payload.state_machine);
  const activation = String(level5.activation_state || stateMachine.activation_state || '');
  const next = String(payload.next || '').trim().toLowerCase();
  return activation === 'restart_required' || stateMachine.requires_restart === true || next === 'spark restart';
}

export function formatSparkAccessAutomaticRestartNotice(actionId: SparkAccessActionId): string {
  const verifyPrompt = actionId === 'level5_disable' ? '/access' : '"is Level 5 active?"';
  return [
    'I will restart Spark automatically now so you do not need Terminal or PowerShell.',
    'Telegram may go quiet for about 30-60 seconds.',
    `When it comes back, send ${verifyPrompt} to verify the new access state.`,
  ].join('\n');
}

export function scheduleSparkRestartAfterAccessChange(delayMs = 2_000): void {
  const script = [
    "const { spawnSync } = require('node:child_process');",
    "const delay = Number(process.argv[1] || 2000);",
    "const os = require('os');",
    "const path = require('path');",
    "const sparkDefault = process.platform === 'win32' ? 'spark.cmd' : 'spark';",
    "const sparkLocal = path.join(os.homedir(), '.spark', 'bin', sparkDefault);",
    "const spark = require('fs').existsSync(sparkLocal) ? sparkLocal : sparkDefault;",
    "const run = (args) => spawnSync(spark, args, { stdio: 'ignore', shell: false, windowsHide: true });",
    "setTimeout(() => {",
    "  run(['restart', 'spawner-ui', '--allow-dirty-runtime']);",
    "  run(['restart', 'spark-telegram-bot', '--allow-dirty-runtime']);",
    "}, delay);",
  ].join('\n');
  const child = spawnHidden(process.execPath, ['-e', script, String(delayMs)], {
    detached: true,
    stdio: 'ignore',
    env: effectiveLevel5RuntimeEnv(process.env),
  });
  child.unref();
}

function accessSummary(payload: Record<string, unknown>): string {
  const effective = payload.effective_access_level;
  const recommended = objectValue(payload.recommended);
  const lane = String(recommended.id || '');
  return [
    effective ? `Effective access level: ${effective}.` : '',
    lane ? `Recommended lane: ${lane}.` : '',
  ].filter(Boolean).join(' ');
}

function nextLine(payload: Record<string, unknown>): string {
  const next = String(payload.next || '').trim();
  return next ? `Next: ${next}` : '';
}

function compactAccessActionFailureDetail(error: unknown): string {
  const raw = error instanceof Error ? error.message : String(error || 'unknown error');
  const detail = redactText(raw)
    .replace(/\b(token|secret|password|api[_ -]?key)\b\s*[:=]?\s*\S+/gi, '$1 [REDACTED]')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !/^at\s+/.test(line))
    .slice(0, 3)
    .join(' ');
  return detail.length > 360 ? `${detail.slice(0, 357)}...` : detail;
}

function objectValue(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' ? value as Record<string, unknown> : {};
}
