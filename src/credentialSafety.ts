const SENSITIVE_CREDENTIAL_PLACEHOLDER = '[sensitive credential omitted from Telegram memory]';

const EXPLICIT_CREDENTIAL_ASSIGNMENT =
  /\b(?:password|passcode|passphrase|pin|api[_\s-]?key|access[_\s-]?token|refresh[_\s-]?token|auth[_\s-]?token|bearer[_\s-]?token|credential|secret)\b\s*(?:is\b|[:=])\s*(?:["'][^"'\r\n]{4,}["']|\S{4,})/i;

const CREDENTIAL_VALUE_PATTERNS = [
  /\bsk-(?:ant-|proj-)?[A-Za-z0-9_-]{16,}\b/i,
  /\bgithub_pat_[A-Za-z0-9_]{16,}\b/i,
  /\bgh[pousr]_[A-Za-z0-9]{16,}\b/i,
  /\bxox[baprs]-[A-Za-z0-9-]{16,}\b/i,
  /\bAKIA[0-9A-Z]{16}\b/,
  /\bAIza[0-9A-Za-z_-]{20,}\b/,
  /\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\b/,
  /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/i
];

export function containsSensitiveCredentialMaterial(text: string): boolean {
  const normalized = text.trim();
  if (!normalized) return false;
  return EXPLICIT_CREDENTIAL_ASSIGNMENT.test(normalized) ||
    CREDENTIAL_VALUE_PATTERNS.some((pattern) => pattern.test(normalized));
}

export function sanitizeCredentialMemoryText(text: string): string {
  return containsSensitiveCredentialMaterial(text) ? SENSITIVE_CREDENTIAL_PLACEHOLDER : text;
}

export function isCredentialSetupQuestion(text: string): boolean {
  const normalized = text.toLowerCase().replace(/\s+/g, ' ').trim();
  if (!normalized) return false;
  const credentialSubject = /\b(?:credentials?|api\s*keys?|github\s+(?:pat|tokens?)|access\s+tokens?|provider\s+keys?|secrets?)\b/.test(normalized);
  const setupIntent = /\b(?:set\s*up|setup|configure|connect|add|install|where|how|credentials?\s+(?:set|list|delete))\b/.test(normalized);
  const sparkContext = /\b(?:spark|openai|anthropic|claude|openrouter|github|zai|kimi|minimax|hugging\s*face|provider)\b/.test(normalized);
  return credentialSubject && setupIntent && sparkContext;
}

export function credentialSafetyReply(text: string): string | null {
  if (containsSensitiveCredentialMaterial(text)) {
    return "I won't store or pass that credential along. Treat anything pasted here as exposed: rotate or change it, then configure the replacement from your local terminal.";
  }
  if (isCredentialSetupQuestion(text)) {
    return "Set it up from your local terminal with `spark setup`; do not paste the value into Telegram. Tell me which provider or integration—without the secret—and I can give you the exact local step.";
  }
  return null;
}
