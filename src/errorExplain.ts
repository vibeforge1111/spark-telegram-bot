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
  if (
    /spark_intelligence\.cli|spark-intelligence-builder|simulate-telegram-update|runpy\.run_module/i.test(oneLine)
  ) {
    return 'Builder bridge command did not finish cleanly. Run /diagnose for the current Builder and memory status.';
  }
  return oneLine.length > 220 ? `${oneLine.slice(0, 217)}...` : oneLine;
}

function doctorCommand(category: string, context: SparkErrorContext): string {
  const problem = `Spark ${context} failure: ${category}`;
  return `spark doctor llm "${problem}" --save-report --upstream-report`;
}
const HYPOTHETICAL_PATTERNS = [
  /\bwhat\s+(?:would|will|happens?)\s+(?:happen\s+)?if\b/i,
  /\bif\s+(?:the\s+)?(?:spark|bot|spawner|relay|provider)\s+(?:is\s+)?(?:not|down|offline|broken|fails?)\b/i,
  /\bwhat\s+if\b/i,
  /\bsuppose\b/i,
  /\bhypothetically\b/i,
];

export function isHypotheticalQuestion(text: string): boolean {
  return HYPOTHETICAL_PATTERNS.some(p => p.test(text));
}

export function explainHypotheticalScenario(text: string): string {
  const lower = text.toLowerCase();
  if (lower.includes('spawner') && (lower.includes('not running') || lower.includes('down') || lower.includes('offline'))) {
    return 'If Spawner is not running, /run will fail with a relay error: "Mission relay unavailable."\n\nTo fix:\n1. Run spark fix spawner\n2. Run spark restart spawner-ui\n3. Run spark live status to confirm\n4. Retry your /run command';
  }
  if (lower.includes('provider') && (lower.includes('not') || lower.includes('down') || lower.includes('fail'))) {
    return 'If a provider fails, Spark will show a provider auth error in /diagnose.\n\nTo fix:\n1. Check your API key in .env\n2. Run spark providers test --role chat\n3. Run spark fix telegram if the bot is quiet';
  }
  if (lower.includes('relay') && (lower.includes('not') || lower.includes('down') || lower.includes('fail'))) {
    return 'If the relay is down, Telegram notifications will stop but missions keep running in Spawner.\n\nTo fix:\n1. Run spark fix telegram\n2. Run spark restart telegram-starter\n3. Check /board after restart for completed missions';
  }
  return 'If Spark encounters an error, run /diagnose first to identify the failing component, then run spark fix <component> to repair it.';
}
export function explainSparkError(error: unknown, context: SparkErrorContext = 'chat'): SparkErrorExplanation {
  const detail = compactDetail(extractErrorText(error));
  const lower = detail.toLowerCase();

  if (
    context === 'spawner' &&
    (
      lower.includes('prdbridgewrite routes require api key for non-local requests') ||
      lower.includes('unauthorized prdbridgewrite request')
    )
  ) {
    return {
      category: 'spawner_bridge_auth',
      userLine: 'Mission Control rejected Spark before the governed build request reached Spawner.',
      detail,
      check: 'Run /diagnose so Spark can check the Telegram-to-Spawner bridge and Mission Control health.',
      repair: 'Operator fix: make sure Spark Recursive and Spawner share the same SPARK_BRIDGE_API_KEY, then restart both services.'
    };
  }

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
    lower.includes('read-only') ||
    lower.includes('operation not permitted') ||
    lower.includes('permission denied') ||
    lower.includes('apply_patch rejected') ||
    lower.includes('patch was rejected') ||
    lower.includes('cannot write') ||
    lower.includes('not writable')
  ) {
    return {
      category: 'runner_read_only',
      userLine: 'The action may be allowed, but this runner or workspace cannot write right now.',
      detail,
      check: 'Check the current runner writability and whether the requested path is inside a writable Spark workspace.',
      repair: 'Route the work through a writable Spark/Spawner/Codex lane, or run /access_setup and restart Spark if this local lane should be writable.'
    };
  }

  if (
    lower.includes('timed out') ||
    lower.includes('promise timed') ||
    lower.includes('command timed')
  ) {
    if (context === 'telegram') {
      return {
        category: 'telegram_handler_timeout',
        userLine: 'Spark waited too long while handling this Telegram turn.',
        detail,
        check: 'Run /diagnose so Spark can tell whether the slow part is chat, Builder, Spawner, or the local harness.',
        repair: 'Operator fix: increase the relevant timeout, then inspect spark-telegram-bot logs for the slow component before restarting the bot.'
      };
    }
    if (context === 'chat') {
      return {
        category: 'chat_runtime_timeout',
        userLine: 'Spark hit the chat runtime timeout before it could answer cleanly.',
        detail,
        check: 'Run /diagnose and check the active chat provider plus any local harness command that was running.',
        repair: 'Operator fix: raise the chat/tool timeout or route this kind of long analysis through a Spawner mission.'
      };
    }
  }

  if (
    lower.includes('econnrefused') ||
    lower.includes('connection refused') ||
    lower.includes('failed to connect') ||
    lower.includes('fetch failed') ||
    lower.includes('enotfound') ||
    lower.includes('etimedout') ||
    lower.includes('timeout') ||
    lower.includes('timed out') ||
    lower.includes('network error')
  ) {
    if (context === 'spawner' || lower.includes('3333') || lower.includes('5173') || lower.includes('8788')) {
      if (lower.includes('econnrefused') || lower.includes('connection refused') || lower.includes('failed to connect')) {
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
    lower.includes('spark_intelligence') ||
    lower.includes('spark-intelligence-builder') ||
    lower.includes('builder home') ||
    lower.includes('memory bridge') ||
    lower.includes('simulate-telegram-update') ||
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
      check: 'Check the intended Telegram profile logs and confirm no other local, hosted, WSL, Docker, or old laptop session is polling the same BotFather token.',
      repair: 'Operator fix: stop the other poller or rotate the BotFather token, then start only the intended Spark Telegram profile.'
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
  if (['chat', 'telegram', 'memory'].includes(context) && explanation.category === 'builder_or_memory') {
    return [
      'Builder memory is shaky right now, so I should stay with the visible chat instead of switching into diagnostics.',
      'Ask me the same thing again and I will answer from the current thread. Run /diagnose when you want the health check.'
    ].join('\n\n');
  }
  const lines = [
    explanation.userLine,
    `Reason: ${explanation.detail}`,
    `Check now: ${explanation.check}`,
    isAdmin
      ? explanation.repair
      : 'Please ask the operator to run /diagnose and check the repair hint.'
  ];
  if (isAdmin) {
    const doctorContext = explanation.category === 'builder_or_memory' ? 'builder' : context;
    lines.push(`Still stuck: ${doctorCommand(explanation.category, doctorContext)}`);
    lines.push('That uses your configured LLM, redacts sensitive data, and creates a local upstream PR draft only if you review/share it.');
  }
  return lines.join('\n\n');
}
// TODO(spark-compete-qa): Hypothetical troubleshooting questions misrouted - QA 2026-05-24
// Bug: Bot ignores hypothetical questions and runs live status checks instead.
// User asked "what happens IF Spawner is not running" but bot ran /diagnose.
//
// Before:
//   User: "What happens if I send /run but Spawner is not running?"
//   Bot: "Spark is healthy right now. Spawner: reachable. No repair needed."
//   (ignored hypothetical, ran live health check instead)
//
// After:
//   User: "What happens if I send /run but Spawner is not running?"
//   Bot: "If Spawner is not running, /run will fail with a relay error.
//        You will see something like: Mission relay unavailable.
//        To fix it:
//        1. Run spark fix spawner to diagnose the issue
//        2. Run spark restart spawner-ui to restart Spawner
//        3. Run spark live status to confirm Spawner is back up
//        4. Then retry your /run command"
//   (answers the hypothetical with clear error recovery steps)
//
// Fix needed in errorExplain.ts:
//   1. Detect hypothetical troubleshooting questions (if, what if, what happens if)
//   2. Answer the hypothetical scenario directly
//   3. Never run a live status check when user asks a hypothetical
//   4. Always include error recovery steps for common failure scenarios
//   5. Keep response focused on the asked scenario not current system state
