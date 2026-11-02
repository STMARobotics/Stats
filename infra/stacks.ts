import {
  ArnFormat,
  CfnOutput,
  Duration,
  RemovalPolicy,
  Stack,
  Tags,
  type StackProps,
} from "aws-cdk-lib";
import { Construct } from "constructs";
import * as acm from "aws-cdk-lib/aws-certificatemanager";
import * as route53 from "aws-cdk-lib/aws-route53";
import * as targets from "aws-cdk-lib/aws-route53-targets";
import * as apigw from "aws-cdk-lib/aws-apigatewayv2";
import * as auth from "aws-cdk-lib/aws-apigatewayv2-authorizers";
import * as integrations from "aws-cdk-lib/aws-apigatewayv2-integrations";
import * as lambda from "aws-cdk-lib/aws-lambda";
import * as nodejs from "aws-cdk-lib/aws-lambda-nodejs";
import * as dynamo from "aws-cdk-lib/aws-dynamodb";
import * as iam from "aws-cdk-lib/aws-iam";
import * as logs from "aws-cdk-lib/aws-logs";
import * as cw from "aws-cdk-lib/aws-cloudwatch";
import * as actions from "aws-cdk-lib/aws-cloudwatch-actions";
import * as sns from "aws-cdk-lib/aws-sns";
import * as subs from "aws-cdk-lib/aws-sns-subscriptions";
import * as s3 from "aws-cdk-lib/aws-s3";
import * as deploy from "aws-cdk-lib/aws-s3-deployment";
import * as cf from "aws-cdk-lib/aws-cloudfront";
import * as origins from "aws-cdk-lib/aws-cloudfront-origins";
import { resolve } from "node:path";
import type { Config } from "./config";

type Props = StackProps & { config: Config };
const zone = (scope: Construct, c: Config) =>
  route53.HostedZone.fromHostedZoneAttributes(scope, "Zone", {
    hostedZoneId: c.zoneId,
    zoneName: c.zoneName,
  });
