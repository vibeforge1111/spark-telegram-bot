# Spark QA Startup Bench Showcase Runbook

Date: 2026-05-26

This runbook is for showing the Spark QA Telegram self-improvement benchmark loop without overstating the current Startup Bench result.

## Demo Truth

Current state is demo-ready, not score-ready.

- The bot can create and inspect the Startup Bench proof loop from Telegram.
- Wrapper/raw score summaries match.
- Private runner movement is visible: `0.641 -> 0.67 (+0.029)`.
- Score claims remain blocked.
- Public/network promotion remains separate.

Do not call this a promoted improvement yet. It is a proof-backed private movement with remaining gates.

## Current Blockers

As of the live Telegram check on 2026-05-26:

- Sidecar reviewer quorum is `0/2`.
- Wall-clock stability is waiting until `2026-05-27T09:25:46.784Z`.
- Reconciliation is blocked.
- The promotion dossier still has `scoreClaimAllowed=false`.

This is the point of the showcase: Spark QA refuses to turn partial evidence into a score.

## Preflight

Run this before presenting:

```bash
npm run health:runtime -- --profile sparkqa-bot
```

Expected:

```text
Telegram health: OK
Bot token: accepted (@SparkQA_bot)
Ingress mode: polling
Relay runtime: OK
```

If health is not green, restart first:

```bash
spark restart spark-telegram-bot --profile sparkqa-bot --allow-dirty-runtime
npm run health:runtime -- --profile sparkqa-bot
```

## Telegram Demo Path

Use the Spark QA Lab chat with @SparkQA_bot.

1. `/sparkqa showcase`

   Use this as the opener. It should say Startup Bench is demo-ready, but not score-ready. It should show private movement, sidecar state, wall-clock wait, wrapper/raw status, reconciliation status, and the short demo path.

2. `/sparkqa startup`

   Shows the readiness dashboard and the next honest command. Right now it should point toward sidecar/reviewer work because sidecar quorum is still missing.

3. `/sparkqa reconcile`

   Shows that wrapper/raw summaries match while score claims remain refused. This is the anti-hallucination centerpiece.

4. `/sparkqa reviewers`

   Shows the independent reviewer handoff. Reviewers should run `/sparkqa sidecar`, inspect the packet, then run `/sparkqa gates attest` from their own Telegram account.

5. `/sparkqa stability queue`

   Shows that long-run proof is queued and waiting instead of being skipped.

6. `/sparkqa gates`

   Shows the full proof-gate bundle and the remaining blocked gates.

Do not run `/sparkqa gates attest` during the showcase unless two real independent reviewers are intentionally approving the current proof.

## If Asked For The Score

Use this language:

```text
The private runner moved from 0.641 to 0.67, but Spark QA is not allowed to call that a score yet. The proof stack is still blocked on reviewer quorum, wall-clock stability, and the promotion dossier.
```

Avoid:

```text
Startup Bench improved by 0.029.
```

The safer phrasing is:

```text
Startup Bench shows private runner movement of +0.029, pending proof gates.
```

## Evidence To Mention

Live screenshots from this machine:

- `/tmp/sparkqa-startup-showcase-live.png`
- `/tmp/sparkqa-startup-reconcile-live.png`
- `/tmp/sparkqa-startup-readiness-reconcile-live.png`
- `/tmp/sparkqa-startup-reviewer-handoff-live.png`
- `/tmp/sparkqa-startup-stability-queue-live.png`

Local artifacts are written under:

```text
.spark-swarm/startup-bench-gates/
```

Key artifact families:

- `showcase/`
- `reconciliation/`
- `reviewer-handoff/`
- `sidecar-review/`
- `sidecar-attestations/`
- `latest/`

## To Finish After The Showcase

The path to a real score claim is:

1. Two independent reviewers inspect and attest the current proof.
2. Wait until the wall-clock window is eligible after `2026-05-27T09:25:46.784Z`.
3. Run `/sparkqa run` for fresh proof.
4. Run `/sparkqa reconcile`.
5. Run `/sparkqa gates`.
6. Only accept score language if the fresh promotion dossier says `scoreClaimAllowed=true`.

Until then, the correct product behavior is refusal to score.
