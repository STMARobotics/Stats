# PUNCHER INTEGRATION · V2

Puncher owns the canonical table and all writes. Stats validates records against [Puncher's published v2 schema](https://github.com/STMARobotics/Puncher/blob/6f1f727e3bdd0b5229244340fa92f498e568ae94/contracts/stats-reader.v2.json) and checks yearly and career totals against the matching fixture. Both are versioned here as `contracts/stats-reader.v2.json` and `contracts/fixtures/puncher-reader-v2.json`.

## EXPLICIT HANDOFF

Match the source ARN and region in `cdk/lib/config.ts` to Puncher's TableArn and TableRegion outputs. Stats derives the reader's table name from the ARN. The production source is `puncher-data` in us-east-2. Discover roster records through `GSI1` with `gsi1pk=USERS`. Query `SHOP#`, `LEGACYSHOP#`, and `VOLUNTEER#` sort key prefixes in each `ATTENDANCE#<Google subject>` partition. Stats imports the table read-only.

Before returning attendance, read `APP#PUNCHER / SCHEMA`. Supported values are schema version 2, America/Chicago, seconds, and reporting year convention `ending year; June 2 through June 1 inclusive`. Missing or unsupported metadata produces an error. Additive fields are accepted and only explicit response fields are disclosed.

Stats looks up `USER#<verified Google subject> / METADATA` on each request. My Hours opens by default and shows the signed-in user’s own attendance for any active Puncher account. Active `MENTOR` and `ADMIN` users can also open Reports. A verified `@stmarobotics.org` Google account can view the leaderboard before signing in to Puncher to create its user record. An inactive Puncher user is denied access. Puncher owns account creation and role changes.

## READER POLICY

The reader role receives exactly:

```json
{"Effect":"Allow","Action":["dynamodb:GetItem","dynamodb:Query"],"Resource":["<PuncherTableArn>","<PuncherTableArn>/index/GSI1"]}
```

The API authorizer reads the separate Stats session table. The reader alone accesses the Puncher table. IAM constrains the source table and index. The backend checks the user's role and returns only the fields intended for that view.

Stats queries only canonical member activity prefixes and never event counters, barcode/uniqueness/current claims, source documents, rollups, audits or notification state. Puncher records the staffed time for completed shop visits. Stats uses that credit and checks that it fits within the elapsed visit. Award snapshots determine credit; editing event metadata does not change historical award duration. Stats makes no approval, deduplication, identity-mapping or migration decisions.

## READ-ONLY ACCEPTANCE

1. Recompare Puncher's current published schema/fixture to these snapshots. Run `npm run check` and `npm run test:db` against a disposable local database.
2. Before deploying, verify that `tableArn` and `sourceRegion` in `cdk/lib/config.ts` match the Puncher stack outputs and that the table reports schema v2.
3. After deployment, verify leaderboard access before a user's first Puncher sign-in, My Hours for an active student, mentor and admin, Reports for an active mentor and admin, and denial for a disabled user.
4. Compare known member/year totals, exact tie ranks and staff CSVs to approved records. Confirm overdue active visits earn zero before writer cleanup, warnings remain unchanged, and Stats makes no writes.
5. Test direct API Gateway URLs as well as CloudFront. Disable a test user during a session and verify that the next request is denied. Verify that errors and missing metadata do not show zero-hour cards.
6. Record the tested Puncher revision, table ARN, deployed environment and accepted results. No live acceptance has been claimed by this delivery.

The shared table's DynamoDB charges remain assigned to Puncher. Stats tags identify its compute/CDN/API resources; they cannot split table charges by calling application.
