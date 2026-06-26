// Build-project intent parser. Catches natural-language phrasing that should
// kick off a Spawner PRD-based project flow (multi-task canvas + execution).

export interface BuildIntent {
  projectPath: string | null;
  requestedProjectPath: string | null;
  projectPathEvidenceOnly: boolean;
  projectPathRejectedReason: string | null;
  prd: string;
  projectName: string;
  buildMode: BuildMode;
  buildModeReason: string;
  buildLane: BuildLane;
  buildLaneReason: string;
}

export type BuildMode = 'direct' | 'advanced_prd';
export type BuildLane = 'fast_direct' | 'direct' | 'advanced_prd';

function defaultWorkspaceRoot(): string {
  if (process.env.SPARK_PROJECT_ROOT?.trim()) return process.env.SPARK_PROJECT_ROOT.trim();
  if (process.platform === 'win32') {
    const home = process.env.USERPROFILE || 'C:\\Users\\USER';
    return `${home.replace(/[\\/]$/, '')}\\Desktop`;
  }
  const home = process.env.HOME || '/root';
  return home.replace(/[\\/]$/, '');
}

function normalizePathForPlatform(value: string): string {
  const trimmed = value.trim().replace(/[\\/]$/, '');
  if (/^[A-Z]:[\\/]/i.test(trimmed)) {
    return trimmed.replace(/\//g, '\\');
  }
  return trimmed.replace(/\\/g, '/');
}

function workspaceRootsFor(candidate: string): string[] {
  if (process.env.SPARK_PROJECT_ROOT?.trim()) return [process.env.SPARK_PROJECT_ROOT.trim()];
  if (/^[A-Z]:[\\/]/i.test(candidate)) return ['C:\\Users\\USER\\Desktop'];
  return [defaultWorkspaceRoot()];
}

function isInsideWorkspace(candidate: string): boolean {
  const normalizedCandidate = normalizePathForPlatform(candidate).toLowerCase();
  return workspaceRootsFor(candidate).some((root) => {
    const normalizedRoot = normalizePathForPlatform(root).toLowerCase();
    return normalizedCandidate === normalizedRoot || normalizedCandidate.startsWith(`${normalizedRoot}${normalizedRoot.includes('\\') ? '\\' : '/'}`);
  });
}

function inferConceptualProjectName(prd: string): string | null {
  const lower = prd.toLowerCase();
  if (
    /\bgame\b/.test(lower) &&
    /\b(?:rec|recursive|recursive sage|spark recursive|for you|you'?d wanna play|you would want to play|would actually want to play|actually want to play)\b/.test(lower)
  ) {
    if (/\b(?:reasoning|trust|memory|contradiction|confidence|logic)\b/.test(lower)) {
      return 'Recursive Sage Reasoning Game';
    }
    return 'Recursive Sage Maze Game';
  }
  if (
    /\bspark\b/.test(lower) &&
    /\b(?:bug|bugs|diagnos|anomal|failure|failures|health|logs?|monitor|troubleshoot|issue|issues)\b/.test(lower) &&
    (/\bdomain[-\s]*chip\b/.test(lower) || /\bchip\b/.test(lower))
  ) {
    return 'Spark Bug Recognition Domain Chip';
  }
  if (
    /\bfounders?\b/.test(lower) &&
    /\b(?:strategy|strategic|operating picture)\b/.test(lower) &&
    /\b(?:notes?|memos?|document|ledger)\b/.test(lower)
  ) {
    return 'Founder Strategy Ledger';
  }
  if (/\bchess\s+game\b/.test(lower)) {
    return /\binvented\b|\boriginal\b|\bnew rules\b/.test(lower) ? 'Invented Chess Game' : 'Chess Game';
  }
  const landingPageForMatch = lower.match(/\blanding\s+page\b.*?\bfor\s+(?:a|an|the)\s+([a-z][a-z0-9 -]{1,40}?)(?=[.,:;?]|\n|\s+(?:with|that|which|where|using)\b|$)/i);
  if (landingPageForMatch) {
    return `${landingPageForMatch[1].trim()} Landing Page`
      .replace(/\b\w/g, (letter) => letter.toUpperCase());
  }
  return null;
}

function titleCaseProjectName(value: string): string {
  const acronymMap: Record<string, string> = {
    api: 'API',
    b2b: 'B2B',
    llm: 'LLM',
    prd: 'PRD',
    qa: 'QA',
    saas: 'SaaS',
    tg: 'TG',
    cua: 'CUA',
    ui: 'UI'
  };
  return value
    .replace(/[-_/]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .split(' ')
    .map((word) => {
      const acronym = acronymMap[word.toLowerCase()];
      if (acronym) return acronym;
      if (/^[A-Z0-9]{2,}$/.test(word)) return word;
      return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
    })
    .join(' ');
}

function polishInferredProjectName(value: string): string {
  const clean = value
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/[.!?]+$/, '');
  if (!clean) return clean;
  return /[A-Z]/.test(clean) ? clean : titleCaseProjectName(clean);
}

export function polishBuildProjectName(value: string): string {
  let clean = value
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/[.!?]+$/, '')
    .replace(/\bfor\s+now\b/gi, ' ')
    .replace(/\b(?:right\s+)?now\b/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  const genericSparkMatch = clean.match(/^(something|anything|app|tool|game|site|website|page|dashboard|system|board|pad)\s+(?:for\s+)?spark$/i);
  if (genericSparkMatch) {
    const noun = genericSparkMatch[1].toLowerCase() === 'something' || genericSparkMatch[1].toLowerCase() === 'anything'
      ? 'App'
      : titleCaseProjectName(genericSparkMatch[1]);
    clean = `Spark ${noun}`;
  }

  if (/^(?:something|anything)$/i.test(clean)) {
    clean = 'Spark App';
  }

  return polishInferredProjectName(clean);
}

const PRODUCT_TYPE_PATTERN = '(?:domain[-\\s]*chip|landing\\s+page|dashboard|workbench|agent|tool|app|game|system|tracker|planner|timer|clock|site|website|page|board|pad)';

const PRODUCT_PHRASE_PATTERNS = [
  new RegExp(`^(?:this\\s+)?(?:(?:a|an|the|new)\\s+)?([A-Za-z0-9][A-Za-z0-9' -]{2,90}?\\b${PRODUCT_TYPE_PATTERN})\\b(?=[.,:;?!]|\\s+(?:that|which|where|with|for|to|using|and|plan|prototype|build|only|minimal|playable)\\b|$)`, 'i'),
  new RegExp(`\\b(?:build|create|make|scaffold|ship|implement|design)\\s+(?:this\\s+)?(?:(?:a|an|the|new)\\s+)?([A-Za-z0-9][A-Za-z0-9' -]{2,90}?\\b${PRODUCT_TYPE_PATTERN})\\b(?=[.,:;?!]|\\s+(?:that|which|where|with|for|to|using|and|plan|prototype|build|only|minimal|playable)\\b|$)`, 'i'),
  new RegExp(`\\bi\\s+(?:want|need|could\\s+use|would\\s+like)\\s+(?:(?:a|an|the|new)\\s+)?([A-Za-z0-9][A-Za-z0-9' -]{2,90}?\\b${PRODUCT_TYPE_PATTERN})\\b(?=[.,:;?!]|\\s+(?:that|which|where|with|for|to|using|and|plan|prototype|build|only|minimal|playable)\\b|$)`, 'i')
];

const PRODUCT_TYPE_TAIL = new RegExp(`\\b${PRODUCT_TYPE_PATTERN}\\b$`, 'i');

function inferProductPhraseProjectName(prd: string): string | null {
  const normalized = prd.replace(/\s+/g, ' ').trim();
  const patterns = PRODUCT_PHRASE_PATTERNS;
  const genericLeadingWords = new Set([
    'a',
    'an',
    'the',
    'new',
    'private',
    'local',
    'local-first',
    'tiny',
    'small',
    'compact',
    'simple',
    'quick',
    'practical',
    'polished',
    'real',
    'full',
    'static',
    'responsive',
    'playful',
    'passive',
    'narrow',
    'another',
    'vanilla',
    'browser',
    'based'
  ]);

  for (const pattern of patterns) {
    const match = normalized.match(pattern);
    if (!match?.[1]) continue;
    let phrase = match[1].replace(/\bvanilla[-\s]*js\b/gi, '').replace(/\bbrowser[-\s]*based\b/gi, '').trim();
    let words = phrase.split(/\s+/).filter(Boolean);
    while (words.length > 1 && genericLeadingWords.has(words[0].toLowerCase())) {
      words = words.slice(1);
    }
    phrase = words.join(' ').replace(/\s+/g, ' ').trim().replace(/[.!?]+$/, '');
    const productMatch = phrase.match(PRODUCT_TYPE_TAIL);
    if (!productMatch) continue;
    const qualifier = phrase.slice(0, productMatch.index).trim();
    const meaningfulQualifier = qualifier
      .split(/\s+/)
      .filter((word) => word && !genericLeadingWords.has(word.toLowerCase()));
    if (meaningfulQualifier.length === 0) continue;
    return titleCaseProjectName(phrase);
  }

  return null;
}

function inferForAudienceProductName(prd: string): string | null {
  const normalized = prd.replace(/\s+/g, ' ').trim();
  const match = normalized.match(
    /^(?:a\s+|an\s+|the\s+)?(platform|system|dashboard|tool|app|board)\s+for\s+(?:managing\s+|tracking\s+|organizing\s+|running\s+)?([A-Za-z][A-Za-z0-9 -]{2,40}?)(?=\s+(?:with|that|which|where|using|and)\b|[.,:;?!]|$)/i
  );
  if (!match) return null;

  const product = match[1].toLowerCase();
  let audience = match[2]
    .replace(/\b(?:users?|people|teams?|things?|stuff)\b/gi, '')
    .replace(/\s+/g, ' ')
    .trim();
  if (!audience) return null;
  if (/^agents?$/i.test(audience)) audience = 'Agent';
  else audience = titleCaseProjectName(audience.replace(/s$/i, ''));
  return titleCaseProjectName(`${audience} ${product}`);
}

function inferDashboardPurposeName(prd: string): string | null {
  const normalized = prd.replace(/\s+/g, ' ').trim();
  const match = normalized.match(
    /^(?:(?:build|create|make|ship|scaffold|generate|develop)\s+)?(?:this\s+)?(?:(?:a|an|the|new|tiny|small|quick|simple)\s+)*(dashboard)\s+for\s+([A-Za-z][A-Za-z0-9 -]{2,60}?)(?=[.,:;?!]|\s+(?:with|that|which|where|using|and)\b|$)/i
  );
  if (!match) return null;
  const purpose = match[2]
    .replace(/\b(?:users?|people|teams?|things?|stuff)\b/gi, '')
    .replace(/\s+/g, ' ')
    .trim();
  if (!purpose) return null;
  return titleCaseProjectName(`${purpose} ${match[1].toLowerCase()}`);
}

function inferGamePrototypeName(prd: string): string | null {
  const normalized = prd.replace(/\s+/g, ' ').trim();
  const match = normalized.match(
    /\b((?:(?:tiny|small|quick|minimal|simple)\s+)?[A-Za-z0-9][A-Za-z0-9' -]{1,50}?\bgame)\s+(?:plan\s+and\s+build|plan|prototype|minimal\s+playable\s+prototype)\b/i
  );
  if (!match?.[1]) return null;
  const title = match[1].replace(/\s+/g, ' ').trim();
  const qualifier = title.replace(/\bgame\b/i, '').replace(/\b(?:tiny|small|quick|minimal|simple)\b/gi, '').trim();
  if (!qualifier) return null;
  return titleCaseProjectName(title);
}

function inferQuotedHeadingProjectName(prd: string): string | null {
  const headingMatch = prd.match(
    /\b(?:big\s+|large\s+|hero\s+)?(?:heading|headline|title|h1)\b(?:\s+(?:that\s+)?(?:says|reads|called|named))?\s*[:\-]?\s*["']([^"']{3,80})["']/i
  );
  if (!headingMatch) return null;
  return headingMatch[1]
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/[.!?]+$/, '');
}

function inferExplicitProjectName(prd: string): string | null {
  const projectNamedMatch = prd.match(
    /\b(?:project|app|site|dashboard|tool|board|page|game)\s+(?:called|named)\s+([A-Za-z0-9][A-Za-z0-9 _.-]{2,80}?)(?=[.,;?!]|\s+(?:that|which|where|with|for|using|and|to)\b|$)/i
  );
  if (projectNamedMatch?.[1]) {
    return polishInferredProjectName(projectNamedMatch[1]);
  }

  const quotedNameMatch = prd.match(
    /\b(?:called|named)\s+["']([^"']{3,80})["']/i
  );
  if (quotedNameMatch?.[1]) {
    return quotedNameMatch[1]
      .replace(/\s+/g, ' ')
      .trim()
      .replace(/[.!?]+$/, '');
  }

  const routePrefaceMatch = prd.match(
    /^(?:through|via|using|with)\s+(?:spawner(?:\s+ui)?|mission\s+control|spawner\s+mission\s+control|spawner\/mission\s+control)[^:\n]{0,80}:\s*([A-Za-z0-9][A-Za-z0-9 '&.-]{2,80}?)(?=[.,;?!]|\s+(?:make|build|create|ship|scaffold|generate|with|that|which|where|for|using|include)\b|$)/i
  );
  if (routePrefaceMatch?.[1]) {
    return polishInferredProjectName(routePrefaceMatch[1]);
  }

  return null;
}

function inferProjectName(prd: string, projectPath: string | null): string {
  const explicitName = inferExplicitProjectName(prd);
  if (explicitName) return explicitName;
  const nameMatch = prd.match(/\bcalled\s+([A-Z][\w\s:.-]{2,80}?)(?=[.,;?]|\n|\s+(?:with|that|which|where|for|using)\b|\s+and\s+(?:make|build|create|ship|scaffold|generate)\b|$)/i);
  if (nameMatch) return polishInferredProjectName(nameMatch[1].replace(/\s*[:;,-]\s*$/, ''));
  const shippedProjectMatch = prd.match(/\bexisting shipped project\s+["']([^"']{3,80})["']/i);
  if (shippedProjectMatch) return polishInferredProjectName(shippedProjectMatch[1]);
  const quotedProjectMatch = prd.match(/\b(?:project|app|site|dashboard|tool|board)\s+["']([^"']{3,80})["']/i);
  if (quotedProjectMatch) return polishInferredProjectName(quotedProjectMatch[1]);
  if (projectPath) {
    const pathName = projectPath.split(/[\\/]/).filter(Boolean).pop();
    if (pathName) return projectNameFromPathSegment(pathName);
  }
  const atMatch = prd.match(/(?:at|in)\s+(?:[A-Z]:[\\/]|\/)[\w\\/:\-. ]+[\\/]([\w.-]+)/);
  if (atMatch) return polishInferredProjectName(atMatch[1].replace(/[-_]/g, ' '));
  const quotedHeadingName = inferQuotedHeadingProjectName(prd);
  if (quotedHeadingName) return quotedHeadingName;
  const conceptualName = inferConceptualProjectName(prd);
  if (conceptualName) return conceptualName;
  const audienceProductName = inferForAudienceProductName(prd);
  if (audienceProductName) return audienceProductName;
  const dashboardPurposeName = inferDashboardPurposeName(prd);
  if (dashboardPurposeName) return dashboardPurposeName;
  const gamePrototypeName = inferGamePrototypeName(prd);
  if (gamePrototypeName) return gamePrototypeName;
  const productPhraseName = inferProductPhraseProjectName(prd);
  if (productPhraseName) return productPhraseName;
  const firstWords = prd.split(/\s+/).slice(0, 6).join(' ');
  return polishInferredProjectName(firstWords.slice(0, 60)) || 'Untitled Project';
}

function projectNameFromPathSegment(pathName: string): string {
  const clean = pathName.replace(/[-_]/g, ' ').trim();
  const missionMatch = clean.match(/^mission\s+\d+\s+(.+)$/i);
  if (!missionMatch) return polishInferredProjectName(clean);
  return titleCaseProjectName(missionMatch[1]);
}

function cleanExtractedPath(value: string): string {
  const sentenceBoundary = value.search(
    /\.(?:\s+)(?=(?:Create|Include|Do|Only|Files?|Use|No|Make|Build|Then|Also)\b)/i
  );
  const bounded = sentenceBoundary >= 0 ? value.slice(0, sentenceBoundary) : value;
  return normalizePathForPlatform(
    bounded
      .trim()
      .replace(/^`|`$/g, '')
      .replace(/[).,;:]+$/g, '')
  );
}

function extractPathCandidate(text: string): string | null {
  const atMatch = text.match(
    /(?:at|in|into)\s+((?:[A-Z]:[\\/]|\/).+?)(?=$|\r?\n|:\s|[,;]\s|\.\s+(?:Create|Include|Do|Only|Files?|Use|No|Make|Build|Then|Also)\b|\s+Files?\b)/i
  );
  return atMatch ? cleanExtractedPath(atMatch[1]) : null;
}

function extractPathEvidence(text: string): {
  projectPath: string | null;
  requestedProjectPath: string | null;
  projectPathEvidenceOnly: boolean;
  projectPathRejectedReason: string | null;
} {
  const requestedProjectPath = extractPathCandidate(text);
  if (!requestedProjectPath) {
    return {
      projectPath: null,
      requestedProjectPath: null,
      projectPathEvidenceOnly: false,
      projectPathRejectedReason: null
    };
  }
  if (isInsideWorkspace(requestedProjectPath)) {
    return {
      projectPath: requestedProjectPath,
      requestedProjectPath,
      projectPathEvidenceOnly: false,
      projectPathRejectedReason: null
    };
  }
  return {
    projectPath: null,
    requestedProjectPath,
    projectPathEvidenceOnly: true,
    projectPathRejectedReason: 'outside_configured_workspace_root'
  };
}

function removeLeadingPathPrefix(text: string): string {
  return text
    .replace(/^(?:at|in|into)\s+(?:[A-Z]:[\\/]|\/)[^\n]*?:\s*/i, '')
    .replace(/\s+(?:at|in|into)\s+(?:[A-Z]:[\\/]|\/)[^\n]*?:\s*/i, ' ')
    .trim();
}

function inferBuildMode(text: string, prd: string, projectPath: string | null): { mode: BuildMode; reason: string } {
  const lower = text.toLowerCase();

  if (/\b(?:use\s+)?advanced\s+prd\s+mode\b/.test(lower)) {
    return {
      mode: 'advanced_prd',
      reason: 'User explicitly requested advanced PRD mode.'
    };
  }

  if (/\b(?:use\s+)?direct\s+(?:build\s+)?mode\b/.test(lower)) {
    return {
      mode: 'direct',
      reason: 'User explicitly requested direct build mode.'
    };
  }

  if (/\b(?:quick|simple|direct|no\s+prd|skip\s+prd|just\s+build)\b/.test(lower)) {
    return {
      mode: 'direct',
      reason: 'User asked for a quick/direct build path.'
    };
  }

  if (isConstrainedStaticSingleFileBuild(text)) {
    return {
      mode: 'direct',
      reason: 'User asked for a constrained one-file static HTML build.'
    };
  }

  if (/\b(?:prd|tas|task acceptance|acceptance criteria|domain\s*chip|mission control|new project|real project|complete project|from scratch|full app|platform|system)\b/.test(lower)) {
    return {
      mode: 'advanced_prd',
      reason: 'Request looks like a new project or systematic feature that benefits from PRD-to-task planning.'
    };
  }

  const requestedFiles = (text.match(/\b[\w.-]+\.(?:html|css|js|ts|tsx|jsx|json|md|py|svelte|vue|go|rs)\b/gi) || []).length;
  const featureWords = (text.match(/\b(?:shows?|supports?|persists?|updates?|editable|animated|dashboard|form|localstorage|api|auth|database|deploy|integrat(?:e|ion))\b/gi) || []).length;

  if (prd.length > 520 && /\b(?:founders?|strategy|workflow|system|dashboard|platform|tool|product)\b/.test(lower)) {
    return {
      mode: 'advanced_prd',
      reason: 'Long conceptual product brief benefits from PRD-to-task planning.'
    };
  }

  if (projectPath && (prd.length > 260 || requestedFiles >= 4 || featureWords >= 5)) {
    return {
      mode: 'advanced_prd',
      reason: 'Project has enough scope to plan before execution.'
    };
  }

  return {
    mode: 'direct',
    reason: 'Small explicit build request; direct execution is enough.'
  };
}

function inferBuildLane(
  text: string,
  prd: string,
  projectPath: string | null,
  buildMode: BuildMode
): { lane: BuildLane; reason: string } {
  const lower = `${text}\n${prd}`.toLowerCase();
  if (buildMode === 'advanced_prd') {
    return {
      lane: 'advanced_prd',
      reason: 'Advanced PRD lane selected because the request benefits from task planning before execution.'
    };
  }

  const explicitFast = /\b(?:fast\s+lane|fast\s+build|quick\s+build|quickly|finish\s+fast|tiny|small|one[-\s]*screen|single[-\s]*screen|smoke\s+(?:page|test|check|app)|one[-\s]*file|single[-\s]*file)\b/.test(lower);
  const staticSurface = /\b(?:static|vanilla[-\s]*js|html|css|javascript|no\s+build\s+step|page|landing\s+page)\b/.test(lower);
  const canvasBuildScope = /\b(?:game|browser\s+game|canvas|sprite|paddle|score|timer|levels?|enemy|player|physics|collision|animation|keyboard|mouse|touch)\b/.test(lower);
  const heavyScope = canvasBuildScope || /\b(?:advanced\s+prd|prd|platform|system|mission\s+control|kanban|canvas|auth|oauth|login|database|backend|api|integration|multi[-\s]*tenant|payments?|stripe|deploy|production|real[-\s]*time|websocket|mobile\s+app|desktop\s+app)\b/.test(lower);
  const featureWords = (lower.match(/\b(?:filters?|charts?|dashboard|analytics|localstorage|persistence|editor|roles?|workflow|alerts?|calendar|export|import|collaboration|admin)\b/g) || []).length;
  const requestedFiles = (lower.match(/\b[\w.-]+\.(?:html|css|js|ts|tsx|jsx|json|md|py|svelte|vue|go|rs)\b/g) || []).length;

  if (!heavyScope && (isConstrainedStaticSingleFileBuild(text) || (explicitFast && (staticSurface || featureWords <= 3) && requestedFiles <= 4))) {
    return {
      lane: 'fast_direct',
      reason: 'Tiny or smoke-test build; use lightweight planning and avoid the full PRD canvas pass.'
    };
  }

  if (projectPath && requestedFiles >= 4 && featureWords >= 4) {
    return {
      lane: 'direct',
      reason: 'Direct build lane selected: concrete files and enough feature scope for the normal canvas handoff.'
    };
  }

  return {
    lane: 'direct',
    reason: canvasBuildScope
      ? 'Direct build lane selected: keep the normal PRD/canvas handoff for interactive builds.'
      : 'Direct build lane selected: small explicit build with normal planning depth.'
  };
}

function isConstrainedStaticSingleFileBuild(text: string): boolean {
  const lower = text.toLowerCase();
  const namesIndex = /\bindex\.html\b/.test(lower);
  const oneFileOnly = /\b(?:one|single)[-\s]?file\s+only\b|\bonly\s+(?:one|a\s+single)\s+file\b/.test(lower);
  const staticHtmlOnly = /\bstatic\s+html\s+only\b|\bkeep\s+it\s+as\s+static\s+html\b|\bstatic\s+file\s+only\b/.test(lower);
  const noPackage = /\bdo\s+not\s+add\s+package\b|\bno\s+package(?:\.json| files?)?\b/.test(lower);
  const forbidsFullApp = /\bdo\s+not\s+(?:make|build|create)\s+(?:a\s+)?full\s+app\b|\bdon't\s+(?:make|build|create)\s+(?:a\s+)?full\s+app\b/.test(lower);
  return namesIndex && (oneFileOnly || forbidsFullApp || (staticHtmlOnly && noPackage));
}

function normalizeBuildCommandText(text: string): string {
  return text
    .replace(/^\s*(?:(?:hey|hi|hello|yo|ok|okay)\s+)?spark[,!.]?\s*/i, '')
    .replace(/^\s*(?:use\s+)?advanced\s+prd\s+mode\.?\s*/i, '')
    .replace(/^\s*(?:use\s+)?direct\s+(?:build\s+)?mode\.?\s*/i, '')
    .trim();
}

function isBuildIdeationRequest(text: string): boolean {
  const normalized = text.toLowerCase().replace(/\s+/g, ' ').trim();
  return (
    /\b(?:give|show|list|suggest|brainstorm|recommend|rank)\s+(?:me\s+|us\s+)?(?:\w+\s+){0,4}(?:build|project|app|dashboard)\s+(?:ideas?|directions?|concepts?|options?)\b/.test(normalized) ||
    /\b(?:give|show|list|suggest|brainstorm|recommend|rank|tell)\s+(?:me\s+|us\s+)?(?:the\s+)?(?:top\s+\d+\s+)?(?:\w+\s+){0,4}(?:ideas?|ways?|tips?|advice|recommendations?|playbooks?|frameworks?)\b.{0,80}\b(?:how\s+to\s+)?(?:build|building|create|creating|make|making|ship|shipping|launch|launching|start|starting)\b/.test(normalized) ||
    /^(?:how\s+to|what(?:'s| is)\s+the\s+(?:best|right|better)\s+way\s+to)\s+(?:build|create|make|ship|launch|start)\b/.test(normalized)
  );
}

function isBuildContextRecallProbe(text: string): boolean {
  const normalized = text.toLowerCase().replace(/\s+/g, ' ').trim();
  return (
    /\bwhat\s+(?:were|was)\s+(?:we|i|you)\s+(?:going\s+to|gonna|planning\s+to|supposed\s+to)\s+(?:build|make|create)\b/.test(normalized) ||
    /\b(?:do\s+you\s+)?remember\b.*\bwhat\b.*\b(?:we|i|you)\s+(?:were\s+)?(?:going\s+to|gonna|planning\s+to|supposed\s+to)?\s*(?:build|make|create)\b/.test(normalized) ||
    /\bwe\s+were\s+(?:going\s+to|gonna|planning\s+to|supposed\s+to)\s+(?:build|make|create)\b.*\b(?:remember|what\s+it\s+was)\b/.test(normalized)
  );
}

function isPreBuildShapingRequest(text: string): boolean {
  const normalized = text.toLowerCase().replace(/\s+/g, ' ').trim();
  return (
    (
      /\b(?:help\s+me\s+)?(?:shape|scope|brainstorm|think\s+through|plan|design)\b/.test(normalized) &&
      /\b(?:before|prior\s+to)\s+(?:creating|building|making|scaffolding|generating|starting)\b/.test(normalized)
    ) ||
    /\b(?:before|prior\s+to)\b.{0,100}\b(?:can|should|could|would)\s+(?:build|create|make|scaffold|generate|start|run|launch|execute)\b.{0,120}\b(?:what\s+(?:would|should|does)|how\s+(?:would|should|does)|harness|proof|evidence|checks?)\b/.test(normalized)
  );
}

function isBuildRouteMetaDiscussion(text: string): boolean {
  const normalized = text.toLowerCase().replace(/\s+/g, ' ').trim();
  if (
    /^(?:build|create|make|scaffold|generate)\s+(?:a|an|the|this|new|tiny|small|compact|practical|private|local)\b/.test(normalized) &&
    /\b(?:project|app|website|dashboard|tool|game|canvas|kanban|workflow|product|prototype|platform|board|pad|page)\b/.test(normalized)
  ) {
    return false;
  }
  if (
    /\b(?:route\s+explanation|fix\s+notes?|bug|regression|trace|logs?|repro|prior\s+reply|last\s+reply|mission\s+log|selectedintent|route=)\b/.test(normalized) &&
    /\b(?:build|make|create|ship|scaffold|generate|develop)\b/.test(normalized) &&
    /\b(?:authority|authorize|authorized|fresh\s+intent|what\s+failed|why|classify|diagnos(?:e|is|tic)|owner\s+layer|expected\s+chat[-\s]*only|boundary|not\s+approving|candidate\s+evidence|execution\s+authority|no[-\s]*op)\b/.test(normalized)
  ) {
    return true;
  }
  if (
    /\b(?:does\s+that\s+authorize|is\s+that\s+enough\s+authority|not\s+enough\s+authority|not\s+approving)\b/.test(normalized) &&
    /\b(?:build|make|create|ship|scaffold|generate|develop)\b/.test(normalized)
  ) {
    return true;
  }
  if (
    /\b(?:what|which|anything|something|thing|else|other|first\s+major\s+focus)\b.*\b(?:healthy|useful|good|better|worth|nice)?\s*(?:to\s+)?build(?:ing)?\b/.test(normalized) &&
    /\b(?:updates?|upgrades?|self[-\s]*updates?|ledger|systems?|spark|capabilit(?:y|ies)|improvements?)\b/.test(normalized)
  ) {
    return true;
  }
  if (
    /\b(?:is|are)\s+there\b.*\b(?:thing|anything|something|else|other)\b.*\b(?:build|building)\b/.test(normalized) &&
    /\b(?:updates?|upgrades?|self[-\s]*updates?|ledger|systems?|spark|capabilit(?:y|ies)|improvements?)\b/.test(normalized)
  ) {
    return true;
  }
  if (
    /\b(?:what|which|how|why|is|are|do|does|can|could|should|would)\b.*\b(?:build|building)\b.*\b(?:updates?|upgrades?|self[-\s]*updates?|ledger|systems?|spark|capabilit(?:y|ies)|improvements?)\b/.test(normalized) &&
    !/\b(?:build|create|make|ship|scaffold|generate|develop)\s+(?:a|an|the|new|this)\s+[^?.!]{0,80}\b(?:app|dashboard|tool|site|website|page|game|system|tracker|planner|timer|clock)\b/.test(normalized)
  ) {
    return true;
  }
  if (
    /\b(?:where|how)\s+(?:and\s+how\s+)?(?:did|do|does|would|should)\s+(?:you|we|it)\s+(?:make|made|apply|change|update|edit|adjust)\b/.test(normalized) &&
    /\b(?:exact\s+changes?|changes?|route|decision|classification|correction|memory|state|logic)\b/.test(normalized)
  ) {
    return true;
  }
  if (
    /\b(?:what|which)\s+(?:exact\s+)?changes\b/.test(normalized) &&
    /\b(?:did|do|does|would|should)\s+(?:you|we|it)\s+(?:make|apply|change|update|edit|adjust)\b/.test(normalized)
  ) {
    return true;
  }
  if (
    /\b(?:what|which)\s+(?:part|step|layer|file|rule|branch|route|path|code|state|memory|logic)\b/.test(normalized) &&
    /\b(?:did|do|does|would|should)\s+(?:you|we|it)\s+(?:change|update|touch|use|hit|reach)\b/.test(normalized)
  ) {
    return true;
  }
  if (
    /^(?:what|which|how|why|is|are|do|does|can|could|should|would)\b/.test(normalized) &&
    /\b(?:test|tests|testing|edge\s+cases?|qa|bug(?:s)?|improve|improving|better)\b/.test(normalized) &&
    /\b(?:spawner|mission\s+control|mission\s+loop|route|workflow|telegram|relay)\b/.test(normalized)
  ) {
    return true;
  }
  if (
    /\b(?:h70\s+)?skills?\b.*\bmandatory\b/.test(normalized) &&
    /\b(?:normal\s+)?prompts?\b.*\b(?:operate|work)\b/.test(normalized)
  ) {
    return true;
  }
  if (
    /\b(?:words?|keywords?|terms?|phrases?)\s+(?:like|such\s+as)\b/.test(normalized) &&
    /\b(?:build|access|sandbox|workspace|docker|route|hijack)\b/.test(normalized)
  ) {
    return true;
  }
  if (
    /\b(?:mentioning|saying|using|writing|typing)\b.{0,40}\b(?:build|make|create|ship|scaffold|generate|develop)\b/.test(normalized) &&
    /\b(?:does\s+not|doesn't|doesnt|is\s+not|isn't|isnt)\s+mean\b/.test(normalized)
  ) {
    return true;
  }
  if (/\bhijack(?:s|ed|ing)?\b/.test(normalized) && /\b(?:build|access|route|deterministic)\b/.test(normalized)) {
    return true;
  }
  if (/^(?:how\s+)?(?:can|could|should|would)\s+(?:we|you)\s+make\s+sure\b/.test(normalized)) {
    return true;
  }
  if (/^keep\s+it\s+simple\b.*\bmake\s+sure\b/.test(normalized)) {
    return true;
  }
  if (/^(?:is|are)\s+this\s+the\s+(?:best|right|safe|secure)\s+way\s+to\s+(?:build|make|create|install|setup|set\s+up)\b/.test(normalized)) {
    return true;
  }
  if (
    /^(?:how\s+)?(?:should|would|could|can)\s+(?:we|you|the\s+agent|spark|[\w\s,]+)\b/.test(normalized) &&
    /\b(?:aoc|agent\s+operating\s+context|design|access|sandbox(?:es|ed)?|workspace|docker|ssh|modal|route|hijack|deterministic)\b/.test(normalized) &&
    /\b(?:fit\s+into|work|show|handle|cover|prevent|avoid|hijack|design)\b/.test(normalized)
  ) {
    return true;
  }
  return false;
}

function isExactReplyNoFileProbe(text: string): boolean {
  const normalized = text.toLowerCase().replace(/\s+/g, ' ').trim();
  return (
    /\breply exactly\b/.test(normalized) &&
    /\b(?:do not|don't)\s+(?:creat(?:e|ing)\s+files?|build\s+anything)\b|\bwithout\s+creat(?:e|ing)\s+files?\b|\bno\s+files?\b/.test(normalized)
  );
}

function isFilesystemOperationProbe(text: string): boolean {
  const normalized = text.toLowerCase().replace(/\s+/g, ' ').trim();
  if (
    /\b(?:smoke\s+test|safe\s+test|probe|check)\b/.test(normalized) &&
    /\b(?:create|write|read|delete|remove|list|exists?)\b/.test(normalized) &&
    /\b(?:file|folder|directory|path)\b/.test(normalized) &&
    /\b(?:do\s+not|don't|dont)\s+(?:touch|open|read|modify|change)\b/.test(normalized)
  ) {
    return true;
  }
  if (
    /\bcheck\s+whether\b/.test(normalized) &&
    /\b(?:exists?|list)\b/.test(normalized) &&
    /\b(?:do\s+not|don't|dont)\s+(?:open|read|touch)\b/.test(normalized)
  ) {
    return true;
  }
  if (
    /\bcreate\s+a\s+(?:tiny|small|test|temporary)\s+file\b/.test(normalized) &&
    /\bwrite\b.*\bread\b.*\b(?:delete|remove)\b/.test(normalized)
  ) {
    return true;
  }
  return false;
}

function isNoExecutionBoundary(text: string): boolean {
  const normalized = text.trim().toLowerCase().replace(/\s+/g, ' ');
  if (!normalized) return false;
  return [
    /\bno\s+(?:build|mission|execution|new\s+work)(?:\s+or\s+(?:build|mission|execution|new\s+work))*\s+for\s+now\b/,
    /\bno\s+(?:build|mission|execution|new\s+work)\s+for\s+now\b/,
    /\b(?:do not|don't|dont|please don't|please dont|no need to)\s+(?:start|run|launch|execute|ship|kick\s+off)\b/,
    /\b(?:do not|don't|dont|please don't|please dont|no need to)\s+(?:build|create|make)\s+(?:yet|for\s+now|anything|something|new\s+work|a\s+mission|a\s+build|a\s+project|a\s+domain[-\s]*chip|a\s+chip|the\s+mission|the\s+build|the\s+project|the\s+domain[-\s]*chip|the\s+chip|it|this|that)\b/,
    /\b(?:do not|don't|dont|please don't|please dont)\s+(?:start|run|launch|execute|kick\s+off)\s+(?:anything|something|new\s+work|work|tasks?|missions?|builds?)(?:\s+new)?\b/,
    /\b(?:do not|don't|dont|please don't|please dont)\s+(?:start|run|launch|execute)\s+(?:(?:a|another)\s+)?(?:mission|build|project)\b/,
    /\b(?:no need|not needed|not now|not for now|maybe later|hold off|never mind|nevermind)\b/,
    // pause/cancel/stop are decline verbs only when they appear as command-like
    // clauses, not as product copy ("shows the text pause route proof passed").
    /(?:^|[.!?]\s+|,\s+)(?:actually[, ]+|please[, ]+|just\s+)?(?:pause|cancel|stop)\b(?!\s*(?:[,/&]\s*)?(?:(?:and|or)\s+)?(?:reset|resume|restart|start|play|buttons?|controls?|keys?|toggles?|icons?|timers?)\b)/,
    /\b(?:mentioning|saying|using|writing|typing)\b.{0,40}\b(?:build|make|create|ship|scaffold|generate|develop)\b.{0,40}\b(?:does\s+not|doesn't|doesnt|is\s+not|isn't|isnt)\s+mean\b/,
    /\b(?:build|make|create|ship|scaffold|generate|develop)\b.{0,100}\b(?:keyword|keywords|word here|words here|word alone|words alone|phrase|phrases|term|terms|quoted text|quoted bug[-\s]*report term|bug\s+report|qa\s+case|meta[-\s]*language|not a request|not an instruction|not a command|not asking for|does\s+not\s+mean|doesn't\s+mean|not\s+mean)\b/,
    /\b(?:keyword|keywords|word here|words here|word alone|words alone|phrase|phrases|term|terms|quoted text|quoted bug[-\s]*report term|bug\s+report|qa\s+case|meta[-\s]*language|not a request|not an instruction|not a command|not asking for|does\s+not\s+mean|doesn't\s+mean|not\s+mean)\b.{0,100}\b(?:build|make|create|ship|scaffold|generate|develop)\b/,
    /\b(?:route\s+explanation|fix\s+notes?|bug|regression|trace|logs?|repro|prior\s+reply|last\s+reply|mission\s+log|selectedintent|route=)\b.{0,140}\b(?:build|make|create|ship|scaffold|generate|develop)\b.{0,140}\b(?:authority|authorize|authorized|fresh\s+intent|what\s+failed|why|classify|diagnos(?:e|is|tic)|owner\s+layer|expected\s+chat[-\s]*only|boundary|not\s+approving|candidate\s+evidence|execution\s+authority|no[-\s]*op)\b/,
    /\b(?:stay in chat|just explain|explain the boundary|explain the failure class)\b/,
    /\b(?:we can|we should|let'?s|lets|just)\s+(?:talk|chat|discuss)(?:\s+(?:here|for now|instead))?\b/
  ].some((pattern) => pattern.test(normalized));
}

function isConversationFramingMakeRequest(description: string): boolean {
  return /^(?:today|tonight|now|chat|conversation|session|thread|this\s+(?:chat|conversation|session|thread)|our\s+(?:chat|conversation|session|thread))\s+(?:also\s+)?(?:about|focused\s+on|for)\b/i.test(
    description.trim()
  );
}

function isVoiceTuningMakeRequest(description: string): boolean {
  const normalized = description.replace(/\s+/g, ' ').trim().toLowerCase();
  if (!normalized) return false;
  const productArtifact = /\b(?:app|application|dashboard|website|site|page|game|tool|player|recorder|studio|interface|board)\b/.test(normalized);
  if (productArtifact) return false;
  return (
    /\b(?:voice|speech|audio|sound|tone|style|persona|reply|responses?)\b/.test(normalized) &&
    /\b(?:clearer|clear|warmer|colder|faster|slower|louder|softer|better|geek(?:y|ier)|friendlier|crisper|natural|human|concise|verbose)\b/.test(normalized)
  );
}

function isSparkCapabilityMakeRequest(description: string): boolean {
  const normalized = description.replace(/\s+/g, ' ').trim();
  const lowered = normalized.toLowerCase();
  const productArtifact =
    /^(?:a\s+|an\s+|the\s+)?(?:web\s+|mobile\s+|desktop\s+|local-first\s+|private\s+|static\s+|tiny\s+|simple\s+|internal\s+|spark\s+memory\s+|spark\s+)*(?:app|application|dashboard|website|site|landing\s+page|page|game|panel|portal|viewer|tracker|manager|workspace|board)\b/i.test(normalized) ||
    /^(?:a\s+|an\s+|the\s+)?spark\s+[a-z0-9 -]{0,50}\b(?:app|application|dashboard|website|site|landing\s+page|page|game|panel|portal|viewer|tracker|manager|workspace|board)\b/i.test(normalized);
  const explicitSparkOwner =
    /^(?:(?:my|our)\s+)?spark\b|^(?:you|your|yourself|the\s+agent|my\s+agent|our\s+agent|agents?)\b/i.test(normalized);
  const capabilitySurface =
    /\b(?:capabilit(?:y|ies)|functionality|abilit(?:y|ies)|skills?|integrations?|access|permissions?|tools?|routes?|systems?|brain|memory|memories|reports?|daily\s+reports?|email|emails|gmail|calendar|inbox|voice|speech|notifications?|reminders?|workflow|workflows?|browser|browse|files?|filesystem)\b/i.test(normalized);
  const sparkRecipient =
    /\b(?:for|to)\s+(?:you|yourself|my\s+spark|our\s+spark|the\s+agent|my\s+agent|our\s+agent)\b/i.test(normalized) ||
    /\bfor\s+spark\s*(?::|,|\b(?:to|so|that)\b)/i.test(normalized) ||
    /\bto\s+spark\s*(?::|,|$)/i.test(normalized) ||
    /\b(?:so|that)\s+(?:you|spark|my\s+spark|our\s+spark|the\s+agent|my\s+agent|our\s+agent)\s+can\b/i.test(normalized) ||
    /\b(?:lets?|allow(?:s)?|enable(?:s)?)\s+(?:you|spark|my\s+spark|our\s+spark|the\s+agent|my\s+agent|our\s+agent)\s+(?:to\s+)?\b/i.test(normalized) ||
    /\b(?:make|making)\s+(?:you|spark|my\s+spark|our\s+spark|the\s+agent|my\s+agent|our\s+agent)\s+(?:able\s+to|capable\s+of)\b/i.test(normalized);
  const capabilityObject =
    /\b(?:capabilit(?:y|ies)|functionality|abilit(?:y|ies)|skills?|integrations?|access|permissions?)\b/i.test(normalized);
  const accessPolicyDiscussion =
    /^(?:spark\s+)?access\s+level\s*[1-5]\b/i.test(normalized) &&
    /\b(?:sandbox(?:es|ed)?|whole[-\s]*computer|operator|permission|access|capabilit(?:y|ies)|state\s+machine)\b/i.test(normalized);
  const directMemoryReportChange =
    /^(?:memory\s+reports?|memories\s+reports?|reports?\s+of\s+(?:my\s+)?memories?)\b/i.test(normalized) ||
    (/^daily\s+reports?\b/i.test(normalized) && /\bmemories?\b/i.test(normalized));
  if (accessPolicyDiscussion) return true;
  if (directMemoryReportChange) return true;
  if (sparkRecipient && capabilitySurface) return true;
  return explicitSparkOwner && capabilitySurface && (!productArtifact || lowered.includes('so you can') || lowered.includes('so spark can'));
}

function isNegatedBuildCommandPrefix(prefix: string): boolean {
  return /(?:^|\b)(?:do\s+not|don't|dont|never|without)\s+$/i.test(prefix);
}

function isAmbiguousContextualBuildRequest(text: string, projectPath: string | null, prd: string): boolean {
  if (projectPath) return false;
  const normalized = text.replace(/\s+/g, ' ').trim();
  if (!/\b(?:build|make|create|ship|scaffold|generate|develop|improve|polish|update|fix|adjust|tweak|refine|rework|redesign)\s+(?:this|that|it)\b/i.test(normalized)) {
    return false;
  }
  const concreteStandaloneBrief =
    prd.length >= 80 &&
    /^(?:a\s+|an\s+|the\s+)?(?:narrow\s+|private\s+|local-first\s+|tiny\s+|simple\s+|internal\s+|real\s+|polished\s+|full\s+)*(?:tool|app|application|dashboard|website|site|landing\s+page|page|game|panel|portal|viewer|tracker|manager|workspace|board)\b/i.test(prd.trim());
  const namedProductPhrase = inferProductPhraseProjectName(prd) !== null;
  if (concreteStandaloneBrief || namedProductPhrase) {
    return false;
  }
  if (/\b(?:called|named)\s+[A-Z0-9][A-Za-z0-9 '&.-]{2,80}\b/i.test(normalized)) {
    return false;
  }
  if (/\b(?:at|in|into)\s+(?:[A-Z]:[\\/]|\/)/i.test(normalized)) {
    return false;
  }
  return true;
}

function isConversationalStrategyStructureRequest(text: string, prd: string): boolean {
  const normalized = text.toLowerCase().replace(/\s+/g, ' ').trim();
  const normalizedPrd = prd.toLowerCase().replace(/\s+/g, ' ').trim();
  const strategyDomain = /\b(?:nfts?|token|tokens|buybacks?|launch|hype|sales?|sell|selling|community|holders?|mint)\b/.test(normalized);
  const speculative = /\b(?:maybe|later|i think|if we|if we do|we can|we could|we should|not for now|for now|talk|discuss)\b/.test(normalized);
  const abstractStructure = /\b(?:nice|good|clear|better|clean)?\s*structure\b/.test(normalizedPrd);
  const concreteArtifact = /\b(?:app|application|dashboard|website|site|landing page|page|tool|game|system|tracker|planner|timer|clock|kanban|canvas|board)\b/.test(normalizedPrd);
  return strategyDomain && speculative && abstractStructure && !concreteArtifact;
}

function isAllocationStrategyQuestion(text: string): boolean {
  const normalized = text.toLowerCase().replace(/\s+/g, ' ').trim();
  if (!normalized) return false;
  const allocationDomain =
    /\b(?:tokenomics?|tokens?|airdrop|liquidity|dex|seedify|seedworld|vibecoder|lifetime\s+buyers?|team|ecosystem|rewards?|treasury|advisors?|partners?|community|allocation|allocations?)\b/.test(normalized);
  const hasPercent = /\b\d+(?:\.\d+)?\s*%/.test(normalized);
  const asksStrategy =
    /\b(?:what\s+if|wondering|would\s+it\s+be|too\s+small|good\s+enough|how\s+would\s+you\s+organize|organize\s+the\s+rest|remaining|fixed|makes?\s+sense|should\s+we|could\s+we)\b/.test(normalized);
  const concreteArtifact =
    /\b(?:app|application|dashboard|website|site|landing\s+page|page|tool|game|system|tracker|planner|timer|clock|kanban|canvas|board|file|repo|repository)\b/.test(normalized);
  const explicitArtifactBuild =
    /\b(?:build|create|make|ship|scaffold|generate|develop)\b.{0,80}\b(?:app|application|dashboard|website|site|landing\s+page|page|tool|game|system|tracker|planner|timer|clock|board)\b/.test(normalized);
  return allocationDomain && hasPercent && asksStrategy && !(concreteArtifact && explicitArtifactBuild);
}

function isRecursiveInsightPacketRequest(text: string): boolean {
  const normalized = text.toLowerCase().replace(/\s+/g, ' ').trim();
  if (!normalized) return false;
  const packetArtifact =
    /\b(?:shareable\s+|local\s+|private\s+|review\s+|contribution\s+)?(?:insight|proof|review|contribution)\s+packet\b/.test(normalized);
  const recursiveDomain =
    /\b(?:startup[-\s]+yc|recursive|autoloop|auto\s+loop|benchmark|benchmarks?|speciali[sz]ation\s+path|domain[-\s]*chip|builder\s+chip|loop\s+evidence)\b/.test(normalized);
  const nonPublishBoundary =
    /\b(?:do\s+not|don't|dont|without|no)\s+(?:publish|share|run|start|launch|post|broadcast)\b/.test(normalized) ||
    /\blocal(?:ly)?\b|\bprivate(?:ly)?\b/.test(normalized);
  const concreteBuildSurface =
    /\b(?:app|application|dashboard|website|site|landing\s+page|page|tool|game|system|tracker|planner|timer|clock|kanban|canvas|board)\b/.test(normalized);
  return packetArtifact && recursiveDomain && nonPublishBoundary && !concreteBuildSurface;
}

function isAgentChosenGameBrief(text: string, prd: string): boolean {
	const combined = `${text}\n${prd}`.toLowerCase().replace(/\s+/g, ' ').trim();
	if (/\bcalled\s+[a-z0-9][a-z0-9 :.'&-]{2,80}/i.test(combined)) return false;
	const asksAgentToChoose = (
		/\bgame\b/.test(combined) &&
		/\b(?:what would you|what would u|what do you|what'd you)\b/.test(combined) &&
		/\b(?:wanna|want to|would like to)\s+build\b/.test(combined) &&
		(
			/\b(?:rec|recursive sage|for you|you'?d wanna play|you would want to play)\b/.test(combined) ||
			/\b(?:wanna|want to|would like to)\s+build\b.{0,80}\b(?:as|for)\s+a\s+game\b/.test(combined)
		)
	);
	const asksForRecursivePlayableGame = (
		/\b(?:build|make|create)\b.*\bgame\b/.test(combined) &&
		/\b(?:spark\s+recursive|recursive\s+sage|recursive)\b.*\b(?:want\s+to\s+play|would\s+actually\s+want\s+to\s+play|actually\s+want\s+to\s+play)\b/.test(combined)
	);
	return asksAgentToChoose || asksForRecursivePlayableGame;
}

function normalizeAgentChosenGameBrief(text: string, prd: string): string {
  if (!isAgentChosenGameBrief(text, prd)) return prd;
  const combined = `${text}\n${prd}`.toLowerCase().replace(/\s+/g, ' ').trim();
  const wantsReasoningGame = /\b(?:reasoning|trust|memory|contradiction|confidence|logic|verify|verification|claims?|self[-\s]*test)\b/.test(combined);
  if (wantsReasoningGame) {
    return [
      'Build a browser-playable reasoning game chosen for Recursive Sage.',
      'Default direction: make it test reasoning, memory drift, contradiction handling, trust calibration, and action confidence through clear choices such as trust, verify, quarantine, or revise.',
      'Include scoring, short explanations after each choice, replayable rounds, a visible win or mastery state, restart, and a polished responsive first screen that works without external services.'
    ].join(' ');
  }
  return [
    'Build a browser-playable game chosen for Recursive Sage.',
    'Default direction: make it a shifting maze game with keyboard controls, changing walls, a visible exit, restart, score or timer pressure, and a clear win state.',
    'Make the first screen immediately playable, polished, responsive, and easy to verify without external services.'
  ].join(' ');
}

function isAbstractPlanningStructureRequest(prd: string): boolean {
  const normalizedPrd = prd.toLowerCase().replace(/\s+/g, ' ').trim();
  const startsAbstract =
    /^(?:a\s+|an\s+|the\s+)?(?:nice|good|clear|better|clean|reusable|simple|solid|strong)?\s*(?:structure|plan|strategy|framework)\b/.test(normalizedPrd);
  const concreteArtifact = /\b(?:app|application|dashboard|website|site|landing page|page|tool|game|system|tracker|planner|timer|clock|kanban|canvas|board|file|files|folder|folders|repo|repository|component|components)\b/.test(normalizedPrd);
  return startsAbstract && !concreteArtifact;
}

function extractBuildDescription(text: string): string | null {
  const command = text.match(
    /^\s*(?:(?:i|we)\s+(?:want|need|would\s+like|would\s+love)\s+to\s+|can\s+(?:you|we)\s+|could\s+(?:you|we)\s+|let'?s\s+|let\s+us\s+|please\s+)?\/?(?:build|make|create|ship|scaffold|generate|develop)\b\s*(?:(?:right\s+now|now)\s+)?(?:me\s+|us\s+)?(?:(?:a|an|the|this)\s+|new\s+project\s+)?/i
  );
  if (command) {
    const description = text.slice(command[0].length);
    if (/\bmake\b/i.test(command[0]) && /^\s*sure\b/i.test(description)) {
      return null;
    }
    if (
      isSparkCapabilityMakeRequest(description) ||
      (/\bmake\b/i.test(command[0]) && (isConversationFramingMakeRequest(description) || isVoiceTuningMakeRequest(description)))
    ) {
      return null;
    }
    return description;
  }

  const inlineCommand = text.match(
    /\b(?:and\s+|then\s+|also\s+)?(?:build|make|create|ship|scaffold|generate|develop)\b\s*(?:(?:right\s+now|now)\s+)?(?:me\s+|us\s+)?(?:(?:a|an|the|this)\s+|new\s+project\s+)?/i
  );
  if (inlineCommand?.index !== undefined) {
    const prefix = text.slice(0, inlineCommand.index).toLowerCase();
    if (
      /\b(?:whether|should\s+we|think\s+through|help\s+me\s+think|before\s+we)\b/.test(prefix) ||
      /\bhow\s+(?:should|would|could|can)\b/.test(prefix) ||
      /\b(?:words?|keywords?|terms?|phrases?)\s+(?:like|such\s+as)\b/.test(prefix) ||
      /\b(?:mentioning|saying|using|writing|typing)\b/.test(prefix) ||
      /\b(?:does\s+not|doesn't|doesnt|is\s+not|isn't|isnt)\s+mean\b/.test(prefix) ||
      /\b(?:best|right|safe|secure)\s+way\s+to\b/.test(prefix) ||
      isNegatedBuildCommandPrefix(prefix) ||
      // Philosophical/hypothetical questions: "Can God create...", "Could gravity break..."
      // Modal verb + subject other than "you/we" before the build verb = not a build request.
      /\b(?:can|could|would|will|shall|should|may|might|must)\s+(?!you\b|we\b)[a-z]+\s/i.test(prefix)
    ) {
      return null;
    }
    const description = text.slice(inlineCommand.index + inlineCommand[0].length);
    if (
      isSparkCapabilityMakeRequest(description) ||
      (/\bmake\b/i.test(inlineCommand[0]) && (isConversationFramingMakeRequest(description) || isVoiceTuningMakeRequest(description)))
    ) {
      return null;
    }
    return description;
  }

  const lineCommand = text.match(
    /(?:^|\n)\s*(?:build|make|create|ship|scaffold|generate|develop)\s+(?:this|it)\s+(?:at|in|into)\s+(?:[A-Z]:[\\/]|\/)/i
  );
  if (lineCommand?.index !== undefined) {
    return text.slice(lineCommand.index).replace(/^\s*(?:build|make|create|ship|scaffold|generate|develop)\s+/i, '');
  }

  return null;
}

export function parseBuildIntent(text: string): BuildIntent | null {
  const original = text.trim().replace(/[‘’]/g, "'");
  if (isExactReplyNoFileProbe(original)) return null;
  if (isFilesystemOperationProbe(original)) return null;
  if (isNoExecutionBoundary(original)) return null;
  if (isBuildRouteMetaDiscussion(original)) return null;
  const trimmed = normalizeBuildCommandText(original);
  if (!trimmed) return null;
  if (isBuildIdeationRequest(trimmed)) return null;
  if (isBuildContextRecallProbe(trimmed)) return null;
  if (isPreBuildShapingRequest(trimmed)) return null;
  if (isBuildRouteMetaDiscussion(trimmed)) return null;
  if (isAllocationStrategyQuestion(trimmed)) return null;
  if (isRecursiveInsightPacketRequest(trimmed)) return null;

  const stripped = extractBuildDescription(trimmed);

  if (stripped === null) return null;
  // Project description can legitimately be very short ("app", "blog",
  // "wiki", "cms"). Cap at 3 chars to admit single-noun project asks while
  // still filtering "x" / "ok" / "yo".
  if (stripped.length < 3) return null;

  const pathEvidence = extractPathEvidence(original);
  const projectPath = pathEvidence.projectPath;
  const prd = normalizeAgentChosenGameBrief(original, removeLeadingPathPrefix(stripped.trim()));
  if (isAbstractPlanningStructureRequest(prd)) return null;
  if (isConversationalStrategyStructureRequest(trimmed, prd)) return null;
  if (isAllocationStrategyQuestion(`${trimmed} ${prd}`)) return null;
  if (isRecursiveInsightPacketRequest(`${trimmed} ${prd}`)) return null;
  if (isAmbiguousContextualBuildRequest(trimmed, projectPath, prd)) return null;
  const projectName = polishBuildProjectName(inferProjectName(prd, projectPath));
  const buildMode = inferBuildMode(original, prd, projectPath);
  const buildLane = inferBuildLane(original, prd, projectPath, buildMode.mode);

  return {
    projectPath,
    requestedProjectPath: pathEvidence.requestedProjectPath,
    projectPathEvidenceOnly: pathEvidence.projectPathEvidenceOnly,
    projectPathRejectedReason: pathEvidence.projectPathRejectedReason,
    prd,
    projectName,
    buildMode: buildMode.mode,
    buildModeReason: buildMode.reason,
    buildLane: buildLane.lane,
    buildLaneReason: buildLane.reason
  };
}
