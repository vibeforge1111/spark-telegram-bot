# SparkRecursive_bot Control-Proof Canary Evidence Summary

Generated: 2026-06-25T14:27:38.712Z
Runtime evidence collected: 2026-06-25T14:27:38.712Z
Runtime evidence expires: 2026-06-25T15:27:38.712Z (1h window)
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
- builder_trace_health | flags=historical_open_high_severity_events,missing_trace_refs | trace_status=recent_missing_trace_refs | window=24h | missing_trace_refs=480 | 1h_missing_trace_refs=0 | historical_missing_trace_refs=12721 | latest_missing_source_groups=2 | latest_clean_historical_window_groups=1
- repo_release_blocks | blocked_release_count=4 | critical_repo_count=0
- registry_pin_drift | classifications=runtime_ahead_of_registry_pin:2 | duplicate_truth_count=2 | critical_duplicate_truth_count=1

Release handoffs:
- domain-chip-memory: release_blocked; reason: behind upstream; next safe action: pull or merge upstream before release
- spark-intelligence-builder: release_blocked; reason: behind upstream; next safe action: pull or merge upstream before release
- spark-researcher: release_blocked; reason: behind upstream; next safe action: pull or merge upstream before release
- spawner-ui: release_blocked; reason: behind upstream; next safe action: pull or merge upstream before release
- spark-telegram-bot: critical runtime_ahead_of_registry_pin; next safe action: Port and push the owner repo commit, update registry/release metadata, or explicitly keep this installed source classified as a local runtime test artifact.
- spawner-ui: warning runtime_ahead_of_registry_pin; next safe action: Port and push the owner repo commit, update registry/release metadata, or explicitly keep this installed source classified as a local runtime test artifact.

All selected canaries passed with required captures present.
