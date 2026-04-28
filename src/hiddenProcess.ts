import { spawn, type SpawnOptions } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';

export function quoteWindowsArg(value: string): string {
  if (/^[A-Za-z0-9._:/\\@+=,-]+$/.test(value)) return value;
  return `"${value.replace(/"/g, '\\"')}"`;
}

export function withHiddenWindows<T extends object>(options: T): T & { windowsHide: true } {
  return { ...options, windowsHide: true };
}

export function windowsCmdShimArgs(command: string, args: string[]): string[] {
  return ['/d', '/s', '/c', [quoteWindowsArg(command), ...args.map(quoteWindowsArg)].join(' ')];
}

export function windowsPowerShellShimArgs(command: string, args: string[]): string[] {
  return ['-NoLogo', '-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', command, ...args];
}

export function resolveWindowsCommand(command: string, env: NodeJS.ProcessEnv = process.env): string {
  if (process.platform !== 'win32') return command;
  if (/[\\/]/.test(command)) return command;
  const pathValue = env.PATH || env.Path || env.path || '';
  const pathExtValue = env.PATHEXT || env.PathExt || env.pathext || '.COM;.EXE;.BAT;.CMD';
  const hasExtension = /\.[A-Za-z0-9]+$/.test(command);
  const extensions = hasExtension
    ? ['']
    : ['.PS1', ...pathExtValue.split(';').filter((ext) => ext && ext.toUpperCase() !== '.PS1')];
  for (const dir of pathValue.split(path.delimiter)) {
    if (!dir) continue;
    for (const ext of extensions) {
      const candidate = path.join(dir, `${command}${ext}`);
      if (existsSync(candidate)) return candidate;
    }
  }
  return command;
}

export function spawnHidden(command: string, args: string[], options: SpawnOptions) {
  const spawnOptions = withHiddenWindows({ ...options, shell: false });
  const resolvedCommand = resolveWindowsCommand(command, spawnOptions.env as NodeJS.ProcessEnv | undefined);
  if (process.platform === 'win32' && /\.ps1$/i.test(resolvedCommand)) {
    return spawn('powershell.exe', windowsPowerShellShimArgs(resolvedCommand, args), spawnOptions);
  }
  if (process.platform === 'win32' && /\.(cmd|bat)$/i.test(resolvedCommand)) {
    return spawn(process.env.ComSpec || 'cmd.exe', windowsCmdShimArgs(resolvedCommand, args), spawnOptions);
  }
  return spawn(resolvedCommand, args, spawnOptions);
}
