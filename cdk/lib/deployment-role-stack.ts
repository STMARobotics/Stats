import { ArnFormat, CfnOutput, Stack, type StackProps } from "aws-cdk-lib";
import { Construct } from "constructs";
import * as iam from "aws-cdk-lib/aws-iam";
export class DeploymentRoleStack extends Stack {
  constructor(
    scope: Construct,
    id: string,
    props: StackProps & {
      repository: string;
      providerArn: string;
    },
  ) {
    super(scope, id, props);
    const provider = iam.OpenIdConnectProvider.fromOpenIdConnectProviderArn(
      this,
      "GitHubProvider",
      props.providerArn,
    );
    const role = new iam.Role(this, "DeployRole", {
      roleName: "stats-github-deploy",
      assumedBy: new iam.FederatedPrincipal(
        provider.openIdConnectProviderArn,
        {
          StringEquals: {
            "token.actions.githubusercontent.com:aud": "sts.amazonaws.com",
            "token.actions.githubusercontent.com:sub": `repo:${props.repository}:ref:refs/heads/main`,
          },
        },
        "sts:AssumeRoleWithWebIdentity",
      ),
    });
    // CDK bootstrap roles have independent CloudFormation execution policies; see runbook.
    role.addToPolicy(
      new iam.PolicyStatement({
        actions: ["sts:AssumeRole"],
        resources: ["us-east-1", "us-east-2"].flatMap((region) =>
          ["deploy", "file-publishing", "image-publishing", "lookup"].map(
            (kind) =>
              this.formatArn({
                service: "iam",
                region: "",
                resource: "role",
                resourceName: `cdk-hnb659fds-${kind}-role-${this.account}-${region}`,
                arnFormat: ArnFormat.SLASH_RESOURCE_NAME,
              }),
          ),
        ),
      }),
    );
    role.addToPolicy(
      new iam.PolicyStatement({
        actions: ["cloudformation:DescribeStacks"],
        resources: ["us-east-1", "us-east-2"].flatMap((region) =>
          ["stats-certificate", "stats-backend", "stats-frontend"].map(
            (stackName) =>
              this.formatArn({
                service: "cloudformation",
                region,
                resource: "stack",
                resourceName: `${stackName}/*`,
                arnFormat: ArnFormat.SLASH_RESOURCE_NAME,
              }),
          ),
        ),
      }),
    );
    role.addToPolicy(
      new iam.PolicyStatement({
        actions: ["ssm:GetParameter"],
        resources: ["us-east-1", "us-east-2"].map((region) =>
          this.formatArn({
            service: "ssm",
            region,
            resource: "parameter",
            resourceName: "cdk-bootstrap/hnb659fds/version",
            arnFormat: ArnFormat.SLASH_RESOURCE_NAME,
          }),
        ),
      }),
    );
    new CfnOutput(this, "DeploymentRoleArn", { value: role.roleArn });
  }
}
