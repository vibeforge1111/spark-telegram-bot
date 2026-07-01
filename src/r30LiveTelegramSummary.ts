import { R30_LIVE_TELEGRAM_CASES } from './r30LiveTelegramCases';
import { validateScreenshotManifest } from './r30ScreenshotEvidence';

type JsonObject = Record<string, any>;

const VERDICTS = ['pass', 'fail', 'blocked', 'needs-retest', 'untested'] as const;

function hasText(value: unknown, minLength = 1): value is string {
  return typeof value === 'string' && value.trim().length >= minLength;
}

function asArray<T = any>(value: unknown): T[] {
  return Array.isArray(value) ? value as T[] : [];
}

function rawLeak(value: unknown): boolean {
  if (!hasText(value)) return false;
  const withoutScreenshotRefs = value.replace(/screenshot:sha256:[a-f0-9]{64}/gi, 'screenshot:<digest>');
  return /\/Users\/|\/tmp\/|trace:[a-z0-9:_-]+|request[_-]?id|message[_-]?id|policy[_-]?reason|route_firewall|harness_core:/i.test(withoutScreenshotRefs);
}

function roboticHeading(value: unknown): boolean {
  return hasText(value) && /(?:^|\n)\s*(?:Mission|Provider|Move|Status)\s*:?\s*(?:\n|$)/i.test(value);
}

function proofTextIsJoined(value: unknown): boolean {
  return hasText(value, 12) && !/\b(?:missing proof|proof missing|not shown|not joined|unjoined|no proof|without proof)\b/i.test(value);
}

function userConfirmedTelegram(value: unknown): boolean {
  return hasText(value, 24) && /Telegram/i.test(value) && /SparkRecursive_bot/i.test(value);
}

function sideEffectsIssues(sideEffects: JsonObject | undefined): string[] {
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
  if (!sideEffects || typeof sideEffects !== 'object') return ['side_effects'];
  return keys.filter((key) => sideEffects[key] !== false).map((key) => `side_effect_${key}`);
}

function expiresAt(collectedAt: string, maxAgeHours: number): string {
  const collected = Date.parse(collectedAt);
  if (!Number.isFinite(collected)) return '';
  return new Date(collected + maxAgeHours * 60 * 60 * 1000).toISOString();
}

function missingCapturesForCase(entry: JsonObject | undefined, screenshotManifestValidation: ReturnType<typeof validateScreenshotManifest>) {
  const missing: string[] = [];
  if (!entry) return ['observed_case'];
  const canonical = R30_LIVE_TELEGRAM_CASES.find((item) => item.id === entry.id);
  if (!canonical) return ['canonical_case'];
  const observed = entry.observed || {};

  if (entry.promptHash !== canonical.promptHash) missing.push('prompt_hash');
  if (entry.prompt !== canonical.prompt) missing.push('prompt');
  if (entry.expected?.route !== canonical.expectedRoute) missing.push('expected_route');
  if (entry.expected?.authority !== canonical.expectedAuthority) missing.push('expected_authority');
  if (entry.expected?.mutationClass !== canonical.expectedMutationClass) missing.push('expected_mutation_class');
  if (observed.verdict !== 'pass') missing.push('verdict');
  if (!hasText(observed.reply, 12)) missing.push('observed_reply');
  if (!proofTextIsJoined(observed.proofJoin)) missing.push('proof_join');
  if (!hasText(observed.proofJoin) || !String(observed.proofJoin).includes(canonical.expectedRoute)) missing.push('proof_join_route');
  if (!hasText(observed.proofPanel, 12)) missing.push('proof_panel');
  if (!userConfirmedTelegram(observed.userConfirmation)) missing.push('user_confirmation');
  missing.push(...sideEffectsIssues(observed.sideEffects));

  const screenshotRefs = asArray<string>(observed.screenshotRefs);
  if (screenshotRefs.length === 0) missing.push('screenshot');
  for (const ref of screenshotRefs) {
    if (!/^screenshot:sha256:[a-f0-9]{64}$/i.test(ref)) {
      missing.push('screenshot_ref');
      continue;
    }
    const manifestEntries = screenshotManifestValidation.entriesByRef.get(ref) || [];
    if (manifestEntries.length === 0) {
      missing.push('screenshot_manifest_entry');
      continue;
    }
    if (!manifestEntries.some((manifestEntry) => manifestEntry.captured_for_case_id === entry.id)) {
      missing.push('screenshot_case_binding');
    }
  }

  if (rawLeak(observed.reply)
    || rawLeak(observed.proofJoin)
    || rawLeak(observed.proofPanel)
    || rawLeak(observed.notes)
    || rawLeak(observed.userConfirmation)) {
    missing.push('raw_internal_leak');
  }
  if (roboticHeading(observed.reply)) missing.push('robotic_heading');

  return Array.from(new Set(missing));
}

