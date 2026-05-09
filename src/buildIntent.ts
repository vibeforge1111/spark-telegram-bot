// Build-project intent parser. Catches natural-language phrasing that should
// kick off a Spawner PRD-based project flow (multi-task canvas + execution).

export interface BuildIntent {
  projectPath: string | null;
  prd: string;
  projectName: string;
  buildMode: BuildMode;
  buildModeReason: string;
}

export type BuildMode = 'direct' | 'advanced_prd';

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
  return value
    .replace(/[-_/]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .split(' ')
    .map((word) => {
      if (/^[A-Z0-9]{2,}$/.test(word)) return word;
      return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
    })
    .join(' ');
}

function inferProductPhraseProjectName(prd: string): string | null {
  const normalized = prd.replace(/\s+/g, ' ').trim();
  const productType = '(?:domain[-\\s]*chip|landing\\s+page|dashboard|workbench|agent|tool|app|game|system|tracker|planner|timer|clock|site|website|page)';
  const patterns = [
    new RegExp(`^(?:this\\s+)?(?:a|an|the|new)?\\s*([A-Za-z0-9][A-Za-z0-9' -]{2,90}?\\b${productType})\\b(?=[.,:;?!]|\\s+(?:that|which|where|with|for|to|using|and)\\b|$)`, 'i'),
    new RegExp(`\\b(?:build|create|make|scaffold|ship|implement|design)\\s+(?:this\\s+)?(?:a|an|the|new)?\\s*([A-Za-z0-9][A-Za-z0-9' -]{2,90}?\\b${productType})\\b(?=[.,:;?!]|\\s+(?:that|which|where|with|for|to|using|and)\\b|$)`, 'i'),
    new RegExp(`\\bi\\s+(?:want|need|could\\s+use|would\\s+like)\\s+(?:a|an|the|new)?\\s*([A-Za-z0-9][A-Za-z0-9' -]{2,90}?\\b${productType})\\b(?=[.,:;?!]|\\s+(?:that|which|where|with|for|to|using|and)\\b|$)`, 'i')
  ];
  const genericLeadingWords = new Set([
    'a',
    'an',
    'the',
    'new',
    'private',
    'local',
    'local-first',
    'simple',
    'tiny',
    'quick',
    'polished',
    'real',
    'full',
    'static',
    'responsive',
    'playful',
    'passive',
    'narrow',
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
    const productMatch = phrase.match(new RegExp(`\\b${productType}\\b$`, 'i'));
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

function inferProjectName(prd: string, projectPath: string | null): string {
  const nameMatch = prd.match(/\bcalled\s+([A-Z][\w\s-]{2,60}?)(?=[.,:;?]|\n|\s+(?:with|that|which|where|for|using)\b|\s+and\s+(?:make|build|create|ship|scaffold|generate)\b|$)/i);
  if (nameMatch) return nameMatch[1].trim();
  if (projectPath) {
    const pathName = projectPath.split(/[\\/]/).filter(Boolean).pop();
    if (pathName) return pathName.replace(/[-_]/g, ' ').trim();
  }
  const atMatch = prd.match(/(?:at|in)\s+(?:[A-Z]:[\\/]|\/)[\w\\/:\-. ]+[\\/]([\w.-]+)/);
  if (atMatch) return atMatch[1].replace(/[-_]/g, ' ').trim();
  const quotedHeadingName = inferQuotedHeadingProjectName(prd);
  if (quotedHeadingName) return quotedHeadingName;
  const conceptualName = inferConceptualProjectName(prd);
  if (conceptualName) return conceptualName;
  const productPhraseName = inferProductPhraseProjectName(prd);
  if (productPhraseName) return productPhraseName;
  const firstWords = prd.split(/\s+/).slice(0, 6).join(' ');
  return firstWords.slice(0, 60) || 'Untitled Project';
}

function extractPath(text: string): string | null {
  const atMatch = text.match(/(?:at|in|into)\s+((?:[A-Z]:[\\/]|\/)[^\n:]*?)(?:\s*[:,]|\.\s*(?:\n|$)|\s*$)/i);
  if (atMatch) {
    const candidate = normalizePathForPlatform(atMatch[1]);
    if (isInsideWorkspace(candidate)) {
      return candidate;
    }
  }
  return null;
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
  return /\b(?:give|show|list|suggest|brainstorm|recommend|rank)\s+(?:me\s+|us\s+)?(?:\w+\s+){0,4}(?:build|project|app|dashboard)\s+(?:ideas?|directions?|concepts?|options?)\b/.test(normalized);
}

function isBuildContextRecallProbe(text: string): boolean {
  const normalized = text.toLowerCase().replace(/\s+/g, ' ').trim();
  return (
    /\bwhat\s+(?:were|was)\s+(?:we|i|you)\s+(?:going\s+to|gonna|planning\s+to|supposed\s+to)\s+(?:build|make|create)\b/.test(normalized) ||
    /\b(?:do\s+you\s+)?remember\b.*\bwhat\b.*\b(?:we|i|you)\s+(?:were\s+)?(?:going\s+to|gonna|planning\s+to|supposed\s+to)?\s*(?:build|make|create)\b/.test(normalized) ||
    /\bwe\s+were\s+(?:going\s+to|gonna|planning\s+to|supposed\s+to)\s+(?:build|make|create)\b.*\b(?:remember|what\s+it\s+was)\b/.test(normalized)
  );
}

function isExactReplyNoFileProbe(text: string): boolean {
  const normalized = text.toLowerCase().replace(/\s+/g, ' ').trim();
  return (
    /\breply exactly\b/.test(normalized) &&
    /\b(?:do not|don't)\s+(?:creat(?:e|ing)\s+files?|build\s+anything)\b|\bwithout\s+creat(?:e|ing)\s+files?\b|\bno\s+files?\b/.test(normalized)
  );
}

function isConversationFramingMakeRequest(description: string): boolean {
  return /^(?:today|tonight|now|chat|conversation|session|thread|this\s+(?:chat|conversation|session|thread)|our\s+(?:chat|conversation|session|thread))\s+(?:also\s+)?(?:about|focused\s+on|for)\b/i.test(
    description.trim()
  );
}

function isSparkCapabilityMakeRequest(description: string): boolean {
  const normalized = description.replace(/\s+/g, ' ').trim();
  const lowered = normalized.toLowerCase();
  const productArtifact =
    /^(?:a\s+|an\s+|the\s+)?(?:web\s+|mobile\s+|desktop\s+|local-first\s+|private\s+|static\s+|tiny\s+|simple\s+|internal\s+|spark\s+memory\s+|spark\s+)*(?:app|application|dashboard|website|site|landing\s+page|page|game|panel|portal|viewer|tracker|manager|workspace|board)\b/i.test(normalized);
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
  const directMemoryReportChange =
    /^(?:memory\s+reports?|memories\s+reports?|reports?\s+of\s+(?:my\s+)?memories?)\b/i.test(normalized) ||
    (/^daily\s+reports?\b/i.test(normalized) && /\bmemories?\b/i.test(normalized));
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
  if (concreteStandaloneBrief) {
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

function extractBuildDescription(text: string): string | null {
  const command = text.match(
    /^\s*(?:(?:i|we)\s+(?:want|need|would\s+like|would\s+love)\s+to\s+|can\s+(?:you|we)\s+|could\s+(?:you|we)\s+|let'?s\s+|let\s+us\s+|please\s+)?\/?(?:build|make|create|ship|scaffold|generate|develop)\b\s*(?:(?:right\s+now|now)\s+)?(?:me\s+|us\s+)?(?:(?:a|an|the|this)\s+|new\s+project\s+)?/i
  );
  if (command) {
    const description = text.slice(command[0].length);
    if (isSparkCapabilityMakeRequest(description) || (/\bmake\b/i.test(command[0]) && isConversationFramingMakeRequest(description))) {
      return null;
    }
    return description;
  }

  const inlineCommand = text.match(
    /\b(?:and\s+|then\s+|also\s+)?(?:build|make|create|ship|scaffold|generate|develop)\b\s*(?:(?:right\s+now|now)\s+)?(?:me\s+|us\s+)?(?:(?:a|an|the|this)\s+|new\s+project\s+)?/i
  );
  if (inlineCommand?.index !== undefined) {
    const prefix = text.slice(0, inlineCommand.index).toLowerCase();
    if (/\b(?:whether|should\s+we|think\s+through|help\s+me\s+think|before\s+we)\b/.test(prefix) || isNegatedBuildCommandPrefix(prefix)) {
      return null;
    }
    const description = text.slice(inlineCommand.index + inlineCommand[0].length);
    if (isSparkCapabilityMakeRequest(description) || (/\bmake\b/i.test(inlineCommand[0]) && isConversationFramingMakeRequest(description))) {
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
  const trimmed = normalizeBuildCommandText(original);
  if (!trimmed) return null;
  if (isBuildIdeationRequest(trimmed)) return null;
  if (isBuildContextRecallProbe(trimmed)) return null;

  const stripped = extractBuildDescription(trimmed);

  if (stripped === null) return null;
  // Project description can legitimately be very short ("app", "blog",
  // "wiki", "cms"). Cap at 3 chars to admit single-noun project asks while
  // still filtering "x" / "ok" / "yo".
  if (stripped.length < 3) return null;

  const projectPath = extractPath(original);
  const prd = removeLeadingPathPrefix(stripped.trim());
  if (isAmbiguousContextualBuildRequest(trimmed, projectPath, prd)) return null;
  const projectName = inferProjectName(prd, projectPath);
  const buildMode = inferBuildMode(original, prd, projectPath);

  return {
    projectPath,
    prd,
    projectName,
    buildMode: buildMode.mode,
    buildModeReason: buildMode.reason
  };
}