export const spaCode = `function handler(event) { var r = event.request; if (r.uri === '/' || r.uri === '/hours' || r.uri === '/leaderboard' || r.uri === '/reports') r.uri = '/index.html'; return r; }`;
export class CertificateStack extends Stack {
  readonly certificate: acm.ICertificate;
  constructor(scope: Construct, id: string, props: Props) {
    super(scope, id, props);
    this.certificate = new acm.Certificate(this, "Certificate", {
      domainName: props.config.domain,
      validation: acm.CertificateValidation.fromDns(zone(this, props.config)),
    });
    new CfnOutput(this, "CertificateArn", {
      value: this.certificate.certificateArn,
    });
  }
}
export class BackendStack extends Stack {
  readonly api: apigw.HttpApi;
  constructor(scope: Construct, id: string, props: Props) {
    super(scope, id, props);
    const c = props.config,
      prefix = `stats-${c.environment}`;
    // Import only. Never create, retag or manage Puncher's table.
    const table = dynamo.Table.fromTableAttributes(this, "PuncherSource", {
      tableArn: c.tableArn,
      globalIndexes: ["GSI1"],
    });
    const fn = (name: string, entry: string, data: boolean) => {
      const group = new logs.LogGroup(this, `${name}Logs`, {
        logGroupName: `/aws/lambda/${prefix}-${name}`,
        retention: logs.RetentionDays.ONE_MONTH,
        removalPolicy: RemovalPolicy.RETAIN,
      });
      const f = new nodejs.NodejsFunction(this, name, {
        functionName: `${prefix}-${name}`,
        entry: resolve(entry),
        handler: "handler",
        runtime: lambda.Runtime.NODEJS_24_X,
        architecture: lambda.Architecture.ARM_64,
        memorySize: 512,
        timeout: Duration.seconds(29),
        logGroup: group,
        bundling: { minify: true, sourceMap: true, externalModules: [] },
        environment: {
          STATS_ENV: c.environment,
          DATA_MODE: "cloud",
          GOOGLE_CLIENT_ID: c.googleClientId,
          ...(data
            ? { TABLE_NAME: table.tableName, SOURCE_REGION: c.sourceRegion }
            : {}),
        },
      });
      if (data)
        f.addToRolePolicy(
          new iam.PolicyStatement({
            actions: ["dynamodb:GetItem", "dynamodb:Query"],
            resources: [c.tableArn, `${c.tableArn}/index/GSI1`],
          }),
        );
      return f;
    };
    const apiFn = fn("reader", "service/handler.ts", true),
      authorizerFn = fn("google-authorizer", "service/authorizer.ts", false);
    const authorizer = new auth.HttpLambdaAuthorizer("Google", authorizerFn, {
      identitySource: ["$request.header.Authorization"],
      resultsCacheTtl: Duration.seconds(0),
      responseTypes: [auth.HttpLambdaResponseType.SIMPLE],
    });
    this.api = new apigw.HttpApi(this, "Api", {
      apiName: `${prefix}-api`,
      defaultAuthorizer: authorizer,
    });
    const accessLogs = new logs.LogGroup(this, "ApiLogs", {
      logGroupName: `/stats/${c.environment}/api`,
      retention: logs.RetentionDays.ONE_MONTH,
      removalPolicy: RemovalPolicy.RETAIN,
    });
    const stage = this.api.defaultStage!.node.defaultChild as apigw.CfnStage;
    stage.accessLogSettings = {
      destinationArn: accessLogs.logGroupArn,
      format: JSON.stringify({
        requestId: "$context.requestId",
        status: "$context.status",
        routeKey: "$context.routeKey",
        integrationError: "$context.integrationErrorMessage",
      }),
    };
    stage.defaultRouteSettings = {
      throttlingBurstLimit: 50,
      throttlingRateLimit: 25,
    };
    for (const path of [
      "/api/me",
      "/api/health",
      "/api/hours",
      "/api/leaderboard",
      "/api/reports",
    ])
      this.api.addRoutes({
        path,
        methods: [apigw.HttpMethod.GET],
        integration: new integrations.HttpLambdaIntegration(
          path.replaceAll("/", "-"),
          apiFn,
        ),
      });
    const topic = new sns.Topic(this, "Alerts", {
      topicName: `${prefix}-alerts`,
    });
    if (c.alertEmail)
      topic.addSubscription(new subs.EmailSubscription(c.alertEmail));
    for (const f of [apiFn, authorizerFn]) {
      const alarm = new cw.Alarm(this, `${f.node.id}Errors`, {
        alarmName: `${prefix}-${f.node.id}-errors`,
        metric: f.metricErrors({ period: Duration.minutes(5) }),
        threshold: 1,
        evaluationPeriods: 1,
        treatMissingData: cw.TreatMissingData.NOT_BREACHING,
      });
      alarm.addAlarmAction(new actions.SnsAction(topic));
    }
    const sourceFailures = new logs.MetricFilter(this, "SourceFailures", {
      logGroup: apiFn.logGroup,
      filterPattern: logs.FilterPattern.anyTerm(
        "source_unavailable",
        "configuration_or_source_error",
      ),
      metricNamespace: "Stats",
      metricName: `${c.environment}-SourceFailures`,
      metricValue: "1",
    });
    const sourceAlarm = new cw.Alarm(this, "SourceAlarm", {
      alarmName: `${prefix}-source-unavailable`,
      metric: sourceFailures.metric({ period: Duration.minutes(5) }),
      threshold: 1,
      evaluationPeriods: 1,
      treatMissingData: cw.TreatMissingData.NOT_BREACHING,
    });
    sourceAlarm.addAlarmAction(new actions.SnsAction(topic));
    new CfnOutput(this, "ApiEndpoint", { value: this.api.apiEndpoint });
    new CfnOutput(this, "AlertTopicArn", { value: topic.topicArn });
  }
}
export class FrontendStack extends Stack {
  constructor(
    scope: Construct,
    id: string,
    props: Props & { api: apigw.IHttpApi },
  ) {
    super(scope, id, props);
    const c = props.config;
    const bucket = new s3.Bucket(this, "FrontendBucket", {
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      encryption: s3.BucketEncryption.S3_MANAGED,
      enforceSSL: true,
      removalPolicy: RemovalPolicy.RETAIN,
    });
    const spa = new cf.Function(this, "SpaRouting", {
      runtime: cf.FunctionRuntime.JS_2_0,
      code: cf.FunctionCode.fromInline(spaCode),
    });
    const headers = new cf.ResponseHeadersPolicy(this, "SecurityHeaders", {
      securityHeadersBehavior: {
        contentTypeOptions: { override: true },
        frameOptions: {
          frameOption: cf.HeadersFrameOption.DENY,
          override: true,
        },
        referrerPolicy: {
          referrerPolicy:
            cf.HeadersReferrerPolicy.STRICT_ORIGIN_WHEN_CROSS_ORIGIN,
          override: true,
        },
        strictTransportSecurity: {
          accessControlMaxAge: Duration.days(365),
          includeSubdomains: true,
          override: true,
        },
        contentSecurityPolicy: {
          contentSecurityPolicy:
            "default-src 'self'; script-src 'self' https://accounts.google.com/gsi/client; style-src 'self' 'unsafe-inline' https://accounts.google.com/gsi/style; connect-src 'self' https://accounts.google.com; frame-src https://accounts.google.com; img-src 'self' data: https://*.googleusercontent.com; font-src 'self'; base-uri 'self'; object-src 'none'; frame-ancestors 'none'",
          override: true,
        },
      },
    });
    const apiOrigin = new origins.HttpOrigin(
      `${props.api.apiId}.execute-api.us-east-2.amazonaws.com`,
    );
    const frontendOrigin =
      origins.S3BucketOrigin.withOriginAccessControl(bucket);
    const apiBehavior: cf.AddBehaviorOptions = {
      viewerProtocolPolicy: cf.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
      allowedMethods: cf.AllowedMethods.ALLOW_ALL,
      cachePolicy: cf.CachePolicy.CACHING_DISABLED,
      originRequestPolicy: cf.OriginRequestPolicy.ALL_VIEWER_EXCEPT_HOST_HEADER,
      responseHeadersPolicy: headers,
    };
    if (!c.certificateArn)
      throw new Error(
        "Set STATS_CERTIFICATE_ARN from the Stats certificate stack output.",
      );
    const certificate = acm.Certificate.fromCertificateArn(
      this,
      "StatsCertificate",
      c.certificateArn,
    );
    const distribution = new cf.Distribution(this, "Distribution", {
      domainNames: [c.domain],
      certificate,
      defaultRootObject: "index.html",
      minimumProtocolVersion: cf.SecurityPolicyProtocol.TLS_V1_2_2021,
      defaultBehavior: {
        origin: frontendOrigin,
        viewerProtocolPolicy: cf.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
        responseHeadersPolicy: headers,
        functionAssociations: [
          { eventType: cf.FunctionEventType.VIEWER_REQUEST, function: spa },
        ],
      },
      additionalBehaviors: {
        "/api/*": { origin: apiOrigin, ...apiBehavior },
        "/api": { origin: apiOrigin, ...apiBehavior },
        "/config.json": {
          origin: frontendOrigin,
          viewerProtocolPolicy: cf.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
          cachePolicy: cf.CachePolicy.CACHING_DISABLED,
          responseHeadersPolicy: headers,
        },
      },
    });
    new deploy.BucketDeployment(this, "PublishFrontend", {
      sources: [
        deploy.Source.asset(resolve("dist/ui")),
        deploy.Source.jsonData("config.json", {
          googleClientId: c.googleClientId,
          allowedDomain: "stmarobotics.org",
          demo: false,
          ...(c.puncherUrl ? { puncherUrl: c.puncherUrl } : {}),
        }),
      ],
      destinationBucket: bucket,
      distribution,
      distributionPaths: ["/*"],
      cacheControl: [deploy.CacheControl.noCache()],
    });
    new route53.ARecord(this, "Alias", {
      zone: zone(this, c),
      recordName: c.domain,
      target: route53.RecordTarget.fromAlias(
        new targets.CloudFrontTarget(distribution),
      ),
    });
    new CfnOutput(this, "Url", { value: `https://${c.domain}` });
  }
}

