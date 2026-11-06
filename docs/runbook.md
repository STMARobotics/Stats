# SETUP, DEPLOYMENT AND OPERATIONS

## LOCAL MODES

Use Node 24. `npm ci` installs the committed lockfile. `npm run demo` runs only synthetic records/auth on loopback UI 4300/API 3100 and a fixed November 2, 2026 clock. The demo has no production fallback. Stop the server before reinstalling dependencies on Windows to avoid locking esbuild.exe.

For DynamoDB Local, copy `.env.example` to `.env`, then:

```sh
docker compose up -d
npm run db:init
npm run dev
```

`db:init` can create/seed only `stats-local-*` tables at an explicit loopback endpoint. Use a fresh local v2 table when upgrading from the old fixtures. To test real Google sign-in locally, configure the Stats OAuth client and set `LOCAL_GOOGLE_SUB` and `LOCAL_GOOGLE_EMAIL` to the test account's verified Google subject and email before running `db:init`. This seeds Alex's synthetic account and attendance under that subject. Set `LOCAL_STATS_STAFF=true` to make the synthetic user a Mentor instead of a Student.

An alternate official DynamoDB Local JAR can be run with a supported JDK: `java -Djava.library.path=./DynamoDBLocal_lib -jar DynamoDBLocal.jar -inMemory -sharedDb -port 8000`. On PowerShell quote the entire `-Djava.library.path=...` argument. The database integration test requires DYNAMODB_ENDPOINT; it creates a unique disposable `stats-local-integration-*` table and removes that table after testing. With no endpoint the test reports skipped, never a cloud pass.

Cloud-backed development is not part of the single production deployment. Use DynamoDB Local for local and CI integration tests; do not point local development at the production Puncher table.

## GOOGLE CONFIGURATION

Create a dedicated Google OAuth Web client for Stats. Add `https://stats.7028robotics.com/api/auth/callback` and `http://127.0.0.1:4300/api/auth/callback` as authorized redirect URIs. Set its client ID in `cdk/lib/config.ts` and store its client secret in SSM Parameter Store as a SecureString named `/stats/google-client-secret`; the OAuth Lambda reads this value at runtime. Local OAuth uses `GOOGLE_CLIENT_SECRET` in `.env`. The allowed domain is `stmarobotics.org`.

The browser stores only an opaque HttpOnly session cookie. Google tokens remain server-side during callback verification. Sessions expire after seven days and are revoked on sign-out. Verified team Google accounts can view the leaderboard. Puncher creates a Student account at first sign-in. Active Puncher students get My Hours, and active mentors and admins get Staff Reports. Stats checks the current account status and role per request.

## AWS CONFIGURATION

The single AWS deployment configuration is checked into `cdk/lib/config.ts`. The source table is `puncher-data` in us-east-2 and must report schema version 2. Stats imports it read-only. Application stacks run in us-east-2 and the CloudFront certificate stack runs in us-east-1.

## BOOTSTRAP AND GITHUB OIDC

Use the team's administrator/SSO credentials for one-time setup. Stats uses the team's shared CDK bootstrap stacks in both regions with the standard `hnb659fds` qualifier. Do not create, rename, or tag a Stats-specific bootstrap stack. The shared CloudFormation execution policy is centrally managed and must permit the Stats deployment resources; review `cdk/execution-policy.example.json` as an example of Stats-specific permissions, not as a policy to attach to the shared role without reviewing its impact on other applications. Do not attach AdministratorAccess or reuse FMEA deployment roles.

The account-level GitHub OIDC provider must exist for `token.actions.githubusercontent.com` with audience `sts.amazonaws.com`. Deploy the role stack with owner credentials:

```sh
npm exec --workspace=cdk -- cdk deploy --app "npx tsx bin/deployment-role.ts" stats-deployment
```

Its trust condition requires `repo:STMARobotics/Stats:ref:refs/heads/main`; its identity policy can assume only the shared standard bootstrap roles in us-east-1 and us-east-2. The workflow uses GitHub OIDC and the deployment role ARN checked into `.github/workflows/ci.yml`; no GitHub environment, variables, secrets, or stored AWS credentials are needed. Validation runs on branches and pull requests; a push to `main` deploys automatically only after validation succeeds.

## CERTIFICATE AND APPLICATION DEPLOYMENT

```sh
npm run check
npm run cdk:synth
npm run cdk:deploy -- --require-approval never
```

Certificate, backend, and frontend deploy as separate stacks; CDK cross-region references connect the us-east-1 certificate to the us-east-2 CloudFront distribution. The frontend publishes built assets and public `/config.json` to private S3 behind CloudFront OAC. API response caching is disabled; authorization is forwarded; frontend SPA rewriting cannot rewrite API errors.

## ACCEPTANCE AND MONITORING

Follow the development-table checklist in stats-integration.md before production rollout. Verify real Google login, identity revocation, student isolation, staff exports, known totals/ranks, certificate/DNS and direct API Gateway auth. Run authenticated GET /api/health to confirm supported metadata. This delivery tests synthetic/local integration; no production deployment or live Google-origin acceptance is claimed.

Reader/authorizer logs and API access logs have separate Stats names and one-month retention. Alerts cover Lambda errors and explicit source/configuration/schema/data-quality failures through an SNS topic. Subscribe the operations team to the `AlertTopicArn` stack output and test delivery. Logs exclude tokens, source rows and student PII. Health/source failures return 503, never substituted demo results. Some bounded data operations can exceed limits as history grows; QUERY_LIMIT means staff must review capacity/pagination rather than accepting partial totals.

On incident: check Stats logs/alarms and authenticated health; confirm source schema/table config and read permissions; coordinate source repairs or mappings through Puncher. Redeploy a previous tested Git commit for frontend/backend rollback. Certificate remains separate. There is no database rollback/reset operation in Stats.

## COST ALLOCATION AND RETENTION

Every supported Stats-created application resource is tagged **AppName=Stats** and Environment; CDK assertions check both regions. Puncher's canonical table remains owned/tagged by Puncher. Its DynamoDB costs, including Stats reads, stay allocated to Puncher. Tags cannot divide a shared table's bill by caller. The team's existing hosted zone, OIDC provider, shared bootstrap assets, account support and other account-level shared costs remain with their existing infrastructure owner.

After first deployment, an authorized billing administrator must open Billing and Cost Management → Cost allocation tags → User-defined tags, select **AppName** and activate it. Creating CDK tags does not activate billing allocation. Allow the key to appear and activation to complete, then group/filter Cost Explorer by AppName with separate Stats, Puncher and FMEA values. See [AWS activation instructions](https://docs.aws.amazon.com/awsaccountbilling/latest/aboutv2/activating-tags.html).

Frontend bucket and application logs use RETAIN for safer teardown; remove retained Stats-only artifacts through the team's normal retention process when decommissioning. Remove the Stats DNS alias and distribution before certificate deletion. Never delete or retag the source table as part of Stats cleanup.
