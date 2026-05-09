import { parseBuildIntent } from './buildIntent';
import type { ShippedProjectContext } from './shippedProjectContext';

const COLLABORATIVE_IDEA_PATTERNS = [
  /\bhelp\s+me\s+(?:shape|think|figure|explore|brainstorm|develop)\b/i,
  /\bhelp\s+me\s+(?:design|plan|scope)\b/i,
  /\b(?:shape|explore|brainstorm|develop)\s+(?:an?\s+)?idea\b/i,
  /\bi\s+(?:do\s+not|don't|dont)\s+know\s+(?:exactly\s+)?(?:what|yet)\b/i,
  /\b(?:do\s+not|don't|dont)\s+build\s+yet\b/i,
  /\bbefore\s+(?:building|we\s+build|creating|we\s+create|making|we\s+make)\b/i,
  /\b(?:pin|define|tighten)\s+(?:the\s+)?scope\b/i,
  /\bmaybe\s+we\s+should\s+(?:build|make|create)\b/i,
  /\b(?:should|could)\s+we\s+(?:build|make|create)\b.*\b(?:first\s+version|mvp|v1)\b/i,
  /\bwhat\s+would\s+you\s+(?:build|make|create|suggest)\b/i,
  /\bwhat\s+would\s+(?:the\s+)?(?:first\s+version|mvp|v1)\s+be\b/i,
  /\bwhat\s+would\s+be\s+(?:the\s+)?(?:best\s+)?(?:first\s+version|mvp|v1)\b/i,
  /\b(?:first\s+version|mvp|v1)\b.*\b(?:be|look|feel|include|work)\b/i,
  /\b(?:make|feel)\s+it\s+(?:more\s+)?(?:playful|game-like|fun|alive)\b/i,
  /\b(?:i\s+like|i\s+love)\s+.+\b(?:idea|dashboard|tool|game|chip)\b/i,
  /\b(?:not\s+just|more\s+than)\s+tasks\b/i,
  /\b(?:converse|talk|think)\s+(?:with\s+me\s+)?(?:about|through)\b/i,
  /\btogether\b.*\b(?:idea|shape|plan|concept|build)\b/i,
  /\b(?:idea|concept)\s+together\b/i
];

const HARD_EXECUTION_PATTERNS = [
  /^\s*\/(?:run|build|mission)\b/i,
  /\b(?:build|create|make|ship|scaffold|generate)\s+(?:this\s+)?(?:at|in|into)\s+[A-Z]:[\\/]/i,
  /\buse\s+(?:advanced\s+prd|direct\s+build)\s+mode\b/i,
  /\bfiles:\s*[\w.-]+\./i
];

const LOCAL_OPTION_REFERENCE_PATTERNS = [
  /\b(?:no\.?|number|option|#)\s*(?:[1-9]\d*|one|two|three|four|five|six|seven|eight|nine|ten)\b/i,
  /^(?:the\s+)?(?:first|second|third|fourth|fifth|sixth|seventh|eighth|ninth|tenth)(?:\s+(?:one|option|idea|direction|item|path))?[.!?]*$/i,
  /^(?:the\s+)?(?:last|final|latter)[.!?]*$/i,
  /\b(?:go\s+with|pick|choose|take|use|do|prefer|like|want|would\s+take)\s+(?:the\s+)?(?:first|second|third|fourth|fifth|sixth|seventh|eighth|ninth|tenth|[1-9]\d*(?:st|nd|rd|th)?|last|final|latter)\s*(?:one|option|idea|direction|item|path)?\b/i,
  /^(?:let'?s\s+|please\s+|actually\s+|no[, ]*|instead\s+)*(?:do|pick|choose|select|use|go\s+with)\s+(?:the\s+)?(?:option\s+|idea\s+|direction\s+|item\s+)?(?:[1-9]|10|one|two|three|four|five|six|seven|eight|nine|ten)\b/i,
  /\b(?:the\s+)?(?:last|final|latter)\s+(?:one|option|idea|direction|item|path)\b/i,
  /\bthat\s+option\b/i
];

export function hasLocalOptionReference(text: string): boolean {
  return LOCAL_OPTION_REFERENCE_PATTERNS.some((pattern) => pattern.test(text.trim()));
}

export function shouldPreferConversationalIdeation(text: string): boolean {
  const trimmed = text.trim();
  if (!trimmed) return false;
  if (HARD_EXECUTION_PATTERNS.some((pattern) => pattern.test(trimmed))) {
    return false;
  }
  const mentionsDomainChipArtifact = /\bdomain[-\s]*chip[-\w]*\b/i.test(trimmed);
  return hasLocalOptionReference(trimmed) || mentionsDomainChipArtifact || COLLABORATIVE_IDEA_PATTERNS.some((pattern) => pattern.test(trimmed));
}

export function isSparkWikiStatusQuestion(text: string): boolean {
  const normalized = text.replace(/\s+/g, ' ').trim();
  if (!normalized) {
    return false;
  }
  if (parseBuildIntent(normalized)) {
    return false;
  }
  const mentionsWiki =
    /\b(?:llm\s+)?wiki\b/i.test(normalized) ||
    /\b(?:knowledge\s*base|kb)\b/i.test(normalized) ||
    /\bobsidian\s+vault\b/i.test(normalized);
  if (!mentionsWiki) {
    return false;
  }
  const sparkScoped =
    /\b(?:spark|agent|system|self[-\s]*awareness|introspection|your|you|its)\b/i.test(normalized) ||
    /\b(?:obsidian|vault)\b/i.test(normalized);
  if (!sparkScoped) {
    return false;
  }
  return (
    /\b(?:active|available|connected|enabled|healthy|ready|working|installed|retriev(?:e|al|able)|status|health|missing|lacking|fresh|stale|vault|obsidian|pages?)\b/i.test(normalized) ||
    /\b(?:show|check|inspect|verify|test|open)\b/i.test(normalized)
  );
}

export function isSparkWikiInventoryQuestion(text: string): boolean {
  const normalized = text.replace(/\s+/g, ' ').trim();
  if (!normalized || parseBuildIntent(normalized)) {
    return false;
  }
  const mentionsWiki =
    /\b(?:llm\s+)?wiki\b/i.test(normalized) ||
    /\b(?:knowledge\s*base|kb)\b/i.test(normalized) ||
    /\bobsidian\s+vault\b/i.test(normalized);
  if (!mentionsWiki) {
    return false;
  }
  const sparkScoped =
    /\b(?:spark|agent|system|self[-\s]*awareness|introspection|your|you|its)\b/i.test(normalized) ||
    /\b(?:obsidian|vault)\b/i.test(normalized);
  if (!sparkScoped) {
    return false;
  }
  return (
    /\b(?:pages?|files?|notes?|inventory|index|contents?|inside|list|map)\b/i.test(normalized) ||
    /\b(?:what|which)\s+(?:pages?|files?|notes?|contents?)\b/i.test(normalized)
  );
}

export function extractSparkWikiQuery(text: string): string | null {
  const normalized = text.replace(/\s+/g, ' ').trim();
  if (!normalized || parseBuildIntent(normalized)) {
    return null;
  }
  if (isSparkWikiStatusQuestion(normalized) || isSparkWikiInventoryQuestion(normalized)) {
    return null;
  }
  const mentionsWiki =
    /\b(?:llm\s+)?wiki\b/i.test(normalized) ||
    /\b(?:knowledge\s*base|kb)\b/i.test(normalized) ||
    /\bobsidian\s+vault\b/i.test(normalized);
  if (!mentionsWiki) {
    return null;
  }
  const patterns = [
    /\b(?:search|query|look\s+up|retrieve\s+from|check)\s+(?:(?:your|the|spark)\s+)*(?:llm\s+)?(?:wiki|knowledge\s*base|kb|obsidian\s+vault)\s+(?:for|about|on)\s+(.+)$/i,
    /\bwhat\s+does\s+(?:(?:your|the|spark)\s+)*(?:llm\s+)?(?:wiki|knowledge\s*base|kb|obsidian\s+vault)\s+(?:say|know|have)\s+(?:about|on)\s+(.+)$/i,
    /\b(?:from|using)\s+(?:(?:your|the|spark)\s+)*(?:llm\s+)?(?:wiki|knowledge\s*base|kb|obsidian\s+vault),?\s+(?:what|how|where|why|when|which)\s+(.+)$/i,
  ];
  for (const pattern of patterns) {
    const match = normalized.match(pattern);
    const query = match?.[1]?.replace(/[?.!]+$/, '').trim();
    if (query && query.length >= 3) {
      return query;
    }
  }
  return null;
}

export function extractSparkWikiAnswerQuestion(text: string): string | null {
  const normalized = text.replace(/\s+/g, ' ').trim();
  if (!normalized || parseBuildIntent(normalized)) {
    return null;
  }
  if (isSparkWikiStatusQuestion(normalized) || isSparkWikiInventoryQuestion(normalized)) {
    return null;
  }
  const patterns = [
    /\b(?:answer|explain|summarize)\s+(?:from|using|with)\s+(?:(?:your|the|spark)\s+)*(?:llm\s+)?(?:wiki|knowledge\s*base|kb|obsidian\s+vault),?\s+(.+)$/i,
    /\b(?:using|from)\s+(?:(?:your|the|spark)\s+)*(?:llm\s+)?(?:wiki|knowledge\s*base|kb|obsidian\s+vault),?\s+(?:answer|explain|summarize)\s+(.+)$/i,
    /\b(?:can\s+you\s+)?(?:answer|explain|summarize)\s+(.+?)\s+(?:from|using|with)\s+(?:(?:your|the|spark)\s+)*(?:llm\s+)?(?:wiki|knowledge\s*base|kb|obsidian\s+vault)$/i,
  ];
  for (const pattern of patterns) {
    const match = normalized.match(pattern);
    const question = match?.[1]?.replace(/[?.!]+$/, '').trim();
    if (question && question.length >= 3) {
      return question;
    }
  }
  return null;
}

export function extractSparkSelfImprovementGoal(text: string): string | null {
  const normalized = text.replace(/\s+/g, ' ').trim();
  if (!normalized || parseBuildIntent(normalized)) {
    return null;
  }
  if (isVoiceOnboardingSetupQuestion(normalized)) {
    return null;
  }
  if (shouldPreferConversationalIdeation(normalized)) {
    return null;
  }
  if (
    /\bwhere\s+(?:do|does|are|is)\b/i.test(normalized) &&
    /\b(?:lack|lacks|weak|weakness|weaknesses|missing|limitations?)\b/i.test(normalized) &&
    /\bhow\s+(?:would|should|can)\s+(?:we|you)\s+improve\b/i.test(normalized)
  ) {
    return null;
  }
  if (/^(?:can|could|would|should)\s+you\s+improve\b/i.test(normalized)) {
    return null;
  }
  const asksSparkToChooseImprovement =
    /\b(?:what|which)\b.{0,40}\b(?:you|spark|agent)\b.{0,40}\b(?:improve|upgrade|repair|fix|work\s+on)\b/i.test(normalized) ||
    /\b(?:what|which)\b.{0,40}\b(?:should|would|could)\b.{0,20}\b(?:you|spark|agent)\b.{0,40}\b(?:improve|upgrade|repair|fix|work\s+on)\b/i.test(normalized) ||
    /\b(?:choose|pick|decide)\b.{0,40}\b(?:improvement|upgrade|capability|weak\s*spot)\b/i.test(normalized);
  if (asksSparkToChooseImprovement) {
    return 'Choose the highest-leverage Spark self-improvement for this user, using recent weak-spot evidence, safe probes, rollback, and eval coverage before changing behavior.';
  }

  const mentionsSparkSelf =
    /\b(?:spark|you|your|yourself|agent|agents?|self[-\s]*awareness|introspection|capabilit(?:y|ies)|functionality|abilit(?:y|ies)|skills?|integrations?|access|permissions?|tools?|routes?|systems?|brain|memory|memories|reports?|daily\s+reports?|workflow|workflows?)\b/i.test(normalized);
  const mentionsImprove =
    /\b(?:improve|upgrade|tighten|fix|repair|strengthen|make better|close|reduce)\b/i.test(normalized);
  const mentionsGap =
    /\b(?:weak\s*spots?|gaps?|lacks?|limitations?|missing|where\s+(?:you|it)\s+lack|not\s+good|confidence|evidence|probes?)\b/i.test(normalized);
  if (mentionsSparkSelf && mentionsImprove && mentionsGap) {
    const cleanupPatterns = [
      /^(?:can\s+you\s+|please\s+|spark[, ]*)?/i,
      /\b(?:from|using|with)\s+(?:your\s+)?(?:llm\s+)?(?:wiki|knowledge\s*base|kb|obsidian\s+vault)\b/ig,
    ];
    let goal = normalized;
    for (const pattern of cleanupPatterns) {
      goal = goal.replace(pattern, '').trim();
    }
    goal = goal.replace(/[?.!]+$/, '').trim();
    return goal.length >= 6 ? goal : 'Improve Spark weak spots with probe-first evidence';
  }

  const asksCapabilityChange =
    /\b(?:add|install|enable|connect|wire|integrate|give|build|create|scaffold|develop|ship|set\s+up|schedule|automate|make|change|upgrade|improve)\b/i.test(normalized) &&
    /\b(?:capabilit(?:y|ies)|functionality|abilit(?:y|ies)|skills?|integrations?|access|permissions?|tools?|routes?|systems?|brain|memory|memories|reports?|daily\s+reports?|email|emails|gmail|calendar|inbox|voice|speech|notifications?|reminders?|workflow|workflows?|browser|browse|files?|filesystem|agents?)\b/i.test(normalized);
  if (mentionsSparkSelf && asksCapabilityChange) {
    return `Improve Spark capability safely: ${normalized.replace(/[?.!]+$/, '').trim()}. Treat this as a capability proposal: identify the owner system, required permissions, safe probe, human approval boundary, rollback path, and smallest implementation/eval before claiming it is live.`;
  }

  return null;
}

function isVoiceOnboardingSetupQuestion(text: string): boolean {
  const normalized = text.replace(/\s+/g, ' ').trim().toLowerCase();
  const simplified = normalized.replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim();
  return (
    /\bvoice\b/.test(simplified) &&
    (
      /\b(?:set up|setup|configure|onboard|onboarding)\b/.test(normalized) ||
      /\b(?:set up|setup|configure|onboard|onboarding)\b/.test(simplified)
    )
  );
}

export function isSparkSelfMemoryDiagnosticQuestion(text: string): boolean {
  const normalized = text.replace(/\s+/g, ' ').trim();
  if (!normalized) return false;
  const mentionsSelfOrMemory =
    /\bself[-\s]*awareness\b/i.test(normalized) ||
    /\b(?:your|you|spark|agent)\b/i.test(normalized) &&
      /\b(?:memory|recall|introspection|capabilit(?:y|ies)|systems?|routes?|tools?|weak\s*spots?|gaps?|lacks?|limitations?)\b/i.test(normalized);
  if (!mentionsSelfOrMemory) return false;
  return (
    /\bwhere\b.*\b(?:lack|lacks|weak|missing|limitations?)\b/i.test(normalized) ||
    /\bwhat\b.*\b(?:lack|lacks|weak|missing|limitations?)\b/i.test(normalized) ||
    /\bhow\b.*\b(?:improve|strengthen|fix|repair|make better)\b/i.test(normalized) ||
    /\b(?:can|could|should|would)\s+you\s+(?:improve|strengthen|fix|repair)\b/i.test(normalized)
  );
}

export function isSparkChipStatusOverclaimQuestion(text: string): boolean {
  const normalized = text.replace(/\s+/g, ' ').trim();
  if (!normalized || parseBuildIntent(normalized)) {
    return false;
  }
  if (/^\s*how\s+does\b/i.test(normalized)) {
    return false;
  }
  return (
    /\b(?:all|every)\s+(?:of\s+)?(?:your\s+|spark\s+)?chips?\b.*\b(?:work|working|healthy|ready|attached|available|ok|okay|fine|good|right)\b/i.test(normalized) ||
    /\b(?:do|are)\s+(?:all|every)\s+(?:of\s+)?(?:your\s+|spark\s+)?chips?\s+(?:work|working|healthy|ready|attached|available|ok|okay|fine|good)\b/i.test(normalized)
  );
}

export interface SparkWikiPromotionIntent {
  title: string;
  summary: string;
  status: 'candidate' | 'verified';
}

export function extractSparkWikiPromotionIntent(text: string): SparkWikiPromotionIntent | null {
  const normalized = text.replace(/\s+/g, ' ').trim();
  if (!normalized || parseBuildIntent(normalized)) {
    return null;
  }
  const mentionsWiki =
    /\b(?:llm\s+)?wiki\b/i.test(normalized) ||
    /\b(?:knowledge\s*base|kb)\b/i.test(normalized) ||
    /\bobsidian\s+vault\b/i.test(normalized);
  const asksToWrite =
    /\b(?:promote|write|save|add|capture|store|record)\b/i.test(normalized) &&
    /\b(?:improvement|learning|lesson|note|wiki\s+note|self[-\s]*awareness|introspection|capability|route|trace|probe|evidence)\b/i.test(normalized);
  if (!mentionsWiki || !asksToWrite) {
    return null;
  }
  if (isSparkWikiStatusQuestion(normalized) || isSparkWikiInventoryQuestion(normalized)) {
    return null;
  }

  const explicitSummaryPatterns = [
    /\b(?:wiki|knowledge\s*base|kb|obsidian\s+vault)\s+(?:improvement\s+)?(?:note|learning|lesson)?\s*[:,-]\s*(.+)$/i,
    /\b(?:promote|write|save|add|capture|store|record)\s+(?:this\s+)?(?:as\s+)?(?:a\s+)?(?:candidate\s+|verified\s+)?(?:wiki\s+)?(?:improvement|learning|lesson|note)\s*[:,-]?\s*(.+)$/i,
    /\b(?:promote|write|save|add|capture|store|record)\s+(.+?)\s+(?:to|into|in)\s+(?:your\s+|the\s+|spark\s+)*(?:llm\s+)?(?:wiki|knowledge\s*base|kb|obsidian\s+vault)$/i,
  ];
  let summary = '';
  for (const pattern of explicitSummaryPatterns) {
    const match = normalized.match(pattern);
    const value = match?.[1]?.trim();
    if (value && value.length >= 8) {
      summary = value;
      break;
    }
  }
  if (!summary) {
    summary = normalized
      .replace(/^(?:please\s+|can\s+you\s+|spark[, ]*)?/i, '')
      .replace(/\b(?:promote|write|save|add|capture|store|record)\b/i, '')
      .replace(/\b(?:to|into|in)\s+(?:your\s+|the\s+|spark\s+)*(?:llm\s+)?(?:wiki|knowledge\s*base|kb|obsidian\s+vault)\b/ig, '')
      .replace(/\b(?:as\s+)?(?:a\s+)?(?:candidate\s+|verified\s+)?(?:wiki\s+)?(?:improvement|learning|lesson|note)\b/ig, '')
      .trim();
  }
  summary = summary.replace(/[.!?]+$/, '').trim();
  if (summary.length < 8) {
    return null;
  }
  const verified = /\bverified\b/i.test(normalized) && /\b(?:evidence|tested|passed|confirmed|trace|pytest|smoke)\b/i.test(normalized);
  const title = summary.length > 80 ? `${summary.slice(0, 77).trim()}...` : summary;
  return {
    title,
    summary,
    status: verified ? 'verified' : 'candidate',
  };
}

export function parseNaturalChipCreateIntent(text: string): string | null {
  const normalized = text.replace(/\s+/g, ' ').trim();
  if (!normalized) return null;

  if (
    /\b(?:use|load|activate|pin|unpin|disable|delete|remove|cancel|kill)\s+(?:the\s+)?[\w-]+\s*chip\b/i.test(normalized) ||
    /\b(?:which|what)\s+chips?\b/i.test(normalized) ||
    /\bhow\s+does\s+(?:the\s+)?[\w-]+\s*chip\s+work\b/i.test(normalized)
  ) {
    return null;
  }

  const createPattern =
    /\b(?:let'?s\s+)?(?:make|build|create|scaffold|generate|spin\s+up|cook\s+up|craft|author|whip\s+up)\b[^.\n]{0,60}\b(?:domain[-\s]*chip|chip)\b/i;
  const wantPattern =
    /\bi\s+(?:need|want|could\s+use|would\s+like)\b[^.\n]{0,30}\b(?:a|an|another|new)?\s*(?:domain[-\s]*chip|chip)\b/i;
  const imperativePattern = /^\s*(?:a\s+)?new\s+(?:domain[-\s]*)?chip\s+(?:for|that|which|to)\b/i;
  const namedPattern = /^\s*(?:a\s+)?(?:new\s+)?domain[-\s]*chip\s+(?:called|named)\s+\S/i;

  if (
    /\b(?:help\s+me\s+)?(?:shape|scope|brainstorm|think\s+through|plan|design)\b/i.test(normalized) &&
    (
      /\b(?:before|prior\s+to)\s+(?:creating|building|making|scaffolding|generating|starting)\b/i.test(normalized) ||
      /\b(?:do\s+not|don't|dont)\s+(?:build|create|make|scaffold|generate|start)\s+yet\b/i.test(normalized)
    ) &&
    /\b(?:domain[-\s]*chip|chip)\b/i.test(normalized)
  ) {
    return null;
  }

  if (!createPattern.test(normalized) && !wantPattern.test(normalized) && !imperativePattern.test(normalized) && !namedPattern.test(normalized)) {
    return null;
  }

  let brief = normalized;
  for (let i = 0; i < 6; i += 1) {
    const before = brief;
    brief = brief.replace(
      /^\s*(?:let'?s\s+|please\s+|hey\s+|ok\s+|okay\s+|can\s+you\s+|could\s+you\s+|would\s+you\s+)+/i,
      ''
    );
    brief = brief.replace(
      /^\s*(?:make|build|create|scaffold|generate|spin\s+up|cook\s+up|craft|author|whip\s+up)\s+(?:me\s+|us\s+)?/i,
      ''
    );
    brief = brief.replace(/^\s*i\s+(?:need|want|could\s+use|would\s+like)\s+/i, '');
    brief = brief.replace(/^\s*(?:a|an|another|new)\s+/i, '');
    brief = brief.replace(/^\s*(?:domain[-\s]*)?chip\s+(?:called\s+|named\s+)?/i, '');
    brief = brief.replace(/^\s*domain-chip-[\w-]+\s*[:,-]?\s*/i, '');
    brief = brief.replace(/^\s*(?:for|that|which|to|about)\s+/i, '');
    if (brief === before) break;
  }

  brief = brief.trim().replace(/[.!?,]+$/g, '').trim();
  return brief.length >= 3 ? brief : null;
}

export interface NaturalCreatorMissionIntent {
  brief: string;
  privacyMode: 'local_only' | 'github_pr' | 'swarm_shared';
  riskLevel: 'low' | 'medium' | 'high';
  reason: string;
}

export interface NaturalCreatorMissionContext {
  recentMessages?: string[];
}

export interface NaturalRecursiveCommandIntent {
  rawCommand: string;
  reason: string;
}

export interface NaturalRecursiveCommandTarget {
  pathId: string;
  chipKey?: string | null;
  label: string;
  aliases?: string[];
}

export interface NaturalRecursiveCommandContext {
  recentMessages?: string[];
  targets?: NaturalRecursiveCommandTarget[];
}

function normalizeCreatorMissionPrivacy(text: string): NaturalCreatorMissionIntent['privacyMode'] {
  if (/\b(?:github|pull\s+request|pr)\b/i.test(text)) return 'github_pr';
  if (/\b(?:swarm|network|shared|publish|public)\b/i.test(text)) return 'swarm_shared';
  return 'local_only';
}

function normalizeCreatorMissionRisk(text: string): NaturalCreatorMissionIntent['riskLevel'] {
  if (/\b(?:public|network|publish|production|secret|token|auth|payment|financial|trading|delete|destructive)\b/i.test(text)) {
    return 'high';
  }
  if (/\b(?:recursive|autoloop|specialization|benchmark|swarm|creator|qa|test|validator|review)\b/i.test(text)) {
    return 'medium';
  }
  return 'low';
}

function isQaOperatorCreatorMission(text: string): boolean {
  return (
    /\b(?:spark\s+qa\s+operator|qa\s+operator|qa\s+tester|quality\s+tester|tester\s+for\s+spark|spark\s+tester)\b/i.test(text) &&
    /\b(?:benchmark|benchmarks|eval|evals|test\s+suite|qa|recursive|recursion|autoloop|specialization|path|creator|improve|better|standard|standardize|create|build|make|prepare|wire|connect)\b/i.test(text)
  );
}

function isCreatorSystemMission(text: string): boolean {
  if (/^\s*\//.test(text)) return false;
  if (/\b(?:what|why|how)\s+(?:is|are|does|do)\b/i.test(text) && !/\b(?:create|build|make|prepare|wire|connect|improve|run)\b/i.test(text)) {
    return false;
  }
  return (
    /\b(?:creator\s+mission|creator\s+system|domain[-\s]*chip|benchmark\s+pack|benchmarks?|evals?|specialization\s+path|autoloop(?:\s+policy)?|swarm\s+review\s+packet)\b/i.test(text) &&
    /\b(?:create|build|make|prepare|plan|scaffold|generate|wire|connect|standardize|improve|upgrade|expand)\b/i.test(text)
  );
}

function isAmbiguousCreatorFollowup(text: string): boolean {
  return /\b(?:it|this|that|these|those|current|same|what\s+we(?:'re| are)?\s+(?:working\s+on|discussing|building)|what\s+we\s+talked\s+about)\b/i.test(text);
}

function creatorContextText(context: NaturalCreatorMissionContext = {}): string {
  return (context.recentMessages || [])
    .filter(Boolean)
    .slice(-15)
    .join('\n')
    .replace(/\s+/g, ' ')
    .trim();
}

function isContextualCreatorSystemMission(text: string, contextText: string): boolean {
  if (!contextText || !isAmbiguousCreatorFollowup(text)) return false;
  return (
    /\b(?:create|build|make|prepare|plan|scaffold|generate|wire|connect|standardize|improve|upgrade|expand|turn)\b/i.test(text) &&
    /\b(?:creator\s+mission|creator\s+system|domain[-\s]*chip|benchmark\s+pack|benchmarks?|evals?|specialization\s+path|autoloop(?:\s+policy)?|swarm\s+review\s+packet)\b/i.test(text)
  );
}

function qaOperatorCreatorBrief(text: string): string {
  const focusParts = [];
  if (/\btelegram\b/i.test(text)) focusParts.push('Telegram natural-language QA flows');
  if (/\b(?:workspace|swarm)\b/i.test(text)) focusParts.push('Spark Swarm Workspace sync and reporting');
  if (/\b(?:spawner|canvas|kanban)\b/i.test(text)) focusParts.push('Spawner UI, Canvas, and Kanban creator missions');
  if (/\b(?:auth|pairing|login)\b/i.test(text)) focusParts.push('auth pairing and failure-message quality');
  if (/\b(?:recursive|recursion|autoloop)\b/i.test(text)) focusParts.push('recursive autoloop reports and keep/revert decisions');
  if (/\b(?:benchmark|eval|test\s+suite)\b/i.test(text)) focusParts.push('richer benchmark packs with visible and held-out cases');
  const focus = focusParts.length > 0
    ? focusParts.join(', ')
    : 'Telegram flows, Workspace reports, creator missions, recursive reports, Spawner UI, Canvas, Kanban, auth pairing, and specialization autoloops';

  return [
    'Improve Spark QA Operator as a private benchmarked specialization path with a gated autoloop.',
    'Canonical target domain: spark-qa-operator.',
    'Do not create Spark Telegram, Spark Swarm Workspace, Spawner UI, Canvas, or Kanban as separate root domains; treat them as benchmark lanes and product QA surfaces under Spark QA Operator.',
    'Reuse and extend the existing Spark QA Operator system first: domain-chip-spark-qa-operator, spark-qa-operator-bench, and specialization-path-spark-qa-operator.',
    'Make Spark better at QA testing Spark-built products first, then only transfer lessons to user apps after evidence supports it.',
    `Focus areas: ${focus}.`,
    'Expand richer benchmark packs with visible cases, held-out cases, trap cases, scoring rubrics, and replayable evidence.',
    'Use Spark creator-system standards: domain chip contract, benchmark pack, specialization path, autoloop policy, adapter map, validation ledger, local/private boundary, and Swarm review packet only when gates allow it.',
    'Keep Telegram replies concise and put detailed evidence, traces, screenshots, and benchmark artifacts in Workspace.'
  ].join(' ');
}

function normalizeCreatorMissionBrief(text: string, contextText = ''): string {
  const normalized = text.replace(/\s+/g, ' ').trim().replace(/[.!?]+$/g, '');
  const combined = [normalized, contextText].filter(Boolean).join(' ');
  if (isQaOperatorCreatorMission(combined)) {
    return qaOperatorCreatorBrief(combined);
  }
  const briefParts = [
    normalized,
    contextText ? `Recent working context: ${contextText}` : '',
    'Use Spark creator-system standards: creator intent packet, artifact manifests, benchmark gates, evidence ladder, local/private boundary, rollback note, and review packet only when gates allow it.'
  ];
  return briefParts.filter(Boolean).join(' ');
}

export function parseNaturalCreatorMissionIntent(text: string, context: NaturalCreatorMissionContext = {}): NaturalCreatorMissionIntent | null {
  const normalized = text.replace(/\s+/g, ' ').trim();
  if (!normalized) return null;
  if (shouldPreferConversationalIdeation(normalized)) return null;
  const contextText = creatorContextText(context);
  const contextualMission = isContextualCreatorSystemMission(normalized, contextText);
  if (!isQaOperatorCreatorMission([normalized, contextText].filter(Boolean).join(' ')) && !isCreatorSystemMission(normalized) && !contextualMission) return null;
  if (isAmbiguousCreatorFollowup(normalized) && !contextText) return null;
  if (/\b(?:show|list|status|report|trace|review)\b/i.test(normalized) && !/\b(?:create|build|make|prepare|plan|scaffold|generate|wire|connect|improve|upgrade|expand)\b/i.test(normalized)) {
    return null;
  }

  const privacyMode = normalizeCreatorMissionPrivacy(normalized);
  const qaOperator = isQaOperatorCreatorMission([normalized, contextText].filter(Boolean).join(' '));
  return {
    brief: normalizeCreatorMissionBrief(normalized, contextualMission ? contextText : ''),
    privacyMode,
    riskLevel: privacyMode === 'swarm_shared' ? 'high' : normalizeCreatorMissionRisk(normalized),
    reason: qaOperator
      ? 'Spark QA Operator creator work needs benchmark packs, held-out checks, autoloop policy, and private Workspace evidence before any network sharing.'
      : 'Creator-system work needs artifact manifests, benchmark gates, rollback notes, and review boundaries.'
  };
}

function naturalRoundCount(text: string): number {
  const normalized = text.toLowerCase();
  const numeric = normalized.match(/\b(?:rounds?|passes|iterations?)\s+(\d{1,2})\b/) || normalized.match(/\b(\d{1,2})\s+(?:rounds?|passes|iterations?)\b/);
  if (numeric) return Math.max(1, Math.min(10, Number.parseInt(numeric[1], 10) || 1));
  if (/\b(?:one|single|a)\s+(?:round|pass|iteration)\b/i.test(text)) return 1;
  if (/\btwo\s+(?:rounds|passes|iterations)\b/i.test(text)) return 2;
  if (/\bthree\s+(?:rounds|passes|iterations)\b/i.test(text)) return 3;
  return 1;
}

const NATURAL_TARGET_STOP_WORDS = new Set([
  'a', 'an', 'and', 'are', 'at', 'for', 'from', 'in', 'is', 'it', 'me', 'my', 'of', 'on', 'or', 'path', 'report',
  'show', 'status', 'the', 'this', 'to', 'trace', 'what', 'with'
]);

function naturalTargetKey(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, ' ').replace(/\s+/g, ' ').trim();
}

function naturalTargetTokens(value: string): string[] {
  return naturalTargetKey(value)
    .split(' ')
    .filter((token) => token.length >= 3 && !NATURAL_TARGET_STOP_WORDS.has(token));
}

function recursiveChipKeyFromPathId(pathId: string): string | null {
  const pathKey = pathId.trim();
  if (/^path:/i.test(pathKey)) return pathKey.replace(/^path:/i, '');
  const builderChip = pathKey.match(/^path_builder_chip_(.+)$/i)?.[1];
  if (builderChip) return builderChip.replace(/_/g, '-');
  return null;
}

function normalizeNaturalRecursiveTarget(target: NaturalRecursiveCommandTarget): NaturalRecursiveCommandTarget {
  return {
    pathId: target.pathId,
    chipKey: target.chipKey || recursiveChipKeyFromPathId(target.pathId),
    label: target.label,
    aliases: target.aliases || []
  };
}

function dynamicNaturalRecursiveTarget(text: string, targets: NaturalRecursiveCommandTarget[] | undefined): NaturalRecursiveCommandTarget | null {
  if (!targets?.length) return null;
  const textKey = naturalTargetKey(text);
  const textTokens = new Set(naturalTargetTokens(text));
  const candidates: Array<{ target: NaturalRecursiveCommandTarget; score: number }> = [];

  for (const rawTarget of targets) {
    const target = normalizeNaturalRecursiveTarget(rawTarget);
    const aliases = [target.pathId, target.chipKey || '', target.label, ...(target.aliases || [])]
      .map(naturalTargetKey)
      .filter((alias) => alias.length >= 3);
    let score = 0;
    for (const alias of aliases) {
      if (alias.length >= 6 && textKey.includes(alias)) score = Math.max(score, 100 + alias.length);
      const aliasTokens = naturalTargetTokens(alias);
      if (aliasTokens.length === 0) continue;
      const overlap = aliasTokens.filter((token) => textTokens.has(token)).length;
      const needed = Math.min(3, Math.max(2, Math.ceil(aliasTokens.length * 0.6)));
      if (overlap >= needed) score = Math.max(score, overlap * 10 + aliasTokens.length);
    }
    if (score > 0) candidates.push({ target, score });
  }

  candidates.sort((a, b) => b.score - a.score);
  if (!candidates[0]) return null;
  if (candidates[1] && candidates[1].score === candidates[0].score) return null;
  return candidates[0].target;
}

function hasRecursiveContextSignal(text: string): boolean {
  return /\b(?:\/recursive|recursive|recursion|recursions|autoloop|loop|round|benchmark|score|trace|review|decisions?|workspace|path:[A-Za-z0-9:_-]+|path_builder_chip_|path_benchmark_|path_domain_)\b/i.test(text);
}

function knownNaturalRecursiveTarget(text: string): NaturalRecursiveCommandTarget | null {
  const normalized = text.replace(/\s+/g, ' ').trim();
  const explicitPath = normalized.match(/\bpath:[A-Za-z0-9:_-]+\b/);
  if (explicitPath) {
    const pathId = explicitPath[0];
    if (pathId === 'path:spark-qa-operator') return { pathId, chipKey: 'spark-qa-operator', label: 'Spark QA Operator' };
    if (pathId === 'path:startup-yc') return { pathId, chipKey: 'startup-yc', label: 'Startup YC' };
    return { pathId, chipKey: pathId.replace(/^path:/, ''), label: pathId };
  }
  if (/\b(?:spark\s+qa\s+operator|qa\s+operator|qa\s+tester|quality\s+tester|tester\s+for\s+spark|spark\s+tester)\b/i.test(normalized) ||
      (/\bqa\b/i.test(normalized) && /\b(?:recursive|recursion|loop|round|report|trace|review|decision|improve|improvement)\b/i.test(normalized))) {
    return { pathId: 'path:spark-qa-operator', chipKey: 'spark-qa-operator', label: 'Spark QA Operator' };
  }
  if (/\bstartup[-\s]+yc\b/i.test(normalized)) {
    return { pathId: 'path:startup-yc', chipKey: 'startup-yc', label: 'Startup YC' };
  }
  if (/\bdomain[-\s]+chip[-\s]+creator\b/i.test(normalized)) {
    return {
      pathId: 'path_builder_chip_domain_chip_creator',
      chipKey: 'domain-chip-creator',
      label: 'Domain Chip Creator'
    };
  }
  return null;
}

function naturalRecursiveTarget(text: string, context: NaturalRecursiveCommandContext = {}): NaturalRecursiveCommandTarget | null {
  const direct = knownNaturalRecursiveTarget(text);
  if (direct) return direct;
  const dynamicDirect = dynamicNaturalRecursiveTarget(text, context.targets);
  if (dynamicDirect) return dynamicDirect;

  const normalized = text.replace(/\s+/g, ' ').trim();
  const canUseContext = /\b(?:it|this|that|same|again|another|more|current|latest|loop|round|pass|iteration|report|readout|summary|status|trace|timeline|evidence|proof|trail|receipts|review|approve|approval|decisions?|blockers?|weakest|weak\s+spot|signal|changed|land|short\s+version|vibe|how'?s|how\s+is|where\s+are\s+we|where\s+did\s+we\s+land|keep\s+going|continue|keep\s+pushing|push\s+it|my\s+call|calls?\s+for\s+me|needs\s+me)\b/i.test(normalized);
  if (!canUseContext) return null;

  const recent = (context.recentMessages || [])
    .filter(Boolean)
    .slice(-8)
    .join('\n');
  if (!recent || !hasRecursiveContextSignal(recent)) return null;
  return knownNaturalRecursiveTarget(recent) || dynamicNaturalRecursiveTarget(recent, context.targets);
}

export function parseNaturalRecursiveCommandIntent(text: string, context: NaturalRecursiveCommandContext = {}): NaturalRecursiveCommandIntent | null {
  const normalized = text.replace(/\s+/g, ' ').trim();
  if (!normalized || normalized.startsWith('/')) return null;

  if (/\b(?:show|list|what|which|get|give\s+me)\b.*\b(?:recursive\s+)?(?:loops?|sessions?|runs?)\b/i.test(normalized) ||
      /\b(?:what|which)\s+(?:loops?|runs?)\s+(?:are|do)\s+(?:open|running|available|we\s+have)\b/i.test(normalized)) {
    return {
      rawCommand: 'sessions',
      reason: 'Natural-language request to list recursive loops.'
    };
  }

  if (/\b(?:show|list|what|which|get|give\s+me)\b.*\b(?:recursive\s+)?(?:paths?|lanes?)\b/i.test(normalized)) {
    return {
      rawCommand: 'paths',
      reason: 'Natural-language request to list recursive paths.'
    };
  }

  const target = naturalRecursiveTarget(normalized, context);
  if (!target) return null;

  if (/\b(?:start|run|kick\s+off|launch|do)\b.*\b(?:recursive|recursion|loop|round|iteration)\b/i.test(normalized) ||
      /\b(?:start|run|kick\s+off|launch|do)\b.*\b(?:qa\s+tester|qa\s+operator|startup[-\s]+yc|domain[-\s]+chip[-\s]+creator)\b/i.test(normalized) ||
      /\b(?:improve|make\s+better)\b.*\b(?:qa\s+tester|qa\s+operator)\b.*\b(?:round|loop|iteration)\b/i.test(normalized) ||
      /\b(?:run|start|do|try)\s+(?:another|one\s+more|a|one|same)\s+(?:round|pass|iteration|loop)\b/i.test(normalized) ||
      /\b(?:keep\s+going|continue|iterate\s+again|let\s+it\s+cook|keep\s+pushing|push\s+it\s+further|send\s+it\s+again|give\s+it\s+another\s+pass|one\s+more\s+pass)\b/i.test(normalized)) {
    if (!target.chipKey) return null;
    return {
      rawCommand: `start ${target.chipKey} rounds ${naturalRoundCount(normalized)}`,
      reason: `Natural-language request to start a recursive loop for ${target.label}.`
    };
  }

  if (/\b(?:trace|timeline|recent\s+movement|what\s+happened|show\s+the\s+evidence|show\s+evidence|show\s+the\s+receipts|receipts|audit\s+trail|proof|show\s+me\s+proof|show\s+the\s+trail|behind\s+the\s+scenes|what\s+went\s+on|what\s+did\s+it\s+do)\b/i.test(normalized)) {
    return {
      rawCommand: `trace ${target.pathId}`,
      reason: `Natural-language request to trace ${target.label}.`
    };
  }

  if (/\b(?:review|decisions?|blockers?|blocked|needs\s+review|waiting\s+for\s+review|approve|approval|do\s+i\s+need\s+to\s+approve|what\s+do\s+you\s+need\s+from\s+me|calls?\s+for\s+me|needs\s+my\s+call|need\s+my\s+call|what\s+needs\s+me|anything\s+stuck|what\s+is\s+stuck)\b/i.test(normalized)) {
    return {
      rawCommand: `review ${target.pathId}`,
      reason: `Natural-language request to review ${target.label} decisions.`
    };
  }

  if (/\b(?:report|status|score|scores|result|results|doing|health|how'?s|how\s+is|how\s+did\s+(?:that|it)\s+go|readout|summary|short\s+version|where\s+are\s+we|where\s+did\s+we\s+land|what\s+changed|what'?s\s+the\s+signal|what'?s\s+the\s+vibe|state\s+of\s+it|what\s+should\s+.*improve\s+next|weakest|weak\s+spot|what\s+is\s+next|what'?s\s+next)\b/i.test(normalized)) {
    return {
      rawCommand: `report ${target.pathId}`,
      reason: `Natural-language request for ${target.label} recursive report.`
    };
  }

  return null;
}

export function isMissionExecutionConfirmation(text: string): boolean {
  const trimmed = text.trim();
  if (!trimmed) return false;
  return [
    /^(?:yes|yeah|yep|yup|ok|okay|sure|sounds\s+good|perfect)[\s,!.]+(?:let'?s\s+)?(?:do\s+it|build\s+it|create\s+it|make\s+it|spin\s+it\s+up|kick\s+it\s+off|run\s+it|start\s+it)\b/i,
    /^(?:let'?s\s+)?(?:do\s+it|build\s+it|create\s+it|make\s+it|spin\s+it\s+up|kick\s+it\s+off|run\s+it|start\s+it)\b/i,
    /\b(?:create|build|make|run|start|spin\s+up|kick\s+off)\s+(?:it|this|that|the\s+mission)\b/i
  ].some((pattern) => pattern.test(trimmed));
}

function isLowSignalPlanningTurn(text: string): boolean {
  const normalized = text.trim().toLowerCase();
  return (
    normalized.length < 5 ||
    /^(?:yes|yeah|yep|yup|ok|okay|sure|sounds good|perfect|nice|cool|go|go ahead|build new|new)$/i.test(normalized)
  );
}

export interface InferredMissionFromContext {
  goal: string;
  missionName: string;
}

export function inferMissionFromRecentContext(currentText: string, recentMessages: string[]): InferredMissionFromContext | null {
  if (!isMissionExecutionConfirmation(currentText) && !isExplicitContextualBuildRequest(currentText)) return null;

  const usefulTurns = recentMessages
    .map((message) => message.trim())
    .filter((message) => message && !isLowSignalPlanningTurn(message));
  if (usefulTurns.length === 0) return null;

  const context = usefulTurns.join('\n');
  const lower = context.toLowerCase();
  const sparkTopic = /\bspark\b/.test(lower);
  const bugTopic = /\b(?:bug|bugs|diagnos|anomal|failure|failures|health|logs?|monitor|troubleshoot|issue|issues)\b/.test(lower);
  const chipTopic = /\bdomain\s*chip\b|\bchip\b/.test(lower);
  const buildTopic = /\b(?:build|create|make|scaffold|system|agent|monitor)\b/.test(lower);

  if (!(buildTopic || chipTopic) || !(sparkTopic || bugTopic || chipTopic)) {
    return null;
  }

  if ((sparkTopic || chipTopic) && bugTopic) {
    return {
      missionName: 'Spark Bug Recognition Domain Chip',
      goal: [
      'Deeply analyze the local Spark stack, including spark-telegram-bot, spark-intelligence-builder, domain-chip-memory, spark-researcher, and spawner-ui.',
      'Then design and scaffold a passive Spark bug-recognition domain chip that identifies recurring bugs, silent failures, degraded health, routing issues, memory failures, and mission-control problems.',
      'The first version should write Obsidian-friendly Markdown diagnostics and include clear setup, usage, and verification steps.',
      `Recent Telegram planning context:\n${context}`
      ].join('\n\n')
    };
  }

  if (chipTopic) {
    return {
      missionName: 'Spark Domain Chip',
      goal: [
      'Create a new Spark domain chip from the recent Telegram planning context.',
      'Analyze the relevant Spark systems first, then produce a concrete v1 chip design, files, setup notes, and tests.',
      `Recent Telegram planning context:\n${context}`
      ].join('\n\n')
    };
  }

  return {
    missionName: sparkTopic || bugTopic ? 'Spark Diagnostic Mission' : 'Spawner Context Mission',
    goal: [
      'Create a Spawner mission from the recent Telegram planning context.',
      'Analyze the relevant Spark systems first, then build the smallest useful v1 and include verification steps.',
      `Recent Telegram planning context:\n${context}`
    ].join('\n\n')
  };
}

export function inferMissionGoalFromRecentContext(currentText: string, recentMessages: string[]): string | null {
  return inferMissionFromRecentContext(currentText, recentMessages)?.goal || null;
}

export interface InferredDefaultBuild {
  projectName: string;
  prd: string;
}

export function inferDefaultBuildFromRecentScoping(currentText: string, recentMessages: string[]): InferredDefaultBuild | null {
  const normalized = currentText.trim().toLowerCase();
  if (!/^(?:i\s+don'?t\s+know[, ]*)?(?:you\s+decide|decide|pick\s+for\s+me|choose\s+for\s+me|your\s+call|go\s+with\s+your\s+recommendation|go\s+with\s+that|do\s+that)$/i.test(normalized)) {
    return null;
  }

  const context = recentMessages
    .map((message) => message.trim())
    .filter(Boolean)
    .slice(-6)
    .join('\n')
    .toLowerCase();
  if (!/\b(?:build|make|create|ship)\b/.test(context)) return null;

  const wantsMazeGame = /\bmaze\b/.test(context) && /\bgame\b/.test(context);
  const wantsBrowser = /\b(?:browser|html\s*canvas|canvas|web)\b/.test(context);
  if (wantsMazeGame && wantsBrowser) {
    return {
      projectName: 'Browser Maze Game',
      prd: [
        'Build a browser-based maze game using vanilla JavaScript and HTML Canvas unless the existing project setup clearly suggests otherwise.',
        'Use Spark\'s recommended default scope: top-down 2D maze, WASD and arrow-key controls, procedurally generated levels, visible exit, timer, restart button, level progression, and localStorage best-time persistence.',
        'Make the first screen immediately playable. Include a polished dark arcade visual style, responsive layout, clear win state, and README smoke tests for movement, maze completion, restart, level generation, and best-time persistence.'
      ].join('\n\n')
    };
  }

  return null;
}

export function isExplicitContextualBuildRequest(text: string): boolean {
  const normalized = text.trim().toLowerCase();
  if (!normalized) return false;
  const asksToBuild = /\b(?:build|create|make|scaffold|implement|wire|integrate|improve|expand|upgrade|add)\b/.test(normalized);
  const contextualObject = /\b(?:this|that|it|those|these|integration points?|connectors?|domain chip|diagnostic agent|bug recognition|what we built)\b/.test(normalized);
  const executionHint = /\b(?:via|through|using|with|as)\s+(?:codex|mission|spawner|run)\b|\bmission\b|\bcodex\b/.test(normalized);
  return asksToBuild && contextualObject && executionHint;
}

export function isBuildContextRecallQuestion(text: string): boolean {
  const normalized = text.trim().toLowerCase();
  if (isUserMemoryRecallQuestion(normalized)) {
    return false;
  }
  return (
    /\b(?:do\s+you\s+)?remember\b.*\b(?:build|building|built|making|project|chip|mission)\b/.test(normalized) ||
    /\bwhat\b.*\b(?:did|have)\s+(?:you|we)\s+(?:just\s+)?(?:build|make|create|ship)\b/.test(normalized) ||
    /\bwhat\b.*\b(?:were|was)\s+we\s+(?:gonna|going\s+to|about\s+to)\s+(?:build|make|create)\b/.test(normalized) ||
    /\bwe\s+were\s+(?:gonna|going\s+to|about\s+to)\s+(?:build|make|create)\b/.test(normalized)
  );
}

export function buildRecentBuildContextReply(recentMessages: string[]): string | null {
  const usefulTurns = recentMessages
    .map((message) => message.trim())
    .filter((message) => message && !isLowSignalPlanningTurn(message));
  if (usefulTurns.length === 0) return null;

  const context = usefulTurns.join('\n');
  const lower = context.toLowerCase();
  const sparkTopic = /\bspark\b/.test(lower);
  const bugTopic = /\b(?:bug|bugs|diagnos|anomal|failure|failures|health|logs?|monitor|troubleshoot|issue|issues)\b/.test(lower);
  const chipTopic = /\bdomain\s*chip\b|\bchip\b/.test(lower);
  const kanbanTopic = /\bkanban\b/.test(lower) &&
    /\b(?:canvas|mission|control|board|cards?|columns?|telegram|spawner|ui|v1|first version|improve|workflow|state|status)\b/.test(lower);
  const completedDiagnosticAgent = /\bcompleted spawner mission\b[\s\S]*\bdiagnostic agent\b|\bbuilt the first-pass spark diagnostic agent\b|\bspark-intelligence diagnostics scan\b/i.test(context);

  if (kanbanTopic) {
    return [
      'We were shaping improvements to the existing Spawner Kanban and Canvas.',
      'The current direction is to make mission state easier to trust: Canvas execution should map cleanly to Kanban status, provider ownership, task progress, logs, and completion summaries.',
      'No new product needs to be invented here. The next decision is which existing Spawner surface to tighten first: Kanban visibility, Canvas execution state, or Telegram relay messaging.'
    ].join('\n\n');
  }

  if (completedDiagnosticAgent) {
    return [
      'The latest completed build was the first-pass Spark Diagnostic Agent.',
      'It added `spark-intelligence diagnostics scan`, passive log discovery/classification, recurring bug grouping, and Obsidian-friendly diagnostic notes.',
      'Good next tests: run a fresh diagnostics scan, inspect the generated Markdown, verify it sees Builder/memory/Researcher/Spawner logs, then create a follow-up mission for missing connectors or better integration.'
    ].join('\n\n');
  }

  if ((sparkTopic || chipTopic) && bugTopic) {
    return [
      'We were shaping passive Spark bug recognition.',
      'The idea: analyze Spark systems, spot bugs/silent failures/degraded health, and write Obsidian-friendly diagnostic notes.',
      'If it has already run, the next step is testing and improving the diagnostic integration rather than starting from scratch.'
    ].join('\n\n');
  }

  if (chipTopic) {
    return [
      'We were shaping a new Spark domain chip.',
      `The latest useful context I have is: ${usefulTurns.slice(-3).join(' | ')}`,
      'Next step: say "yes create it" and I will start the Spawner mission.'
    ].join('\n\n');
  }

  return null;
}

function hasKnownLocalSparkSurface(text: string): boolean {
  return /\b(?:spawner|mission board|mission control|diagnostic|diagnostics|spark diagnostic|what (?:you|we) just built|thing (?:you|we) built|just built|dashboard|ui)\b/i.test(text);
}

function isProjectLocalhostRequest(normalized: string): boolean {
  return /\b(?:localhost|local\s*host|local\s+url|open|link)\b/.test(normalized) &&
    /\b(?:project|app|website|site|build|built|shipped|beauty|centre|center|thing|it)\b/.test(normalized) &&
    !/\b(?:spawner|mission board|mission control|kanban|canvas|diagnostic|diagnostics)\b/.test(normalized);
}

export function isAmbiguousLocalSparkServiceRequest(text: string, context: string = ''): boolean {
  const normalized = text.trim().toLowerCase();
  if (!/\b(?:localhost|local\s*host|local\s+url)\b/.test(normalized)) {
    return false;
  }
  if (isProjectLocalhostRequest(normalized)) {
    return false;
  }
  return !hasKnownLocalSparkSurface(normalized) && !hasKnownLocalSparkSurface(context);
}

export function isLocalSparkServiceRequest(text: string, context: string = ''): boolean {
  if (parseBuildIntent(text)) {
    return false;
  }

  const normalized = text.trim().toLowerCase();
  if (shouldPreferConversationalIdeation(text)) {
    return false;
  }
  if (isProjectLocalhostRequest(normalized)) {
    return false;
  }
  if (
    /\b(?:review|rate|assess|judge)\b/.test(normalized) &&
    /\bquality\b/.test(normalized) &&
    /\bbuild\b/.test(normalized)
  ) {
    return false;
  }
  const contextText = context.toLowerCase();
  return (
    (/\b(?:localhost|local\s*host|local\s+url)\b/.test(normalized) &&
      (hasKnownLocalSparkSurface(normalized) || hasKnownLocalSparkSurface(contextText))) ||
    (
      /\b(?:browser|open|show|link|ui|dashboard)\b/.test(normalized) &&
      /\b(?:spawner|mission board|mission control|this|it|diagnostic|spark)\b/.test(normalized)
    )
  );
}

export function buildLocalSparkServiceClarificationReply(): string {
  return [
    'Which local Spark surface do you mean?',
    '- Spawner UI / Mission Control: http://127.0.0.1:3333',
    '- Diagnostic notes: `~/.spark/diagnostics`',
    '- Telegram bot health: `/diagnose`',
    '- Full stack check: `spark status`'
  ].join('\n');
}

export function buildLocalSparkServiceReply(spawnerAvailable: boolean): string {
  if (spawnerAvailable) {
    return [
      'Yes. Spawner UI / Mission Control is running here:',
      'http://127.0.0.1:3333',
      '',
      'For this diagnostic-agent work, open the Mission board there. The diagnostic notes are written under `~/.spark/diagnostics`.'
    ].join('\n');
  }

  return [
    'Spawner UI is not reachable from the Telegram gateway right now.',
    'Run `spark start spawner-ui` or `spark start telegram-starter`, then open http://127.0.0.1:3333.',
    'After that, I can use the Spawner API path again through missions.'
  ].join('\n');
}

export type SpawnerBoardNaturalIntent = 'board' | 'latest_on_kanban' | 'latest_provider' | 'latest_project_preview';

export function parseSpawnerBoardNaturalIntent(text: string): SpawnerBoardNaturalIntent | null {
  const normalized = text.trim().toLowerCase();
  if (!normalized) return null;
  if (shouldPreferConversationalIdeation(text)) return null;
  if (isProjectLocalhostRequest(normalized)) {
    return 'latest_project_preview';
  }
  if (/\b(?:link|url|open|browser|where|localhost)\b/.test(normalized) && isLocalSparkServiceRequest(text, '')) {
    return null;
  }

  if (
    /\b(?:which|what)\s+(?:llm|model|provider|agent)\b.*\b(?:latest|last|recent|newest)\b.*\b(?:spawner|mission|job|run)\b/.test(normalized) ||
    /\b(?:latest|last|recent|newest)\b.*\b(?:spawner|mission|job|run)\b.*\b(?:which|what)\s+(?:llm|model|provider|agent)\b/.test(normalized) ||
    /\b(?:who|what)\s+(?:took|handled|ran|accepted)\b.*\b(?:latest|last|recent|newest)\b.*\b(?:spawner|mission|job|run)\b/.test(normalized)
  ) {
    return 'latest_provider';
  }

  if (
    /\b(?:latest|last|recent|newest)\b.*\b(?:canvas|spawner|mission|run|job)\b.*\b(?:show\s+up|appear|visible|saw|seen|landed)\b.*\b(?:kanban|board|mission\s+board)\b/.test(normalized) ||
    /\b(?:kanban|board|mission\s+board)\b.*\b(?:show|see|saw|seen|visible|have|has)\b.*\b(?:latest|last|recent|newest|same)\b.*\b(?:canvas|spawner|mission|run|job)\b/.test(normalized) ||
    /\bcanvas\s+event\s+stream\b.*\b(?:kanban|board|mission\s+board)\b/.test(normalized)
  ) {
    return 'latest_on_kanban';
  }

  if (
    /\b(?:show|display|list|pull\s+up|what'?s|what\s+is|status\s+of|current)\b.*\b(?:spawner|kanban|mission\s+board|mission\s+control)\b.*\b(?:board|kanban|missions?)?\b/.test(normalized) ||
    /\b(?:spawner|kanban|mission\s+board|mission\s+control)\b.*\b(?:board|status|current|running|completed|failed)\b/.test(normalized) ||
    /\bwhat'?s\s+running\b/.test(normalized)
  ) {
    return 'board';
  }

  return null;
}

export function isDiagnosticFollowupTestQuestion(text: string): boolean {
  const normalized = text.trim().toLowerCase();
  if (isExplicitMemoryWriteLikeRequest(normalized)) {
    return false;
  }
  if (isContextSurvivalVerificationRequest(normalized)) {
    return false;
  }
  if (isPersistentMemoryQualityEvaluationRequest(normalized)) {
    return false;
  }
  return (
    /\b(?:test|try|check|verify|integrated|integration|kick the tires)\b/.test(normalized) &&
    /\b(?:it|this|that|diagnostic|bug recognition|domain chip|agent)\b/.test(normalized)
  );
}

function isPersistentMemoryQualityEvaluationRequest(normalized: string): boolean {
  return (
    /\b(?:persistent\s+memory\s+quality|memory\s+quality|natural\s+recall|stale\s+context|current-state\s+priority|current\s+state\s+priority)\b/.test(normalized) &&
    /\b(?:evaluation\s+plan|test\s+natural\s+recall|evaluate|memory\s+sources?|source\s+explanation)\b/.test(normalized)
  );
}

export function isDiagnosticsScanRequest(text: string): boolean {
  const normalized = text.trim().toLowerCase();
  if (!normalized || isExplicitMemoryWriteLikeRequest(normalized)) {
    return false;
  }
  return (
    /\bspark-intelligence\s+diagnostics\s+scan\b/.test(normalized) ||
    (
      /\b(?:run|start|kick\s+off|execute|do)\b/.test(normalized) &&
      /\b(?:fresh|new|another|the)?\s*diagnostics?\s+scan\b/.test(normalized)
    )
  );
}

export function isAccessStatusQuestion(text: string): boolean {
  const normalized = text.trim().toLowerCase();
  if (!normalized || isExplicitMemoryWriteLikeRequest(normalized)) {
    return false;
  }

  if (/\b(?:set|change|raise|lower|switch|update|make)\b.*\baccess\b/.test(normalized)) {
    return false;
  }

  return (
    /\bwhat'?s\s+(?:my|this\s+chat'?s|our)?\s*(?:spark\s+)?access\s+(?:level|profile|status)\b/.test(normalized) ||
    /\b(?:what|which)\s+(?:is|are|'?s)?\s*(?:my|this\s+chat'?s|our)?\s*spark\s+access\s+(?:level|profile|status)\b/.test(normalized) ||
    /\b(?:what|which)\s+(?:access\s+)?level\s+(?:am\s+i|are\s+we|is\s+this\s+chat)\s+(?:on|at|using)\b/.test(normalized) ||
    /\b(?:show|tell|check|view|see)\s+(?:me\s+)?(?:my|this\s+chat'?s|our)?\s*spark\s+access\s+(?:level|profile|status)\b/.test(normalized) ||
    /\b(?:show|tell|check|view|see)\s+(?:me\s+)?(?:my|this\s+chat'?s|our)?\s*access\s+level\b/.test(normalized) ||
    /\b(?:my|this\s+chat'?s|our)\s+access\s+(?:level|profile|status)\b/.test(normalized) ||
    /\bcurrent\s+spark\s+access\b/.test(normalized)
  );
}

export function parseNaturalAccessChangeIntent(text: string): string | null {
  const normalized = text.replace(/\s+/g, ' ').trim();
  const lower = normalized.toLowerCase();
  if (!lower || isExplicitMemoryWriteLikeRequest(lower)) {
    return null;
  }

  const hasExplicitAccessTarget = /\b(?:spark\s+)?access(?:\s+level|\s+profile|\s+status)?\b|\bpermissions?\b/i.test(normalized);
  const hasStrongChangeVerb = /\b(?:change|set|switch|update|raise|lower|increase|decrease|upgrade|downgrade)\b/i.test(normalized);
  const startsAsDirectAccessChange = /^(?:please\s+)?(?:change|set|switch|update|upgrade|downgrade)\s+(?:me|us|this\s+chat|the\s+chat|it|that)?\s*(?:to|as|into|onto)?\s*(?:access\s+)?(?:level\s*)?(?:[1-4]|one|two|three|four|chat\s+only|build\s+when\s+asked|research\s*(?:\+|and|&)\s*build|full\s+access|developer)\b/i.test(normalized);
  if (!(hasExplicitAccessTarget && hasStrongChangeVerb) && !startsAsDirectAccessChange) {
    return null;
  }

  const valuePatterns = [
    /\b(?:to|as|at|on|into)\s+(?:spark\s+)?(?:access\s+)?(?:level\s*)?([1-4])\b/i,
    /\b(?:to|as|at|on|into)\s+(?:spark\s+)?(?:access\s+)?(?:level\s*)?(one|two|three|four)\b/i,
    /\b(?:to|as|into)\s+((?:chat\s+only|build\s+when\s+asked|research\s*(?:\+|and|&)\s*build|full\s+access|full|developer|agent|builder|chat))\b/i,
    /\b(?:access\s+)?(?:level\s*)?([1-4])\b/i,
    /\b(?:access\s+)?(?:level\s*)?(one|two|three|four)\b/i,
    /\b(chat\s+only|build\s+when\s+asked|research\s*(?:\+|and|&)\s*build|full\s+access|full|developer|agent|builder)\b/i
  ];

  for (const pattern of valuePatterns) {
    const match = normalized.match(pattern);
    const value = match?.[1]?.trim();
    if (value) {
      const numberWords: Record<string, string> = { one: '1', two: '2', three: '3', four: '4' };
      return numberWords[value.toLowerCase()] || value;
    }
  }

  return null;
}

export type RecentConversationFocus = 'access' | null;

export function inferRecentConversationFocus(recentMessages: string[]): RecentConversationFocus {
  const hasAccessFocus = recentMessages
    .slice(-6)
    .some((message) => {
      const normalized = message.toLowerCase();
      return (
        /\bspark access\b/.test(normalized) ||
        /\baccess\s+(?:level|levels|profile|profiles)\b/.test(normalized) ||
        /\bchanged this chat to level [1-4]\b/.test(normalized) ||
        /\byou are on level [1-4]\b/.test(normalized)
      );
    });
  return hasAccessFocus ? 'access' : null;
}

export function hasRecentAccessConversation(recentMessages: string[]): boolean {
  return inferRecentConversationFocus(recentMessages) === 'access';
}

export function parseContextualAccessChangeIntent(text: string, recentMessages: string[]): string | null {
  if (inferRecentConversationFocus(recentMessages) !== 'access') {
    return null;
  }

  const normalized = text.replace(/\s+/g, ' ').trim();
  const lower = normalized.toLowerCase();
  if (!lower || isExplicitMemoryWriteLikeRequest(lower)) {
    return null;
  }

  const contextualChange =
    /\b(?:change|set|switch|update|raise|lower|increase|decrease|upgrade|downgrade|make|put|move)\s+(?:it|that|this|me|us|the\s+chat)\b/i.test(normalized) ||
    /^(?:actually\s+|instead\s+|no[, ]*)?(?:do|make|set|switch|use|go\s+to|go\s+with)\s+(?:it\s+)?(?:to\s+|as\s+|at\s+)?(?:level\s+)?(?:[1-4]|one|two|three|four)\b/i.test(normalized) ||
    /^(?:actually\s+|instead\s+|no[, ]*)?(?:level\s+)?(?:[1-4]|one|two|three|four)\b/i.test(normalized);
  if (!contextualChange) {
    return null;
  }

  return parseNaturalAccessChangeIntent(`change access ${normalized}`);
}

export function isAccessHelpQuestion(text: string): boolean {
  const normalized = text.trim().toLowerCase();
  if (!normalized || isExplicitMemoryWriteLikeRequest(normalized)) {
    return false;
  }

  const mentionsAccess =
    /\b(?:spark\s+)?access\s+(?:level|levels|profile|profiles|tier|tiers|system)\b/.test(normalized) ||
    /\bpermission\s+(?:level|levels|management|surface|system)\b/.test(normalized) ||
    /\bwhat\s+can\s+i\s+(?:unlock|do)\b.*\baccess\b/.test(normalized) ||
    /\baccess\b.*\b(?:unlock|allow|permission|permissions)\b/.test(normalized);
  if (!mentionsAccess) return false;

  return (
    /\b(?:is|are|does|do|can|could|would|how|what|which|where|why)\b/.test(normalized) ||
    /\b(?:unlock|allow|permission|permissions|tier|tiers|level|levels|management|surface|system)\b/.test(normalized)
  );
}

function isExplicitMemoryWriteLikeRequest(normalized: string): boolean {
  return (
    /^memory\s+update\s*:/.test(normalized) ||
    /\b(?:please\s+)?(?:remember|save)\s+(?:this|that)\b/.test(normalized) ||
    /\b(?:my|our|the)\s+current\s+plan\s+is\b/.test(normalized)
  );
}

function isContextSurvivalVerificationRequest(normalized: string): boolean {
  return (
    /\b(?:survive|survived|survival|preserve|preserved)\b/.test(normalized) &&
    /\b(?:context|focus|plan|diagnostics?|maintenance|conversation\s+turn|turns?)\b/.test(normalized)
  ) || (
    /\b(?:collapsed?|collapse)\s+into\s+(?:done|complete|completed|resolved)\b/.test(normalized) &&
    /\b(?:focus|plan|context|diagnostics?|maintenance)\b/.test(normalized)
  );
}

export function buildDiagnosticFollowupTestReply(context: string): string | null {
  const lower = context.toLowerCase();
  if (!/\bdiagnostic agent\b|\bspark-intelligence diagnostics scan\b|\bbug recognition\b/.test(lower)) {
    return null;
  }

  return [
    'Yes. The useful tests are clear now:',
    '- run a fresh diagnostics scan with `spark-intelligence diagnostics scan` and confirm it writes a fresh Obsidian note',
    '- seed fake Builder/memory/Researcher errors and confirm classification catches them',
    '- verify the note links back to the affected Spark subsystem',
    '- create one follow-up Codex mission to wire stronger service discovery/connectors into that diagnostic agent',
    '',
    'If you want me to improve it from here, say "build the diagnostic integration upgrades via Codex" and I will start that as a mission.'
  ].join('\n');
}

export function buildContextualImprovementGoal(currentText: string, recentMessages: string[]): string | null {
  if (!isExplicitContextualBuildRequest(currentText)) return null;
  const context = recentMessages
    .map((message) => message.trim())
    .filter(Boolean)
    .join('\n');
  const lower = context.toLowerCase();

  if (/\bdiagnostic agent\b|\bspark-intelligence diagnostics scan\b|\bbug recognition\b/.test(lower)) {
    return [
      'Improve the recently built Spark Diagnostic Agent instead of starting a separate chip from scratch.',
      'Add integration connectors/service discovery so the diagnostic agent can inspect the local Spark ecosystem more directly: spark-telegram-bot relay/profile health, spawner-ui Mission Control/API health, spark-intelligence-builder runtime/memory bridge status, domain-chip-memory health, and spark-researcher health.',
      'Keep this passive and secure: no secret printing, no destructive commands, no webhook mode, long polling only for Telegram.',
      'Add tests for connector discovery, unavailable-service handling, and Obsidian Markdown output.',
      `Recent Telegram context:\n${context}\n\nLatest user request:\n${currentText}`
    ].join('\n\n');
  }

  return null;
}

export function isProjectImprovementRequest(text: string, project: ShippedProjectContext | null | undefined): boolean {
  if (!project) return false;
  const normalized = text.trim().toLowerCase();
  if (!normalized) return false;
  if (isSparkSelfMemoryDiagnosticQuestion(text)) return false;
  const explicitBuild = parseBuildIntent(text);
  if (explicitBuild?.projectPath) return false;
  if (/^(?:where|what|which|show|send|give)\b.*\b(?:link|localhost|preview|url|board|canvas|kanban)\b/.test(normalized)) {
    return false;
  }
  if (/\b(?:status|running|completed|failed|stuck|diagnose|logs?)\b/.test(normalized) && !/\b(?:fix|improve|polish|change|update)\b/.test(normalized)) {
    return false;
  }

  const asksToChange = /\b(?:make|turn|change|improve|polish|update|add|remove|fix|adjust|tweak|refine|rework|redesign|clean|tighten|soften|brighten|darken)\b/.test(normalized);
  if (!asksToChange) return false;

  const pointsAtCurrentProject = /\b(?:this|that|it|app|site|page|screen|project|build|product|dashboard|tool|prototype|design|layout|colors?|colours?|palette|theme|spacing|copy|text|button|flow|workflow|mobile|responsive|spark)\b/.test(normalized);
  return pointsAtCurrentProject;
}

export function buildProjectImprovementGoal(
  currentText: string,
  project: ShippedProjectContext | null | undefined,
  recentMessages: string[] = []
): string | null {
  if (!isProjectImprovementRequest(currentText, project) || !project) return null;

  const recentContext = recentMessages
    .map((message) => message.trim())
    .filter(Boolean)
    .slice(-8)
    .join('\n');

  return [
    `Improve the existing shipped project "${project.projectName}" at ${project.projectPath}.`,
    '',
    'This is an iteration on an already shipped app, not a new scaffold.',
    '',
    `User feedback:\n${currentText.trim()}`,
    '',
    'Rules:',
    '- Read the existing project files before editing.',
    '- Preserve the current core workflow and data model unless the user explicitly asks to change them.',
    '- Make the smallest strong improvement that satisfies the feedback.',
    '- Keep the app usable by non-technical users.',
    '- Update only the files needed for this iteration.',
    '- Verify the previous smoke path still works and add one focused check for the new improvement.',
    '- Return a concise handoff with project_path, what changed, and verification.',
    '',
    'Project context:',
    `- Parent mission: ${project.missionId}`,
    `- Current preview: ${project.previewUrl}`,
    project.summary ? `- Last shipped summary: ${project.summary}` : null,
    recentContext ? `\nRecent Telegram context:\n${recentContext}` : null
  ].filter((part): part is string => Boolean(part)).join('\n');
}

export function isExternalResearchRequest(text: string): boolean {
  const normalized = text.trim().toLowerCase();
  if (!normalized) return false;
  const hasExternalTarget =
    /https?:\/\/(?:www\.)?github\.com\/[\w.-]+\/[\w.-]+/i.test(text) ||
    /\bgithub\.com\/[\w.-]+\/[\w.-]+\b/i.test(text) ||
    /\b[\w.-]+\/[\w.-]+\b/.test(normalized) && /\b(?:github|repo|repository)\b/.test(normalized);
  if (!hasExternalTarget) return false;

  return /\b(?:visit|open|check|check out|look at|look into|inspect|read|analyze|review|browse|pull up|can you)\b/i.test(text);
}

export function buildExternalResearchGoal(currentText: string, recentMessages: string[]): string {
  const context = recentMessages
    .map((message) => message.trim())
    .filter(Boolean)
    .slice(-6)
    .join('\n');

  return [
    'Inspect the public GitHub/web target the user just shared and report back in Telegram-friendly language.',
    'Use only public information unless credentials are already configured by the local user. Do not print secrets or environment values.',
    'If it is a Spark ecosystem repo, summarize what it does, how it connects to Spark, whether it should be installed or wired into the starter stack, and what tests or manifests are missing.',
    'If direct network access fails, explain the failure and suggest the safest next check.',
    context ? `Recent Telegram context:\n${context}` : null,
    `User request:\n${currentText}`
  ].filter(Boolean).join('\n\n');
}

export interface MissionUpdatePreferenceIntent {
  verbosity?: 'minimal' | 'normal' | 'verbose';
  links?: 'none' | 'board' | 'canvas' | 'both';
}

function humanizeMissionPreferenceLine(line: string): string {
  const trimmed = line.trim();
  const update = trimmed.match(/^Updates:\s*(minimal|normal|verbose)\s*-/i)?.[1]?.toLowerCase();
  if (update === 'minimal') {
    return 'Updates will stay quiet: mission start, finish, and failures only.';
  }
  if (update === 'normal') {
    return 'Updates will stay balanced: starts, meaningful step changes, results, and failures.';
  }
  if (update === 'verbose') {
    return 'Updates will be more detailed: step starts, useful progress notes, completions, and failures.';
  }

  const links = trimmed.match(/^Links:\s*(none|board|canvas|both)\s*-/i)?.[1]?.toLowerCase();
  if (links === 'none') {
    return 'I will keep mission updates in Telegram without Spawner links.';
  }
  if (links === 'board') {
    return 'I will include the Mission board link when a mission is active.';
  }
  if (links === 'canvas') {
    return 'I will include the project canvas link when it is ready.';
  }
  if (links === 'both') {
    return 'I will include both the Mission board and project canvas links.';
  }

  return trimmed;
}

export function formatMissionUpdatePreferenceAcknowledgement(detailLines: string[]): string {
  const details = detailLines
    .map(humanizeMissionPreferenceLine)
    .filter((line) => line.trim());

  return ['Done, I updated how I narrate missions.', ...details].join('\n\n');
}

function hasMissionExecutionLanguage(normalized: string): boolean {
  return (
    /\b(?:build|create|make|ship|scaffold|generate|implement|code|develop)\b/.test(normalized) ||
    /\b(?:start|run|launch|kick\s+off|spin\s+up)\s+(?:the\s+)?(?:mission|run|build|project|canvas|workflow|it|this)\b/.test(normalized) ||
    /\b(?:go|do\s+it|let'?s\s+go|go\s+now|start\s+now|run\s+now)\b/.test(normalized)
  );
}

export function parseMissionUpdatePreferenceIntent(
  text: string,
  options: { allowExecutionLanguage?: boolean } = {}
): MissionUpdatePreferenceIntent | null {
  if (!options.allowExecutionLanguage && HARD_EXECUTION_PATTERNS.some((pattern) => pattern.test(text))) {
    return null;
  }

  const normalized = text.trim().toLowerCase();
  if (!options.allowExecutionLanguage && hasMissionExecutionLanguage(normalized)) {
    return null;
  }
  if (!/\b(?:mission|missions|spawner|canvas|board|kanban|telegram|updates?|notify|notifications?|links?)\b/.test(normalized)) {
    return null;
  }
  const hasExplicitPreferenceAction =
    /\b(?:updates?|notify|notifications?|links?|send|include|without|verbose|detailed|minimal|quiet|normal|standard|telegram only|start and end|start\s*\/\s*end)\b/.test(normalized);
  const hasBoardAndCanvasPair =
    /\b(?:board|kanban)\b.*\bcanvas\b/.test(normalized) ||
    /\bcanvas\b.*\b(?:board|kanban)\b/.test(normalized);
  if (!hasExplicitPreferenceAction && !(options.allowExecutionLanguage && hasBoardAndCanvasPair)) {
    return null;
  }

  const intent: MissionUpdatePreferenceIntent = {};
  if (/\b(?:verbose|detailed|all updates|everything|frequent)\b/.test(normalized)) {
    intent.verbosity = 'verbose';
  } else if (/\b(?:only\s+)?(?:start\s+and\s+end|start\s+\/\s+end|beginning\s+and\s+end|minimal|quiet|less noisy)\b/.test(normalized)) {
    intent.verbosity = 'minimal';
  } else if (/\b(?:middle\s+too|progress\s+too|normal|standard)\b/.test(normalized)) {
    intent.verbosity = 'normal';
  }

  if (/\b(?:no links?|without links?|telegram only|don'?t send links?|do not send links?)\b/.test(normalized)) {
    intent.links = 'none';
  } else if (/\b(?:(?:board|kanban)\s+and\s+canvas|canvas\s+and\s+(?:board|kanban)|both links?|both)\b/.test(normalized)) {
    intent.links = 'both';
  } else if (/\b(?:canvas links?|include canvas|show canvas|open canvas|canvas too)\b/.test(normalized)) {
    intent.links = 'canvas';
  } else if (/\b(?:mission board link|board link|kanban link|include board|include kanban|show board|show kanban|spawner link|mission control link)\b/.test(normalized)) {
    intent.links = 'board';
  }

  return intent.verbosity || intent.links ? intent : null;
}

export function buildIdeationSystemHint(text: string): string {
  const domainChip = /\bdomain[-\s]*chip[-\w]*\b/i.test(text);
  const missionControl = /\bmission\s+control\b/i.test(text);
  const existingSpawnerSurface = /\bspawner\b/i.test(text) && /\b(?:kanban|canvas|mission\s+board|mission\s+control)\b/i.test(text);

  const modeLine = domainChip
    ? 'The user is exploring an advanced Spark domain chip. Help shape the chip before proposing files or execution.'
    : existingSpawnerSurface
      ? 'The user is improving existing Spawner UI surfaces. Assume Kanban and Canvas already exist inside spawner-ui.'
      : missionControl
      ? 'The user is exploring a mission-control style idea. Help shape the idea before invoking Mission Control.'
      : 'The user is exploring a build idea. Help shape the concept before turning it into a build request.';

  return [
    modeLine,
    'Do not start a build, canvas, mission, or PRD yet.',
    existingSpawnerSurface
      ? 'Do not suggest building a standalone Kanban app or ask whether this should be standalone. Frame suggestions as changes to existing spawner-ui routes, state, and relay behavior.'
      : '',
    'If the user later says yes, create it, run it, spin it up, or kick it off, the Telegram gateway can start the mission. Do not claim you started it during ideation.',
    'If the user refers to no.1, no2, option 2, the second one, or a similar local list reference, resolve it against the most recent list in the conversation before using older memory. If the list is missing, ask one clarifying question instead of guessing.',
    'Reply like a collaborative product partner: propose 2-4 directions, ask one or two useful questions, and offer a next step.',
    'Keep it concise and natural for Telegram.'
  ].filter(Boolean).join('\n');
}

export function isLowInformationLlmReply(reply: string): boolean {
  const normalized = reply.trim().toLowerCase();
  return (
    !normalized ||
    normalized === 'working memory' ||
    normalized === 'nothing active' ||
    normalized === 'no concrete guidance' ||
    normalized === 'spark researcher returned no concrete guidance for this message.' ||
    normalized === 'what would you like help with?' ||
    normalized === 'how can i help?' ||
    normalized === 'how can i help you?' ||
    normalized === "i'm here, but i couldn't generate a response right now." ||
    normalized === "i'm having trouble thinking right now. try again in a moment." ||
    normalized.includes('working memory') ||
    normalized.includes('returned no concrete guidance') ||
    normalized.includes('access is not authorized for this channel') ||
    normalized.includes('no prior list or options to match') ||
    normalized.includes('two of what') ||
    normalized.includes("don't have a list") ||
    normalized.includes('do not have a list') ||
    normalized.includes('no list in front') ||
    (
      normalized.includes("i caught 'mission'") &&
      normalized.includes('show the mission board') &&
      normalized.includes('start a new mission')
    ) ||
    normalized.includes('what would you like help with') ||
    normalized.includes("couldn't generate") ||
    normalized.includes('having trouble thinking') ||
    (
      normalized.includes("i caught 'chip'") &&
      normalized.includes('loop <chip-key>') &&
      normalized.includes('which chips are active')
    ) ||
    (
      normalized.includes('tap this to scaffold') &&
      normalized.includes('/chip create') &&
      normalized.includes('slash command')
    )
  );
}

export function isMemoryAcknowledgementReply(reply: string): boolean {
  const normalized = reply.trim().toLowerCase();
  return (
    /^noted\s*[:.]/i.test(reply.trim()) ||
    /^saved\s*[:.]/i.test(reply.trim()) ||
    /^remembered\s*[:.]/i.test(reply.trim()) ||
    normalized.startsWith('i have saved memory about ') ||
    normalized.startsWith('saved memory about ') ||
    normalized.startsWith('memory saved') ||
    normalized.startsWith('got it, i will remember')
  );
}

export function shouldSuppressBuilderReplyForPlainChat(reply: string, routingDecision: string = ''): boolean {
  if (/^memory(?:_|$)/i.test(routingDecision.trim())) {
    return false;
  }
  return isLowInformationLlmReply(reply) || isMemoryAcknowledgementReply(reply);
}

export function shouldUseBuilderReplyForMemoryDirective(reply: string, routingDecision: string = ''): boolean {
  return /^memory(?:_|$)/i.test(routingDecision.trim()) && !isLowInformationLlmReply(reply);
}

export function renderChatRuntimeFailureReply(isAdmin: boolean, bridgeFailed: boolean = false): string {
  const base = bridgeFailed
    ? 'Spark can see the chat, but its reasoning path is not healthy right now.'
    : 'Spark can see the chat, but its chat model is not healthy right now.';

  if (isAdmin) {
    return [
      base,
      'Run /diagnose and check the Builder bridge plus the selected chat provider. If the provider key was rotated, restart the Telegram gateway after updating it.'
    ].join('\n\n');
  }

  return [
    base,
    'Please ask the operator to run /diagnose and check the chat provider setup.'
  ].join('\n\n');
}

export function extractPlainChatMemoryDirective(text: string): string | null {
  const trimmed = text.trim();
  const cleanDirective = (value: string): string => value
    .replace(/^["']|["']$/g, '')
    .replace(/[.!?]+$/g, '')
    .trim();

  const explicitSavePatterns = [
    /^(?:memory\s+update|memory\s+note|save\s+to\s+memory)\s*[:,-]\s*(.+?)(?:\s+(?:please\s+)?(?:save|store|remember)\s+this\s+as\s+.+)?[.!?]?$/i,
    /^(?:please\s+)?(?:save|store|remember)\s+this\s+as\s+(?:my\s+)?(?:current\s+)?(?:plan|focus|context)\s*[:,-]\s*(.+?)[.!?]?$/i,
    /^(?:please\s+)?(?:save|store|remember)\s+(?:my\s+)?(?:current\s+)?(?:plan|focus|context)\s*[:,-]\s*(.+?)[.!?]?$/i
  ];

  for (const pattern of explicitSavePatterns) {
    const match = trimmed.match(pattern);
    const value = match?.[1]?.trim();
    if (value) {
      return cleanDirective(value);
    }
  }

  const patterns = [
    /^(?:please\s+)?(?:can\s+you\s+)?remember\s+that\s+(.+?)[.!?]?$/i,
    /^(?:please\s+)?(?:can\s+you\s+)?remember\s+(?:this|that)\s*[:,-]\s*(.+?)[.!?]?$/i,
    /^(?:please\s+)?(?:can\s+you\s+)?remember\s*[:,-]\s*(.+?)[.!?]?$/i,
    /^(?:please\s+)?(?:can\s+you\s+)?remember\s+(.+?)[.!?]?$/i,
    /^(?:please\s+)?keep\s+in\s+mind\s+that\s+(.+?)[.!?]?$/i,
    /^(?:please\s+)?note\s+that\s+(.+?)[.!?]?$/i
  ];

  for (const pattern of patterns) {
    const match = trimmed.match(pattern);
    const value = match?.[1]?.trim();
    if (value) {
      return cleanDirective(value);
    }
  }

  return null;
}

function cleanAgentDoctrinePreference(raw: string): string {
  return raw
    .replace(/\s+/g, ' ')
    .replace(/^(?:that\s+)?(?:spark|you|my\s+agent|the\s+agent)\s+(?:should|must|needs?\s+to|can|could|will|would)\s+/i, '')
    .replace(/^(?:you|spark|my\s+agent|the\s+agent)\s+(?:to\s+)?/i, '')
    .replace(/^["']|["']$/g, '')
    .replace(/[.!?]+$/g, '')
    .trim();
}

function classifyAgentDoctrinePreference(text: string): string {
  const lower = text.toLowerCase();
  if (/\b(?:paragraph|spacing|blank lines?|format|structure|bullets?|checklists?|markdown|wall of text)\b/.test(lower)) {
    return 'format';
  }
  if (/\b(?:concise|brief|short|terse|detailed|depth|explain|summary|summarize)\b/.test(lower)) {
    return 'detail';
  }
  if (/\b(?:decisive|opinionated|direct|blunt|recommend|push back|call it|your call|choose)\b/.test(lower)) {
    return 'decision';
  }
  if (/\b(?:proactive|notice|patterns?|read the room|infer|anticipate|call out|adjust)\b/.test(lower)) {
    return 'initiative';
  }
  if (/\b(?:tool|tools|mission|missions|build|run|ask before|approval|confirm|start)\b/.test(lower)) {
    return 'tool_behavior';
  }
  if (/\b(?:collaborat|brainstorm|think with me|work with me|back and forth|conversation)\b/.test(lower)) {
    return 'collaboration';
  }
  if (/\b(?:warm|friendly|casual|formal|gentle|playful|serious|energy|vibe|tone)\b/.test(lower)) {
    return 'tone';
  }
  return 'general';
}

export function extractAgentDoctrinePreference(text: string): string | null {
  const trimmed = text.replace(/\s+/g, ' ').trim();
  if (!trimmed) return null;

  const lower = trimmed.toLowerCase();
  if (
    /\b(?:just|only)\s+for\s+(?:this|the)\s+(?:reply|turn|message|answer|once)\b/.test(lower) ||
    /\b(?:for now|right now|in this reply|in this answer|this time only)\b/.test(lower) ||
    /\b(?:all|every|each)\s+(?:spark\s+)?agents?\b/.test(lower) ||
    /\b(?:globally|system-wide|production doctrine|default doctrine)\b/.test(lower)
  ) {
    return null;
  }

  const patterns = [
    /\b(?:from now on|going forward|for future replies|in future replies|for my agent|when you talk to me|with me)\s*,?\s*(.+)$/i,
    /\b(?:let'?s\s+)?keep\s+(?:things|replies|answers|our\s+chat|this\s+agent|my\s+agent|the\s+agent)\s+(?:always\s+)?(.+)$/i,
    /\b(?:remember|save|keep|store)\s+(?:this\s+)?(?:as\s+)?(?:my\s+)?(?:agent\s+)?(?:personality|style|tone|format|interaction|collaboration|working|reply|response|communication)\s+(?:preference|rule|doctrine|guidance)?\s*[:,-]?\s*(.+)$/i,
    /\b(?:adjust|change|update|improve|tune|adapt|shift)\s+(?:your|the|my\s+agent'?s|spark'?s)?\s*(?:personality|style|tone|format|interaction|collaboration|working|reply|response|communication|rules|doctrine)\s+(?:to|so\s+you|so\s+it|toward|around)\s+(.+)$/i,
    /\b(?:i\s+prefer|i'?d\s+prefer|i\s+want|i'?d\s+like)\s+(?:you|spark|my\s+agent|the\s+agent)\s+to\s+(.+)$/i,
    /\b(?:be|stay|keep|use|act|respond|reply|talk|speak|write)\s+(?:more\s+|less\s+)?(?:conversational|direct|decisive|warm|casual|formal|brief|concise|detailed|curious|opinionated|proactive|gentle|blunt|structured|paragraph|checklist|dense|friendly)\b.*$/i,
    /\b(?:do not|don't|dont|stop)\s+(?:be|being|sound|sounding|write|writing|reply|respond|use|give)\b.*$/i
  ];

  for (const pattern of patterns) {
    const match = trimmed.match(pattern);
    const raw = (match?.[1] || match?.[0] || '').trim();
    const cleaned = cleanAgentDoctrinePreference(raw);
    if (cleaned && cleaned.length >= 4 && cleaned.length <= 220) {
      const dimension = classifyAgentDoctrinePreference(`${trimmed} ${cleaned}`);
      return `Agent interaction preference [${dimension}]: ${cleaned}`;
    }
  }

  return null;
}

export function isStandaloneAgentDoctrinePreference(text: string): boolean {
  const trimmed = text.replace(/\s+/g, ' ').trim();
  if (!extractAgentDoctrinePreference(trimmed)) {
    return false;
  }
  if (parseBuildIntent(trimmed)) {
    return false;
  }
  if (/\b(?:and|then)\s+(?:build|create|run|start|explain|tell|show|send|open|search|find|what|why|how|which|where)\b/i.test(trimmed)) {
    return false;
  }
  if (/\?\s*$/.test(trimmed) && !/\b(?:can|could|would)\s+you\b.*\b(?:remember|save|keep|adjust|change|update|use|be|respond|reply|talk|write)\b/i.test(trimmed)) {
    return false;
  }
  return true;
}

export function isGlobalAgentDoctrineRequest(text: string): boolean {
  const normalized = text.replace(/\s+/g, ' ').trim().toLowerCase();
  if (!normalized) {
    return false;
  }
  return (
    /\b(?:all|every|each)\s+(?:spark\s+)?agents?\b/.test(normalized) ||
    /\b(?:globally|system-wide|production doctrine|default doctrine)\b/.test(normalized)
  ) && /\b(?:style|tone|personality|persona|conversation|reply|response|talk|speak|doctrine|rule|preference|ask|clarify|clarifying|confirmation|missions?|tools?|start)\b/.test(normalized);
}

export function formatGlobalAgentDoctrineRequestReply(): string {
  return [
    'I cannot change all Spark agents globally from this chat.',
    'I can keep a preference for this agent with you, though. Say something like: "when you talk to me, use short paragraphs with blank lines."'
  ].join('\n\n');
}

export function formatAgentDoctrinePreferenceAcknowledgement(preference: string): string {
  const detail = extractAgentDoctrinePreferenceDetail(preference);
  return [
    'Got it. I will keep that as a preference for how I talk with you.',
    detail ? `I will adjust around this from here: ${detail}.` : 'I will adjust from here.'
  ].join('\n\n');
}

function extractAgentDoctrinePreferenceDetail(preference: string): string {
  return preference
    .replace(/^Agent interaction preference \[[^\]]+\]:\s*/i, '')
    .replace(/\s+/g, ' ')
    .replace(/[.!?]+$/g, '')
    .trim();
}

function lowerFirstAgentPreferenceClause(detail: string): string {
  return detail ? `${detail[0].toLowerCase()}${detail.slice(1)}` : detail;
}

export function formatAgentDoctrinePreferenceForBuilderSync(preference: string): string {
  const detail = extractAgentDoctrinePreferenceDetail(preference);
  if (!detail) return '';
  const clause = lowerFirstAgentPreferenceClause(detail).slice(0, 220);
  return [
    'Your style should follow this saved agent interaction preference.',
    `When you talk to me, ${clause}.`
  ].join('\n');
}

export function isAgentDoctrinePreferenceStatusQuestion(text: string): boolean {
  const normalized = text.replace(/\s+/g, ' ').trim().toLowerCase();
  if (!normalized || parseBuildIntent(normalized)) {
    return false;
  }
  return (
    /\b(?:what|which|show|list|tell)\b/.test(normalized) &&
    /\b(?:preferences?|rules?|guidance|doctrine|style|tone|personality|interaction|communication)\b/.test(normalized) &&
    /\b(?:remember|saved|carrying|using|have|know|for me|with me|my agent|you)\b/.test(normalized)
  );
}

export function isUserMemoryRecallQuestion(text: string): boolean {
  const normalized = text.trim().toLowerCase();
  if (!normalized) return false;
  if (
    /^memory\s+update\s*:/.test(normalized) ||
    /\b(?:please\s+)?(?:remember|save)\s+(?:this|that)\b/.test(normalized)
  ) {
    return false;
  }

  return (
    /\bwhat\b.*\bremember\b.*\b(?:prefer|preferred|preference|like|mission\s+updates?|updates?|about\s+me|about\s+how\s+i|how\s+i\s+work|work\s+style)\b/.test(normalized) ||
    /\bwhat\b.*\b(?:prefer|preferred|preference|like)\b.*\bremember\b/.test(normalized) ||
    /\bwhat\s+do\s+you\s+know\s+about\s+how\s+i\s+like\s+to\s+work\b/.test(normalized) ||
    /\bwhat\b.*\b(?:stable\s+user\s+memory|recent\s+context|only\s+recent\s+context)\b/.test(normalized)
  );
}

export function formatAgentDoctrinePreferenceStatus(preferences: string[]): string {
  if (preferences.length === 0) {
    return 'I do not have any saved interaction preferences for this chat yet.';
  }

  const lines = preferences.map((preference) => {
    const match = preference.match(/^Agent interaction preference \[([a-z_]+)\]:\s*(.+)$/i);
    if (!match) {
      return `- ${preference}`;
    }
    const dimension = match[1].replace(/_/g, ' ');
    return `${dimension}: ${match[2]}`;
  });

  return ['Here is what I am using for how I talk with you.', ...lines].join('\n\n');
}

export function buildMemoryBridgeUnavailableReply(action: 'remember' | 'recall' | 'about'): string {
  if (action === 'remember') {
    return 'I could not confirm that through Spark memory yet. Please run /diagnose, or ask the operator to run `spark fix telegram` and `spark verify --deep`.';
  }
  if (action === 'recall') {
    return 'I could not get a useful memory answer yet. Please run /diagnose, or ask the operator to run `spark fix telegram` and `spark verify --deep`.';
  }
  return 'I could not inspect Spark memory yet. Please run /diagnose, or ask the operator to run `spark fix telegram` and `spark verify --deep`.';
}

export function buildIdeationFallbackReply(text: string): string {
  if (/\bdomain[-\s]*chip[-\w]*\b/i.test(text)) {
    return [
      'Yes. I would shape this as a real domain chip first, not jump straight into files.',
      '',
      'First version: a chip that knows its purpose, when to activate, what advice it is allowed to give, what patterns to avoid, and how to verify its own usefulness.',
      '',
      'I would start with three parts: the chip identity, the practical playbook, and a few example situations where Spark should invoke it.',
      '',
      'Quick question: should this chip be more builder-focused, research-focused, or taste/strategy-focused?'
    ].join('\n');
  }

  if (/\bmission\s+control\b/i.test(text) || /\bmission\s+dashboard\b/i.test(text)) {
    return [
      'Yes, the first version should feel like a tiny daily command center with game feel, not a task list in a costume.',
      '',
      'I would make v1 around three daily missions. Each mission gets a status, energy cost, streak impact, and a launch/debrief moment. The main screen shows your current flight state: Ready, In Orbit, Low Energy, or Mission Complete.',
      '',
      'The fun part: completing a mission triggers a small launch animation and updates your streak/history, so the day feels like progress through a little campaign.',
      '',
      'For v1, I would keep it solo and lightweight: no accounts, no backend, just a polished browser app with local persistence. Want it to feel more space-ops, arcade RPG, or cozy sci-fi?'
    ].join('\n');
  }

  return [
    'Yes. I would keep this in idea-shaping mode for one more step before building.',
    '',
    'A strong first version should have one clear loop: choose a tiny goal, interact with it in a playful way, get satisfying feedback, and come back later because progress is saved.',
    '',
    'I would explore three directions: a mini quest tracker, a playful mission dashboard, or a creative prompt machine. Which one feels most alive to you?'
  ].join('\n');
}
