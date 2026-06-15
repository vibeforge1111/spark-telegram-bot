/**
 * User input sanitization layer for LLM calls.
 *
 * Wraps user input in clear trust-boundary delimiters so the LLM can
 * distinguish between system instructions and untrusted user data.
 * Truncates overly long inputs and flags encoded payload patterns.
 */

export const UNTRUSTED_OPEN = '[UNTRUSTED_USER_INPUT_START]';
export const UNTRUSTED_CLOSE = '[UNTRUSTED_USER_INPUT_END]';

const MAX_INPUT_LENGTH = 4096;

/** Simple heuristic: does this text look like a prompt injection attempt? */
export function detectInjectionSignals(text: string): string[] {
  const signals: string[] = [];

  // Common injection phrases
  const injectionPatterns = [
    /ignore\s+(all\s+)?(previous|prior|above|earlier)\s+instructions/i,
    /you\s+are\s+now\s+(in\s+)?(debug|admin|developer|root)\s+mode/i,
    /system\s*prompt/i,
    /output\s+(the\s+)?(full\s+)?system\s+prompt/i,
    /forget\s+(everything|all|your)\s+(you|instructions)/i,
    /new\s+instructions/i,
    /override\s+(your|all|the)\s+(instructions|rules|constraints)/i,
    /act\s+as\s+(if|a)\s+(you\s+)?(have\s+no|without)\s+(restrictions|rules|limitations)/i,
    /do\s+not\s+follow\s+(your|any|the)\s+(previous|prior|existing)/i,
    /disregard\s+(all|any|previous)/i,
  ];

  for (const pat of injectionPatterns) {
    if (pat.test(text)) {
      signals.push(`injection_phrase:${pat.source.slice(0, 40)}`);
    }
  }

  // Delimiter breaking attempts
  if (text.includes('<<<') || text.includes('>>>')) {
    signals.push('delimiter_break_attempt');
  }

  // Markdown/system-role mimicry
  if (/^###?\s*(system|assistant|instructions)/im.test(text)) {
    signals.push('role_mimicry');
  }

  return signals;
}

/**
 * Sanitize user input before sending to LLM.
 * Returns the wrapped and optionally truncated input.
 */
export function sanitizeUserInput(text: string): {
  sanitized: string;
  truncated: boolean;
  injectionSignals: string[];
  originalLength: number;
} {
  const originalLength = text.length;
  const injectionSignals = detectInjectionSignals(text);

  let processed = text;
  let truncated = false;

  if (processed.length > MAX_INPUT_LENGTH) {
    processed = processed.slice(0, MAX_INPUT_LENGTH);
    truncated = true;
  }

  return {
    sanitized: `${UNTRUSTED_OPEN}\n${processed}\n${UNTRUSTED_CLOSE}`,
    truncated,
    injectionSignals,
    originalLength,
  };
}
