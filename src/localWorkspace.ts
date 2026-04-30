import { readdir, stat } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { parseBuildIntent } from './buildIntent';

export interface LocalWorkspaceRootSummary {
  path: string;
  exists: boolean;
  error?: string;
}

export interface LocalWorkspaceProject {
  name: string;
  path: string;
  isGitRepo: boolean;
  modifiedAt: string;
  signals: string[];
}

export interface LocalWorkspaceSummary {
  roots: LocalWorkspaceRootSummary[];
  projects: LocalWorkspaceProject[];
  truncated: boolean;
}

interface SummarizeOptions {
  roots?: string[];
  limit?: number;
}

const SKIP_NAMES = new Set([
  '$recycle.bin',
  'node_modules',
  '.git',
  '.cache',
  '.pytest_cache',
  '.svelte-kit',
  'dist',
  'build'
]);

export function isLocalWorkspaceInspectionRequest(text: string): boolean {
  const normalized = text.toLowerCase().replace(/\s+/g, ' ').trim();
  const asksExplicitInventory = /\b(?:inspect|scan|list|show|map|find)\b/.test(normalized);
  const namesLocalSurface = /\b(?:desktop|folder|folders|repo|repos|repositories|workspace|workspaces|local project|local projects|filesystem|file system|my computer|my machine)\b/.test(normalized);
  const asksLookAtInventory = /\blook\b/.test(normalized) &&
    /\b(?:at|through|inside|in|on)\b/.test(normalized) &&
    /\b(?:desktop|folders|repos|repositories|workspaces|local projects|filesystem|file system)\b/.test(normalized);
  const asksFocus = /\b(?:what projects|focused on|working on|what am i working|where am i working)\b/.test(normalized);
  return (asksExplicitInventory && namesLocalSurface) || asksLookAtInventory || (asksFocus && namesLocalSurface);
}

export function isLocalWorkspaceInspectionOnlyRequest(text: string): boolean {
  const normalized = text.trim().toLowerCase();
  return /^\/(?:workspaces?|local-workspaces?|folders?)\b/.test(normalized) &&
    !parseBuildIntent(text) &&
    isLocalWorkspaceInspectionRequest(text);
}

export function defaultLocalWorkspaceRoots(env: NodeJS.ProcessEnv = process.env): string[] {
  const configured = env.SPARK_LOCAL_WORKSPACE_ROOTS?.trim();
  if (configured) {
    return configured
      .split(/[;\n]/)
      .map((item) => item.trim())
      .filter(Boolean);
  }

  const home = os.homedir();
  return [
    path.join(home, 'Desktop'),
    path.join(home, 'Documents'),
    path.join(home, '.spark', 'workspaces')
  ];
}

function hasFile(projectPath: string, fileName: string): boolean {
  return existsSync(path.join(projectPath, fileName));
}

function projectSignals(projectPath: string): string[] {
  const signals: string[] = [];
  if (existsSync(path.join(projectPath, '.git'))) signals.push('git');
  if (hasFile(projectPath, 'package.json')) signals.push('node');
  if (hasFile(projectPath, 'pyproject.toml') || hasFile(projectPath, 'requirements.txt')) signals.push('python');
  if (hasFile(projectPath, 'README.md') || hasFile(projectPath, 'README.txt')) signals.push('docs');
  return signals;
}

async function summarizeRoot(root: string, limit: number): Promise<{
  root: LocalWorkspaceRootSummary;
  projects: LocalWorkspaceProject[];
  truncated: boolean;
}> {
  const resolvedRoot = path.resolve(root);
  if (!existsSync(resolvedRoot)) {
    return { root: { path: resolvedRoot, exists: false }, projects: [], truncated: false };
  }

  try {
    const entries = await readdir(resolvedRoot, { withFileTypes: true });
    const directories = entries
      .filter((entry) => entry.isDirectory())
      .filter((entry) => !SKIP_NAMES.has(entry.name.toLowerCase()))
      .slice(0, Math.max(limit * 3, limit));

    const projects: LocalWorkspaceProject[] = [];
    for (const entry of directories) {
      const projectPath = path.join(resolvedRoot, entry.name);
      const info = await stat(projectPath);
      const signals = projectSignals(projectPath);
      projects.push({
        name: entry.name,
        path: projectPath,
        isGitRepo: signals.includes('git'),
        modifiedAt: info.mtime.toISOString(),
        signals
      });
    }

    projects.sort((a, b) => Date.parse(b.modifiedAt) - Date.parse(a.modifiedAt));
    return {
      root: { path: resolvedRoot, exists: true },
      projects: projects.slice(0, limit),
      truncated: projects.length > limit
    };
  } catch (error) {
    return {
      root: {
        path: resolvedRoot,
        exists: true,
        error: error instanceof Error ? error.message : String(error)
      },
      projects: [],
      truncated: false
    };
  }
}

export async function summarizeLocalWorkspaces(options: SummarizeOptions = {}): Promise<LocalWorkspaceSummary> {
  const limit = Math.max(1, Math.min(50, options.limit ?? 18));
  const roots = options.roots || defaultLocalWorkspaceRoots();
  const rootSummaries = await Promise.all(roots.map((root) => summarizeRoot(root, limit)));
  const projects = rootSummaries
    .flatMap((item) => item.projects)
    .sort((a, b) => Date.parse(b.modifiedAt) - Date.parse(a.modifiedAt))
    .slice(0, limit);

  return {
    roots: rootSummaries.map((item) => item.root),
    projects,
    truncated: rootSummaries.some((item) => item.truncated)
  };
}

function relativeAge(timestamp: string): string {
  const deltaMs = Date.now() - Date.parse(timestamp);
  if (!Number.isFinite(deltaMs) || deltaMs < 0) return 'recent';
  const minutes = Math.floor(deltaMs / 60_000);
  if (minutes < 60) return `${Math.max(1, minutes)}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 48) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

export function renderLocalWorkspaceInspectionReply(summary: LocalWorkspaceSummary): string {
  const rootLines = summary.roots.map((root) => {
    const status = root.error ? `error: ${root.error}` : root.exists ? 'ok' : 'missing';
    return `- ${root.path} (${status})`;
  });

  if (summary.projects.length === 0) {
    return [
      'I can inspect local folders at Level 4, but I did not find any project folders in the configured roots.',
      '',
      'Scanned roots:',
      ...rootLines
    ].join('\n');
  }

  const projectLines = summary.projects.slice(0, 12).map((project, index) => {
    const signalText = project.signals.length > 0 ? project.signals.join(', ') : 'folder';
    return `${index + 1}. ${project.name} - ${signalText} - ${relativeAge(project.modifiedAt)}\n   ${project.path}`;
  });

  return [
    'I can inspect local folders at Level 4. Here is the local workspace snapshot:',
    '',
    ...projectLines,
    '',
    'Scanned roots:',
    ...rootLines,
    summary.truncated ? 'More folders exist; I showed the most recently modified ones.' : null
  ].filter(Boolean).join('\n');
}
