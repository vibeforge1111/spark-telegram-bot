import { parseBuildIntent } from './buildIntent';

function normalizeRouteText(text: string): string {
  return text.toLowerCase().replace(/\s+/g, ' ').trim();
}

function isBuildIntentText(text: string): boolean {
  return parseBuildIntent(text) !== null;
}

function isRuntimeDoctrineDiscussion(normalized: string): boolean {
  return /\b(?:plan|strategy|docs?|documentation|architecture|repo|pr|code|implement|build|design|talk|discuss)\b/.test(normalized);
}

export function shouldAnswerSparkRepairRequest(text: string): boolean {
  const normalized = normalizeRouteText(text);
  if (!normalized) return false;
  if (isBuildIntentText(text)) {
    return false;
  }
  if (isRuntimeDoctrineDiscussion(normalized)) {
    return false;
  }
  const asksForRepair = /\b(?:fix|repair|heal|recover|restart)\b/.test(normalized);
  const sparkTarget = /\b(?:spark|bot|telegram|spawner|mission control|runtime|live stack|system|it|this)\b/.test(normalized);
  const unhealthySignal = /\b(?:unhealthy|down|broken|stuck|quiet|not responding|offline|failing|failed|degraded)\b/.test(normalized);
  return asksForRepair && sparkTarget && unhealthySignal;
}

export function isLiveSparkHealthQuestion(text: string): boolean {
  const normalized = normalizeRouteText(text);
  if (!normalized) return false;
  if (isBuildIntentText(text)) {
    return false;
  }
  if (isRuntimeDoctrineDiscussion(normalized)) {
    return false;
  }
  const sparkScoped = /\b(?:spark|spawner|telegram|mission control|runtime|live stack|systems?|stack)\b/.test(normalized);
  if (!sparkScoped) return false;
  return (
    /\bspark live status\b/.test(normalized) ||
    /\blive spark health\b/.test(normalized) ||
    /\bsame source as spark live status\b/.test(normalized) ||
    /\b(?:check|show|refresh|inspect|probe|verify)\b.*\bspark\b.*\b(?:health|status|state)\b/.test(normalized) ||
    /\bfresh\s+(?:live\s+)?(?:state|runtime|health|status)\b.*\b(?:say|show|prove|report)\b/.test(normalized) ||
    /\bwhat\s+does\s+fresh\s+(?:live\s+)?(?:state|runtime|health|status)\s+say\b/.test(normalized) ||
    (/\bspawner\b/.test(normalized) && /\btelegram\b/.test(normalized) && /\b(?:supervised|running|stopped|health|live)\b/.test(normalized))
  );
}
