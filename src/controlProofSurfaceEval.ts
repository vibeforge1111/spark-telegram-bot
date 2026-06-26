import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { LEGACY_PROMPT_SURFACE_BLOCKED_REFS } from './controlProofLegacyPromptSurface';
import type { ControlProofCanaryObservationTemplate } from './controlProofLiveCanaryPack';

export type SurfaceEvalIssueCode =
  | 'missing_reply'
  | 'raw_reason_code'
  | 'raw_proof_ref'
  | 'raw_trace_ref'
  | 'local_path'
  | 'stack_trace'
  | 'generic_chatbot_voice'
  | 'report_card_voice'
  | 'markdown_bold'
  | 'dash_family'
  | 'emoji_spam'
  | 'paragraph_too_long'
  | 'proof_panel_on_natural_surface'
  | 'legacy_source_reference';

export interface SurfaceEvalIssue {
  caseId: string;
  code: SurfaceEvalIssueCode;
  detail: string;
}

export interface SurfaceEvalCaseResult {
  caseId: string;
  replyShape: string;
  checked: boolean;
  issueCodes: SurfaceEvalIssueCode[];
}

export interface SurfaceEvalResult {
  ok: boolean;
  observationPath: string;
  checkedCases: number;
  skippedCases: number;
  issues: SurfaceEvalIssue[];
  cases: SurfaceEvalCaseResult[];
}

const CHECKED_REPLY_SHAPES = new Set(['natural', 'compact_card', 'media_reply', 'clarification']);
const MAX_PARAGRAPH_WORDS = 70;
const STATUS_ICON_PATTERN = /✅|⚠️|🟢|🟡|🔴|⚪|🛠️|✨/gu;

