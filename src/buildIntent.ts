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

function isInsideWorkspace(candidate: string): boolean {
  const normalizedCandidate = normalizePathForPlatform(candidate).toLowerCase();
  const normalizedRoot = normalizePathForPlatform(defaultWorkspaceRoot()).toLowerCase();
  return normalizedCandidate === normalizedRoot || normalizedCandidate.startsWith(`${normalizedRoot}${normalizedRoot.includes('\\') ? '\\' : '/'}`);
}

function inferConceptualProjectName(prd: string): string | null {
  const lower = prd.toLowerCase();
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
  return null;
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
  const conceptualName = inferConceptualProjectName(prd);
  if (conceptualName) return conceptualName;
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

function normalizeBuildCommandText(text: string): string {
  return text
    .replace(/^\s*(?:(?:hey|hi|hello|yo|ok|okay)\s+)?spark[,!.]?\s*/i, '')
    .replace(/^\s*(?:use\s+)?advanced\s+prd\s+mode\.?\s*/i, '')
    .replace(/^\s*(?:use\s+)?direct\s+(?:build\s+)?mode\.?\s*/i, '')
    .trim();
}

function extractBuildDescription(text: string): string | null {
  const command = text.match(
    /^\s*(?:(?:i|we)\s+(?:want|need|would\s+like|would\s+love)\s+to\s+|can\s+(?:you|we)\s+|could\s+(?:you|we)\s+|let'?s\s+|let\s+us\s+|please\s+)?\/?(?:build|make|create|ship|scaffold|generate|develop)\b\s*(?:(?:right\s+now|now)\s+)?(?:me\s+|us\s+)?(?:(?:a|an|the|this)\s+|new\s+project\s+)?/i
  );
  if (command) {
    return text.slice(command[0].length);
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
  const trimmed = normalizeBuildCommandText(original);
  if (!trimmed) return null;

  const stripped = extractBuildDescription(trimmed);

  if (stripped === null) return null;
  // Project description can legitimately be very short ("app", "blog",
  // "wiki", "cms"). Cap at 3 chars to admit single-noun project asks while
  // still filtering "x" / "ok" / "yo".
  if (stripped.length < 3) return null;

  const projectPath = extractPath(original);
  const prd = removeLeadingPathPrefix(stripped.trim());
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
