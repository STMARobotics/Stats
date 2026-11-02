import { App, Tags } from "aws-cdk-lib";
import { CustomResourceConfig } from "aws-cdk-lib/custom-resources";
import { RetentionDays } from "aws-cdk-lib/aws-logs";
export function applyStatsTags(app: App, environment: string) {
  Tags.of(app).add("AppName", "Stats");
  Tags.of(app).add("Environment", environment);
  CustomResourceConfig.of(app).addLogRetentionLifetime(RetentionDays.ONE_MONTH);
}
