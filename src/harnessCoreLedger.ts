import { appendFileSync, existsSync, mkdirSync, readFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  recordHarnessCoreToolLedger,
  type HarnessCoreAuthorizationBundle,
  type ToolCallLedgerV1
} from './harnessCoreVNext';

const BOT_STATE_DIR = path.join(os.homedir(), '.spark', 'state', 'spark-telegram-bot');

export function harnessCoreToolLedgerPath(env: NodeJS.ProcessEnv = process.env): string {
  const explicitPath = env.SPARK_HARNESS_CORE_LEDGER_PATH?.trim();
  if (explicitPath) return explicitPath;

  const stateDir = env.SPARK_GATEWAY_STATE_DIR?.trim() || BOT_STATE_DIR;
  return path.join(stateDir, '.spark-harness-core-tool-ledger.jsonl');
}

export function shouldWriteHarnessCoreLedger(env: NodeJS.ProcessEnv = process.env): boolean {
  return env.SPARK_HARNESS_CORE_LEDGER !== '0';
}

export function appendHarnessCoreToolLedgerRecord(
  record: ToolCallLedgerV1,
  filePath = harnessCoreToolLedgerPath()
): void {
  mkdirSync(path.dirname(filePath), { recursive: true });
  appendFileSync(filePath, `${JSON.stringify(record)}\n`, 'utf-8');
}

export function recordHarnessCoreAuthorizationLedger(input: {
  bundle: HarnessCoreAuthorizationBundle;
  toolName: string;
  allowed: boolean;
  env?: NodeJS.ProcessEnv;
}): ToolCallLedgerV1 {
  const summary = input.allowed
    ? 'Telegram action passed Harness Core authorization and is ready for owner execution.'
    : `Telegram action did not execute: ${input.bundle.authorization.reasons.join(', ')}`;
  const ledger = recordHarnessCoreToolLedger({
    envelope: input.bundle.envelope,
    action: input.bundle.action,
    authorization: input.bundle.authorization,
    toolName: input.toolName,
    status: 'not_started',
    summary
  });
  if (shouldWriteHarnessCoreLedger(input.env)) {
    appendHarnessCoreToolLedgerRecord(ledger, harnessCoreToolLedgerPath(input.env));
  }
  return ledger;
}

export function recordHarnessCoreExecutionLedger(input: {
  bundle: HarnessCoreAuthorizationBundle;
  toolName: string;
  status: ToolCallLedgerV1['result']['status'];
  summary: string;
  env?: NodeJS.ProcessEnv;
}): ToolCallLedgerV1 {
  const ledger = recordHarnessCoreToolLedger({
    envelope: input.bundle.envelope,
    action: input.bundle.action,
    authorization: input.bundle.authorization,
    toolName: input.toolName,
    status: input.status,
    summary: input.summary
  });
  if (shouldWriteHarnessCoreLedger(input.env)) {
    appendHarnessCoreToolLedgerRecord(ledger, harnessCoreToolLedgerPath(input.env));
  }
  return ledger;
}

export function parseHarnessCoreToolLedger(jsonl: string): ToolCallLedgerV1[] {
  return jsonl
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => JSON.parse(line) as ToolCallLedgerV1);
}

export function readHarnessCoreToolLedger(filePath = harnessCoreToolLedgerPath()): ToolCallLedgerV1[] {
  if (!existsSync(filePath)) return [];
  return parseHarnessCoreToolLedger(readFileSync(filePath, 'utf-8'));
}
