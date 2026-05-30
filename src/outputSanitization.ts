/**
 * LLM output sanitization.
 *
 * Strips potentially dangerous content from LLM responses before
 * sending them to Telegram users. Prevents prompt injection payloads
 * from being reflected back, and blocks accidental exposure of
 * system internals.
 */

/** Patterns that should never appear in LLM output to end users */
const DANGEROUS_PATTERNS: Array<{ pattern: RegExp; reason: string }> = [
  // System prompt leakage
  { pattern: /SPARK_SYSTEM_PRIMER/gi, reason: 'system_prompt_leak' },
  { pattern: /\[UNTRUSTED_DATA\]/gi, reason: 'delimiter_leak' },
  { pattern: /\[\/UNTRUSTED_DATA\]/gi, reason: 'delimiter_leak' },
  { pattern: /\[UNTRUSTED_USER_INPUT_START\]/gi, reason: 'delimiter_leak' },
  { pattern: /\[UNTRUSTED_USER_INPUT_END\]/gi, reason: 'delimiter_leak' },

  // Path disclosure
  { pattern: /\/home\/\w+\/spark/gi, reason: 'path_disclosure' },
  { pattern: /\/root\/spark/gi, reason: 'path_disclosure' },
  { pattern: /\/tmp\/spark/gi, reason: 'path_disclosure' },

  // Environment variable leakage
  { pattern: /OPENAI_API_KEY|ANTHROPIC_API_KEY|BUILDER_API_KEY/gi, reason: 'env_key_leak' },

  // Injection reflection (LLM echoing back attack payloads)
  { pattern: /ignore (all )?previous instructions/gi, reason: 'injection_reflection' },
  { pattern: /you are now (in )?(debug|admin|root|developer) mode/gi, reason: 'injection_reflection' },
  { pattern: /output the (full )?system prompt/gi, reason: 'injection_reflection' },
];

export interface SanitizedOutput {
  text: string;
  wasModified: boolean;
  strippedPatterns: string[];
}

/**
 * Sanitize LLM output before sending to user.
 * Strips dangerous patterns and returns cleaned text.
 */
export function sanitizeLlmOutput(text: string): SanitizedOutput {
  const strippedPatterns: string[] = [];
  let clean = text;

  for (const { pattern, reason } of DANGEROUS_PATTERNS) {
    const matches = clean.match(pattern);
    if (matches) {
      strippedPatterns.push(reason);
      clean = clean.replace(pattern, '[REDACTED]');
    }
  }

  // Trim excessive newlines that could break Telegram formatting
  clean = clean.replace(/\n{4,}/g, '\n\n\n');

  return {
    text: clean,
    wasModified: strippedPatterns.length > 0,
    strippedPatterns,
  };
}
