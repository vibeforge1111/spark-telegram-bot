# Access Level 5 Full-Permission Audit - 2026-06-28

Status: current local audit passed.

## Invariant

Telegram may not mark a chat as Access Level 5 unless the runtime proves all of
these at the same time:

1. Spark CLI status reports `effective_access_level=5`.
2. The Level 5 service lane is enabled for Spawner and Telegram.
3. `level5.effective_codex_sandbox` is exactly `danger-full-access`.
4. The Telegram runner preflight can write, read, and delete both state and temp
   markers.
5. Worker subprocess env promotion carries the full Level 5 bundle even when the
   parent process has stale `read-only` or `workspace-write` values.

If any item fails, Telegram must leave the chat below Level 5 and say that full
permission proof failed.

## Paths Checked

- `/access 5` and the `spark_access_level:operator:confirm` callback both route
  through `applySparkAccessProfileChange(...)`.
- Natural language access changes also route through `handleAccessChangeRequest(...)`
  and the same Level 5 proof gate.
- `spark access status --level 5 --json` separates requested level, effective
  level, current-process sandbox, service sandbox, and effective sandbox.
- Telegram helper commands and Recursive bridge subprocesses use
  `effectiveLevel5RuntimeEnv(...)` so stale process env does not keep workers
  read-only after persisted Level 5 guardrails are present.
- Spawner Codex workers use `effectiveLevel5Env(...)` and `resolveCodexSandbox(...)`
  so default Codex missions receive `--sandbox danger-full-access` when Level 5
  guardrails are active.
- CLI setup remains blocked from non-interactive shells for sensitive access
  mutation; Telegram's confirmed button path is the intended nontechnical route.

## Live Local Evidence

Run time: 2026-06-28.

- `spark access status --level 5 --json`
  - `effective_access_level=5`
  - `state_machine.service_can_operate_whole_computer=true`
  - `level5.activation_state=active_for_services`
  - `level5.effective_codex_sandbox=danger-full-access`
  - Spawner and primary Telegram service restarts are visible after the Level 5
    guardrail configure audit time.
- `/Users/alchemistab/.spark/config/modules/spawner-ui.env`
  - `SPARK_ALLOW_HIGH_AGENCY_WORKERS=1`
  - `SPARK_ALLOW_EXTERNAL_PROJECT_PATHS=1`
  - `SPARK_CODEX_SANDBOX=danger-full-access`
- `/Users/alchemistab/.spark/config/modules/spark-telegram-bot.env`
  and profile env files carry the same full Level 5 bundle.
- Live process env for Spawner and primary Telegram includes the same full Level
  5 bundle.

## Regression Gates

Passed:

- `npm test -- --run tests/accessActions.test.ts tests/accessPolicy.test.ts tests/level5RuntimeEnv.test.ts tests/runnerPreflight.test.ts tests/recursiveLevel5RuntimeEnv.test.ts`
- `PYTHONPATH=src python3 -m pytest -q tests/test_access.py`
- `npm run test:run -- src/lib/server/high-agency-workers.test.ts src/lib/server/access-execution-lanes.test.ts src/lib/server/prd-auto-dispatch.test.ts src/lib/server/provider-clients/codex-cli-client.test.ts src/lib/services/spark-agent-bridge.test.ts`

The Spawner test run printed expected local relay webhook warnings against live
ports, but all focused Level 5 tests passed.

## Remaining Boundary

This audit proves the local code path and the live local service/env state. A
final Telegram UX confirmation should still be done from the trusted admin chat:

1. Send `/access 1`, `/access 3`, or `/access 4`.
2. Send `/access 5` and tap Confirm.
3. Ask: `is Level 5 active?`
4. Confirm the answer says Level 5 is active only when effective sandbox is
   `danger-full-access` and runner writability is yes.

