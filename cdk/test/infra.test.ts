import { App } from "aws-cdk-lib";
import { Template } from "aws-cdk-lib/assertions";
import { expect, it } from "vitest";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { applyStatsTags } from "../lib/tags";
import { config as deploymentConfig } from "../lib/config";
import { BackendStack } from "../lib/backend-stack";
import { CertificateStack } from "../lib/certificate-stack";
import { DeploymentRoleStack } from "../lib/deployment-role-stack";
import { FrontendStack } from "../lib/frontend-stack";
import { spaCode } from "../lib/stack-common";
const projectRoot = resolve(fileURLToPath(new URL("../..", import.meta.url)));

it("synthesizes isolated tagged infrastructure and read-only exact source IAM", () => {
  const app = new App({ outdir: resolve(projectRoot, "work/test-cdk") }),
    config = deploymentConfig;
  applyStatsTags(app);
  const cert = new CertificateStack(app, "stats-certificate", {
    config,
    env: { account: config.account, region: "us-east-1" },
    crossRegionReferences: true,
  });
  const backend = new BackendStack(app, "stats-backend", {
    config,
    env: { account: config.account, region: "us-east-2" },
    crossRegionReferences: true,
  });
  const front = new FrontendStack(app, "stats-frontend", {
    config,
    api: backend.api,
    certificate: cert.certificate,
    env: { account: config.account, region: "us-east-2" },
    crossRegionReferences: true,
  });
  const role = new DeploymentRoleStack(app, "stats-deployment", {
    repository: config.repository,
    providerArn: config.providerArn,
    env: { account: config.account, region: "us-east-2" },
  });
  const b = Template.fromStack(backend),
    f = Template.fromStack(front);
  b.resourceCountIs("AWS::DynamoDB::Table", 0);
  f.resourceCountIs("AWS::DynamoDB::Table", 0);
  b.hasResourceProperties("AWS::ApiGatewayV2::Authorizer", {
    AuthorizerResultTtlInSeconds: 0,
    EnableSimpleResponses: true,
  });
  for (const r of Object.values(
    b.findResources("AWS::ApiGatewayV2::Route"),
  ) as any[]) {
    expect(r.Properties.AuthorizationType).toBe("CUSTOM");
    expect(r.Properties.RouteKey).toMatch(/^GET \/api\//);
  }
  const statements = (
    Object.values(b.findResources("AWS::IAM::Policy")) as any[]
  )
    .flatMap((r) => r.Properties.PolicyDocument.Statement)
    .filter((s) => JSON.stringify(s.Action).includes("dynamodb:"));
  expect(statements).toHaveLength(1);
  expect(statements[0].Action).toEqual(["dynamodb:GetItem", "dynamodb:Query"]);
  expect(statements[0].Resource).toEqual([
    config.tableArn,
    config.tableArn + "/index/GSI1",
  ]);
  f.hasResourceProperties("AWS::S3::Bucket", {
    PublicAccessBlockConfiguration: {
      BlockPublicAcls: true,
      BlockPublicPolicy: true,
      IgnorePublicAcls: true,
      RestrictPublicBuckets: true,
    },
  });
  f.resourceCountIs("AWS::CloudFront::OriginAccessControl", 1);
  const dist = Object.values(
    f.findResources("AWS::CloudFront::Distribution"),
  )[0] as any;
  const behaviors = dist.Properties.DistributionConfig.CacheBehaviors;
  for (const behavior of behaviors.filter((r: any) =>
    r.PathPattern.startsWith("/api"),
  )) {
    expect(behavior.CachePolicyId).toBe("4135ea2d-6df8-44a3-9df3-4b5a84be39ad");
    expect(behavior.OriginRequestPolicyId).toBe(
      "b689b0a8-53d0-40ab-baf2-68738e2966ac",
    );
    expect(behavior.FunctionAssociations).toBeUndefined();
  }
  expect(
    dist.Properties.DistributionConfig.CustomErrorResponses,
  ).toBeUndefined();
  expect(spaCode).not.toContain("404");
  const taggable = [
    "AWS::Lambda::Function",
    "AWS::IAM::Role",
    "AWS::Logs::LogGroup",
    "AWS::CloudWatch::Alarm",
    "AWS::SNS::Topic",
    "AWS::ApiGatewayV2::Api",
    "AWS::S3::Bucket",
    "AWS::CloudFront::Distribution",
    "AWS::CertificateManager::Certificate",
  ];
  for (const stack of [cert, backend, front, role])
    for (const [logicalId, resource] of Object.entries(
      Template.fromStack(stack).toJSON().Resources,
    ) as [string, any][])
      if (
        taggable.includes(resource.Type) &&
        !logicalId.includes("CustomCrossRegionExport")
      ) {
        const tags = resource.Properties.Tags;
        expect(
          Array.isArray(tags)
            ? tags.find((t: any) => t.Key === "AppName")?.Value
            : tags?.AppName,
          `${stack.stackName}: ${resource.Type} ${JSON.stringify(resource.Properties.FunctionName ?? resource.Properties.AlarmName ?? resource.Properties)}`,
        ).toBe("Stats");
      }
  const roleDoc = JSON.stringify(Template.fromStack(role).toJSON());
  expect(roleDoc).toContain(
    "repo:STMARobotics@32277731/Stats@1443490446:ref:refs/heads/main",
  );
  expect(roleDoc).not.toContain(":environment:");
  expect(roleDoc).not.toContain("stats-production");
  expect(roleDoc).toContain(
    `cdk-hnb659fds-deploy-role-${config.account}-us-east-1`,
  );
  expect(roleDoc).toContain("cdk-bootstrap/hnb659fds/version");
  expect(roleDoc).not.toContain("stats7028");
  for (const stackName of [
    "stats-certificate",
    "stats-backend",
    "stats-frontend",
  ])
    expect(roleDoc).toContain(`${stackName}/*`);
  expect(roleDoc).not.toContain("stats-*/*");
  expect(roleDoc).toContain(config.account);
});
