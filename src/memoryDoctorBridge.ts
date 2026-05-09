export interface MemoryDoctorEvidenceTurn {
  role: 'user' | 'assistant' | string;
  text: string;
}

const CONTEXTUAL_MEMORY_DOCTOR_PATTERN =
  /\b(?:previous|last|recent|current|turn|reply|answer|response|request|message|what\s+happened|went\s+blank|go(?:t|ing)?\s+blank|blankness|lost\s+(?:the\s+)?context|dropped\s+(?:the\s+)?context|forgot\s+(?:the\s+)?context|not\s+remember(?:ing)?\s+what\s+we\s+were\s+talking\s+about)\b/i;

function compactEvidenceText(value: string, limit = 700): string {
  const normalized = value.replace(/\s+/g, ' ').trim();
  if (normalized.length <= limit) {
    return normalized;
  }
  return `${normalized.slice(0, Math.max(0, limit - 3)).trim()}...`;
}

function normalizeEvidenceRole(role: string): 'user' | 'assistant' {
  return role === 'assistant' ? 'assistant' : 'user';
}

export function shouldAttachMemoryDoctorEvidence(text: string): boolean {
  return CONTEXTUAL_MEMORY_DOCTOR_PATTERN.test(text.replace(/\s+/g, ' ').trim());
}

function sameNormalizedText(a: string, b: string): boolean {
  return a.replace(/\s+/g, ' ').trim() === b.replace(/\s+/g, ' ').trim();
}

export function selectMemoryDoctorEvidenceTurns(
  userRequest: string,
  recentTurns: MemoryDoctorEvidenceTurn[],
  maxTurns = 2
): MemoryDoctorEvidenceTurn[] {
  const turns = [...recentTurns];
  const last = turns[turns.length - 1];
  if (last && normalizeEvidenceRole(String(last.role || 'user')) === 'user' && sameNormalizedText(String(last.text || ''), userRequest)) {
    turns.pop();
  }
  return turns.slice(-Math.max(1, maxTurns));
}

export function buildMemoryDoctorEvidencePrompt(
  userRequest: string,
  recentTurns: MemoryDoctorEvidenceTurn[],
  maxTurns = 8
): string {
  const request = userRequest.trim();
  const turns = recentTurns
    .map((turn) => ({
      role: normalizeEvidenceRole(String(turn.role || 'user')),
      text: compactEvidenceText(String(turn.text || '')),
    }))
    .filter((turn) => turn.text.length > 0)
    .slice(-Math.max(1, maxTurns));

  if (!turns.length) {
    return request;
  }

  return [
    request,
    '',
    '[Spark Telegram Memory Doctor evidence]',
    'Route: memory.doctor',
    'Instruction: Audit or diagnose the immediately previous visible Telegram exchange using this evidence. If the user asked for the last request, previous turn, or last answer, treat the newest turn below as the primary evidence. Do not ask the user to paste the previous turn unless no recent turns are listed.',
    '',
    'Recent visible Telegram turns, newest last:',
    ...turns.map((turn) => `- ${turn.role}: ${turn.text}`),
  ].join('\n');
}
