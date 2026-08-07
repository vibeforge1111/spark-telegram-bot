export interface MissionCompletionSummary {
  providerLabel: string;
  response: string;
  openLink?: string | null;
  previewPending?: boolean;
}

interface MissionCompletionFetchOptions {
  spawnerBaseUrl: string;
  headers: Record<string, string>;
  readyOpenLink: (previewUrl: string | null, projectPath: string | null) => Promise<string | null>;
  attempts?: number;
  delayMs?: number;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function firstString(record: Record<string, unknown> | null, keys: string[]): string | null {
  if (!record) return null;
  for (const key of keys) {
    const value = record[key];
    if (typeof value === 'string' && value.trim()) return value.trim();
  }
  return null;
}

export async function fetchMissionCompletionSummary(
  missionId: string,
  options: MissionCompletionFetchOptions
): Promise<MissionCompletionSummary | null> {
  const attempts = Math.max(1, options.attempts ?? 4);
  const delayMs = Math.max(250, options.delayMs ?? 1500);
  for (let attempt = 0; attempt < attempts; attempt++) {
    if (attempt > 0) await new Promise((resolve) => setTimeout(resolve, delayMs));
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 3000);
      try {
        const response = await fetch(
          `${options.spawnerBaseUrl.replace(/\/+$/, '')}/api/mission-control/trace?mission=${encodeURIComponent(missionId)}`,
          { headers: options.headers, signal: controller.signal }
        );
        if (!response.ok) continue;
        const payload = asRecord(await response.json());
        if (!payload) continue;
        const phase = typeof payload.phase === 'string' ? payload.phase.toLowerCase() : '';
        const providerSummary = typeof payload.providerSummary === 'string' && payload.providerSummary.trim() !== 'Provider summary requires control auth.'
          ? payload.providerSummary.trim()
          : '';
        const providerResults = Array.isArray(payload.providerResults)
          ? payload.providerResults.map(asRecord).filter(Boolean)
          : [];
        const completedProvider =
          providerResults.find((entry) => String(entry?.status || '').toLowerCase() === 'completed') ||
          providerResults.find((entry) => typeof entry?.summary === 'string' && entry.summary.trim());
        const resultSummary = completedProvider && typeof completedProvider.summary === 'string'
          ? completedProvider.summary.trim()
          : '';
        const responseText = providerSummary || resultSummary;
        if (phase !== 'completed' || !responseText) continue;

        const lineage = asRecord(payload.projectLineage);
        const projectPath = firstString(lineage, ['projectPath', 'project_path']);
        const previewUrl = firstString(lineage, ['previewUrl', 'preview_url']);
        return {
          providerLabel: completedProvider && typeof completedProvider.providerId === 'string'
            ? completedProvider.providerId
            : 'provider',
          response: responseText,
          openLink: await options.readyOpenLink(previewUrl, projectPath),
          previewPending: false
        };
      } finally {
        clearTimeout(timeout);
      }
    } catch {
      // The terminal event can arrive before provider results are visible; the coordinator retries.
    }
  }
  return null;
}
