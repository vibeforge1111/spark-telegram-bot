import { extractPlainChatMemoryDirective, isUserMemoryRecallQuestion } from './conversationIntent';

export function formatLocalMemoryDirectiveAcknowledgement(directive: string): string {
  return `Saved in Telegram memory: ${directive.replace(/[.!?]+$/g, '').trim()}.`;
}

export function extractNaturalLocalMemoryRecallQuery(text: string): string | null {
  if (extractPlainChatMemoryDirective(text)) return null;
  const decided = text.match(/\bwhat\s+did\s+we\s+decide\s+about\s+(.+?)(?:[?.!]|$)/i)?.[1]?.trim();
  if (decided) {
    return decided
      .replace(/\b(?:keep\s+it|and\s+keep\s+it|please\s+keep\s+it)\b[\s\S]*$/i, '')
      .replace(/\b(?:do\s+not|don't)\s+run\b[\s\S]*$/i, '')
      .trim();
  }
  return isUserMemoryRecallQuestion(text) ? text : null;
}
