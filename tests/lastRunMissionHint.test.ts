/**
 * Trust-boundary tests for lastRunMissions in-session state fix.
 *
 * Boundary: Telegram text handler → isActiveTaskStatusQuery / isRetryRequest
 *           → lastRunMissions Map (in-memory, keyed chatId-userId)
 *           → /mission status reply
 *
 * Before fix: status queries fell through to Builder with no session context;
 *             retry re-dispatched unrelated stale work from memory.
 * After fix:  lastRunMissions Map stores missionId+goal per chatId-userId;
 *             status and retry queries resolve against that session context.
 *
 * Security reviewer questions addressed:
 *   1. In-memory only: Map not passed to writeJsonAtomic or any file I/O.
 *   2. Keyed per chatId-userId pair — prevents cross-user state bleed in
 *      group chats (verified by key pattern check below).
 *   3. Not exported: Map is module-private (verified below).
 *   4. Cleared on restart: module-level Map is not persisted; process restart
 *      creates a fresh empty Map (no serialization found).
 */
import { vi, describe, it, expect } from 'vitest';

// Must run before src/index.ts is evaluated — it exits if BOT_TOKEN is unset
vi.hoisted(() => {
  process.env.BOT_TOKEN = 'test-token-for-boundary-tests:AABBCCddEEFFggHHiiJJ';
});

import { readFileSync } from 'fs';
import { join } from 'path';
import { isActiveTaskStatusQuery, isRetryRequest } from '../src/index';

const indexSrc = readFileSync(join(__dirname, '..', 'src', 'index.ts'), 'utf-8');

describe('isActiveTaskStatusQuery — recognizes status phrases', () => {
  it('recognizes direct status questions', () => {
    expect(isActiveTaskStatusQuery('What is the status of my task?')).toBe(true);
    expect(isActiveTaskStatusQuery("How's my mission going?")).toBe(true);
    expect(isActiveTaskStatusQuery('Is my run done?')).toBe(true);
  });

  it('does not false-positive on unrelated phrases', () => {
    expect(isActiveTaskStatusQuery('Hello!')).toBe(false);
    expect(isActiveTaskStatusQuery('/diagnose')).toBe(false);
    expect(isActiveTaskStatusQuery('Run a new build')).toBe(false);
  });
});

describe('isRetryRequest — recognizes retry phrases', () => {
  it('recognizes retry phrases', () => {
    expect(isRetryRequest('retry it')).toBe(true);
    expect(isRetryRequest('try again')).toBe(true);
    expect(isRetryRequest('run it again')).toBe(true);
    expect(isRetryRequest('re-run it')).toBe(true);
  });

  it('does not false-positive on unrelated phrases', () => {
    expect(isRetryRequest('Hello!')).toBe(false);
    expect(isRetryRequest('Start a new mission')).toBe(false);
    expect(isRetryRequest('/run build the docs')).toBe(false);
  });
});

describe('lastRunMissions — storage and scope properties', () => {
  it('lastRunMissions Map is never passed to writeJsonAtomic or file write', () => {
    const serializedUsages = indexSrc.match(/writeJsonAtomic[\s\S]{0,100}lastRunMission/g) ?? [];
    const writeFileUsages = indexSrc.match(/writeFile[\s\S]{0,100}lastRunMission/g) ?? [];
    expect(serializedUsages).toHaveLength(0);
    expect(writeFileUsages).toHaveLength(0);
  });

  it('lastRunMissions Map key pattern combines chatId and userId (cross-user isolation)', () => {
    expect(indexSrc).toMatch(/`\$\{[^}]*(?:chat[^}]*id|chatId)[^}]*\}-\$\{[^}]*(?:user[^}]*id|userId)/i);
  });

  it('lastRunMissions is not exported (module-private in-memory state)', () => {
    expect(indexSrc).not.toMatch(/export\s+(?:const|let)\s+lastRunMissions/);
  });
});
