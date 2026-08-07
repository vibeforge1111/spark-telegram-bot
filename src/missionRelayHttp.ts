import type { IncomingMessage, ServerResponse } from 'node:http';

export const RELAY_MAX_BODY_BYTES = 64 * 1024;
const RELAY_RATE_LIMIT_WINDOW_MS = 60_000;
const RELAY_RATE_LIMIT_MAX_REQUESTS = 240;
const RELAY_RATE_LIMIT_MAX_ENTRIES = 500;
const relayRateLimits = new Map<string, { startedAt: number; count: number }>();

export type RelayBodyOutcome<T> =
  | { kind: 'ok'; payload: T }
  | { kind: 'too_large' }
  | { kind: 'timeout' }
  | { kind: 'invalid' };

export function readRelayJsonBody<T>(req: IncomingMessage, timeoutMs = 10_000): Promise<RelayBodyOutcome<T>> {
  return new Promise((resolve) => {
    const chunks: Buffer[] = [];
    let size = 0;
    let settled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const settle = (outcome: RelayBodyOutcome<T>): void => {
      if (settled) return;
      settled = true;
      if (timer) clearTimeout(timer);
      resolve(outcome);
    };
    timer = setTimeout(() => {
      settle({ kind: 'timeout' });
      req.destroy();
    }, timeoutMs);
    timer.unref?.();
    req.on('data', (chunk: Buffer) => {
      size += chunk.length;
      if (size > RELAY_MAX_BODY_BYTES) {
        settle({ kind: 'too_large' });
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => {
      try {
        settle({ kind: 'ok', payload: JSON.parse(Buffer.concat(chunks).toString('utf-8')) as T });
      } catch {
        settle({ kind: 'invalid' });
      }
    });
    req.on('error', () => settle({ kind: 'invalid' }));
  });
}

export function writeJson(res: ServerResponse, statusCode: number, body: Record<string, unknown>): void {
  res.statusCode = statusCode;
  res.setHeader('Content-Type', 'application/json');
  res.end(JSON.stringify(body));
}

export function pruneRelayRateLimitEntries(
  entries: Map<string, { startedAt: number; count: number }>,
  now = Date.now(),
  maxEntries = RELAY_RATE_LIMIT_MAX_ENTRIES
): void {
  for (const [key, value] of entries) {
    if (now - value.startedAt >= RELAY_RATE_LIMIT_WINDOW_MS) entries.delete(key);
  }
  while (entries.size >= maxEntries) {
    const oldest = entries.keys().next().value;
    if (oldest === undefined) break;
    entries.delete(oldest);
  }
}

export function isRelayRateLimited(req: IncomingMessage, now = Date.now()): boolean {
  const key = req.socket.remoteAddress || 'unknown';
  const existing = relayRateLimits.get(key);
  if (!existing || now - existing.startedAt >= RELAY_RATE_LIMIT_WINDOW_MS) {
    pruneRelayRateLimitEntries(relayRateLimits, now);
    relayRateLimits.set(key, { startedAt: now, count: 1 });
    return false;
  }
  existing.count += 1;
  return existing.count > RELAY_RATE_LIMIT_MAX_REQUESTS;
}
