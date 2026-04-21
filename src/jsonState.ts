import { mkdir, rename } from 'node:fs/promises';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

export async function readJsonFile<T>(filePath: string): Promise<T | null> {
  try {
    const raw = await readFile(filePath, 'utf-8');
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

export async function writeJsonAtomic(filePath: string, value: unknown): Promise<void> {
  const tempPath = `${filePath}.${process.pid}.tmp`;
  const payload = JSON.stringify(value, null, 2);
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(tempPath, payload, 'utf-8');
  await rename(tempPath, filePath);
}

export function resolveStatePath(filename: string): string {
  const stateDir = process.env.SPARK_GATEWAY_STATE_DIR?.trim();
  return path.join(stateDir || process.cwd(), filename);
}
