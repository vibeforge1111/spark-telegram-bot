import { existsSync, readFileSync } from 'node:fs';
import { R30_LIVE_TELEGRAM_CASES, R30_LIVE_TELEGRAM_REQUIRED_CASE_IDS } from './r30LiveTelegramCases';
import { summarizeR30LiveTelegramObservations } from './r30LiveTelegramSummary';
import { validateScreenshotManifest } from './r30ScreenshotEvidence';

export { R30_LIVE_TELEGRAM_REQUIRED_CASE_IDS };

export interface LiveTelegramCanaryEvidence {
  schema_version?: string;
  status?: string;
  target?: string;
  proof_scope?: string;
  generated_at?: string;
  observed_at?: string;
  sent_by_operator?: boolean;
  agent_sent_external_message?: boolean;
  observation_packet_ref?: string;
  summary_json_ref?: string;
  screenshot_digest_manifest_ref?: string;
  required_case_ids?: string[];
}

export interface LiveTelegramCanaryValidation {
  passed: boolean;
  failures: string[];
}

type JsonObject = Record<string, any>;

function hasText(value: unknown, minLength = 1): value is string {
  return typeof value === 'string' && value.trim().length >= minLength;
}

function readJsonRef(ref: unknown): JsonObject | null {
  if (!hasText(ref, 3) || !ref.startsWith('/') || !existsSync(ref)) return null;
  try {
    return JSON.parse(readFileSync(ref, 'utf8')) as JsonObject;
  } catch {
    return null;
  }
}

function asArray<T = any>(value: unknown): T[] {
  return Array.isArray(value) ? value as T[] : [];
}

function isoTime(value: unknown): number | null {
  if (!hasText(value)) return null;
  const time = Date.parse(value);
  return Number.isFinite(time) ? time : null;
}

function refDigest(value: unknown): boolean {
  return hasText(value) && /^screenshot:sha256:[a-f0-9]{64}$/i.test(value);
}

function proofTextIsJoined(value: unknown): boolean {
  return hasText(value, 12) && !/\b(?:missing proof|proof missing|not shown|not joined|unjoined|no proof|without proof)\b/i.test(value);
}

function userConfirmedTelegram(value: unknown): boolean {
  return hasText(value, 24) && /Telegram/i.test(value) && /SparkRecursive_bot/i.test(value);
}

function rawLeak(value: unknown): boolean {
  if (!hasText(value)) return false;
  const withoutScreenshotRefs = value.replace(/screenshot:sha256:[a-f0-9]{64}/gi, 'screenshot:<digest>');
  return /\/Users\/|\/tmp\/|trace:[a-z0-9:_-]+|request[_-]?id|message[_-]?id|policy[_-]?reason|route_firewall|harness_core:/i.test(withoutScreenshotRefs);
}

function roboticHeading(value: unknown): boolean {
  return hasText(value) && /(?:^|\n)\s*(?:Mission|Provider|Move|Status)\s*:?\s*(?:\n|$)/i.test(value);
}

function sideEffectsAreFalse(sideEffects: JsonObject | undefined): boolean {
  if (!sideEffects || typeof sideEffects !== 'object') return false;
  const keys = [
    'filesChanged',
    'memoryWritten',
    'missionStarted',
    'externalNetworkCalled',
    'accessChanged',
    'providerChanged',
    'calendarMutated',
    'crmMutated',
    'repoMutated',
    'autoloopStarted'
  ];
  return keys.every((key) => sideEffects[key] === false);
}

function normalizedGateScope(value: unknown): string {
  return hasText(value) ? value.toLowerCase().replace(/[-\s]+/g, '_') : '';
}

function duplicateIds(values: JsonObject[]): string[] {
  const seen = new Set<string>();
  const duplicates = new Set<string>();
  for (const value of values) {
    const id = String(value?.id || '');
    if (!id) continue;
    if (seen.has(id)) duplicates.add(id);
    seen.add(id);
  }
  return Array.from(duplicates);
}

