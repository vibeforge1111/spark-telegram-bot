export type DeterministicRouteId =
  | 'access.change'
  | 'access.status'
  | 'access.help'
  | 'access.capability_status'
  | 'operator.safe_action'
  | 'route.probe'
  | 'spawner.build'
  | 'spawner.pending_clarification'
  | 'spawner.default_build'
  | 'spawner.contextual_mission'
  | 'spawner.contextual_improvement'
  | 'spawner.project_iteration'
  | 'spawner.board'
  | 'spawner.local_service'
  | 'spawner.external_research'
  | 'spawner.mission_control'
  | 'diagnostics.scan'
  | 'diagnostics.followup_test'
  | 'domain_chip.create'
  | 'creator.mission'
  | 'recursive.command'
  | 'recursive.proposal'
  | 'recursive.start'
  | 'spark.self_improvement'
  | 'spark.process'
  | 'spark.reflect'
  | 'spark.chip_status'
  | 'spark.wiki'
  | 'media.image_analyze_or_boundary'
  | 'media.voice_transcribe_or_boundary'
  | 'media.audio_transcribe_or_boundary'
  | 'voice.command'
  | 'memory.write'
  | 'memory.delete'
  | 'model.switch'
  | 'schedule.create'
  | 'schedule.delete'
  | 'natural_run'
  | 'pending_task.recovery'
  | 'local_workspace.inspect'
  | 'mission_updates.preference'
  | 'sparkqa.status'
  | 'sparkqa.run'
  | 'sparkqa.benchmark'
  | 'sparkqa.pause'
  | 'domain_chip.pending';

export interface RouteFirewallVerdict {
  allow: boolean;
  reason: string;
  confidence: 'explicit' | 'contextual' | 'blocked';
}

