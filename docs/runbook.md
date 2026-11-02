# SETUP, DEPLOYMENT AND OPERATIONS

## LOCAL MODES

Use Node 24. `npm ci` installs the committed lockfile. `npm run demo` runs only synthetic records/auth on loopback UI 4300/API 3100 and a fixed November 2, 2026 clock. The demo has no production fallback. Stop the server before reinstalling dependencies on Windows to avoid locking esbuild.exe.

For DynamoDB Local, copy `.env.example` to `.env`, then:

```sh
docker compose up -d
npm run db:init
npm run dev
```

`db:init` can create/seed only `stats-local-*` tables at an explicit loopback endpoint. It refuses production/Lambda/cloud locations. To test real Google sign-in locally, configure the Stats OAuth client and set LOCAL_GOOGLE_SUB and LOCAL_GOOGLE_EMAIL to an approved test account's exact verified Google subject/email before running db:init. This creates a mapping only in the disposable local table; LOCAL_STATS_STAFF=true also enables synthetic local staff reporting. These variables never provision production roles. Operational mappings must be provisioned in Puncher.

An alternate official DynamoDB Local JAR can be run with a supported JDK: `java -Djava.library.path=./DynamoDBLocal_lib -jar DynamoDBLocal.jar -inMemory -sharedDb -port 8000`. On PowerShell quote the entire `-Djava.library.path=...` argument. The database integration test requires DYNAMODB_ENDPOINT; it creates a unique disposable `stats-local-integration-*` table and removes that table after testing. With no endpoint the test reports skipped, never a cloud pass.

Cloud-backed local development must explicitly set DATA_MODE=cloud, STATS_ENV=development, CLOUD_DEV_CONFIRMED=true, TABLE_NAME and SOURCE_REGION for a Puncher **development** table, and GOOGLE_CLIENT_ID. Omit DYNAMODB_ENDPOINT and use read-only AWS SSO/profile credentials. Stats does not seed or change that table.

## GOOGLE CONFIGURATION

Create a separate Stats Google OAuth Web client. Authorized JavaScript origins must include `http://127.0.0.1:4300` (and `http://localhost:4300` if used) and the exact configured HTTPS Stats domain. Use Google Identity Services popup/callback sign-in; no redirect URI or client secret is required. Set GOOGLE_CLIENT_ID to this client's public ID; the same audience is published in /config.json. ALLOWED_DOMAIN is fixed in code to stmarobotics.org. Verify the Google console's allowed origins and app consent settings for the team's Workspace.

Tokens stay in browser memory. Every sign-in and API request is server verified. Puncher tokens with another audience are rejected. Puncher admins provision exact Google subject/member links and explicit stats:student/stats:staff permissions; mentor/admin alone is insufficient. Deactivation is checked authoritatively per request. Do not enable dev-auth in production.

## AWS CONFIGURATION

Set explicit environment variables (PowerShell example; replace placeholders):

```powershell
$env:STATS_ENV='development' # staging or production when ready
$env:STATS_ACCOUNT='<12-digit-account>'
$env:TABLE_NAME='<Puncher-TableName-output>'
$env:PUNCHER_TABLE_ARN='<Puncher-TableArn-output>'
$env:SOURCE_REGION='<Puncher-TableRegion-output>'
$env:HOSTED_ZONE_ID='<approved-hosted-zone-id>'
$env:HOSTED_ZONE_NAME='7028robotics.com'
$env:STATS_DOMAIN='stats-dev.7028robotics.com'
$env:GOOGLE_CLIENT_ID='<Stats-client>.apps.googleusercontent.com'
$env:ALERT_EMAIL='<operations-email>'
$env:PUNCHER_URL='https://<configured-Puncher-domain>'
```

The proposed production domain is stats.7028robotics.com, not a claim that DNS is already configured. Use separate development/staging domains and Google origins. Application stacks run in us-east-2; the certificate stack runs in us-east-1. The source region is explicit and can differ. Same-account sources are supported. Configuration rejects missing/mismatched table ARN/name/account/region. No source table is created, tagged, imported into management or replaced.

## BOOTSTRAP AND GITHUB OIDC

Use the team's administrator/SSO credentials for one-time setup. Create a customer-managed CloudFormation execution policy from `infra/execution-policy.example.json` after substituting account, hosted zone and Stats domain. It denies all DynamoDB operations to the deployment execution role, scopes IAM roles to stats-*, and scopes DNS to the Stats name. Its service-level permissions are an example, not a claim of minimum account-wide privilege: the AWS owner should tighten them for the account and configured environment before use. Do not attach AdministratorAccess or reuse FMEA deployment roles.

Bootstrap both regions with the dedicated `stats7028` qualifier and tag them:

