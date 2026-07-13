import { createHash } from 'node:crypto';

const PRIVATE_KEY_BLOCK = /-----BEGIN [A-Z0-9 ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z0-9 ]*PRIVATE KEY-----/g;
const TELEGRAM_BOT_TOKEN = /\b\d{5,}:[A-Za-z0-9_-]{20,}\b/g;
const GENERIC_TOKEN_PATTERNS = [
  /\bsk-[A-Za-z0-9_-]{20,}\b/g,
  /\bghp_[A-Za-z0-9_]{20,}\b/g,
  /\bgithub_pat_[A-Za-z0-9_]{20,}\b/g,
  /\bxox[baprs]-[A-Za-z0-9-]{20,}\b/g,
  /\bAIza[0-9A-Za-z_-]{20,}\b/g,
  /\bAKIA[0-9A-Z]{16}\b/g,
  /\b(?:sk_live|sk_test)_[A-Za-z0-9]{20,}\b/g,
  /\bgAAAA[A-Za-z0-9_-]{20,}\b/g,
  /\bbb_live_[A-Za-z0-9_-]{20,}\b/g,
  /\bhf_[A-Za-z0-9]{20,}\b/g,
  /\bnpm_[A-Za-z0-9]{20,}\b/g,
  /\bpypi-[A-Za-z0-9_-]{20,}\b/g,
  /\bdop_v1_[A-Za-z0-9_-]{20,}\b/g,
  /\bsscli_[A-Za-z0-9._-]{20,}\b/g,
  /\bfe_[a-z]+_[A-Za-z0-9]{20,}\b/g,
];
const ENV_SECRET_ASSIGNMENT =
  /\b([A-Z0-9_]*(?:API_KEY|TOKEN|SECRET|PASSWORD|PRIVATE_KEY)[A-Z0-9_]*\s*=\s*)(["']?)([^\s"',;]+)/gi;
const JSON_SECRET_FIELD =
  /(["']?[A-Za-z0-9_]*(?:api[_-]?key|token|secret|password|private[_-]?key)["']?\s*:\s*["'])([^"']+)(["'])/gi;
const AUTH_HEADER = /\b(Authorization\s*:\s*Bearer\s+)([A-Za-z0-9._~+/=-]{12,})/gi;
const DATABASE_URL = /\b((?:postgres|postgresql|mysql|mongodb|redis):\/\/)([^@\s]+)@/gi;
const PUBLIC_HTTP_URL = /\bhttps?:\/\/[^\s<>"']+/gi;
const FILE_URL = /\bfile:\/\/\/[^\s<>"']+/gi;
const LOCAL_UNIX_ROOT = '(?:home|Users|root|tmp|var|opt|etc|srv|mnt|proc|private|workspace|app|usr|run|data|Volumes)';
const QUOTED_UNIX_PATH = new RegExp(`(["'])(\\/(?:${LOCAL_UNIX_ROOT})\\/[^"'\\r\\n]+)\\1`, 'g');
const UNQUOTED_UNIX_PATH = new RegExp(`(^|[\\s(=:])(\\/(?:${LOCAL_UNIX_ROOT})(?:\\/[^\\s"',;)}\\]]+)+)`, 'gm');
const QUOTED_TILDE_PATH = /(["'])(~\/[^"'\r\n]+)\1/g;
const UNQUOTED_TILDE_PATH = /(^|[\s(=:])(~\/[^"'\s,;)}\]]+)/gm;
const QUOTED_WINDOWS_DRIVE_PATH = /(["'])([A-Za-z]:[\\/][^"'\r\n]+)\1/g;
const UNQUOTED_WINDOWS_DRIVE_PATH = /(^|[\s(=:])([A-Za-z]:[\\/][^"'\s,;)}\]]+)/gm;
const QUOTED_WINDOWS_UNC_PATH = /(["'])(\\\\(?:\?\\)?[^"'\r\n]+)\1/g;
const UNQUOTED_WINDOWS_UNC_PATH = /(^|[\s(=:])(\\\\(?:\?\\)?[^"'\s,;)}\]]+)/gm;

let consoleRedactionInstalled = false;

export function maskSecret(secret: string): string {
  if (secret.length < 18) {
    return '***';
  }
  return `${secret.slice(0, 6)}...${secret.slice(-4)}`;
}

export function redactText(input: string): string {
  if (!input) return input;
  let out = input.replace(PRIVATE_KEY_BLOCK, '[REDACTED_PRIVATE_KEY]');
  out = out.replace(TELEGRAM_BOT_TOKEN, (secret) => maskSecret(secret));
  for (const pattern of GENERIC_TOKEN_PATTERNS) {
    out = out.replace(pattern, (secret) => maskSecret(secret));
  }
  out = out.replace(ENV_SECRET_ASSIGNMENT, (_match, prefix: string, quote: string, secret: string) => {
    return `${prefix}${quote}${maskSecret(secret)}`;
  });
  out = out.replace(JSON_SECRET_FIELD, (_match, prefix: string, secret: string, suffix: string) => {
    return `${prefix}${maskSecret(secret)}${suffix}`;
  });
  out = out.replace(AUTH_HEADER, (_match, prefix: string, secret: string) => `${prefix}${maskSecret(secret)}`);
  out = out.replace(DATABASE_URL, (_match, prefix: string) => `${prefix}***@`);
  return redactLocalPaths(out);
}

function redactLocalPaths(input: string): string {
  let out = input.replace(FILE_URL, '[REDACTED_PATH]');
  const publicUrls: string[] = [];
  out = out.replace(PUBLIC_HTTP_URL, (url) => {
    const token = `__SPARK_PUBLIC_URL_${publicUrls.length}__`;
    publicUrls.push(url);
    return token;
  });
  for (const pattern of [QUOTED_UNIX_PATH, QUOTED_TILDE_PATH, QUOTED_WINDOWS_DRIVE_PATH, QUOTED_WINDOWS_UNC_PATH]) {
    out = out.replace(pattern, (_match, quote: string) => `${quote}[REDACTED_PATH]${quote}`);
  }
  for (const pattern of [UNQUOTED_UNIX_PATH, UNQUOTED_TILDE_PATH, UNQUOTED_WINDOWS_DRIVE_PATH, UNQUOTED_WINDOWS_UNC_PATH]) {
    out = out.replace(pattern, (_match, prefix: string) => `${prefix}[REDACTED_PATH]`);
  }
  return out.replace(/__SPARK_PUBLIC_URL_(\d+)__/g, (_match, index: string) => publicUrls[Number(index)] ?? '[REDACTED_URL]');
}

export function redactForLog(value: unknown): unknown {
  if (typeof value === 'string') {
    return redactText(value);
  }
  if (value instanceof Error) {
    return redactText(value.stack || value.message);
  }
  if (value && typeof value === 'object') {
    try {
      return JSON.parse(JSON.stringify(value, (_key, nested) => (
        typeof nested === 'string' ? redactText(nested) : nested
      )));
    } catch {
      return redactText(String(value));
    }
  }
  return value;
}

export function redactIdentifier(value: string | number | null | undefined, prefix = 'id'): string {
  const text = String(value ?? '').trim();
  if (!text || text === 'unknown') {
    return 'unknown';
  }
  const safePrefix = String(prefix || 'id').replace(/[^A-Za-z0-9_]/g, '_') || 'id';
  if (new RegExp(`^${safePrefix}_[a-f0-9]{16}$`, 'i').test(text)) {
    return text;
  }
  const digest = createHash('sha256').update(text).digest('hex').slice(0, 16);
  return `${safePrefix}_${digest}`;
}

export function installConsoleRedaction(): void {
  if (consoleRedactionInstalled) return;
  consoleRedactionInstalled = true;
  for (const method of ['debug', 'error', 'info', 'log', 'warn'] as const) {
    const original = console[method].bind(console);
    console[method] = ((...args: unknown[]) => {
      original(...args.map(redactForLog));
    }) as typeof console[typeof method];
  }
}
