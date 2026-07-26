import { isRouteWordMetaExplanationDiscussion } from './conversationIntent';

function normalizeRouteText(text: string): string {
  return text.toLowerCase().replace(/\s+/g, ' ').trim();
}

function isRuntimeDoctrineDiscussion(normalized: string): boolean {
  return /\b(?:plan|strategy|docs?|documentation|architecture|repo|pr|code|implement|build|design|talk|discuss)\b/.test(normalized);
}

export function shouldAnswerSparkRepairRequest(text: string): boolean {
  const normalized = normalizeRouteText(text);
  if (!normalized) return false;
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
  if (isRouteWordMetaExplanationDiscussion(normalized)) {
    return false;
  }
  if (isRuntimeDoctrineDiscussion(normalized)) {
    return false;
  }
  const asksRepairNeededFromStatus =
    /\brepair\b/.test(normalized) &&
    /\b(?:needed|need|required|attention)\b/.test(normalized) &&
    /\b(?:current|fresh|live)\s+(?:status|state|health)\b/.test(normalized);
  if (asksRepairNeededFromStatus) return true;

  const connectionCheckScoped =
    /\bconnection\s+check\b/.test(normalized) &&
    /\b(?:current\s+)?(?:live\s+)?(?:state|status|health)\b/.test(normalized);
  const sparkScoped =
    connectionCheckScoped ||
    /\b(?:you|your|spark|bot|spawner|telegram|mission control|runtime|live stack|systems?|stack)\b/.test(normalized);
  if (!sparkScoped) return false;
  return (
    /\bspark live status\b/.test(normalized) ||
    /\blive spark health\b/.test(normalized) ||
    /\bsame source as spark live status\b/.test(normalized) ||
    connectionCheckScoped ||
    /\b(?:are|is)\s+(?:you|spark|the\s+bot|this\s+bot|telegram|spawner|mission\s+control|the\s+system|systems?|everything)\b.*\b(?:healthy|working|running|online|up|live|ready|ok|okay)\b/.test(normalized) ||
    /\bwhat(?:'s| is)\s+(?:your|the)\s+current\s+(?:live\s+)?(?:state|status|health)\b/.test(normalized) ||
    /\bhow\s+(?:are|is)\s+(?:you|spark|the\s+bot|this\s+bot|telegram|spawner|the\s+system|systems?|everything)\s+(?:doing|running)\b/.test(normalized) ||
    /\b(?:check|show|refresh|inspect|probe|verify)\b.*\bspark\b.*\b(?:health|healthy|status|state|ready|working)\b/.test(normalized) ||
    /\bfresh\s+(?:live\s+)?(?:state|runtime|health|status)\b.*\b(?:say|show|prove|report)\b/.test(normalized) ||
    /\bwhat\s+does\s+fresh\s+(?:live\s+)?(?:state|runtime|health|status)\s+say\b/.test(normalized) ||
    (/\bspawner\b/.test(normalized) && /\btelegram\b/.test(normalized) && /\b(?:supervised|running|stopped|health|live)\b/.test(normalized))
  );
}
