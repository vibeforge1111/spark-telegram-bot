import { parseBuildIntent } from './buildIntent';
import { isLoopEngineeringNoActionProofQuestion, renderLoopEngineeringNoActionProofReply } from './loopEngineeringNoActionProof';

function isProductMemoryMissionBoundaryQuestion(normalized: string): boolean {
  const mentionsProductMemory = /\b(?:spark\s+thread\s+qa|thread\s+qa|product\s+polish|product[-\s]*memory|product\s+conversation)\b/.test(normalized);
  const mentionsMissionState = /\b(?:mission\s+control|mission\s+state|canvas|kanban|current\s+mission|mission\s+lane)\b/.test(normalized);
  const asksBoundary = /\b(?:when|should|difference|separate|mention|interrupt|intrude|leak|hijack|boundary|outrank)\b/.test(normalized);
  return mentionsProductMemory && mentionsMissionState && asksBoundary;
}

export function isSparkWorkflowBugHuntRequest(text: string): boolean {
  const normalized = text.trim().toLowerCase().replace(/\s+/g, ' ');
  if (!normalized) return false;
  if (isLoopEngineeringNoActionProofQuestion(normalized)) return true;
  if (parseBuildIntent(normalized)) return false;
  if (isProductMemoryMissionBoundaryQuestion(normalized)) return false;
  const qaLanguage = /\b(?:unit\s+tests?|qa|bug\s+hunt(?:er|ing)?|edge\s+cases?|regressions?|smoke\s+tests?|test\s+suite|comprehensive\s+tests?|trigger\s+bugs?|bug\s+hunter)\b/.test(normalized);
  const sparkSurface = /\b(?:spawner|mission\s+control|mission\s+loop|telegram|relay|workflow|canvas|kanban|builder|route|routing)\b/.test(normalized);
  return qaLanguage && sparkSurface;
}

export function renderSparkWorkflowBugHuntReply(text: string): string {
  const normalized = text.trim().toLowerCase().replace(/\s+/g, ' ');
  if (isLoopEngineeringNoActionProofQuestion(normalized)) return renderLoopEngineeringNoActionProofReply(text);
  if (/\b(?:missing|no|without)\s+mission\s+id\b/.test(normalized) && /\b(?:success|answer|answers|answered|return|returns|gives|gave)\b/.test(normalized)) return [
    'Fail closed. A success-shaped Mission Control answer without a mission id is not a started run.',
    '',
    'Spark should say it did not get closure proof, then retry only after Mission Control can return a fresh mission id for that exact turn.',
    '',
    'I will not start a mission from this wording.'
  ].join('\n');
  return [
    'Treat this as QA planning, not a mission launch.',
    '',
    'Focus the pass on route hijacks, no-execution boundaries, duplicate confirmations, no-edit probes, live Kanban/provider truth, missing mission ids, and Telegram composition.',
    '',
    'Next move: add failing regressions, hotfix the boundary, run focused tests, then prove it live in Telegram.',
    '',
    'I will not start a mission from this wording.'
  ].join('\n');
}
