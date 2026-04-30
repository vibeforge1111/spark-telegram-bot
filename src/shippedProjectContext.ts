import path from 'node:path';
import { readJsonFile, resolveStatePath, writeJsonAtomic } from './jsonState';

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
  return (process.env.SPARK_PROJECT_PREVIEW_URL || 'http://127.0.0.1:5555').replace(/\/+$/, '');
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
    return normalizeLocalProjectPath(Buffer.from(match[1], 'base64url').toString('utf8'));
  } catch {
    return null;
  }
}

export function extractProjectPathFromMissionText(text: string): string | null {
  const parsed = parseJsonObject(text);
  const jsonPath = parsed
    ? stringField(parsed.project_path) || stringField(parsed.projectPath)
    : null;
  if (jsonPath) return normalizeLocalProjectPath(jsonPath);

  const previewUrl = extractPreviewUrlFromMissionText(text);
  if (previewUrl) {
    const decoded = projectPathFromPreviewUrl(previewUrl);
    if (decoded) return decoded;
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

function summaryFromResponse(response: string): string | undefined {
  const parsed = parseJsonObject(response);
  const parsedSummary = parsed ? stringField(parsed.summary) || stringField(parsed.message) : null;
  if (parsedSummary) return parsedSummary.slice(0, 500);
  const line = response
    .split(/\r?\n/)
    .map((entry) => entry.trim())
    .find((entry) => entry && !entry.startsWith('-') && !/\[[^\]]+\]\(/.test(entry));
  return line ? line.slice(0, 500) : undefined;
}

export async function recordShippedProjectFromMission(
  input: ShippedProjectMissionInput
): Promise<ShippedProjectContext | null> {
  const projectPath = extractProjectPathFromMissionText(input.response);
  if (!projectPath) return null;

  const chatId = String(input.chatId);
  const state = await readState();
  const previous = state.byChatId[chatId];
  const sameProject = previous?.projectPath === projectPath;
  const now = new Date().toISOString();
  const summary = summaryFromResponse(input.response);
  const context: ShippedProjectContext = {
    chatId,
    userId: String(input.userId),
    projectName: projectNameFromGoal(input.goal, projectPath),
    projectPath,
    previewUrl: extractPreviewUrlFromMissionText(input.response) || projectPreviewUrlForPath(projectPath),
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
