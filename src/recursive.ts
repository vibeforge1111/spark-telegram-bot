import axios from 'axios';

export type RecursiveDecision = 'approve_local' | 'defer' | 'reject' | 'request_more_eval';

export interface RecursiveCommand {
  action: string;
  id?: string;
  chipKey?: string;
  rounds?: number;
  rationale?: string;
}

export interface RecursiveSessionListItem {
  trace_id: string;
  session_id: string;
  source_kind: string;
  title: string;
  status: string;
  domain: string | null;
  updated_at: string | null;
  kanban_bucket: string;
  review_required: boolean;
}

export interface RecursiveReviewCandidate {
  session_id: string;
  source_kind: string;
  title: string;
  domain: string | null;
  status: string;
  risk: string;
  reason: string;
  gate_ids: string[];
  score_delta: number | null;
}

export interface RecursiveDecisionRecord {
  decision_id: string;
  session_id: string;
  decision: RecursiveDecision;
  scope: 'local';
  actor: string;
  rationale: string;
  created_at: string;
  effect: 'audit_only';
}

export interface RecursivePromotionPacket {
  packet_id: string;
  session_id: string;
  title: string;
  publication_state: 'staged_local_only';
  effect: 'local_packet_only';
  mutation_allowed: false;
  network_absorbable: false;
  review_decision: {
    decision_id: string;
    decision: 'approve_local';
    actor: string;
  };
}

export interface RecursiveSwarmPacket {
  swarm_packet_id: string;
  session_id: string;
  stage: 'swarm_review_staged';
  effect: 'swarm_packet_staged_only';
  publication_allowed: false;
  network_absorbable: false;
  publication_gate: {
    status: 'blocked';
    reason: string;
    required_next_command: string;
  };
}

export interface RecursiveCanvasQueueResult {
  canvasUrl: string;
  effect: 'spawner_canvas_queue_only';
  pendingLoadPath: string;
  load: {
    pipelineId: string;
    pipelineName: string;
    autoRun: false;
    nodes: unknown[];
    connections: unknown[];
    relay: {
      missionId: string;
      autoRun: false;
    };
  };
}

export interface RecursiveTraceView {
  session_id: string;
  title: string;
  status: string;
  source_kind: string;
  spawner: {
    board_entry: {
      status: string;
      taskCount: number;
    };
    canvas_queue: {
      pipelineId: string;
      pending: boolean;
      latest: boolean;
      autoRun: false;
    };
  };
  review: {
    required: boolean;
    decisions: unknown[];
    local_packets: unknown[];
    swarm_packets: unknown[];
  };
  timeline: Array<{
    kind: string;
    title: string;
    status: string;
    summary: string;
  }>;
}

const DEFAULT_RECURSIVE_URL = 'http://127.0.0.1:3344';

export function sparkRecursiveUrl(): string {
  return (process.env.SPARK_RECURSIVE_URL || DEFAULT_RECURSIVE_URL).replace(/\/+$/, '');
}

export function parseRecursiveCommand(raw: string): RecursiveCommand | null {
  const parts = raw.trim().split(/\s+/).filter(Boolean);
  const action = (parts.shift() || 'help').toLowerCase();

  if (action === 'sessions' || action === 'paths' || action === 'help') return { action };
  if (
    action === 'session' ||
    action === 'report' ||
    action === 'review' ||
    action === 'promote' ||
    action === 'sync' ||
    action === 'canvas' ||
    action === 'trace'
  ) {
    return { action, id: parts[0] };
  }
  if (action === 'approve' || action === 'defer' || action === 'reject' || action === 'more-eval') {
    const id = parts.shift();
    return { action, id, rationale: parts.join(' ').trim() };
  }
  if (action === 'start') {
    const chipKey = parts.shift();
    const rounds = parseRounds(parts);
    return { action, chipKey, rounds };
  }

  return null;
}

export async function recursiveSessions(): Promise<RecursiveSessionListItem[]> {
  const res = await axios.get(`${sparkRecursiveUrl()}/api/recursive/sessions`, { timeout: 10000 });
  return Array.isArray(res.data?.sessions) ? res.data.sessions : [];
}

export async function recursiveSessionStatus(id: string): Promise<string> {
  const res = await axios.get(`${sparkRecursiveUrl()}/api/recursive/sessions/${encodeURIComponent(id)}`, { timeout: 10000 });
  return String(res.data?.status || '');
}

export async function recursiveSessionReview(id: string): Promise<string> {
  const res = await axios.get(`${sparkRecursiveUrl()}/api/recursive/sessions/${encodeURIComponent(id)}`, { timeout: 10000 });
  return String(res.data?.review || '');
}

