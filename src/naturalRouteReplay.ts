import {
  decideNaturalRoute,
  type NaturalRouteContextSource,
  type NaturalRouteDecision,
  type NaturalRouteDecisionContext,
  type NaturalRouteOwnerSystem
} from './naturalRouteDecision';
import {
  createNaturalRouteExecutionRecord,
  summarizeNaturalRouteExecutionRecords,
  type NaturalRouteExecutionRecord,
  type NaturalRouteLedgerSummary
} from './naturalRouteLedger';

export interface NaturalRouteReplayCase {
  id: string;
  currentMessage: string;
  context?: NaturalRouteDecisionContext;
  expectedRoute: string;
  expectedOwner?: NaturalRouteOwnerSystem;
  expectedContextSource?: NaturalRouteContextSource;
  expectedPayload?: Record<string, unknown>;
  expectedRequiresConfirmation?: boolean;
  mustNotRoute?: string[];
}

export interface NaturalRouteReplayResult {
  id: string;
  passed: boolean;
  decision: NaturalRouteDecision;
  failures: string[];
}

export interface NaturalRouteReplaySummary {
  total: number;
  passed: number;
  failed: number;
  results: NaturalRouteReplayResult[];
}

export interface NaturalRouteReplayLedgerOptions {
  profile?: string;
  userId?: string | number;
  chatId?: string | number;
  chatType?: string;
  admin?: boolean;
  now?: Date;
}

function objectValue(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function valueContains(actual: unknown, expected: unknown): boolean {
  const expectedObject = objectValue(expected);
  if (!expectedObject) {
    return actual === expected;
  }
  const actualObject = objectValue(actual);
  if (!actualObject) return false;
  return Object.entries(expectedObject)
    .every(([key, value]) => valueContains(actualObject[key], value));
}

function parseReplayCase(value: unknown, lineNumber: number): NaturalRouteReplayCase {
  const record = objectValue(value);
  if (!record) {
    throw new Error(`Replay case line ${lineNumber} is not an object.`);
  }
  const id = typeof record.id === 'string' ? record.id.trim() : '';
  const currentMessage = typeof record.currentMessage === 'string' ? record.currentMessage : '';
  const expectedRoute = typeof record.expectedRoute === 'string' ? record.expectedRoute.trim() : '';
  if (!id || !currentMessage || !expectedRoute) {
    throw new Error(`Replay case line ${lineNumber} needs id, currentMessage, and expectedRoute.`);
  }
  return record as unknown as NaturalRouteReplayCase;
}

export function parseNaturalRouteReplayCases(jsonl: string): NaturalRouteReplayCase[] {
  const results: NaturalRouteReplayCase[] = [];
  const lines = jsonl.split(/\r?\n/).map((line) => line.trim());

  for (let index = 0; index < lines.length; index++) {
    const line = lines[index];
    const lineNumber = index + 1;

    if (!line || line.startsWith('#')) {
      continue;
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(line);
    } catch {
      continue;
    }

    try {
      results.push(parseReplayCase(parsed, lineNumber));
    } catch {
      continue;
    }
  }

  return results;
}

export function evaluateNaturalRouteReplayCase(testCase: NaturalRouteReplayCase): NaturalRouteReplayResult {
  const decision = decideNaturalRoute(testCase.currentMessage, testCase.context || {});
  const failures: string[] = [];

  if (decision.route !== testCase.expectedRoute) {
    failures.push(`expected route ${testCase.expectedRoute}, got ${decision.route}`);
  }
  if (testCase.expectedOwner && decision.owner_system !== testCase.expectedOwner) {
    failures.push(`expected owner ${testCase.expectedOwner}, got ${decision.owner_system}`);
  }
  if (testCase.expectedContextSource && decision.context_source !== testCase.expectedContextSource) {
    failures.push(`expected context ${testCase.expectedContextSource}, got ${decision.context_source}`);
  }
  if (
    typeof testCase.expectedRequiresConfirmation === 'boolean' &&
    decision.requires_confirmation !== testCase.expectedRequiresConfirmation
  ) {
    failures.push(`expected confirmation ${testCase.expectedRequiresConfirmation}, got ${decision.requires_confirmation}`);
  }
  if (testCase.expectedPayload && !valueContains(decision.payload, testCase.expectedPayload)) {
    failures.push('expected payload subset was not present');
  }
  if ((testCase.mustNotRoute || []).includes(decision.route)) {
    failures.push(`must not route to ${decision.route}`);
  }

  return {
    id: testCase.id,
    passed: failures.length === 0,
    decision,
    failures
  };
}

export function runNaturalRouteReplayCases(testCases: NaturalRouteReplayCase[]): NaturalRouteReplaySummary {
  const results = testCases.map(evaluateNaturalRouteReplayCase);
  const passed = results.filter((result) => result.passed).length;
  return {
    total: results.length,
    passed,
    failed: results.length - passed,
    results
  };
}

export function formatNaturalRouteReplaySummary(summary: NaturalRouteReplaySummary): string {
  const lines = [
    `Natural route replay: ${summary.passed}/${summary.total} passed`
  ];
  for (const result of summary.results) {
    const status = result.passed ? 'ok' : 'not ok';
    lines.push(`${status} - ${result.id} -> ${result.decision.route}`);
    for (const failure of result.failures) {
      lines.push(`  ${failure}`);
    }
  }
  return lines.join('\n');
}

export function createNaturalRouteReplayLedgerRecords(
  summary: NaturalRouteReplaySummary,
  options: NaturalRouteReplayLedgerOptions = {}
): NaturalRouteExecutionRecord[] {
  return summary.results.map((result) => createNaturalRouteExecutionRecord({
    decision: result.decision,
    profile: options.profile || 'local_replay_dry_run',
    userId: options.userId || 'local_smoke',
    chatId: options.chatId || 'local_smoke',
    chatType: options.chatType || 'local',
    admin: options.admin ?? true,
    executedRoute: result.decision.route,
    executedOwner: result.decision.owner_system,
    executedAction: result.decision.action,
    delivery: result.passed ? 'selected' : 'failed',
    now: options.now
  }));
}

export function summarizeNaturalRouteReplayLedger(
  summary: NaturalRouteReplaySummary,
  options: NaturalRouteReplayLedgerOptions = {}
): NaturalRouteLedgerSummary {
  return summarizeNaturalRouteExecutionRecords(createNaturalRouteReplayLedgerRecords(summary, options));
}
