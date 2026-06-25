# SparkRecursive_bot Control-Proof Canary Evidence Summary

Generated: 2026-06-25T02:15:04.625Z
Runtime evidence collected: 2026-06-25T02:15:04.625Z
Runtime evidence expires: 2026-06-25T03:15:04.625Z (1h window)
Cases: 28
Release gate: ready
Publish gate: not ready

Verdicts:
- pass: 28
- fail: 0
- blocked: 0
- needs-retest: 0
- untested: 0

Release note: ready with caveats; complete the listed handoffs before publish/registry claims.

Release caveats:
- registry_pin_drift | runtime_ahead_of_registry_pin=2 | duplicate_truth_count=2 | critical_duplicate_truth_count=1

Release handoffs:
- spark-telegram-bot: critical runtime_ahead_of_registry_pin; next safe action: Port and push the owner repo commit, update registry/release metadata, or explicitly keep this installed source classified as a local runtime test artifact.
- spawner-ui: warning runtime_ahead_of_registry_pin; next safe action: Port and push the owner repo commit, update registry/release metadata, or explicitly keep this installed source classified as a local runtime test artifact.

All selected canaries passed with required captures present.
