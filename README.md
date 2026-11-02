# STATS · STMA ROBOTICS / FRC 7028

Independent, read-only student hours, leaderboards and staff reports for Puncher's canonical dataset. React + TypeScript, Google Identity Services/OIDC, Lambda, HTTP API, DynamoDB reader, private S3/CloudFront OAC and TypeScript CDK. All application text uses self-hosted Figtree.

## RUN THE LOCAL DEMO

Requires Node.js 24 and npm. From this folder:

```sh
npm ci
npm run demo
```

Open **http://127.0.0.1:4300**. Choose Alex (student) or Robin (staff); unlinked and disabled-account examples are under Access-state examples. The API uses port 3100 so Stats can run alongside Puncher. Synthetic data uses a fixed November 2, 2026 clock, multiple years, exact ties, nearly equal rounded hours, a former student, active and logically expired visits, pending/unknown/voided credits and historical hour-only entries. No Google credentials or AWS account are needed for this explicit demonstration.

`npm run dev` instead requires explicit data configuration and real Google OIDC. Missing cloud configuration never selects demo data. Fixture adapters and fake tokens are absent from deployed Lambda bundles.

## CHECKS

```sh
npm run check
npm run test:browser
# With DynamoDB Local running at the explicit endpoint:
# PowerShell: $env:DYNAMODB_ENDPOINT='http://127.0.0.1:8000'
npm run test:db
```

`check` builds the browser and Lambda packages, runs domain/auth/API/CDK assertions, and synthesizes all three AWS stacks using clearly synthetic validation settings. These settings never establish a production integration. Browser tests use Playwright Chromium (`npx playwright install chromium`). CI also runs the DynamoDB Local and desktop/mobile accessibility checks.

## PROJECT MAP

| Path | Purpose |
| --- | --- |
| `ui/src` | My Hours, Leaderboard, staff reports, Google sign-in and responsive styles |
| `service/domain.ts` | Shared eligibility, date/year rules, DTO normalization, ranks and safe CSV |
| `service/auth.ts` | Server token verification and authoritative Puncher permission checks |
| `service/repository.ts` | Bounded, paginated read-only DynamoDB integration |
| `service/api.ts` | Authorized read routes and explicit response DTOs |
| `service/local.ts`, `service/fixtures.ts` | Loopback development adapter and isolated demo |
| `contracts` | Snapshot of Puncher's published v1 JSON Schema and language-neutral fixture |
| `infra` | Separate certificate, backend, frontend stacks and GitHub deployment trust |
| `tests` | Rules, security, contract, infrastructure, database and browser checks |

See [architecture](docs/architecture.md), [Puncher integration](docs/stats-integration.md), [setup/deployment/operations](docs/runbook.md), and [verification results](docs/verification.md). Original requirements remain in `stats-project-prompt.md`.

No live deployment has been performed. Configure the real Puncher table outputs, Stats OAuth client/origins, account, hosted zone, domain and role mappings before production use. Proposed domain: `stats.7028robotics.com`.
