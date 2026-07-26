# Spark Telegram Control Release Packet

Date: 2026-06-27
Status: active evidence packet

## Verdict

Telegram control layer is clean for release behavior. This packet does not claim Spark-wide publish readiness.

Publish remains covered by `docs/SPARK_PUBLISH_READINESS_HANDOFFS_2026-06-27.md`.

## Current Proof Commands

Verified locally on 2026-06-27:

- `git status --short`: clean before this packaging slice
- `npm run control:proof:reliability`: pass
- `npm run check:line-count`: pass
- `npm run build`: pass

The reliability battery includes:

- `npm run control:proof:audit -- --sample 100 --fresh-strict`
- `npm run control:proof:live-trace`
- `npm run control:proof:source-inventory`
- `npm run control:proof:render-firewall`
- `npm run control:proof:capsules -- --strict`
- `npm run control:proof:evals -- --strict`
- `npm run control:proof:legacy-prompts -- --strict`
- `npm run control:proof:capabilities -- --strict`
- `npm run control:proof:surface -- --strict`

## Evidence In One Place

| Claim | Proof gate | Current result |
| --- | --- | --- |
| Hidden context cannot render into ordinary Telegram replies. | `control:proof:render-firewall` | Pass. Raw control internals, legacy source titles, old runbook names, paths, stack traces, and proof refs are firewalled from ordinary replies. Inspect surfaces can keep proof refs while still hiding paths and stack traces. |
| Action-capable routes have proof capsules or explicit no-action proof. | `control:proof:capsules -- --strict` | Pass. 11 action-capable planes checked, 11 proof policies, 0 gaps. |
| "Do not run", "just explain", and build/mission-mentioned cases stay chat-only when user intent says no action. | `control:proof:evals -- --strict` plus `control:proof:live-trace` | Pass. Required old-edge eval categories are covered, and the safe prompt proof is ready for `risk_profile_no_build`, `mission_routing_explain_only`, `repair_status_no_action`, and `memory_vs_fresh_state`. |
| Trace join has no orphan actions or replies. | `control:proof:live-trace` | Pass. 12 structurally joined rows, 4 live joined rows, 0 gap rows, 0 parse errors, 0 route mismatches, 0 stale live route evidence. |
| Replies still sound like Spark instead of a deterministic packet dump. | `control:proof:surface -- --strict` | Pass. 26 checked cases, 2 inspect cases skipped, 0 issues. |
| Legacy prompt/UI summaries cannot silently become current authority. | `control:proof:source-inventory` and `control:proof:legacy-prompts -- --strict` | Pass. 48 inventory entries, 27 canonical docs checked, 13 blocked legacy refs checked, 0 gaps. |
| Capability claims have last-success and last-failure/boundary evidence. | `control:proof:capabilities -- --strict` | Pass. 13 capabilities checked, 0 gaps, using the full SparkRecursive_bot canary packet. |

## Known Non-Blocking History

The fresh-strict audit still reports backed historical legacy proof gaps in:

- `telegram_route_confidence`
- `builder_gateway`
- `spawner_prd_trace`

Current posture:

- backing complete
- latest gaps: zero
- release blocking: no

Do not reopen route-safety work for these unless a fresh audit reports latest gaps, incomplete backing, or release-blocking status.

## Maintenance Posture

The Telegram control layer should now be treated as maintenance, not active rescue work.

Keep these gates active:

- render firewall
- trace join checker
- proof capsule coverage
- old-edge reliability evals
- legacy prompt surface gate
- capability evidence
- surface eval

Move older reliability prompts, legacy plans, and historical runbooks into read-only evidence, archive, or maintenance posture unless a current failing gate promotes a specific item back into active work.

## Next Work

1. Keep the packet green during publish-readiness work.
2. Resolve Spark-wide publish handoffs in `docs/SPARK_PUBLISH_READINESS_HANDOFFS_2026-06-27.md`.
3. Continue line-count maintenance one baselined file at a time.
4. Archive or extract old legacy plans only after their useful invariants are represented in current gates, docs, or tests.
