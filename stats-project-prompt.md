# Project prompt: Stats — STMA Robotics student hours, reports, and leaderboards

Build **Stats**, a production-ready AWS-hosted, read-only data viewer for STMA Robotics / FRC Team 7028. Students use their `@stmarobotics.org` accounts with OIDC to view their own shop/volunteer hours and the team leaderboard. Authorized staff view team reports. The reporting year ends June 1.

This is one of **two separate apps**. **Puncher** records shop attendance, runs midnight expiration, records mentor volunteer attendance, manages members/card/Google mappings and staff permissions, and imports Airtable history. Stats reads Puncher's canonical dataset through its own backend and does not duplicate those operational workflows. Build/deploy Stats independently with its own frontend, API, Google OAuth configuration, CDK stacks, logs, IAM roles, CI, and `AppName=Stats` tag. Its domain proposal is `stats.7028robotics.com`, subject to configuration.

Puncher is normally built first, but do not block local Stats work on a deployed writer: use the shared baseline contract and synthetic multi-year fixtures, then verify against Puncher's published contract and a development table. A local fixture adapter must never silently replace a missing production database with fabricated results.



## Architecture, stack flexibility, and AWS deployment

Inspect https://github.com/STMARobotics/fmea-app as the standard for **DynamoDB, AWS deployment topology, authentication approach, and maintainable project organization**. Read its README, workspace manifests, representative service handlers, auth verification, local development adapter, and CDK backend/frontend/certificate/configuration and workflow files. Do not modify or reuse FMEA's production resources.

**Frontend frameworks and backend languages are flexible.** Angular/TypeScript is a reasonable low-friction default because the team already works with it. React and Rust, or another sensible combination, are also acceptable. Choose a coherent stack based on the task and briefly explain its maintenance implications for student developers. Do not treat Angular, Angular Material, Node.js, TypeScript application code, npm workspaces, or a specific source-directory layout as mandatory. Prefer familiar tooling when alternatives offer no clear benefit. Keep local development, build, tests, and deployment straightforward and documented. Verify maintained compatible dependencies and commit lockfiles.

The infrastructure requirements are firm:

- Use **DynamoDB** and **AWS CDK**. CDK in TypeScript follows the FMEA convention; infrastructure language does not force the application language. No MongoDB, Postgres, Airtable, browser storage, or alternative hosting platform as the production source of truth.
- Use a private S3 frontend bucket behind CloudFront Origin Access Control, API Gateway HTTP API, and Lambda backend handlers. Expose same-origin `/api/*` routes, disable API response caching, and forward the auth/device headers or cookies actually required. Confine SPA rewriting to frontend routes.
- Follow the reference's separate certificate, backend, and frontend stack structure. Application resources belong in `us-east-2`; the CloudFront ACM certificate belongs in `us-east-1`. Configure Route 53, names, account, regions, domains, and OAuth origins explicitly.
- Package the selected backend correctly for Lambda: CDK NodejsFunction bundling is appropriate for TypeScript/Node; a supported custom-runtime packaging flow is appropriate for Rust. Do not accidentally require a Node runtime for a Rust service. Keep business handlers testable through a local adapter.
- Public runtime configuration may use `/config.json`, following FMEA. Publish public OAuth IDs and display settings only; never secrets. Do not copy the reference's OAuth client ID without confirming origins and intended use.
- Use application-specific GitHub Actions/OIDC deployment roles and trust policies, with build/test/CDK synthesis checks. Do not copy FMEA's production role ARNs or hard-code AWS access keys.
- Provide explicit DynamoDB Local configuration and synthetic data for isolated development. FMEA itself documents cloud-table local development; endpoint-based local testing is an intentional addition here. Cloud-backed local development must explicitly select a development environment/table.
- Independently deploy this app with its own frontend, API, auth configuration, logs, alarms, IAM roles, CI, stack/resource names, and proposed configurable domain `stats.7028robotics.com`. This is a proposed domain, not an existing configured deployment.

### Resource identification and cost allocation

