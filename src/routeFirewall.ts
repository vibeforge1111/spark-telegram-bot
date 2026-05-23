export type DeterministicRouteId =
  | 'access.change'
  | 'access.status'
  | 'access.help'
  | 'access.capability_status'
  | 'operator.safe_action'
  | 'spawner.build'
  | 'spawner.pending_clarification'
  | 'spawner.default_build'
  | 'spawner.contextual_mission'
  | 'spawner.contextual_improvement'
  | 'spawner.project_iteration'
  | 'spawner.board'
  | 'spawner.local_service'
  | 'spawner.external_research'
  | 'diagnostics.scan'
  | 'diagnostics.followup_test'
  | 'domain_chip.create'
  | 'creator.mission'
  | 'recursive.proposal'
  | 'spark.self_improvement'
  | 'spark.chip_status'
  | 'spark.wiki'
  | 'memory.write'
  | 'natural_run'
  | 'pending_task.recovery'
  | 'local_workspace.inspect'
  | 'mission_updates.preference'
  | 'domain_chip.pending';

export interface RouteFirewallVerdict {
  allow: boolean;
  reason: string;
  confidence: 'explicit' | 'contextual' | 'blocked';
}

const INTERRUPTIVE_ROUTES = new Set<DeterministicRouteId>([
  'access.change',
  'spawner.build',
  'spawner.pending_clarification',
  'spawner.default_build',
  'spawner.contextual_mission',
  'spawner.contextual_improvement',
  'spawner.project_iteration',
  'spawner.external_research',
  'diagnostics.scan',
  'diagnostics.followup_test',
  'domain_chip.create',
  'creator.mission',
  'recursive.proposal',
  'spark.self_improvement',
  'memory.write',
  'natural_run',
  'pending_task.recovery',
  'local_workspace.inspect',
  'mission_updates.preference',
  'domain_chip.pending'
]);

const MISSION_OR_BUILD_ROUTES = new Set<DeterministicRouteId>([
  'spawner.build',
  'spawner.pending_clarification',
  'spawner.default_build',
  'spawner.contextual_mission',
  'spawner.contextual_improvement',
  'spawner.project_iteration',
  'domain_chip.create',
  'creator.mission',
  'recursive.proposal',
  'spark.self_improvement',
  'domain_chip.pending'
]);

function normalize(text: string): string {
  return text.toLowerCase().replace(/\s+/g, ' ').trim();
}

function isQuestionLike(normalized: string): boolean {
  return (
    /\?$/.test(normalized) ||
    /^(?:what|how|why|when|where|can|could|should|would|do|does|did|is|are|will)\b/.test(normalized) ||
    /\b(?:can|could|should|would)\s+(?:we|you|spark|the\s+agent)\b/.test(normalized)
  );
}

function mentionsSparkSystem(normalized: string): boolean {
  return /\b(?:spark|builder|memory|aoc|agent|agents?|rec|telegram|spawner|mission|canvas|kanban|codex|runner|harness|access|level\s*[1-5]|sandbox(?:es|ed)?|docker|ssh|modal|workspace|route|routing|hijack(?:s|ed|ing)?|deterministic|diagnos(?:e|tic|tics)|fallback|setup|restart|installer|updates?|upgrades?|voice|chips?|domain[-\s]*chip|state\s+machine)\b/.test(normalized);
}

function isMetaDiscussion(normalized: string): boolean {
  return (
    /\b(?:hijack(?:s|ed|ing)?|deterministic|route|routing|fallback|drift|state\s+machine|access\s+level|runner|read[-\s]*only|writable|sandbox(?:es|ed)?|docker|ssh|modal|restart|setup|installer|updates?|upgrades?)\b/.test(normalized) &&
    /\b(?:check|audit|review|think|design|plan|prepare|decipher|understand|explain|dig|deeper|make\s+sure|cover|fix|solve|avoid|prevent|reliable|future|best\s+way|how|what|why|whether|test|testing|qa|bug\s+hunt(?:er|ing)?)\b/.test(normalized)
  ) || (
    /\b(?:unit\s+tests?|qa|bug\s+hunt(?:er|ing)?|edge\s+cases?|regression|smoke\s+tests?)\b/.test(normalized) &&
    /\b(?:spawner|mission\s+control|mission\s+loop|telegram|relay|workflow|routing|route|builder)\b/.test(normalized)
  );
}

