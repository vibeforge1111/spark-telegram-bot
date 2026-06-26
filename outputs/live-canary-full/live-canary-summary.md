# SparkRecursive_bot Control-Proof Canary Evidence Summary

Generated: 2026-06-26T22:07:27.965Z
Runtime evidence collected: 2026-06-26T22:07:27.965Z
Runtime evidence expires: 2026-06-26T23:07:27.965Z (1h window)
Cases: 28
Gate scope: full release pack
Release gate: ready
Publish gate: not ready
Structured gate details: summary JSON `summary.gateDecisionDetails`

Verdicts:
- pass: 28
- fail: 0
- blocked: 0
- needs-retest: 0
- untested: 0

Release note: ready with caveats; complete the listed handoffs before publish/registry claims.

Release caveats:
- builder_trace_health | flags=historical_open_high_severity_events | trace_status=current_clean | window=1h | missing_trace_refs=0 | 1h_missing_trace_refs=0 | historical_missing_trace_refs=0 | high_severity_open_events=46 | unresolved_high_severity_events=1 | current_unresolved_high_severity_events=0 | unresolved_high_severity_source_groups=1 | latest_unresolved_high_severity_event=2026-06-02T09:03:25Z | latest_missing_source_groups=0 | latest_clean_historical_window_groups=0
- repo_release_blocks | blocked_release_count=4 | critical_repo_count=3
- local_runtime_test_artifacts | classifications=local_runtime_test_artifact:2 | duplicate_truth_count=2 | critical_duplicate_truth_count=0

Release handoffs:
- domain-chip-memory: publish_blocked repo_release_blocks; reason: behind upstream; behind=6; next safe action: pull or merge upstream before release
- spark-intelligence-builder: publish_blocked repo_release_blocks; reason: behind upstream; behind=12; next safe action: pull or merge upstream before release
- spark-researcher: publish_blocked repo_release_blocks; reason: behind upstream; behind=61; next safe action: pull or merge upstream before release
- spawner-ui: publish_blocked repo_release_blocks; reason: behind upstream; behind=29; next safe action: pull or merge upstream before release
- spark-installer-registry: warning local_runtime_test_artifacts; next safe action: Keep 2 installed sources (spark-telegram-bot, spawner-ui) for local SparkRecursive proof only, then port/push owner commits and update registry or release metadata before publish claims.
- spark-intelligence-builder: warning builder_trace_health; next safe action: Audit 1 unresolved historical high-severity Builder integrity family; latest unresolved event 2026-06-02T09:03:25Z, then append an owner-approved lifecycle resolution or keep it as an explicit publish handoff.

All selected canaries passed with required captures present.
