// Reads the shadow intent-proposer log and prints the regex-vs-proposer disagreement summary.
// Usage: npx tsx scripts/analyzeIntentProposerShadow.ts [path-to-jsonl]
// Default path: .spark-intent-proposer-shadow.jsonl (the gitignored runtime log).
//
// This is the measurement the intent diagnosis said is missing. Read it AFTER running real traffic
// with SPARK_INTENT_PROPOSER_SHADOW=1. It enforces nothing; it only tells us where the model and the
// regex cascade disagree, and how confident the model is when it does, so we can decide which routes
// are safe to flip to enforce in Phase 2.

import { existsSync, readFileSync } from 'node:fs';
import { INTENT_PROPOSER_SHADOW_LOG } from '../src/intentProposerLog';

interface Row {
  ts?: string;
  text_preview?: string;
  regex_route?: string;
  proposer_top?: string | null;
  proposer_confidence?: number | null;
  agrees?: boolean;
  abstain?: boolean;
  proposed?: boolean; // true when the proposal was null (model gave nothing)
}

const CONFIDENT = 0.7;

function loadRows(path: string): Row[] {
  if (!existsSync(path)) return [];
  return readFileSync(path, 'utf8')
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)
    .map((l) => {
      try {
        return JSON.parse(l) as Row;
      } catch {
        return null;
      }
    })
    .filter((r): r is Row => r !== null);
}

function tally(items: string[]): Array<[string, number]> {
  const m = new Map<string, number>();
  for (const it of items) m.set(it, (m.get(it) || 0) + 1);
  return [...m.entries()].sort((a, b) => b[1] - a[1]);
}

function main(): void {
  const path = process.argv[2] || INTENT_PROPOSER_SHADOW_LOG;
  const rows = loadRows(path);
  if (rows.length === 0) {
    console.log(`No shadow data at ${path}.`);
    console.log('Enable it: set SPARK_INTENT_PROPOSER_SHADOW=1 in the live bot env and run real turns.');
    return;
  }

  const withProposal = rows.filter((r) => r.proposed !== true && r.proposer_top != null);
  const noProposal = rows.length - withProposal.length;
  const agrees = withProposal.filter((r) => r.agrees === true).length;
  const abstains = rows.filter((r) => r.abstain === true).length;
  const disagree = withProposal.filter((r) => r.agrees !== true && r.abstain !== true);
  const confidentDisagree = disagree.filter((r) => (r.proposer_confidence || 0) >= CONFIDENT);

  const pct = (n: number, d: number) => (d > 0 ? `${((100 * n) / d).toFixed(1)}%` : 'n/a');

  console.log(`Shadow intent-proposer summary  (${path})`);
  console.log('='.repeat(60));
  console.log(`turns logged            ${rows.length}`);
  console.log(`proposer returned       ${withProposal.length}  (no proposal: ${noProposal})`);
  console.log(`agreement rate          ${pct(agrees, withProposal.length)}  (${agrees}/${withProposal.length})`);
  console.log(`abstain rate            ${pct(abstains, rows.length)}  (${abstains}/${rows.length})`);
  console.log(`disagreements           ${disagree.length}`);
  console.log(`  of which confident    ${confidentDisagree.length}  (proposer_confidence >= ${CONFIDENT})`);
  console.log('');

  console.log('Top disagreeing routes (regex_route -> proposer_top : count):');
  const pairs = disagree.map((r) => `${r.regex_route} -> ${r.proposer_top}`);
  for (const [pair, count] of tally(pairs).slice(0, 15)) {
    console.log(`  ${String(count).padStart(4)}  ${pair}`);
  }
  console.log('');

  console.log(`Confident disagreements (the highest-signal cases, up to 20):`);
  for (const r of confidentDisagree.slice(0, 20)) {
    const conf = (r.proposer_confidence || 0).toFixed(2);
    console.log(`  [${conf}] regex=${r.regex_route} proposer=${r.proposer_top}  | ${String(r.text_preview || '').slice(0, 80)}`);
  }
  if (confidentDisagree.length === 0) console.log('  (none yet)');
}

main();
