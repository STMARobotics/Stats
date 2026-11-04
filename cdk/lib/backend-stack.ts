import { CfnOutput, Duration, RemovalPolicy, Stack } from "aws-cdk-lib";
import { Construct } from "constructs";
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
import { resolve } from "node:path";
import type { Config } from "./config";
import { type Props, projectRoot } from "./stack-common";
export class BackendStack extends Stack {
  readonly api: apigw.HttpApi;
  constructor(scope: Construct, id: string, props: Props) {
    super(scope, id, props);
    const c = props.config,
      prefix = "stats";
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
        entry: resolve(projectRoot, entry),
        handler: "handler",
        runtime: lambda.Runtime.NODEJS_24_X,
        architecture: lambda.Architecture.ARM_64,
        memorySize: 512,
        timeout: Duration.seconds(29),
        logGroup: group,
        bundling: { minify: true, sourceMap: true, externalModules: [] },
        environment: {
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
      logGroupName: "/stats/api",
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
      metricName: "SourceFailures",
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
