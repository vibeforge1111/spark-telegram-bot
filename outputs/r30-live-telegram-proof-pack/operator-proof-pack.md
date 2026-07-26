# R30 Live Telegram Proof Pack

Use this pack only for operator-sent Telegram Desktop proof. The agent must not send Telegram messages or mutate external systems.

## Copy-Paste Prompts

1. r30-prd-fast-001

Expected route: `prd_writing.fast_path`
Authority: `chat_only`
Mutation class: `none`
Reply shape: natural
Side-effect expectation: No mission, publish action, file edit, scheduler action, or external send.

```text
Write a PRD for a Telegram-first loop engineering dashboard. Use the PRD Writing domain chip if it fits, and do not launch a mission.
```

2. r30-daily-fast-001

Expected route: `daily_schedule.fast_path`
Authority: `chat_only`
Mutation class: `none`
Reply shape: natural
Side-effect expectation: No reminder, calendar mutation, mission, autoloop, or external send.

```text
Help me make tomorrow easier with a daily schedule plan. Do not create reminders or change my calendar.
```

3. r30-daily-loop-advisory-001

Expected route: `daily_schedule.loop_advisory`
Authority: `chat_only`
Mutation class: `none`
Reply shape: natural
Side-effect expectation: No autoloop, mission, benchmark run, file change, or scheduler action.

```text
Continue improving the Daily Schedule chip with a loop, but do not start an autoloop yet. What would the next safe loop be?
```

4. r30-boundary-meta-timezone-001

Expected route: `plain_chat.qa_boundary`
Authority: `chat_only`
Mutation class: `none`
Reply shape: natural
Side-effect expectation: No Daily Schedule fast path, reminder, calendar mutation, mission, or external send.

```text
We are discussing timezone routing bugs. Do not schedule anything; just explain which route should win.
```

## What To Capture

- Telegram Desktop screenshot showing the operator prompt and Spark reply.
- `/proof` output or route telemetry proving the expected route/proof join for each case.
- A generated screenshot digest manifest for each case; do not hand-type screenshot digests.
- Operator confirmation saying each prompt was manually sent in Telegram and observed in `SparkRecursive_bot`.
- Side-effect booleans showing no mission, autoloop, file edit, schedule mutation, provider/access change, calendar/CRM/repo mutation, or agent-sent external message.

After screenshots are captured, generate the private digest manifest with:

```bash
npm run r30:screenshot-manifest -- --output outputs/r30-live-telegram-proof-pack/screenshot-manifest.json --cases r30-prd-fast-001,r30-daily-fast-001,r30-daily-loop-advisory-001,r30-boundary-meta-timezone-001 <screenshot-1> <screenshot-2> <screenshot-3> <screenshot-4>
```

After observations and the screenshot manifest are filled, derive the summary instead of hand-authoring pass/fail:

```bash
npm run r30:live-telegram:summary -- --observations outputs/r30-live-telegram-proof-pack/r30-live-canary-observations.json --screenshots outputs/r30-live-telegram-proof-pack/screenshot-manifest.json --output outputs/r30-live-telegram-proof-pack/r30-live-canary-summary.json
```

Then write the final evidence index only after validation passes:

```bash
npm run r30:live-telegram:evidence -- --observations outputs/r30-live-telegram-proof-pack/r30-live-canary-observations.json --summary outputs/r30-live-telegram-proof-pack/r30-live-canary-summary.json --screenshots outputs/r30-live-telegram-proof-pack/screenshot-manifest.json --output outputs/r30-domain-chip-fastpath-canary/live-telegram-canary.json
```

## Pass Conditions

- Required case IDs pass: `r30-prd-fast-001`, `r30-daily-fast-001`, `r30-daily-loop-advisory-001`, `r30-boundary-meta-timezone-001`.
- Summary has `readyForRelease: true`, no release blockers, no missing/invalid/stale packet evidence, and fresh runtime evidence.
- Gate scope is either `selected_case_gate` for these four cases or `full_release_pack`.
- Each required case has `verdict: pass` and `missingCaptures: []`.
- Natural replies do not leak raw paths, ids, traces, policy reason codes, or robotic standalone headings.
- Publish readiness is not required; publish blockers do not block this live Telegram proof.

## Evidence Template

Use `live-telegram-canary.template.json` only as a shape reference. The final index should be written by the validation command above.
