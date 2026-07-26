export type DomainChipLabsContractGroup =
  | 'artifact'
  | 'loop'
  | 'promotion'
  | 'review';

export interface DomainChipLabsContractItem {
  key: string;
  label: string;
  group: DomainChipLabsContractGroup;
  requiredFor: 'starter_kit' | 'loop_engineering' | 'promotion_review';
}

export type DomainChipLabsValidationScope = 'starter_kit' | 'loop_engineering' | 'promotion_review';

export interface DomainChipLabsContractValidation {
  ok: boolean;
  scope: DomainChipLabsValidationScope;
  requiredKeys: string[];
  presentKeys: string[];
  missingKeys: string[];
  presentUnverifiedKeys: string[];
  summary: string;
}

export const DOMAIN_CHIP_LABS_CONTRACT_ITEMS: readonly DomainChipLabsContractItem[] = [
  { key: 'purpose', label: 'purpose', group: 'artifact', requiredFor: 'starter_kit' },
  { key: 'triggers', label: 'triggers', group: 'artifact', requiredFor: 'starter_kit' },
  { key: 'non_triggers', label: 'non-triggers', group: 'artifact', requiredFor: 'starter_kit' },
  { key: 'playbook', label: 'playbook', group: 'artifact', requiredFor: 'starter_kit' },
  { key: 'examples', label: 'examples', group: 'artifact', requiredFor: 'starter_kit' },
  { key: 'manifest_hook_contract', label: 'manifest/hook contract', group: 'artifact', requiredFor: 'starter_kit' },
  { key: 'evals', label: 'evals', group: 'artifact', requiredFor: 'starter_kit' },
  { key: 'benchmark_pack', label: 'benchmark pack', group: 'artifact', requiredFor: 'starter_kit' },
  { key: 'score_dimensions', label: 'score dimensions', group: 'artifact', requiredFor: 'starter_kit' },
  { key: 'allowed_mutations', label: 'allowed mutations', group: 'artifact', requiredFor: 'starter_kit' },
  { key: 'forbidden_mutations', label: 'forbidden mutations', group: 'artifact', requiredFor: 'starter_kit' },
  { key: 'evidence_ladder', label: 'evidence ladder', group: 'artifact', requiredFor: 'starter_kit' },
  { key: 'privacy_boundary', label: 'privacy boundary', group: 'artifact', requiredFor: 'starter_kit' },
  { key: 'watchtower', label: 'watchtower', group: 'artifact', requiredFor: 'starter_kit' },
  { key: 'rollback', label: 'rollback', group: 'artifact', requiredFor: 'starter_kit' },
  { key: 'review_packet', label: 'review packet', group: 'artifact', requiredFor: 'starter_kit' },
  { key: 'activation_notes', label: 'activation notes', group: 'artifact', requiredFor: 'starter_kit' },
  { key: 'baseline_candidate_comparison', label: 'baseline/candidate comparison', group: 'loop', requiredFor: 'loop_engineering' },
  { key: 'held_out_checks', label: 'held-out checks', group: 'loop', requiredFor: 'loop_engineering' },
  { key: 'trap_checks', label: 'trap checks', group: 'loop', requiredFor: 'loop_engineering' },
  { key: 'no_op_checks', label: 'no-op checks', group: 'loop', requiredFor: 'loop_engineering' },
  { key: 'watchtower_regressions', label: 'watchtower regressions', group: 'loop', requiredFor: 'loop_engineering' },
  { key: 'promotion_block', label: 'promotion block', group: 'promotion', requiredFor: 'promotion_review' },
  { key: 'hard_blocker_verdict', label: 'hard-blocker verdict', group: 'promotion', requiredFor: 'promotion_review' },
  { key: 'consumer_transfer', label: 'consumer transfer', group: 'review', requiredFor: 'promotion_review' },
  { key: 'adversary_report', label: 'adversary report', group: 'review', requiredFor: 'promotion_review' },
  { key: 'blind_judge_scorecard', label: 'blind judge scorecard', group: 'review', requiredFor: 'promotion_review' },
  { key: 'safety_judge_verdict', label: 'safety judge verdict', group: 'review', requiredFor: 'promotion_review' },
  { key: 'ux_judge_score', label: 'UX judge score', group: 'review', requiredFor: 'promotion_review' }
] as const;

