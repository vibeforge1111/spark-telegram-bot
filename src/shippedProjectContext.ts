import path from 'node:path';
import { readJsonFile, resolveStatePath, writeJsonAtomic } from './jsonState';
import { resolveProjectPreviewBaseUrl } from './spawnerUrl';

export interface ShippedProjectContext {
  chatId: string;
  userId: string;
  projectName: string;
  projectPath: string;
  previewUrl: string;
  missionId: string;
  requestId?: string;
  providerLabel?: string;
  summary?: string;
  iteration: number;
  shippedAt: string;
  updatedAt: string;
}

interface ShippedProjectState {
  version: 1;
  byChatId: Record<string, ShippedProjectContext>;
}

export interface ShippedProjectMissionInput {
  chatId: string | number;
  userId: string | number;
  missionId: string;
  requestId?: string;
  goal: string;
  providerLabel?: string;
  response: string;
  projectPath?: string;
  previewUrl?: string;
}

const STATE_PATH = resolveStatePath('.spark-shipped-project-context.json');

function emptyState(): ShippedProjectState {
  return { version: 1, byChatId: {} };
}

async function readState(): Promise<ShippedProjectState> {
  const state = await readJsonFile<ShippedProjectState>(STATE_PATH);
  if (!state || state.version !== 1 || !state.byChatId || typeof state.byChatId !== 'object') {
    return emptyState();
  }
  return state;
}

function normalizeLocalProjectPath(pathValue: string): string {
  const normalized = pathValue.trim().replace(/^file:\/\/\/?/i, '').replace(/\\/g, '/');
  const wslDrive = normalized.match(/^\/([a-zA-Z])\/(.+)$/);
  if (wslDrive) return `${wslDrive[1].toUpperCase()}:/${wslDrive[2]}`.replace(/\/+$/, '');
  return normalized.replace(/\/+$/, '');
}

function projectPreviewBaseUrl(): string {
  return resolveProjectPreviewBaseUrl().replace(/\/+$/, '');
}

export function projectPreviewUrlForPath(projectPath: string): string {
  const token = Buffer.from(normalizeLocalProjectPath(projectPath), 'utf8').toString('base64url');
  return `${projectPreviewBaseUrl()}/preview/${token}/index.html`;
}

function parseJsonObject(text: string): Record<string, unknown> | null {
  try {
    const parsed = JSON.parse(text);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? parsed as Record<string, unknown>
      : null;
  } catch {
    return null;
  }
}

function stringField(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function projectPathFromPreviewUrl(previewUrl: string): string | null {
  const match = previewUrl.match(/\/preview\/([A-Za-z0-9_-]+)\/index\.html/i);
  if (!match?.[1]) return null;
  try {
    const decoded = normalizeLocalProjectPath(Buffer.from(match[1], 'base64url').toString('utf8'));
    return normalizeProjectRootFromArtifactPath(decoded);
  } catch {
    return null;
  }
}

function projectPathFromLinkedFileTarget(target: string): string | null {
  const normalized = normalizeLocalProjectPath(target);
  if (!/^[A-Za-z]:\//.test(normalized)) return null;
  const extension = path.posix.extname(normalized);
  const projectPath = extension
    ? normalizeLocalProjectPath(path.posix.dirname(normalized))
    : normalized;
  return normalizeProjectRootFromArtifactPath(projectPath);
}

function normalizeProjectRootFromArtifactPath(projectPath: string): string {
  const normalized = normalizeLocalProjectPath(projectPath);
  const segments = normalized.split('/');
  const nextIndex = segments.findIndex((segment) => segment.toLowerCase() === '.next');
  if (nextIndex > 1) {
    return normalizeLocalProjectPath(segments.slice(0, nextIndex).join('/'));
  }
  const outputIndex = segments.findIndex((segment) => segment.toLowerCase() === '.output');
  if (outputIndex > 1) {
    return normalizeLocalProjectPath(segments.slice(0, outputIndex).join('/'));
  }
  const basename = path.posix.basename(normalized).toLowerCase();
  if (['dist', 'build', 'out'].includes(basename)) {
    return normalizeLocalProjectPath(path.posix.dirname(normalized));
  }
  return normalized;
}

export function extractProjectPathFromMissionText(text: string): string | null {
  const parsed = parseJsonObject(text);
  const jsonPath = parsed
    ? stringField(parsed.project_path) || stringField(parsed.projectPath)
    : null;
  if (jsonPath) return normalizeProjectRootFromArtifactPath(jsonPath);

  const previewUrl = extractPreviewUrlFromMissionText(text);
  if (previewUrl) {
    const decoded = projectPathFromPreviewUrl(previewUrl);
    if (decoded) return decoded;
  }

  for (const match of text.matchAll(/\]\(([^)\r\n]+)\)/g)) {
    const linkedProjectPath = projectPathFromLinkedFileTarget(match[1]);
    if (linkedProjectPath) return linkedProjectPath;
  }

  const patterns = [
    /(?:built|verified|created)[\s\S]{0,240}?(?:in|at)\s+`([^`\r\n]+)`/i,
    /Project:\s*([A-Za-z]:\\[^\r\n]+)/i,
    /Project folder:\s*([A-Za-z]:\\[^\r\n]+)/i,
    /(?:at|in)\s+([A-Za-z]:\\Users\\[^\r\n`]+)/i
  ];
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match?.[1]) return normalizeLocalProjectPath(match[1].trim().replace(/[.。]\s*$/, ''));
  }
  return null;
}

