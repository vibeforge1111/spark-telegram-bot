Spark Harness Core Vendor Manifest

This package artifact is vendored so isolated CI, publishing machines, and
standalone Telegram bot checkouts can resolve the canonical Harness Core
contracts without relying on an adjacent local Spark module checkout.

- Source repo: `vibeforge1111/spark-harness-core`
- Source commit: `df6a6c9311b8d24cae8ef6c5277136681ab03af3`
- Package: `@spark/harness-core@0.1.0`
- Rule: this is the canonical Harness Core contract/Governor package artifact,
  not a fallback authority plane. Old Telegram detectors remain evidence
  adapters only and must not execute without the TurnIntent envelope and
  Governor decision.

Refresh rule:

When Harness Core changes, refresh this vendored artifact from the released
Harness Core package/source commit, then run Telegram build, authority tests,
runtime sync check, and Spark compile before publishing.
