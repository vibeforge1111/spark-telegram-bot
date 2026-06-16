# Spark Memory And Context Honest Verdict

Date: 2026-06-16

Scope: Spark Telegram memory/context behavior, with emphasis on natural human
conversation, recent context, durable memory, wiki/source boundaries, Harness
authority, owner evidence, and Telegram readability.

This is an assessment document, not a patch plan disguised as a fix. The goal
is to say where the system is genuinely working, where evidence is still thin,
and what structural improvements would make the memory/context system safer and
more human without deterministic transcript patches.

## Executive Verdict

- Overall readiness for memory/context conversations: `6.8/10`.
- Recent-context continuity is in decent shape. Spark can now answer some
  natural project-return and preference-follow-up turns without claiming durable
  memory or starting work.
- No-action safety around memory-like and route-like wording is much stronger
  than before. Several live Telegram/CUA checks show no mission/build side
  effects, and fixture coverage guards memory-write hijacks.
- Durable memory truth is not yet proven enough live. Fixture tests show the
  intended owner path, but we still need a live Telegram save -> restart ->
  recall -> source explanation loop through Builder/domain-chip-memory.
- Human reply quality improved, especially after removing awkward
  `unsaved`/`non-durable` phrasing from ordinary preference acknowledgements.
  It is still uneven when Spark enters diagnostic or operator-ish modes.
- The biggest remaining risk is lane/source confusion: a plausible answer from
  the wrong source can still look correct unless the trace joins selected route,
  Harness/Governor decision, owner proof, and outbound delivery.
- The right next move is not more phrase patches. It is a memory/context
  evidence harness that makes every answer explainable by lane: recent frame,
  durable memory, wiki support, owner state, or unknown.
- Launch posture: recent-context and chat-only memory boundaries can continue
  in supervised live QA. Durable memory should not be marketed as fully ready
  until owner-backed live recall and restart survival pass.

## What Is Working Well

| Area | Verdict | Evidence |
| --- | --- | --- |
| Recent project return | Good | Live update `749543699`: after a provider-status detour, Spark returned to the Moss Window context, said no decision had been reached, offered three directions, and did not claim durable memory. |
| Healthy preference acknowledgement | Good | Live update `749543709`: user said they usually like short, source-bound launch QA updates; Spark replied naturally, did not claim a save, did not call it unsaved, and did not start a mission. |
| Privacy/no-save edge | Good but narrow | Live update `749543708`: Spark respected a scoped preference and avoided awkward lane jargon. This should remain a privacy edge, not the default memory test shape. |
| Memory-write owner boundary | Good in fixtures | `tests/buildE2E.test.ts` proves explicit memory directives can route through governed `memory.write`, pass Governor decision into the Builder memory writer, and avoid saving unrelated no-execution text. |
| Builder-off fallback | Good in fixtures | When Builder is off, natural memory directives do not materialize Telegram-local durable memory and the ledger records no durable success. |
| Quoted route/tool words inside memory content | Good in fixtures | Memory directive tests keep quoted browser/computer-use/mission/chip terms as memory content rather than tool triggers. |
| Route-word no-action boundary | Good | Live provider/build/recursive route-word checks show words like `provider`, `build`, and `recursive` can be discussed without becoming owner-state reads or actions. |
| Traceable no-side-effect evidence | Improving | Several live checks record route, update id, outbound audit, and `mission_id_present=false`. This is the right shape. |

## Where The Gaps Still Are