const ARTIFACT_LABELS = labelsForGroup('artifact');
const LOOP_LABELS = labelsForGroup('loop');
const PROMOTION_LABELS = labelsForGroup('promotion');
const REVIEW_LABELS = labelsForGroup('review');

export const DOMAIN_CHIP_LABS_ARTIFACT_CONTRACT =
  `Domain Chip Labs artifact contract: ${joinContractLabels(ARTIFACT_LABELS)}.`;

export const DOMAIN_CHIP_LABS_LOOP_CONTRACT =
  `Verifiable loop engineering must include ${joinContractLabels(LOOP_LABELS)}, ${joinContractLabels(PROMOTION_LABELS)}, and no capability-gain claim without evidence.`;

export const DOMAIN_CHIP_LABS_REVIEW_CONTRACT =
  `Domain Chip promotion review needs ${joinContractLabels(REVIEW_LABELS)} before transfer or promotion is claimed.`;

export const FULL_CREATOR_SYSTEM_ARTIFACT_PATTERN =
  /\b(?:loop engineering system|loop engineering run|loop engineering|creator system|creator mission|creator run|full path|domain chip labs?|domain chip.*(?:benchmark|self-improv|watchtower|verifiable loop|loop engineering).*(?:specialization|path|autoloop|loop|watchtower|engineering)|specialization.*benchmark.*autoloop)\b/;

export function domainChipLabsCreatorContractLines(): string[] {
  return [DOMAIN_CHIP_LABS_ARTIFACT_CONTRACT, DOMAIN_CHIP_LABS_LOOP_CONTRACT, DOMAIN_CHIP_LABS_REVIEW_CONTRACT];
}

export function domainChipLabsEvidenceStandardLine(): string {
  return DOMAIN_CHIP_LABS_CONTRACT_ITEMS.map((item) => item.label).join(', ');
}

export function domainChipLabsEvidenceSurfaceLine(): string {
  const starterCount = DOMAIN_CHIP_LABS_CONTRACT_ITEMS.filter((item) => item.requiredFor === 'starter_kit').length;
  const loopCount = DOMAIN_CHIP_LABS_CONTRACT_ITEMS.filter((item) => item.requiredFor === 'loop_engineering').length;
  const reviewCount = DOMAIN_CHIP_LABS_CONTRACT_ITEMS.filter((item) => item.requiredFor === 'promotion_review').length;
  return `starter kit (${starterCount} checks), loop proof (${loopCount} checks), and promotion review (${reviewCount} checks)`;
}

export function domainChipLabsContractKeys(): string[] {
  return DOMAIN_CHIP_LABS_CONTRACT_ITEMS.map((item) => item.key);
}

export function validateDomainChipLabsContractPacket(
  packet: unknown,
  scope: DomainChipLabsValidationScope = 'promotion_review'
): DomainChipLabsContractValidation {
  const row = objectValue(packet);
  const requiredItems = domainChipLabsContractItemsForScope(scope);
  const requiredKeys = requiredItems.map((item) => item.key);
  const presentKeys: string[] = [];
  const missingKeys: string[] = [];
  const presentUnverifiedKeys: string[] = [];

  for (const item of requiredItems) {
    const value = row ? row[item.key] : undefined;
    if (!hasContractValue(value)) {
      missingKeys.push(item.key);
      continue;
    }
    presentKeys.push(item.key);
    if (isPresentUnverified(value)) {
      presentUnverifiedKeys.push(item.key);
    }
  }

  const ok = missingKeys.length === 0 && presentUnverifiedKeys.length === 0;
  return {
    ok,
    scope,
    requiredKeys,
    presentKeys,
    missingKeys,
    presentUnverifiedKeys,
    summary: contractValidationSummary(scope, missingKeys, presentUnverifiedKeys)
  };
}

