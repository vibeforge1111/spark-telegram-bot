export const DOMAIN_CHIP_LABS_ARTIFACT_CONTRACT =
  'Domain Chip Labs artifact contract: purpose, triggers, non-triggers, playbook, examples, manifest/hook contract, evals, benchmark pack, score dimensions, allowed mutations, evidence ladder, privacy boundary, watchtower, rollback, review packet, and activation notes.';

export const DOMAIN_CHIP_LABS_LOOP_CONTRACT =
  'Verifiable loop engineering must include baseline/candidate comparison, held-out or trap checks, allowed mutations, watchtower regressions, and no capability-gain claim without evidence.';

export const FULL_CREATOR_SYSTEM_ARTIFACT_PATTERN =
  /\b(?:creator system|creator mission|creator run|full path|domain chip labs?|domain chip.*(?:benchmark|self-improv|watchtower|verifiable loop|loop engineering).*(?:specialization|path|autoloop|loop|watchtower|engineering)|specialization.*benchmark.*autoloop)\b/;

export function domainChipLabsCreatorContractLines(): string[] {
  return [DOMAIN_CHIP_LABS_ARTIFACT_CONTRACT, DOMAIN_CHIP_LABS_LOOP_CONTRACT];
}