| Gap | Severity | Why It Matters | Improvement Needed |
| --- | --- | --- | --- |
| Telegram delivery path can block live memory QA | P0 | A memory/context test is only live evidence if Telegram can deliver the user turn and receive the bot answer. On the second QA round, Telegram Desktop showed `connecting...`, the CUA-sent message stayed pending, `spark status` timed out on `spark-telegram-bot`, and `npm run health:polling` failed because Telegram Bot API `getMe` timed out. | Add a preflight gate before memory QA: Telegram Desktop connected, Bot API reachable, `health:polling` pass, and one harmless delivery canary before scoring any memory behavior. |
| No full live durable memory loop yet | P0 | We cannot honestly say durable memory is launch-ready from Telegram until a real user preference is saved through the owner, survives restart, recalls correctly, and explains its source. | Run a live Telegram/CUA save -> recall -> restart -> recall -> "is this saved or recent?" suite with Builder/domain-chip-memory proof. |
| Lane labels are not first-class evidence | P0 | Spark can sound plausible while using the wrong lane. Without a source card, QA has to reconstruct truth from scattered logs. | Add a Memory/Context Source Card per turn: selected lane, owner, source ids, recall method, confidence, vetoes, and visible-reply claim. |
| Recent frame vs persisted frame vs durable memory can blur | P0 | Restart survival is not the same as durable memory. Users will ask "do you still know?" and Spark must not overclaim. | Separate `hot_turn`, `warm_frame`, `persisted_frame`, and `durable_memory` in traces and answer-source decisions. |
| Live CUA text extraction remains flaky | P1 | Screenshots prove what a human saw, but automated text readout is unreliable, making large QA runs slower and more manual. | Keep screenshots plus ledgers for now; improve CUA readout or Telegram update fetch join before large-scale scoring. |
| Builder answer-source contamination is a recurring class | P1 | Prior failures showed safe chat routes receiving Memory Doctor/onboarding/provider-style detours. Suppression exists, but the system needs clearer owner-source contracts. | Harden the Builder bridge contract: route-selected owner must match final answer source, or the final-answer gate falls back with an auditable reason. |
| Durable memory recall quality is under-sampled | P1 | Write success is not recall quality. A stored item can still be too broad, stale, or poorly ranked later. | Add recall evals for preference, project context, supersession, stale memory conflict, and "what do you know about me?" |
| Cross-user and group context need stronger live proof | P1 | Memory correctness is partly isolation. Fixture tests cover user separation, but Telegram live multi-chat proof is missing. | Add supervised Telegram tests for second user/chat/group-like context with no cross-user recall. |
| Wiki/current truth interaction is still mostly planned | P1 | Users will ask memory/wiki/current-state conflict questions. Wrong precedence can create stale truth. | Live wiki probes: wiki says old state, current owner says new state; answer must cite support without overriding live owner truth. |
| Telegram readability for diagnostic memory answers is uneven | P2 | Technical correctness can still feel hostile or unreadable. | Apply rich formatting selectively: short paragraphs, one source line when useful, no dense IDs unless asked. |

## Socratic Contradictions

| Assumption | Evidence For | Evidence Against / Missing | Honest Conclusion |
| --- | --- | --- | --- |
| "Memory is working now." | Explicit memory directives have fixture coverage and Harness ledgers. | No full live save/restart/recall/source-explanation loop has been documented. | Too broad. Say "memory boundaries are improving; durable memory still needs live proof." |
| "Recent context is safe to use." | Moss Window topic-return and Trace Harbor fixture show recent context can answer without durable claims. | More multi-topic, long-gap, restart, and wrong-project tests are still needed. | Mostly true for supervised P0 chat, not proven at scale. |
| "No-save wording is fixed." | Live update `749543708` and prompt rules improved phrasing. | Over-testing no-save can distort product behavior and train Spark to over-refuse memory. | Keep it as a privacy edge case only. |
| "Provider/status route hijacks are solved." | Provider/build/recursive route-word retests pass. | Other route words still need broader sampling: schedule, publish, browser, voice, wiki, memory. | The class fix looks promising, but needs cross-surface sampling. |
| "Telegram delivery proves the answer is right." | Delivery plus screenshot proves what the user saw. | It does not prove the answer used the correct owner/lane. | Delivery is necessary but never sufficient. |

## Adjudication Table

| Item | Owner/System | Surface/Lane | Verdict | Anti-pattern Tags | Evidence | Required Improvement |
| --- | --- | --- | --- | --- | --- | --- |
| Natural preference acknowledgement | Telegram + Builder fallback | Recent context / chat | Keep | none | Update `749543709`, route `provider_fallback_chat`, no mission id. | Add source-card trace so "not saved" versus "saved" is explainable when asked. |
| Topic switch and return | Telegram conversation frame | Recent context | Keep with more sampling | `subject-selection-drift` risk | Update `749543699`; answered Moss Window after provider detour. | Add wrong-project and long-gap live tests. |
| Explicit durable memory write | Harness + Builder/domain-chip-memory | Durable memory | Allow supervised | `trace-orphan` risk if not joined | Fixture proves governed `memory.write` success and extracted directive. | Run live save/recall/restart; join memory movement trace to answer. |
| Builder-off memory directive | Telegram + Harness | Failure path | Keep | `channel-frame-as-memory` blocked | Fixture records no local durable note when Builder is off. | Keep failure copy human; verify live degraded memory response. |
| Memory Doctor contamination | Builder bridge / final-answer gate | Source selection | Needs hardening | `answer-source-contamination` | Prior Tide Desk evidence: Memory Doctor detour suppressed. | Make source mismatch a first-class contract violation with reason codes. |
| Wiki as support | Builder wiki | Supporting knowledge | Under-proven | `hot-cold-authority-inversion` risk | Docs and tests describe boundary; live proof incomplete. | Add wiki/current-state conflict Telegram checks. |
| Restart survival | Conversation frame + durable memory | Persisted context | Under-proven | `channel-frame-as-memory` risk | Fixture says frame can persist across instances; live restart evidence incomplete. | Live restart suite with recent-only, durable, and privacy-scoped cases. |

