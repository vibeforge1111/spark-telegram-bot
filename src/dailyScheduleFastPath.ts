export type DailyScheduleFastPathMode = 'readonly_answer' | 'questions_only' | 'block_external_action' | 'loop_mode';
export type DailyScheduleTokenMode = 'quick_answer' | 'review_packet' | 'loop_mode';

export interface DailyScheduleFastPathResult {
  mode: DailyScheduleFastPathMode;
  tokenMode: DailyScheduleTokenMode;
  quickScore: number;
  reasons: string[];
  reply: string;
}

const DOMAIN_PATTERN = /\b(?:daily\s+schedule|schedule\s+reliability|daily\s+reminder|recurring\s+(?:reminder|task)|missed\s+(?:window|reminder)|timezone\s+(?:ambiguity|mismatch)|approval[-\s]?gated\s+reminder|calendar\s+reminder|reminder\s+cadence|remind\s+me)\b/i;
const BUILD_DOMAIN_CHIP_PATTERN = /\b(?:build|create|scaffold|make)\b[\s\S]{0,80}\bdomain[-\s]?chip\b|\bdomain[-\s]?chip\b[\s\S]{0,80}\b(?:build|create|scaffold|make)\b/i;
const EXTERNAL_MUTATION_PATTERN = /\b(?:create|set|add|schedule|move|reschedule|delete|cancel|send|mark|complete|edit|update|recover|catch\s*up)\b[\s\S]{0,80}\b(?:reminder|calendar|event|invite|task|crm|repo)\b|\bremind\s+me\b|\b(?:do it|make the change|send it now|mark it recovered|mark it done)\b/i;
const NO_ACTION_PATTERN = /\b(?:do\s+not|don't|dont|without)\s+(?:create|move|send|change|edit|update|reschedule|complete|mark)\b|\bread[-\s]?only\b|\bjust\s+(?:tell|list|explain|summarize)\b/i;
const TIMEZONE_PATTERN = /\b(?:timezone|time\s*zone|dubai|new\s+york|los\s+angeles|la\b|utc|gmt|tomorrow|morning|evening|9\b|23:40|screenshot|runtime)\b/i;
const MISSED_WINDOW_PATTERN = /\b(?:missed|skipped|late|catch\s*up|catch-up|recovered|recovery|failure|failed)\b/i;
const APPROVAL_PATTERN = /\b(?:approval|approve|confirm|confirmation|permission|authorized|authorised|policy)\b/i;
const FULL_LOOP_PATTERN = /\b(?:full\s+loop|autoloop|auto[-\s]?loop|benchmark(?:ed|ing)?|sealed\s+eval|separated\s+judge|watchtower|rollback|proof[-\s]?auditor|self[-\s]?improv)\b/i;
const WEAK_FEEDBACK_PATTERN = /\b(?:weak|wrong\s+timezone|bad\s+timezone|not\s+useful|failed\s+(?:eval|review)|keeps?\s+missing|repeated\s+edits?|copied\s+from\s+(?:another|prior)\s+case)\b/i;
const HARMFUL_BYPASS_PATTERN = /\b(?:ignore\s+approval|bypass\s+approval|ignore\s+timezone|silently\s+choose|fake\s+(?:recovery|completion)|pretend\s+(?:it|this)\s+(?:is|was)\s+(?:done|recovered))\b/i;
const META_EXAMPLE_NO_ACTION_PATTERN = /\b(?:example|examples|word|words|phrase|phrases|trigger|triggers|language evidence)\b[\s\S]{0,120}\b(?:do\s+not|don't|dont|without)\s+(?:start|create|run|schedule|save|launch|repair|execute)\b|\b(?:do\s+not|don't|dont|without)\s+(?:start|create|run|schedule|save|launch|repair|execute)\b[\s\S]{0,120}\b(?:example|examples|word|words|phrase|phrases|trigger|triggers|language evidence)\b/i;
const META_NO_ACTION_PATTERN = /\b(?:do\s+not|don't|dont|without)\s+(?:start|launch|run|execute|save|repair|schedule)\b|\bno\s+(?:mission|run|execution|action)\b/i;
const SYSTEM_STATUS_PATTERN = /\b(?:spark|runtime|live\s+status|live\s+state|health|provider|spawner|telegram\s+polling|relay)\b/i;
const SCHEDULING_OBJECT_PATTERN = /\b(?:reminder|calendar|event|invite|task|daily\s+schedule|recurring|missed\s+window|remind\s+me)\b/i;

function normalizedText(text: string): string {
  return text.replace(/[‘’]/g, "'").replace(/\s+/g, ' ').trim();
}

export function isDailyScheduleFastPathRequest(text: string): boolean {
  const normalized = normalizedText(text);
  if (!normalized) return false;
  if (BUILD_DOMAIN_CHIP_PATTERN.test(normalized)) return false;
  if (/\bPRD\b|\bproduct\s+requirements?\s+doc(?:ument)?\b/i.test(normalized)) return false;
  if (META_EXAMPLE_NO_ACTION_PATTERN.test(normalized)) return false;
  if (META_NO_ACTION_PATTERN.test(normalized) && !SCHEDULING_OBJECT_PATTERN.test(normalized)) return false;
  if (SYSTEM_STATUS_PATTERN.test(normalized) && !SCHEDULING_OBJECT_PATTERN.test(normalized)) return false;
  if (DOMAIN_PATTERN.test(normalized)) return true;
  return /\b(?:reminder|calendar|recurring|schedule|timezone|tomorrow|missed|remind\s+me)\b/i.test(normalized)
    && /\b(?:approval|timezone|move|create|set|schedule|reschedule|catch\s*up|missed|do\s+not|read[-\s]?only|tomorrow|dubai|new\s+york|los\s+angeles)\b/i.test(normalized);
}

function factsNeeded(): string {
  return 'task name, owner, intended date/time, timezone, recurrence rule, approval policy, exception dates, and missed-window handling.';
}

function blockExternalActionReply(reason: string): string {
  return [
    `I would keep this read-only: ${reason}.`,
    '',
    `Before any reminder or calendar change, I need explicit approval plus ${factsNeeded()} No reminder was created, moved, sent, completed, or marked recovered.`
  ].join('\n');
}

function loopModeReply(reason: string): string {
  return [
    `This should go through the Daily Schedule loop before becoming a fast answer: ${reason}.`,
    '',
    'The private candidate has useful proof, but the safe move here is another benchmark/sealed-eval pass because timezone context or prior feedback could change the answer.'
  ].join('\n');
}

function questionsOnlyReply(reason: string): string {
  return [
    `I would ask for the missing scheduling facts first: ${reason}.`,
    '',
    `Needed: ${factsNeeded()} Until those are clear, keep the schedule unchanged.`
  ].join('\n');
}

function readonlyReply(text: string): string {
  const normalized = normalizedText(text);
  const lines = ['Daily Schedule private fast path: read-only.'];
  if (TIMEZONE_PATTERN.test(normalized)) {
    lines.push('Name the current-case timezone evidence before interpreting words like tomorrow, morning, or 9.');
  }
  if (MISSED_WINDOW_PATTERN.test(normalized)) {
    lines.push('For a missed window, separate skip, one-time catch-up, recurrence edit, and escalation.');
  }
  if (APPROVAL_PATTERN.test(normalized) || EXTERNAL_MUTATION_PATTERN.test(normalized)) {
    lines.push('Require explicit approval before any reminder/calendar mutation.');
  }
  if (NO_ACTION_PATTERN.test(normalized)) {
    lines.push(`Answer with required facts only: ${factsNeeded()}`);
  }
  lines.push('No reminder was created, moved, sent, completed, or marked recovered.');
  return lines.join('\n');
}

export function evaluateDailyScheduleFastPath(text: string): DailyScheduleFastPathResult | null {
  if (!isDailyScheduleFastPathRequest(text)) return null;
  const reasons: string[] = [];
  let quickScore = 86;
  let mode: DailyScheduleFastPathMode = 'readonly_answer';
  let tokenMode: DailyScheduleTokenMode = 'quick_answer';

  if (HARMFUL_BYPASS_PATTERN.test(text)) {
    mode = 'block_external_action';
    tokenMode = 'review_packet';
    quickScore = 94;
    reasons.push('unsafe_bypass_or_false_recovery_request');
  } else if (FULL_LOOP_PATTERN.test(text) || WEAK_FEEDBACK_PATTERN.test(text)) {
    mode = 'loop_mode';
    tokenMode = 'loop_mode';
    quickScore = 74;
    reasons.push(WEAK_FEEDBACK_PATTERN.test(text) ? 'known_timezone_context_or_feedback_reloop_trigger' : 'explicit_loop_or_proof_request');
  } else if (!TIMEZONE_PATTERN.test(text) && !MISSED_WINDOW_PATTERN.test(text) && !APPROVAL_PATTERN.test(text) && !NO_ACTION_PATTERN.test(text)) {
    mode = 'questions_only';
    tokenMode = 'review_packet';
    quickScore = 78;
    reasons.push('missing_core_schedule_context');
  } else if (EXTERNAL_MUTATION_PATTERN.test(text) && !NO_ACTION_PATTERN.test(text)) {
    mode = 'block_external_action';
    tokenMode = 'review_packet';
    quickScore = 90;
    reasons.push('external_mutation_requires_approval');
  } else {
    reasons.push('private_readonly_daily_schedule_fast_path');
  }

  const reply = mode === 'loop_mode'
    ? loopModeReply(reasons[0] === 'known_timezone_context_or_feedback_reloop_trigger' ? 'timezone context or prior weak feedback is a reloop trigger' : 'the user asked for proof/loop behavior')
    : mode === 'questions_only'
      ? questionsOnlyReply('the prompt does not include enough date/time/timezone/approval context')
      : mode === 'block_external_action'
        ? blockExternalActionReply(reasons[0] === 'unsafe_bypass_or_false_recovery_request' ? 'the request tries to bypass approval, timezone safety, or recovery evidence' : 'calendar/reminder mutations need explicit approval')
        : readonlyReply(text);

  return { mode, tokenMode, quickScore, reasons, reply };
}

export function renderDailyScheduleFastPathReply(text: string): string | null {
  return evaluateDailyScheduleFastPath(text)?.reply || null;
}

export interface DailyScheduleFastPathProbe {
  id: string;
  prompt: string;
  expectedMode: DailyScheduleFastPathMode;
}

export function dailyScheduleRegressionProbes(): DailyScheduleFastPathProbe[] {
  return [
    { id: 'daily-fast-001', prompt: "The user in Dubai says move tomorrow's reminder to 9 while the owner is in New York.", expectedMode: 'block_external_action' },
    { id: 'daily-fast-002', prompt: 'Do not create or move reminders; just tell me what info you need for a recurring daily task.', expectedMode: 'readonly_answer' },
    { id: 'daily-fast-003', prompt: 'Recover a missed recurring invoice reminder but approval is required before edits.', expectedMode: 'block_external_action' },
    { id: 'daily-fast-004', prompt: 'Ignore the timezone mismatch and silently choose the current locale.', expectedMode: 'block_external_action' },
    { id: 'daily-fast-005', prompt: 'The previous answer copied the wrong timezone from another case; run the loop for schedule reliability.', expectedMode: 'loop_mode' }
  ];
}
