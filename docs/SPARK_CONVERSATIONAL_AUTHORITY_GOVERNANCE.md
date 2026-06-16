# Spark Conversational Authority Governance

Status: Current operating rules for all Spark conversational routes, owner-evidence claims, Telegram, Spawner, Harness Core, and sibling natural-language routes.

Use this document before changing conversational routing, `IntentGate`, `naturalRouteDecision`, `buildIntent`, `conversationIntent`, Telegram answer composition, completion/failure claims, Spawner launch/readout behavior, or route QA tests for any Spark system.

## Purpose

Spark natural language must avoid two equal failures:

- False-positive hijack: a word, quote, bug report, readout, stale artifact, pending state, memory, or route history starts work the user did not ask for.
- False-negative miss: a fresh explicit action fails because a boundary rule became too broad.

The goal is not more deterministic reply text. The goal is a stable authority contract: evidence proposes, Harness Core/Governor authorizes, owner systems execute or refuse, and every human-facing claim stays bounded by owner proof.

These rules are Spark-wide. They apply to Builder, Spawner, memory, wiki, access, provider, domain-chip, recursive, schedule, publish, browser/computer-use, installer, Cockpit, Labs, Swarm, Telegram, and future Spark owner routes.

## Authority Spine

Canonical flow:

```text
Telegram text
-> evidence parsing
-> natural route decision
-> Telegram intent envelope
-> Harness Core VNext authorization
-> pre-execution ledger
-> Governor decision
-> owner-side consumer verification
-> owner execution or answer composition
-> side-effect or readout proof
```

Rules:

- Raw words may propose candidates.
- Fresh user intent plus Harness/Governor authority authorizes action.
- Memory, pending state, route history, prior mission ids, health state, provider names, old artifacts, and local summaries are evidence only.
- Reply text is never an execution boundary.
- Owner adapters must fail closed before network, file, memory, schedule, publish, provider, chip, mission, or recursive side effects when authority is missing, stale, wrong-tool, read-only, or unsigned when signatures are required.
- Done/ready/fixed/shipped claims require terminal owner success, verification proof, and no newer owner failure for the same artifact. Task completion, preview URLs, delivery success, dashboards, and cached summaries are evidence only until the owner route confirms the final state.

## Ownership

Telegram owns:

- ingress
- route evidence collection
- natural-language framing
- local turn envelope construction
- concise answer composition
- delivery

Telegram does not own:

- durable memory truth
- Builder identity/session/provider policy
- Spawner mission execution truth
- domain-chip doctrine
- CLI installer truth
- global tool authority

Harness Core and Governor own:

- selected action authority
- owner/tool/action/mutation matching
- pre-execution ledger requirement
- signed decision verification
- consumer-side execution authority

Spawner owns:

- mission state
- build artifacts
- PRD/write/dispatch consumption
- Canvas/Kanban/execution panel truth

Every Spark owner owns its own terminal truth. Telegram may render that truth, but it must not promote partial task completion, visible links, stale summaries, or delivery success into final success for any owner system.

Builder, memory, wiki, access, provider, domain-chip, recursive, schedule, publish, browser/computer-use, and installer routes each keep their own owner boundaries.

## Patch Decision Tree

Before editing, identify:

1. Failure type: false-positive, false-negative, reply-quality, delivery-truth, or authority gap.
2. Route family and owner system.
3. Mutation class: none, read-only, writes files, launches mission, writes memory, creates chip, creates/deletes schedule, publishes, external network, or controls mission.
4. Earliest layer with enough information to decide correctly.
5. A positive fixture that must still execute.
6. A negative fixture that must not execute.

Patch the earliest owning layer:

- Candidate/parser: phrase should or should not become evidence.
- Natural route: precedence, context source, route owner, stale context, or visible artifact resolution is wrong.
- Telegram intent gate: fallback classifier, selected route, blocked candidates, or tool family is wrong.
- Harness contract: allowed tools, denied tools, mutation class, or owner policy is wrong.
- Harness Core/Governor: envelope, action id, ledger, signature, or consumer verification is wrong.
- Owner adapter: execution happens before authority verification or with the wrong owner/tool/action.
- Reply composition: answer claims work or readiness not proved by owner evidence.

Do not patch a downstream reply or route branch when the upstream envelope still grants the wrong authority.

## Non-Negotiable Invariants

