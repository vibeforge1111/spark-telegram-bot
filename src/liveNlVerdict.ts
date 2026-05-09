export type LiveNlRisk = 'safe' | 'mission' | 'writes_files' | 'external';

export interface LiveNlCommandCase {
  id: string;
  suite: string;
  risk: LiveNlRisk;
  prompt: string;
  turns?: string[];
  expectedRoute: string;
  expectedOutcome: string;
}

export interface LiveNlSelection {
  caseId?: string | null;
  caseIds?: string[];
  suite?: string | null;
  includeRisky?: boolean;
}

export interface LiveNlVerdictReportOptions {
  generatedAt?: Date;
  title?: string;
  suite?: string | null;
}

export interface LiveNlCopyPasteOptions {
  title?: string;
}

export const LIVE_NL_SUITE_ALIASES: Record<string, string[]> = {
  memory_architecture: ['memory', 'self_awareness', 'wiki', 'anti_drift']
};

function objectValue(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function stringField(record: Record<string, unknown>, key: string): string {
  const value = record[key];
  return typeof value === 'string' ? value.trim() : '';
}

function stringArrayField(record: Record<string, unknown>, key: string): string[] {
  const value = record[key];
  if (!Array.isArray(value)) return [];
  return value.map((entry) => typeof entry === 'string' ? entry.trim() : '').filter(Boolean);
}

function parseLiveNlCommandCase(value: unknown, index: number): LiveNlCommandCase {
  const record = objectValue(value);
  if (!record) {
    throw new Error(`Live NL case ${index + 1} is not an object.`);
  }

  const turns = stringArrayField(record, 'turns');
  const parsed = {
    id: stringField(record, 'id'),
    suite: stringField(record, 'suite'),
    risk: stringField(record, 'risk') as LiveNlRisk,
    prompt: stringField(record, 'prompt') || turns[0] || '',
    turns: turns.length > 0 ? turns : undefined,
    expectedRoute: stringField(record, 'expectedRoute'),
    expectedOutcome: stringField(record, 'expectedOutcome')
  };

  if (!parsed.id || !parsed.suite || !parsed.prompt || !parsed.expectedRoute || !parsed.expectedOutcome) {
    throw new Error(`Live NL case ${index + 1} needs id, suite, prompt or turns, expectedRoute, and expectedOutcome.`);
  }
  if (!['safe', 'mission', 'writes_files', 'external'].includes(parsed.risk)) {
    throw new Error(`Live NL case ${parsed.id} has unsupported risk ${parsed.risk || 'unknown'}.`);
  }

  return parsed;
}

export function parseLiveNlCommandCases(value: unknown): LiveNlCommandCase[] {
  if (!Array.isArray(value)) {
    throw new Error('Live NL command cases must be a JSON array.');
  }
  return value.map(parseLiveNlCommandCase);
}

export function liveNlCaseTurns(entry: LiveNlCommandCase): string[] {
  const turns = entry.turns?.map((turn) => turn.trim()).filter(Boolean) || [];
  return turns.length > 0 ? turns : [entry.prompt];
}

export function selectLiveNlCommandCases(
  cases: LiveNlCommandCase[],
  selection: LiveNlSelection = {}
): LiveNlCommandCase[] {
  const caseId = selection.caseId?.trim();
  const caseIds = (selection.caseIds || []).map((id) => id.trim()).filter(Boolean);
  const orderedCaseIds = [...(caseId ? [caseId] : []), ...caseIds];
  const selectedCaseIds = new Set(orderedCaseIds);
  const suite = selection.suite?.trim();
  const suiteNames = suite ? new Set(LIVE_NL_SUITE_ALIASES[suite] ?? [suite]) : null;

  let selected = cases;
  if (selectedCaseIds.size > 0) {
    const byId = new Map(cases.map((entry) => [entry.id, entry]));
    selected = orderedCaseIds.map((id) => byId.get(id)).filter((entry): entry is LiveNlCommandCase => Boolean(entry));
  }
  if (suiteNames) selected = selected.filter((entry) => suiteNames.has(entry.suite));
  if (!selection.includeRisky && selectedCaseIds.size === 0) selected = selected.filter((entry) => entry.risk === 'safe');
  return selected;
}

function riskCounts(cases: LiveNlCommandCase[]): string {
  const counts = new Map<LiveNlRisk, number>();
  for (const entry of cases) {
    counts.set(entry.risk, (counts.get(entry.risk) || 0) + 1);
  }
  return ['safe', 'mission', 'writes_files', 'external']
    .map((risk) => `${risk}: ${counts.get(risk as LiveNlRisk) || 0}`)
    .join(', ');
}

function indentedBlock(text: string): string {
  return text
    .split(/\r?\n/)
    .map((line) => `    ${line}`)
    .join('\n');
}

export function formatLiveNlVerdictReport(
  cases: LiveNlCommandCase[],
  options: LiveNlVerdictReportOptions = {}
): string {
  const generatedAt = (options.generatedAt || new Date()).toISOString();
  const title = options.title || 'Natural Language Live Verdict Report';
  const suiteLine = options.suite ? `Suite filter: ${options.suite}` : 'Suite filter: all selected safe cases';
  const lines = [
    `# ${title}`,
    '',
    `Generated: ${generatedAt}`,
    suiteLine,
    `Cases: ${cases.length} (${riskCounts(cases)})`,
    '',
    'Use this report after copy-pasting plain prompts from `ops/liveNlCommandSuite.ts --copy-paste`.',
    'Do not paste secrets, full raw logs, or private user text into verdict notes.',
    '',
    'Verdict values: pass, fail, blocked, needs-retest, untested.',
    '',
    '## Session Summary',
    '',
    '- Profile:',
    '- Tester:',
    '- Bot/runtime commit:',
    '- Ledger path, if enabled:',
    '- Overall verdict:',
    '- Follow-up commits/tests:',
    ''
  ];

  for (const entry of cases) {
    const turns = liveNlCaseTurns(entry);
    lines.push(
      `## ${entry.id}`,
      '',
      `- Suite: ${entry.suite}`,
      `- Risk: ${entry.risk}`,
      `- Expected route: ${entry.expectedRoute}`,
      `- Expected outcome: ${entry.expectedOutcome}`,
      '- Verdict: untested',
      '- Actual route:',
      '- Actual outcome:',
      '- Evidence:',
      '- Issue:',
      '- Fix/Test added:',
      '',
      turns.length === 1 ? 'Prompt:' : 'Prompts:',
      '',
      indentedBlock(turns.length === 1
        ? turns[0]
        : turns.map((turn, index) => `Turn ${index + 1}:\n${turn}`).join('\n\n')),
      ''
    );
  }

  return lines.join('\n').trimEnd() + '\n';
}

export function formatLiveNlCopyPastePrompts(
  cases: LiveNlCommandCase[],
  options: LiveNlCopyPasteOptions = {}
): string {
  const title = options.title || 'Natural Language Copy/Paste Prompts';
  const lines = [
    `# ${title}`,
    '',
    'Copy only each Telegram message into Telegram, one at a time.',
    'Do not paste case ids, expected routes, or expected outcomes into Telegram.',
    'After Spark replies, paste the matching reply-capture block back into Codex.',
    ''
  ];

  cases.forEach((entry, index) => {
    const turns = liveNlCaseTurns(entry);
    lines.push(
      `## ${index + 1}. ${entry.id}`,
      ''
    );

    turns.forEach((turn, turnIndex) => {
      const suffix = turns.length > 1 ? ` ${turnIndex + 1} of ${turns.length}` : '';
      const captureCase = turns.length > 1 ? `CASE ${entry.id} TURN ${turnIndex + 1}` : `CASE ${entry.id}`;
      lines.push(
        `Telegram message${suffix}:`,
        '',
        '```text',
        turn,
        '```',
        '',
        `Reply capture${suffix}:`,
        '',
        '```text',
        captureCase,
        'REPLY:',
        '<paste Spark reply here>',
        '```',
        ''
      );
    });
  });

  return lines.join('\n').trimEnd() + '\n';
}