export function summarizeR30LiveTelegramObservations(
  observations: unknown,
  screenshotManifest: unknown,
  options: { now?: Date | string; maxRuntimeEvidenceAgeHours?: number } = {}
) {
  const packet = (observations && typeof observations === 'object' ? observations : {}) as JsonObject;
  const screenshotManifestValidation = validateScreenshotManifest(screenshotManifest);
  const now = options.now ? new Date(options.now).getTime() : Date.now();
  const maxRuntimeEvidenceAgeHours = options.maxRuntimeEvidenceAgeHours ?? 1;
  const collectedAt = String(packet.evidence?.collectedAt || packet.generatedAt || '');
  const runtimeEvidenceExpiresAt = expiresAt(collectedAt, maxRuntimeEvidenceAgeHours);
  const runtimeExpired = !runtimeEvidenceExpiresAt || Date.parse(runtimeEvidenceExpiresAt) <= now;
  const observedCaseArray = asArray<JsonObject>(packet.cases);
  const observedCaseIds = observedCaseArray.map((entry) => String(entry.id || '')).filter(Boolean);
  const canonicalCaseIds = new Set(R30_LIVE_TELEGRAM_CASES.map((entry) => entry.id));
  const duplicateCaseIds = observedCaseIds.filter((id, index) => observedCaseIds.indexOf(id) !== index);
  const unknownCaseIds = observedCaseIds.filter((id) => !canonicalCaseIds.has(id));
  const observedCases = new Map(observedCaseArray.map((entry) => [String(entry.id), entry]));
  const verdictCounts = Object.fromEntries(VERDICTS.map((verdict) => [verdict, 0])) as Record<typeof VERDICTS[number], number>;

  const cases = R30_LIVE_TELEGRAM_CASES.map((canonical) => {
    const observedCase = observedCases.get(canonical.id);
    const observedVerdict = observedCase?.observed?.verdict;
    const verdict = VERDICTS.includes(observedVerdict) ? observedVerdict : 'untested';
    verdictCounts[verdict as typeof VERDICTS[number]] += 1;
    return {
      id: canonical.id,
      promptHash: canonical.promptHash,
      category: canonical.id.includes('boundary') ? 'boundary' : 'domain_chip_fast_path',
      verdict,
      expectedRoute: canonical.expectedRoute,
      expectedAuthority: canonical.expectedAuthority,
      expectedMutationClass: canonical.expectedMutationClass,
      expectedReplyShape: canonical.expectedReplyShape,
      missingCaptures: missingCapturesForCase(observedCase, screenshotManifestValidation)
    };
  });

  const invalidPacketEvidence = [
    ...(packet.schema_version === 'spark.r30.live_telegram_observations.v1' ? [] : ['observations_schema_version']),
    ...(packet.target === 'SparkRecursive_bot' ? [] : ['observations_target']),
    ...Array.from(new Set(duplicateCaseIds)).map((id) => `duplicate_case:${id}`),
    ...Array.from(new Set(unknownCaseIds)).map((id) => `unknown_case:${id}`),
    ...screenshotManifestValidation.failures.map((failure) => `screenshot_manifest:${failure}`)
  ];
  const missingPacketEvidence = [
    ...(hasText(collectedAt) ? [] : ['runtime_evidence_collected_at'])
  ];
  const stalePacketEvidence = runtimeExpired ? ['runtime_evidence_expired'] : [];
  const caseBlockers = cases
    .filter((entry) => entry.verdict !== 'pass' || entry.missingCaptures.length > 0)
    .map((entry) => entry.id);
  const releaseBlockers = [
    ...missingPacketEvidence,
    ...invalidPacketEvidence,
    ...stalePacketEvidence,
    ...caseBlockers.map((caseId) => `case_not_ready:${caseId}`)
  ];

  return {
    schema_version: 'spark.r30.live_telegram_summary.v1',
    summary: {
      target: 'SparkRecursive_bot',
      generatedAt: new Date().toISOString(),
      runtimeEvidenceCollectedAt: collectedAt,
      runtimeEvidenceMaxAgeHours: maxRuntimeEvidenceAgeHours,
      runtimeEvidenceExpiresAt,
      totalCases: R30_LIVE_TELEGRAM_CASES.length,
      verdictCounts,
      readyForRelease: releaseBlockers.length === 0,
      readyForPublish: false,
      releaseBlockers,
      publishBlockers: ['publish_not_in_scope'],
      missingPacketEvidence,
      invalidPacketEvidence,
      stalePacketEvidence,
      gateScope: 'selected_case_gate',
      cases
    }
  };
}
