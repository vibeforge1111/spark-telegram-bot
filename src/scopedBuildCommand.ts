export type ScopedBuildBlockReason =
  | 'broad_prohibition'
  | 'terminal_prohibition'
  | 'ambiguous_same_target'
  | 'untrusted_frame';

export type ScopedBuildCommandResolution =
  | {
      kind: 'full_turn';
      commandText: string;
      commandOffset: 0;
      hasExplicitBuildCommand: boolean;
    }
  | {
      kind: 'fresh_replacement';
      commandText: string;
      commandOffset: number;
      negatedObject: string;
      reason: 'distinct_artifact_replacement';
    }
  | {
      kind: 'blocked';
      commandText: null;
      commandOffset: null;
      reason: ScopedBuildBlockReason;
    };

type BuildCommandMatch = {
  verbIndex: number;
  verb: string;
};

type NegatedArtifactMatch = {
  start: number;
  end: number;
  object: string;
};

const BUILD_VERB = '(?:build|create|make|scaffold|generate|ship|develop)';

const BROAD_PROHIBITION_PATTERNS = [
  /\bno\s+(?:build|mission|execution|new\s+work)(?:\s+or\s+(?:build|mission|execution|new\s+work))*\s+for\s+now\b/i,
  /\bno\s+(?:build|mission|execution|new\s+work)\s*(?:[.!?;,]|$)/i,
  /\b(?:do\s+not|don't|dont|please\s+don't|please\s+dont|no\s+need\s+to)\s+(?:build|create|make|scaffold|generate|implement|develop)\s+(?:anything|something|new\s+work|a\s+mission|a\s+build|a\s+project|the\s+mission|the\s+build|the\s+project|it|this|that)\b/i,
  /\b(?:do\s+not|don't|dont|please\s+don't|please\s+dont|no\s+need\s+to)\s+(?:start|run|launch|execute|dispatch|kick\s+off)\s+(?:anything|something|new\s+work|work|tasks?|missions?|builds?|it|this|that)\b/i,
  /\b(?:stay\s+in\s+chat|just\s+explain|explain\s+only|only\s+explain|we\s+can\s+talk\s+here|talk\s+here)\b/i
];

