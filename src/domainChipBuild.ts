import type { ChipCreateResult } from './chipCreate';

function normalizeDomainChipBriefForKey(brief: string): string {
  let value = String(brief || '').replace(/\s+/g, ' ').trim();
  for (let i = 0; i < 6; i += 1) {
    const before = value;
    value = value.replace(
      /^\s*(?:let'?s\s+|shall\s+we\s+|please\s+|hey\s+|ok\s+|okay\s+|can\s+you\s+|could\s+you\s+|would\s+you\s+)+/i,
      ''
    );
    value = value.replace(
      /^\s*(?:make|build|create|scaffold|generate|spin\s+up|cook\s+up|craft|author|whip\s+up)\s+(?:me\s+|us\s+)?/i,
      ''
    );
    value = value.replace(/^\s*i\s+(?:need|want|could\s+use|would\s+like)\s+/i, '');
    value = value.replace(/^\s*(?:a|an|another|new)\s+/i, '');
    value = value.replace(
      /^\s*(?:(?:private|local|starter|spark|advanced|custom)\s+)*(?:domain[-\s]*)?chip\s+(?:(?:together\s+)?(?:for|to|around|about)\s+|called\s+|named\s+)?/i,
      ''
    );
    value = value.replace(/^\s*domain-chip-[\w-]+\s*[:,-]?\s*/i, '');
    value = value.replace(/^\s*(?:for|that|which|to|about)\s+/i, '');
    if (value === before) break;
  }
  return value.replace(/[.!?,]+$/g, '').trim();
}

function slugForDomainChipBrief(brief: string): string {
  const slug = normalizeDomainChipBriefForKey(brief)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .split('-')
    .filter(Boolean)
    .slice(0, 5)
    .join('-');
  return slug || 'custom-domain-chip';
}

export function projectNameForDomainChipBrief(brief: string): string {
  const base = slugForDomainChipBrief(brief);
  return base.startsWith('domain-chip-') ? base : `domain-chip-${base}`;
}

export function buildDomainChipCapabilityProposalPacket(brief: string): Record<string, unknown> {
  const chipKey = projectNameForDomainChipBrief(brief);
  return {
    schema_version: 'spark.capability_proposal.v1',
    status: 'proposal_plan_only',
    capability_goal: brief,
    recipient: 'Spark',
    implementation_route: 'domain_chip',
    owner_system: 'Spark domain chip runtime',
    permissions_required: ['operator_approval_to_activate'],
    safe_probe: 'Create the chip in a local or shadow route first, then prove only matching domain language invokes it.',
    human_approval_boundary: 'Operator approval is required before activating the chip in the live Spark router.',
    rollback_path: `Disable or remove ${chipKey} from the chip registry and delete its runtime attachment.`,
    activation_path: 'Register the chip manifest through the Spark chip attachment contract after tests pass.',
    eval_or_smoke_test: 'Router-invocation smoke test plus a fallthrough test for unrelated natural language.',
    capability_ledger_key: `domain_chip:${chipKey}`,
    claim_boundary: 'This packet is a proposal plan, not proof that Spark has gained the capability.'
  };
}

export function buildDomainChipPrd(brief: string): string {
  const chipKey = projectNameForDomainChipBrief(brief);
  return [
    `Create a Spark domain chip named ${chipKey}.`,
    '',
    `Natural-language chip brief: ${brief}`,
    '',
    'Build this as a complete private Domain Chip starter kit, not a generic PRD.',
    'This must use the current Spark-compatible domain chip standards, not older domain-chip-labs-only assumptions.',
    'If this chip adds an executable Spark capability, follow Builder docs/CAPABILITY_PROPOSAL_STANDARD_V1.md: classify the route, name permissions, safe probe, approval boundary, rollback, eval, activation path, and capability ledger key before claiming the capability is live.',
    '',
    'Required starter kit:',
    '- domain-chip/manifest.json with chip key, domain purpose, target users, trigger language, non-trigger language, privacy boundary, and activation notes.',
    '- domain-chip/playbook.md with intake questions, decision checklist, output format, good/risky examples, edge case, and no-op case.',
    '- domain-chip/hooks/ or equivalent hook contract that can be invoked through the Spark attachments/chips runtime.',
    '- benchmark/manifest.json with visible cases, held-out cases, trap cases, no-op cases, scoring dimensions, pass thresholds, and judge instructions.',
    '- benchmark/cases/ with at least two visible cases, two held-out cases, one trap case, and one unrelated non-trigger case.',
    '- autoloop/policy.json with baseline, candidate, comparison method, allowed mutations, forbidden mutations, stop conditions, promotion block, watchtower regression checks, and rollback.',
    '- reports/evidence_ladder.md that names baseline, candidate, score delta, held-out/trap/no-op verdicts, blind review, consumer transfer, adversary review, safety review, UX review, and hard blockers as present_unverified until proven.',
    '- reports/review_packet.md that a first-time user can read without internal route jargon.',
    '',
    'Experience requirements:',
    '- Make the chip useful for the specific domain in the brief, not a template with the domain name pasted in.',
    '- Prefer plain language in review packets. Do not expose router internals, local paths, trace ids, provider labels, or release metadata in user-facing copy.',
    '- Ask at most one clarifying question in the final response, and only if it blocks a better first version.',
    '- Keep the chip private/local. Do not publish, share, register globally, or claim network absorption.',
    '',
    'Router and safety requirements:',
    '- Include precise intent keywords and no generic keyword hijacking.',
    '- Avoid deterministic slash-command handoffs in Telegram-facing text; the chip should work from natural language.',
    '- Validate that unrelated mentions of "chip" do not route to this chip.',
    '- Register or document the runtime activation step if the scaffolder does not activate it automatically.',
    '',
    'Acceptance checks:',
    `- The created chip key is ${chipKey} or a clearly justified close variant.`,
    '- The chip package includes domain-chip, benchmark, autoloop, reports, watchtower, and rollback artifacts.',
    '- The benchmark pack can score baseline versus candidate output and includes held-out, trap, and no-op cases.',
    '- The autoloop policy blocks promotion unless before/after score movement, held-out/trap/no-op checks, watchtower, rollback, and approval are present.',
    '- The chip can be discovered by the Spark chip router for matching domain language without stealing unrelated turns.',
    '- A non-domain phrase like "we talked about chips and snacks earlier" falls through conversationally.',
    '- The final response reports chip key, artifact status, benchmark/autoloop status, privacy boundary, and any blockers.'
  ].join('\n');
}

export function domainChipBuildModeForBrief(_brief: string): { buildMode: 'direct' | 'advanced_prd'; reason: string } {
  return {
    buildMode: 'advanced_prd',
    reason: 'Private Domain Chip starter needs checklist, examples, evals, rollback, and watchtower proof.'
  };
}

function safeArtifactRef(value: string | undefined): string | null {
  const ref = value?.trim();
  if (!ref || ref.length > 140) return null;
  if (ref.startsWith('/') || ref.startsWith('~') || ref.includes('\\') || ref.includes(':')) return null;
  if (ref.split('/').some((part) => part === '..' || part === '')) return null;
  return ref;
}

function safeSchemaRef(value: string | undefined): string | null {
  const ref = value?.trim();
  if (!ref || ref.length > 120) return null;
  return /^[a-z0-9._-]+$/i.test(ref) ? ref : null;
}

const QA_EVIDENCE_LABELS: Record<string, string> = {
  positive_score_delta: 'positive benchmark movement',
  no_positive_score_delta: 'positive benchmark movement',
  blind_judge_score_range: 'cited blind score',
  blind_judge_score_refs: 'cited blind score',
  blind_judge_score_missing: 'cited blind score',
  safety_component_scores_present: 'safety clearance',
  safety_score_range: 'safety clearance',
  safety_required_boundaries_clear: 'safety clearance',
  safety_judge_clear: 'safety clearance',
  safety_judge_pending: 'safety clearance',
  safety_clearance_missing: 'safety clearance',
  adversary_clear: 'adversary clearance',
  adversary_review_pending: 'adversary clearance',
  judge_disagreement_under_review_threshold: 'blind judge agreement',
  consumer_transfer_passed: 'consumer transfer',
  consumer_transfer_without_creator_notes: 'consumer transfer',
  consumer_transfer_not_claimed: 'consumer transfer',
  operator_approval_attached: 'operator approval',
  operator_approval_missing: 'operator approval',
  operator_publication_approval_missing: 'operator approval',
  watchtower_ready: 'watchtower proof',
  rollback_ready: 'rollback proof',
};

function readableQaEvidenceItem(value: string): string | null {
  const raw = value.trim();
  if (!raw || raw.length > 80 || raw.startsWith('/') || raw.includes('\\') || raw.includes(':')) return null;
  const normalized = raw.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
  const mapped = QA_EVIDENCE_LABELS[normalized] || raw.toLowerCase();
  if (!/^[a-z0-9][a-z0-9 -]{1,60}$/.test(mapped)) return null;
  return mapped;
}

function formatHumanList(items: string[]): string {
  if (items.length <= 1) return items[0] || '';
  if (items.length === 2) return `${items[0]} and ${items[1]}`;
  return `${items.slice(0, -1).join(', ')}, and ${items[items.length - 1]}`;
}

function formatQaEvidenceBlockers(proofArtifacts: ChipCreateResult['proofArtifacts']): string | null {
  const rawItems = proofArtifacts?.qaEvidenceLaneNextEvidence?.length
    ? proofArtifacts.qaEvidenceLaneNextEvidence
    : proofArtifacts?.qaEvidenceLaneBlockers;
  if (!rawItems?.length) return null;
  const labels = Array.from(new Set(rawItems
    .map((item) => readableQaEvidenceItem(item))
    .filter((item): item is string => Boolean(item))))
    .slice(0, 6);
  if (!labels.length) return null;
  return `QA blockers: ${formatHumanList(labels)}.`;
}

function formatBenchmarkPackSummary(proofArtifacts: ChipCreateResult['proofArtifacts']): string | null {
  const count = proofArtifacts?.benchmarkCaseCount;
  const trapCount = proofArtifacts?.trapCaseCount;
  const lanes = proofArtifacts?.benchmarkCaseLanes;
  if (!count || !trapCount || !lanes) return null;
  const expected = [
    ['development', lanes.development],
    ['held-out', lanes.heldOut],
    ['no-op', lanes.noOp],
    ['adversarial', lanes.adversarial],
  ] as const;
  if (expected.some(([, value]) => !value)) return null;
  return `Benchmark pack: ${count} practice checks covering examples, hidden-style checks, no-action checks, and safety challenges, plus ${trapCount} trick cases.`;
}

function sanitizeCreateWarning(warning: string): string | null {
  const text = warning.trim();
  if (!text) return null;
  if (/built-in starter scaffold/i.test(text)) {
    return 'Domain Chip Labs root was unavailable, so Spark used the built-in private starter scaffold.';
  }
  if (/NoneType.*get_path|get_path.*NoneType/i.test(text)) {
    return 'Attachment registration was skipped in this local run.';
  }
  const withoutPaths = text
    .replace(/(?:\/[A-Za-z0-9._ -]+)+/g, '[local path]')
    .replace(/[A-Za-z]:\\[^\s;]+/g, '[local path]')
    .replace(/'[^']*(?:NoneType|get_path)[^']*'/g, 'internal attachment detail');
  return withoutPaths.length > 180 ? `${withoutPaths.slice(0, 177)}...` : withoutPaths;
}

export function formatDomainChipBuildPreview(brief: string): string {
  const projectName = projectNameForDomainChipBrief(brief);
  return [
    `I can turn this into a private Domain Chip: ${projectName}.`,
    'A Domain Chip is a reusable Spark playbook for one kind of work. I will make the trigger, checklist, examples, local starter checks, and rollback notes so it stays private until the proof is stronger.',
    'Next: Reply "go" and I will make the private starter kit. Or tell me the first real workflow it should handle in your own words.'
  ].join('\n\n');
}

function domainChipCreateFailureBlocker(error: string | undefined): string {
  const text = String(error || '');
  if (/governor|authority|authorization|Harness Core/i.test(text)) {
    return 'Creation blocker: Builder authority proof was missing or rejected.';
  }
  if (/provider|No providers are configured|LLM secret|auth_method/i.test(text)) {
    return 'Creation blocker: Builder provider proof is not ready.';
  }
  if (/timeout|timed out|ETIMEDOUT/i.test(text)) {
    return 'Creation blocker: the private chip scaffolder timed out before returning creation proof.';
  }
  if (/invalid JSON|did not return|returned invalid/i.test(text)) {
    return 'Creation blocker: the private chip scaffolder did not return usable creation proof.';
  }
  return 'Creation blocker: the private chip scaffolder failed before returning creation proof.';
}

export function formatDomainChipCreateFailure(projectName: string, error?: string): string {
  return [
    `I could not create ${projectName} yet.`,
    domainChipCreateFailureBlocker(error),
    'Next: send the chip idea again after Builder health is green, and I will rebuild the private draft.',
    'Nothing was published or activated.'
  ].join('\n\n');
}

export function isDomainChipFailureCopyNoActionQuestion(text: string): boolean {
  const normalized = String(text || '').toLowerCase().replace(/\s+/g, ' ').trim();
  return Boolean(
    normalized &&
    /\b(?:do not|don't|dont|not asking you to|i am not asking you to|no action|explain only)\b.{0,160}\b(?:create|run|benchmark|autoloop|repair|publish|promote|start|launch)\b/.test(normalized) &&
    /\bdomain\s+chip\b/.test(normalized) &&
    /\b(?:creation|create|scaffold|scaffolder|builder)\b/.test(normalized) &&
    /\bfails?\b/.test(normalized) &&
    /\b(?:explain|reply|message|copy|first[-\s]+time|confusing|user)\b/.test(normalized)
  );
}

export function renderDomainChipFailureCopyNoActionReply(): string {
  return [
    'Spark should say the chip was not created, name one plain blocker, and give one next action.',
    '',
    'It should hide raw commands, local paths, stack traces, and the full prompt; nothing should be published or activated from a failed create.'
  ].join('\n');
}

export function isDomainChipNoActionAdvisoryQuestion(text: string): boolean {
  const normalized = String(text || '').toLowerCase().replace(/\s+/g, ' ').trim();
  if (!normalized) return false;
  if (
    /\b(?:not a command|quoted words?|words? as examples?|examples? of risky triggers?|risky triggers?)\b/.test(normalized) ||
    /\bdiscussing the words?\b/.test(normalized)
  ) {
    return false;
  }
  if (
    /\b(?:domain\s+chip\s+labs|loop\s+engineering\s+run)\b/.test(normalized) &&
    /\b(?:what\s+proof|proof\s+would|proof\s+spark|considered\s+safe|safe\s+to\s+run)\b/.test(normalized)
  ) {
    return false;
  }
  if (
    /\bdomain-chip-[a-z0-9][a-z0-9-]{1,100}\b/.test(normalized) &&
    /\b(?:what\s+should\s+happen|what\s+should\s+spark\s+do|how\s+should\s+spark\s+handle|should\s+happen\s+when)\b/.test(normalized) &&
    /\brun\s+the\s+benchmarks?\s+for\s+it\b/.test(normalized)
  ) {
    return false;
  }
  const mentionsChip = /\b(?:domain[-\s]*chip|chip)\b/.test(normalized);
  const asksAdvisory =
    /\b(?:hypothetical|what\s+would|what\s+should|would\s+you|should\s+it|check\s+first|prepare\s+an?\s+evidence\s+brief|evidence\s+brief)\b/.test(normalized);
  const noActionBoundary =
    /\b(?:do\s+not|don't|dont|no\s+need\s+to|not\s+asking\s+(?:you\s+)?to)\b.{0,180}\b(?:start|run|browse|call|edit|write|send|alert|benchmark|autoloop|publish|activate|promote|create|make)\b/.test(normalized) ||
    /\b(?:hypothetical\s+only|explain\s+only|advisory\s+only)\b/.test(normalized);
  return mentionsChip && asksAdvisory && noActionBoundary;
}

export function renderDomainChipNoActionAdvisoryReply(chipLabel = 'this Domain Chip'): string {
  const label = chipLabel.trim() || 'this Domain Chip';
  const normalized = label.toLowerCase();
  if (/\b(?:project\s+maintenance|repo|repository|dirty\s+work|stale\s+todo|doc\s+drift|documentation\s+drift|failing\s+test)\b/.test(normalized)) {
    return [
      `For ${label}, I would first check the maintenance goal, the repo evidence the user already supplied, dirty-work boundaries, failing-test symptoms, stale TODO ownership, and doc-drift risk.`,
      'I would separate facts from guesses before recommending anything: what is safe to inspect, what should stay report-only, and what needs explicit approval before a file, test command, or cleanup loop runs.',
      'I would not read or edit files, run tests, start a benchmark or autoloop, clean the repo, publish, activate, or promote anything from that wording.'
    ].join('\n\n');
  }
  if (/\b(?:daily\s+schedule|schedule|calendar|reminder|timezone|recurring|missed\s+window)\b/.test(normalized)) {
    return [
      `For ${label}, I would first check the scheduling goal, timezone evidence the user already supplied, recurrence rules, missed-window context, approval boundaries, and whether a reminder would touch a real calendar or message channel.`,
      'I would keep uncertain dates explicit before recommending anything: what can be answered from the prompt, what needs clarification, and what would require operator approval before a reminder is created.',
      'I would not create reminders, mutate calendars, send messages, run benchmarks or autoloops, publish, activate, or promote anything from that wording.'
    ].join('\n\n');
  }
  if (/\b(?:codebase\s+optimization|optimization|performance|perf|quality\s+improvement|rollback)\b/.test(normalized)) {
    return [
      `For ${label}, I would first check the optimization goal, baseline evidence already supplied, target metric, held-out checks, rollback boundary, and whether the change could game the benchmark.`,
      'I would separate measurement from mutation before recommending anything: what can be inspected as evidence, what needs a same-budget comparison, and what requires approval before editing code or running a loop.',
      'I would not edit files, run tests, benchmark, start an autoloop, optimize code, publish, activate, or promote anything from that wording.'
    ].join('\n\n');
  }
  if (/\b(?:b2c|reachout|outreach|crm|customer|lead|follow[-\s]?up|opt[-\s]?out)\b/.test(normalized)) {
    return [
      `For ${label}, I would first check the audience, consent or opt-out evidence, sensitive-category risk, segmentation goal, follow-up cadence, and whether any draft could become a real send.`,
      'I would keep the boundary as draft-only before recommending anything: what can be written from supplied sandbox context, what needs privacy review, and what needs explicit approval before any customer action.',
      'I would not look up customers, edit CRM records, draft against real private data, send messages, run benchmarks or autoloops, publish, activate, or promote anything from that wording.'
    ].join('\n\n');
  }
  if (/\b(?:pull\s+request|pr\s+risk|code\s+review|review\s+risk)\b/.test(normalized)) {
    return [
      `For ${label}, I would first check the review goal, PR evidence the user already supplied, changed surfaces, test signals, migration or security risk, and whether any claim depends on files I have not been given.`,
      'I would separate review facts from hypotheses before recommending anything: what is visible in the supplied diff, what needs reviewer judgment, and what needs explicit approval before running tools.',
      'I would not read files, run tests, inspect a repository, post review comments, run benchmarks or autoloops, publish, activate, or promote anything from that wording.'
    ].join('\n\n');
  }
  return [
    `For ${label}, I would first check the user's goal, the sources they already supplied, source dates/freshness, conflicts between sources, and which claims are facts versus hypotheses.`,
    'I would also check the recommendation boundary before writing anything: what is allowed as an operator recommendation, what must stay as uncertainty, and what should be escalated for review.',
    'I would not browse, call external sources, edit files, run benchmarks or autoloops, send alerts, publish, activate, or promote anything from that wording.'
  ].join('\n\n');
}

export function formatDomainChipCreatedReceipt(result: ChipCreateResult, fallbackProjectName: string): string {
  const chipName = result.chipKey || fallbackProjectName;
  const proofArtifacts = result.proofArtifacts;
  const paragraphs = [`Domain Chip created: ${chipName}`];

  if (proofArtifacts?.benchmarkPack || proofArtifacts?.autoloopPolicy || proofArtifacts?.proofCapsule) {
    paragraphs.push('Private starter kit is ready. It includes the trigger, playbook, examples, local starter checks, independent review packets, safety monitoring notes, and rollback notes.');
    const benchmarkSummary = formatBenchmarkPackSummary(proofArtifacts);
    if (benchmarkSummary) {
      paragraphs.push(benchmarkSummary.replace('Benchmark pack:', 'Starter checks:'));
    }
  } else {
    paragraphs.push('Private starter kit was scaffolded, but the proof summary was not attached.');
  }

  if (proofArtifacts?.evaluateRunContract) {
    paragraphs.push('Spark can run the first local check now. That check is only starter evidence; it cannot prove quality or self-improvement by itself.');
  } else if (proofArtifacts?.benchmarkPack || proofArtifacts?.autoloopPolicy) {
    paragraphs.push('Local check files are present; stronger claims still need executed proof.');
  }

  if (proofArtifacts?.reviewRolePacketCount && proofArtifacts.reviewRolePacketCount >= 5 || proofArtifacts?.qaEvidenceLanePacket) {
    paragraphs.push('The independent review packets are staged, but no reviewer has passed it yet.');
  }

  paragraphs.push(
    'Still needed before anyone relies on it: a useful before/after win, review checks the chip has not seen, safety challenge review, a cold-user trial, rollback proof, an evidence audit, and human approval.',
    'Next: say "run the private check" or "run the benchmark for it" to run the starter check, or ask for the proof checklist.',
    result.routerInvokable
      ? 'Activation: not public; keep it private until route tests and operator approval pass.'
      : 'Activation: not activated globally.',
    'Privacy: private/local only.'
  );

  const warnings = Array.from(new Set((result.warnings || [])
    .map((warning) => sanitizeCreateWarning(warning))
    .filter((warning): warning is string => Boolean(warning)))).slice(0, 2);
  if (warnings.length > 0) {
    paragraphs.push(`Blocker/warning: ${warnings.join('; ')}`);
  }

  return paragraphs.join('\n\n');
}
