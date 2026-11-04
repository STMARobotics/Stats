# Harmonization verification

Verified locally on 2026-11-04 for the opt-in activity foundation, contract revision activity-v1-foundation-1. No remote CI, deployment, production event delivery, account linking or reward issuance is claimed.

- All four repositories pass npm run check:activity-contract: matching canonical/wire fixtures, stable event identities, exact Pipe field mapping, and shared implementation hashes.
- A cross-checkout smoke test exercised Puncher checkout plus volunteer award/void through the actual producer transformer and Stats batch consumer. Duplicate and reverse-order delivery preserved shop credit and removed volunteer credit.
- git diff --check passed. Integration settings remain absent from existing deployment configurations.

Production enablement requires the development AWS acceptance sequence in app-harmonization.md, including IAM and Pipe transformation, retry/DLQ recovery, stream replacement and canonical reconciliation. Verified identity linking, reward policies/ledger consumer, historical import, replay tooling and dashboard cutover are later milestones.

## Stats checks

- npm run check passed: type checking, frontend and service builds, 38 tests, and existing deployment synthesis.
- npm run cdk:synth:activity passed for the standalone shadow subscription with synthetic account/organization configuration.
- npm run test:db passed against disposable DynamoDB Local: two tests, including conditional projection concurrency and reversal behavior.
- Tests cover canonical/wire validation, duplicates, stale revisions, conflicting revisions, date/year movement, poison-message isolation and infrastructure defaults/IAM.
- CI now also checks shared contracts and synthesizes the standalone activity stack. Existing browser checks remain in CI; they were not rerun for this backend foundation.
