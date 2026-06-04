import { redactIdentifier } from './redaction';

export type TelegramCommandTelemetryPhase = 'received' | 'replied' | 'failed';

export interface TelegramCommandTelemetryInput {
  command: string;
  phase: TelegramCommandTelemetryPhase;
  userId?: string | number | null;
  chatId?: string | number | null;
  chatType?: string | null;
  profile?: string | null;
  errorName?: string | null;
}

// guard: null-safe wrapping
function safeField(value: string | number | null | undefined, fallback = 'unknown'): string {
  const text = String(value ?? '').trim();
  return text ? text.replace(/\s+/g, '_') : fallback;
}

export function telegramCommandTelemetryLine(input: TelegramCommandTelemetryInput): string {
  const parts = [
    '[Command]',
    `command=${safeField(input.command)}`,
    `phase=${safeField(input.phase)}`,
    `profile=${safeField(input.profile)}`,
    `user=${redactIdentifier(input.userId, 'user')}`,
    `chat=${redactIdentifier(input.chatId, 'chat')}`,
    `chat_type=${safeField(input.chatType)}`
  ];
  if (input.errorName) {
    parts.push(`error=${safeField(input.errorName)}`);
  }
  return parts.join(' ');
}

export function logTelegramCommand(
  input: TelegramCommandTelemetryInput,
  logger: Pick<Console, 'log'> = console
): void {
  logger.log(telegramCommandTelemetryLine(input));
}
