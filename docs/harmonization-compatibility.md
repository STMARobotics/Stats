# Harmonization compatibility after main updates

Reconciled on 2026-11-04 against Stats main commit 4700d364a2fdb99a1240ca79ef6f80a74e6368f3. The existing codex/app-harmonization branch incorporates main by a merge, preserving published history and allowing a normal fast-forward branch push. Main itself is not changed.

The new main branch reorganizes CDK, service and UI into npm workspaces. Infrastructure modules and tests now live under cdk/lib and cdk/test, with the independent integration entrypoint under cdk/bin. Workspace commands retain the upstream build/deployment flow; only integration validation steps are added. Standalone integration stacks use the upstream default bootstrap qualifier instead of obsolete custom qualifiers.

The shadow Lambda entry resolves from the repository root regardless of the invoking workspace. The service build retains the projector alongside the existing reader/authorizer bundles. The current authorized dashboard, read-only source access and production stack names remain unchanged.

## Validation

- Clean locked npm ci succeeded in a source snapshot; package-lock.json is identical to the new main lockfile.
- npm run check passed: all workspace builds, existing app synthesis, and 38 unit/infrastructure tests.
- npm run cdk:synth:activity and the CDK workspace test command passed.
- 2 DynamoDB Local integration tests passed, including projection concurrency, duplicates and reversals.
- 6 existing browser cases passed in headless Chromium.
- Current Packs/FMEA main Git blob hashes match the canonical/wire schemas, fixtures, codec and producer transformer used here. The contract revision remains activity-v1-foundation-1.
- The cross-repository producer-to-consumer smoke passed with duplicate and reverse-order delivery, retaining shop credit and reversing voided volunteer credit.

## Local environment

The Windows sandbox cannot create npm workspace symlinks, so validation used ordinary workspace source copies while preserving locked resolution. No dependencies were upgraded. Browser checks use the committed tests and pinned headless Chromium; local app servers are managed in separate sessions because the sandbox blocks Playwright's managed-server teardown. The committed Linux CI lifecycle is unchanged. Neither these local checks nor synthesis claim live AWS acceptance or a passing remote CI run.
