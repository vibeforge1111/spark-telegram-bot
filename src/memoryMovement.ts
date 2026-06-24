import { readFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

export type MemoryMovementSummary = {
  present: boolean;
  status: string;
  authority: string;
  traceContinuity: MemoryMovementTraceContinuity;
  rowCount: number;
  movementCounts: Record<string, number>;
  authorityCounts: Record<string, number>;
  sourceFamilyCounts: Record<string, number>;
  recordCounts: Record<string, number>;
  kbFileCount: number;
  currentStateFileCount: number;
  nextRequiredBridges: string[];
  error?: string;
};

export type MemoryMovementTraceContinuity = {
  present: boolean;
  requestJoined: boolean;
  traceJoined: boolean;
  proofJoined: boolean;
  proofStatus: string;
  source: string;
  rawMemoryExported: boolean | null;
  missingTraceRefCount: number;
  requestIdPresentCount: number;
  traceRefPresentCount: number;
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

function numberRecord(value: unknown): Record<string, number> {
  const result: Record<string, number> = {};
  for (const [key, raw] of Object.entries(objectValue(value))) {
    result[key] = numberValue(raw);
  }
  return result;
}

function booleanValue(value: unknown): boolean | null {
  return typeof value === 'boolean' ? value : null;
}

export function resolveMemoryMovementIndexPath(env: NodeJS.ProcessEnv = process.env): string {
  const configured = env.SPARK_SYSTEM_MAP_DIR || env.SPARK_OS_SYSTEM_MAP_DIR;
  const root = configured && configured.trim()
    ? configured.trim()
    : path.join(os.homedir(), '.spark', 'state', 'system-map');
  return path.join(root, 'memory-movement-index.json');
}

function summarizeTraceContinuity(root: Record<string, unknown>): MemoryMovementTraceContinuity {
  const continuity = objectValue(root.trace_continuity || root.traceContinuity);
  const requestRef = stringValue(continuity.request_ref || continuity.requestRef || root.request_ref || root.requestRef);
  const traceRef = stringValue(continuity.trace_ref || continuity.traceRef || root.trace_ref || root.traceRef);
  const proofRef = stringValue(
    continuity.harness_proof_ref ||
    continuity.harnessProofRef ||
    root.harness_proof_ref ||
    root.harnessProofRef
  );
  const requestIdPresentCount = numberValue(
    continuity.builder_memory_lane_request_id_present_count ||
    continuity.request_id_present_count ||
    continuity.requestIdPresentCount
  );
  const traceRefPresentCount = numberValue(
    continuity.builder_memory_lane_trace_ref_present_count ||
    continuity.trace_ref_present_count ||
    continuity.traceRefPresentCount
  );
  const proofStatus = stringValue(continuity.proof_status || continuity.proofStatus || continuity.proof_storage || continuity.proofStorage);

  return {
    present: Object.keys(continuity).length > 0 || Boolean(requestRef || traceRef || proofRef),
    requestJoined: Boolean(requestRef || requestIdPresentCount > 0),
    traceJoined: Boolean(traceRef || traceRefPresentCount > 0),
    proofJoined: Boolean(proofRef),
    proofStatus: proofStatus || (proofRef ? 'present' : 'unknown'),
    source: stringValue(continuity.source),
    rawMemoryExported: booleanValue(continuity.raw_memory_exported ?? continuity.rawMemoryExported),
    missingTraceRefCount: numberValue(
      continuity.builder_memory_lane_missing_trace_ref_count ||
      continuity.missing_trace_ref_count ||
      continuity.missingTraceRefCount
    ),
    requestIdPresentCount,
    traceRefPresentCount
  };
}

export function summarizeMemoryMovement(payload: unknown): MemoryMovementSummary {
  const root = objectValue(payload);
  const safeStatus = objectValue(root.safe_status_export);
  const status = objectValue(safeStatus.status);
  const kbArtifacts = objectValue(root.memory_kb_artifacts);
  const laneCounts = objectValue(kbArtifacts.lane_counts);
  const currentState = objectValue(laneCounts.current_state);

  return {
    present: Object.keys(status).length > 0,
    status: stringValue(status.status) || 'unknown',
    authority: stringValue(status.authority || root.authority) || 'observability_non_authoritative',
    traceContinuity: summarizeTraceContinuity(root),
    rowCount: numberValue(status.row_count),
    movementCounts: numberRecord(status.movement_counts),
    authorityCounts: numberRecord(status.authority_counts),
    sourceFamilyCounts: numberRecord(status.source_family_counts),
    recordCounts: numberRecord(status.record_counts),
    kbFileCount: numberValue(kbArtifacts.file_count),
    currentStateFileCount: numberValue(currentState.file_count),
    nextRequiredBridges: arrayValue(root.next_required_bridges).map(stringValue).filter(Boolean).slice(0, 2)
  };
}

export async function readMemoryMovementSummary(indexPath = resolveMemoryMovementIndexPath()): Promise<MemoryMovementSummary> {
  try {
    const raw = await readFile(indexPath, 'utf-8');
    return summarizeMemoryMovement(JSON.parse(raw));
  } catch (error) {
    return {
      present: false,
      status: 'missing',
      authority: 'missing',
      rowCount: 0,
      traceContinuity: {
        present: false,
        requestJoined: false,
        traceJoined: false,
        proofJoined: false,
        proofStatus: 'missing',
        source: '',
        rawMemoryExported: null,
        missingTraceRefCount: 0,
        requestIdPresentCount: 0,
        traceRefPresentCount: 0
      },
      movementCounts: {},
      authorityCounts: {},
      sourceFamilyCounts: {},
      recordCounts: {},
      kbFileCount: 0,
      currentStateFileCount: 0,
      nextRequiredBridges: [],
      error: error instanceof Error ? error.message : String(error)
    };
  }
}

function countLine(counts: Record<string, number>, keys: string[]): string {
  const parts = keys
    .map((key) => [key, counts[key] || 0] as const)
    .filter(([, count]) => count > 0)
    .map(([key, count]) => `${key}=${count}`);
  return parts.length ? parts.join(', ') : 'none yet';
}

function traceContinuityLine(continuity: MemoryMovementTraceContinuity): string {
  if (!continuity.present) {
    return 'Trace continuity: not reported by the compiled index yet';
  }
  const joins = [
    continuity.requestJoined ? 'request joined' : 'request not joined',
    continuity.traceJoined ? 'trace joined' : 'trace not joined',
    continuity.proofJoined ? 'proof ref present' : `proof ${continuity.proofStatus.replace(/_/g, ' ')}`
  ];
  const extras = [
    continuity.missingTraceRefCount > 0 ? `${continuity.missingTraceRefCount} memory rows still missing trace refs` : '',
    continuity.rawMemoryExported === false ? 'raw memory hidden' : ''
  ].filter(Boolean);
  return `Trace continuity: ${joins.join(', ')}${extras.length ? `; ${extras.join(', ')}` : ''}`;
}

export function renderMemoryMovementSummary(summary: MemoryMovementSummary): string {
  if (!summary.present) {
    return [
      'Memory movement index is not compiled yet.',
      '',
      'Move',
      '• Run `spark os compile`, then try `/memory_movement` again.'
    ].join('\n');
  }

  const needsAttention = summary.status !== 'supported';
  const lines = [
    needsAttention ? 'Memory movement needs review.' : 'Memory movement is visible.',
    '',
    'State',
    `• ${summary.status}; ${summary.rowCount} movement rows`,
    `• ${traceContinuityLine(summary.traceContinuity)}`,
    `• Movement: ${countLine(summary.movementCounts, ['captured', 'saved', 'promoted', 'retrieved', 'summarized', 'blocked'])}`,
    `• Authority: ${countLine(summary.authorityCounts, ['authoritative_current', 'authoritative_historical', 'supporting_not_authoritative', 'structured_support'])}`,
    `• Records: ${countLine(summary.recordCounts, ['current_state', 'events', 'observations', 'sessions'])}`,
    `• KB files ${summary.kbFileCount}; current-state files ${summary.currentStateFileCount}`,
    '',
    'Review',
    '• Movement rows are evidence, not instructions.',
    '• Blocked or dropped rows still need a separate promotion gate.'
  ];

  if (summary.nextRequiredBridges.length) {
    lines.push('', 'Next');
    for (const item of summary.nextRequiredBridges) {
      lines.push(`• ${item}`);
    }
  }

  lines.push('', 'Workspace', '• Full evidence: `spark os memory --json`');
  return lines.join('\n');
}
