export function isLoopEngineeringNoActionProofQuestion(text: string): boolean {
  const value = text.trim().toLowerCase().replace(/\s+/g, ' ');
  if (!value) return false;
  if (isCreatedDomainChipBenchmarkFollowupQuestion(value)) return true;
  const mentionsLoopEngineering =
    /\b(?:domain\s+chip\s+labs|domain[-\s]*chip|loop\s+engineering)\b/.test(value) ||
    (/\bchip\b/.test(value) && /\b(?:creator\s+agent|blind\s+judge|held[-\s]*out|benchmark|autoloop)\b/.test(value));
  const asksForProof = /\b(?:what\s+proof|proof\s+would\s+you\s+require|evidence\s+would\s+you\s+require|before\b.{0,80}\bsafe|considered\s+safe|call\b.{0,40}\bgood)\b/.test(value);
  const asksForScoringGuard =
    /\b(?:avoid|prevent|stop|block)\b.{0,80}\b(?:blindly|blind|inflated|unsupported|unproven|rubber[-\s]*stamp)\b.{0,80}\b(?:score|scoring|grade|rating|promot)/.test(value) ||
    /\b(?:blind\s+judge|blind\s+judg(?:e|ing)|held[-\s]*out|trap|no[-\s]*op|adversar(?:y|ial))\b.{0,80}\b(?:score|proof|promot|improv)/.test(value) ||
    /\bwhat\s+should\s+spark\s+say\b.{0,120}\b(?:blind\s+judge|held[-\s]*out|unproven|improv)/.test(value);
  const mentionsRunOrQuality = /\b(?:run|mission|create|publish|quality|good|improvement|improved|score|scoring|benchmark|autoloop|watchtower|rollback|promotion|promote)\b/.test(value);
  const noActionBoundary =
    /\b(?:no[-\s]*action|not\s+asking\s+you\s+to|do\s+not|don't|without\s+(?:creating|running|publishing|repairing))\b/.test(value) ||
    /\b(?:create|run|repair|publish)\b.{0,40}\banything\b/.test(value);
  const advisoryBoundary =
    noActionBoundary ||
    /\b(?:what\s+should\s+spark\s+say|how\s+would\s+spark|how\s+should\s+spark|explain|tell\s+me)\b/.test(value);
  return mentionsLoopEngineering && mentionsRunOrQuality && advisoryBoundary && (asksForProof || asksForScoringGuard);
}

function isSafetyAdversaryBindingProofQuestion(text: string): boolean {
  const value = text.trim().toLowerCase().replace(/\s+/g, ' ');
  if (!value) return false;
  const mentionsSafetyAdversary =
    /\bsafety\b/.test(value) &&
    /\badversar(?:y|ial)\b/.test(value);
  const mentionsBindingOrVerdict =
    /\b(?:bind|binding|verdicts?|clearance|report)\b/.test(value);
  const asksWithoutPromotion =
    /\b(?:without\s+promot|not\s+promot|promotion\s+remain|before\b.{0,100}\bpromot)\b/.test(value) ||
    /\bpromote\b/.test(value);
  return mentionsSafetyAdversary && mentionsBindingOrVerdict && asksWithoutPromotion;
}

function createdDomainChipBenchmarkFollowupKey(text: string): string | null {
  const value = text.trim().toLowerCase().replace(/\s+/g, ' ');
  const chipKey = value.match(/\bdomain-chip-[a-z0-9][a-z0-9-]{1,100}\b/)?.[0] || null;
  if (!chipKey) return null;
  const noActionBoundary =
    /\b(?:no[-\s]*action|not\s+asking\s+you\s+to|do\s+not|don't|without\s+(?:creating|running|benchmarking|autolooping|publishing|promoting))\b/.test(value) ||
    /\b(?:create|run|benchmark|autoloop|publish|promote)\b.{0,80}\banything\b/.test(value);
  const asksWhatShouldHappen =
    /\b(?:what\s+should\s+happen|what\s+should\s+spark\s+do|how\s+should\s+spark\s+handle|should\s+happen\s+when)\b/.test(value);
  const mentionsBenchmarkFollowup =
    /\brun\s+the\s+benchmarks?\s+for\s+it\b/.test(value) ||
    /\bbenchmarks?\b.{0,40}\b(?:for\s+it|that\s+chip|created\s+chip|domain[-\s]*chip)\b/.test(value);
  return noActionBoundary && asksWhatShouldHappen && mentionsBenchmarkFollowup ? chipKey : null;
}

function isCreatedDomainChipBenchmarkFollowupQuestion(text: string): boolean {
  return Boolean(createdDomainChipBenchmarkFollowupKey(text));
}

function labelFromDomainChipKey(chipKey: string): string {
  return chipKey
    .replace(/^domain-chip-/i, '')
    .replace(/[-_]+/g, ' ')
    .replace(/\b\w/g, (match) => match.toUpperCase())
    .trim() || 'Domain Chip';
}

function renderSafetyAdversaryBindingProofReply(): string {
  return [
    'Spark should require safety judge role separation with scores for forbidden actions, privacy, tool-use safety, route authority, and publication boundary, plus a separate adversary report with cited finding refs and no hard blockers.',
    'Binding those verdicts only records candidate evidence in the proof capsule; promotion remains blocked until benchmark delta, held-out/trap proof, transfer, watchtower, rollback, proof-auditor review, and operator approval all line up.'
  ].join('\n');
}

function isBlindScoringGuardQuestion(text: string): boolean {
  const value = text.trim().toLowerCase().replace(/\s+/g, ' ');
  if (!value) return false;
  return (
    /\b(?:avoid|prevent|stop|block)\b.{0,80}\b(?:blindly|inflated|unsupported|unproven|rubber[-\s]*stamp)\b.{0,80}\b(?:score|scoring|grade|rating|promot)/.test(value) ||
    /\b(?:blind\s+judge|blind\s+judg(?:e|ing)|held[-\s]*out|trap|no[-\s]*op|adversar(?:y|ial))\b.{0,80}\b(?:score|proof|promot|improv)/.test(value) ||
    /\bwhat\s+should\s+spark\s+say\b.{0,120}\b(?:blind\s+judge|held[-\s]*out|unproven|improv)/.test(value)
  );
}

function renderBlindScoringGuardReply(): string {
  return [
    'Spark should keep the chip in review, not call it improved or promoted.',
    '',
    'A high score only counts when the review packet shows the baseline, candidate, benchmark cases, held-out/trap/no-op results, blind judge score, adversary and safety verdicts, watchtower, rollback, and human approval together. If the blind judge cannot see held-out proof, Spark should say: promising candidate, not proven improvement.'
  ].join('\n');
}

function renderCreatedDomainChipBenchmarkFollowupReply(chipKey: string): string {
  const label = labelFromDomainChipKey(chipKey);
  return [
    `Spark should treat that as a protected local-check follow-up for ${label}, not as a new benchmark-pack request.`,
    'It can explain that a fresh approval would be needed before any run, but it should not start a benchmark, autoloop, promotion, publication, or raw command from no-action wording.'
  ].join('\n');
}

export function renderLoopEngineeringNoActionProofReply(text = ''): string {
  const createdChipBenchmarkKey = createdDomainChipBenchmarkFollowupKey(text);
  if (createdChipBenchmarkKey) {
    return renderCreatedDomainChipBenchmarkFollowupReply(createdChipBenchmarkKey);
  }
  if (isSafetyAdversaryBindingProofQuestion(text)) {
    return renderSafetyAdversaryBindingProofReply();
  }
  if (isBlindScoringGuardQuestion(text)) {
    return renderBlindScoringGuardReply();
  }
  return [
    'Treat this as QA planning, not a Loop Engineering run.',
    '',
    'A Domain Chip is a reusable Spark playbook for one kind of work. Before Spark can call one safe, it needs locked fresh intent, effective access and runner proof, private/local scope, and authority proof that no publish, API, secret, or unrelated tool action is happening.',
    '',
    'Before Spark can call the chip good, it also needs benchmark cases for the target workflow, held-out and trap checks, watchtower signals, rollback, and a readable review packet. Ask for the proof checklist next, or give me a use case when you want to shape one; I will not create, run, repair, or publish anything from this wording.'
  ].join('\n');
}