export async function recursiveSessionReport(id: string): Promise<string> {
  const res = await axios.get(`${sparkRecursiveUrl()}/api/recursive/sessions/${encodeURIComponent(id)}/report?format=text`, {
    timeout: 10000,
    responseType: 'text'
  });
  return String(res.data || '');
}

export async function recursiveReviewCandidates(): Promise<RecursiveReviewCandidate[]> {
  const res = await axios.get(`${sparkRecursiveUrl()}/api/recursive/review-candidates`, { timeout: 10000 });
  return Array.isArray(res.data?.candidates) ? res.data.candidates : [];
}

export async function recordRecursiveDecision(input: {
  id: string;
  action: 'approve' | 'defer' | 'reject' | 'more-eval';
  actor: string;
  rationale?: string;
}): Promise<RecursiveDecisionRecord> {
  const decision = decisionForAction(input.action);
  const res = await axios.post(
    `${sparkRecursiveUrl()}/api/recursive/sessions/${encodeURIComponent(input.id)}/review-decisions`,
    {
      decision,
      actor: input.actor,
      rationale: input.rationale || ''
    },
    { timeout: 10000 }
  );
  return res.data?.decision as RecursiveDecisionRecord;
}

export async function stageRecursivePromotionPacket(id: string): Promise<RecursivePromotionPacket> {
  const res = await axios.post(
    `${sparkRecursiveUrl()}/api/recursive/sessions/${encodeURIComponent(id)}/promotion-packets`,
    {},
    { timeout: 10000 }
  );
  return res.data?.packet as RecursivePromotionPacket;
}

export async function stageRecursiveSwarmPacket(id: string): Promise<RecursiveSwarmPacket> {
  const res = await axios.post(
    `${sparkRecursiveUrl()}/api/recursive/sessions/${encodeURIComponent(id)}/swarm-packets`,
    {},
    { timeout: 10000 }
  );
  return res.data?.packet as RecursiveSwarmPacket;
}

export async function queueRecursiveCanvas(id: string): Promise<RecursiveCanvasQueueResult> {
  const res = await axios.post(
    `${sparkRecursiveUrl()}/api/recursive/sessions/${encodeURIComponent(id)}/spawner-canvas-load`,
    {},
    { timeout: 10000 }
  );
  return res.data as RecursiveCanvasQueueResult;
}

export async function recursiveTraceView(id: string): Promise<RecursiveTraceView> {
  const res = await axios.get(`${sparkRecursiveUrl()}/api/recursive/sessions/${encodeURIComponent(id)}/trace`, { timeout: 10000 });
  return res.data?.trace as RecursiveTraceView;
}

export function renderRecursiveHelp(): string {
  return [
    'Spark Recursive',
    '',
    'Usage:',
    '/recursive sessions',
    '/recursive paths',
    '/recursive session <id>',
    '/recursive report <id>',
    '/recursive trace <id>',
    '/recursive canvas <id>',
    '/recursive review [id]',
    '/recursive approve <id> [rationale]',
    '/recursive promote <id>',
    '/recursive sync <id>',
    '/recursive defer <id> <rationale>',
    '/recursive reject <id> <rationale>',
    '/recursive more-eval <id> <rationale>',
    '/recursive start <chipKey> [rounds <n>]'
  ].join('\n');
}

export function renderRecursiveSessions(sessions: RecursiveSessionListItem[]): string {
  if (sessions.length === 0) return 'No recursive sessions found.';
  const lines = ['Spark Recursive Sessions'];
  for (const session of sessions.slice(0, 12)) {
    lines.push(
      `- ${session.session_id} [${session.status}] ${session.domain || session.source_kind} - ${truncate(session.title, 88)}`
    );
  }
  if (sessions.length > 12) lines.push(`...and ${sessions.length - 12} more.`);
  return lines.join('\n');
}

export function renderRecursivePaths(sessions: RecursiveSessionListItem[]): string {
  const domains = [...new Set(sessions.map((session) => session.domain || session.source_kind).filter(Boolean))].sort();
  if (domains.length === 0) return 'No recursive paths found yet.';
  return ['Spark Recursive Paths', ...domains.map((domain) => `- ${domain}`)].join('\n');
}

