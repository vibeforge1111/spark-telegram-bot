# Spark System Governance Ruleset

Status: mandatory for Spark remediation, QA, release-readiness, and live Telegram/CUA testing.

This ruleset applies across Spawner, Builder, Telegram, memory/wiki, provider/access, browser/computer-use, voice/media, recursive/domain-chip systems, schedule/publish, installer, Cockpit, Labs, Swarm, and plain chat.

## Prime Directive

Never patch Spark with a deterministic phrase save that only fixes the latest transcript, project name, mission id, reply text, or screenshot.

Every nontrivial fix must remove a failure class at the earliest owning layer and preserve normal human usage on both sides of the boundary:

- users exploring, asking status, quoting examples, debugging, or asking what changed must not accidentally start work
- users giving fresh, explicit permission to act must not be blocked by an overbroad safety rule

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
- include one natural positive case
- include one adjacent negative trap
- verify owner evidence, Harness/Governor decision, and side-effect/no-op proof when authority is involved
- use Telegram Desktop through CUA for user-facing Telegram behavior when feasible
- record live evidence without treating screenshots as owner truth

When a fix touches a shared governance rule, update this file, `AGENTS.md`, the relevant Spark skill rulesets, and any route-specific docs that future agents will read.

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
