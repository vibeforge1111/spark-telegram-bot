# SparkRecursive_bot Control-Proof Canary Evidence Summary

Generated: 2026-06-24T14:52:20.669Z
Runtime evidence collected: 2026-06-25T01:44:49.582Z
Runtime evidence expires: 2026-06-25T02:44:49.582Z (1h window)
Cases: 28
Release gate: not ready
Publish gate: not ready

Verdicts:
- pass: 27
- fail: 0
- blocked: 0
- needs-retest: 0
- untested: 1

Release caveats:
- registry_pin_drift | runtime_ahead_of_registry_pin=2 | duplicate_truth_count=2 | critical_duplicate_truth_count=1

Release handoffs:
- spark-telegram-bot: critical runtime_ahead_of_registry_pin; next safe action: Port and push the owner repo commit, update registry/release metadata, or explicitly keep this installed source classified as a local runtime test artifact.
- spawner-ui: warning runtime_ahead_of_registry_pin; next safe action: Port and push the owner repo commit, update registry/release metadata, or explicitly keep this installed source classified as a local runtime test artifact.

Attention summary:
- verdict: 1 case

Cases needing attention:
- cp-publish-001: untested; missing verdict
