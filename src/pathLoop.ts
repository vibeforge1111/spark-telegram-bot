export interface RecursiveStartTarget {
  kind: 'chip' | 'path';
  key: string;
  repoRoot?: string;
  capabilities?: string[];
}

export interface PathLoopResult {
  ok: boolean;
  pathKey: string;
  repoRoot?: string;
  roundsCompleted?: number;
  totalRounds?: number;
  stopReason?: string | null;
  sessionId?: string | null;
  sessionSummaryPath?: string | null;
  payloadPath?: string | null;
  latestCandidatePath?: string | null;
  workspaceSynced?: boolean;
  pathId?: string | null;
  outcomeId?: string | null;
  verdict?: string | null;
  metricName?: string | null;
  metricValue?: number | null;
  summary?: string | null;
  stdout?: string;
  stderr?: string;
  error?: string;
}

export interface WorkspaceSyncHints {
  apiUrl?: string;
  workspaceId?: string;
  accessToken?: string;
}

function normalizeKey(value: string): string {
  return String(value || '').trim().toLowerCase();
}

function normalizeRepoRoot(value: unknown): string | undefined {
  const normalized = String(value || '').trim();
  return normalized || undefined;
}

function recordCapabilities(record: any): string[] {
  return Array.isArray(record?.capabilities) ? record.capabilities.map((item: unknown) => String(item)) : [];
}

export function classifyBuilderAttachmentTargetFromSnapshot(snapshot: any, targetKey: string): RecursiveStartTarget {
  const fallback: RecursiveStartTarget = { kind: 'chip', key: targetKey };
  const normalizedTarget = normalizeKey(targetKey);
  const records = Array.isArray(snapshot?.records) ? snapshot.records : [];

  const pathRecord = records.find((record: any) =>
    normalizeKey(record?.kind) === 'path' && normalizeKey(record?.key) === normalizedTarget
  );
  if (pathRecord) {
    return {
      kind: 'path',
      key: String(pathRecord.key || targetKey),
      repoRoot: normalizeRepoRoot(pathRecord.repo_root),
      capabilities: recordCapabilities(pathRecord)
    };
  }

  const chipRecord = records.find((record: any) =>
    normalizeKey(record?.kind) === 'chip' && normalizeKey(record?.key) === normalizedTarget
  );
  if (chipRecord) {
    return {
      kind: 'chip',
      key: String(chipRecord.key || targetKey),
      repoRoot: normalizeRepoRoot(chipRecord.repo_root),
      capabilities: recordCapabilities(chipRecord)
    };
  }

  return fallback;
}

export function buildSpecializationPathAutoloopBridgeArgs(input: {
  pathKey: string;
  repoRoot: string;
  rounds: number;
  sync?: WorkspaceSyncHints;
}): string[] {
  const args = [
    '-m',
    'spark_swarm_bridge.cli',
    'specialization-path',
    'autoloop',
    input.pathKey,
    input.repoRoot,
    '--rounds',
    String(Math.max(1, Math.min(10, input.rounds || 1)))
  ];
  if (input.sync?.workspaceId && input.sync?.apiUrl && input.sync?.accessToken) {
    args.push('--sync-collective');
    args.push('--workspace-id', input.sync.workspaceId);
    args.push('--api-url', input.sync.apiUrl);
    args.push('--access-token', input.sync.accessToken);
  }
  return args;
}
