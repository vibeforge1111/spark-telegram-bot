export type ConversationStyleIssueCode =
  | 'single_newline_paragraph_join'
  | 'excessive_blank_space'
  | 'paragraph_too_long'
  | 'markdown_bold'
  | 'dash_family'
  | 'secret_like_text'
  | 'internal_jargon'
  | 'plan_dump'
  | 'generic_chatbox_voice';

export type ConversationStyleIssue = {
  code: ConversationStyleIssueCode;
  message: string;
};

export type ConversationStyleLintOptions = {
  maxParagraphWords?: number;
};

const DEFAULT_MAX_PARAGRAPH_WORDS = 38;

const INTERNAL_JARGON_PATTERNS: RegExp[] = [
  /\bcontext_packet\b/i,
  /\bsource_ledger\b/i,
  /\btool_result_received\b/i,
  /\bmemory inspect-capsule\b/i,
  /\bspark_intelligence\.cli\b/i,
  /\brunpy\b/i,
  /\btraceback\b/i,
  /\bcommand failed\b/i,
  /\braw_turn\b/i
];

const PLAN_DUMP_PATTERNS: RegExp[] = [
  /\bimplementation plan\b/i,
  /\bphase\s+\d+\b/i,
  /\bstep\s+\d+\s*:/i,
  /\barchitecture\s+overview\b/i
];

const GENERIC_CHATBOX_PATTERNS: RegExp[] = [
  /\bas an ai(?: language model)?\b/i,
  /\bhow (?:may|can) i assist you(?: today)?\??\b/i,
  /\bis there anything else i can help (?:you )?with\??\b/i,
  /\bi understand (?:that )?you(?:'re| are) looking for\b/i,
  /\bcertainly[!.]?\s+(?:here(?:'s| is)|i can help)\b/i,
  /\bsure[!.]?\s+here(?:'s| is)\b/i,
  /\bi'?m sorry,? but i (?:can'?t|cannot)\b/i
];

function wordsIn(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

function pushOnce(
  issues: ConversationStyleIssue[],
  code: ConversationStyleIssueCode,
  message: string
): void {
  if (!issues.some((issue) => issue.code === code)) {
    issues.push({ code, message });
  }
}

export function lintTelegramConversationStyle(
  text: string,
  options: ConversationStyleLintOptions = {}
): ConversationStyleIssue[] {
  const issues: ConversationStyleIssue[] = [];
  const maxParagraphWords = options.maxParagraphWords ?? DEFAULT_MAX_PARAGRAPH_WORDS;

  if (/[^\n]\n[^\n]/.test(text)) {
    pushOnce(
      issues,
      'single_newline_paragraph_join',
      'Separate distinct Telegram paragraph groups with a blank line.'
    );
  }

  if (/\n{3,}/.test(text)) {
    pushOnce(issues, 'excessive_blank_space', 'Avoid decorative vertical gaps in Telegram replies.');
  }

  for (const paragraph of text.split(/\n\n+/).map((part) => part.trim()).filter(Boolean)) {
    if (wordsIn(paragraph) > maxParagraphWords) {
      pushOnce(
        issues,
        'paragraph_too_long',
        `Keep each Telegram paragraph at or below ${maxParagraphWords} words.`
      );
      break;
    }
  }

  if (/\*\*[^*]+\*\*/.test(text)) {
    pushOnce(issues, 'markdown_bold', 'Telegram launch replies should not rely on bold Markdown.');
  }

  if (/[\u2012\u2013\u2014\u2015\u2212]/.test(text)) {
    pushOnce(issues, 'dash_family', 'Use a plain hyphen instead of dash-family characters.');
  }

  if (/\b(?:sk-[a-z0-9_-]{12,}|token=|api[_-]?key=|secret=)/i.test(text)) {
    pushOnce(issues, 'secret_like_text', 'Do not expose secret-like material in user-facing replies.');
  }

  for (const pattern of INTERNAL_JARGON_PATTERNS) {
    if (pattern.test(text)) {
      pushOnce(issues, 'internal_jargon', 'Keep internal trace, packet, and exception jargon out of normal replies.');
      break;
    }
  }

  for (const pattern of PLAN_DUMP_PATTERNS) {
    if (pattern.test(text)) {
      pushOnce(issues, 'plan_dump', 'Avoid plan-dump framing when a short conversational answer fits.');
      break;
    }
  }

  for (const pattern of GENERIC_CHATBOX_PATTERNS) {
    if (pattern.test(text)) {
      pushOnce(issues, 'generic_chatbox_voice', 'Avoid generic support-chat phrasing; answer with context-aware Spark voice.');
      break;
    }
  }

  return issues;
}

export function lintTelegramReplySafety(text: string): ConversationStyleIssue[] {
  return lintTelegramConversationStyle(text).filter(
    (issue) => issue.code !== 'single_newline_paragraph_join' && issue.code !== 'paragraph_too_long'
  );
}
