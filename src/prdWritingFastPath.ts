import {
  fetchLoopEngineeringStatusPacket,
  type LoopEngineeringFetchLike,
  type LoopEngineeringStatusPacket
} from './loopEngineeringStatus';

export type PrdFastPathMode = 'draft_prd' | 'questions_only' | 'refuse' | 'loop_mode';
export type PrdTokenMode = 'quick_draft' | 'review_packet' | 'loop_mode';

export interface PrdFastPathResult {
  mode: PrdFastPathMode;
  tokenMode: PrdTokenMode;
  quickScore: number;
  reasons: string[];
  reply: string;
}

export interface PrdFastPathEvidence {
  chipId: string;
  distilledLearningLine: string;
  detailUrl: string;
  freshnessLabel: string;
}

const FALSE_APPROVAL_PATTERN = /\b(?:already\s+approved|approved\s+already|legal\s+approved|engineering\s+approved|tickets?\s+(?:are\s+)?created|roadmap\s+(?:is\s+)?(?:changed|updated)|release\s+committed|launch\s+ready)\b/i;
const HARMFUL_PATTERN = /\b(?:dark[-\s]?pattern|hide\s+(?:the\s+)?decline|trick\s+users?|deceive\s+users?|coerce\s+users?|manipulate\s+users?|stealth\s+tracking|without\s+consent|bypass\s+consent)\b/i;
const NO_DRAFT_PATTERN = /\b(?:do\s+not|don't|dont|without)\s+(?:write|draft|create|make|publish|file|send)\b|\bonly\s+(?:list|ask|give)\s+(?:questions|what\s+we\s+need|unknowns)\b|\bnot\s+ready\s+to\s+draft\b/i;
const FULL_LOOP_PATTERN = /\b(?:full\s+loop|autoloop|auto[-\s]?loop|benchmark(?:ed|ing)?|self[-\s]?improv|long[-\s]?running|separated\s+judges?|sealed\s+judge|adversarial\s+eval)\b/i;
const LOOP_ACTION_NEGATION_PATTERN = /\b(?:do\s+not|don't|dont|without|no)\s+(?:run|start|rerun|launch|queue|schedule|activate|publish|use|trigger|begin)[\s\S]{0,120}\b(?:benchmark|loop|auto[-\s]?loop|autoloop|schedule|activation|mission|publication)\b/i;
const WEAK_FEEDBACK_PATTERN = /\b(?:weak|not\s+useful|bad\s+draft|failed\s+(?:review|eval)|low\s+score|score\s+below|keeps?\s+missing|repeated\s+edits?|edited\s+this\s+(?:several|many|multiple)\s+times|human\s+marked\s+(?:it\s+)?weak)\b/i;
const HIGH_RISK_PATTERN = /\b(?:medical|clinical|diagnos|legal|financial|banking|regulated|children|minors|safety[-\s]?critical|production[-\s]?critical)\b/i;
const SENSITIVE_PATTERN = /\b(?:privacy|security|legal|billing|payment|consent|tracking|account\s+deletion|export|impersonation|permissions?|admin|customer\s+data|personal\s+data|pii|audit|support)\b/i;
const DEPENDENCY_PATTERN = /\b(?:dependency|dependencies|integration|upstream|downstream|api|webhook|billing|payment|support|permissions?|enterprise|admin|audit)\b/i;
const PRD_WRITING_STATUS_PROMPT = 'Loop QA read-only check: latest PRD Writing loop state from Spawner? Include schedule status, fresh/stale, what improved, distilled reuse without rerun, and link. Do not mutate anything.';

function normalizedText(text: string): string {
  return text.replace(/[‘’]/g, "'").replace(/\s+/g, ' ').trim();
}

export function isDistilledPrdFastPathRequest(text: string): boolean {
  const normalized = normalizedText(text);
  if (!normalized) return false;
  const mentionsPrd = /\bPRD\b/i.test(normalized) || /\bproduct\s+requirements?\s+doc(?:ument)?\b/i.test(normalized);
  if (!mentionsPrd) return false;
  if (/\bdomain[-\s]?chip\b/i.test(normalized) && /\b(?:build|create|scaffold)\b/i.test(normalized)) return false;
  if (/\badvanced\s+prd\s+mode\b/i.test(normalized) && /\b(?:build|spawner|mission)\b/i.test(normalized)) return false;
  if (/\b(?:write|draft|create|make|improve|review|outline|turn|convert|distill)\b/i.test(normalized)) return true;
  return /\b(?:better|safer|questions|requirements|product)\b/i.test(normalized) && /\bPRD\b/i.test(normalized);
}

function titleCase(value: string): string {
  return value
    .replace(/[-_/]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .split(' ')
    .filter(Boolean)
    .map((word) => {
      const lower = word.toLowerCase();
      if (lower === 'api') return 'API';
      if (lower === 'prd') return 'PRD';
      if (lower === 'ai') return 'AI';
      if (lower === 'b2b') return 'B2B';
      return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
    })
    .join(' ');
}

function cleanSubject(value: string): string {
  return value
    .replace(/\bFASTPATH-CANARY-\d+\b/gi, ' ')
    .replace(/\b(?:please|quickly|fast|now|for\s+me)\b/gi, ' ')
    .replace(/\b(?:with|but|and)\s+(?:make|keep|do|don't|dont|without)\b[\s\S]*$/i, ' ')
    .replace(/[.!?]+$/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function extractPrdSubject(text: string): string {
  const normalized = normalizedText(text);
  const patterns = [
    /\bPRD\b\s+(?:for|about|on)\s+(.+)$/i,
    /\b(?:write|draft|create|make|outline|review|improve)\s+(?:a\s+|an\s+|the\s+)?(?:better\s+|safer\s+|first[-\s]?pass\s+)?PRD\s+(?:for|about|on)\s+(.+)$/i,
    /\bturn\s+(.+?)\s+into\s+(?:a\s+)?PRD\b/i,
    /\bconvert\s+(.+?)\s+into\s+(?:a\s+)?PRD\b/i
  ];
  for (const pattern of patterns) {
    const match = normalized.match(pattern);
    if (match?.[1]) {
      const subject = cleanSubject(match[1]);
      if (subject) return subject;
    }
  }
  return 'the product change';
}

function isVaguePrdAsk(text: string): boolean {
  const normalized = normalizedText(text).toLowerCase();
  if (/\breview\s+(?:this\s+)?prd\b/.test(normalized) && !/\b(?:user|users|customer|admin|metric|rate|problem|because|when|after|evidence|acceptance|requirement)\b/.test(normalized)) return true;
  if (/\bmake\s+\w+\s+better\b/.test(normalized)) return true;
  if (/\b(?:better|improve|improving)\b/.test(normalized) && !/\b(?:user|users|customer|admin|metric|rate|problem|because|when)\b/.test(normalized)) return true;
  const subject = extractPrdSubject(text);
  if (subject === 'the product change' && /\b(?:review|improve|draft|write|create|make)\b/i.test(normalized)) return true;
  return subject.split(/\s+/).filter(Boolean).length <= 2 && /\b(?:better|improve|fix)\b/i.test(normalized);
}

function productAreaFromSubject(subject: string): string {
  const bounded = subject
    .replace(/\b(?:improving|improve|reducing|reduce|fixing|fix|drafting|draft|writing|write)\b\s+/gi, '')
    .replace(/\bused\s+by\b[\s\S]*$/i, '')
    .replace(/\bto\s+(?:export|import|create|make|send|review|manage|track|update)\b[\s\S]*$/i, '')
    .replace(/\b(?:after|when|where|because|with|for)\b[\s\S]*$/i, '')
    .replace(/\b(?:failures?|errors?|drop[-\s]?offs?|drops?|churn)\b[\s\S]*$/i, '')
    .replace(/\b(?:users?|customers?|admins?|teams?)\b[\s\S]*$/i, '')
    .replace(/^(?:a|an|the)\s+/i, '')
    .trim();
  return titleCase(bounded || subject || 'Product Change');
}

function userPhrase(text: string): string {
  const normalized = normalizedText(text);
  const afterUser = normalized.match(/\b(?:after|when|where)\s+([a-z][a-z0-9 -]{1,50}?\b(?:users?|customers?|admins?|teams?|agents?|founders?|operators?))\b/i);
  if (afterUser?.[1]) return afterUser[1].trim();
  const forSegments = normalized
    .split(/\bfor\s+/i)
    .slice(1)
    .map((segment) => {
      const bounded = segment.split(/[.!?]/)[0].split(/\b(?:after|when|where|because|with|but)\b/i)[0].trim();
      const usedBy = bounded.match(/\bused\s+by\s+(.+?)(?:\s+to\b|$)/i)?.[1]?.trim();
      return usedBy || bounded.split(/\bto\s+(?:export|import|create|make|send|review|manage|track|update)\b/i)[0].trim();
    })
    .filter(Boolean);
  const forUserSegment = [...forSegments].reverse().find((segment) => /\b(?:users?|customers?|admins?|teams?|agents?|founders?|operators?)\b$/i.test(segment));
  if (forUserSegment) return forUserSegment;
  const explicit = normalized.match(/\b(?:for|used\s+by)\s+([a-z][a-z0-9 -]{2,60}?\b(?:users?|customers?|admins?|teams?|agents?|founders?|operators?))\b/i);
  if (explicit?.[1]) return explicit[1].trim();
  if (/\badmin/i.test(normalized)) return 'admins';
  if (/\bsupport/i.test(normalized)) return 'support agents and affected customers';
  if (/\benterprise/i.test(normalized)) return 'enterprise customers';
  return 'target users';
}

function problemPhrase(text: string, subject: string): string {
  const normalized = normalizedText(text);
  const afterWhen = normalized.match(/\b(?:when|because|after)\s+(.+?)(?=[.!?]|\s+(?:with|but|and\s+do|and\s+keep)\b|$)/i);
  if (afterWhen?.[1]) return cleanSubject(afterWhen[1]);
  return cleanSubject(subject)
    .replace(/\b(?:improving|improve|reducing|reduce|fixing|fix)\b\s+/i, '')
    .trim() || 'the stated product problem';
}

function metricPhrase(text: string): string {
  const normalized = normalizedText(text);
  const explicit = normalized.match(/\b(?:metric|measure|success\s+metric)\s*(?:is|:)?\s*([a-z][a-z0-9 -]{2,70})(?=[.!?]|$)/i);
  if (explicit?.[1]) return explicit[1].trim();
  if (/\bonboarding|activation|setup/i.test(normalized)) return 'activation or setup completion rate';
  if (/\bbilling|payment/i.test(normalized)) return 'successful resolution rate';
  if (/\bsupport/i.test(normalized)) return 'resolved support sessions with safe audit coverage';
  return 'task success rate';
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function questionsOnlyReply(reason: string): string {
  return [
    `I would keep this in questions-only mode first: ${reason}.`,
    '',
    'Before drafting the PRD, I need the target user, the problem evidence, the success metric, the owner, the constraints, and explicit approval to draft. I will not treat claimed approvals, tickets, roadmap changes, or launch commitments as facts without evidence.'
  ].join('\n');
}

function refusalReply(): string {
  return [
    'I cannot draft a PRD for deceptive or dark-pattern behavior.',
    '',
    'A safe version would reframe the goal around legitimate user value, clear consent, visible choices, privacy review, and a measurable guardrail before any implementation work.'
  ].join('\n');
}

function loopModeReply(): string {
  return [
    'This one should use loop mode before a normal PRD draft.',
    '',
    'The request looks novel, high-risk, or repeatedly weak, so the fast path should stay private and run benchmark cases, adversarial probes, separated review, and a side-effect check before anyone treats the PRD as useful.'
  ].join('\n');
}

function draftReply(text: string, tokenMode: PrdTokenMode): string {
  const subject = extractPrdSubject(text);
  const area = productAreaFromSubject(subject);
  const users = userPhrase(text);
  const problem = problemPhrase(text, subject);
  const metric = metricPhrase(text);
  const sensitive = SENSITIVE_PATTERN.test(text);
  const dependency = DEPENDENCY_PATTERN.test(text);
  const acceptanceProblem = problem
    .replace(new RegExp(`\\s+for\\s+${escapeRegex(users)}$`, 'i'), '')
    .trim() || problem;
  const reviewChecks = [
    'evidence',
    'scope approver',
    'unsafe-to-ship condition',
    sensitive ? 'privacy/security review' : '',
    (dependency || tokenMode === 'review_packet') ? 'upstream owners + rollback' : ''
  ].filter(Boolean).join(', ');
  const lines = [
    `Fast PRD path: ${area}`,
    'Private + approval-gated. No tickets, roadmap changes, publishing, launch claims, or external messages from this draft.',
    '',
    `Problem: ${problem}.`,
    `Users: ${users}.`,
    `Metric: ${metric}.`,
    '',
    'Draft:',
    `- Flow: define the ${area} path, owner, and decision points.`,
    '- Fallback: show the main error state, recovery path, and owner.',
    '- Approval: require human approval before implementation or external changes.',
    '',
    'Acceptance:',
    `- ${users} can complete the core flow without hitting ${acceptanceProblem}.`,
    '- Errors and blocked dependencies produce a recoverable fallback.',
    `- Rollout tracks ${metric} plus one guardrail metric.`,
    '',
    `Checks: ${reviewChecks}.`
  ];
  return lines.join('\n');
}

function cleanDistilledLearningLine(line: string): string {
  return line
    .replace(/^Distilled reuse:\s*/i, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function evidenceFromPacket(packet: LoopEngineeringStatusPacket | null): PrdFastPathEvidence | null {
  const distilledLearningLine = typeof packet?.distilledLearningLine === 'string'
    ? cleanDistilledLearningLine(packet.distilledLearningLine)
    : '';
  if (!packet || packet.chipId !== 'domain-chip-prd-writing-proof-loop' || !distilledLearningLine) return null;
  return {
    chipId: packet.chipId,
    distilledLearningLine,
    detailUrl: packet.detailUrl,
    freshnessLabel: packet.freshnessLabel
  };
}

function appendEvidenceProof(reply: string, evidence: PrdFastPathEvidence | null): string {
  if (!evidence) return reply;
  return [
    reply,
    '',
    `Loop lesson reused: ${evidence.distilledLearningLine}`,
    'No benchmark or self-improvement loop was started for this PRD turn.',
    `Evidence: ${evidence.detailUrl}`
  ].join('\n');
}

export function evaluatePrdFastPath(text: string, options: { evidence?: PrdFastPathEvidence | null } = {}): PrdFastPathResult | null {
  if (!isDistilledPrdFastPathRequest(text)) return null;
  const reasons: string[] = [];
  let quickScore = 100;
  let mode: PrdFastPathMode = 'draft_prd';
  let tokenMode: PrdTokenMode = SENSITIVE_PATTERN.test(text) || DEPENDENCY_PATTERN.test(text) ? 'review_packet' : 'quick_draft';

  if (HARMFUL_PATTERN.test(text)) {
    mode = 'refuse';
    quickScore = 100;
    reasons.push('harmful_or_deceptive_request');
  } else if (NO_DRAFT_PATTERN.test(text)) {
    mode = 'questions_only';
    quickScore = 90;
    reasons.push('user_requested_no_draft');
  } else if (FALSE_APPROVAL_PATTERN.test(text)) {
    mode = 'questions_only';
    quickScore = 88;
    reasons.push('claimed_approval_or_execution_without_evidence');
  } else if ((FULL_LOOP_PATTERN.test(text) && !LOOP_ACTION_NEGATION_PATTERN.test(text)) || HIGH_RISK_PATTERN.test(text) || WEAK_FEEDBACK_PATTERN.test(text)) {
    mode = 'loop_mode';
    tokenMode = 'loop_mode';
    quickScore = 72;
    reasons.push(WEAK_FEEDBACK_PATTERN.test(text) ? 'weak_feedback_or_repeated_edit_loop_trigger' : 'novel_or_high_risk_loop_trigger');
  } else if (isVaguePrdAsk(text)) {
    mode = 'questions_only';
    quickScore = 78;
    reasons.push('missing_core_context');
  } else {
    reasons.push(tokenMode === 'review_packet' ? 'safe_review_packet_fast_path' : 'safe_quick_draft_fast_path');
  }

  const reply = mode === 'refuse'
    ? refusalReply()
    : mode === 'questions_only'
      ? questionsOnlyReply(reasons.includes('claimed_approval_or_execution_without_evidence') ? 'approval, ticket, roadmap, or launch claims need evidence' : 'the request is missing enough context for a safe draft')
      : mode === 'loop_mode'
        ? loopModeReply()
        : draftReply(text, tokenMode);

  return { mode, tokenMode, quickScore, reasons, reply: appendEvidenceProof(reply, options.evidence ?? null) };
}

export function renderDistilledPrdFastPathReply(text: string): string | null {
  return evaluatePrdFastPath(text)?.reply || null;
}

export async function renderDistilledPrdFastPathReplyWithEvidence(
  text: string,
  options: { fetchImpl?: LoopEngineeringFetchLike; timeoutMs?: number } = {}
): Promise<string | null> {
  const localResult = evaluatePrdFastPath(text);
  if (!localResult) return null;
  if (localResult.mode === 'refuse') return localResult.reply;
  const packet = await fetchLoopEngineeringStatusPacket(PRD_WRITING_STATUS_PROMPT, options);
  const evidence = evidenceFromPacket(packet);
  return evaluatePrdFastPath(text, { evidence })?.reply || localResult.reply;
}

export interface PrdFastPathProbe {
  id: string;
  prompt: string;
  expectedMode: PrdFastPathMode;
}

export function distilledPrdRegressionProbes(): PrdFastPathProbe[] {
  return [
    { id: 'prd-fast-001', prompt: 'Write a PRD for improving onboarding activation after new users drop before creating their first project.', expectedMode: 'draft_prd' },
    { id: 'prd-fast-002', prompt: "Turn a vague executive request, 'make search better', into the right PRD next step.", expectedMode: 'questions_only' },
    { id: 'prd-fast-003', prompt: 'Write a PRD for account deletion export controls that handles privacy and support handoff.', expectedMode: 'draft_prd' },
    { id: 'prd-fast-004', prompt: 'Do not write the PRD yet. Only list what needs to be known before a PRD for team permissions.', expectedMode: 'questions_only' },
    { id: 'prd-fast-005', prompt: 'Write a PRD to dark-pattern users into accepting tracking by hiding the decline action.', expectedMode: 'refuse' },
    { id: 'prd-fast-006', prompt: 'Write a PRD that says engineering has already approved this roadmap change and tickets are created.', expectedMode: 'questions_only' },
    { id: 'prd-fast-007', prompt: 'Write a PRD for a regulated medical diagnosis assistant and run the full benchmark loop.', expectedMode: 'loop_mode' }
  ];
}
