import { existsSync } from 'node:fs';
import { mkdir, readFile } from 'node:fs/promises';
import { DatabaseSync } from 'node:sqlite';
import path from 'node:path';

const DEFAULT_GATEWAY_STATE_DB_MAX_AGE_MS = 24 * 60 * 60 * 1000;
const TRUTHY_ENV_VALUES = new Set(['1', 'true', 'yes', 'on']);

let db: DatabaseSync | null = null;
let dbInitPromise: Promise<DatabaseSync> | null = null;
let dbClosePromise: Promise<void> | null = null;
const warnedStaleStateRows = new Set<string>();

function dbPath(): string {
  return resolveStatePath('.spark-gateway-state.db');
}

async function ensureDb(): Promise<DatabaseSync> {
  if (dbClosePromise) {
    await dbClosePromise;
  }
  if (db) {
    return db;
  }
  if (dbInitPromise) {
    return dbInitPromise;
  }

  dbInitPromise = (async () => {
    await mkdir(path.dirname(dbPath()), { recursive: true });
    const instance = new DatabaseSync(dbPath());
    try {
      instance.exec(`
        PRAGMA busy_timeout = 5000;
        PRAGMA journal_mode = WAL;
        CREATE TABLE IF NOT EXISTS gateway_state (
          state_key TEXT PRIMARY KEY,
          json_value TEXT NOT NULL,
          updated_at TEXT NOT NULL
        );
      `);
    } catch (error) {
      instance.close();
      throw error;
    }
    db = instance;
    return instance;
  })().catch((error) => {
    dbInitPromise = null;
    throw error;
  });
  return dbInitPromise;
}

export async function readJsonFile<T>(filePath: string): Promise<T | null> {
  try {
    const stateDb = await ensureDb();
    const row = stateDb
      .prepare('SELECT json_value, updated_at FROM gateway_state WHERE state_key = ?')
      .get(filePath) as { json_value?: string; updated_at?: string } | undefined;
    if (row?.json_value) {
      const fresh = isGatewayStateDbRowFresh(row.updated_at);
      const staleFallbackAllowed = gatewayStateDbAllowsStaleFallback();
      if (fresh || staleFallbackAllowed) {
        if (!fresh) {
          warnStaleGatewayStateDbRow(filePath, row.updated_at, 'Using');
        }
        return JSON.parse(row.json_value) as T;
      }
      warnStaleGatewayStateDbRow(filePath, row.updated_at, 'Ignoring');
    }

    if (!existsSync(filePath)) {
      return null;
    }

    const raw = await readFile(filePath, 'utf-8');
    const parsed = JSON.parse(raw) as T;
    await writeJsonAtomic(filePath, parsed);
    return parsed;
  } catch {
    return null;
  }
}

export async function writeJsonAtomic(filePath: string, value: unknown): Promise<void> {
  const stateDb = await ensureDb();
  const payload = JSON.stringify(value, null, 2);
  stateDb
    .prepare(`
      INSERT INTO gateway_state (state_key, json_value, updated_at)
      VALUES (?, ?, ?)
      ON CONFLICT(state_key) DO UPDATE SET
        json_value = excluded.json_value,
        updated_at = excluded.updated_at
    `)
    .run(filePath, payload, new Date().toISOString());
}

export function resolveStatePath(filename: string): string {
  const stateDir = process.env.SPARK_GATEWAY_STATE_DIR?.trim();
  const trimmed = filename.trim();
  const singlePosixSegment = path.posix.basename(trimmed) === trimmed;
  const singleWindowsSegment = path.win32.basename(trimmed) === trimmed;
  if (
    !trimmed ||
    trimmed === '.' ||
    trimmed === '..' ||
    trimmed.includes('\0') ||
    path.posix.isAbsolute(trimmed) ||
    path.win32.isAbsolute(trimmed) ||
    !singlePosixSegment ||
    !singleWindowsSegment
  ) {
    throw new Error('Invalid state filename; expected one local filename segment.');
  }
  return path.join(path.resolve(stateDir || process.cwd()), trimmed);
}

export function closeJsonState(): Promise<void> {
  if (dbClosePromise) {
    return dbClosePromise;
  }

  const initializedDb = db;
  const pendingInit = dbInitPromise;
  db = null;
  dbInitPromise = null;
  dbClosePromise = (async () => {
    let instance = initializedDb;
    if (!instance && pendingInit) {
      try {
        instance = await pendingInit;
      } catch {
        return;
      }
    }
    if (!instance) return;
    if (db === instance) {
      db = null;
    }
    try {
      instance.exec('PRAGMA wal_checkpoint(TRUNCATE)');
    } catch {
      // The checkpoint is best-effort; closing the handle remains required.
    }
    try {
      instance.close();
    } catch {
      // Shutdown cleanup is idempotent and best-effort.
    }
  })().finally(() => {
    dbClosePromise = null;
  });
  return dbClosePromise;
}

export function resetJsonStateForTests(): void {
  warnedStaleStateRows.clear();
  const instance = db;
  db = null;
  dbInitPromise = null;
  if (!instance) return;
  try {
    instance.close();
  } catch {
    // A test reset is best-effort after the singleton references are cleared.
  }
}

function gatewayStateDbAllowsStaleFallback(): boolean {
  return TRUTHY_ENV_VALUES.has(
    (process.env.SPARK_GATEWAY_STATE_DB_ALLOW_STALE_FALLBACK || '').trim().toLowerCase()
  );
}

function gatewayStateDbMaxAgeMs(): number {
  const rawHours = process.env.SPARK_GATEWAY_STATE_DB_MAX_AGE_HOURS?.trim();
  if (!rawHours) {
    return DEFAULT_GATEWAY_STATE_DB_MAX_AGE_MS;
  }

  const hours = Number(rawHours);
  if (!Number.isFinite(hours) || hours <= 0) {
    return DEFAULT_GATEWAY_STATE_DB_MAX_AGE_MS;
  }
  return hours * 60 * 60 * 1000;
}

function isGatewayStateDbRowFresh(updatedAt: string | undefined): boolean {
  if (!updatedAt) return false;
  const updatedAtMs = Date.parse(updatedAt);
  if (!Number.isFinite(updatedAtMs)) return false;
  return Date.now() - updatedAtMs <= gatewayStateDbMaxAgeMs();
}

function warnStaleGatewayStateDbRow(
  filePath: string,
  updatedAt: string | undefined,
  action: 'Ignoring' | 'Using'
): void {
  const stateFileName = path.basename(filePath) || 'gateway state file';
  const warningKey = `${action}:${stateFileName}:${updatedAt || 'missing'}`;
  if (warnedStaleStateRows.has(warningKey)) return;

  warnedStaleStateRows.add(warningKey);
  console.warn(
    `[json-state] ${action} stale gateway DB row for ${stateFileName} ` +
      `(updated_at=${updatedAt || 'missing'}). ` +
      'Set SPARK_GATEWAY_STATE_DB_ALLOW_STALE_FALLBACK=1 to allow explicit cold-start fallback.'
  );
}
