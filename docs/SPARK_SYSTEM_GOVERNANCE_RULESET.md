# Spark System Governance Ruleset

Status: mandatory for Spark remediation, QA, release-readiness, and live Telegram/CUA testing.

This ruleset applies across Spawner, Builder, Telegram, memory/wiki, provider/access, browser/computer-use, voice/media, recursive/domain-chip systems, schedule/publish, installer, Cockpit, Labs, Swarm, and plain chat.

Companion rule: use `docs/SPARK_HUMAN_CONVERSATION_QA_MAP.md` when designing
Telegram/CUA prompt batches, route tests, memory/context probes, Spawner
continuum checks, and launch-readiness rubrics.

## Prime Directive

Never patch Spark with a deterministic phrase save that only fixes the latest transcript, project name, mission id, reply text, or screenshot.

Every nontrivial fix must remove a failure class at the earliest owning layer and preserve normal human usage on both sides of the boundary:

- users exploring, asking status, quoting examples, debugging, or asking what changed must not accidentally start work
- users giving fresh, explicit permission to act must not be blocked by an overbroad safety rule
- QA prompts must represent how users actually talk to Spark. Operator-shaped
  prompts may test operator paths, but they cannot be the main evidence for
  normal conversational readiness.

## Governance Loop

Before editing code, prompts, docs, skills, tests, or runtime rules, write down:

1. Human interpretation: what a normal user meant in the latest turn.
2. Failure family: false-positive hijack, false-negative miss, stale-context source error, reply-quality gap, delivery-truth gap, owner-evidence gap, memory-lane gap, trace gap, or provider/access drift.
3. Owning layer: parser/candidate generation, natural route precedence, context/source selection, Telegram intent envelope, Harness contract, Harness Core/Governor, owner adapter, owner proof, or reply composition.
4. Owner system: Telegram, Builder, Spawner, domain-chip-memory, Spark CLI/provider owner, access/governance, browser/computer-use, voice, installer, Cockpit, Labs, Swarm, or another declared owner.
5. Positive case: one natural user turn that must still execute.
6. Negative trap: one adjacent natural user turn that must remain answer-only or no-op.
7. Evidence path: visible reply plus route, Harness/Governor, owner result, outbound audit, ledger, trace, and side-effect proof as applicable.

Patch only after the failure family and owning layer are known.

## Governance Reflex

This reflex is mandatory across Spark systems. Use it before every
implementation, QA verdict, Telegram composition change, memory/context change,
provider/access change, Spawner change, or Harness/Core authority change.

1. Read the latest turn as a normal human conversation, not a keyword bag.
2. Name what the user freshly authorized, what they only discussed, and what
   they bounded as no-save, no-build, no-publish, no-change, or no-op.
3. Select the answer lane that should win: recent chat, durable memory,
   wiki/ALM, owner state, provider state, mission state, trace, or plain
   conversation.
4. Name the owner that can prove truth or side effects: Harness Core/Governor,
   Builder, Spawner, domain-chip-memory, CLI/provider, Telegram composition,
   browser/computer-use, voice/media, installer, Cockpit, Labs, Swarm, or
   another declared owner.
5. Decide whether the issue is a reusable failure class across wording,
   projects, owners, surfaces, or timing. If it is not reusable, keep it as an
   incident note instead of promoting a broad rule.
6. Patch the mechanism that made the wrong decision: route selection, source
   selection, authority, owner proof, bridge contract, ledgering, or
   composition.
7. Reject deterministic transcript saves. Do not key a fix to the observed
   phrase, project name, mission id, screenshot, provider label, or answer text
   unless that token is a real typed contract in the owner system.
8. Preserve both sides: one natural positive must still work, and one adjacent
   natural no-op trap must remain answer-only.
9. Verify with owner evidence, Harness/Governor trace, ledger/outbound audit,
   side-effect proof, and visible Telegram/CUA proof when the human Telegram
   surface changed.
10. Promote reusable lessons into agent rules, this governance doc or a
    route-specific doc, relevant installed skills, and focused tests or QA
    prompts before calling the fix captured.

