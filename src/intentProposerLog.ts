// Shadow-proposer measurement log (Phase 1, observe-only).
//
// Appends one JSONL row per turn recording regex-route vs proposer-route agreement, so we can
// measure where the model and the regex cascade disagree before changing any live routing. Writes
// to a gitignored runtime file (.spark-intent-proposer-shadow.jsonl). FAIL-SAFE: never throws, so a
// disk/permission error cannot affect the handler. Stores only a short, length-capped text preview.

import { appendFileSync } from 'node:fs';
import type { ProposalAgreement, IntentProposal } from './intentProposerShadow';

export const INTENT_PROPOSER_SHADOW_LOG = '.spark-intent-proposer-shadow.jsonl';

const PREVIEW_MAX = 200;

export interface IntentProposerShadowRecord {
  text: string;
  agreement: ProposalAgreement;
  proposal: IntentProposal | null;
  // Optional enforcement outcome for the audit trail (Phase 2 nudge / Phase 2b veto). Observe-only
  // logging: these record what the kernel decided, never affect it.
  enforcement?: { mode: string; route?: string; confidence?: number } | null;
  veto?: { veto: boolean; route?: string; confidence?: number; reason?: string } | null;
}

export function logIntentProposerShadow(
  record: IntentProposerShadowRecord,
  logPath: string = INTENT_PROPOSER_SHADOW_LOG
): void {
  try {
    const row = {
      ts: new Date().toISOString(),
      text_preview: String(record.text || '').slice(0, PREVIEW_MAX),
      regex_route: record.agreement.regexRoute,
      proposer_top: record.agreement.proposerTop,
      proposer_confidence: record.agreement.proposerConfidence,
      agrees: record.agreement.agrees,
      abstain: record.agreement.abstain,
      proposed: record.proposal === null,
      candidates: record.proposal ? record.proposal.candidates.slice(0, 3) : [],
      enforcement: record.enforcement ?? null,
      veto: record.veto ?? null
    };
    appendFileSync(logPath, `${JSON.stringify(row)}\n`, 'utf8');
  } catch {
    // observe-only: a logging failure must never affect the turn.
  }
}