export function formatDomainChipLabsContractProofLine(trace: unknown): string {
  const row = objectValue(trace);
  const packet = row?.domain_chip_labs_contract_packet ?? row?.dcl_contract_packet ?? row?.contract_packet;
  if (!packet) return 'Contract proof: not attached yet.';
  const validation = validateDomainChipLabsContractPacket(packet, 'promotion_review');
  if (validation.ok) return 'Contract proof: promotion review verified.';
  return `Contract proof: promotion review blocked; needs ${formatContractProofNeeds(validation)} (${validation.missingKeys.length} missing, ${validation.presentUnverifiedKeys.length} need verification).`;
}

function domainChipLabsContractItemsForScope(scope: DomainChipLabsValidationScope): DomainChipLabsContractItem[] {
  const rank: Record<DomainChipLabsValidationScope, number> = {
    starter_kit: 1,
    loop_engineering: 2,
    promotion_review: 3
  };
  const requiredRank = rank[scope];
  return DOMAIN_CHIP_LABS_CONTRACT_ITEMS.filter((item) => rank[item.requiredFor] <= requiredRank);
}

function labelsForGroup(group: DomainChipLabsContractGroup): string[] {
  return DOMAIN_CHIP_LABS_CONTRACT_ITEMS
    .filter((item) => item.group === group)
    .map((item) => item.label);
}

function joinContractLabels(labels: string[]): string {
  if (labels.length <= 2) return labels.join(' and ');
  return `${labels.slice(0, -1).join(', ')}, and ${labels[labels.length - 1]}`;
}

function formatContractProofNeeds(validation: DomainChipLabsContractValidation): string {
  return [
    formatContractProofNeedGroup(validation.missingKeys, 'attached proof for'),
    formatContractProofNeedGroup(validation.presentUnverifiedKeys, 'verified proof for')
  ].filter(Boolean).join('; ');
}

function formatContractProofNeedGroup(keys: string[], prefix: string): string {
  if (keys.length === 0) return '';
  const labels = keys.slice(0, 3).map(contractItemLabel);
  const extraCount = keys.length - labels.length;
  const labelText = extraCount > 0 ? `${labels.join(', ')}, and ${extraCount} more` : joinContractLabels(labels);
  return `${prefix} ${labelText}`;
}

function contractItemLabel(key: string): string {
  return DOMAIN_CHIP_LABS_CONTRACT_ITEMS.find((item) => item.key === key)?.label || key.replace(/_/g, ' ');
}

function contractValidationSummary(
  scope: DomainChipLabsValidationScope,
  missingKeys: string[],
  presentUnverifiedKeys: string[]
): string {
  if (missingKeys.length === 0 && presentUnverifiedKeys.length === 0) {
    return `DCL ${scope} contract verified.`;
  }
  const parts = [];
  if (missingKeys.length > 0) parts.push(`missing: ${missingKeys.join(', ')}`);
  if (presentUnverifiedKeys.length > 0) parts.push(`present but unverified: ${presentUnverifiedKeys.join(', ')}`);
  return `DCL ${scope} contract blocked (${parts.join('; ')}).`;
}

function hasContractValue(value: unknown): boolean {
  if (value === null || value === undefined) return false;
  if (typeof value === 'string') return value.trim().length > 0;
  if (typeof value === 'number') return Number.isFinite(value);
  if (typeof value === 'boolean') return true;
  if (Array.isArray(value)) return value.length > 0;
  if (typeof value === 'object') return Object.keys(value).length > 0;
  return false;
}

function isPresentUnverified(value: unknown): boolean {
  if (value === false) return true;
  if (typeof value === 'string') return value.trim().toLowerCase() === 'present_unverified';
  if (Array.isArray(value)) return value.some(isPresentUnverified);
  const row = objectValue(value);
  if (!row) return false;
  if (row.verified === false) return true;
  for (const key of ['status', 'verdict', 'evidence_tier', 'readiness']) {
    const field = row[key];
    if (typeof field !== 'string') continue;
    const normalized = field.trim().toLowerCase();
    if (!normalized) continue;
    if (normalized === 'present_unverified') return true;
    if (['blocked', 'failed', 'fail', 'missing', 'pending', 'unverified', 'not_passed'].includes(normalized)) return true;
  }
  return false;
}

function objectValue(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null;
}
