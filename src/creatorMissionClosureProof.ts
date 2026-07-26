function nonEmptyString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function userVisibleSpawnerPath(value: unknown): string | undefined {
  const candidate = nonEmptyString(value);
  if (!candidate) return undefined;
  if (/^https?:\/\//i.test(candidate)) return candidate;
  if (/^(?:file:\/\/|[A-Z]:\\|\.{1,2}\/)/i.test(candidate)) return undefined;
  if (/^\/(?:Users|home|private|tmp|var)\//i.test(candidate)) return undefined;
  if (candidate.startsWith('/')) return candidate;
  return undefined;
}

export function creatorMissionClosureProof(data: any): { missionId?: string; stagedPath?: string } {
  const missionId = nonEmptyString(data?.missionId) || nonEmptyString(data?.trace?.mission_id);
  const stagedPath = userVisibleSpawnerPath(data?.tracePath) ||
    userVisibleSpawnerPath(data?.artifactPath) ||
    userVisibleSpawnerPath(data?.reviewPath) ||
    userVisibleSpawnerPath(data?.canvasUrl) ||
    userVisibleSpawnerPath(data?.trace?.links?.review) ||
    userVisibleSpawnerPath(data?.trace?.links?.artifact) ||
    userVisibleSpawnerPath(data?.trace?.links?.canvas);
  return { missionId, stagedPath };
}
