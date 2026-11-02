# VERIFICATION · NOVEMBER 2, 2026

## PASSED LOCALLY

- Node 24 production build and Lambda bundles: `npm run build`.
- 29 domain, Google signature/claim, authorization, API, repository and infrastructure assertions: `npm test`.
- All three CDK stacks synthesize with explicit synthetic validation configuration. Resource assertions cover AppName=Stats in both regions, private S3/OAC, API authorization, disabled authorizer/API caching, auth forwarding, frontend-only SPA behavior, exact read-only source IAM and no managed DynamoDB table.
- 6 Playwright Chromium checks across desktop and 390×844 phone layouts: year/metric switching, own history, staff CSV download/report filtering, unlinked account and network failures, overflow, skip-link/keyboard behavior and axe WCAG A/AA checks. No axe violations in the tested My Hours, Leaderboard and staff views.
- 1 integration test against official DynamoDB Local 1.25.1 on an explicit loopback endpoint: real GSI/member queries, >100-record pagination, totals and immediate authoritative identity revocation. Only a disposable stats-local-integration-* table was created/removed.
- Exact SHA-256 agreement with Puncher's local published contract and fixture copies. Contract: `c6eb76aa18f38378b74ec26d5d51cc9426abdf79b7e84f64c676897f3260feda`. Fixture: `15e4b3f095d47f85993cd0105583db95a834a229763d3f4faf17e39e4ec0abd6`.
- Inspected deployed reader bundle: no demo identities/fixture strings, synthetic auth entry point or minimatch dependency included.
- Manual browser review of historical years, volunteer metric and responsive phone layout. Revised design removes decorative slogans, brand subtitles, activity chart, redundant workspace labels and footer; shared base/colors match current Puncher and FMEA styling while retaining Figtree.

## LIVE ACCEPTANCE STILL REQUIRED

No production resources or records were modified, and no live deployment was performed. Real Google OAuth client/origin acceptance, Puncher development-table reconciliation, staff provisioning, hosted-zone/domain ownership, certificate issuance, SNS subscription/delivery and deployed API Gateway/CloudFront checks require the team's actual settings and approved mappings. Follow runbook.md and stats-integration.md. Synthetic fixtures do not verify production data.

The first browser attempt using installed Edge failed to launch under this host's sandbox. Tests were rerun successfully using Playwright's downloaded Chromium. Stats uses ports 4300/3100 to avoid Puncher's existing local ports.

`npm audit` reports two moderate findings: minimatch <11.0.1, bundled by current aws-cdk-lib 2.275.0, and its parent dependency entry. npm reports no upstream automatic fix. A package override did not replace CDK's bundled copy and was removed. This is an infrastructure-tooling dependency; the production reader bundle does not include minimatch. Recheck when updating CDK and prefer an upstream patched release. No high/critical findings were reported during this installation.

Browser/axe checks cover tested paths and do not establish complete accessibility conformance. Multi-member source reads are not a transactional snapshot; the roster GSI can lag recent changes, as the UI indicates.
