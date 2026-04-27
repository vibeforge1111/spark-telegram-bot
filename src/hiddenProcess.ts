import { spawn, type SpawnOptions } from 'node:child_process';

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

export function spawnHidden(command: string, args: string[], options: SpawnOptions) {
  const spawnOptions = withHiddenWindows({ ...options, shell: false });
  if (process.platform === 'win32' && /\.(cmd|bat)$/i.test(command)) {
    return spawn(process.env.ComSpec || 'cmd.exe', windowsCmdShimArgs(command, args), spawnOptions);
  }
  return spawn(command, args, spawnOptions);
}
