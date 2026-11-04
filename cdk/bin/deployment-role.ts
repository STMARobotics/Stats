import { App } from "aws-cdk-lib";
import { config } from "../lib/config";
import { DeploymentRoleStack } from "../lib/deployment-role-stack";
import { applyStatsTags } from "../lib/tags";

const app = new App();
applyStatsTags(app);
new DeploymentRoleStack(app, "stats-deployment", {
  repository: config.repository,
  providerArn: config.providerArn,
  env: { account: config.account, region: "us-east-2" },
});