export function validateLiveTelegramCanaryEvidence(
  value: unknown,
  options: { now?: Date | string } = {}
): LiveTelegramCanaryValidation {
  const evidence = (value && typeof value === 'object' ? value : {}) as LiveTelegramCanaryEvidence;
  const failures: string[] = [];

  if (evidence.schema_version !== 'spark.r30.live_telegram_canary.v1') failures.push('schema_version must be spark.r30.live_telegram_canary.v1');
  if (evidence.status !== 'pass') failures.push('status must be pass');
  if (evidence.target !== 'SparkRecursive_bot') failures.push('target must be SparkRecursive_bot');
  if (evidence.proof_scope !== 'r30_domain_chip_fastpath_live_telegram') failures.push('proof_scope must be r30_domain_chip_fastpath_live_telegram');
  if (evidence.sent_by_operator !== true) failures.push('sent_by_operator must be true');
  if (evidence.agent_sent_external_message !== false) failures.push('agent_sent_external_message must be false');

  const requiredCaseIds = asArray<string>(evidence.required_case_ids);
  for (const caseId of R30_LIVE_TELEGRAM_REQUIRED_CASE_IDS) {
    if (!requiredCaseIds.includes(caseId)) failures.push(`required_case_ids missing ${caseId}`);
  }

  const observations = readJsonRef(evidence.observation_packet_ref);
  const summaryPacket = readJsonRef(evidence.summary_json_ref);
  const screenshotManifest = readJsonRef(evidence.screenshot_digest_manifest_ref);
  if (!observations) failures.push('observation_packet_ref must point to a readable JSON file');
  if (!summaryPacket) failures.push('summary_json_ref must point to a readable JSON file');
  if (!screenshotManifest) failures.push('screenshot_digest_manifest_ref must point to a readable JSON file');
  if (!observations || !summaryPacket || !screenshotManifest) return { passed: false, failures };

  const screenshotManifestValidation = validateScreenshotManifest(screenshotManifest);
  failures.push(...screenshotManifestValidation.failures);

  if (observations.schema_version !== 'spark.r30.live_telegram_observations.v1') failures.push('observation packet schema_version must be spark.r30.live_telegram_observations.v1');
  if (summaryPacket.schema_version !== 'spark.r30.live_telegram_summary.v1') failures.push('summary packet schema_version must be spark.r30.live_telegram_summary.v1');
  if (observations.target !== 'SparkRecursive_bot') failures.push('observation packet target must be SparkRecursive_bot');
  const summary = summaryPacket.summary || {};
  const derivedSummaryPacket = summarizeR30LiveTelegramObservations(observations, screenshotManifest, { now: options.now });
  const derivedSummary = derivedSummaryPacket.summary;
  if (summary.target !== 'SparkRecursive_bot') failures.push('summary target must be SparkRecursive_bot');
  if (summary.readyForRelease !== derivedSummary.readyForRelease) failures.push('summary.readyForRelease must match derived observations');
  if (JSON.stringify(asArray(summary.releaseBlockers)) !== JSON.stringify(asArray(derivedSummary.releaseBlockers))) failures.push('summary.releaseBlockers must match derived observations');
  if (JSON.stringify(asArray(summary.missingPacketEvidence)) !== JSON.stringify(asArray(derivedSummary.missingPacketEvidence))) failures.push('summary.missingPacketEvidence must match derived observations');
  if (JSON.stringify(asArray(summary.invalidPacketEvidence)) !== JSON.stringify(asArray(derivedSummary.invalidPacketEvidence))) failures.push('summary.invalidPacketEvidence must match derived observations');
  if (JSON.stringify(asArray(summary.stalePacketEvidence)) !== JSON.stringify(asArray(derivedSummary.stalePacketEvidence))) failures.push('summary.stalePacketEvidence must match derived observations');
  if (summary.readyForRelease !== true) failures.push('summary.readyForRelease must be true');

  const gateScope = normalizedGateScope(summary.gateScope);
  if (gateScope !== 'selected_case_gate' && gateScope !== 'full_release_pack') {
    failures.push('summary.gateScope must be selected_case_gate or full_release_pack');
  }

  const now = options.now ? new Date(options.now).getTime() : Date.now();
  const expiresAt = isoTime(summary.runtimeEvidenceExpiresAt);
  if (!expiresAt || expiresAt <= now) failures.push('summary.runtimeEvidenceExpiresAt must be fresh');

  const summaryCaseArray = asArray<JsonObject>(summary.cases);
  const derivedSummaryCases = new Map(asArray<JsonObject>(derivedSummary.cases).map((entry) => [String(entry.id), entry]));
  const observedCaseArray = asArray<JsonObject>(observations.cases);
  for (const id of duplicateIds(summaryCaseArray)) failures.push(`summary case duplicate ${id}`);
  for (const id of duplicateIds(observedCaseArray)) failures.push(`observation case duplicate ${id}`);
  const summaryCases = new Map(summaryCaseArray.map((entry) => [String(entry.id), entry]));
  const observedCases = new Map(observedCaseArray.map((entry) => [String(entry.id), entry]));
  const canonicalCases = new Map(R30_LIVE_TELEGRAM_CASES.map((entry) => [entry.id, entry]));
  for (const caseId of R30_LIVE_TELEGRAM_REQUIRED_CASE_IDS) {
    const canonical = canonicalCases.get(caseId);
    const summaryCase = summaryCases.get(caseId);
    const observedCase = observedCases.get(caseId);
    if (!summaryCase) {
      failures.push(`summary case missing ${caseId}`);
      continue;
    }
    if (!observedCase) {
      failures.push(`observation case missing ${caseId}`);
      continue;
    }
    if (!canonical) {
      failures.push(`canonical case missing ${caseId}`);
      continue;
    }
    if (summaryCase.promptHash !== canonical.promptHash || observedCase.promptHash !== canonical.promptHash) failures.push(`${caseId} promptHash must match canonical prompt`);
    if (observedCase.prompt !== canonical.prompt) failures.push(`${caseId} prompt must match canonical prompt`);
    if (summaryCase.expectedRoute !== canonical.expectedRoute || observedCase.expected?.route !== canonical.expectedRoute) failures.push(`${caseId} expected route must match canonical route`);
    if (summaryCase.expectedAuthority !== canonical.expectedAuthority || observedCase.expected?.authority !== canonical.expectedAuthority) failures.push(`${caseId} expected authority must match canonical authority`);
    if (summaryCase.expectedMutationClass !== canonical.expectedMutationClass || observedCase.expected?.mutationClass !== canonical.expectedMutationClass) failures.push(`${caseId} expected mutation class must match canonical mutation class`);
    if (summaryCase.verdict !== 'pass') failures.push(`${caseId} summary verdict must be pass`);
    if (asArray(summaryCase.missingCaptures).length > 0) failures.push(`${caseId} missingCaptures must be empty`);
    const derivedCase = derivedSummaryCases.get(caseId);
    if (!derivedCase) failures.push(`${caseId} derived summary case missing`);
    if (derivedCase && summaryCase.verdict !== derivedCase.verdict) failures.push(`${caseId} summary verdict must match derived observations`);
    if (derivedCase && JSON.stringify(asArray(summaryCase.missingCaptures)) !== JSON.stringify(asArray(derivedCase.missingCaptures))) failures.push(`${caseId} missingCaptures must match derived observations`);
    if (observedCase.observed?.verdict !== 'pass') failures.push(`${caseId} observed verdict must be pass`);
    if (!proofTextIsJoined(observedCase.observed?.proofJoin)) failures.push(`${caseId} proofJoin must be present and joined`);
    if (!hasText(observedCase.observed?.proofJoin) || !observedCase.observed.proofJoin.includes(canonical.expectedRoute)) failures.push(`${caseId} proofJoin must name expected route ${canonical.expectedRoute}`);
    if (!userConfirmedTelegram(observedCase.observed?.userConfirmation)) failures.push(`${caseId} userConfirmation must name Telegram and SparkRecursive_bot`);
    const screenshotRefs = asArray<string>(observedCase.observed?.screenshotRefs);
    if (screenshotRefs.length === 0) failures.push(`${caseId} must have screenshot refs`);
    for (const ref of screenshotRefs) {
      if (!refDigest(ref)) {
        failures.push(`${caseId} screenshot ref must be screenshot:sha256:<64 hex>`);
        continue;
      }
      const entries = screenshotManifestValidation.entriesByRef.get(ref) || [];
      if (entries.length === 0) {
        failures.push(`${caseId} screenshot ref missing from digest manifest`);
        continue;
      }
      if (!entries.some((entry) => entry.captured_for_case_id === caseId)) {
        failures.push(`${caseId} screenshot ref must be bound to the same case id in digest manifest`);
      }
    }
    if (!sideEffectsAreFalse(observedCase.observed?.sideEffects)) failures.push(`${caseId} sideEffects must prove no unexpected mutation`);
    if (rawLeak(observedCase.observed?.reply)
      || rawLeak(observedCase.observed?.proofJoin)
      || rawLeak(observedCase.observed?.proofPanel)
      || rawLeak(observedCase.observed?.notes)
      || rawLeak(observedCase.observed?.userConfirmation)) {
      failures.push(`${caseId} leaks raw internals`);
    }
    const replyShape = summaryCase.expectedReplyShape || observedCase.expected?.replyShape;
    if (replyShape === 'natural' && roboticHeading(observedCase.observed?.reply)) failures.push(`${caseId} natural reply has robotic heading`);
  }

  return { passed: failures.length === 0, failures };
}