Set the exact, case-sensitive AWS resource tag **`AppName=Stats`** on every resource this app creates that supports tagging, including resources across both regions. Add an `Environment` tag and consistent app/environment name prefixes. Puncher uses `AppName=Puncher`; Stats uses `AppName=Stats`. Do not use `FMEA`, `Timeclock`, or one combined AppName for both apps. Include CDK assertions that the app's resources receive the correct value.

The canonical shared DynamoDB table is provisioned and tagged by **Puncher** only. Stats references it without re-tagging or managing it. Document that table-level DynamoDB charges remain allocated to Puncher even when reads originate in Stats; tags alone cannot divide one resource's costs by calling app. Keep Stats compute/CDN/API costs separately tagged. Do not add a duplicate database solely to make the bill look separate. Document any genuinely shared costs and their owner.

Provide an operations step for activating the user-defined `AppName` key in AWS Billing cost allocation tags and grouping/filtering by its distinct values in Cost Explorer. Creating CDK tags alone does not activate cost allocation. See [AWS cost allocation tag activation](https://docs.aws.amazon.com/awsaccountbilling/latest/aboutv2/activating-tags.html).


## Human identity and authorization — confirmed domain

**Students and staff use their `@stmarobotics.org` Google Workspace email accounts with OIDC authentication. The student domain is confirmed; do not ask for it again or invent a different school domain.** Match FMEA's Google Identity Services flow and API Gateway Lambda-authorizer approach, adapting client/server libraries to the chosen framework/language.

Verify signatures, issuer, intended audience, expiration, subject, verified email, and `hd=stmarobotics.org` on the server. A browser-decoded JWT or an email address ending in the domain is not sufficient verification. Configure the correct allowed origins and client/audience for each app. Do not assume a token issued for Puncher's client can be accepted by Stats if they use different clients. Do not share browser storage/cookies across origins as an implicit sign-in design. All ordinary human sign-in uses this OIDC flow; no new password system.

Use Google's verified `sub` as the stable identity and explicitly associate students with internal member IDs. Provision app roles through an admin-managed mapping. The common domain does not automatically confer mentor/admin permissions. Unlinked, disabled, or unapproved identities get a clear access/setup message. Airtable's `User` value and the six-digit card number are not portal credentials. Students cannot link themselves to a different member by submitting a member ID or barcode.

Enforce permissions in the backend, including direct API Gateway calls. Treat roles as app-specific permissions: student Stats access, mentor event ownership, and administrator capabilities are not interchangeable. A role provisioned in Puncher can authorize Stats reads only through the shared documented policy. Handle token expiry and reauthentication clearly and enforce disabled identities without unsafe authorizer caching. Test local/deployed parity. Development auth fixtures must be impossible to enable in production.


## Design and maintainability

Use **Figtree for all application text**, including navigation, buttons, forms, tables, numbers, status messages, and body copy. Load the required font weights and apply the family globally, including framework/component-library controls. Use **bold, ALL-CAPS titles and section headings** (Figtree 700 or heavier). Keep body text, names, emails, and entered event titles in their natural case; apply uppercase styling to displayed headings without changing stored data. These typography requirements take precedence over the reference app's fonts.

Follow FMEA's restrained dark administrative style: near-black backgrounds, charcoal panels, readable light text, muted labels, mint/green accents, clear errors, and modest borders. Adapt components to the selected frontend; Angular Material itself is optional. Make phone layouts, keyboard focus, accessible labels, contrast, and reduced motion work. Do not add visual game mechanics or an unrelated membership platform. Keep validation, domain rules, persistence, and UI code separated enough for manual maintenance without inventing a large framework.


## Shared Puncher ↔ Stats data contract — baseline v1

This exact section appears in both project prompts. **Puncher is the sole owner/writer of the canonical attendance dataset, member/identity mapping, volunteer awards, imports, and audit history. Stats is a separate application with a server-side read-only DynamoDB integration.** Stats must not run imports, alter member bindings or roles, write credits, acknowledge Puncher warnings, run midnight cleanup, or deploy/manage Puncher's table. No duplicate independently editable dataset and no browser access to DynamoDB.

Puncher provisions one on-demand DynamoDB application table with lowercase string `pk`/`sk` attributes and FMEA-style optional `GSI1`/`GSI2` names with lowercase index attributes. Publish its table ARN/name and region as deployment outputs. Stats receives them as explicit CDK/environment configuration and imports an external table reference. Its runtime identity receives only required read operations against that exact table/index ARNs, with no Put/Update/Delete/BatchWrite/TransactWrite permissions. Stats has its own API and Google authorizer. It does not need cross-origin browser access to Puncher and does not reuse a Puncher kiosk credential.

The read contract is language-neutral JSON, with `schemaVersion: 1`, UTC ISO timestamps, local dates as `YYYY-MM-DD`, and integer `creditedSeconds`. Use stable internal UUID-like member IDs. Physical key names and business fields below are the initial integration baseline:

| Record | Key pattern | Minimum business fields |
| --- | --- | --- |
| Contract metadata | `pk=APP#PUNCHER, sk=SCHEMA` | `schemaVersion=1`, timezone `America/Chicago`, duration unit `seconds`, reporting-year convention |
| Member | `pk=MEMBER#<memberId>, sk=METADATA` | `memberId`, `displayName`, `memberKind` (student/mentor), `active`; roster discovery via `GSI1: gsi1pk=MEMBERS, gsi1sk=<memberId>` |
| Google identity | `pk=IDENTITY#<googleSub>, sk=METADATA` | `googleSub`, `memberId` when linked, verified email, `enabled`, explicit roles/permissions |
| Shop session | `pk=MEMBER#<memberId>, sk=SHOP#<startedAt>#<sessionId>` | `sessionId`, `memberId`, `shopDate`, `reportingYear`, `startedAt`, `cutoffAt`, optional `endedAt`, `status`, `creditedSeconds` |
| Legacy shop credit | `pk=MEMBER#<memberId>, sk=LEGACYSHOP#<date-or-UNDATED>#<importRecordId>` | `memberId`, optional validated `shopDate`, optional `reportingYear`, review `status`, optional `creditedSeconds`, source provenance; never fabricated scan timestamps |
| Volunteer event | `pk=EVENT#<eventId>, sk=METADATA` | `eventId`, title, `eventDate`, `reportingYear`, `durationSeconds`, mentor Google subject, version |
| Volunteer credit | `pk=MEMBER#<memberId>, sk=VOLUNTEER#<date-or-UNDATED>#<awardId>` | `awardId`, `memberId`, optional `eventId`, title/date snapshot, validated `eventDate`/`reportingYear` when available, approval `status`, optional `creditedSeconds`, recording/source provenance |

Use shop-session statuses `active`, `completed`, and `forfeited_missing_checkout`. Only completed sessions with valid checkout before their cutoff earn duration. `active` and forfeited sessions have zero credited seconds. Use `approved`, `pending_review`, `quarantined`, and `voided` for legacy/volunteer credit disposition; only valid approved dated entries contribute to credited totals. Missing/unknown credit is nullable or absent, not an invented zero. Negative imported adjustments remain under review until an explicit migration policy is agreed. Preserve original approval values and raw data separately.

Puncher may add transactional barcode-claim, current-session, active-by-date, notification, per-event participation-uniqueness, device-session, idempotency, and audit records. Document these as writer-internal records so Stats cannot mistake them for extra credits. A volunteer uniqueness claim and its member credit must commit atomically. Stored display snapshots do not permit later event edits to rewrite awarded duration silently.

Both apps use the same eligibility and reporting rules: separate shop/volunteer totals; no credit for active/expired/forfeited visits, unapproved volunteer rows, quarantined imports, or rollup fields. Legacy approved dates use their historical dates. Completed visits preceding a forfeited visit keep credit. If an active record's cutoff passed before cleanup, show it as logically expired with zero credit. Stats does not write that expiration back.

**Year end is June 1, included as the last local date.** The new year begins June 2 at 00:00 America/Chicago. Example: `2025–2026` covers June 2, 2025 through June 1, 2026 inclusive, represented as `[2025-06-02 00:00, 2026-06-02 00:00)` local time and stored by ending year `2026`. Compute timezone boundaries with daylight-saving-aware calendar operations, not fixed UTC offsets or 365-day arithmetic. Shop reporting uses `shopDate`; volunteer reporting uses event date, not recording/import date. Career totals sum eligible underlying records across years; no history is deleted or reset at year end.

Publish `contracts/stats-reader.v1.json` (machine-readable record schemas/key and status definitions), equivalent language-neutral fixtures, and `docs/stats-integration.md` in Puncher. Keep implementation and contract synchronized. Stats consumes that published contract if available and implements a versioned adapter; if Puncher is not available yet, build against this baseline and synthetic fixtures while making the integration dependency explicit. A startup/health check should report an unsupported schema version clearly, without guessing and showing plausible wrong totals. Backward-compatible extra fields may be ignored. Breaking key/status/eligibility changes require coordinated contract versioning and tests in both apps.

At this team size, bounded paginated queries of the roster and each member's eligible records, aggregated in the Stats backend, are acceptable. Avoid full-table scans on each request and N+1 requests from the browser. If summaries/projections are introduced, specify ownership, idempotent updates, reconciliation, latency, and completeness; do not count summaries in addition to their source records. A GSI may discover members but never enforces uniqueness or current attendance. Use authoritative reads/conditional transactions for Puncher mutations.

Document that Stats read access is a trusted backend boundary: authenticate/authorize each request before fetching or returning data and return explicit response DTOs, never raw DynamoDB items, card numbers, role records, device hashes, or source documents. Table IAM read access alone does not enforce each student's data visibility.


## Student-facing experience

Provide responsive **My Hours** and **Leaderboard** pages that work well on phones and computers. Student sign-in is Google OIDC with the confirmed `stmarobotics.org` domain. Resolve the member from the verified identity on the server. Student data is not anonymous/public and a card number is not a sign-in method.

### My Hours

- Default to the current reporting year; allow current/prior years and clearly show the date interval.
- Show credited shop hours and verified volunteer hours separately, with career totals separately labeled. Derive totals from eligible underlying records or a verified compatible projection; never add Airtable rollups to their source records.
- Show shop history with local date, available clock-in/out, visit duration, and completed/active/forfeited/legacy status. Imported hour-only entries never get invented clock-in/out times.
- An active session can show provisional elapsed time separately, but it contributes zero to credited totals until valid checkout. If its cutoff has passed, display logical expiration/forfeiture with zero credit even if Puncher cleanup has not updated the record yet.
- Show volunteer events/hours and clear approval/review status. Pending/quarantined/voided records are visibly distinct and not credited.
- Show missed-checkout history and explain that only the unfinished visit loses credit. Earlier completed visits that date keep credit. Reading a warning in Stats must not consume Puncher's next-clock-in warning; Stats cannot acknowledge or modify that writer state.
- Show the student's rank for the selected year/metric, linked to the matching leaderboard.
- Provide clear empty-year, unlinked-account, network, expired-login, unsupported-schema, and unavailable-data states. Missing input never masquerades as an actual zero-hour total.

The student portal is read-only: no clock-in/out, volunteer self-award, hours editing, role changes, card association, or recovery/appeal path for forfeited sessions. Link to Puncher only where an authorized operational user needs that app.

### Leaderboards

- Default to **Shop Hours** for the current reporting year, highest credited duration first.
- Offer a reporting-year selector for current/historical years and separate **Shop Hours** / **Volunteer Hours** metrics. Changing year filters/recomputes the ranking rather than just sorting year labels. Do not silently combine the two categories.
- Show rank, display name, and eligible hours. Highlight the signed-in student and show their personal rank even when the list is paginated.
- Rank by unrounded integer credited duration. Use shared competition ranks for exact ties, e.g. 1, 1, 3, with stable display-name/internal-ID order within a tie. Equal rounded labels do not necessarily mean a true tie.
- Include student members, not mentor/admin-only or test accounts. Retain former/inactive members' valid historical entries with a suitable label; deactivation must not rewrite prior standings. Their identity cannot sign in if disabled, but eligible history remains.
- Exclude provisional/expired/forfeited shop visits, unapproved volunteer records, unresolved/quarantined imports, and duplicate totals/rollups. Do not delete annual history or zero underlying data at rollover.
- Expose only leaderboard fields. Do not include card numbers, emails, private visit details, grades, dues, auth mappings, or source data in the response and merely hide them with CSS.

### Reporting-year rules

The year ends **June 1 inclusive**, with the next year starting June 2 at 00:00 America/Chicago, using the shared reporting convention. Example: **2025–2026 = June 2, 2025 through June 1, 2026**. Use the exact shared v1 boundary/ending-year convention. Display the date interval so its meaning is visible. Compute current year from the server clock and handle daylight saving; do not group by UTC dates or January-to-December calendar years.

Shop sessions use local shop date; legacy shop records use validated attendance date; volunteer awards use the event's local date, even if scanned/imported later. Exclude undated unreviewed records from yearly credited totals. Reconcile student totals, ranks, staff reports, and exports against the same eligibility/year functions. Career credit is the sum of eligible history, not a separate arbitrary rollup. Do not assume Airtable's old “Current Year” formula had the same cutoff.

## Staff reporting and access boundaries

Allow authorized mentors/admins to read the currently-in-shop list, member/year summaries, shop history, volunteer event rosters, forfeitures, and approved legacy history, within documented role permissions. Include member search, year/date-range filters, separate shop/volunteer totals, and CSV exports with quoting and formula-injection-safe text. Staff reports can explain review-state exclusions without exposing unnecessary raw legacy fields. Put changes to member mappings, approval decisions, events, imports, and devices in Puncher, accessible through configured links rather than Stats mutation endpoints.

Student APIs derive the member ID from the verified identity. Reject attempts to fetch another student's private records via query/path/member-ID tampering. Only the limited leaderboard is team-visible. A recognized domain alone is not sufficient to enumerate full team reports. Enforce active/linked identity and role checks on every API request; client-side route guards are a convenience only. Avoid raw database passthrough and broad wildcard reporting APIs. Keep sensitive responses private/no-store and prevent cross-user leakage through caches or error messages.

Stats is operationally read-only, including its API, Lambda IAM policy, deployment and jobs. It can set ordinary local UI preferences, but must not write Puncher records, bootstrap staff, refresh source summaries, consume missed-checkout notifications, run midnight cleanup, or import CSVs. Role/member administration lives in Puncher.


## Historical data and integration behavior

Puncher owns the import of the owner's Airtable exports: Members (49 rows), Attendance (1,782), Volunteer (133), and Safety Training (50). These are preparatory observations to be revalidated by the Puncher importer, not a second Stats import task. Stats consumes only canonical mapped/reviewed records and statuses.

Important history constraints: the exports contain no student barcode column; the `User` column is not a verified Google identity; attendance has dates/hours but no entry/exit timestamps; some rows have missing dates/hours, unusually large or negative values, or identical repeats. Most volunteer approval values are blank, while 10 are explicitly `checked`. Member rollup totals differ from raw activity sums. Stats must honor the writer's approved/pending/quarantined/voided outcomes rather than repair dates, infer approval, deduplicate records, invent timestamps, create IDs, or force totals to match. Identity mapping and migration decisions are handled in Puncher.

Implement a data-access adapter against the shared versioned contract. Use bounded/paginated server queries and, at this team's scale, aggregate eligible per-member records without a large analytics platform. Fetch current identity status from authoritative records. If using an eventually consistent roster GSI or short-lived aggregate cache, document freshness and avoid claiming live accuracy beyond it. Provide an as-of indication when caching affects reports. Authorization revocation cannot rely on a stale leaderboard cache. Unknown schema/status/required fields must produce an explicit integration/data-quality error or documented exclusion, not plausible incorrect credit.

The source table stays owned by Puncher's CDK. Import its ARN/name/region through config and document the read-only IAM grant for table and necessary indexes. Do not create a replacement empty table on missing configuration, import the existing table into Stats management, or grant source writes in the name of testing. Use a separate disposable local test database/fixtures rather than seeding the live shared table from Stats.


## Verification and delivery

Use the selected stack's appropriate unit/component/browser tools, a DynamoDB Local-compatible integration harness, shared contract fixtures, and CDK assertions. Verify:

- Google OIDC signature/audience/issuer/expiry/verified-email/hosted-domain enforcement, explicit role/member mapping, denied unlinked/disabled access, and no student IDOR or raw source leakage.
- Students see only their own detailed history plus limited leaderboard fields. Staff-only queries and exports reject student/device identities. Direct API Gateway calls enforce the same checks.
- Correct selected-year/career shop and volunteer totals, active provisional display, zero credit for logical expiration before cleanup, preserved earlier completed visits, and no warning acknowledgement/write side effects.
- Year/metric switching, historic records, former students, empty years, shared tie ranks and stable pagination; all rankings use unrounded eligible seconds.
- June 1/June 2 local boundary tests on both sides of midnight, UTC-offset changes, and a volunteer award recorded/imported later than its event date. The annual rollover never deletes/reset source records.
- Legacy approval/missing-date/outlier states, no fabricated timestamps, no rollup double-counting, consistent exports, safe CSV text, network/schema failures, and cross-user cache isolation.
- Puncher's published v1 fixtures/schema and Stats adapter agree on keys, fields, status semantics and year grouping. Adding benign fields is compatible; unsupported schema versions fail clearly.
- CDK applies `AppName=Stats` across supported resources/regions, source IAM allows only required reads, no shared-table creation/replacement/tag mutation occurs, and API caching/auth forwarding/runtime config/production auth guards are correct.

Deliver working My Hours, Leaderboard, and staff-reporting pages backed by the authenticated Stats API and documented Puncher integration; CDK stacks/CI; app-specific Google client/origin/runtime configuration; synthetic multi-year identities/data; tests and accessible/responsive UI checks; and a short setup/deployment/integration/cost-allocation runbook. Include a local browser demo with synthetic data and explain any unavailable live integration, rather than claiming fixtures verify production. Staff role/identity mappings must come from Puncher's approved setup.

Inspect FMEA and workspace instructions, choose a maintainable stack, write a concise architecture note, and implement. Missing production credentials must not prevent useful local work. Configure the real table/domain/client before a production deployment; never silently substitute demo data. Do not change FMEA or Puncher's production records. Do not add a scanning kiosk, mentor awarding, source-data migration, or administrative write workflows to Stats.


## Reference links and handoff

- [FMEA reference repository](https://github.com/STMARobotics/fmea-app)
- [FMEA architecture/local setup/OIDC](https://github.com/STMARobotics/fmea-app/blob/main/README.md)
- [FMEA CDK backend](https://github.com/STMARobotics/fmea-app/blob/main/cdk/lib/backend-stack.ts)
- [FMEA CDK frontend](https://github.com/STMARobotics/fmea-app/blob/main/cdk/lib/frontend-stack.ts)
- [FMEA CDK regions/stacks](https://github.com/STMARobotics/fmea-app/blob/main/cdk/bin/cdk.ts)
- [FMEA Google token verification](https://github.com/STMARobotics/fmea-app/blob/main/service/src/auth/google-id-token.ts)
- [EventBridge Scheduler timezone/timing](https://docs.aws.amazon.com/scheduler/latest/UserGuide/schedule-types.html)
- [DynamoDB TTL behavior](https://docs.aws.amazon.com/amazondynamodb/latest/developerguide/TTL.html)
- [Camera access](https://developer.mozilla.org/en-US/docs/Web/API/MediaDevices/getUserMedia)
- [BarcodeDetector browser limitations](https://developer.mozilla.org/en-US/docs/Web/API/BarcodeDetector)

Prepared November 2, 2026. FMEA is the architecture/database/deployment reference; app-language/framework selection is intentionally flexible. Students and staff use stmarobotics.org OIDC. This two-app brief supersedes the previous combined timeclock prompt. Reinspect current reference code and confirm actual deployment settings during implementation.