const UNTRUSTED_BUILD_FRAME_PATTERNS = [
  new RegExp(`^["\\x60]\\s*(?:please\\s+)?${BUILD_VERB}\\b[^"\\x60]*["\\x60]\\s*[.!?]*$`, 'i'),
  new RegExp(`^\\s*(?:>|\\[|\\()\\s*(?:please\\s+)?${BUILD_VERB}\\b`, 'i'),
  /^\s*<\s*instruction\b/i,
  /^\s*(?:input|user|copied|transcript|forwarded\s+message|user\s+message|documentation|policy|readme|example|repro|qa\s+case)\s*[:—-]/i,
  /\b(?:earlier|previously|before)\s+(?:you|we|i|they)\s+(?:said|mentioned|wrote|told)\b/i,
  /\b(?:you|we|i|they)\s+(?:said|mentioned|wrote|told\s+me)\b.{0,160}\b(?:build|create|make|scaffold|generate|ship|develop|implement)\b/i,
  /\b(?:ticket|report|bug|issue|message|memory|trace|log|doc|document|spec|readme|screenshot|prompt|customer|client|owner|team)\s+(?:says?|said|mentions?|mentioned|contains?|contained|asks?|asked|instructs?|instructed|wrote|recommended|requires?)\b/i,
  /\b(?:email|message|request|prompt)\s+from\s+[^:]{1,80}:\s*/i,
  /\bhere(?:'s|\s+is)\s+(?:the\s+)?(?:user|customer|client)(?:'s)?\s+(?:text|message|prompt|instruction)\b/i,
  /\b(?:evaluate|review|classify|analy[sz]e)\b.{0,80}\b(?:whether|if|safe|command|prompt|instruction|text)\b/i,
  /\b(?:paraphrase|rewrite|quote|repeat)\b.{0,80}\b(?:build|create|make|scaffold|generate|ship|develop)\b/i,
  /\b(?:pretend\s+to|roleplay\b.{0,60}\b(?:saying|asking|telling)|i\s+can\s+say)\b.{0,100}\b(?:build|create|make|scaffold|generate|ship|develop)\b/i,
  /\b(?:the\s+)?words?\b.{0,40}\b(?:build|create|make|scaffold|generate|ship|develop)\b.{0,120}\b(?:appear|inside|in\s+the\s+log|without\s+asking)\b/i,
  /\bcould\s+the\s+(?:command|instruction|prompt)\s+be\b/i,
  /\b(?:here(?:'s|\s+is)|this\s+is|the\s+following\s+is|consider|review|classify)\s+(?:an?\s+)?(?:example|sample|test\s+case)\b.{0,200}\b(?:build|create|make|scaffold|generate|ship|develop|implement)\b/i,
  /\b(?:command|instruction|prompt)\s*:\s*(?:please\s+)?(?:build|create|make|scaffold|generate|ship|develop|implement)\b/i,
  /\b(?:example|sample|fake\s+user)\s+(?:prompt|command|instruction|text)\b.{0,200}\b(?:build|create|make|scaffold|generate|ship|develop|implement)\b/i,
  /\b(?:write|draft|create)\b.{0,80}\b(?:example\s+prompt|sample\s+command|fake\s+user\s+command|test\s+case)\b/i,
  /\b(?:what\s+if|suppose|i\s+wonder|wondering\s+(?:if|whether)|thinking\s+about|considering)\b.{0,160}\b(?:build|create|make|scaffold|generate|ship|develop|implement)\b/i,
  /\b(?:should\s+(?:i|we)|how\s+(?:do|would|should|can|could)\s+(?:i|we|you)|why\s+(?:would|should|did)|do\s+(?:you|we)\s+think)\b.{0,160}\b(?:build|create|make|scaffold|generate|ship|develop|implement)\b/i,
  /\b(?:is\s+it\s+(?:worth|possible|safe|ok|okay|a\s+good\s+idea)|do\s+(?:i|we)\s+(?:need|have)\s+to|what(?:'s|\s+is)\s+the\s+best\s+way\s+to)\b.{0,160}\b(?:build|create|make|scaffold|generate|ship|develop|implement)\b/i,
  /\b(?:might|maybe|perhaps|possibly|we\s+could)\b.{0,80}\b(?:build|create|make|scaffold|generate|ship|develop|implement)\b/i
];

const ARTIFACT_TYPE_PATTERNS: Array<[string, RegExp]> = [
  ['mobile_app', /\bmobile\s+(?:app|application)\b/i],
  ['web_dashboard', /\bweb\s+dashboard\b/i],
  ['web_app', /\bweb\s+(?:app|application)\b/i],
  ['api_service', /\bapi\s+(?:service|backend)\b/i],
  ['landing_page', /\blanding\s+page\b/i],
  ['domain_chip', /\bdomain[-\s]*chip\b/i],
  ['backend', /\bbackend\b/i],
  ['prototype', /\bprototype\b/i],
  ['dashboard', /\bdashboard\b/i],
  ['service', /\bservice\b/i],
  ['api', /\bapi\b/i],
  ['bot', /\bbot\b/i],
  ['website', /\b(?:website|site)\b/i],
  ['game', /\bgame\b/i],
  ['agent', /\bagent\b/i],
  ['tool', /\btool\b/i],
  ['board', /\bboard\b/i],
  ['app', /\b(?:app|application)\b/i],
  ['system', /\bsystem\b/i],
  ['project', /\bproject\b/i]
];

const GENERIC_ARTIFACT_TYPES = new Set(['app', 'system', 'project']);

function canonicalText(text: string): string {
  return text
    .replace(/[‘’‚‛′]/g, "'")
    .replace(/[“”„‟″]/g, '"');
}

function releaseClauseKinds(input: string): { publication: boolean; merge: boolean } {
  const normalized = canonicalText(input).toLowerCase().replace(/\s+/g, ' ').trim();
  const actionBoundary = '(?:^|[,/]\\s*(?:and|or|nor)?\\s*|\\b(?:and|or|nor|then)\\s+)';
  const prAction = new RegExp(`${actionBoundary}(?:open|create)\\b[^.!?;]{0,80}\\b(?:prs?|pull\\s+requests?)\\b`).test(normalized);
  const publication =
    new RegExp(`${actionBoundary}(?:publish|share|deploy|ship|push|release|repin)\\b`).test(normalized) ||
    prAction ||
    new RegExp(`${actionBoundary}host\\b[^.!?;]{0,40}\\bpublic(?:ly)?\\b`).test(normalized) ||
    /\b(?:unpublished|undeployed)\b/.test(normalized);
  const merge = new RegExp(`${actionBoundary}merge\\b`).test(normalized) || prAction;
  return { publication, merge };
}

function isReleaseOnlyClause(input: string): boolean {
  const normalized = canonicalText(input).toLowerCase().replace(/\s+/g, ' ').trim();
  if (!normalized) return false;
  const kinds = releaseClauseKinds(normalized);
  if (!kinds.publication && !kinds.merge) return false;
  if (hasExplicitMetaDisavowal(normalized)) return false;
  if (hasDeferredExecutionProhibition(normalized)) return false;

  const protectedPrActions = normalized.replace(
    /\b(?:open|create)\b(?=[^.!?;]{0,80}\b(?:prs?|pull\s+requests?)\b)/g,
    'release-pr-action'
  );
  return !/(?:^|[,/]\s*(?:and|or)?\s*|\b(?:and|or|then)\s+)(?:do\s+not\s+)?(?:start|run|launch|execute|dispatch|kick\s+off|build|make|scaffold|generate|implement|develop|act|carry\s+(?:it|this|that)\s+out|proceed|continue|queue|enqueue|hold|wait|pause|stop|cancel|refrain\s+from\s+(?:running|executing|starting|launching)|not\s+(?:yet|now))\b/.test(protectedPrActions);
}

function releaseBoundaryAnalysis(input: string): { found: boolean; publication: boolean; merge: boolean; text: string } {
  let found = false;
  let publication = false;
  let merge = false;
  const removeIfReleaseOnly = (full: string, clause: string): string => {
    const kinds = releaseClauseKinds(clause);
    publication ||= kinds.publication;
    merge ||= kinds.merge;
    if (!isReleaseOnlyClause(clause)) return full;
    found = true;
    return ' ';
  };
  let text = canonicalText(input).replace(
    /\b(?:do\s+not|don't|dont|please\s+don't|please\s+dont|no\s+need\s+to)\s+([^.!?;]+)/gi,
    removeIfReleaseOnly
  );
  text = text.replace(/\bneither\s+([^.!?;]+)/gi, removeIfReleaseOnly);
  text = text.replace(
    /\bkeep\s+(?:(?:it|this|that|the\s+(?:build|project|result))\s+)?(?:unpublished|undeployed)(?:\s+and\s+(?:unpublished|undeployed))?\b/gi,
    (full) => {
      found = true;
      publication = true;
      return ' ';
    }
  );
  return { found, publication, merge, text: text.replace(/\s+/g, ' ').trim() };
}

function findBuildCommands(text: string): BuildCommandMatch[] {
  const matches: BuildCommandMatch[] = [];
  const pattern = new RegExp(
    `(?:^|[.!?;,\\n]\\s*|\\b(?:but|so|then|instead|also)\\b[\\s,:-]+)(?:(?:please|now)\\s+|(?:can|could|would)\\s+you\\s+|let'?s\\s+)*(${BUILD_VERB})\\b`,
    'gi'
  );
  for (const match of text.matchAll(pattern)) {
    if (match.index === undefined || !match[1]) continue;
    const relativeVerbIndex = match[0].toLowerCase().lastIndexOf(match[1].toLowerCase());
    matches.push({
      verbIndex: match.index + Math.max(0, relativeVerbIndex),
      verb: match[1].toLowerCase()
    });
  }
  const inversionPattern = /\b(?:do\s+not|don't|dont)\s+(?:forget\s+to|worry\s*,?\s*|hesitate\s+to)\s*(build|create|make|scaffold|generate|ship|develop)\b/gi;
  for (const match of text.matchAll(inversionPattern)) {
    if (match.index === undefined || !match[1]) continue;
    const verbIndex = match.index + match[0].toLowerCase().lastIndexOf(match[1].toLowerCase());
    if (!matches.some((candidate) => candidate.verbIndex === verbIndex)) {
      matches.push({ verbIndex, verb: match[1].toLowerCase() });
    }
  }
  return matches.sort((left, right) => left.verbIndex - right.verbIndex);
}

function findNegatedArtifacts(text: string): NegatedArtifactMatch[] {
  const matches: NegatedArtifactMatch[] = [];
  const pattern = /\b(?:do\s+not|don't|dont|please\s+don't|please\s+dont|never)\s+(?!forget\b|hesitate\b|worry\b|be\s+afraid\b|mind\b)(?:build|create|make|implement|develop|change|modify|replace|continue|keep|use|turn)\s+([^.!?;\n]{1,180})/gi;
  for (const match of text.matchAll(pattern)) {
    if (match.index === undefined || !match[1]) continue;
    if (releaseBoundaryAnalysis(match[0]).found) continue;
    const rawObject = match[1]
      .split(/\s*,?\s+\b(?:but|so|then|instead|also)\b/i, 1)[0]
      .trim();
    if (!rawObject) continue;
    const objectStart = match[0].lastIndexOf(match[1]);
    matches.push({
      start: match.index,
      end: match.index + objectStart + rawObject.length,
      object: rawObject
    });
  }
  return matches;
}

function artifactTypes(text: string): Set<string> {
  const types = new Set<string>();
  for (const [name, pattern] of ARTIFACT_TYPE_PATTERNS) {
    if (pattern.test(text)) types.add(name);
  }
  return types;
}

function positiveTargetClause(text: string, command: BuildCommandMatch): string {
  return text.slice(command.verbIndex, command.verbIndex + 220).split(/[.!?;\n]/, 1)[0].trim();
}

function isDistinctArtifactReplacement(negatedObject: string, positiveClause: string): boolean {
  if (isSameArtifactTarget(negatedObject, positiveClause)) return false;
  if (/\b(?:for|of|from|using)\s+(?:it|that)\b|\bits\s+(?:backend|api|service|component|replacement|version)\b|\bfor\s+this\s*$/i.test(positiveClause)) {
    return false;
  }
  if (/^(?:it|this|that|the\s+same|same\b)/i.test(positiveClause.replace(new RegExp(`^${BUILD_VERB}\\s+`, 'i'), '').trim())) {
    return false;
  }
  const negativeTypes = artifactTypes(negatedObject);
  const positiveTypes = artifactTypes(positiveClause);
  const meaningfulNegative = [...negativeTypes].filter((type) => !GENERIC_ARTIFACT_TYPES.has(type));
  const meaningfulPositive = [...positiveTypes].filter((type) => !GENERIC_ARTIFACT_TYPES.has(type));
  if (meaningfulNegative.length === 0 || meaningfulPositive.length === 0) return false;
  const distinctPositiveType = meaningfulPositive.some((type) => !negativeTypes.has(type));
  if (!distinctPositiveType) return false;

  const contrastEvidence =
    /\b(?:another|old|existing|previous|prior|prototype|mobile|dashboard[-\s]*only)\b/i.test(negatedObject) ||
    /\b(?:real|new|different|replacement|instead|backend|api|web|local)\b/i.test(positiveClause);
  return contrastEvidence;
}

function isSameArtifactTarget(negatedObject: string, positiveClause: string): boolean {
  const negativeTypes = artifactTypes(negatedObject);
  const positiveTypes = artifactTypes(positiveClause);
  const webSurfaceTypes = new Set(['website', 'web_dashboard', 'web_app', 'landing_page', 'dashboard']);
  const sharesWebSurfaceFamily =
    [...negativeTypes].some((type) => webSurfaceTypes.has(type)) &&
    [...positiveTypes].some((type) => webSurfaceTypes.has(type));
  const ignored = new Set([
    'a', 'an', 'another', 'build', 'create', 'make', 'scaffold', 'generate', 'ship', 'develop',
    'implement', 'the', 'this', 'that', 'it', 'new', 'old', 'existing', 'previous', 'prior',
    'real', 'now', 'please', 'for', 'of', 'from', 'using', 'with', 'only'
  ]);
  const tokens = (value: string) => new Set(
    value.toLowerCase().match(/[a-z0-9]+/g)?.filter((token) => !ignored.has(token)) || []
  );
  const negativeTokens = tokens(negatedObject);
  const positiveTokens = tokens(positiveClause);
  return sharesWebSurfaceFamily || [...negativeTokens].some((token) => positiveTokens.has(token));
}

function hasTrustedDirectPrefix(text: string, negationStart: number): boolean {
  const prefix = text.slice(0, negationStart).trim();
  if (!prefix) return true;
  return /^(?:please\s+)?(?:continue|resume)\s+(?:the\s+)?mission(?:[-\s]+[a-z0-9][a-z0-9_-]*)?[^:;.!?\n]{0,40}?(?:,\s*)?(?:but|and)?\s*$/i.test(prefix);
}

function hasLooseTerminalClause(textAfterCommand: string): boolean {
  return /(?:^|[.!?;:\n/()—–]\s*|,\s*|\b(?:and|but|or|then)(?:\s+then)?\s+)(?:(?:and|but|or|then)(?:\s+then)?\s+)?(?:(?:wait|pause|hold)(?:\s+(?:it|this|that))?|(?:stop|cancel)(?:\s+(?:it|this|that))?|not\s+(?:yet|now)|(?:do\s+not|don't|dont)\s+(?:act|carry\s+(?:it|this|that)\s+out|proceed|continue|go\s+ahead)|ask(?:\s+me)?\s+before\s+(?:doing|carrying\s+out|executing|starting|running|launching|dispatching)(?:\s+(?:it|this|that|anything|the\s+build))?|(?:this|that|it)\s+(?:is\s+(?:hypothetical|an?\s+(?:example|qa\s+case|repro|thought\s+experiment))|(?:isn't|is\s+not)\s+an?\s+(?:command|instruction|request))|(?:those|these)\s+(?:aren't|are\s+not)\s+(?:commands?|instructions?|requests?)|not\s+asking\s+you\s+to\s+(?:do|execute|start|run|launch|dispatch)\s+(?:it|this|that))(?=[.!?)]|\s*$)/i.test(textAfterCommand);
}

function hasExplicitMetaDisavowal(textAfterCommand: string): boolean {
  const referent = '(?:this|that|it|(?:the\\s+)?(?:prior|previous|preceding)\\s+(?:sentence|request)|(?:my|this|that|the)\\s+message)';
  const commandNoun = '(?:command|instruction|request)';
  return [
    new RegExp(`\\b${referent}\\s+(?:(?:is|was)(?:\\s+(?:just|merely))?\\s+(?:(?:an?\\s+)?hypothetical|an?\\s+(?:example|qa\\s+case|repro|thought\\s+experiment))|is\\s+no\\s+${commandNoun}|(?:isn't|is\\s+not|wasn't|was\\s+not)\\s+(?:meant\\s+as\\s+)?an?\\s+${commandNoun}|(?:shouldn't|should\\s+not)\\s+be\\s+treated\\s+as\\s+an?\\s+${commandNoun}|(?:doesn't|does\\s+not)\\s+authorize\\s+(?:execution|action|running|launching)|(?:doesn't|does\\s+not)\\s+(?:give|grant)\\s+you\\s+authority\\s+to\\s+(?:act|execute|start|run|launch|dispatch)|(?:shouldn't|should\\s+not)\\s+trigger\\s+(?:execution|action|running|launching))\\b`, 'i'),
    new RegExp(`\\b(?:those|these)\\s+(?:aren't|are\\s+not|weren't|were\\s+not)\\s+${commandNoun}s?\\b`, 'i'),
    new RegExp(`\\bi\\s+(?:didn't|did\\s+not)\\s+mean\\s+(?:this|that|it)\\s+as\\s+an?\\s+${commandNoun}\\b`, 'i'),
    new RegExp(`\\bi\\s+(?:never\\s+intended|didn't\\s+intend|did\\s+not\\s+intend)\\s+(?:this|that|it)\\s+as\\s+an?\\s+${commandNoun}\\b`, 'i'),
    new RegExp(`\\bi(?:'m|\\s+am)\\s+not\\s+(?:issuing|making|giving)\\s+an?\\s+${commandNoun}\\b`, 'i'),
    new RegExp(`\\b(?:do\\s+not|don't|dont)\\s+treat\\s+(?:this|that|it|(?:my|this|that|the)\\s+message)\\s+as\\s+an?\\s+${commandNoun}\\b`, 'i'),
    new RegExp(`\\b(?:this|that|my|the)\\s+message\\s+(?:must|should)\\s+not\\s+be\\s+(?:interpreted|treated|read)\\s+as\\s+an?\\s+${commandNoun}\\b`, 'i'),
    new RegExp(`\\b(?:this|that|it)(?:\\s+is|'s)\\s+(?:me\\s+)?describing\\s+an?\\s+${commandNoun}\\s*,?\\s+not\\s+issuing\\s+one\\b`, 'i'),
    new RegExp(`\\bi\\s+(?:am|was)\\s+describing\\s+an?\\s+${commandNoun}\\s*,?\\s+not\\s+issuing\\s+one\\b`, 'i'),
    /\bnothing\s+(?:in\s+)?here\s+authorizes\s+you\s+to\s+(?:act|execute|start|run|launch|dispatch)\b/i,
    /\b(?:this|that|it)(?:'s|\s+is|\s+was)\s+(?:just|merely)\s+(?:an?\s+)?hypothetical\b/i,
    /\bnot\s+asking\s+you\s+to\s+(?:do|execute|start|run|launch|dispatch)\s+(?:it|this|that)\b/i
  ].some((pattern) => pattern.test(textAfterCommand));
}

function hasDeferredExecutionProhibition(textAfterCommand: string): boolean {
  const boundary = '(?:^|[.!?;:\\n/()—–]\\s*|,\\s*|\\b(?:and|but|or)(?:\\s+then)?\\s+)';
  const action = '(?:start|run|launch|execute|dispatch|kick\\s+off|proceed|continue|build|create|make|develop|implement)';
  const gerund = '(?:starting|running|launching|executing|dispatching|proceeding|continuing|building|creating|making|developing|implementing)';
  const pastAction = '(?:started|run|launched|executed|dispatched|continued|built|created|made|developed|implemented)';
  const target = '(?:it|this|that|the\\s+(?:build|project|mission))';
  return [
    new RegExp(`${boundary}(?:(?:you|we|i|they|spark)\\s+)?(?:never|will\\s+(?:not|never)|shall\\s+not|must(?:n't|\\s+not)|should\\s+never|should\\s+not|shouldn't|won't|can't|cannot|refuse(?:s)?\\s+to|(?:are|am|is)\\s+not\\s+going\\s+to)\\s+(?:start|run|launch|execute|dispatch|kick\\s+off|proceed|continue|build|create|make|develop|implement)(?:\\s+(?:it|this|that|anything|the\\s+(?:build|project|mission)))?(?=[.!?;)\\n]|\\s*$)`, 'i'),
    new RegExp(`${boundary}(?:you|we|i|they|spark)\\s+(?:won't|will\\s+not|shall\\s+not|can't|cannot)\\s+be\\s+(?:starting|running|launching|executing|dispatching|proceeding|continuing|building|creating|developing|implementing)(?:\\s+(?:it|this|that|anything|the\\s+(?:build|project|mission)))?(?=[.!?;)\\n]|\\s*$)`, 'i'),
    new RegExp(`${boundary}there\\s+(?:are|is)\\s+no\\s+plans?\\s+to\\s+(?:start|run|launch|execute|dispatch|proceed|continue)(?:\\s+(?:it|this|that))?(?=[.!?;)\\n]|\\s*$)`, 'i'),
    new RegExp(`${boundary}(?:avoid|refrain\\s+from)\\s+(?:starting|running|launching|executing|dispatching|building|creating|developing|implementing)(?:\\s+(?:it|this|that|anything|the\\s+(?:build|project|mission)))?(?=[.!?;)\\n]|\\s*$)`, 'i'),
    new RegExp(`${boundary}(?:it|this|that|the\\s+(?:build|project|mission))\\s+(?:(?:must|may|should)\\s+(?:not|never)|mustn't|shouldn't)\\s+(?:start|run|launch|execute|dispatch|proceed|continue)\\b`, 'i'),
    new RegExp(`${boundary}(?:(?:we|you|i|they)\\s+(?:won't|can't|cannot|are\\s+not\\s+going\\s+to)|(?:no\\s+one|nobody)\\s+(?:should|can|must)(?:\\s+not)?|(?:it|this|that)\\s+(?:cannot|can't|won't))\\s+(?:start|run|launch|execute|dispatch|proceed|continue)\\b`, 'i'),
    new RegExp(`${boundary}(?:(?:do\\s+not|don't|dont)\\s+(?:allow|let)|(?:we|you|i|they)\\s+(?:will\\s+not|must(?:n't|\\s+not))\\s+allow)\\s+(?:it|this|that|the\\s+(?:build|project|mission))(?:\\s+to)?\\s+(?:start|run|launch|execute|dispatch|proceed|continue)\\b`, 'i'),
    new RegExp(`${boundary}(?:ensure|make\\s+sure)\\s+(?:it|this|that|the\\s+(?:build|project|mission))\\s+(?:does\\s+not|doesn't|cannot|never)\\s+(?:start|run|launch|execute|dispatch|proceed|continue)\\b`, 'i'),
    new RegExp(`${boundary}(?:it|this|that|the\\s+(?:build|project|mission))\\s+(?:is\\s+)?(?:forbidden|prohibited)\\s+to\\s+(?:start|run|launch|execute|dispatch|proceed|continue)\\b`, 'i'),
    new RegExp(`${boundary}under\\s+no\\s+circumstances\\s+(?:start|run|launch|execute|dispatch|proceed|continue)(?:\\s+(?:it|this|that|the\\s+(?:build|project|mission)))?\\b`, 'i'),
    new RegExp(`${boundary}(?:running|executing|launching|starting|dispatching)\\s+(?:it|this|that)\\s+is\\s+(?:forbidden|prohibited)\\b`, 'i'),
    new RegExp(`${boundary}(?:you|we|i|they|spark)(?:\\s+(?:aren't|are\\s+not|isn't|is\\s+not|am\\s+not)|'(?:re|m)\\s+not)\\s+going\\s+to\\s+${action}\\b`, 'i'),
    new RegExp(`${boundary}(?:you|we|i|they|spark)\\s+(?:have|has)\\s+no\\s+intention\\s+of\\s+${gerund}(?:\\s+${target})?\\b`, 'i'),
    new RegExp(`${boundary}${target}\\s+(?:(?:will|shall|must|may|should)\\s+(?:not|never)|won't|can't|cannot|mustn't|shouldn't)\\s+be\\s+${pastAction}\\b`, 'i'),
    new RegExp(`${boundary}${target}\\s+(?:is|was)\\s+not\\s+to\\s+be\\s+${pastAction}\\b`, 'i'),
    new RegExp(`${boundary}(?:no\\s+one|nobody)\\s+(?:may|can|should|must)\\s+${action}(?:\\s+${target})?\\b`, 'i'),
    new RegExp(`${boundary}(?:no\\s+one|nobody)\\s+(?:is|was)\\s+(?:allowed|permitted)\\s+to\\s+${action}(?:\\s+${target})?\\b`, 'i'),
    new RegExp(`${boundary}(?:(?:our|my|their)\\s+intention\\s+(?:is|was)\\s+not\\s+to|(?:we|you|i|they)\\s+intend(?:ed)?\\s+not\\s+to)\\s+${action}(?:\\s+${target})?\\b`, 'i'),
    new RegExp(`${boundary}${gerund}\\s+(?:it|this|that|the\\s+(?:build|project|mission))\\s+(?:must|should)\\s+not\\s+happen\\b`, 'i'),
    new RegExp(`${boundary}keep\\s+${target}\\s+from\\s+${gerund}\\b`, 'i'),
    new RegExp(`${boundary}${gerund}\\s+(?:it|this|that|the\\s+(?:build|project|mission))\\s+(?:is|remains)\\s+(?:expressly\\s+)?(?:not\\s+(?:allowed|permitted)|forbidden|prohibited)\\b`, 'i'),
    new RegExp(`${boundary}(?:do\\s+not|don't|dont)\\s+(?:allow|permit)\\s+${target}\\s+to\\s+be\\s+${pastAction}\\b`, 'i'),
    new RegExp(`${boundary}(?:ensure|make\\s+sure|see\\s+that)\\s+(?:(?:it|this|that|the\\s+(?:build|project|mission))\\s+(?:(?:does\\s+not|doesn't|cannot)\\s+(?:start|run|launch|execute|dispatch|proceed|continue)|never\\s+(?:starts|runs|launches|executes|dispatches|proceeds|continues))|(?:no\\s+one|nobody)\\s+(?:starts|runs|launches|executes|dispatches|proceeds|continues)(?:\\s+${target})?)\\b`, 'i'),
    new RegExp(`${boundary}${target}\\s+(?:is|was)\\s+(?:expressly\\s+)?(?:forbidden|prohibited)\\s+from\\s+${gerund}\\b`, 'i'),
    new RegExp(`${boundary}(?:(?:its|this|that|the\\s+build's)\\s+(?:execution|launch|dispatch)|(?:execution|launch|dispatch)(?:\\s+of\\s+${target})?)\\s+(?:is|remains)\\s+(?:expressly\\s+)?(?:forbidden|prohibited|not\\s+(?:allowed|permitted))\\b`, 'i'),
    new RegExp(`${boundary}${target}\\s+(?:is|was)\\s+not\\s+(?:allowed|permitted)\\s+to\\s+${action}\\b`, 'i'),
    new RegExp(`${boundary}${gerund}\\s+the\\s+(?:build|project|mission)\\s+is\\s+(?:forbidden|prohibited|not\\s+(?:allowed|permitted))\\b`, 'i')
  ].some((pattern) => pattern.test(textAfterCommand));
}

function hasTerminalExecutionProhibition(textAfterCommand: string): boolean {
  if (hasLooseTerminalClause(textAfterCommand) || hasExplicitMetaDisavowal(textAfterCommand) || hasDeferredExecutionProhibition(textAfterCommand)) return true;
  const terminalPatterns = [
    /\b(?:wait|pause|hold)\b[^.!?;\n]{0,100}\b(?:approval|permission|go[-\s]*ahead)\b[^.!?;\n]{0,80}\b(?:before\s+)?(?:start(?:ing)?|run(?:ning)?|launch(?:ing)?|execut(?:e|ing)|dispatch(?:ing)?)\b/i,
    /(?:^|[.!?;\n]\s*|,\s*)(?:actually\s+|please\s+)?(?:do\s+not|don't|dont|no\s+need\s+to)\s+(?:start|run|launch|execute|dispatch|kick\s+off)\b/i,
    /(?:^|[.!?;\n]\s*|,\s*)(?:actually\s+|please\s+)?(?:do\s+not|don't|dont|no\s+need\s+to)\s+[^.!?;\n]{0,80}\b(?:and|or)\s+(?:start|run|launch|execute|dispatch|kick\s+off|act|carry\s+(?:it|this|that)\s+out)\b/i,
    /(?:^|[.!?;\n]\s*|,\s*)(?:actually[\s,]+|please\s+)?(?:do\s+not|don't|dont|no\s+need\s+to)\s+(?:proceed|continue|go\s+ahead)\b/i,
    /(?:^|[.!?;\n]\s*|,\s*)(?:actually\s+|please\s+)?(?:do\s+not|don't|dont|no\s+need\s+to)\s+(?:build|create|make|scaffold|generate|implement|develop)\s+(?:anything|something|it|this|that|the\s+(?:build|project|mission)|a\s+(?:build|project|mission)|new\s+work)\b/i,
    /(?:^|[.!?;\n]\s*|,\s*)(?:actually[\s,]+|please\s+)?(?:stop|cancel|hold\s+off|never\s+mind|nevermind|not\s+now)\b/i,
    /(?:^|[.!?;\n]\s*|,\s*)actually[\s,]+(?:don't|dont|do\s+not)(?:[.!?]|$)/i,
    /(?:^|[.!?;\n]\s*|,\s*)(?:wait|pause)\b[^.!?;\n]{0,80}\b(?:approval|permission|(?:my\s+)?go[-\s]*ahead)\b/i,
    /(?:^|[.!?;\n]\s*|,\s*)(?:wait|pause|hold)(?:[.!?]|\s*$)/i,
    /(?:^|[.!?;\n]\s*|,\s*)(?:scratch\s+that|do\s+it\s+later|not\s+yet|not\s+now|but\s+not\s+(?:yet|now))(?:[.!?]|\s*$)/i,
    /(?:^|[.!?;\n]\s*|,\s*)(?:(?:planning|plan)\s+only|only\s+plan\b)/i,
    /(?:^|[.!?;\n]\s*|,\s*)(?:let'?s\s+plan\s+first|give\s+me\s+a\s+plan\s+first|plan\s+it\s+only|(?:prepare|draft)\s+the\s+prd\s+only|just\s+draft\s+the\s+prd)\b/i,
    /(?:^|[.!?;\n]\s*|,\s*)ask\s+me\b[^.!?;\n]{0,60}\bbefore\s+(?:start(?:ing)?|run(?:ning)?|launch(?:ing)?|execut(?:e|ing)|dispatch(?:ing)?)(?:\s+(?:it|this|that|anything|the\s+build))?\b/i,
    /(?:^|[.!?;\n]\s*|,\s*)(?:ask\s+me\s+first|confirm\s+with\s+me\s+first|get\s+approval\s+first|pending\s+my\s+approval)\b/i,
    /(?:^|[.!?;\n]\s*|,\s*)approval\s+(?:is\s+)?required\s+before\s+(?:execution|starting|launching|dispatch)\b/i,
    /(?:^|[.!?;\n]\s*|,\s*)show\s+me\s+the\s+prd\s+before\s+(?:you\s+)?start\b/i,
    /(?:^|[.!?;\n]\s*|,\s*)(?:do\s+not|don't|dont)\s+(?:queue|enqueue|send\s+it\s+to\s+spawner|touch\s+anything|act\s+on\s+(?:it|this|that))\b/i,
    /(?:^|[.!?;\n]\s*|,\s*)(?:do\s+not|don't|dont)\s+(?:act|carry\s+(?:it|this|that)\s+out)(?:[.!?]|\s*$)/i,
    /(?:^|[.!?;\n]\s*|,\s*)hold\s+(?:it|this|that)(?:[.!?]|\s*$)/i,
    /(?:^|[.!?;\n]\s*|,\s*)ask(?:\s+me)?\s+before\s+(?:doing|carrying\s+out|executing|starting|running|launching|dispatching)(?:\s+(?:it|this|that|anything|the\s+build))?(?:[.!?]|\s*$)/i,
    /(?:^|[.!?;\n]\s*|,\s*)(?:take\s+no\s+action|do\s+nothing|keep\s+(?:it|this|that)\s+in\s+chat)\b/i,
    /(?:^|[.!?;\n]\s*|,\s*)(?:this|that|it)\s+is\s+not\s+(?:a\s+)?(?:command|instruction|request)\b/i,
    /(?:^|[.!?;\n]\s*|,\s*)(?:(?:this|that|it)\s+is\s+(?:hypothetical|an?\s+(?:example|qa\s+case|repro|thought\s+experiment))|hypothetical\s+only|for\s+illustration\s+only)\b/i,
    /(?:^|[.!?;\n]\s*|,\s*)(?:those|these)\s+are\s+not\s+(?:commands?|instructions?|requests?)\b/i,
    /(?:^|[.!?;\n]\s*|,\s*)not\s+asking\s+you\s+to\s+(?:do|execute|start|run|launch|dispatch)\s+(?:it|this|that)\b/i,
    /\b(?:stay\s+in\s+chat|just\s+explain|explain\s+only|only\s+explain|we\s+can\s+talk\s+here)\b/i
  ];
  return terminalPatterns.some((pattern) => pattern.test(textAfterCommand));
}

function hasUntrustedBuildFrame(text: string): boolean {
  if (!new RegExp(`\\b${BUILD_VERB}\\b`, 'i').test(text)) return false;
  return UNTRUSTED_BUILD_FRAME_PATTERNS.some((pattern) => pattern.test(text));
}

export function resolveBuildCommandBoundary(input: string): ScopedBuildCommandResolution {
  const original = input.trim().replace(/[‘’]/g, "'");
  if (!original) {
    return { kind: 'full_turn', commandText: '', commandOffset: 0, hasExplicitBuildCommand: false };
  }
  const text = canonicalText(original);
  const commands = findBuildCommands(text);

  if (hasUntrustedBuildFrame(text)) {
    return { kind: 'blocked', commandText: null, commandOffset: null, reason: 'untrusted_frame' };
  }

  if (BROAD_PROHIBITION_PATTERNS.some((pattern) => pattern.test(text))) {
    return { kind: 'blocked', commandText: null, commandOffset: null, reason: 'broad_prohibition' };
  }

  if (commands.length > 0) {
    const firstCommand = commands[0];
    if (hasTerminalExecutionProhibition(text.slice(firstCommand.verbIndex + firstCommand.verb.length))) {
      return { kind: 'blocked', commandText: null, commandOffset: null, reason: 'terminal_prohibition' };
    }
    const positiveClause = positiveTargetClause(text, firstCommand);
    if (
      findNegatedArtifacts(text).some(
        (candidate) => candidate.start > firstCommand.verbIndex && isSameArtifactTarget(candidate.object, positiveClause)
      )
    ) {
      return { kind: 'blocked', commandText: null, commandOffset: null, reason: 'terminal_prohibition' };
    }
  }

  const negatedArtifacts = findNegatedArtifacts(text);
  for (const command of commands) {
    const precedingNegation = [...negatedArtifacts]
      .reverse()
      .find((candidate) => candidate.end < command.verbIndex);
    if (!precedingNegation) continue;
    if (!hasTrustedDirectPrefix(text, precedingNegation.start)) {
      return { kind: 'blocked', commandText: null, commandOffset: null, reason: 'untrusted_frame' };
    }
    const positiveClause = positiveTargetClause(text, command);
    if (!isDistinctArtifactReplacement(precedingNegation.object, positiveClause)) {
      return { kind: 'blocked', commandText: null, commandOffset: null, reason: 'ambiguous_same_target' };
    }
    return {
      kind: 'fresh_replacement',
      commandText: original.slice(command.verbIndex).trim(),
      commandOffset: command.verbIndex,
      negatedObject: precedingNegation.object,
      reason: 'distinct_artifact_replacement'
    };
  }

  if (
    commands.length === 0 &&
    negatedArtifacts.some((candidate) => artifactTypes(candidate.object).size > 0)
  ) {
    return { kind: 'blocked', commandText: null, commandOffset: null, reason: 'ambiguous_same_target' };
  }

  return {
    kind: 'full_turn',
    commandText: original,
    commandOffset: 0,
    hasExplicitBuildCommand: commands.length > 0
  };
}

export function isFreshScopedBuildReplacement(text: string): boolean {
  return resolveBuildCommandBoundary(text).kind === 'fresh_replacement';
}

export function stripLocalBuildReleaseBoundaries(text: string): string {
  return releaseBoundaryAnalysis(text).text;
}

export function releaseBoundaryConstraints(text: string): { noPublish: boolean; noMerge: boolean } {
  const analysis = releaseBoundaryAnalysis(text);
  return { noPublish: analysis.publication, noMerge: analysis.merge };
}

export function isLocalBuildWithPublicationBoundary(text: string): boolean {
  const resolution = resolveBuildCommandBoundary(text);
  if (resolution.kind === 'blocked') return false;
  const hasBuild = resolution.kind === 'fresh_replacement' || resolution.hasExplicitBuildCommand;
  if (!hasBuild) return false;
  return releaseBoundaryAnalysis(text).found;
}
