import { randomBytes } from 'node:crypto';
import type { ChildProcessWithoutNullStreams } from 'node:child_process';
import readline from 'node:readline';
import { spawnHidden } from './hiddenProcess';

export const BUILDER_WARM_PROTOCOL = 'spark.gateway.stdio.v2';

export interface BuilderBridgeParsedPayload {
  ok?: unknown;
  decision?: unknown;
  detail?: Record<string, unknown>;
}

export interface BuilderWarmBridgeOptions {
  command: string;
  args: string[];
  cwd: string;
  env: NodeJS.ProcessEnv;
  readyTimeoutMs: number;
  maxPending: number;
}

interface ActiveRequest {
  requestId: string;
  resolve: (payload: BuilderBridgeParsedPayload) => void;
  reject: (error: Error) => void;
  timer: NodeJS.Timeout;
}

let requestSequence = 0;

function safeError(code: string): Error {
  const normalized = /^[a-z0-9_]{1,64}$/.test(code) ? code : 'protocol_error';
  return new Error(`Builder warm bridge failed (${normalized}).`);
}

function unrefHandle(value: unknown): void {
  const handle = value as { unref?: () => void } | null | undefined;
  handle?.unref?.();
}

function refHandle(value: unknown): void {
  const handle = value as { ref?: () => void } | null | undefined;
  handle?.ref?.();
}

export class BuilderWarmBridgeClient {
  private readonly token = randomBytes(36).toString('base64url');
  private readonly child: ChildProcessWithoutNullStreams;
  private readonly lines: readline.Interface;
  private readonly readyPromise: Promise<void>;
  private resolveReady!: () => void;
  private rejectReady!: (error: Error) => void;
  private readySettled = false;
  private sessionId = '';
  private maxRequestBytes = 1024 * 1024;
  private active: ActiveRequest | null = null;
  private tail: Promise<void> = Promise.resolve();
  private pendingCount = 0;
  private closed = false;

  constructor(private readonly options: BuilderWarmBridgeOptions) {
    if (!Number.isInteger(options.maxPending) || options.maxPending < 1 || options.maxPending > 64) {
      throw new Error('Builder warm bridge maxPending must be between 1 and 64.');
    }
    this.readyPromise = new Promise<void>((resolve, reject) => {
      this.resolveReady = resolve;
      this.rejectReady = reject;
    });
    this.child = spawnHidden(options.command, options.args, {
      cwd: options.cwd,
      env: { ...options.env, SPARK_GATEWAY_STDIO_TOKEN: this.token },
      stdio: ['pipe', 'pipe', 'pipe'],
    }) as ChildProcessWithoutNullStreams;
    this.child.stdin.setDefaultEncoding('utf8');
    this.lines = readline.createInterface({ input: this.child.stdout });
    this.lines.on('line', (line) => this.handleLine(line));
    this.child.stderr.on('data', () => {
      // Drain Builder diagnostics without copying private runtime text into Telegram logs.
    });
    this.child.once('error', () => this.failAll(safeError('process_error')));
    this.child.once('exit', () => this.failAll(safeError('process_exited')));
  }

  get isClosed(): boolean {
    return this.closed;
  }

  async send(updatePayload: Record<string, unknown>, timeoutMs: number): Promise<BuilderBridgeParsedPayload> {
    if (this.closed) throw safeError('closed');
    if (this.pendingCount >= this.options.maxPending) throw safeError('busy');
    this.pendingCount += 1;
    const run = this.tail.then(() => this.perform(updatePayload, timeoutMs));
    this.tail = run.then(() => undefined, () => undefined);
    try {
      return await run;
    } finally {
      this.pendingCount -= 1;
      if (this.pendingCount === 0 && !this.closed) this.unrefHandles();
    }
  }

  close(): void {
    if (this.closed) return;
    const sessionId = this.sessionId;
    if (sessionId && this.child.stdin.writable) {
      const request = {
        protocol: BUILDER_WARM_PROTOCOL,
        command: 'shutdown',
        request_id: `telegram:bridge:shutdown:${Date.now()}`,
        session_id: sessionId,
        session_token: this.token,
      };
      this.child.stdin.write(`${JSON.stringify(request)}\n`);
    }
    this.closed = true;
    this.lines.close();
    this.child.stdin.end();
    if (this.active) {
      clearTimeout(this.active.timer);
      this.active.reject(safeError('closed'));
      this.active = null;
    }
    const killTimer = setTimeout(() => {
      if (this.child.exitCode === null && this.child.signalCode === null) this.child.kill();
    }, 250);
    unrefHandle(killTimer);
  }