## Root-Cause Chains

Recent-context answer:

```text
telegram update -> natural route/conversation frame -> answer.compose
-> outbound audit -> visible Telegram reply
```

This chain is working reasonably for simple project returns. The risk is that
the selected answer source is not yet exposed cleanly enough for every turn.

Durable memory write:

```text
telegram update -> memory.write route -> Harness/Governor authorization
-> Builder/domain-chip-memory write -> memory movement trace -> later recall
-> fenced memory block -> answer -> outbound audit
```

This chain is partially proven in fixtures. The live production Telegram proof
is still incomplete because we have not documented the full write, restart, and
recall path with owner evidence.

Wrong-source contamination:

```text
safe chat route -> Builder fallback -> unrelated diagnostic/onboarding/memory
reply -> final-answer gate -> fallback local answer or visible weirdness
```

This is the main class to keep watching. It should be treated as a source
selection / bridge-contract issue, not as a reason to add canned replies.

## Stop-Ship Gates

| Gate | Pass Condition | Current Status |
| --- | --- | --- |
| Telegram delivery preflight | Telegram Desktop is connected, Bot API is reachable, `health:polling` passes, and one harmless canary can be delivered before scoring memory behavior. | Failed during the second CUA round on 2026-06-16: Desktop showed `connecting...`; Bot API and `core.telegram.org` TCP checks failed while `www.google.com:443` passed. |
| Durable memory truth | Spark only says saved when Builder/domain-chip-memory accepted the write and the ledger proves it. | Mostly fixture-proven; needs live Telegram proof. |
| Recent context truth | Spark can answer project-return questions without calling recent frame durable memory. | Passing in limited live cases. |
| Restart distinction | Spark distinguishes recent persisted frame from durable memory after bot restart. | Not enough live evidence. |
| No unintended side effects | Memory/context discussion does not launch missions, builds, chips, browser, schedule, publish, provider runs, or access changes. | Stronger than before; continue broad route-word sampling. |
| Source hierarchy | Latest user turn and owner state beat stale memory/wiki/route residue. | Partially proven; wiki/current-state live checks missing. |
| Trace integrity | Memory/context answers can be traced through route, Harness/Governor, owner, outbound audit, and screenshot. | Improving, not complete. |
| Human readability | Telegram replies avoid raw lane jargon unless the user asks about source. | Improved for preference acknowledgements; diagnostics still uneven. |

## Capability Path

| Capability | Recommended Stage | Rationale |
| --- | --- | --- |
| Recent-context continuity | Supervised live | Enough evidence to keep testing naturally in Telegram. |
| Healthy preference adaptation | Supervised live | Good UX when it avoids fake save claims; needs source cards for audits. |
| Explicit durable memory save | Limited live | Mechanism exists, but every save claim must carry owner proof until live recall is proven. |
| Durable memory recall after restart | Shadow/supervised until proven | This is the missing high-confidence loop. |
| Wiki-supported memory answers | Shadow/supervised | Needs conflict tests so wiki never outranks current owner truth. |
| Auto-learning from passive conversation | Not production-promote yet | Too easy to create residue unless owner gates, salience, expiry, and explanations are stronger. |

## Long-Term System Improvements

1. Memory/Context Source Card
   - For every memory/context answer, store a compact source card:
     `turn_id`, selected lane, owner, source ids, recall method, write/read
     authority, vetoes, and final visible claim.
   - Keep it mostly internal, but let Spark summarize it when the user asks
     "is that saved memory or just this chat?"

2. Live Memory Loop Harness
   - Add a repeatable Telegram/CUA suite:
     preference hint, explicit save, recall, topic switch, restart, recall,
     privacy boundary, source explanation, and purge/supersession check.
   - Passing requires owner ledger plus human-visible reply.

