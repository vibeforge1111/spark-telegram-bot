import { readJsonFile, resolveStatePath, writeJsonAtomic } from './jsonState';
import type { BrowserCapabilityIntent, BrowserUseProfileOptions } from './browserCapability';

export type BrowserProofResult = 'success' | 'failure' | 'partial' | 'unavailable';

export type BrowserProofReceipt = {
  capability_id: 'spark_browser';
  action: string;
  result: BrowserProofResult;
  checked_at: string;
  latency_ms: number;
  target_url?: string;
  final_url?: string;
  title?: string;
  evidence_summary: string;
  proof_labels: string[];
  artifact_refs: string[];
  boundary: 'public page' | 'attached browser' | 'logged-in/profile' | 'unproven';
  failure_reason?: string;
};

type BrowserProofLedgerState = {
  latest?: BrowserProofReceipt;
  recent: BrowserProofReceipt[];
};

const BROWSER_PROOF_LEDGER_PATH = resolveStatePath('.spark-browser-proof-ledger.json');
const BROWSER_PROOF_LEDGER_LIMIT = 20;

function stringValue(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function numberValue(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? Math.max(0, Math.round(value)) : 0;
}

function payloadResult(payload: Record<string, unknown>): BrowserProofResult {
  if (payload.ok === true || stringValue(payload.status) === 'ready') return 'success';
  const status = stringValue(payload.status).toLowerCase();
  if (status === 'partial') return 'partial';
  if (status === 'blocked' || status === 'unavailable') return 'unavailable';
  return 'failure';
}

function profileBoundary(profile: BrowserUseProfileOptions | undefined, payload: Record<string, unknown>): BrowserProofReceipt['boundary'] {
  if (profile?.cdpUrl || stringValue(payload.cdp_url)) return 'attached browser';
  if (profile?.profile || profile?.userDataDir || profile?.profileDirectory || profile?.storageState || payload.profile_requested === true) {
    return 'logged-in/profile';
  }
  return 'public page';
}

function proofLabels(action: string, result: BrowserProofResult, payload: Record<string, unknown>): string[] {
  if (result !== 'success' && result !== 'partial') return [];
  const rawProofs = stringValue(payload.proofs)
    || stringValue(payload.probe_summary).match(/(?:^|\s)proofs=([a-z0-9_,.-]+)/i)?.[1]
    || '';
  const labels = rawProofs
    .split(',')
    .map((proof) => proof.trim())
    .filter(Boolean);
  if (labels.length) return labels;
  if (action === 'open') return ['public_page_open', 'state_read'];
  if (action === 'screenshot') return ['public_page_open', 'screenshot_capture', 'state_read'];
  if (action === 'state') return ['state_read'];
  if (['click', 'type', 'input', 'scroll', 'back', 'eval', 'close'].includes(action)) return [`browser_${action}`];
  if (action === 'task' || action === 'review' || action === 'qa') return ['browser_task'];
  return ['browser_action'];
}

function artifactRefs(payload: Record<string, unknown>): string[] {
  const refs = [
    stringValue(payload.screenshot_path),
    stringValue((payload.start_page as Record<string, unknown> | undefined)?.screenshot_path),
  ];
  const screenshotPaths = Array.isArray(payload.screenshot_paths) ? payload.screenshot_paths : [];
  for (const item of screenshotPaths) refs.push(stringValue(item));
  return Array.from(new Set(refs.filter(Boolean)));
}

function evidenceSummary(action: string, result: BrowserProofResult, payload: Record<string, unknown>): string {
  if (result === 'success') {
    const title = stringValue(payload.title);
    const finalUrl = stringValue(payload.final_url || payload.url);
    if (title && finalUrl) return `${action} succeeded on ${title} (${finalUrl})`;
    if (title) return `${action} succeeded on ${title}`;
    if (finalUrl) return `${action} succeeded on ${finalUrl}`;
    return `${action} succeeded`;
  }
  const failure = stringValue(payload.last_failure_reason || payload.failure_reason);
  return failure || `${action} ${result}`;
}

export async function recordBrowserProofReceipt(input: {
  action: string;
  intent?: Pick<BrowserCapabilityIntent, 'url' | 'profile'>;
  profile?: BrowserUseProfileOptions;
  payload: Record<string, unknown>;
  latencyMs?: number;
  checkedAt?: string;
}): Promise<BrowserProofReceipt> {
  const action = input.action.trim() || stringValue(input.payload.action) || 'browser';
  const result = payloadResult(input.payload);
  const profile = input.profile || input.intent?.profile;
  const receipt: BrowserProofReceipt = {
    capability_id: 'spark_browser',
    action,
    result,
    checked_at: input.checkedAt || new Date().toISOString(),
    latency_ms: numberValue(input.latencyMs ?? input.payload.latency_ms),
    target_url: stringValue(input.intent?.url || input.payload.url) || undefined,
    final_url: stringValue(input.payload.final_url) || undefined,
    title: stringValue(input.payload.title) || undefined,
    evidence_summary: evidenceSummary(action, result, input.payload),
    proof_labels: proofLabels(action, result, input.payload),
    artifact_refs: artifactRefs(input.payload),
    boundary: profileBoundary(profile, input.payload),
    failure_reason: stringValue(input.payload.last_failure_reason || input.payload.failure_reason) || undefined,
  };

  const current = await readJsonFile<BrowserProofLedgerState>(BROWSER_PROOF_LEDGER_PATH)
    || { recent: [] };
  const recent = [receipt, ...(current.recent || [])].slice(0, BROWSER_PROOF_LEDGER_LIMIT);
  const next = { latest: receipt, recent };
  await writeJsonAtomic(BROWSER_PROOF_LEDGER_PATH, next);
  return receipt;
}

export async function readLatestBrowserProofReceipt(): Promise<BrowserProofReceipt | null> {
  const state = await readJsonFile<BrowserProofLedgerState>(BROWSER_PROOF_LEDGER_PATH);
  return state?.latest || null;
}

export function browserProofReceiptToRoutePayload(receipt: BrowserProofReceipt): Record<string, unknown> {
  return {
    status: receipt.result === 'success' || receipt.result === 'partial' ? 'success' : 'failed',
    action: receipt.action,
    target_url: receipt.target_url,
    final_url: receipt.final_url,
    title: receipt.title,
    boundary: receipt.boundary,
    artifact_count: receipt.artifact_refs.length,
    failure_reason: receipt.failure_reason,
    probe_summary: [
      `browser-use receipt action=${receipt.action}`,
      `result=${receipt.result}`,
      `boundary=${receipt.boundary.replace(/\s+/g, '_')}`,
      receipt.proof_labels.length ? `proofs=${receipt.proof_labels.join(',')}` : '',
      receipt.target_url ? `target=${receipt.target_url}` : '',
    ].filter(Boolean).join(' '),
    latency_ms: receipt.latency_ms,
    checked_at: receipt.checked_at,
  };
}
