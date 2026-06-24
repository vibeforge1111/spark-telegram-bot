# SparkRecursive_bot Control-Proof Live Canary Bundle

This folder is the live Telegram release packet. It starts not ready until each selected case has a recorded verdict and required captures.

## Files

- Observation packet: outputs/live-canary-safe-first/live-canary-observations.json
- Run guide: outputs/live-canary-safe-first/live-canary-run-guide.md
- Copy-paste prompts: outputs/live-canary-safe-first/live-canary-copy-paste.md
- Checklist: outputs/live-canary-safe-first/live-canary-checklist.md
- Coverage: outputs/live-canary-safe-first/live-canary-coverage.md
- Current summary: outputs/live-canary-safe-first/live-canary-summary.md

## Run Order

1. Open the run guide and copy only the Telegram prompt blocks into SparkRecursive_bot.
2. Capture the reply, screenshot path, proof panel text, side effects, and user confirmation for each case.
3. Run the matching `--record-case` command from the run guide after each prompt. The command refreshes the current summary.
4. Re-run the selected-case strict check:

```bash
npm run control:proof:canaries -- --observations 'outputs/live-canary-safe-first/live-canary-observations.json' --strict
```

This selected-case gate is ready when every case in this bundle passed with required captures present and top-level runtime evidence is clean. It is not the full release gate until the complete canary pack is run.

## Side-Effect Proof

For no-action and read-only cases, record the prompted side-effect flag as `false` when no mutation occurred. Notes alone are not enough.

For action cases, the run guide includes `--no-other-side-effects`. Keep it in the record command unless an unrelated mutation really happened; the flag records every non-expected side effect as `false` so the packet proves the action did not smuggle a mission, file write, provider switch, memory write, network call, or media handling.

If an unrelated side effect did happen, remove `--no-other-side-effects`, record the actual true flag, and mark the case `fail` or `needs-retest` with a short note.
