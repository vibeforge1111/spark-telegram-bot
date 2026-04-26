import { redactText } from './redaction';

export type SparkErrorContext =
  | 'chat'
  | 'memory'
  | 'builder'
  | 'spawner'
  | 'telegram'
  | 'diagnose'
  | 'mission';

export interface SparkErrorExplanation {
  category: string;
  userLine: string;
  detail: string;
  repair: string;
}

function firstString(...values: unknown[]): string {
  for (const value of values) {
    if (typeof value === 'string' && value.trim()) {
      return value.trim();
    }
  }
  return '';
}

function extractErrorText(error: unknown): string {
  const anyError = error as any;
  const responseError = anyError?.response?.data?.error;
  const responseMessage = typeof responseError === 'string'
    ? responseError
    : firstString(responseError?.message, responseError?.code);
  const responseDetail = firstString(
    responseMessage,
    anyError?.response?.data?.message,
    anyError?.response?.statusText
  );
  const status = anyError?.response?.status ? `HTTP ${anyError.response.status}` : '';
  const message = error instanceof Error ? error.message : String(error || 'unknown error');
  const code = firstString(anyError?.code);
  return redactText([status, responseDetail, code, message].filter(Boolean).join(' - '));
}

function compactDetail(text: string): string {
  const oneLine = text
    .replace(/\s+/g, ' ')
    .replace(/Bearer\s+\S+/gi, 'Bearer [REDACTED]')
    .replace(/\bsk-[A-Za-z0-9_-]{6,}\b/g, '[REDACTED]')
    .trim();
  if (!oneLine) return 'Spark did not receive a detailed error from the failed component.';
  return oneLine.length > 220 ? `${oneLine.slice(0, 217)}...` : oneLine;
}

export function explainSparkError(error: unknown, context: SparkErrorContext = 'chat'): SparkErrorExplanation {
  const detail = compactDetail(extractErrorText(error));
  const lower = detail.toLowerCase();

  if (
    lower.includes('unauthorized') ||
    lower.includes('forbidden') ||
    lower.includes('invalid api') ||
    lower.includes('api key') ||
    lower.includes('missing provider key') ||
    lower.includes('401') ||
    lower.includes('403')
  ) {
    return {
      category: 'provider_auth',
      userLine: 'Spark reached the model path, but the provider authentication is not working.',
      detail,
      repair: 'Run /diagnose. Operator repair: spark providers status, then spark setup to refresh the provider key.'
    };
  }

  if (
    lower.includes('econnrefused') ||
    lower.includes('connection refused') ||
    lower.includes('fetch failed') ||
    lower.includes('enotfound') ||
    lower.includes('etimedout') ||
    lower.includes('timeout') ||
    lower.includes('network error')
  ) {
    const target = context === 'spawner' || lower.includes('5173') || lower.includes('8788')
      ? 'a local Spark service'
      : 'the selected model provider';
    return {
      category: 'network_or_service',
      userLine: `Spark could not reach ${target}.`,
      detail,
      repair: context === 'spawner'
        ? 'Run /diagnose. Operator repair: spark start spawner-ui, then spark verify --onboarding.'
        : 'Run /diagnose. Operator repair: spark providers status, then check the provider URL or local service.'
    };
  }

  if (
    lower.includes('builder bridge') ||
    lower.includes('spark_builder') ||
    lower.includes('builder home') ||
    lower.includes('memory bridge') ||
    context === 'memory' ||
    context === 'builder'
  ) {
    return {
      category: 'builder_or_memory',
      userLine: 'Spark could not reach the Builder memory path right now.',
      detail,
      repair: 'Run /diagnose. Operator repair: spark fix telegram, then spark verify --onboarding.'
    };
  }

  if (
    lower.includes('module not found') ||
    lower.includes('cannot find module') ||
    lower.includes('command not found') ||
    lower.includes('enoent') ||
    lower.includes('no such file')
  ) {
    return {
      category: 'dependency_or_install',
      userLine: 'Spark is missing a dependency or command it needs.',
      detail,
      repair: 'Run /diagnose. Operator repair: spark update, then spark verify --onboarding.'
    };
  }

  if (
    lower.includes('bot token') ||
    lower.includes('allowed_telegram_ids') ||
    lower.includes('admin_telegram_ids') ||
    context === 'telegram'
  ) {
    return {
      category: 'telegram_config',
      userLine: 'Spark hit a Telegram configuration problem.',
      detail,
      repair: 'Run /myid, then operator repair: spark setup and restart the Telegram bot.'
    };
  }

  return {
    category: 'unknown',
    userLine: 'Spark hit an internal error before it could answer cleanly.',
    detail,
    repair: 'Run /diagnose. Operator repair: spark logs spark-telegram-bot --lines 80.'
  };
}

export function renderSparkErrorReply(
  error: unknown,
  context: SparkErrorContext = 'chat',
  isAdmin: boolean = false
): string {
  const explanation = explainSparkError(error, context);
  const lines = [
    explanation.userLine,
    `Reason: ${explanation.detail}`,
    isAdmin
      ? explanation.repair
      : 'Please ask the operator to run /diagnose and check the repair hint.'
  ];
  return lines.join('\n\n');
}
