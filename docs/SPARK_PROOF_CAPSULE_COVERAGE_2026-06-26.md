# Spark Proof Capsule Coverage

Date: 2026-06-26
Status: active implementation note

## Purpose

This checker covers the proof-capsule slice of the reliability ladder. It starts from the Harness Core legacy authority inventory and verifies that every action-capable Telegram plane has exactly one declared proof path.

The checker is intentionally source-backed. It does not claim live behavior from sampled logs; it proves the inventory and source still agree on where proof is produced or joined.

## Command

```bash
npm run control:proof:capsules -- --strict
```

Useful variants:

```bash
npm run control:proof:capsules
npm run control:proof:capsules -- --json
```

## Proof Path Types

- `direct_capsule`: the plane attaches or emits the Telegram Harness proof capsule directly.
- `joined_capsule`: the plane preserves a single downstream proof chain instead of minting a duplicate capsule.
- `explicit_no_action`: the plane records blocked, skipped, or not-started Harness evidence when no action happens.

Each action-capable inventory plane must have one policy, not zero and not many. Duplicate proof paths are treated as drift because they make later trace joins ambiguous.

Retired or non-action planes must not keep proof policies. An extra policy is also drift because it can make old routes look like active proof authority.

## Boundary

This checker does not replace the trace continuity audit or trace-join checker:

- `control:proof:audit` proves evidence planes are internally healthy.
- `control:proof:trace-join` proves route rows join to replies and proof evidence.
- `control:proof:capsules` proves action-capable authority planes have a declared proof-capsule policy and source markers.

If a future route becomes action-capable, update `src/legacyAuthorityInventory.ts` and add exactly one policy in `src/controlProofCapsuleCoverage.ts` in the same change.
