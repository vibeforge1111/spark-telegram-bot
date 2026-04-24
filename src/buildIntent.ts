// Build-project intent parser. Catches natural-language phrasing that should
// kick off a Spawner PRD-based project flow (multi-task canvas + execution).

export interface BuildIntent {
  projectPath: string | null;
  prd: string;
  projectName: string;
}

const DEFAULT_WORKSPACE_ROOT = 'C:\\Users\\USER\\Desktop';
const WORKSPACE_ROOT = (process.env.SPARK_PROJECT_ROOT || DEFAULT_WORKSPACE_ROOT)
  .replace(/\//g, '\\')
  .replace(/[\\/]$/, '');

function inferProjectName(prd: string): string {
  const nameMatch = prd.match(/called\s+([A-Z][\w\s-]{2,60})/i);
  if (nameMatch) return nameMatch[1].trim();
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

export function parseBuildIntent(text: string): BuildIntent | null {
  const trimmed = text.trim();
  if (!trimmed) return null;

  // Anchor patterns: the message must start with a project-trigger verb.
  const starters = /^(?:build|make\s+me|create|ship|scaffold|generate)\s+(?:a|an|the|this|me\s+a)\s+/i;
  const rawStarter = /^(?:build|make\s+me|create|ship|scaffold|generate)\s+/i;

  let stripped: string | null = null;
  const starterMatch = trimmed.match(starters);
  if (starterMatch) {
    stripped = trimmed.slice(starterMatch[0].length);
  } else {
    const rawMatch = trimmed.match(rawStarter);
    if (rawMatch) stripped = trimmed.slice(rawMatch[0].length);
  }

  if (stripped === null) return null;
  if (stripped.length < 12) return null;

  const projectPath = extractPath(trimmed);
  const prd = stripped.trim();
  const projectName = inferProjectName(prd);

  return { projectPath, prd, projectName };
}