  private async perform(
    updatePayload: Record<string, unknown>,
    timeoutMs: number
  ): Promise<BuilderBridgeParsedPayload> {
    this.refHandles();
    await this.waitUntilReady(Math.min(this.options.readyTimeoutMs, Math.max(1000, timeoutMs)));
    if (this.closed || !this.child.stdin.writable) throw safeError('not_writable');
    const requestId = `telegram:bridge:${Date.now()}:${++requestSequence}`;
    const request = {
      protocol: BUILDER_WARM_PROTOCOL,
      command: 'telegram_update',
      request_id: requestId,
      session_id: this.sessionId,
      session_token: this.token,
      update_payload: updatePayload,
    };
    const line = `${JSON.stringify(request)}\n`;
    if (Buffer.byteLength(line, 'utf8') > this.maxRequestBytes) throw safeError('request_too_large');

    return new Promise<BuilderBridgeParsedPayload>((resolve, reject) => {
      const timer = setTimeout(() => {
        if (this.active?.requestId === requestId) this.active = null;
        reject(safeError('timeout'));
        this.close();
      }, timeoutMs);
      unrefHandle(timer);
      this.active = { requestId, resolve, reject, timer };
      this.child.stdin.write(line, 'utf8', (error?: Error | null) => {
        if (!error) return;
        this.rejectActive(requestId, safeError('write_failed'));
        this.close();
      });
    });
  }

  private waitUntilReady(timeoutMs: number): Promise<void> {
    let timer: NodeJS.Timeout;
    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(safeError('ready_timeout')), timeoutMs);
      unrefHandle(timer);
    });
    return Promise.race([this.readyPromise, timeout]).finally(() => clearTimeout(timer));
  }

  private handleLine(line: string): void {
    if (Buffer.byteLength(line, 'utf8') > 1024 * 1024) {
      this.failAll(safeError('response_too_large'));
      return;
    }
    let payload: Record<string, unknown>;
    try {
      const parsed = JSON.parse(line) as unknown;
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('invalid');
      payload = parsed as Record<string, unknown>;
    } catch {
      this.failAll(safeError('invalid_json'));
      return;
    }
    if (payload.ready === true) {
      if (this.readySettled) {
        this.failAll(safeError('duplicate_handshake'));
        return;
      }
      const sessionId = String(payload.session_id || '');
      const maxBytes = Number(payload.max_request_bytes);
      if (
        payload.protocol !== BUILDER_WARM_PROTOCOL ||
        sessionId.length < 16 || sessionId.length > 128 ||
        !Number.isInteger(maxBytes) || maxBytes < 1024 || maxBytes > 4 * 1024 * 1024
      ) {
        this.failAll(safeError('invalid_handshake'));
        return;
      }
      this.sessionId = sessionId;
      this.maxRequestBytes = maxBytes;
      if (!this.readySettled) {
        this.readySettled = true;
        this.resolveReady();
      }
      return;
    }
    if (payload.protocol !== BUILDER_WARM_PROTOCOL || !this.active) {
      this.failAll(safeError('protocol_error'));
      return;
    }
    const requestId = String(payload.request_id || '');
    if (requestId !== this.active.requestId) {
      this.failAll(safeError('correlation_error'));
      return;
    }
    const active = this.active;
    this.active = null;
    clearTimeout(active.timer);
    const error = payload.error;
    if (error && typeof error === 'object' && !Array.isArray(error)) {
      active.reject(safeError(String((error as Record<string, unknown>).code || 'request_failed')));
      return;
    }
    active.resolve(payload as BuilderBridgeParsedPayload);
  }

  private rejectActive(requestId: string, error: Error): void {
    if (!this.active || this.active.requestId !== requestId) return;
    const active = this.active;
    this.active = null;
    clearTimeout(active.timer);
    active.reject(error);
  }

  private failAll(error: Error): void {
    if (!this.readySettled) {
      this.readySettled = true;
      this.rejectReady(error);
    }
    if (this.active) {
      const active = this.active;
      this.active = null;
      clearTimeout(active.timer);
      active.reject(error);
    }
    if (!this.closed) this.close();
  }

  private refHandles(): void {
    refHandle(this.child);
    refHandle(this.child.stdin);
    refHandle(this.child.stdout);
    refHandle(this.child.stderr);
  }

  private unrefHandles(): void {
    this.child.unref();
    unrefHandle(this.child.stdin);
    unrefHandle(this.child.stdout);
    unrefHandle(this.child.stderr);
  }
}