const INTERRUPTIVE_ROUTES = new Set<DeterministicRouteId>([
  'access.change',
  'route.probe',
  'spawner.build',
  'spawner.pending_clarification',
  'spawner.default_build',
  'spawner.contextual_mission',
  'spawner.contextual_improvement',
  'spawner.project_iteration',
  'spawner.external_research',
  'spawner.mission_control',
  'diagnostics.scan',
  'diagnostics.followup_test',
  'domain_chip.create',
  'creator.mission',
  'recursive.proposal',
  'recursive.start',
  'spark.self_improvement',
  'spark.process',
  'spark.reflect',
  'spark.wiki',
  'voice.command',
  'memory.write',
  'memory.delete',
  'model.switch',
  'schedule.create',
  'schedule.delete',
  'natural_run',
  'pending_task.recovery',
  'local_workspace.inspect',
  'mission_updates.preference',
  'sparkqa.run',
  'sparkqa.benchmark',
  'sparkqa.pause',
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
  'recursive.start',
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

function isExplicitSpawnerNoEditMission(normalized: string): boolean {
  if (/\b(?:do\s+not|don't|dont|no\s+need\s+to|without)\s+(?:start|run|launch|queue|dispatch|execute)\b/.test(normalized)) {
    return false;
  }
  const missionLike = /\bmission\b/.test(normalized) ||
    /\bmission\s+control\b/.test(normalized) ||
    /\bdiagnostic\b/.test(normalized) ||
    /\bprobe\b/.test(normalized) ||
    /\bproof\b/.test(normalized);
  return /\bspawner\b/.test(normalized) &&
    /\b(?:run|start|launch|queue|execute)\b/.test(normalized) &&
    missionLike &&
    (
      /\bno[-\s]*edit\b/.test(normalized) ||
      /\b(?:do\s+not|don't|dont)\s+edit\s+files?\b/.test(normalized) ||
      /\brepl(?:y|ies)\s+with\b/.test(normalized) ||
      /\bspark_[a-z0-9_]{4,}\b/.test(normalized)
    );
}

function isShortConfirmation(normalized: string): boolean {
  return normalized.length <= 90 && /^(?:go|run|start|ship|yes|yep|yeah|ok|okay|sure|perfect|do it|let'?s go|default|defaults|skip)(?:[.! ]*)$/i.test(normalized);
}

function isExplicitNaturalRun(normalized: string): boolean {
  return /^(?:ask\s+)?(?:claude|codex|minimax|zai|glm|openrouter|all\s+models?)\b/.test(normalized) || /^\/run\b/.test(normalized);
}

function isExplicitMemoryWrite(normalized: string): boolean {
  return /^(?:memory\s+(?:update|note)|save\s+to\s+memory|please\s+)?(?:remember|save|store)\b/.test(normalized) ||
    /^(?:for\s+later|note\s+for\s+later)\s*[,:-]/.test(normalized) ||
    /^memory\s+(?:update|note)\s*[:,-]/.test(normalized);
}

function isExplicitModelSwitch(normalized: string): boolean {
  return /\b(?:switch|change|set|make|use|configure|update)\b.{0,80}\b(?:mission\s+provider|provider\s+for\s+(?:missions?|spawner|builds?)|(?:missions?|spawner|builds?)\b.{0,40}\bprovider)\b/.test(normalized) &&
    /\b(?:codex|claude|anthropic|zai|glm|minimax|openrouter|openai|huggingface|hf|lmstudio|lm\s+studio|ollama)\b/.test(normalized);
}

function isModelSwitchStopBoundary(normalized: string): boolean {
  return /\b(?:do not|don't|dont|please don't|please dont|no need to)\s+(?:change|set|switch|make|use|configure|update)\b.{0,60}\b(?:mission\s+provider|provider\s+for\s+(?:missions?|spawner|builds?))\b/.test(normalized) ||
    /\b(?:no|not)\s+(?:mission\s+)?provider\s+(?:switch|change)(?:\s+(?:yet|for\s+now|right\s+now))?\b/.test(normalized);
}

function isExplicitScheduleDelete(normalized: string): boolean {
  return /\b(?:delete|cancel|remove|kill|stop|drop|disable|turn\s+off)\b.{0,80}\b(?:schedule|scheduled|reminder|job|automation|routine|recurring\s+task|sched-[a-z0-9]+)\b/.test(normalized) ||
    /\b(?:schedule|scheduled|reminder|job|automation|routine|recurring\s+task|sched-[a-z0-9]+)\b.{0,80}\b(?:delete|cancel|remove|kill|stop|drop|disable|turn\s+off)\b/.test(normalized);
}

function isExplicitProjectIteration(normalized: string): boolean {
  return /\b(?:improve|polish|iterate|revise|update|fix|change|upgrade)\b.{0,80}\b(?:latest|current|existing|this|that|it|project|app|build|site|dashboard|tool)\b/.test(normalized) ||
    /\b(?:latest|current|existing|this|that|it|project|app|build|site|dashboard|tool)\b.{0,80}\b(?:improve|polish|iterate|revise|update|fix|change|upgrade)\b/.test(normalized);
}

function isExplicitDefaultBuildChoice(normalized: string): boolean {
  return /^(?:default|defaults|use defaults?|choose default|pick default|go with default|use the recommended(?: option| direction)?|choose the recommended(?: option| direction)?|pick the recommended(?: option| direction)?)$/.test(normalized) ||
    /\b(?:choose|pick|use|go with|start|run)\b.{0,60}\b(?:default|recommended|first|best)\b.{0,40}\b(?:option|direction|build|one|path)\b/.test(normalized);
}

function isPendingDomainChipDirection(normalized: string): boolean {
  if (/^(?:yes|yeah|yep|yup|ok|okay|sure)$/.test(normalized)) return false;
  return /^(?:go|go ahead|start|run it|start it|use defaults?|defaults?|use your defaults?|recommended defaults?)\b/.test(normalized) ||
    /\b(?:names?|rationale|usage angle|vibe|tone|luxury|absurd|consumer|sci[-\s]*fi|router[-\s]*safe|defaults?)\b/.test(normalized);
}

function isExplicitDomainChipCreate(normalized: string): boolean {
  return /\b(?:build|create|make|scaffold|generate)\b.{0,80}\b(?:domain[-\s]*chip|chip)\b/.test(normalized) ||
    /^(?:please\s+)?(?:domain[-\s]*chip|chip)\s+(?:for|that|which|to)\b/.test(normalized);
}

function isExplicitSparkSelfImprovementRequest(normalized: string): boolean {
  if (isCapabilityEvaluationDiscussion(normalized)) return false;
  return (
    /\b(?:run|start|perform|execute|pick|choose|decide)\b.{0,100}\b(?:spark\s+)?self[-\s]*improvement\b/.test(normalized) ||
    /\b(?:what|which)\b.{0,80}\b(?:you|spark|agent)\b.{0,80}\b(?:improve|upgrade|repair|fix|work\s+on)\b/.test(normalized) ||
    /\b(?:improving|improve|upgrade|change|install|enable|connect|wire|integrate|give|build|create|set\s+up|make)\b.{0,120}\b(?:your|you|spark|agent)\b.{0,80}\b(?:capabilit(?:y|ies)|brain|memory|workflow|voice|email|calendar|files?|tools?|skills?|integrations?)\b/.test(normalized) ||
    /\b(?:your|you|spark|agent)\b.{0,80}\b(?:capabilit(?:y|ies)|brain|memory|workflow|voice|email|calendar|files?|tools?|skills?|integrations?)\b.{0,120}\b(?:improve|upgrade|change|install|enable|connect|wire|integrate|give|build|create|set\s+up|make)\b/.test(normalized)
  );
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

function isExplicitSparkQaRun(normalized: string): boolean {
  if (isExplicitCreatorArtifactRequest(normalized)) return false;
  return /\bspark\s+qa\s+operator\b/.test(normalized) &&
    /\b(?:benchmark|autoloop|proof|score|scores)\b/.test(normalized) &&
    /\b(?:run|start|execute|perform|show|check|report|score|scores|what(?:'s| is)|where)\b/.test(normalized);
}

function isExplicitSparkQaPause(normalized: string): boolean {
  return /\b(?:pause|stop|hold)\b/.test(normalized) &&
    /\bspark\s+qa\s+operator\b/.test(normalized) &&
    /\b(?:loop|autoloop|rounds?)\b/.test(normalized);
}

function isExplicitExternalResearch(normalized: string): boolean {
  return (
    /\b(?:look\s+(?:at|into)|research|inspect|compare|study|analy[sz]e|dig\s+(?:into|deep\s+into))\b/.test(normalized) &&
    (
      /\b(?:docs?|documentation|repos?|repositories|github|codebases?|source\s+code|open\s+source|agent\s+harness|openclaw|hermes)\b/.test(normalized) ||
      /\b(?:today|latest|current|recent|people\s+are\s+saying|web|internet|online|public)\b/.test(normalized)
    )
  );
}

function isExplicitMissionPreferenceChange(normalized: string): boolean {
  return /\b(?:set|change|make|switch|keep|turn|configure|update)\b.{0,80}\b(?:mission|missions|spawner|canvas|board|kanban|telegram)\b.{0,80}\b(?:updates?|notifications?|links?|quiet|minimal|verbose|detailed|normal|standard|telegram only|start and end|start\s*\/\s*end)\b/.test(normalized) ||
    /\b(?:mission|missions|spawner|canvas|board|kanban|telegram)\b.{0,80}\b(?:updates?|notifications?|links?)\b.{0,80}\b(?:quiet|minimal|verbose|detailed|normal|standard|telegram only|start and end|start\s*\/\s*end)\b/.test(normalized);
}

function isExplicitRecursiveProposal(normalized: string): boolean {
  return /\bpropose\b.{0,60}\brecursive\b.{0,80}\b(?:network|packet|proposal)\b/.test(normalized);
}

function isExplicitMissionControlAction(normalized: string): boolean {
  if (isQuestionLike(normalized)) return false;
  return /\b(?:pause|resume|cancel|kill|stop)\b.{0,50}\b(?:mission|it|that|this)\b/.test(normalized) ||
    /\b(?:mission|it|that|this)\b.{0,50}\b(?:pause|resume|cancel|kill|stop)\b/.test(normalized) ||
    /^(?:confirm|yes[, ]+cancel|cancel it|kill it|stop it|resume it|pause it)\b/.test(normalized);
}

function isNoExecutionBoundary(normalized: string): boolean {
  return [
    /\b(?:do not|don't|dont|please don't|please dont|no need to)\s+(?:build|create|make|scaffold|generate|start|run|launch|execute|dispatch|mission|spawner|codex|provider|schedule|loop|chip|publish|deploy|ship|save|remember|route|memory|wiki|access|draft|canvas)\b(?:\s+(?:it|this|that|anything|something|yet|for\s+now|now))?/,
    /\bno\s+(?:build|mission|execution|new\s+work)(?:\s+or\s+(?:build|mission|execution|new\s+work))*\s+for\s+now\b/,
    /\bno\s+(?:build|mission|execution|new\s+work)\s+for\s+now\b/,
    /\b(?:do not|don't|dont|please don't|please dont|no need to)\s+(?:start|run|launch|execute|publish|share|ship|deploy|kick\s+off)\b/,
    /\b(?:do not|don't|dont|please don't|please dont|no need to)\s+(?:build|create|make)\s+(?:yet|for\s+now|anything|something|new\s+work|a\s+mission|a\s+build|a\s+project|a\s+domain[-\s]*chip|a\s+chip|the\s+mission|the\s+build|the\s+project|the\s+domain[-\s]*chip|the\s+chip|it|this|that)\b/,
    /\b(?:do not|don't|dont|please don't|please dont)\s+(?:start|run|launch|execute|kick\s+off)\s+(?:anything|something|new\s+work|work|tasks?|missions?|builds?)(?:\s+new)?\b/,
    /\b(?:do not|don't|dont|please don't|please dont)\s+(?:start|run|launch|execute)\s+(?:(?:a|another)\s+)?(?:mission|build|project)\b/,
    /\b(?:no need|not needed|not now|not for now|maybe later|hold off|pause|cancel|stop|never mind|nevermind)\b/,
    /\b(?:mentioning|just mentioning|only mentioning|keyword|keywords|word here|words here|word alone|words alone|phrase|phrases|term|terms|quoted text|quoted bug[-\s]*report term|bug\s+report|qa\s+case|meta[-\s]*language|not a request|not an instruction|not a command|not asking for|does\s+not\s+mean|doesn't\s+mean|not\s+mean)\b.{0,100}\b(?:build|create|make|scaffold|generate|start|run|launch|execute|mission|spawner|codex|provider|schedule|loop|chip|route|memory|wiki|access|publish|deploy|remember|draft|canvas)\b/,
    /\b(?:build|create|make|scaffold|generate|start|run|launch|execute|mission|spawner|codex|provider|schedule|loop|chip|route|memory|wiki|access|publish|deploy|remember|draft|canvas)\b.{0,100}\b(?:keyword|keywords|word here|words here|word alone|words alone|phrase|phrases|term|terms|quoted text|quoted bug[-\s]*report term|bug\s+report|qa\s+case|meta[-\s]*language|not a request|not an instruction|not a command|not asking for|does\s+not\s+mean|doesn't\s+mean|not\s+mean)\b/,
    /\b(?:stay in chat|just explain|explain the boundary|explain the failure class)\b/,
    /\b(?:we can|we should|let'?s|lets|just)\s+(?:talk|chat|discuss)(?:\s+(?:here|for now|instead))?\b/
  ].some((pattern) => pattern.test(normalized));
}

function isAccessChangeStopBoundary(normalized: string): boolean {
  return /\b(?:do not|don't|dont|please don't|please dont|no need to)\s+(?:change|set|switch|raise|lower|enable|disable)\b.{0,40}\baccess\b/.test(normalized) ||
    /\b(?:no|not)\s+access\s+change(?:\s+(?:yet|for\s+now|right\s+now))?\b/.test(normalized);
}

function hasExecutionStopBoundary(normalized: string): boolean {
  return [
    /\b(?:do not|don't|dont|please don't|please dont|no need to)\s+(?:build|create|make|scaffold|generate|start|run|launch|execute|dispatch|mission|spawner|codex|provider|schedule|loop|chip|save|remember|route|memory|wiki|access|draft|canvas)\b(?:\s+(?:it|this|that|anything|something|yet|for\s+now|now))?/,
    /\b(?:do not|don't|dont|please don't|please dont|no need to)\s+(?:start|run|launch|execute|kick\s+off)\b/,
    /\b(?:do not|don't|dont|please don't|please dont|no need to)\s+(?:build|create|make)\s+(?:yet|for\s+now|anything|something|new\s+work|a\s+mission|a\s+build|a\s+project|a\s+domain[-\s]*chip|a\s+chip|the\s+mission|the\s+build|the\s+project|the\s+domain[-\s]*chip|the\s+chip|it|this|that)\b/,
    /\b(?:no need|not needed|not now|not for now|maybe later|hold off|pause|cancel|stop|never mind|nevermind)\b/,
    /\b(?:we can|we should|let'?s|lets|just)\s+(?:talk|chat|discuss)(?:\s+(?:here|for now|instead))?\b/
  ].some((pattern) => pattern.test(normalized));
}

function hasPublicationOnlyBoundary(normalized: string): boolean {
  return (
    /\b(?:do not|don't|dont|please don't|please dont|no need to)\s+(?:publish|share|ship|deploy|push)\b/.test(normalized) ||
    /\b(?:do not|don't|dont|please don't|please dont|no need to)\s+(?:publish|share|ship|deploy|push)\b.{0,80}\b(?:publish|share|ship|deploy|push)\b/.test(normalized) ||
    /\b(?:private|local only|local-only|keep it local|do not claim public|don't claim public|no public|not public|network[-\s]*absorbable\s+false)\b/.test(normalized)
  ) && !hasExecutionStopBoundary(normalized);
}

function isLocalSelfImprovementCanary(normalized: string): boolean {
  const asksToRun = /\b(?:run|start|perform|execute)\b/.test(normalized);
  const selfImprovement =
    /\b(?:spark\s+)?(?:startup\s+)?self[-\s]*improvement\b/.test(normalized) ||
    /\bself[-\s]*improving\s+(?:agent|loop)\b/.test(normalized);
  const canaryShape =
    /\b(?:canary|baseline|improved\s+answer|before\s*\/\s*after|before\s+and\s+after|jury\s+verdict|blind\s+jury|critique|proof\s+boundary)\b/.test(normalized);
  const publicationBoundary =
    /\b(?:do not|don't|dont|please don't|please dont|no need to)\s+(?:publish|share|ship|deploy|merge|claim)\b/.test(normalized) ||
    /\b(?:public[-\s]*ready|network[-\s]*absorbable|network\s+absorption|promotion\s+gates?)\b/.test(normalized);
  const explicitNoRun =
    /\b(?:do not|don't|dont|please don't|please dont|no need to)\s+(?:start|run|launch|execute|kick\s+off)\b/.test(normalized) ||
    /\b(?:no|not)\s+(?:run|execution|launch)(?:ning)?\s+(?:yet|for\s+now|right\s+now)\b/.test(normalized);

  return asksToRun && selfImprovement && canaryShape && publicationBoundary && !explicitNoRun;
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

function isExplicitCreatorArtifactRequest(normalized: string): boolean {
  return /\b(?:create|build|make|scaffold|generate|prepare)\b/.test(normalized) &&
    /\b(?:benchmark\s+pack|eval\s+pack|review\s+packet|creator\s+artifact|proof\s+packet)\b/.test(normalized) &&
    !/\b(?:do not|don't|dont|no need to)\s+(?:create|build|make|scaffold|generate|prepare)\b/.test(normalized);
}

function isExplicitCreatorMissionArtifactRequest(normalized: string): boolean {
  if (isQuestionLike(normalized)) return false;
  return isExplicitCreatorArtifactRequest(normalized) || (
    /\b(?:create|build|make|scaffold|generate|prepare|update|attach|add|link)\b/.test(normalized) &&
    /\bdomain[-\s]*chip\b/.test(normalized) &&
    !/\b(?:do not|don't|dont|no need to)\s+(?:create|build|make|scaffold|generate|prepare|update|attach|add|link)\b/.test(normalized)
  );
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
  if (isCapabilityEvaluationDiscussion(normalized)) return true;
  if (mentionsSparkSystem(normalized) && isQuestionLike(normalized)) return true;
  if (/\b(?:what|which|anything|something|else|other)\b.*\b(?:build|building|create|creating|make|making)\b.*\b(?:updates?|upgrades?|systems?|spark|capabilit(?:y|ies)|improvements?|missing)\b/.test(normalized)) {
    return true;
  }
  return false;
}

function isCapabilityEvaluationDiscussion(normalized: string): boolean {
  const mentionsCapabilitySurface =
    /\b(?:capabilit(?:y|ies)|tooling|tools?|route|routing|harness|telegram|startup\s+operator|operator|agent|spark|codex|provider|memory|schedule|chip|mission|build|publish|deploy|browser|computer[-\s]*use)\b/.test(normalized);
  if (!mentionsCapabilitySurface) return false;
  return (
    /\b(?:how|what|when|whether|would|should|can|could)\b.{0,80}\b(?:evaluate|test|score|compare|reason\s+about|think\s+through|decide|tell\s+whether|know\s+whether)\b/.test(normalized) ||
    /\b(?:evaluate|test|score|compare)\b.{0,80}\b(?:before|prior\s+to)\b.{0,80}\b(?:using|enabling|running|launching|shipping)\b/.test(normalized) ||
    /\b(?:would|should|could)\b.{0,80}\b(?:be|stay|remain)\b.{0,80}\b(?:advisory|conversation(?:al)?|chat[-\s]*only|read[-\s]*only|planning)\b/.test(normalized) ||
    /\b(?:conversation|chat|discussion|advisory|planning)\b.{0,80}\b(?:versus|vs\.?|instead\s+of)\b.{0,80}\b(?:action|execution|tool\s+call|mission|build|route)\b/.test(normalized) ||
    /\b(?:before|prior\s+to)\b.{0,80}\b(?:using|enabling|running|launching|shipping)\b.{0,80}\b(?:what|which|how)\b.{0,80}\b(?:evidence|proof|test|benchmark|gate|boundary)\b/.test(normalized)
  );
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
  if (route === 'creator.mission' && isExplicitCreatorMissionArtifactRequest(normalized)) {
    return { allow: true, reason: 'explicit_creator_artifact', confidence: 'explicit' };
  }

  if (route === 'spark.self_improvement' && isNoExecutionBoundary(normalized) && isLocalSelfImprovementCanary(normalized)) {
    return { allow: true, reason: 'self_improvement_canary_local_only', confidence: 'explicit' };
  }

  if (route === 'spawner.build' && isConcreteProjectBuild(normalized) && hasPublicationOnlyBoundary(normalized)) {
    return { allow: true, reason: 'concrete_project_build_local_only', confidence: 'explicit' };
  }
  if (route === 'spawner.build' && isExplicitSpawnerNoEditMission(normalized)) {
    return { allow: true, reason: 'explicit_spawner_no_edit_mission', confidence: 'explicit' };
  }
  if (route === 'spawner.project_iteration' && isExplicitProjectIteration(normalized)) {
    return { allow: true, reason: 'explicit_project_iteration', confidence: 'explicit' };
  }
  if (route === 'spawner.default_build' && isExplicitDefaultBuildChoice(normalized)) {
    return { allow: true, reason: 'explicit_default_build_choice', confidence: 'explicit' };
  }
  if (route === 'spawner.mission_control' && isExplicitMissionControlAction(normalized)) {
    return { allow: true, reason: 'contextual_mission_control_action', confidence: 'contextual' };
  }
  if (route === 'schedule.delete' && isExplicitScheduleDelete(normalized)) {
    return { allow: true, reason: 'explicit_schedule_delete', confidence: 'explicit' };
  }
  if (route === 'domain_chip.create' && isExplicitDomainChipCreate(normalized)) {
    return { allow: true, reason: 'explicit_domain_chip_create', confidence: 'explicit' };
  }
  if (route === 'domain_chip.pending' && isPendingDomainChipDirection(normalized)) {
    return { allow: true, reason: 'pending_domain_chip_direction', confidence: 'contextual' };
  }
  if (route === 'sparkqa.pause' && isExplicitSparkQaPause(normalized)) {
    return { allow: true, reason: 'explicit_sparkqa_pause', confidence: 'explicit' };
  }
  if (route === 'recursive.start' && /\b(?:run|start|launch|kick\s+off|do)\b.*\b(?:recursive|recursion|loop|round|autoloop)\b/.test(normalized)) {
    return { allow: true, reason: 'explicit_recursive_start', confidence: 'explicit' };
  }
  if (route === 'recursive.proposal' && isExplicitRecursiveProposal(normalized)) {
    return { allow: true, reason: 'explicit_recursive_proposal', confidence: 'explicit' };
  }

  if (route === 'access.change' && isExplicitAccessChange(normalized)) {
    if (isAccessChangeStopBoundary(normalized)) {
      return { allow: false, reason: 'no_execution_boundary', confidence: 'blocked' };
    }
    return { allow: true, reason: 'explicit_access_change', confidence: 'explicit' };
  }
  if (route === 'model.switch' && isExplicitModelSwitch(normalized)) {
    if (isModelSwitchStopBoundary(normalized)) {
      return { allow: false, reason: 'no_execution_boundary', confidence: 'blocked' };
    }
    return { allow: true, reason: 'explicit_model_switch', confidence: 'explicit' };
  }
  if (isNoExecutionBoundary(normalized) && INTERRUPTIVE_ROUTES.has(route)) {
    return { allow: false, reason: 'no_execution_boundary', confidence: 'blocked' };
  }
  if (route === 'spawner.build' && isConcreteProjectBuild(normalized)) return { allow: true, reason: 'concrete_project_build', confidence: 'explicit' };
  if (route === 'spawner.build' && isExplicitSpawnerNoEditMission(normalized)) return { allow: true, reason: 'explicit_spawner_no_edit_mission', confidence: 'explicit' };
  if (route === 'spawner.build' && isMissionPreferenceLike(normalized)) return { allow: false, reason: 'mission_preference_not_build', confidence: 'blocked' };
  if (isBoundedOperatorProbe(normalized) && MISSION_OR_BUILD_ROUTES.has(route)) return { allow: false, reason: 'operator_probe_competing_route', confidence: 'blocked' };
  if (route === 'spawner.build' && !isConcreteProjectBuild(normalized)) return { allow: false, reason: 'plain_chat_protected', confidence: 'blocked' };
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
  if (route === 'spark.self_improvement' && isExplicitSparkSelfImprovementRequest(normalized)) {
    return { allow: true, reason: 'explicit_spark_self_improvement', confidence: 'explicit' };
  }
  if (route === 'spawner.external_research' && isExplicitExternalResearch(normalized)) {
    return { allow: true, reason: 'explicit_external_research', confidence: 'explicit' };
  }
  if (route === 'operator.safe_action' && isBoundedOperatorProbe(normalized)) {
    return { allow: true, reason: 'bounded_operator_probe', confidence: 'explicit' };
  }
  if (route === 'sparkqa.run' && isExplicitSparkQaRun(normalized)) {
    return { allow: true, reason: 'explicit_sparkqa_run', confidence: 'explicit' };
  }
  if (route === 'sparkqa.benchmark' && isExplicitSparkQaRun(normalized)) {
    return { allow: true, reason: 'explicit_sparkqa_benchmark', confidence: 'explicit' };
  }
  if (route === 'sparkqa.pause' && isExplicitSparkQaPause(normalized)) {
    return { allow: true, reason: 'explicit_sparkqa_pause', confidence: 'explicit' };
  }
  if (route === 'mission_updates.preference' && isExplicitMissionPreferenceChange(normalized)) {
    return { allow: true, reason: 'explicit_mission_update_preference', confidence: 'explicit' };
  }
  if (route === 'domain_chip.pending' && normalized === 'yes') {
    return { allow: false, reason: 'ambiguous_pending_domain_chip_confirmation', confidence: 'blocked' };
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
    'explicit_spark_self_improvement',
    'explicit_external_research',
    'bounded_operator_probe',
    'explicit_sparkqa_run',
    'explicit_sparkqa_pause'
  ].includes(verdict.reason)) {
    return false;
  }
  return verdict.reason === 'plain_chat_protected' || verdict.reason === 'route_evidence_sufficient';
}
