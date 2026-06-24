export interface MemoryDoctorEvidenceTurn {
  role: 'user' | 'assistant' | string;
  text: string;
}

export interface MemoryDoctorEvidenceAuthority {
  selectedIntent?: {
    ownerSystem?: string | null;
    action?: string | null;
  } | null;
  candidates?: Array<{
    route?: string | null;
  }> | null;
}

const EXPLICIT_MEMORY_DOCTOR_INVOCATION_PATTERN =
  /^(?:please\s+)?(?:run|start|use|invoke|call|ask|open)\s+(?:the\s+)?(?:memory\s+)?(?:doctor|audit|diagnostic)\b/i;
const MEMORY_DOCTOR_BLANKNESS_PATTERN =
  /\b(?:what\s+happened|went\s+blank|go(?:t|ing)?\s+blank|blankness|lost\s+(?:the\s+)?context|dropped\s+(?:the\s+)?context|forgot\s+(?:the\s+)?context|not\s+remember(?:ing)?\s+what\s+we\s+were\s+talking\s+about)\b/i;
const CONTEXTUAL_MEMORY_DOCTOR_PATTERN =
  /\b(?:what\s+happened|went\s+blank|go(?:t|ing)?\s+blank|blankness|lost\s+(?:the\s+)?context|dropped\s+(?:the\s+)?context|forgot\s+(?:the\s+)?context|not\s+remember(?:ing)?\s+what\s+we\s+were\s+talking\s+about|what\s+(?:was|did)\s+(?:my|your)\s+(?:last|previous)\s+(?:answer|response|reply|message)|did\s+you\s+(?:forget|lose|drop)\s+(?:my|the|what)\s+(?:context|message|conversation)|(?:run|check|show|diagnose|audit)\s+(?:the\s+)?memory\s+doctor)\b/i;

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
  const normalized = text.replace(/\s+/g, ' ').trim();
  if (!normalized) return false;
  if (EXPLICIT_MEMORY_DOCTOR_INVOCATION_PATTERN.test(normalized)) return true;
  if (CONTEXTUAL_MEMORY_DOCTOR_PATTERN.test(normalized)) return true;
  return MEMORY_DOCTOR_BLANKNESS_PATTERN.test(normalized) &&
    /\b(?:memory|context|recall|trace|audit|diagnos|doctor|why|what\s+happened|previous|last|turn|reply|answer)\b/i.test(normalized);
}