3. Source Selection Arbiter
   - Make precedence explicit and testable:
     newest user turn > exact hot artifact > current owner state > recent
     frame > durable memory > wiki support > diagnostics > route history.
   - Any answer using a lower lane while a higher lane is available should log
     a reason.

4. Builder Bridge Source Contract
   - Builder replies should declare the answer source and route family.
   - Telegram should reject or quarantine replies where a safe chat route is
     answered by Memory Doctor, onboarding, provider status, mission state, or
     another unrelated owner without fresh authority.

5. Memory Movement Trace Join
   - Join `memory.write`, memory movement, recall, and final Telegram delivery
     into one inspectable trace. A "saved" claim should point to this chain.

6. Natural Prompt Benchmark
   - Promote the 40-case memory/context plan into a small daily benchmark with
     two scores: behavior correctness and human feel.
   - Do not optimize only route accuracy; a technically safe but robotic answer
     should still score lower.

7. Restart And Isolation Pack
   - Add tests for bot restart, cross-user isolation, group/shared context, and
     same project name in two chats.
   - These are memory correctness tests, not edge luxuries.

8. Humanized Source Explanations
   - When asked, Spark should say:
     "That is from this recent chat," "That is saved memory," "That is wiki
     support," or "I do not have proof of that."
   - Avoid making normal acknowledgements sound like database labels.

## Cleanup And Let-Go Candidates

These are not deletion orders. They are systems or habits that should be
retired, quarantined, or narrowed unless they can prove owner-safe value.

| Candidate | Recommendation | Reason |
| --- | --- | --- |
| Telegram-local durable memory fallback | Let go as a durable-memory mechanism. Keep only recent conversation frame behavior. | It is too easy for channel continuity to masquerade as saved memory. Durable claims must belong to Builder/domain-chip-memory. |
| Memory Doctor as generic fallback answer | Narrow and quarantine behind explicit diagnostics. | Prior evidence showed safe chat turns can be polluted by Memory Doctor-style answers. It is useful as a diagnostic owner, not as a normal chat fallback. |
| Operator-shaped QA prompts as readiness proof | Retire as primary evidence. Keep only for diagnostics. | Human users do not write "answer verdict first, then evidence" or "post-fix route QA" as normal conversation. |
| Screenshots as state truth | Let go as proof of memory/build/done. Keep as visible-delivery proof only. | Screenshots show what the human saw, not whether the owner system saved, recalled, built, or completed anything. |
| Raw route words as intent signals | Keep as weak evidence only. | Words like `memory`, `provider`, `build`, `recursive`, `schedule`, and `publish` often appear inside explanations, logs, quotes, or bug reports. |
| Unjoined memory movement traces | Quarantine from user-facing truth. | A memory event that cannot join to source event, lane, recall method, and final answer should not support "I remember" claims. |
| Dense diagnostic Telegram replies | Clean up aggressively. | Even correct memory/source answers can fail the product if they read like logs instead of help. |
| Passive broad auto-learning from chat residue | Do not production-promote yet. | Useful stable preferences are good, but passive residue needs salience, scope, expiry, supersession, privacy, and owner proof before it is safe. |
| CUA send helper as a single point of QA truth | Harden or replace with a two-lane harness. | The helper can stall while Telegram is connecting. QA should separate UI send, delivery canary, screenshot capture, Bot API health, and trace collection. |
| Exact-string route explanation tests | Replace with semantic assertions. | A local owner-side test failed because the actual no-action route-word reply was semantically correct but did not match one exact canned sentence. That is the kind of deterministic brittleness the Spark governance rules are trying to avoid. |

## Four-Hour Validation Window

Run this before calling memory/context launch-ready:

| Window Check | Threshold |
| --- | --- |
| Telegram delivery preflight | `health:polling` passes, Telegram Desktop is not `connecting...`, Bot API TCP succeeds, and one harmless canary gets update/outbound/screenshot evidence. |
| 20 live Telegram/CUA memory/context prompts | 18/20 correct lane; 20/20 no unintended side effects. |
| 5 explicit durable save/recall cases | 5/5 owner write proof, 5/5 recall proof, 0 fake save claims. |
| 5 restart cases | 5/5 distinguish recent persisted frame from durable memory. |
| 5 wiki/current-state conflict cases | 5/5 current owner truth wins over wiki/history. |
| 5 wrong-project/cross-user cases | 5/5 no leakage or subject drift. |
| Trace join sampling | 100% of sampled saved/done/current claims join to route, Harness/Governor, owner proof, and outbound audit. |
| Human readability | 90% of replies readable in five seconds; no raw duplicate links or unnecessary lane jargon. |

