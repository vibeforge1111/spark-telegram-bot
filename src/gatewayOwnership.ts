import { existsSync } from 'node:fs';
import { unlink } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import os from 'node:os';
import path from 'node:path';
import { readJsonFile, writeJsonAtomic } from './jsonState';

const HEARTBEAT_MS = 15_000;
const STALE_AFTER_MS = 45_000;

interface OwnershipLease {
  tokenHash: string;
  ownerId: string;
  pid: number;
  hostname: string;
  mode: 'auto' | 'polling' | 'webhook';
  webhookUrl: string | null;
  acquiredAt: string;
  updatedAt: string;
}

let leasePath: string | null = null;
let leaseHeartbeat: NodeJS.Timeout | null = null;
let activeLease: OwnershipLease | null = null;

function tokenHash(token: string): string {
  return createHash('sha256').update(token).digest('hex').slice(0, 16);
}

function leaseFilePath(token: string): string {
  return path.join(process.cwd(), `.spark-telegram-owner-lock-${tokenHash(token)}.json`);
}

function nowIso(): string {
  return new Date().toISOString();
}

function isProcessAlive(pid: number): boolean {
  if (!Number.isInteger(pid) || pid <= 0) {
    return false;
  }

  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

async function readLease(filePath: string): Promise<OwnershipLease | null> {
  if (!existsSync(filePath)) {
    return null;
  }

  try {
    return await readJsonFile<OwnershipLease>(filePath);
  } catch (error) {
    console.warn('[GatewayOwnership] Failed to read lease:', error);
    return null;
  }
}

async function writeLease(filePath: string, lease: OwnershipLease): Promise<void> {
  await writeJsonAtomic(filePath, lease);
}

async function heartbeat(): Promise<void> {
  if (!leasePath || !activeLease) {
    return;
  }

  activeLease.updatedAt = nowIso();
  try {
    await writeLease(leasePath, activeLease);
  } catch (error) {
    console.warn('[GatewayOwnership] Failed to refresh lease:', error);
  }
}

export async function acquireGatewayOwnership(input: {
  botToken: string;
  mode: 'auto' | 'polling' | 'webhook';
  webhookUrl?: string | null;
}): Promise<void> {
  const filePath = leaseFilePath(input.botToken);
  const existing = await readLease(filePath);
  const now = Date.now();

  if (existing) {
    const updatedAt = Date.parse(existing.updatedAt);
    const stale = !Number.isFinite(updatedAt) || now - updatedAt > STALE_AFTER_MS;
    const sameOwner =
      existing.pid === process.pid &&
      existing.hostname === os.hostname();

    if (!sameOwner && !stale) {
      const alive = existing.hostname !== os.hostname() || isProcessAlive(existing.pid);
      if (alive) {
        throw new Error(
          `Gateway ownership already held by ${existing.ownerId} on ${existing.hostname} (pid ${existing.pid}). Stop that instance or wait for lease expiry.`
        );
      }
    }
  }

  activeLease = {
    tokenHash: tokenHash(input.botToken),
    ownerId: `${os.hostname()}:${process.pid}`,
    pid: process.pid,
    hostname: os.hostname(),
    mode: input.mode,
    webhookUrl: input.webhookUrl || null,
    acquiredAt: nowIso(),
    updatedAt: nowIso()
  };
  leasePath = filePath;

  await writeLease(filePath, activeLease);

  if (!leaseHeartbeat) {
    leaseHeartbeat = setInterval(() => {
      void heartbeat();
    }, HEARTBEAT_MS);
    leaseHeartbeat.unref();
  }
}

export async function releaseGatewayOwnership(): Promise<void> {
  if (leaseHeartbeat) {
    clearInterval(leaseHeartbeat);
    leaseHeartbeat = null;
  }

  if (leasePath && existsSync(leasePath)) {
    try {
      await unlink(leasePath);
    } catch (error) {
      console.warn('[GatewayOwnership] Failed to remove lease:', error);
    }
  }

  activeLease = null;
  leasePath = null;
}
