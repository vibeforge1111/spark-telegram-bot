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
  check: string;
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

function doctorCommand(category: string, context: SparkErrorContext): string {
  const problem = `Spark ${context} failure: ${category}`;
  return `spark doctor llm "${problem}" --save-report --upstream-report`;
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
      check: 'Run /diagnose so Spark can check the active chat provider.',
      repair: 'Operator fix: spark providers status, then spark setup to refresh the provider key.'
    };
  }

  if (
    lower.includes('rate limit') ||
    lower.includes('too many requests') ||
    lower.includes('quota') ||
    lower.includes('429')
  ) {
    return {
      category: 'provider_rate_limit',
      userLine: 'The selected model provider is rate-limiting Spark right now.',
      detail,
      check: 'Run /diagnose so Spark can confirm whether chat or missions are affected.',
      repair: 'Operator fix: wait a moment, switch providers with spark setup, or check provider billing/quota.'
    };
  }

  if (
    lower.includes('model not found') ||
    lower.includes('unknown model') ||
    lower.includes('invalid model') ||
    lower.includes('does not exist')
  ) {
    return {
      category: 'provider_model',
      userLine: 'Spark has a provider key, but the configured model name is not available.',
      detail,
      check: 'Run /diagnose and check the selected chat, builder, memory, and mission models.',
      repair: 'Operator fix: spark setup, then choose a model this provider account can use.'
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
    if (context === 'spawner' || lower.includes('5173') || lower.includes('8788')) {
      if (lower.includes('econnrefused') || lower.includes('connection refused')) {
        return {
          category: 'spawner_offline',
          userLine: 'Mission Control is not reachable right now.',
          detail,
          check: 'Most likely Spawner UI is not running on this computer. After starting it, retry your last command.',
          repair: 'Start it: spark start spawner-ui. If it still fails, run /diagnose and then spark verify --onboarding.'
        };
      }
      if (lower.includes('econnaborted') || lower.includes('timeout') || lower.includes('etimedout')) {
        return {
          category: 'spawner_slow',
          userLine: 'Mission Control is running too slowly or is still waking up.',
          detail,
          check: 'Wait a few seconds and retry. If it repeats, run /diagnose to see whether Spawner or the mission relay is stuck.',
          repair: 'Refresh it: spark restart spawner-ui. Then retry your command and run spark verify --onboarding if needed.'
        };
      }
      return {
        category: 'spawner_unreachable',
        userLine: 'Spark could not reach Mission Control.',
        detail,
        check: 'Run /diagnose if retrying does not work, so Spark can check Spawner and the mission relay.',
        repair: 'Operator fix: spark start spawner-ui, then spark verify --onboarding.'
      };
    }
    return {
      category: 'network_or_service',
      userLine: 'Spark could not reach the selected model provider.',
      detail,
      check: 'Run /diagnose so Spark can tell whether the failing target is local or the model provider.',
      repair: 'Operator fix: spark providers status, then check the provider URL or local service.'
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
      check: 'Run /diagnose so Spark can check Builder, memory, and the selected memory model.',
      repair: 'Operator fix: spark fix telegram, then spark verify --onboarding.'
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
      check: 'Run /diagnose so Spark can identify which module is unhealthy.',
      repair: 'Operator fix: spark update, then spark verify --onboarding.'
    };
  }

  if (
    lower.includes('terminated by other getupdates request') ||
    lower.includes('409') ||
    lower.includes('conflict')
  ) {
    return {
      category: 'telegram_polling_conflict',
      userLine: 'Telegram says another Spark process is already polling this bot token.',
      detail,
      check: 'Run /diagnose to confirm which Telegram profile and relay port are active.',
      repair: 'Operator fix: stop duplicate bot processes, then run spark restart spark-telegram-bot for the intended profile.'
    };
  }

  if (
    lower.includes('bot token') ||
    lower.includes('telegram token') ||
    lower.includes('allowed_telegram_ids') ||
    lower.includes('admin_telegram_ids') ||
    context === 'telegram'
  ) {
    return {
      category: 'telegram_config',
      userLine: 'Spark hit a Telegram configuration problem.',
      detail,
      check: 'Run /myid if access is the issue, or /diagnose if the bot is already responding.',
      repair: 'Operator fix: spark setup and restart the Telegram bot.'
    };
  }

  return {
    category: 'unknown',
    userLine: 'Spark hit an internal error before it could answer cleanly.',
    detail,
    check: 'Run /diagnose so Spark can narrow this down from the live stack.',
    repair: 'Operator fix: spark logs spark-telegram-bot --lines 80.'
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
    `Check now: ${explanation.check}`,
    isAdmin
      ? explanation.repair
      : 'Please ask the operator to run /diagnose and check the repair hint.'
  ];
  if (isAdmin) {
    lines.push(`Still stuck: ${doctorCommand(explanation.category, context)}`);
    lines.push('That uses your configured LLM, redacts sensitive data, and creates a local upstream PR draft only if you review/share it.');
  }
  return lines.join('\n\n');
}
