import { appendFileSync, mkdirSync } from 'node:fs';
import { appendFile, mkdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import {
  type NaturalRouteDecision,
  type NaturalRouteOwnerSystem
} from './naturalRouteDecision';
import { resolveStatePath } from './jsonState';
import { naturalRouteExecutionOutcome } from './naturalRouteTelemetry';
import { redactIdentifier } from './redaction';

export type NaturalRouteExecutionDelivery = 'selected' | 'delivered' | 'failed' | 'unknown';

export interface NaturalRouteExecutionRecord {
  schema_version: 'spark.nlp.route_execution.v1';
  recorded_at: string;
  profile: string;
  user_id: string;
  chat_id: string;
  chat_type: string;
  admin: boolean;
  shadow_route: string;
  shadow_owner: NaturalRouteOwnerSystem;
  shadow_confidence: string;
  shadow_context_source: string;
  shadow_requires_confirmation: boolean;
  shadow_signals: string[];
  shadow_blocked_by: string[];
  executed_route: string;
  executed_owner: NaturalRouteOwnerSystem;
  executed_action: string;
  outcome: 'matched' | 'mismatch';
  delivery: NaturalRouteExecutionDelivery;
}

export interface NaturalRouteExecutionRecordInput {
  decision: NaturalRouteDecision;
  profile?: string | null;
  userId?: string | number | null;
  chatId?: string | number | null;
  chatType?: string | null;
  admin?: boolean;
  executedRoute: string;
  executedOwner: NaturalRouteOwnerSystem;
  executedAction: string;
  delivery?: NaturalRouteExecutionDelivery;
  now?: Date;
}

export interface NaturalRouteLedgerSummary {
  total: number;
  matched: number;
  mismatch: number;
  byExecutedRoute: Record<string, number>;
  mismatchesByPair: Record<string, number>;
}

function safeScalar(value: string | number | boolean | null | undefined, fallback = 'unknown'): string {
  const text = String(value ?? '').trim();
  return text ? text.replace(/\s+/g, '_') : fallback;
}

function safeList(values: string[]): string[] {
  return values.map((value) => safeScalar(value)).filter(Boolean);
}

export function naturalRouteLedgerPath(env: NodeJS.ProcessEnv = process.env): string {
  return env.SPARK_NATURAL_ROUTE_LEDGER_PATH?.trim() || resolveStatePath('.spark-natural-route-execution.jsonl');
}

export function shouldWriteNaturalRouteLedger(env: NodeJS.ProcessEnv = process.env): boolean {
  const mode = env.SPARK_NATURAL_ROUTE_LEDGER?.trim();
  if (mode === '0') return false;
  if (mode === '1') return true;
  if (env.SPARK_BOT_TEST_MODE === '1' && !env.SPARK_NATURAL_ROUTE_LEDGER_PATH?.trim()) return false;
  return true;
}

export function shouldWriteNaturalRouteLedgerSynchronously(env: NodeJS.ProcessEnv = process.env): boolean {
  if (env.SPARK_NATURAL_ROUTE_LEDGER_STRICT === '1') return true;
  return env.SPARK_BOT_TEST_MODE === '1' && Boolean(env.SPARK_NATURAL_ROUTE_LEDGER_PATH?.trim());
}

export function createNaturalRouteExecutionRecord(input: NaturalRouteExecutionRecordInput): NaturalRouteExecutionRecord {
  return {
    schema_version: 'spark.nlp.route_execution.v1',
    recorded_at: (input.now || new Date()).toISOString(),
    profile: safeScalar(input.profile),
    user_id: redactIdentifier(input.userId, 'user'),
    chat_id: redactIdentifier(input.chatId, 'chat'),
    chat_type: safeScalar(input.chatType),
    admin: Boolean(input.admin),
    shadow_route: safeScalar(input.decision.route),
    shadow_owner: input.decision.owner_system,
    shadow_confidence: safeScalar(input.decision.confidence),
    shadow_context_source: safeScalar(input.decision.context_source),
    shadow_requires_confirmation: Boolean(input.decision.requires_confirmation),
    shadow_signals: safeList(input.decision.matched_signals),
    shadow_blocked_by: safeList(input.decision.blocked_by),
    executed_route: safeScalar(input.executedRoute),
    executed_owner: input.executedOwner,
    executed_action: safeScalar(input.executedAction),
    outcome: naturalRouteExecutionOutcome(input.decision, input.executedRoute),
    delivery: input.delivery || 'selected'
  };
}

export function serializeNaturalRouteExecutionRecord(record: NaturalRouteExecutionRecord): string {
  return JSON.stringify(record);
}

export async function appendNaturalRouteExecutionRecord(
  record: NaturalRouteExecutionRecord,
  filePath = naturalRouteLedgerPath()
): Promise<void> {
  await mkdir(path.dirname(filePath), { recursive: true });
  await appendFile(filePath, `${serializeNaturalRouteExecutionRecord(record)}\n`, 'utf-8');
}

export function appendNaturalRouteExecutionRecordSync(
  record: NaturalRouteExecutionRecord,
  filePath = naturalRouteLedgerPath()
): void {
  mkdirSync(path.dirname(filePath), { recursive: true });
  appendFileSync(filePath, `${serializeNaturalRouteExecutionRecord(record)}\n`, 'utf-8');
}

export function parseNaturalRouteExecutionLedger(jsonl: string): NaturalRouteExecutionRecord[] {
  return jsonl
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => JSON.parse(line) as NaturalRouteExecutionRecord);
}

export async function readNaturalRouteExecutionLedger(filePath = naturalRouteLedgerPath()): Promise<NaturalRouteExecutionRecord[]> {
  const raw = await readFile(filePath, 'utf-8').catch(() => '');
  return parseNaturalRouteExecutionLedger(raw);
}

export function summarizeNaturalRouteExecutionRecords(records: NaturalRouteExecutionRecord[]): NaturalRouteLedgerSummary {
  const summary: NaturalRouteLedgerSummary = {
    total: records.length,
    matched: 0,
    mismatch: 0,
    byExecutedRoute: {},
    mismatchesByPair: {}
  };

  for (const record of records) {
    if (record.outcome === 'matched') summary.matched += 1;
    if (record.outcome === 'mismatch') {
      summary.mismatch += 1;
      const pair = `${record.shadow_route}->${record.executed_route}`;
      summary.mismatchesByPair[pair] = (summary.mismatchesByPair[pair] || 0) + 1;
    }
    summary.byExecutedRoute[record.executed_route] = (summary.byExecutedRoute[record.executed_route] || 0) + 1;
  }

  return summary;
}

export function formatNaturalRouteLedgerSummary(summary: NaturalRouteLedgerSummary): string {
  const lines = [
    `Natural route ledger: ${summary.total} records, ${summary.matched} matched, ${summary.mismatch} mismatched.`
  ];

  const executedRoutes = Object.entries(summary.byExecutedRoute)
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  if (executedRoutes.length > 0) {
    lines.push('', 'Executed routes:');
    for (const [route, count] of executedRoutes) {
      lines.push(`- ${route}: ${count}`);
    }
  }

  const mismatches = Object.entries(summary.mismatchesByPair)
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  if (mismatches.length > 0) {
    lines.push('', 'Mismatches:');
    for (const [pair, count] of mismatches) {
      lines.push(`- ${pair}: ${count}`);
    }
  }

  return lines.join('\n');
}