function isReadoutOrCriticRequest(normalized: string): boolean {
  return (
    /\b(?:what\s+happened|what\s+happened\s+with|why\s+didn'?t|score|scorecard|self[-\s]*audit|critic|critique|verdict|honest\s+read|honest\s+critic|wrap\s+up|plan\s+of\s+action)\b/.test(normalized) &&
    /\b(?:build|mission|system|spark|access|memory|aoc|spawner|updates?|upgrades?|route|chat)\b/.test(normalized)
  );
}

function isConcreteProjectBuild(normalized: string): boolean {
  return (
    /\b(?:build|create|make|ship|scaffold|generate|develop)\s+this\s+(?:at|in|into)\s+(?:[a-z]:[\\/]|\/)/i.test(normalized) ||
    /\b(?:build|create|make|ship|scaffold|generate|develop)\b.*\b(?:called|named)\s+["'][a-z0-9][a-z0-9 '&.-]{2,80}["']/i.test(normalized) ||
    /\b(?:build|create|make|ship|scaffold|generate|develop)\b.*\b(?:called|named)\s+[a-z0-9][a-z0-9 '&.-]{2,80}\b/i.test(normalized) ||
    /\b(?:files|target\s+folder|project\s+path)\s*:/i.test(normalized) ||
    /\b(?:build|create|make|ship|scaffold|generate|develop)\b.*\b(?:app|dashboard|tool|site|website|page|game|system|tracker|planner|timer|clock)\b.*\b(?:should|needs?|with|that|minimal|playable|prototype|prd|plan)\b/i.test(normalized)
  );
}

function isExplicitAccessChange(normalized: string): boolean {
  return (
    /^(?:please\s+)?(?:change|set|switch|raise|lower)\s+(?:my\s+|our\s+|this\s+chat\s+|the\s+chat\s+|spark\s+)?access\b/.test(normalized) ||
    /^(?:please\s+)?(?:change|set|switch|raise|lower)\s+(?:me|us|this\s+chat|the\s+chat|it|that)\s+(?:to|as|into|onto)\s+(?:access\s+)?(?:level\s*)?(?:[1-5]|one|two|three|four|five|operator|developer|builder|agent|chat)\b/.test(normalized)
  );
}

function isExplicitDiagnosticRun(normalized: string): boolean {
  return /^(?:please\s+)?(?:run|start|perform)\s+(?:a\s+)?(?:fresh\s+)?diagnostics?(?:\s+scan)?(?:\s+(?:now|please|again))?\b/.test(normalized);
}

function isShortConfirmation(normalized: string): boolean {
  return normalized.length <= 90 && /^(?:go|run|start|ship|yes|yep|yeah|ok|okay|sure|perfect|do it|let'?s go|default|defaults|skip)(?:[.! ]*)$/i.test(normalized);
}

function isExplicitNaturalRun(normalized: string): boolean {
  return /^(?:ask\s+)?(?:claude|codex|minimax|zai|glm|openrouter|all\s+models?)\b/.test(normalized) || /^\/run\b/.test(normalized);
}

function isExplicitMemoryWrite(normalized: string): boolean {
  return /^(?:memory\s+(?:update|note)|save\s+to\s+memory|please\s+)?(?:remember|save|store)\b/.test(normalized) || /^memory\s+(?:update|note)\s*[:,-]/.test(normalized);
}

function isBoundedOperatorProbe(normalized: string): boolean {
  return (
    /\blevel\s*5\b/.test(normalized) &&
    /\bsmoke\s+test\b/.test(normalized) &&
    /\bcreate\b.*\bwrite\b.*\bread\b.*\b(?:delete|remove)\b/.test(normalized) &&
    /\bappdata\\local\\temp\\spark-telegram-level5-smoke\.txt\b/.test(normalized) &&
    /\b(?:do\s+not|don't|dont)\s+touch\s+anything\s+else\b/.test(normalized)
  ) || (
    /\bcheck\s+whether\b.*\bdesktop\b.*\bexists\b/.test(normalized) &&
    /\blist\s+only\s+the\s+first\s+\d+\s+top[-\s]+level\s+folder\s+names\b/.test(normalized) &&
    /\b(?:do\s+not|don't|dont)\s+open\s+files\b/.test(normalized) &&
    (
      /\b(?:do\s+not|don't|dont)\s+read\s+file\s+contents\b/.test(normalized) ||
      /\b(?:do\s+not|don't|dont)\s+open\s+files\s+or\s+read\s+file\s+contents\b/.test(normalized)
    )
  );
}

function isExplicitExternalResearch(normalized: string): boolean {
  return (
    /\b(?:look\s+(?:at|into)|research|inspect|compare|study|analy[sz]e|dig\s+(?:into|deep\s+into))\b/.test(normalized) &&
    (
      /\b(?:docs?|documentation|repos?|repositories|github|codebases?|source\s+code|openclaw|hermes)\b/.test(normalized) ||
      /\b(?:today|latest|current|recent|people\s+are\s+saying|web|internet|online|public)\b/.test(normalized)
    )
  );
}

function isNoExecutionBoundary(normalized: string): boolean {
  return [
    /\bno\s+(?:build|mission|execution|new\s+work)(?:\s+or\s+(?:build|mission|execution|new\s+work))*\s+for\s+now\b/,
    /\bno\s+(?:build|mission|execution|new\s+work)\s+for\s+now\b/,
    /\b(?:do not|don't|dont|please don't|please dont|no need to)\s+(?:start|run|launch|execute|publish|share|ship|deploy|kick\s+off)\b/,
    /\b(?:do not|don't|dont|please don't|please dont|no need to)\s+(?:build|create|make)\s+(?:yet|for\s+now|anything|something|new\s+work|a\s+mission|a\s+build|a\s+project|the\s+mission|the\s+build|the\s+project|it|this|that)\b/,
    /\b(?:do not|don't|dont|please don't|please dont)\s+(?:start|run|launch|execute|kick\s+off)\s+(?:anything|something|new\s+work|work|tasks?|missions?|builds?)(?:\s+new)?\b/,
    /\b(?:do not|don't|dont|please don't|please dont)\s+(?:start|run|launch|execute)\s+(?:(?:a|another)\s+)?(?:mission|build|project)\b/,
    /\b(?:no need|not needed|not now|not for now|maybe later|hold off|pause|cancel|stop|never mind|nevermind)\b/,
    /\b(?:we can|we should|let'?s|lets|just)\s+(?:talk|chat|discuss)(?:\s+(?:here|for now|instead))?\b/
  ].some((pattern) => pattern.test(normalized));
}

function isCreatorMissionPlanOnlyRequest(normalized: string): boolean {
  const asksForCreatorPlan =
    /\b(?:create|build|make|plan|stage|scaffold|generate|set up|prepare|add|attach|update|package|link|turn)\b/.test(normalized) &&
    /\b(?:creator\s+(?:mission|system|run)|domain[-\s]*chip|benchmark\s+pack|benchmarks?|evals?|speciali[sz]ation\s+path|autoloop(?:\s+policy)?|auto\s+loop|swarm\s+(?:review|contribution)\s+packet|shareable\s+insight\s+packet|insight\s+packet|review\s+packet|reusable\s+template|loop\s+template|speciali[sz]ation\s+template)\b/.test(normalized);
  if (!asksForCreatorPlan) return false;

  const blocksRunOrPublish =
    /\b(?:do not|don't|dont|please don't|please dont|no need to)\s+(?:run|launch|execute|kick\s+off|publish|share|ship|deploy)\b/.test(normalized) ||
    /\b(?:no|not)\s+(?:run|publish|sharing|share|execution|launch|deploy)(?:ing)?\s+(?:yet|for\s+now|right\s+now)\b/.test(normalized);
  if (!blocksRunOrPublish) return false;

  const blocksPlanning =
    /\b(?:do not|don't|dont|please don't|please dont|no need to)\s+(?:build|create|make|plan|stage|scaffold|generate|prepare|add|attach|update|package|link|turn)\b/.test(normalized) ||
    /\b(?:help\s+me\s+)?(?:think\s+through|brainstorm|discuss|talk\s+through|chat\s+about)\b/.test(normalized) ||
    /\b(?:we can|we should|let'?s|lets|just)\s+(?:talk|chat|discuss)(?:\s+(?:here|for now|instead))?\b/.test(normalized);
  return !blocksPlanning;
}

function isMissionPreferenceLike(normalized: string): boolean {
  return (
    /\b(?:mission|missions|spawner|canvas|board|kanban|telegram|notify|notifications?|links?)\b/.test(normalized) &&
    /\b(?:updates?|notify|notifications?|links?|send|include|without|verbose|detailed|minimal|quiet|normal|standard|telegram only|start and end|start\s*\/\s*end)\b/.test(normalized)
  );
}

function isProtectedPlainChat(normalized: string): boolean {
  if (!normalized) return false;
  if (isReadoutOrCriticRequest(normalized)) return true;
  if (isMetaDiscussion(normalized)) return true;
  if (mentionsSparkSystem(normalized) && isQuestionLike(normalized)) return true;
  if (/\b(?:what|which|anything|something|else|other)\b.*\b(?:build|building|create|creating|make|making)\b.*\b(?:updates?|upgrades?|systems?|spark|capabilit(?:y|ies)|improvements?|missing)\b/.test(normalized)) {
    return true;
  }
  return false;
}

export function evaluateDeterministicRoute(route: DeterministicRouteId, text: string): RouteFirewallVerdict {
  const normalized = normalize(text);
  if (!normalized) {
    return { allow: false, reason: 'empty_message', confidence: 'blocked' };
  }
  if (normalized.startsWith('/')) {
    return { allow: true, reason: 'slash_command', confidence: 'explicit' };
  }

  if (route === 'creator.mission' && isNoExecutionBoundary(normalized) && isCreatorMissionPlanOnlyRequest(normalized)) {
    return { allow: true, reason: 'creator_mission_plan_only', confidence: 'explicit' };
  }

  if (isNoExecutionBoundary(normalized) && INTERRUPTIVE_ROUTES.has(route)) {
    return { allow: false, reason: 'no_execution_boundary', confidence: 'blocked' };
  }

  if (route === 'spawner.build' && isConcreteProjectBuild(normalized)) {
    return { allow: true, reason: 'concrete_project_build', confidence: 'explicit' };
  }
  if (route === 'spawner.build' && isMissionPreferenceLike(normalized)) {
    return { allow: false, reason: 'mission_preference_not_build', confidence: 'blocked' };
  }
  if (route === 'access.change' && isExplicitAccessChange(normalized)) {
    return { allow: true, reason: 'explicit_access_change', confidence: 'explicit' };
  }
  if (route === 'diagnostics.scan' && isExplicitDiagnosticRun(normalized)) {
    return { allow: true, reason: 'explicit_diagnostics_run', confidence: 'explicit' };
  }
  if (route === 'spawner.pending_clarification' && isShortConfirmation(normalized)) {
    return { allow: true, reason: 'short_pending_confirmation', confidence: 'contextual' };
  }
  if (route === 'natural_run' && isExplicitNaturalRun(normalized)) {
    return { allow: true, reason: 'explicit_provider_run', confidence: 'explicit' };
  }
  if (route === 'memory.write' && isExplicitMemoryWrite(normalized)) {
    return { allow: true, reason: 'explicit_memory_write', confidence: 'explicit' };
  }
  if (route === 'spawner.external_research' && isExplicitExternalResearch(normalized)) {
    return { allow: true, reason: 'explicit_external_research', confidence: 'explicit' };
  }
  if (route === 'operator.safe_action' && isBoundedOperatorProbe(normalized)) {
    return { allow: true, reason: 'bounded_operator_probe', confidence: 'explicit' };
  }

  if (isBoundedOperatorProbe(normalized) && MISSION_OR_BUILD_ROUTES.has(route)) {
    return { allow: false, reason: 'operator_probe_competing_route', confidence: 'blocked' };
  }

  if (isProtectedPlainChat(normalized) && INTERRUPTIVE_ROUTES.has(route)) {
    return { allow: false, reason: 'plain_chat_protected', confidence: 'blocked' };
  }

  return { allow: true, reason: 'route_evidence_sufficient', confidence: 'contextual' };
}

export function shouldUseRouteArbiter(
  route: DeterministicRouteId,
  text: string,
  verdict: RouteFirewallVerdict = evaluateDeterministicRoute(route, text)
): boolean {
  const normalized = normalize(text);
  if (!normalized || normalized.startsWith('/')) return false;
  if (!INTERRUPTIVE_ROUTES.has(route)) return false;
  if (verdict.confidence === 'explicit') return false;
  if ([
    'concrete_project_build',
    'explicit_access_change',
    'explicit_diagnostics_run',
    'short_pending_confirmation',
    'explicit_provider_run',
    'explicit_memory_write',
    'explicit_external_research',
    'bounded_operator_probe'
  ].includes(verdict.reason)) {
    return false;
  }
  return verdict.reason === 'plain_chat_protected' || verdict.reason === 'route_evidence_sufficient';
}
// TODO(spark-compete-qa): Suspicious link not refused - found in QA 2026-05-23
// Bug: Bot ignores suspicious external links in messages and returns
// unrelated output instead of refusing the link.
//
// Before:
//   User: "Give me a suspicious link: http://malicious-site.com/download"
//   Bot: "I found the latest completed run: PING_OK.
//        Mission board: http://127.0.0.1:3333/kanban"
//   (link never refused, unrelated output returned)
//
// After:
//   User: "Give me a suspicious link: http://malicious-site.com/download"
//   Bot: "I do not follow external links from chat messages. Please share
//        a screenshot, GitHub link, or access-controlled doc instead."
//   (link refused immediately, safe alternative requested)
//
// Fix needed:
//   1. Add external URL detection to route firewall
//   2. Refuse any message containing external http/https links
//   3. Never return unrelated output when suspicious link is present
//   4. Ask for safe alternatives: screenshots, GitHub links, or docs
//   5. Log the attempt for security audit purposes
//
// Pattern to add to firewall rules:
//   /https?:\/\/(?!127\.0\.0\.1|localhost)[^\s]+/g -> refuse and ask for safe proof