export function extractPreviewUrlFromMissionText(text: string): string | null {
  const parsed = parseJsonObject(text);
  const parsedPreview = parsed
    ? stringField(parsed.preview_url) || stringField(parsed.previewUrl) || stringField(parsed.open_url) || stringField(parsed.openUrl)
    : null;
  if (parsedPreview) return parsedPreview;
  const match = text.match(/https?:\/\/(?:127\.0\.0\.1|localhost):\d+\/preview\/[A-Za-z0-9_-]+\/index\.html/i);
  return match?.[0] || null;
}

function titleFromFolder(projectPath: string): string {
  return path.basename(projectPath)
    .replace(/[-_]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\b\w/g, (char) => char.toUpperCase()) || 'Latest Spark Project';
}

function projectNameFromGoal(goal: string, projectPath: string): string {
  const heading = goal.match(/^#\s+(.+?)\s*$/m)?.[1]?.trim();
  if (heading) return heading;
  const called = goal.match(/\bcalled\s+([A-Z][A-Za-z0-9 '&.-]{2,80})/i)?.[1]?.trim();
  if (called) return called.replace(/[.。]\s*$/, '');
  return titleFromFolder(projectPath);
}

const GENERIC_PROJECT_TITLES = new Set([
  'app',
  'application',
  'project',
  'build',
  'site',
  'website',
  'page',
  'prototype',
  'demo',
  'tool'
]);

const RESIDUE_PROJECT_TITLE_WORDS = new Set([
  'a',
  'an',
  'and',
  'anything',
  'around',
  'but',
  'for',
  'form',
  'i',
  'im',
  'like',
  'little',
  'm',
  'not',
  'or',
  'shape',
  'something',
  'sure',
  'take',
  'the',
  'thing',
  'this',
  'that',
  'these',
  'those',
  'you',
  'your',
  'me',
  'my',
  'we',
  'our',
  'mission',
  'what',
  'which',
  'where',
  'when',
  'why',
  'how',
  'would',
  'should',
  'could',
  'next',
  'polish',
  'changed',
  'change',
  'update',
  'improve'
]);

function isPromotableProjectTitle(projectName: string): boolean {
  const trimmed = projectName.trim();
  if (!trimmed || /^[^\w]+/.test(trimmed)) return false;
  const normalized = trimmed.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
  if (!normalized || GENERIC_PROJECT_TITLES.has(normalized)) return false;

  const words = normalized.split(/\s+/).filter(Boolean);
  const concreteWords = words.filter((word) =>
    !/^\d+$/.test(word) &&
    !GENERIC_PROJECT_TITLES.has(word) &&
    !RESIDUE_PROJECT_TITLE_WORDS.has(word)
  );
  const residueQuestionWords = words.filter((word) =>
    ['what', 'which', 'where', 'when', 'why', 'how', 'would', 'should', 'could', 'polish', 'next'].includes(word)
  );

  if (concreteWords.length === 0) return false;
  if (residueQuestionWords.length >= 2 && concreteWords.length <= 1) return false;
  return true;
}

function truncateSummary(value: string): string {
  const maxLength = 500;
  const clean = value.trim();
  if (clean.length <= maxLength) return clean;
  return `${clean.slice(0, Math.max(0, maxLength - 12)).trimEnd()} [truncated]`;
}

function summaryFromResponse(response: string): string | undefined {
  const parsed = parseJsonObject(response);
  const parsedSummary = parsed ? stringField(parsed.summary) || stringField(parsed.message) : null;
  if (parsedSummary) return truncateSummary(parsedSummary);
  const line = response
    .split(/\r?\n/)
    .map((entry) => entry.trim())
    .find((entry) => entry && !entry.startsWith('-') && !/\[[^\]]+\]\(/.test(entry));
  return line ? truncateSummary(line) : undefined;
}

export async function recordShippedProjectFromMission(
  input: ShippedProjectMissionInput
): Promise<ShippedProjectContext | null> {
  const inputPreviewUrl = stringField(input.previewUrl);
  const rawProjectPath =
    stringField(input.projectPath) ||
    extractProjectPathFromMissionText(input.response) ||
    (inputPreviewUrl ? projectPathFromPreviewUrl(inputPreviewUrl) : null);
  if (!rawProjectPath) return null;
  const projectPath = normalizeProjectRootFromArtifactPath(rawProjectPath);

  const chatId = String(input.chatId);
  const state = await readState();
  const previous = state.byChatId[chatId];
  const sameProject = previous?.projectPath === projectPath;
  const now = new Date().toISOString();
  const summary = summaryFromResponse(input.response);
  const projectName = sameProject && previous?.projectName
    ? previous.projectName
    : projectNameFromGoal(input.goal, projectPath);
  if (!isPromotableProjectTitle(projectName)) {
    return previous || null;
  }

  const context: ShippedProjectContext = {
    chatId,
    userId: String(input.userId),
    projectName,
    projectPath,
    previewUrl: inputPreviewUrl || extractPreviewUrlFromMissionText(input.response) || projectPreviewUrlForPath(projectPath),
    missionId: input.missionId,
    iteration: sameProject ? previous.iteration + 1 : 1,
    shippedAt: previous?.shippedAt && sameProject ? previous.shippedAt : now,
    updatedAt: now,
    ...(input.requestId ? { requestId: input.requestId } : {}),
    ...(input.providerLabel ? { providerLabel: input.providerLabel } : {}),
    ...(summary ? { summary } : {})
  };

  state.byChatId[chatId] = context;
  await writeJsonAtomic(STATE_PATH, state);
  return context;
}

export async function getLatestShippedProjectContext(
  chatId: string | number
): Promise<ShippedProjectContext | null> {
  const state = await readState();
  return state.byChatId[String(chatId)] || null;
}

export async function clearShippedProjectContextForTests(): Promise<void> {
  await writeJsonAtomic(STATE_PATH, emptyState());
}
