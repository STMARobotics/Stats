# ARCHITECTURE

## STACK AND OWNERSHIP

React 19 + Vite + TypeScript on Node 24 matches the local Puncher implementation and keeps one application language for student maintainers. The UI has three focused pages without an additional component framework. Shared domain functions keep eligibility consistent across totals, rankings, reports and exports. TypeScript CDK follows FMEA's deployment model. This choice trades FMEA's Angular component familiarity for reuse of Puncher's React skills; no operational writer code is copied.

The FMEA README, root/service/UI/CDK manifests, representative list handler, Google verifier/authorizer, local HTTP adapter, configuration, certificate/backend/frontend stacks and deployment workflow were inspected November 2, 2026. Reference: [STMARobotics/fmea-app](https://github.com/STMARobotics/fmea-app). Retained patterns: lowercase DynamoDB keys, GSI roster discovery, handler reuse locally, Google Identity Services, Lambda authorizer, public config.json, separate regions/stacks, private S3 + OAC and same-origin HTTP API. Stats adds explicit role resolution, verified-email/domain/issuer/audience/expiry checks, bounded pagination, no unsafe authorizer caching, endpoint-based DynamoDB Local and a source table import. No FMEA resource names, OAuth client ID, hosted-zone ID, production role ARN or AWS resource is reused.

## REQUEST FLOW

Google Identity Services returns an ID token to the browser callback. The token stays in React memory (not browser persistence) and is sent as a Bearer header. API Gateway's Lambda authorizer validates the signature and Google claims, with a zero-second authorizer cache. The reader also verifies the token and reads the current IDENTITY/member mapping with strongly consistent GetItem before fetching attendance. Repeated verification favors clear local/deployed parity and safe direct invocation; Google's library caches signing keys.

The backend imports Puncher's table. Only GetItem and Query against its exact ARN and GSI1 ARN are granted. Students resolve their member server-side; private student routes accept no member ID. Staff requires `stats:staff`. A mentor/admin role alone grants nothing. Leaderboard returns only rank, display name, active/former state, eligible integer seconds and self-highlight. Private histories omit source keys, member IDs, Google subjects, emails, role/device records, provenance and raw legacy fields. Staff receives only the fields needed for the selected report.

After authorization, the backend checks APP#PUNCHER/SCHEMA, discovers the roster through GSI1, then queries member SHOP#, LEGACYSHOP# and VOLUNTEER# prefixes. It uses four concurrent member reads, at most 250 roster members and 100 pages of 100 items per query. Exceeding a bound fails the request; partial totals never appear as complete. No scan or browser N+1 request is used. My Hours performs an authoritative own-history query even when a new member is absent from the roster GSI.

No aggregate cache or projection is maintained. Each response reports its request-time as-of. The roster GSI is eventually consistent; an immediately changed roster or writes during multi-query aggregation can affect the result. These are bounded reads, not a transactional cross-member snapshot. Attendance and authorization reads are strongly consistent. Ranks may briefly omit a newly provisioned member; no claim of instantaneous roster accuracy is made.

## RULES AND FAILURES

Durations are integer seconds until display formatting. Completed checkout must precede cutoff; active/forfeited visits earn zero. An overdue active visit is displayed as missed checkout without writing back. Approved, dated, nonnegative legacy/volunteer credit contributes using its attendance/event date. Unknown durations remain null and visibly excluded. Approved malformed credits cause DATA_QUALITY rather than a plausible total. Pending, quarantined and voided entries never earn credit. Writer-internal records are ignored.

Temporal calendar operations use America/Chicago. The ending reporting year includes June 1 and starts the preceding June 2. Career totals sum eligible source entries; nothing resets at rollover. Exact ties use 1,1,3 competition ranks, followed by display name/internal ID order. Rounded equal labels do not confer a tie. Historical inactive students remain eligible; inactive students with no year credit are omitted. Mentor and test accounts never rank.

Sensitive responses use private/no-store and Vary: Authorization. CloudFront API caching is disabled and forwards authorization; SPA routing attaches only to the S3 behavior and rewrites a small frontend allowlist. API errors stay API errors. No browser DynamoDB credentials, cross-origin cookie sharing, warnings acknowledgement, source summaries, imports, jobs or write endpoints exist.

Unknown schema, required fields, status, inconsistent keys/year or invalid eligible durations produce explicit 503 integration errors. Network/source failure never returns fabricated zero totals. Login expiry returns 401, clears the browser session and asks for Google reauthentication. Unapproved/disabled/unlinked accounts receive setup guidance. Production configuration has no fixture fallback and rejects local endpoints/dev-auth flags.