The goal is not to make one transcript pass. The goal is to remove the class of
failure while preserving natural Spark use across all planes.

## Authority Model

Treat every surface as evidence until Harness/Core and the owner system make it authoritative.

```text
human turn
-> evidence parsing
-> natural route decision
-> TurnIntentEnvelopeVNext
-> Harness Core / Governor
-> authorization and tool ledger
-> owner execution or owner readout
-> side-effect or no-op proof
-> Telegram/readout composition
```

Raw words may propose candidates. Fresh user intent plus Harness/Governor authority authorizes action. Owner systems prove truth.

Do not let any of these become action authority by themselves:

- route keywords
- route words inside explanations, bug reports, logs, traces, fenced repros, prior Spark replies, QA fixtures, or "does that authorize?" conversations
- pending state
- route history
- old mission ids
- provider names
- memory recall
- wiki/ALM packets
- Telegram delivery success
- screenshots
- cached summaries
- preview, Canvas, or Board links
- stale task/result artifacts

Read-only/status and high-agency hijacks count too. A route word in meta-language must not
steal the answer lane into provider truth, registry drift, access status,
memory recall, wiki lookup, browser availability, mission status, recursive
proposal/approval, schedule deletion, chip creation, provider runs, external
research, or browser/network use unless the latest turn is actually asking that
owner for current state or a fresh action. The same boundary
must preserve explicit positives such as "what provider is active right now?",
"show my access level", "search the wiki for X", "propose this recursive packet
now", and "build the local app now".

## Owner Truth

Use the owner that actually controls the domain:

- Spawner owns mission/build execution state and terminal build proof.
- Builder owns chat/context bridge decisions and Builder-owned gates.
- domain-chip-memory owns durable memory writes, promotions, and recall proof.
- Spark CLI/provider owner owns runtime/provider truth.
- Access/governance owns authority level and approval truth.
- Telegram owns ingress, delivery metadata, and human-facing composition.
- Browser/computer-use, voice, schedule/publish, installer, Cockpit, Labs, and Swarm owners prove their own side effects.

Done, saved, ready, installed, shipped, published, shared, fixed, or completed can only be claimed when the current owner proof supports it and no newer contradictory owner state exists.

## Memory And Context

Users will usually speak naturally. They will not always say "remember".

- Recent conversation context can support continuity, but it is not durable memory.
- Durable memory requires Builder/domain-chip-memory owner acceptance and recall evidence.
- Wiki/ALM content can support explanations, but it cannot override the newest user turn, current owner state, or exact hot artifact evidence.
- Preferences inferred from conversation may guide the current exchange, but Spark must not claim they were saved unless a memory-write owner accepted them.
- Restart tests must distinguish recent-frame survival from durable memory recall.

Memory/context failures are source-governance failures until proven otherwise.
If Spark answers a normal continuity question from the wrong project, stale
route residue, wiki note, provider/status context, or local frame, do not patch
the visible sentence. Reproduce the class with natural conversation, topic
switching, and an adjacent trap; then patch the earliest owner mechanism that
made the wrong lane win: source selection, lane classification, Builder bridge,
domain-chip-memory, wiki support boundary, or owner-state readout.

Required memory/context probes must include regular human turns, not only
commands:

- project or preference discussion without the word "remember"
- follow-up after several intervening turns
- topic switch and return to the original project
- bot restart followed by a continuity question
- explicit comparison of saved memory versus recent context
- natural no-save, no-build, or no-execution boundaries

Passing means the correct lane won and no unauthorized owner acted. If the
selected route is safe but the final answer is a Memory Doctor refusal,
provider/status detour, stale Spawner readout, wiki overreach, or another
unrelated owner response, classify it as a source-selection or bridge-boundary
failure. Repair the lane/owner mechanism; do not add a reply keyed to the
observed prompt.

## Telegram And Readout Rules

Telegram is a human surface, not the safety boundary.

