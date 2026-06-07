import { readFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

export type TraceRepairSummary = {
  present: boolean;
  rowCount: number;
  traceGroupCount: number;
  missingTraceRefCount: number;
  highSeverityOpenCount: number;
  orphanParentEventIdCount: number;
  healthFlags: string[];
  recentWindows: Array<{
    window: string;
    rowCount: number;
    missingTraceRefCount: number;
    missingTraceRefRatio: number;
  }>;
  topMissingSources: Array<{
    component: string;
    eventType: string;
    status: string;
    severity: string;
    eventCount: number;
  }>;
  spawnerRequestIdCount: number;
  spawnerDerivedTraceRefCount: number;
  spawnerBuilderRequestOverlapCount: number;
  spawnerBuilderTraceRefOverlapCount: number;
  telegramFinalAnswerTraceJoinStatus: string;
  error?: string;
};

function objectValue(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function arrayValue(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function stringValue(value: unknown): string {
  return String(value || '').trim();
}

function numberValue(value: unknown): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

export function resolveTraceIndexPath(env: NodeJS.ProcessEnv = process.env): string {
  const configured = env.SPARK_SYSTEM_MAP_DIR || env.SPARK_OS_SYSTEM_MAP_DIR;
  const root = configured && configured.trim()
    ? configured.trim()
    : path.join(os.homedir(), '.spark', 'state', 'system-map');
  return path.join(root, 'trace-index.json');
}

export function summarizeTraceRepair(payload: unknown): TraceRepairSummary {
  const root = objectValue(payload);
  const health = objectValue(root.builder_trace_health);
  const missingSources = objectValue(health.missing_trace_ref_sources);
  const spawner = objectValue(root.spawner_prd_auto_trace_samples);
  const spawnerJoin = objectValue(spawner.join_keys);
  const spawnerRequestOverlap = objectValue(spawner.builder_request_overlap);
  const spawnerTraceOverlap = objectValue(spawner.builder_trace_ref_overlap);
  const telegramGate = objectValue(root.telegram_final_answer_gate_samples);
  const telegramJoin = objectValue(telegramGate.trace_join);

  return {
    present: Object.keys(health).length > 0,
    rowCount: numberValue(health.row_count),
    traceGroupCount: numberValue(health.trace_group_count),
    missingTraceRefCount: numberValue(health.missing_trace_ref_count),
    highSeverityOpenCount: numberValue(health.high_severity_open_count),
    orphanParentEventIdCount: numberValue(health.orphan_parent_event_id_count),
    healthFlags: arrayValue(health.health_flags).map(stringValue).filter(Boolean).slice(0, 5),
    recentWindows: arrayValue(health.recent_windows).map(objectValue).slice(0, 3).map((window) => ({
      window: stringValue(window.window) || 'unknown',
      rowCount: numberValue(window.row_count),
      missingTraceRefCount: numberValue(window.missing_trace_ref_count),
      missingTraceRefRatio: numberValue(window.missing_trace_ref_ratio)
    })),
    topMissingSources: arrayValue(missingSources.rows).map(objectValue).slice(0, 3).map((row) => ({
      component: stringValue(row.component) || 'unknown',
      eventType: stringValue(row.event_type) || 'unknown',
      status: stringValue(row.status) || 'unknown',
      severity: stringValue(row.severity) || 'unknown',
      eventCount: numberValue(row.event_count)
    })),
    spawnerRequestIdCount: numberValue(spawnerJoin.request_id_count),
    spawnerDerivedTraceRefCount: numberValue(spawnerJoin.derived_trace_ref_count),
    spawnerBuilderRequestOverlapCount: numberValue(spawnerRequestOverlap.matched_builder_request_id_count),
    spawnerBuilderTraceRefOverlapCount: numberValue(spawnerTraceOverlap.matched_builder_trace_ref_count),
    telegramFinalAnswerTraceJoinStatus: stringValue(telegramJoin.status) || 'unknown'
  };
}

export async function readTraceRepairSummary(tracePath = resolveTraceIndexPath()): Promise<TraceRepairSummary> {
  try {
    const raw = await readFile(tracePath, 'utf-8');
    return summarizeTraceRepair(JSON.parse(raw));
  } catch (error) {
    return {
      present: false,
      rowCount: 0,
      traceGroupCount: 0,
      missingTraceRefCount: 0,
      highSeverityOpenCount: 0,
      orphanParentEventIdCount: 0,
      healthFlags: [],
      recentWindows: [],
      topMissingSources: [],
      spawnerRequestIdCount: 0,
      spawnerDerivedTraceRefCount: 0,
      spawnerBuilderRequestOverlapCount: 0,
      spawnerBuilderTraceRefOverlapCount: 0,
      telegramFinalAnswerTraceJoinStatus: 'missing',
      error: error instanceof Error ? error.message : String(error)
    };
  }
}

function percent(value: number): string {
  return `${Math.round(value * 1000) / 10}%`;
}

export function renderTraceRepairSummary(summary: TraceRepairSummary): string {
  if (!summary.present) {
    const cause = summary.error || '';
    const looksLikeMissingFile = /ENOENT|no such file|not found/i.test(cause);
    if (cause && !looksLikeMissingFile) {
      return [
        'Trace repair index could not be read.',
        '',
        'Move',
        '• Reason: ' + cause.slice(0, 200),
        '• If this looks like malformed JSON or a stale file, re-run `spark os compile` (it will regenerate trace-index.json from scratch).'
      ].join('\n');
    }
    return [
      'Trace repair index is not compiled yet.',
      '',
      'Move',
      '• Run `spark os compile`, then try `/trace_repair` again.'
    ].join('\n');
  }

  const needsRepair = summary.missingTraceRefCount > 0 || summary.highSeverityOpenCount > 0 || summary.orphanParentEventIdCount > 0;
  const lines = [
    needsRepair ? 'Trace repair needs attention.' : 'Trace repair is clear.',
    '',
    'State',
    `• ${summary.rowCount} Builder events; ${summary.traceGroupCount} trace groups`,
    `• ${summary.missingTraceRefCount} missing trace refs; ${summary.highSeverityOpenCount} open high-severity events`,
    `• ${summary.orphanParentEventIdCount} orphan parent links`
  ];

  if (summary.recentWindows.length) {
    lines.push('', 'Recent');
    for (const window of summary.recentWindows) {
      lines.push(`• ${window.window}: ${window.missingTraceRefCount}/${window.rowCount} missing (${percent(window.missingTraceRefRatio)})`);
    }
  }

  if (summary.topMissingSources.length) {
    lines.push('', 'Top gaps');
    for (const source of summary.topMissingSources) {
      lines.push(`• ${source.component}/${source.eventType}: ${source.eventCount} ${source.status}/${source.severity}`);
    }
  }

  lines.push(
    '',
    'Joins',
    `• Spawner derived refs ${summary.spawnerDerivedTraceRefCount}; Builder request overlaps ${summary.spawnerBuilderRequestOverlapCount}/${summary.spawnerRequestIdCount}`,
    `• Builder trace overlaps ${summary.spawnerBuilderTraceRefOverlapCount}; Telegram final-answer join ${summary.telegramFinalAnswerTraceJoinStatus}`,
    '',
    'Review',
    '• Trace health is observability evidence, not task success or memory truth.',
    '',
    'Workspace',
    '• Full evidence: `spark os trace --json`'
  );
  return lines.join('\n');
}
