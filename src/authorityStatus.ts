import { readFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

export type AuthorityStatusSummary = {
  present: boolean;
  authority: string;
  defaultAccessLevel: number;
  defaultSandboxLane: string;
  configuredTelegramProfileCount: number;
  telegramProfileCount: number;
  spawnerLaneCount: number;
  browserHookCount: number;
  browserApprovalRequiredHookCount: number;
  toxicPairCount: number;
  publicationChecksRequired: number;
  requiredPublicationChecks: string[];
  error?: string;
};

function objectValue(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function arrayValue(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function stringValue(value: unknown): string {
  return String(value || '').trim();
}

function numberValue(value: unknown): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function approvalRequiredCount(approvalModeCounts: Record<string, unknown>): number {
  return Object.entries(approvalModeCounts).reduce((total, [mode, count]) => {
    return mode === 'not_required' || mode === 'blocked' ? total : total + numberValue(count);
  }, 0);
}

export function resolveAuthorityViewPath(env: NodeJS.ProcessEnv = process.env): string {
  const configured = env.SPARK_SYSTEM_MAP_DIR || env.SPARK_OS_SYSTEM_MAP_DIR;
  const root = configured && configured.trim()
    ? configured.trim()
    : path.join(os.homedir(), '.spark', 'state', 'system-map');
  return path.join(root, 'authority-view.json');
}

export function summarizeAuthorityView(payload: unknown): AuthorityStatusSummary {
  const root = objectValue(payload);
  const cliAccess = objectValue(root.cli_access);
  const capabilityPolicy = objectValue(root.cli_capability_policy);
  const telegramPolicy = objectValue(root.telegram_access_policy);
  const spawnerPolicy = objectValue(root.spawner_execution_policy);
  const browserAuthority = objectValue(root.browser_authority);
  const publicOutputAuthority = objectValue(root.public_output_authority);
  const guardrails = objectValue(root.guardrail_summary);
  const requiredPublicationChecks = arrayValue(publicOutputAuthority.required_publication_checks)
    .map(stringValue)
    .filter(Boolean)
    .slice(0, 5);
  const approvalCounts = objectValue(browserAuthority.approval_mode_counts);

  return {
    present: Object.keys(root).length > 0,
    authority: stringValue(root.authority) || 'observability_non_authoritative',
    defaultAccessLevel: numberValue(root.default_access_level_hint || cliAccess.default_access_level),
    defaultSandboxLane: stringValue(cliAccess.default_sandbox_lane) || 'unknown',
    configuredTelegramProfileCount: numberValue(root.configured_telegram_profile_count),
    telegramProfileCount: numberValue(root.telegram_profile_count) || arrayValue(telegramPolicy.profiles).length,
    spawnerLaneCount: arrayValue(spawnerPolicy.lane_ids).length,
    browserHookCount: numberValue(browserAuthority.hook_count),
    browserApprovalRequiredHookCount: numberValue(guardrails.browser_approval_required_hook_count) || approvalRequiredCount(approvalCounts),
    toxicPairCount: numberValue(guardrails.toxic_pair_count) || numberValue(capabilityPolicy.toxic_pair_count),
    publicationChecksRequired: numberValue(guardrails.publication_checks_required) || requiredPublicationChecks.length,
    requiredPublicationChecks
  };
}

export async function readAuthorityStatusSummary(viewPath = resolveAuthorityViewPath()): Promise<AuthorityStatusSummary> {
  try {
    const raw = await readFile(viewPath, 'utf-8');
    return summarizeAuthorityView(JSON.parse(raw));
  } catch (error) {
    return {
      present: false,
      authority: 'missing',
      defaultAccessLevel: 0,
      defaultSandboxLane: 'unknown',
      configuredTelegramProfileCount: 0,
      telegramProfileCount: 0,
      spawnerLaneCount: 0,
      browserHookCount: 0,
      browserApprovalRequiredHookCount: 0,
      toxicPairCount: 0,
      publicationChecksRequired: 0,
      requiredPublicationChecks: [],
      error: error instanceof Error ? error.message : String(error)
    };
  }
}

export function renderAuthorityStatusSummary(summary: AuthorityStatusSummary): string {
  if (!summary.present) {
    const cause = summary.error || '';
    const looksLikeMissingFile = /ENOENT|no such file|not found/i.test(cause);
    if (cause && !looksLikeMissingFile) {
      return [
        'Authority view could not be read.',
        '',
        'Move',
        '- Reason: ' + cause.slice(0, 200),
        '- If this looks like malformed JSON or a stale file, re-run `spark os compile` to regenerate authority-view.json.'
      ].join('\n');
    }
    return [
      'Authority view is not compiled yet.',
      '',
      'Move',
      '- Run `spark os compile`, then try `/authority` again.'
    ].join('\n');
  }

  const hasGates = summary.browserApprovalRequiredHookCount > 0 || summary.publicationChecksRequired > 0 || summary.toxicPairCount > 0;
  const headline = hasGates ? 'Authority view has gated actions.' : 'Authority view is visible.';
  const browserLine = summary.browserHookCount > 0
    ? `${summary.browserApprovalRequiredHookCount} browser approvals from ${summary.browserHookCount} hooks`
    : `${summary.browserApprovalRequiredHookCount} browser approvals`;
  const publicationLine = summary.requiredPublicationChecks.length
    ? `${summary.publicationChecksRequired} publication checks tracked`
    : `${summary.publicationChecksRequired} publication checks`;

  return [
    headline,
    '',
    'State',
    `- Access L${summary.defaultAccessLevel}; lane ${summary.defaultSandboxLane}`,
    `- ${summary.telegramProfileCount} Telegram access profiles; ${summary.spawnerLaneCount} Spawner lanes`,
    `- ${browserLine}`,
    `- ${summary.toxicPairCount} toxic capability pairs; ${publicationLine}`,
    '',
    'Review',
    '- This is evidence, not permission.',
    '- High-agency actions still need source policy, runner state, confirmation, and trace.',
    '',
    'Workspace',
    '- Full evidence: `spark os authority --json`'
  ].join('\n');
}