- Every high-agency action requires selected route, owner, tool, action type, action id, pre-execution ledger, Governor decision, and owner-side verification.
- Every completion or readiness claim requires selected owner evidence, terminal success, verification proof, and no conflicting newer failure for the same artifact.
- Builder/provider fallback and direct Builder delivery surfaces are answer composition only. They may discuss plans, advice, and evidence, but must suppress done/ready/fixed/shipped/installed/published/open-preview claims unless an owner route already supplied proof.
- Read-only authority never authorizes writes, launches, publishing, scheduling, memory writes, chip creation, mission control, or provider dispatch.
- No-execution, quoted examples, meta-language, stale-context questions, "explain only", and explicit no-run language block mutations.
- Local-only/no-publish/no-deploy language blocks publishing and deployment, not explicit local builds.
- Contextual follow-through can act only when hot recent turns or visible exact artifacts make the target unambiguous.
- Bare agreement cannot create mutation authority from stale or mismatched context.
- Current Spawner artifacts cannot steal named readouts for a different shipped project.
- Current Spawner artifacts cannot steal explicit Spawner board, failure, provider, mission, or Kanban readouts; those routes are read-only `spawner-ui` owner evidence.
- Spawner board/latest-preview/latest-failure/latest-provider routes are read-only even when the route string contains `spawner`; the Telegram envelope must not mint `spawner.run`, file-write, or mission-launch authority for them.
- User-facing "latest" promotion must skip operational probes and question/readout residue unless the entry has real artifact/build task evidence. Board history counts may include residue; promoted project/job/failure truth must not.
- Shipped-project readouts and advisory polish questions are answer/readout routes until the user explicitly says to apply, build, run, or change.
- Spark intent-authority QA owns the turn over incidental runtime, restart, build, mission, provider, memory, or publish words. IntentGate must select `plain_chat.qa_boundary`, the envelope must carry `noExecution`, runtime/restart predicates must return false, and final-answer gates must suppress replies that answer with health/status instead of the asked authority boundary.

## Ban List

Do not ship:

- exact-sentence hot fixes
- broad regex expansion without negative tests
- `index.ts` early returns that bypass envelope/Governor flow
- reply wording as safety while an action remains authorized
- pending state, memory, route history, or old mission ids as authority
- all action-word mentions becoming route execution
- all domain-chip/wiki/memory/provider/access mentions becoming that route
- TurnIntent V1 documents as current execution authority
- delivery success as answer success
- output reports as stronger truth than repo contracts, source manifests, live ledgers, and owner-system evidence
- done/ready/shipped wording based only on task completion, preview links, Telegram delivery, dashboard presence, or stale cached state
- Builder voice/media/text delivery that bypasses the final-answer claim gate

## Required Route-Family Test Contract

For every touched route family, add or update:

- parser tests for candidate/no-candidate behavior
- natural route tests for route, owner, context source, matched signals, confirmation, and payload
- intent gate tests proving fallback classifiers cannot resurrect blocked actions
- authority tests proving denied high-agency probes lack allowed tools and Governor execution
- owner adapter tests when an execution surface changes
- ledger/privacy tests when trace data changes

Each change must include:

- one negative trap that must not execute
- one positive explicit action that must still execute

Recommended focused pack:

```powershell
npm test -- --run tests/buildIntent.test.ts tests/conversationIntent.test.ts tests/naturalRouteDecision.test.ts tests/telegramActionAuthority.test.ts tests/spawnerLoopBugHunt.test.ts tests/turnIntent350Matrix.test.ts
npm run build
npm run sync:check
git diff --check
```

## Route-Family Manifest Shape

Use this shape for new fixture packs:

```yaml
family: spawner
owner: spawner-ui
route: spawner.build
tool: spawner.run
mutationClass: launches_mission
allowedContextSources:
  - latest_message
  - visible_exact_artifact
requiresConfirmation: conditional
positiveIntentShapes:
  - explicit_new_build
  - explicit_existing_project_iteration
negativeBoundaryShapes:
  - quoted_action_word
  - bug_report_about_building
  - open_ended_product_exploration
  - stale_project_reference
  - readout_or_status_question
mustNotRoutes:
  - memory.write
  - wiki.promote
  - schedule.create
ledgerExpectation:
  preExecutionRequired: true
  governorRequired: true
privacyExpectation:
  rawPromptLogged: false
```

Instantiate the same contract for memory, wiki, access, provider, domain-chip, recursive, schedule, publish, browser/computer-use, and installer routes.

## Review Checklist

Before finalizing:

- Did the fix address a class of failures, not just one sentence?
- Did it preserve a natural positive action?
- Did it block the matching negative trap?
- Does the selected route match the executed route?
- Does the owner system match the route family?
- Is the mutation class correct?
- Are all denied high-agency probes side-effect-free?
- Are all allowed high-agency actions backed by envelope, tool policy, ledger, Governor decision, and consumer verification?
- Are reply claims bounded by owner evidence?
- If a reply says done, ready, fixed, shipped, saved, published, installed, or launched, which owner proof makes that true?
- Is unrelated user work left untouched?

## Launch Gates

Do not call the touched surface launch-ready unless:

- 0 high-agency false allows in touched route families
- 0 critical false negatives for explicit positive actions in touched families
- 0 owner/tool/mutation mismatches for allowed actions
- 100 percent of allowed high-agency actions have envelope, tool policy, ledger, Governor decision, and owner-side verification
- 0 raw prompt/user id/path/provider body/secret leaks in route ledgers
- 0 unknown reason codes on allow/block decisions
- build, sync check, focused route pack, and broad matrix pass

Runtime-ready does not imply public-installer-ready. Installer readiness also needs committed source, current manifests, CI, sync, secrets scan, registry truth, and release docs alignment.