- Read the visible exchange as a conversation before scoring it.
- A delivered reply is not a pass unless it answers the latest natural intent.
- Rich formatting, shorter text, spacing, and link cleanup are composition fixes only when route, owner, and source truth are already correct.
- Prefer one useful inspect link for operational updates unless the user asked for raw evidence.
- Use paragraph spacing between different sentence-level jobs: status, proof/boundary, and inspect link.
- Do not hide failures, uncertainty, missing owner proof, or duplicate truth behind nicer formatting.

## Test And QA Requirements

For every nontrivial fix:

- add or update a focused test for the affected route/source/owner/composition behavior
- include one natural positive case written in ordinary user language
- include one adjacent negative trap written in ordinary user language
- include a topic switch or return-to-context probe for memory/context changes
- verify owner evidence, Harness/Governor decision, and side-effect/no-op proof when authority is involved
- use Telegram Desktop through CUA for user-facing Telegram behavior when feasible
- record live evidence without treating screenshots as owner truth

Do not score a conversational route as launch-ready if it only passes prompts
that say things like "answer verdict first, then evidence", "after fix", or
"route this as chat_plan" unless the user is explicitly acting as an operator.

When a fix touches a shared governance rule, update this file, `AGENTS.md`, the relevant Spark skill rulesets, and any route-specific docs that future agents will read.

## Rule Promotion And Readiness Tracking

A Spark remediation is not ready for launch because one transcript now looks
good. Treat each finding as one of two things:

- an incident-only symptom that should stay in the QA notes
- a reusable failure class that must be promoted into rules, skills, tests, and
  readiness rubrics

Promote only reusable classes such as false-positive action hijacks,
false-negative missed actions, wrong source lane, stale memory, provider/access
drift, owner-evidence gaps, completion-truth gaps, trace gaps, and unreadable
Telegram/readout composition.

Every promoted rule must include:

- the owning layer that prevents recurrence
- one normal positive case that must still work
- one adjacent no-op trap that must not execute
- the owner proof or trace evidence required to score the result
- the Spark surfaces the rule applies to

Every promoted rule must come from a governance packet, not from vibe or a
single screenshot:

- human meaning of the latest turn
- failure family and affected Spark surfaces
- owner system and earliest owning layer
- positive natural case and adjacent no-op trap
- required owner proof, Harness/Governor trace, ledger, outbound audit, and side-effect evidence
- code, tests, docs, skills, and QA prompts that need the rule

If the packet cannot name an owner layer, keep investigating. If the lesson
cannot generalize beyond the exact transcript, keep it as an incident note
instead of creating a broad rule.

Use this as the readiness posture across all Spark systems: score real human
use cases, not only isolated commands. A route can pass a unit test and still
fail release readiness if a normal Telegram conversation would feel like Spark
ignored context, launched too early, refused a fresh action, claimed false
completion, or answered from the wrong memory/source lane.

No root-cause lesson is considered captured if it exists only in operator
memory, a chat final answer, or a handoff note. Reusable lessons must be
promoted into agent rules, this governance file or the relevant route doc,
installed Spark skills, and regression/QA prompts. If the lesson cannot name an
owning layer and paired positive/trap cases, keep it as an incident note and
continue tracing.

## Stop-Ship Anti-Patterns

Block release or keep investigating when any of these appear:

- exact-sentence, exact-project, exact-mission, or exact-reply fixes
- broad keyword triggers without paired negative tests
- final wording used to compensate for a wrong envelope or owner decision
- memory, wiki, pending state, or route history minting action authority
- Telegram-local context treated as durable memory
- screenshots, delivery success, preview links, Canvas, or Board treated as completion proof
- build/readout messages claiming done after a newer owner failure
- provider/runtime claims made from stale cached context rather than current provider owner truth
- fixes that make the observed transcript pass but would fail the next natural variation

## Review Questions

Before finalizing, ask:

- What class of failure did this remove?
- Which owner layer now prevents the next natural variation?
- Which valid user flow could this accidentally block?
- Which no-op user flow could this accidentally execute?
- What owner proof makes the visible claim true?
- What trace or ledger row lets us explain the outcome without guessing?
- Does the Telegram reply feel natural to a user, or only correct to a system?
