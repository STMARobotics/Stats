# ARCHITECTURE

## STACK AND OWNERSHIP

React 19 + Vite + TypeScript on Node 24 keeps the student-facing app in one language. Shared domain functions keep eligibility consistent across totals, rankings, reports and exports. TypeScript CDK follows FMEA's deployment model. The backend imports Puncher's canonical table but never creates, tags, manages or writes to it. Stats owns a separate DynamoDB table for OAuth state and opaque sessions.

The app uses Google OAuth authorization code + PKCE, a Lambda callback, an HTTP API and a private S3/CloudFront frontend. API Gateway HTTP API v2 delivers request cookies in its `cookies` field; Lambda normalizes those with headers before validating OAuth state or resolving sessions. The browser only receives a Secure, HttpOnly, SameSite=Lax cookie. OAuth client secrets are read at runtime from SSM SecureString; no Google token or client secret is exposed to the UI.

## REQUEST FLOW

The UI starts sign-in by navigating to `/api/auth/start`. The server stores hashed OAuth state with a short expiry, creates a PKCE verifier and nonce, then redirects to Google. The callback validates the state cookie, consumes its stored state once, exchanges the authorization code, verifies Google's signature and claims, checks the nonce, and stores an opaque random session token under its hash. The cookie expires in seven days; logout revokes the stored session. The API Gateway authorizer and reader independently resolve the cookie-backed session on each request. The reader then checks the authoritative Puncher identity/member mapping, including current enablement, roles and member status.

The backend grants only GetItem and Query against the exact Puncher v2 table ARN and GSI1 ARN. Stats looks up the Puncher user by verified Google subject. Private student routes use that subject to query attendance. Staff Reports requires an active Puncher `MENTOR` or `ADMIN` account. Leaderboards expose rank, display name, active/former state, eligible seconds and self-highlight. Personal histories omit source keys, member IDs, Google subjects, emails, roles, device records, provenance and raw legacy fields.

The reader checks APP#PUNCHER/SCHEMA, discovers the roster through GSI1, then queries member SHOP#, LEGACYSHOP# and VOLUNTEER# prefixes. It uses four concurrent member reads, at most 250 roster members and 100 pages of 100 items per query. Exceeding a bound fails the request; partial totals never appear complete. No scan or browser N+1 request is used. My Hours performs an authoritative own-history query even if the roster GSI has not caught up.

No aggregate cache or projection is maintained. Each response reports request-time as-of. The roster GSI is eventually consistent; roster changes and concurrent writes can affect a bounded multi-query response. Attendance and authorization reads are strongly consistent. Ranks may briefly omit a newly provisioned member.

## RULES AND FAILURES

Durations remain integer seconds until display. Completed checkout must precede cutoff; active and forfeited visits earn zero. Approved, dated, nonnegative legacy/volunteer credit contributes using its attendance/event date. Unknown durations remain null and visibly excluded. Approved malformed credits cause DATA_QUALITY, not a plausible total. Pending, quarantined and voided entries never earn credit. Writer-internal records are ignored.

Temporal calendar operations use America/Chicago. The ending reporting year includes June 1 and starts the preceding June 2. Career totals sum eligible history. Exact ties use competition ranks, then display name/internal ID order. Historical inactive students remain eligible; inactive students with no year credit are omitted. Mentor and test accounts never rank.

Sensitive responses use private/no-store and Vary: Cookie. CloudFront API caching is disabled and forwards cookies; SPA routing applies only to frontend assets and does not rewrite API errors. Login expiry returns 401 and the UI clears local signed-in state. Signed-in team accounts without a member link or Stats roles can view the leaderboard. Disabled identities and mismatched identity mappings are denied. Network/source failures return explicit errors, never fabricated zero totals. Production has no fixture fallback and rejects local endpoints/dev-auth flags.
