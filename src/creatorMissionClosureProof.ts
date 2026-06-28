function nonEmptyString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

export function creatorMissionClosureProof(data: any): { missionId?: string; stagedPath?: string } {
  const missionId = nonEmptyString(data?.missionId) || nonEmptyString(data?.trace?.mission_id);
  const stagedPath = nonEmptyString(data?.tracePath) || nonEmptyString(data?.artifactPath) ||
    nonEmptyString(data?.reviewPath) || nonEmptyString(data?.canvasUrl) || nonEmptyString(data?.trace?.links?.canvas);
  return { missionId, stagedPath };
}
