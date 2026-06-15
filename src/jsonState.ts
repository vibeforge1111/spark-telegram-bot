import { existsSync } from 'node:fs';
import { mkdir, readFile } from 'node:fs/promises';
import { DatabaseSync } from 'node:sqlite';
import path from 'node:path';

let db: DatabaseSync | null = null;
let shutdownHandlerRegistered = false;

function dbPath(): string {
  return resolveStatePath('.spark-gateway-state.db');
}

/**
 * Close the database singleton and run WAL checkpoint for safe shutdown.
 */
export function closeDbGracefully(): void {
  if (!db) return;
  try {
    // Checkpoint WAL into the main database file before closing
    db.exec('PRAGMA wal_checkpoint(TRUNCATE)');
  } catch {
    // Best-effort checkpoint; proceed to close regardless
  }
  try {
    db.close();
  } finally {
    db = null;
  }
}

function registerShutdownHandler(): void {
  if (shutdownHandlerRegistered) return;
  shutdownHandlerRegistered = true;

  const shutdown = (signal: string) => {
    closeDbGracefully();
    process.exit(0);
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

async function ensureDb(): Promise<DatabaseSync> {
  if (db) {
    return db;
  }

  await mkdir(path.dirname(dbPath()), { recursive: true });
  db = new DatabaseSync(dbPath());
  db.exec(`
    PRAGMA busy_timeout = 5000;
    PRAGMA journal_mode = WAL;
    CREATE TABLE IF NOT EXISTS gateway_state (
      state_key TEXT PRIMARY KEY,
      json_value TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
  `);
  registerShutdownHandler();
  return db;
}

export async function readJsonFile<T>(filePath: string): Promise<T | null> {
  try {
    const stateDb = await ensureDb();
    const row = stateDb
      .prepare('SELECT json_value FROM gateway_state WHERE state_key = ?')
      .get(filePath) as { json_value?: string } | undefined;
    if (row?.json_value) {
      return JSON.parse(row.json_value) as T;
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
  return path.join(stateDir || process.cwd(), filename);
}

export function resetJsonStateForTests(): void {
  if (!db) return;
  try {
    db.close();
  } finally {
    db = null;
  }
}
