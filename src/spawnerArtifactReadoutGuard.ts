import type { SpawnerArtifactContext } from './naturalRouteDecision';
import type { ShippedProjectContext } from './shippedProjectContext';

type SpawnerReadoutEvidence = {
  shippedProject?: {
    previewUrl?: unknown;
  } | null;
};

function nonEmptyString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function normalizedRequestId(value: unknown): string | null {
  const text = nonEmptyString(value);
  return text ? text.replace(/^prd-/i, '') : null;
}

export function matchingShippedProjectForSpawnerArtifact(
  artifact: SpawnerArtifactContext,
  shippedProject: ShippedProjectContext | null | undefined
): ShippedProjectContext | null {
  if (!shippedProject) return null;
  const artifactMissionId = nonEmptyString(artifact.missionId);
  const shippedMissionId = nonEmptyString(shippedProject.missionId);
  if (artifactMissionId && shippedMissionId && artifactMissionId === shippedMissionId) {
    return shippedProject;
  }

  const artifactRequestId = normalizedRequestId(artifact.requestId);
  const shippedRequestId = normalizedRequestId(shippedProject.requestId);
  if (artifactRequestId && shippedRequestId && artifactRequestId === shippedRequestId) {
    return shippedProject;
  }

  return null;
}

export function spawnerArtifactReplyContradictsEvidence(
  reply: string,
  evidence: SpawnerReadoutEvidence
): boolean {
  const normalized = reply.toLowerCase().replace(/\s+/g, ' ').trim();
  if (!normalized) return true;

  const previewUrl = nonEmptyString(evidence.shippedProject?.previewUrl);
  const hasMatchingPreviewEvidence = Boolean(previewUrl);
  const deniesPreviewEvidence = [
    /\b(?:cannot|can't|cant|do not|don't|dont|does not|doesn't|no|not)\b.{0,100}\b(?:matching\s+)?(?:shipped\s+)?preview(?:\s+url|\s+proof|\s+evidence)?\b/,
    /\b(?:cannot|can't|cant|do not|don't|dont|does not|doesn't|no|not)\b.{0,100}\b(?:shipped\s+app|shipped\s+proof|finished\s+app|usable\s+app)\b/,
    /\b(?:canvas\/result|canvas\s+or\s+result|canvas\s+and\s+result)\s+evidence\b.{0,100}\bnot\b.{0,60}\b(?:finished|shipped|usable)\b/
  ].some((pattern) => pattern.test(normalized));

  if (hasMatchingPreviewEvidence && deniesPreviewEvidence) {
    return true;
  }

  const claimsPreviewEvidence = [
    /\b(?:matching\s+)?shipped\s+preview\s+exists\b/,
    /\bcurrent\s+preview\b/,
    /\bopen\s+it\s+here\b/,
    /\bpreview:\s*https?:\/\//
  ].some((pattern) => pattern.test(normalized)) || [
    /https?:\/\/(?:127\.0\.0\.1|localhost):\d+\/preview\/[A-Za-z0-9_-]+\/index\.html/i
  ].some((pattern) => pattern.test(reply));

  return !hasMatchingPreviewEvidence && claimsPreviewEvidence;
}
