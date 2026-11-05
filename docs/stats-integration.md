# PUNCHER INTEGRATION · V1

Puncher is the sole writer/table owner. On November 2, 2026 Stats consumed the published local files from `C:/Users/zacharyo/Documents/Puncher/Puncher/contracts/stats-reader.v1.json`, `contracts/fixtures/reader-v1.json`, and `docs/stats-integration.md`. Copies of the schema and fixture are versioned here; the fixture filename is `contracts/fixtures/puncher-reader-v1.json`. Tests assert Puncher's expected yearly/career totals, and records are validated with the copied JSON Schema. This establishes local contract agreement, not verification of a deployed table.

## EXPLICIT HANDOFF

Supply Puncher's TableName, TableArn and TableRegion outputs as TABLE_NAME, PUNCHER_TABLE_ARN and SOURCE_REGION. The table has lowercase string pk/sk and GSI1 gsi1pk/gsi1sk with MEMBERS roster partition. Backend stacks run in us-east-2; SOURCE_REGION explicitly selects the source region. Same-account source access is supported; cross-account access requires a separately reviewed Puncher resource policy and configuration change. Stats never manages, tags or replaces the source table.

Before returning attendance, read APP#PUNCHER / SCHEMA. Supported values: schemaVersion 1, America/Chicago, seconds, reportingYearConvention `ending year; June 2 through June 1 inclusive`. Breaking changes require coordinated contract versioning. Additive fields are accepted and never automatically disclosed.

A verified `@stmarobotics.org` Google account can view the leaderboard without a Puncher identity. When an identity exists, it must be enabled and match the verified Google account. My Hours is available automatically when Puncher links that account to an active student. Staff Reports is available automatically to approved Puncher mentors. Mentors can have an active attendance record or no linked record. Existing `stats:staff` grants also authorize Staff Reports.

Stats uses either Puncher's explicit identity-to-member link or a CSV roster link verified by a student's first sign-in to Puncher. For the CSV path, Stats reads Puncher's `ROSTER_EMAIL`, `ROSTER_LOGIN`, and `BINDING` records to verify the current roster claim and Google subject. Stats does not grant My Hours from an email match alone or write identity records.

## READER POLICY

The reader role receives exactly:

```json
{"Effect":"Allow","Action":["dynamodb:GetItem","dynamodb:Query"],"Resource":["<PuncherTableArn>","<PuncherTableArn>/index/GSI1"]}
```

No Scan, PutItem, UpdateItem, DeleteItem, BatchWriteItem or TransactWriteItems. Authorizer has no DynamoDB grant. IAM read access is a trusted backend boundary; identity resolution and DTOs enforce per-person visibility. Never issue this role's credentials to a browser.

Stats queries only canonical member activity prefixes and never event counters, barcode/uniqueness/current claims, source documents, rollups, audits or notification state. Award snapshots determine credit; editing event metadata does not change historical award duration. Stats makes no approval, deduplication, identity-mapping or migration decisions.

## READ-ONLY ACCEPTANCE

1. Recompare Puncher's current published schema/fixture to these snapshots. Run `npm run check` and `npm run test:db` against a disposable local database.
2. Before deploying, verify the production `TABLE_NAME`, `PUNCHER_TABLE_ARN` and `SOURCE_REGION` in `cdk/lib/config.ts` match the Puncher stack output and the source schema.
3. After deployment, verify leaderboard access with a Workspace account that has no Puncher mapping. Verify My Hours for students with explicit and verified CSV links, Staff Reports for an approved mentor without a Stats role, and denial for disabled identities.
4. Compare known member/year totals, exact tie ranks and staff CSVs to approved records. Confirm overdue active visits earn zero before writer cleanup, warnings remain unchanged, and Stats makes no writes.
5. Test direct API Gateway URLs as well as CloudFront, revoke an identity during a session, and verify immediately denied subsequent requests. Verify errors and missing metadata do not show zero-hour cards.
6. Record the tested Puncher revision, table ARN, deployed environment and accepted results. No live acceptance has been claimed by this delivery.

The shared table's DynamoDB charges remain assigned to Puncher. Stats tags identify its compute/CDN/API resources; they cannot split table charges by calling application.