```sh
npx cdk bootstrap aws://ACCOUNT/us-east-1 aws://ACCOUNT/us-east-2 --qualifier stats7028 --toolkit-stack-name StatsToolkit --tags AppName=Stats --tags Environment=shared --cloudformation-execution-policies arn:aws:iam::ACCOUNT:policy/StatsCdkExecution
```

The dedicated bootstrap asset buckets/roles serve Stats environments; Environment=shared denotes shared Stats infrastructure, AppName remains Stats. The team's existing account-level GitHub OIDC provider may be referenced without managing it. If none exists, the AWS owner must create it for token.actions.githubusercontent.com with audience sts.amazonaws.com. Supply GITHUB_OIDC_PROVIDER_ARN, STATS_GITHUB_REPOSITORY=owner/repository, STATS_ACCOUNT and STATS_ENV, then deploy the role stack with owner credentials:

```sh
npx cdk deploy --app "npx tsx infra/deployment-role.ts" --all
```

Its trust condition requires the exact GitHub repository and `environment:stats-ENV`; its identity policy can assume only this account's dedicated stats7028 bootstrap roles in the two specified regions. Create protected GitHub environments stats-development/stats-staging/stats-production, restricting deployments to main. Save STATS_DEPLOY_ROLE_ARN from the role stack output. The workflow uses GitHub OIDC, never AWS access keys. Build/test/synthesis CI runs without cloud credentials; deployment is explicitly dispatched from main.

## CERTIFICATE AND APPLICATION DEPLOYMENT

Deploy the dedicated Stats certificate first:

```sh
npm run build
npx cdk deploy --app "npx tsx infra/app.ts" -c certificateOnly=true --all
```

After DNS validation, set STATS_CERTIFICATE_ARN to that stack's CertificateArn output. Frontend imports this explicit us-east-1 ARN, while the certificate remains managed by the Stats certificate stack. This avoids cross-region helper Lambdas/SSM export records, making resource ownership/tags and teardown explicit. Never substitute FMEA's certificate.

```sh
npm run check
npm run cdk:synth
npx cdk diff --all
npm run cdk:deploy
```

Set the workflow environment variables listed in `.github/workflows/deploy.yml`, including STATS_CERTIFICATE_ARN, using each GitHub environment's variables. Then dispatch Deploy Stats for that environment. The frontend publishes built assets and public /config.json to private S3 behind CloudFront OAC. API response caching is disabled; authorization is forwarded; frontend SPA rewriting cannot rewrite API errors.

## ACCEPTANCE AND MONITORING

Follow the development-table checklist in stats-integration.md before production rollout. Verify real Google login, identity revocation, student isolation, staff exports, known totals/ranks, certificate/DNS and direct API Gateway auth. Run authenticated GET /api/health to confirm supported metadata. This delivery tests synthetic/local integration; no production deployment or live Google-origin acceptance is claimed.

Reader/authorizer logs and API access logs have separate Stats names and one-month retention. Alerts cover Lambda errors and explicit source/configuration/schema/data-quality failures through an SNS topic. Set ALERT_EMAIL, confirm the SNS subscription, and test a controlled development alert. Logs exclude tokens, source rows and student PII. Health/source failures return 503, never substituted demo results. Some bounded data operations can exceed limits as history grows; QUERY_LIMIT means staff must review capacity/pagination rather than accepting partial totals.

On incident: check Stats logs/alarms and authenticated health; confirm source schema/table config and read permissions; coordinate source repairs or mappings through Puncher. Redeploy a previous tested Git commit for frontend/backend rollback. Certificate remains separate. There is no database rollback/reset operation in Stats.

## COST ALLOCATION AND RETENTION

Every supported Stats-created application resource is tagged **AppName=Stats** and Environment; CDK assertions check both regions. Puncher's canonical table remains owned/tagged by Puncher. Its DynamoDB costs, including Stats reads, stay allocated to Puncher. Tags cannot divide a shared table's bill by caller. The team's existing hosted zone, OIDC provider, account support and other account-level shared costs remain with their existing infrastructure owner. Stats' dedicated bootstrap assets are shared among Stats environments.

After first deployment, an authorized billing administrator must open Billing and Cost Management → Cost allocation tags → User-defined tags, select **AppName** and activate it. Creating CDK tags does not activate billing allocation. Allow the key to appear and activation to complete, then group/filter Cost Explorer by AppName with separate Stats, Puncher and FMEA values. See [AWS activation instructions](https://docs.aws.amazon.com/awsaccountbilling/latest/aboutv2/activating-tags.html).

Frontend bucket and application logs use RETAIN for safer teardown; remove retained Stats-only artifacts through the team's normal retention process when decommissioning. Remove the Stats DNS alias and distribution before certificate deletion. Never delete or retag the source table as part of Stats cleanup.
