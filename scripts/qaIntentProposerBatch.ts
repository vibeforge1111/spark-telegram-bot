// QA batch for the shadow intent proposer: runs a curated scenario set through the REAL regex
// router (decideNaturalRoute) and the REAL GLM proposer (intentProposerProviderComplete), appends
// to the same .spark-intent-proposer-shadow.jsonl the live Telegram turns use, and prints a SCORED
// table (regex vs expected, proposer vs expected). This grows the measurement corpus fast without
// driving Telegram, using the identical components. Enforces nothing.
//
// Run from the checkout: npx tsx scripts/qaIntentProposerBatch.ts
// Needs provider env: loads the checkout .env and sources ZAI_API_KEY from the live home if absent.

import { config as dotenvConfig } from 'dotenv';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

dotenvConfig({ path: path.join(process.cwd(), '.env') });
dotenvConfig({ path: path.join(process.cwd(), '.env.override'), override: true });
if (!process.env.ZAI_API_KEY) {
  try {
    const m = fs.readFileSync(path.join(os.homedir(), '.spark/state/spark-intelligence/.env'), 'utf8')
      .match(/^\s*ZAI_API_KEY\s*=\s*(.+)\s*$/m);
    if (m) process.env.ZAI_API_KEY = m[1].trim().replace(/^["']|["']$/g, '');
  } catch { /* leave unset; completer will fail-safe to '' */ }
}

import { decideNaturalRoute } from '../src/naturalRouteDecision';
import { runIntentProposerShadow } from '../src/intentProposerShadow';
import { intentProposerProviderComplete } from '../src/intentProposerCompleter';
import { logIntentProposerShadow } from '../src/intentProposerLog';

// expected = the TRUE intent (my judgment). 'plain_chat' covers questions / negations / reported
// speech / benign chat / reads-that-should-not-mutate.
const SCENARIOS: Array<{ text: string; expected: string; kind: string }> = [
  // --- real commands (should route to a mutation) ---
  { text: 'build a fishing stats dashboard app', expected: 'spawner.build', kind: 'command' },
  { text: 'delete the 9am schedule', expected: 'schedule.delete', kind: 'command' },
  { text: 'create a domain chip for fintech compliance', expected: 'domain_chip.create', kind: 'command' },
  { text: 'switch my chat model to claude', expected: 'model.switch', kind: 'command' },
  { text: 'remember that I prefer codex for missions', expected: 'memory.write', kind: 'command' },
  { text: 'show me the mission board', expected: 'spawner.board', kind: 'command' },
  // --- recall holes (regex tends to drop these to chat) ---
  { text: 'run the diagnostics', expected: 'diagnostics.scan', kind: 'recall' },
  { text: 'save this: I use zai for chat', expected: 'memory.write', kind: 'recall' },
  { text: 'forget what I said about codex', expected: 'memory.delete', kind: 'recall' },
  { text: 'look into github.com/foo/bar for me', expected: 'spawner.external_research', kind: 'recall' },
  { text: 'kick off a diagnostics sweep', expected: 'diagnostics.scan', kind: 'recall' },
  // --- precision / hijack (should STAY chat, must not mutate) ---
  { text: 'should i build a chip for this?', expected: 'plain_chat', kind: 'precision' },
  { text: 'i dont think we should build the dashboard', expected: 'plain_chat', kind: 'precision' },
  { text: 'the doc says delete the schedule', expected: 'plain_chat', kind: 'precision' },
  { text: 'why did the build fail last night?', expected: 'plain_chat', kind: 'precision' },
  { text: 'what does it mean to research a repo here', expected: 'plain_chat', kind: 'precision' },
  { text: 'earlier you said create a chip, did that run?', expected: 'plain_chat', kind: 'precision' },
  // --- reads / benign ---
  { text: 'what do you remember about my preferences', expected: 'spark_wiki.answer', kind: 'read' },
  { text: 'whats my access level right now', expected: 'spark.read_only_state', kind: 'read' },
  { text: 'hey how is it going today', expected: 'plain_chat', kind: 'chat' }
];

function ok(actual: string | null | undefined, expected: string): boolean {
  return actual === expected;
}

async function main(): Promise<void> {
  if (!process.env.ZAI_API_KEY) {
    console.log('No ZAI_API_KEY available; the proposer will return nothing. Aborting.');
    return;
  }
  let regexRight = 0;
  let proposerRight = 0;
  const rows: string[] = [];
  for (const s of SCENARIOS) {
    const regexRoute = decideNaturalRoute(s.text, {} as any).route;
    const { proposal, agreement } = await runIntentProposerShadow(s.text, regexRoute, intentProposerProviderComplete);
    logIntentProposerShadow({ text: s.text, agreement, proposal });
    const propTop = agreement.proposerTop;
    const rOk = ok(regexRoute, s.expected);
    const pOk = ok(propTop, s.expected);
    if (rOk) regexRight++;
    if (pOk) proposerRight++;
    rows.push(
      `${s.kind.padEnd(9)} regex=${(rOk ? 'OK ' : 'XX ')}${String(regexRoute).padEnd(20)} prop=${(pOk ? 'OK ' : 'XX ')}${String(propTop).padEnd(18)} exp=${s.expected.padEnd(20)} | ${s.text.slice(0, 42)}`
    );
  }
  console.log('QA batch: scored route accuracy vs expected intent');
  console.log('='.repeat(70));
  for (const r of rows) console.log(r);
  console.log('='.repeat(70));
  console.log(`regex correct:    ${regexRight}/${SCENARIOS.length}`);
  console.log(`proposer correct: ${proposerRight}/${SCENARIOS.length}`);
}

main();
