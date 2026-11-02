# PUNCHER INTEGRATION · V1

Puncher is the sole writer/table owner. On November 2, 2026 Stats consumed the published local files from `C:/Users/zacharyo/Documents/Puncher/Puncher/contracts/stats-reader.v1.json`, `contracts/fixtures/reader-v1.json`, and `docs/stats-integration.md`. Copies of the schema and fixture are versioned here; the fixture filename is `contracts/fixtures/puncher-reader-v1.json`. Tests assert Puncher's expected yearly/career totals, and records are validated with the copied JSON Schema. This establishes local contract agreement, not verification of a deployed table.

## EXPLICIT HANDOFF

Supply Puncher's TableName, TableArn and TableRegion outputs as TABLE_NAME, PUNCHER_TABLE_ARN and SOURCE_REGION. The table has lowercase string pk/sk and GSI1 gsi1pk/gsi1sk with MEMBERS roster partition. Backend stacks run in us-east-2; SOURCE_REGION explicitly selects the source region. Same-account source access is supported; cross-account access requires a separately reviewed Puncher resource policy and configuration change. Stats never manages, tags or replaces the source table.

Before returning attendance, read APP#PUNCHER / SCHEMA. Supported values: schemaVersion 1, America/Chicago, seconds, reportingYearConvention `ending year; June 2 through June 1 inclusive`. Breaking changes require coordinated contract versioning. Additive fields are accepted and never automatically disclosed.

Puncher admins must provision enabled IDENTITY#verified-google-sub / METADATA mappings with `stats:student` or `stats:staff` in roles. Student access requires a linked active student member. Staff mapping may be unlinked but must have explicit stats:staff; a dual student/staff identity must also meet its student-link requirements. Identity email must match the verified Google email; an email change requires Puncher administration. Domain membership, mentor, admin, a card number, Airtable User and a Puncher kiosk secret confer no Stats access.

## READER POLICY

The reader role receives exactly:

```json
{"Effect":"Allow","Action":["dynamodb:GetItem","dynamodb:Query"],"Resource":["<PuncherTableArn>","<PuncherTableArn>/index/GSI1"]}
```

No Scan, PutItem, UpdateItem, DeleteItem, BatchWriteItem or TransactWriteItems. Authorizer has no DynamoDB grant. IAM read access is a trusted backend boundary; identity resolution and DTOs enforce per-person visibility. Never issue this role's credentials to a browser.

Stats queries only canonical member activity prefixes and never event counters, barcode/uniqueness/current claims, source documents, rollups, audits or notification state. Award snapshots determine credit; editing event metadata does not change historical award duration. Stats makes no approval, deduplication, identity-mapping or migration decisions.

## DEVELOPMENT-TABLE ACCEPTANCE

1. Recompare Puncher's current published schema/fixture to these snapshots. Run `npm run check` and `npm run test:db` against a disposable local database.
2. Use an explicitly selected Puncher development table with read-only AWS credentials, `DATA_MODE=cloud`, `CLOUD_DEV_CONFIRMED=true`, `STATS_ENV=development`, TABLE_NAME, SOURCE_REGION and the Stats GOOGLE_CLIENT_ID. Omit DYNAMODB_ENDPOINT. Do not seed it from Stats.
3. Ask Puncher's approved setup to associate real development Google subjects and exact Stats permissions. Verify enabled/disabled/unlinked/student/staff access using Stats' own Google client.
4. Compare known member/year totals, exact tie ranks and staff CSVs to underlying approved records. Confirm overdue active visits earn zero before writer cleanup, warnings remain unchanged and no calls write to the table.
5. Test direct API Gateway URLs as well as CloudFront, revoke an identity during a session, and verify immediately denied subsequent requests. Verify errors and missing metadata do not show zero-hour cards.
6. Record the tested Puncher revision, table ARN, environment and accepted results before production rollout. No live acceptance has been claimed by this delivery.

The shared table's DynamoDB charges remain assigned to Puncher. Stats tags identify its compute/CDN/API resources; they cannot split table charges by calling application.