## Residual Unknowns

- Whether the Telegram API connectivity failure is transient network routing,
  local firewall/VPN/proxy, Telegram outage, or Desktop session state. General
  HTTPS worked during the failure, but Telegram hosts timed out.
- Whether live Builder/domain-chip-memory recall behaves as cleanly as fixture
  memory write tests suggest.
- Whether restart survival in the active Telegram profile is recent persisted
  frame, durable memory, or both in common user flows.
- Whether memory/wikipedia/current-state conflicts are consistently resolved
  in favor of current owner truth.
- Whether cross-user or group-style Telegram contexts have enough live
  isolation evidence.
- Whether CUA text extraction can become reliable enough for large daily
  live-suite automation without manual screenshot reading.

## Self-Critique Summary

Strongest claim: Spark's memory/context safety has materially improved, but
durable memory is not fully launch-ready until live owner-backed save/restart/
recall proof exists.

Top invalidation attempts:

1. If a live Telegram save/restart/recall loop already exists in uninspected
   logs, this verdict may understate durable memory readiness.
2. If the healthy preference acknowledgement at update `749543709` is an
   isolated good case, this verdict may overstate ordinary preference handling.
3. If Builder/domain-chip-memory recall fails under real load despite fixture
   success, this verdict may still be too optimistic.

Confidence adjustments:

| Claim | Before | After |
| --- | --- | --- |
| Recent-context safety is improving | 8 | 7.5 |
| Durable memory is launch-ready | 6 | 4.5 |
| No-action memory/route hijack protection is materially better | 8 | 7 |
| Telegram memory wording is human enough | 7 | 6.5 |
| Source/trace observability is sufficient | 6 | 5.5 |

What I still do not know:

- The live durable memory recall behavior after restart.
- The exact failure rate across 20-40 natural user prompts.
- The reliability of source-card reconstruction from existing logs without new
  trace structure.

Fastest experiment to resolve it:

First restore the Telegram delivery preflight. Then run the four-hour validation
window above, starting with five healthy memory save/recall cases and five
restart/source-explanation cases in Telegram Desktop via CUA. Do not patch
during the first pass. Record failures as governance packets, then fix only the
earliest owning layer.

## Live CUA Round 2 Attempt

Time: 2026-06-16 18:24-18:30 UTC.

Prompt attempted:

```text
What did I ask you to do with launch QA updates a few minutes ago?
```

Human meaning: ask Spark to use recent conversation context to recall the
previous preference about launch QA updates. This should have been a read-only
recent-context answer, not a durable-memory claim and not an action.

Observed result:

- CUA entered the prompt into Telegram Desktop, but the message stayed pending.
- Telegram Desktop header showed `connecting...`.
- Screenshot evidence:
  `C:\Users\USER\Documents\Codex\2026-06-14\are-you-there\evidence\telegram-cua-2026-06-16T18-26-49-073Z.png`
  and
  `C:\Users\USER\Documents\Codex\2026-06-14\are-you-there\evidence\telegram-cua-2026-06-16T18-27-11-059Z.png`.
- `spark status` reported `spark-recursive=running(:8791, primary)` but
  `spark-telegram-bot` timed out.
- `npm run health:polling` in the runtime module failed with Telegram Bot API
  `getMe` timeout to `api.telegram.org`.
- `Test-NetConnection www.google.com -Port 443` passed.
- `Test-NetConnection api.telegram.org -Port 443` failed.
- `Test-NetConnection core.telegram.org -Port 443` failed.

Verdict: not a memory/context pass or fail. This is a delivery-layer blocker.
The test cannot be counted as Spark memory behavior because the user turn did
not complete Telegram delivery. It should be tracked as a P0 preflight gap for
any live Telegram memory QA suite.

## Owner-Side Regression Pass During Delivery Block

Because Telegram delivery was blocked, I ran a local owner-side memory/context
pack to separate runtime logic from live Telegram transport.

Command:

```powershell
npm test -- --run tests/conversationMemory.test.ts tests/telegramActionAuthority.test.ts tests/runtimeStatusNatural.test.ts tests/traceAndMemoryDrilldowns.test.ts
```