const ISSUE_RULES: Array<{ code: SurfaceEvalIssueCode; pattern: RegExp; detail: string }> = [
  {
    code: 'raw_reason_code',
    pattern: /\b(?:tool_not_allowed_by_policy|owner_mismatch|route_not_selected_by_turn_envelope|governor_outcome_deny|harness_core(?::[A-Za-z0-9_-]+)?)\b/i,
    detail: 'Raw Harness or policy reason code is visible.'
  },
  {
    code: 'raw_proof_ref',
    pattern: /\b(?:turn:sha256:[a-f0-9]{12,}|proof_capsule|proofCapsule|harnessProofRef)\b/i,
    detail: 'Raw proof reference is visible outside an inspect surface.'
  },
  {
    code: 'raw_trace_ref',
    pattern: /\b(?:trace:(?:sha256:)?[a-z0-9][a-z0-9_.:-]{7,}|trace_id|request_id|traceRef|trace_ref)\b/i,
    detail: 'Raw trace or request reference is visible outside an inspect surface.'
  },
  {
    code: 'local_path',
    pattern: /\b(?:\/Users\/|\/var\/folders\/|\/private\/tmp\/|[A-Za-z]:\\)/,
    detail: 'Local filesystem path is visible.'
  },
  {
    code: 'stack_trace',
    pattern: /\b(?:Traceback \(most recent call last\)|at\s+\S.*:\d+:\d+|Command failed:)/i,
    detail: 'Stack trace or command failure text is visible.'
  },
  {
    code: 'generic_chatbot_voice',
    pattern: /\b(?:as an ai(?: language model)?|how (?:may|can) i assist you|certainly[!.]?\s+(?:here(?:'s| is)|i can help)|is there anything else i can help)\b/i,
    detail: 'Reply sounds like a generic support chatbot instead of Spark.'
  },
  {
    code: 'report_card_voice',
    pattern: /^(?:Mission|Provider|Move|Status|Result|Tasks|Relay):?\s*$/im,
    detail: 'Natural surface uses standalone report-card headings.'
  },
  {
    code: 'markdown_bold',
    pattern: /\*\*[^*]+\*\*/,
    detail: 'Reply relies on bold Markdown instead of plain Telegram composition.'
  },
  {
    code: 'dash_family',
    pattern: /[\u2012\u2013\u2014\u2015\u2212]/,
    detail: 'Reply uses dash-family punctuation that should be normalized before Telegram.'
  },
  {
    code: 'proof_panel_on_natural_surface',
    pattern: /\bHarness Proof\b|\bEvidence proof refs\b|\bAudit fresh-strict\b/i,
    detail: 'Proof-panel text leaked into a natural surface.'
  }
];

function readObservations(observationPath: string): ControlProofCanaryObservationTemplate {
  return JSON.parse(readFileSync(observationPath, 'utf8')) as ControlProofCanaryObservationTemplate;
}

function defaultObservationPath(repoRoot: string): string {
  return path.join(repoRoot, 'outputs', 'live-canary-full', 'live-canary-observations.json');
}

function issueCodesForReply(text: string): Array<Omit<SurfaceEvalIssue, 'caseId'>> {
  const issues: Array<Omit<SurfaceEvalIssue, 'caseId'>> = [];
  for (const rule of ISSUE_RULES) {
    if (rule.pattern.test(text)) {
      issues.push({ code: rule.code, detail: rule.detail });
    }
  }

  const lowerText = text.toLocaleLowerCase();
  for (const ref of LEGACY_PROMPT_SURFACE_BLOCKED_REFS) {
    const pattern = ref.patterns.find((entry) => lowerText.includes(entry.toLocaleLowerCase()));
    if (pattern) {
      issues.push({
        code: 'legacy_source_reference',
        detail: `Legacy source reference leaked into reply surface: ${ref.label}.`
      });
      break;
    }
  }

  const emojiCount = (text.match(STATUS_ICON_PATTERN) || []).length;
  if (emojiCount > 2) {
    issues.push({ code: 'emoji_spam', detail: 'Reply uses too many status emoji for a normal surface.' });
  }

  for (const paragraph of text.split(/\n\n+/).map((entry) => entry.trim()).filter(Boolean)) {
    const wordCount = paragraph.split(/\s+/).filter(Boolean).length;
    if (wordCount > MAX_PARAGRAPH_WORDS) {
      issues.push({ code: 'paragraph_too_long', detail: `Paragraph has ${wordCount} words; max is ${MAX_PARAGRAPH_WORDS}.` });
      break;
    }
  }

  return issues;
}

export function checkSurfaceEval(input: {
  repoRoot?: string;
  observationPath?: string;
  observations?: ControlProofCanaryObservationTemplate;
} = {}): SurfaceEvalResult {
  const repoRoot = input.repoRoot || process.cwd();
  const observationPath = input.observationPath || defaultObservationPath(repoRoot);
  if (!input.observations && !existsSync(observationPath)) {
    return {
      ok: false,
      observationPath,
      checkedCases: 0,
      skippedCases: 0,
      issues: [{ caseId: 'surface_eval', code: 'missing_reply', detail: `Observation packet is missing: ${observationPath}.` }],
      cases: []
    };
  }

  const observations = input.observations || readObservations(observationPath);
  const issues: SurfaceEvalIssue[] = [];
  const cases: SurfaceEvalCaseResult[] = [];
  let checkedCases = 0;
  let skippedCases = 0;

  for (const entry of observations.cases) {
    const replyShape = entry.expected.replyShape;
    if (!CHECKED_REPLY_SHAPES.has(replyShape)) {
      skippedCases += 1;
      cases.push({ caseId: entry.id, replyShape, checked: false, issueCodes: [] });
      continue;
    }

    checkedCases += 1;
    const reply = String(entry.observed.reply || '').trim();
    const caseIssues: SurfaceEvalIssue[] = [];
    if (!reply) {
      caseIssues.push({ caseId: entry.id, code: 'missing_reply', detail: 'Observed reply is missing.' });
    } else {
      for (const issue of issueCodesForReply(reply)) {
        caseIssues.push({ caseId: entry.id, ...issue });
      }
    }
    issues.push(...caseIssues);
    cases.push({
      caseId: entry.id,
      replyShape,
      checked: true,
      issueCodes: caseIssues.map((issue) => issue.code)
    });
  }

  return {
    ok: issues.length === 0,
    observationPath,
    checkedCases,
    skippedCases,
    issues,
    cases
  };
}

export function formatSurfaceEvalReport(result: SurfaceEvalResult): string {
  const lines = [
    'Control-proof surface eval',
    `Status: ${result.ok ? 'clean' : 'gaps found'}`,
    `Observation packet: ${result.observationPath}`,
    `Checked cases: ${result.checkedCases}`,
    `Skipped inspect cases: ${result.skippedCases}`,
    `Issues: ${result.issues.length}`
  ];

  if (result.issues.length) {
    lines.push('', 'Issue samples:');
    for (const issue of result.issues.slice(0, 12)) {
      lines.push(`- ${issue.caseId}: ${issue.code} | ${issue.detail}`);
    }
  }

  return lines.join('\n');
}