export class DeploymentRoleStack extends Stack {
  constructor(
    scope: Construct,
    id: string,
    props: StackProps & {
      environment: string;
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
      roleName: `stats-${props.environment}-github-deploy`,
      assumedBy: new iam.FederatedPrincipal(
        provider.openIdConnectProviderArn,
        {
          StringEquals: {
            "token.actions.githubusercontent.com:aud": "sts.amazonaws.com",
            "token.actions.githubusercontent.com:sub": `repo:${props.repository}:environment:stats-${props.environment}`,
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
                resourceName: `cdk-stats7028-${kind}-role-${this.account}-${region}`,
                arnFormat: ArnFormat.SLASH_RESOURCE_NAME,
              }),
          ),
        ),
      }),
    );
    role.addToPolicy(
      new iam.PolicyStatement({
        actions: ["cloudformation:DescribeStacks"],
        resources: ["us-east-1", "us-east-2"].map((region) =>
          this.formatArn({
            service: "cloudformation",
            region,
            resource: "stack",
            resourceName: `stats-${props.environment}-*/*`,
            arnFormat: ArnFormat.SLASH_RESOURCE_NAME,
          }),
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
            resourceName: "cdk-bootstrap/stats7028/version",
            arnFormat: ArnFormat.SLASH_RESOURCE_NAME,
          }),
        ),
      }),
    );
    new CfnOutput(this, "DeploymentRoleArn", { value: role.roleArn });
  }
}
