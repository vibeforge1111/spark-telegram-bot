import type { NaturalRouteDecision } from './naturalRouteDecision';

export type NaturalRouteTelemetryPhase = 'shadow' | 'probe' | 'execute';

export interface NaturalRouteTelemetryInput {
  decision: NaturalRouteDecision;
  phase: NaturalRouteTelemetryPhase;
  profile?: string | null;
  userId?: string | number | null;
  chatId?: string | number | null;
  chatType?: string | null;
  admin?: boolean;
  executedRoute?: string | null;
  executedOwner?: string | null;
  executedAction?: string | null;
  outcome?: string | null;
}

function safeField(value: string | number | boolean | null | undefined, fallback = 'unknown'): string {
  const text = String(value ?? '').trim();
  return text ? text.replace(/\s+/g, '_') : fallback;
}

function safeList(values: string[]): string {
  return values.length > 0
    ? values.map((value) => safeField(value)).join(',')
    : 'none';
}

export function naturalRouteTelemetryLine(input: NaturalRouteTelemetryInput): string {
  const decision = input.decision;
  return [
    '[NaturalRoute]',
    `phase=${safeField(input.phase)}`,
    `route=${safeField(decision.route)}`,
    `owner=${safeField(decision.owner_system)}`,
    `confidence=${safeField(decision.confidence)}`,
    `context=${safeField(decision.context_source)}`,
    `confirm=${safeField(decision.requires_confirmation)}`,
    `signals=${safeList(decision.matched_signals)}`,
    `blocked=${safeList(decision.blocked_by)}`,
    `profile=${safeField(input.profile)}`,
    `user=${safeField(input.userId)}`,
    `chat=${safeField(input.chatId)}`,
    `chat_type=${safeField(input.chatType)}`,
    `admin=${safeField(Boolean(input.admin))}`,
    input.executedRoute ? `executed=${safeField(input.executedRoute)}` : null,
    input.executedOwner ? `executed_owner=${safeField(input.executedOwner)}` : null,
    input.executedAction ? `executed_action=${safeField(input.executedAction)}` : null,
    input.outcome ? `outcome=${safeField(input.outcome)}` : null
  ].filter((part): part is string => Boolean(part)).join(' ');
}

export function logNaturalRouteDecision(
  input: NaturalRouteTelemetryInput,
  logger: Pick<Console, 'log'> = console
): void {
  logger.log(naturalRouteTelemetryLine(input));
}

export function naturalRouteExecutionOutcome(
  decision: NaturalRouteDecision,
  executedRoute: string
): 'matched' | 'mismatch' {
  return decision.route === executedRoute ? 'matched' : 'mismatch';
}

export function logNaturalRouteExecution(
  input: Omit<NaturalRouteTelemetryInput, 'phase' | 'outcome'> & {
    executedRoute: string;
    executedOwner: string;
    executedAction: string;
  },
  logger: Pick<Console, 'log'> = console
): void {
  logger.log(naturalRouteTelemetryLine({
    ...input,
    phase: 'execute',
    outcome: naturalRouteExecutionOutcome(input.decision, input.executedRoute)
  }));
}

export function renderNaturalRouteDecisionReply(decision: NaturalRouteDecision): string {
  return [
    'Natural route probe',
    '',
    `Route: ${decision.route}`,
    `Owner: ${decision.owner_system}`,
    `Confidence: ${decision.confidence}`,
    `Context: ${decision.context_source}`,
    `Needs confirmation: ${decision.requires_confirmation ? 'yes' : 'no'}`,
    `Signals: ${decision.matched_signals.length ? decision.matched_signals.join(', ') : 'none'}`,
    decision.blocked_by.length ? `Blocked by: ${decision.blocked_by.join(', ')}` : null,
    '',
    'No command was executed.'
  ].filter((line): line is string => Boolean(line)).join('\n');
}