export function renderRecursiveReviewCandidates(candidates: RecursiveReviewCandidate[]): string {
  if (candidates.length === 0) return 'No recursive candidates need review.';
  const lines = ['Spark Recursive Review Queue'];
  for (const candidate of candidates.slice(0, 10)) {
    const delta = candidate.score_delta === null ? '' : ` delta=${formatDelta(candidate.score_delta)}`;
    lines.push(`- ${candidate.session_id} risk=${candidate.risk}${delta} - ${truncate(candidate.reason, 96)}`);
  }
  if (candidates.length > 10) lines.push(`...and ${candidates.length - 10} more.`);
  return lines.join('\n');
}

export function renderRecursiveDecision(record: RecursiveDecisionRecord): string {
  return [
    'Recursive review decision recorded.',
    `Session: ${record.session_id}`,
    `Decision: ${record.decision}`,
    `Scope: ${record.scope}`,
    `Effect: ${record.effect}`,
    'No memory, Swarm, Builder, or source artifacts were mutated.'
  ].join('\n');
}

export function renderRecursivePromotionPacket(packet: RecursivePromotionPacket): string {
  return [
    'Recursive local promotion packet staged.',
    `Session: ${packet.session_id}`,
    `Packet: ${packet.packet_id}`,
    `State: ${packet.publication_state}`,
    `Effect: ${packet.effect}`,
    `Network absorbable: ${packet.network_absorbable}`,
    'No memory, Swarm, Builder, or source artifacts were mutated.'
  ].join('\n');
}

export function renderRecursiveSwarmPacket(packet: RecursiveSwarmPacket): string {
  return [
    'Recursive Swarm review packet staged.',
    `Session: ${packet.session_id}`,
    `Packet: ${packet.swarm_packet_id}`,
    `Stage: ${packet.stage}`,
    `Effect: ${packet.effect}`,
    `Publication allowed: ${packet.publication_allowed}`,
    `Network absorbable: ${packet.network_absorbable}`,
    `Publication gate: ${packet.publication_gate.status} (${packet.publication_gate.reason})`,
    `Required next command: ${packet.publication_gate.required_next_command}`,
    'No network publication, memory mutation, Builder absorption, or source artifacts were mutated.'
  ].join('\n');
}

export function renderRecursiveCanvasQueue(result: RecursiveCanvasQueueResult): string {
  return [
    'Recursive Canvas load queued.',
    `Pipeline: ${result.load.pipelineId}`,
    `Mission: ${result.load.relay.missionId}`,
    `Nodes: ${result.load.nodes.length}`,
    `Connections: ${result.load.connections.length}`,
    `Canvas: ${result.canvasUrl}`,
    `Effect: ${result.effect}`,
    'Inspect-only: autoRun is false.'
  ].join('\n');
}

export function renderRecursiveTraceView(trace: RecursiveTraceView): string {
  const canvas = trace.spawner.canvas_queue;
  const timeline = trace.timeline.slice(-6).map((item) => `- ${item.kind}: ${item.title} [${item.status}]`);
  return [
    'Spark Recursive Trace',
    `Session: ${trace.session_id}`,
    `Status: ${trace.status}`,
    `Source: ${trace.source_kind}`,
    `Board: ${trace.spawner.board_entry.status}, tasks=${trace.spawner.board_entry.taskCount}`,
    `Canvas: ${canvas.pending ? 'pending' : canvas.latest ? 'latest' : 'not queued'} (${canvas.pipelineId})`,
    `Review: required=${trace.review.required}, decisions=${trace.review.decisions.length}, local packets=${trace.review.local_packets.length}, swarm packets=${trace.review.swarm_packets.length}`,
    '',
    'Recent timeline:',
    ...(timeline.length > 0 ? timeline : ['- no timeline events'])
  ].join('\n');
}

function decisionForAction(action: 'approve' | 'defer' | 'reject' | 'more-eval'): RecursiveDecision {
  if (action === 'approve') return 'approve_local';
  if (action === 'more-eval') return 'request_more_eval';
  return action;
}

function parseRounds(parts: string[]): number {
  const roundIndex = parts.findIndex((part) => part.toLowerCase() === 'rounds');
  const raw = roundIndex >= 0 ? parts[roundIndex + 1] : parts[0];
  return Math.max(1, Math.min(10, Number.parseInt(raw || '3', 10) || 3));
}

function truncate(value: string, limit: number): string {
  const clean = value.replace(/\s+/g, ' ').trim();
  return clean.length <= limit ? clean : `${clean.slice(0, limit - 1).trim()}...`;
}

function formatDelta(value: number): string {
  const rounded = Math.round(value * 1000) / 1000;
  return `${rounded > 0 ? '+' : ''}${rounded}`;
}