export function shouldAttachMemoryDoctorEvidenceWithAuthority(
  text: string,
  authority: MemoryDoctorEvidenceAuthority | null | undefined
): boolean {
  if (!shouldAttachMemoryDoctorEvidence(text)) return false;
  const selectedRoute = String(authority?.candidates?.[0]?.route || '').trim();
  const selectedOwner = String(authority?.selectedIntent?.ownerSystem || '').trim();
  const selectedAction = String(authority?.selectedIntent?.action || '').trim();
  return selectedRoute === 'memory.doctor' &&
    selectedOwner === 'spark-intelligence-builder' &&
    selectedAction === 'memory.doctor';
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

export function isMemoryDoctorBridgeDetourReply(reply: string): boolean {
  const normalized = reply.replace(/\s+/g, ' ').trim().toLowerCase();
  if (!normalized) return false;
  return (
    /\bmcp\b.*\bpermission/.test(normalized) ||
    /\bpermission\b.*\bmcp\b/.test(normalized) ||
    /\bpermissions?\s+gate\b/.test(normalized) ||
    /\bapprove\b.*\btool/.test(normalized) ||
    /\bapprove\b.*\bmcp/.test(normalized) ||
    /\bmcpspark/.test(normalized) ||
    /\btool prompt\b/.test(normalized) ||
    /\brun\s+\/diagnose\b/.test(normalized) ||
    /\bi do(?:n't| not) have visibility\b/.test(normalized) ||
    /\btell me which route\b/.test(normalized) ||
    /\bwhich (?:one|route) do you prefer\b/.test(normalized)
  );
}

export function renderMemoryDoctorEvidenceFallback(
  userRequest: string,
  recentTurns: MemoryDoctorEvidenceTurn[]
): string {
  const turns = recentTurns
    .map((turn) => ({
      role: normalizeEvidenceRole(String(turn.role || 'user')),
      text: compactEvidenceText(String(turn.text || ''), 500),
    }))
    .filter((turn) => turn.text.length > 0);

  const lines = [
    'Memory Doctor',
    '',
    'I can audit this from Telegram recent-turn evidence without MCP/tool approval.'
  ];

  if (!turns.length) {
    return [
      ...lines,
      '',
      'No recent visible turn pair was available in the local Telegram buffer for this request.',
      `Request: ${compactEvidenceText(userRequest, 500)}`
    ].join('\n');
  }

  lines.push('', 'Visible evidence:');
  for (const turn of turns) {
    lines.push(`- ${turn.role}: ${turn.text}`);
  }

  const assistantText = [...turns].reverse().find((turn) => turn.role === 'assistant')?.text.toLowerCase() || '';
  let diagnosis = 'The prior exchange is present in Telegram hot context. Memory Doctor should answer from this local evidence first, then ask for deeper tooling only if trace-level evidence is truly needed.';
  if (/\bmcp\b.*\bpermission|\bpermission\b.*\bmcp|\bapprove\b.*\btool|\btool prompt\b|\brun\s+\/diagnose\b/.test(assistantText)) {
    diagnosis = 'The last answer detoured into MCP/tool permission instead of answering the audit in-band. For recent-turn audits, local Telegram evidence is enough for a first diagnosis.';
  } else if (/\bcreator\b|\bmission\b|\bplanning\b/.test(assistantText)) {
    diagnosis = 'The last answer looks like a route misfire into mission/build planning. A diagnostic request should stay in-band unless the user explicitly asks to create or run a mission.';
  } else if (/\bi do(?:n['’]?t| not) have visibility|\bcan(?:not|\'t) verify|\bpaste\b/.test(assistantText)) {
    diagnosis = 'The last answer under-used available Telegram context. It should inspect the visible recent turn pair before asking you to paste or choose another route.';
  }

  lines.push('', 'Diagnosis:', diagnosis);
  return lines.join('\n');
}

function memoryDoctorStatusSentence(reply: string): string {
  const firstLine = reply.split(/\r?\n/).find((line) => line.trim()) || '';
  const status = firstLine.match(/Memory Doctor:\s*([^.\n]+)/i)?.[1]?.trim().toLowerCase();
  if (status?.includes('needs attention')) return 'Memory Doctor needs attention.';
  if (status?.includes('clean') || status?.includes('ok')) return 'Memory Doctor looks clean.';
  return 'Memory Doctor finished the read-only check.';
}

export function renderMemoryDoctorTelegramSummary(reply: string): string | null {
  const normalized = reply.replace(/\s+/g, ' ').trim();
  if (!/\bMemory Doctor\b/i.test(normalized)) return null;
  const hasRawLedger =
    /\bRequest:\s*\w+:/i.test(reply) ||
    /\brequest=\w+:/i.test(reply) ||
    /\bContext capsule:/i.test(reply) ||
    /\bLineage scope:/i.test(reply) ||
    /\bBenchmark:/i.test(reply) ||
    /\bBrain:/i.test(reply);
  if (!hasRawLedger) return null;

  const lines = [memoryDoctorStatusSentence(reply)];
  if (/gateway\s*->\s*provider context gap/i.test(reply) || /provider capsule had 0 recent-conversation/i.test(reply)) {
    lines.push('Telegram had the recent turns available, but the provider context bundle did not receive them.');
  } else {
    const problem = reply.match(/\bProblem:\s*([^]*?)(?:\bNext:|$)/i)?.[1]?.trim();
    if (problem) {
      lines.push(problem.replace(/\s*\([^)]*request=[^)]+\)/gi, '').replace(/\s+/g, ' '));
    }
  }

  if (/recent-conversation capsule path/i.test(reply)) {
    lines.push('Next: repair the recent-conversation capsule path, rerun this doctor command, then replay the triggering turn.');
  } else {
    const next = reply.match(/\bNext:\s*([^]*?)$/i)?.[1]?.trim();
    if (next) lines.push(`Next: ${next.replace(/\s+/g, ' ')}`);
  }
  lines.push('I did not change memory.');
  return lines.join('\n\n');
}

export function shouldPreferMemoryDoctorEvidenceFallback(
  userRequest: string,
  recentTurns: MemoryDoctorEvidenceTurn[]
): boolean {
  const normalizedRequest = userRequest.replace(/\s+/g, ' ').trim().toLowerCase();
  const asksAboutBlankness =
    /\b(?:went\s+blank|go(?:t|ing)?\s+blank|blankness|lost\s+(?:the\s+)?context|dropped\s+(?:the\s+)?context|forgot\s+(?:the\s+)?context|not\s+remember(?:ing)?\s+what\s+we\s+were\s+talking\s+about|what\s+happened)\b/.test(normalizedRequest);
  if (!asksAboutBlankness) {
    return false;
  }

  const assistantText = [...recentTurns]
    .reverse()
    .find((turn) => normalizeEvidenceRole(String(turn.role || 'user')) === 'assistant')
    ?.text || '';
  const normalizedAssistant = assistantText.replace(/\s+/g, ' ').trim().toLowerCase();
  return (
    isMemoryDoctorBridgeDetourReply(assistantText) ||
    /\bcreator\b|\bmission\b|\bplanning\b/.test(normalizedAssistant) ||
    /\bi do(?:n['’]?t| not) have visibility|\bcan(?:not|'t) verify|\bpaste\b/.test(normalizedAssistant)
  );
}
