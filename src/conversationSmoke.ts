import { safeJsonParse } from './safeJson';
import fs from 'node:fs';
import {
  decideNaturalRoute,
  type NaturalRouteDecision,
  type NaturalRouteDecisionContext,
  type NaturalRouteOwnerSystem
} from './naturalRouteDecision';

export interface ConversationSmokeTurn {
  id?: string;
  user: string;
  assistant?: string;
  expectedRoute?: string;
  expectedRouteOneOf?: string[];
  expectedOwner?: NaturalRouteOwnerSystem;
  expectedRequiresConfirmation?: boolean;
  mustNotRoute?: string[];
  context?: NaturalRouteDecisionContext;
  remember?: boolean;
}

export interface ConversationSmokeScenario {
  id: string;
  description?: string;
  seedRecentMessages?: string[];
  context?: NaturalRouteDecisionContext;
  turns: ConversationSmokeTurn[];
}

export interface ConversationSmokeTurnResult {
  scenarioId: string;
  turnId: string;
  index: number;
  decision: NaturalRouteDecision;
  failures: string[];
}

export interface ConversationSmokeSummary {
  scenarioCount: number;
  turnCount: number;
  passed: number;
  failed: number;
  results: ConversationSmokeTurnResult[];
}

function objectValue(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function stringField(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function routeMatches(decision: NaturalRouteDecision, turn: ConversationSmokeTurn): boolean {
  const expected = [
    ...(turn.expectedRoute ? [turn.expectedRoute] : []),
    ...(turn.expectedRouteOneOf || [])
  ];
  return expected.length === 0 || expected.includes(decision.route);
}

function mergeContext(
  scenarioContext: NaturalRouteDecisionContext | undefined,
  turnContext: NaturalRouteDecisionContext | undefined,
  recentMessages: string[]
): NaturalRouteDecisionContext {
  return {
    ...(scenarioContext || {}),
    ...(turnContext || {}),
    recentMessages: turnContext?.recentMessages || scenarioContext?.recentMessages || recentMessages.slice(-20)
  };
}

function evaluateTurn(
  scenario: ConversationSmokeScenario,
  turn: ConversationSmokeTurn,
  index: number,
  recentMessages: string[]
): ConversationSmokeTurnResult {
  const turnId = turn.id || `${scenario.id}-${index + 1}`;
  const context = mergeContext(scenario.context, turn.context, recentMessages);
  const decision = decideNaturalRoute(turn.user, context);
  const failures: string[] = [];

  if (!routeMatches(decision, turn)) {
    const expected = [
      ...(turn.expectedRoute ? [turn.expectedRoute] : []),
      ...(turn.expectedRouteOneOf || [])
    ].join(' or ');
    failures.push(`expected route ${expected}, got ${decision.route}`);
  }
  if (turn.expectedOwner && decision.owner_system !== turn.expectedOwner) {
    failures.push(`expected owner ${turn.expectedOwner}, got ${decision.owner_system}`);
  }
  if (
    typeof turn.expectedRequiresConfirmation === 'boolean' &&
    decision.requires_confirmation !== turn.expectedRequiresConfirmation
  ) {
    failures.push(`expected confirmation ${turn.expectedRequiresConfirmation}, got ${decision.requires_confirmation}`);
  }
  if ((turn.mustNotRoute || []).includes(decision.route)) {
    failures.push(`must not route to ${decision.route}`);
  }

  return {
    scenarioId: scenario.id,
    turnId,
    index,
    decision,
    failures
  };
}

export function parseConversationSmokeScenarios(value: unknown): ConversationSmokeScenario[] {
  if (!Array.isArray(value)) {
    throw new Error('Conversation smoke fixture must be a JSON array.');
  }
  return value.map((entry, index) => {
    const record = objectValue(entry);
    if (!record) throw new Error(`Scenario ${index + 1} must be an object.`);
    const id = stringField(record.id);
    const turns = Array.isArray(record.turns) ? record.turns as ConversationSmokeTurn[] : [];
    if (!id || turns.length === 0) {
      throw new Error(`Scenario ${index + 1} needs id and turns.`);
    }
    for (const [turnIndex, turn] of turns.entries()) {
      if (!stringField(turn.user)) {
        throw new Error(`Scenario ${id} turn ${turnIndex + 1} needs user text.`);
      }
    }
    return record as unknown as ConversationSmokeScenario;
  });
}

export function readConversationSmokeScenarios(filePath: string): ConversationSmokeScenario[] {
  return parseConversationSmokeScenarios(safeJsonParse(fs.readFileSync(filePath, 'utf8'), [], 'conversation-smoke'));
}

export function runConversationSmokeScenarios(scenarios: ConversationSmokeScenario[]): ConversationSmokeSummary {
  const results: ConversationSmokeTurnResult[] = [];
  for (const scenario of scenarios) {
    const recentMessages = [...(scenario.seedRecentMessages || [])];
    scenario.turns.forEach((turn, index) => {
      const result = evaluateTurn(scenario, turn, index, recentMessages);
      results.push(result);
      if (turn.remember !== false) {
        recentMessages.push(turn.user);
        recentMessages.push(turn.assistant || `Spark route: ${result.decision.route}`);
      }
    });
  }
  const passed = results.filter((result) => result.failures.length === 0).length;
  return {
    scenarioCount: scenarios.length,
    turnCount: results.length,
    passed,
    failed: results.length - passed,
    results
  };
}

export function formatConversationSmokeSummary(summary: ConversationSmokeSummary): string {
  const lines = [
    `Conversation smoke: ${summary.passed}/${summary.turnCount} turns passed across ${summary.scenarioCount} scenarios.`
  ];
  for (const result of summary.results) {
    const status = result.failures.length === 0 ? 'ok' : 'not ok';
    lines.push(`${status} - ${result.scenarioId}/${result.turnId} -> ${result.decision.route}`);
    for (const failure of result.failures) {
      lines.push(`  ${failure}`);
    }
  }
  return lines.join('\n');
}