Result:

- `tests/conversationMemory.test.ts`: passed. This supports recent frame
  persistence, no Telegram-local durable recall, scoped agent doctrine
  preferences, ordinal reference resolution, and cross-user separation.
- `tests/telegramActionAuthority.test.ts`: passed. This supports memory/write
  authority boundaries, no-store boundaries, quoted memory/action word traps,
  stale route/history denial, and positive actions not being over-blocked.
- `tests/runtimeStatusNatural.test.ts`: failed one exact-string assertion:
  `read-only route words in fix explanations stay conversational`.
  The actual reply was:
  "Treat the action words as evidence for understanding the turn, not as
  permission to act. The harness should answer the question in chat unless the
  user gives a fresh explicit request that the Governor authorizes."
  The expected string was:
  "Route words can be discussed without becoming fresh owner-state reads."
  Assessment: this is likely a brittle deterministic test expectation, not a
  behavior failure. The actual response preserved the right authority boundary.
- `tests/traceAndMemoryDrilldowns.test.ts`: passed when run separately. This
  supports compact trace/memory summaries without raw memory rows or paths and
  helpful compile prompts when artifacts are missing.

Verdict: local memory/context foundations look meaningfully healthier than the
live transport. The cleanup need is to remove exact-string expectations for
human route explanations and assert semantic boundaries instead: no owner-state
read, no action, no mutation, and a human-readable explanation of fresh
authority.

## Later Update: Owner-Side Memory Recall Repair

Time: 2026-06-16 18:52-18:55 UTC.

After the delivery blocker was separated from the memory system, a deeper local
run exposed a real memory/context bug:

- Natural recall prompts like "What is the session test code word I asked you
  to remember?" were not being classified as user-memory recall.
- Because the recall lane missed the turn, Spark fell through to an unrelated
  recursive-session answer: `No recursive sessions found.`
- Explicit memory directive turns were intentionally filtered out of ordinary
  recent context, which is still correct. The missing piece was a dedicated
  recent-memory-directive lane that can answer recall questions without letting
  memory-write residue leak into normal context.

Fix shape:

- Added a recent-memory-directive reader on the conversation store. It only
  extracts explicit user memory directives from raw recent user turns.
- Expanded memory-recall intent recognition for natural "what did I ask you to
  remember" forms.
- Implemented local recall from the recent-memory-directive lane with source
  labeling: `From recent chat:`.
- Preserved the anti-residue rule: memory directives still do not appear in
  ordinary context, recent turns, or conversation frames.
- Improved Builder memory writer diagnostics so governed write failures include
  sanitized CLI stdout/stderr instead of only `Command failed`.

Owner evidence:

- Direct Builder memory smoke passed against
  `C:\Users\USER\Desktop\spark-intelligence-builder\.tmp-home-live-telegram-real`.
- The live Telegram Builder home had durable memory disabled:
  `spark.memory.enabled=false` and `spark.memory.shadow_mode=true`.
- The live Builder config was repaired through the Builder config owner:
  `spark.memory.enabled=true` and `spark.memory.shadow_mode=false`.
- After that, Builder bridge writes reported governed acceptance:
  `status=succeeded accepted=1 rejected=0 skipped=0`.

Verification:

```powershell
npm test -- --run tests/conversationMemory.test.ts tests/conversationIntent.test.ts tests/telegramActionAuthority.test.ts tests/traceAndMemoryDrilldowns.test.ts
npm run context:live
npm run context:ux
npm run build
npm run build:sync
```

Results:

- Focused tests passed.
- `npm run context:live` passed 20/20.
- `npm run context:ux` passed 15/15.
- The runtime was synced and relaunched. `spark-recursive` is running on port
  8791, but its health check still times out because Telegram Bot API access is
  blocked from this machine.

Current honest verdict:

- Recent-chat memory recall is now above the release bar for the tested natural
  prompt class.
- Durable memory writes are now correctly enabled and accepted by the Builder
  owner in the local Telegram runtime home.
- Durable memory recall across a true bot restart is still not live-proven
  through Telegram because `api.telegram.org:443` is timing out.
- No Telegram Desktop/CUA pass should be claimed until the Telegram transport
  route is healthy enough for messages to deliver and replies to return.

Next improvement should be a restart-window test that proves recall from the
Builder durable memory owner when the recent chat window is unavailable. That
should be a source-selection improvement, not a phrase patch.
