// Build-project intent parser. Catches natural-language phrasing that should
// kick off a Spawner PRD-based project flow (multi-task canvas + execution).

export interface BuildIntent {
  projectPath: string | null;
  prd: string;
  projectName: string;
  buildMode: BuildMode;
  buildModeReason: string;
}

const DEFAULT_WORKSPACE_ROOT = 'C:\\Users\\USER\\Desktop';
const WORKSPACE_ROOT = (process.env.SPARK_PROJECT_ROOT || DEFAULT_WORKSPACE_ROOT)
  .replace(/\//g, '\\')
  .replace(/[\\/]$/, '');

export type BuildMode = 'direct' | 'advanced_prd';

function inferProjectName(prd: string, projectPath: string | null): string {
  const nameMatch = prd.match(/\bcalled\s+([A-Z][\w\s-]{2,60}?)(?=[.,:;]|\s+(?:with|that|which|where|for|using)\b|$)/i);
  if (nameMatch) return nameMatch[1].trim();
  if (projectPath) {
    const pathName = projectPath.split(/[\\/]/).filter(Boolean).pop();
    if (pathName) return pathName.replace(/[-_]/g, ' ').trim();
  }
  const atMatch = prd.match(/(?:at|in)\s+[A-Z]:[\\/][\w\\/:\-. ]+[\\/]([\w.-]+)/);
  if (atMatch) return atMatch[1].replace(/[-_]/g, ' ').trim();
  const firstWords = prd.split(/\s+/).slice(0, 6).join(' ');
  return firstWords.slice(0, 60) || 'Untitled Project';
}

function extractPath(text: string): string | null {
  const atMatch = text.match(/(?:at|in|into)\s+([A-Z]:[\\/][^\s:][^\n]*?)(?:\s*[:,]|\s*$)/);
  if (atMatch) {
    const candidate = atMatch[1].trim().replace(/\//g, '\\').replace(/[\\/]$/, '');
    const lowerCandidate = candidate.toLowerCase();
    const lowerRoot = WORKSPACE_ROOT.toLowerCase();
    if (lowerCandidate === lowerRoot || lowerCandidate.startsWith(`${lowerRoot}\\`)) {
      return candidate;
    }
  }
  return null;
}

function removeLeadingPathPrefix(text: string): string {
  return text
    .replace(/^(?:at|in|into)\s+[A-Z]:[\\/][^\n]*?:\s*/i, '')
    .replace(/\s+(?:at|in|into)\s+[A-Z]:[\\/][^\n]*?:\s*/i, ' ')
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

  if (/\b(?:prd|tas|task acceptance|acceptance criteria|domain\s*chip|mission control|new project|complete project|from scratch|full app|platform|system)\b/.test(lower)) {
    return {
      mode: 'advanced_prd',
      reason: 'Request looks like a new project or systematic feature that benefits from PRD-to-task planning.'
    };
  }

  const requestedFiles = (text.match(/\b[\w.-]+\.(?:html|css|js|ts|tsx|jsx|json|md|py|svelte|vue|go|rs)\b/gi) || []).length;
  const featureWords = (text.match(/\b(?:shows?|supports?|persists?|updates?|editable|animated|dashboard|form|localstorage|api|auth|database|deploy|integrat(?:e|ion))\b/gi) || []).length;

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
    .replace(/^\s*(?:use\s+)?advanced\s+prd\s+mode\.?\s*/i, '')
    .replace(/^\s*(?:use\s+)?direct\s+(?:build\s+)?mode\.?\s*/i, '')
    .trim();
}

export function parseBuildIntent(text: string): BuildIntent | null {
  const original = text.trim();
  const trimmed = normalizeBuildCommandText(original);
  if (!trimmed) return null;

  // Anchor patterns: the message must start with a project-trigger verb,
  // optionally preceded by a slash (slash command shape). "/build me a foo"
  // and "build me a foo" both qualify.
  const starters = /^\/?(?:build|make\s+me|create|ship|scaffold|generate)\s+(?:a|an|the|this|me\s+a)\s+/i;
  const rawStarter = /^\/?(?:build|make\s+me|create|ship|scaffold|generate)\s+/i;

  let stripped: string | null = null;
  const starterMatch = trimmed.match(starters);
  if (starterMatch) {
    stripped = trimmed.slice(starterMatch[0].length);
  } else {
    const rawMatch = trimmed.match(rawStarter);
    if (rawMatch) stripped = trimmed.slice(rawMatch[0].length);
  }

  if (stripped === null) return null;
  // Project description can legitimately be short ("tetris game", "todo app",
  // "blog cms"). Cap at 4 chars to filter "x" / "yo" while still admitting
  // single-noun project asks. Previously this was 12 which silently dropped
  // perfectly valid requests like "build me a tetris game" into the chat
  // route, confusing users.
  if (stripped.length < 4) return null;

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
