import type { IncomingHttpHeaders } from 'node:http';
import { relaySecretMatches } from './launchMode';

export interface RelayHealthDetailPayload extends Record<string, unknown> {
  ok: boolean;
  service: 'spark-telegram-bot';
  relay?: unknown;
  pid?: number;
  build?: unknown;
  runtime?: Record<string, unknown>;
}

export interface RelayHealthResponse {
  status: 200 | 503;
  payload: RelayHealthDetailPayload;
}

export function protectRelayHealthPayload(
  fullPayload: RelayHealthDetailPayload,
  suppliedSecret: IncomingHttpHeaders['x-spark-telegram-relay-secret'],
  expectedSecret: string
): RelayHealthResponse {
  const payload = relaySecretMatches(suppliedSecret, expectedSecret)
    ? fullPayload
    : { ok: fullPayload.ok, service: fullPayload.service };
  return { status: fullPayload.ok ? 200 : 503, payload };
}
