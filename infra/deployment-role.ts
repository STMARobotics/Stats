import { App, DefaultStackSynthesizer } from "aws-cdk-lib";
import { DeploymentRoleStack } from "./stacks";
import { applyStatsTags } from "./tags";
const app = new App(),
  environment = process.env.STATS_ENV,
  repository = process.env.STATS_GITHUB_REPOSITORY,
  account = process.env.STATS_ACCOUNT,
  providerArn = process.env.GITHUB_OIDC_PROVIDER_ARN;
if (!environment || !repository || !account || !providerArn)
  throw new Error(
    "Set STATS_ENV, STATS_ACCOUNT, STATS_GITHUB_REPOSITORY and GITHUB_OIDC_PROVIDER_ARN.",
  );
applyStatsTags(app, environment);
new DeploymentRoleStack(app, `stats-${environment}-deployment`, {
  environment,
  repository,
  providerArn,
  env: { account, region: "us-east-2" },
  synthesizer: new DefaultStackSynthesizer({ qualifier: "stats7028" }),
});
