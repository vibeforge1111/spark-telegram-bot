const EXACT_SENSITIVE_ENV_KEYS = new Set([
  'BOT_TOKEN',
  'TEST_BOT_TOKEN',
  'TELEGRAM_BOT_TOKEN',
  'TELEGRAM_TOKEN',
  'SPARK_PROFILE_TOKEN_MISSING'
]);

const SENSITIVE_ENV_KEY_PATTERNS: RegExp[] = [
  /^TELEGRAM_.*_TOKEN$/i,
  /^SPARK_TELEGRAM_.*TOKEN/i
];

export function isSensitiveBuilderChildEnvKey(key: string): boolean {
  if (EXACT_SENSITIVE_ENV_KEYS.has(key)) {
    return true;
  }
  return SENSITIVE_ENV_KEY_PATTERNS.some((pattern) => pattern.test(key));
}

export function sanitizeBuilderChildProcessEnv(env: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  const sanitized: NodeJS.ProcessEnv = { ...env };
  for (const key of Object.keys(sanitized)) {
    if (isSensitiveBuilderChildEnvKey(key)) {
      delete sanitized[key];
    }
  }
  return sanitized;
}
