import {
  Stack,
  Duration,
  RemovalPolicy,
  CfnOutput,
  aws_dynamodb as ddb,
  aws_events as events,
  aws_events_targets as targets,
  aws_sqs as sqs,
  aws_lambda as lambda,
  aws_lambda_nodejs as nodejs,
  aws_lambda_event_sources as sources,
  aws_cloudwatch as cw,
  aws_logs as logs,
  aws_iam as iam,
} from 'aws-cdk-lib';
import type { StackProps } from 'aws-cdk-lib';
import { Construct } from 'constructs';
import { resolve } from 'node:path';
export class ActivityStack extends Stack {
  constructor(
    scope: Construct,
    id: string,
    props: StackProps & {
      busArn: string;
      orgId: string;
      generation: string;
      consumerEnabled?: boolean;
    },
  ) {
    super(scope, id, props);
    const match = /^arn:aws:events:([^:]+):(\d{12}):event-bus\/([A-Za-z0-9_.-]+)$/.exec(
      props.busArn,
    );
    if (
      !match ||
      match[1] !== this.region ||
      match[2] !== this.account ||
      !/^[a-z0-9][a-z0-9-]{0,63}$/.test(props.orgId) ||
      !/^[a-zA-Z0-9-]{1,64}$/.test(props.generation)
    )
      throw new Error('Explicit local bus, organization and projection generation required.');
    const bus = events.EventBus.fromEventBusArn(this, 'ActivityBus', props.busArn);
    const table = new ddb.Table(this, 'Progress', {
      partitionKey: { name: 'pk', type: ddb.AttributeType.STRING },
      sortKey: { name: 'sk', type: ddb.AttributeType.STRING },
      billingMode: ddb.BillingMode.PAY_PER_REQUEST,
      pointInTimeRecoverySpecification: { pointInTimeRecoveryEnabled: true },
      deletionProtection: true,
      removalPolicy: RemovalPolicy.RETAIN,
    });
    const queueProps = {
      enforceSSL: true,
      encryption: sqs.QueueEncryption.SQS_MANAGED,
      retentionPeriod: Duration.days(14),
    };
    const processingDead = new sqs.Queue(this, 'ProcessingFailures', queueProps);
    const deliveryDead = new sqs.Queue(this, 'DeliveryFailures', queueProps);
    const queue = new sqs.Queue(this, 'ActivityQueue', {
      ...queueProps,
      visibilityTimeout: Duration.seconds(180),
      deadLetterQueue: { queue: processingDead, maxReceiveCount: 5 },
    });
    const worker = new nodejs.NodejsFunction(this, 'Projector', {
      entry: resolve('service/activity-projection.ts'),
      handler: 'handler',
      runtime: lambda.Runtime.NODEJS_24_X,
      architecture: lambda.Architecture.ARM_64,
      memorySize: 256,
      timeout: Duration.seconds(25),
      reservedConcurrentExecutions: 2,
      logGroup: new logs.LogGroup(this, 'ProjectorLogs', {
        retention: logs.RetentionDays.ONE_MONTH,
        removalPolicy: RemovalPolicy.RETAIN,
      }),
      bundling: { minify: true, sourceMap: true, externalModules: [] },
      environment: {
        ACTIVITY_TABLE_NAME: table.tableName,
        INTEGRATION_ORG_ID: props.orgId,
        INTEGRATION_ACCOUNT: this.account,
        ACTIVITY_PROJECTION_GENERATION: props.generation,
      },
    });
    worker.addToRolePolicy(
      new iam.PolicyStatement({
        actions: ['dynamodb:GetItem', 'dynamodb:PutItem'],
        resources: [table.tableArn],
      }),
    );
    worker.addEventSource(
      new sources.SqsEventSource(queue, {
        batchSize: 10,
        maxBatchingWindow: Duration.seconds(1),
        reportBatchItemFailures: true,
        maxConcurrency: 2,
        enabled: props.consumerEnabled === true,
      }),
    );
    const rule = new events.Rule(this, 'ActivitySubscription', {
      eventBus: bus,
      enabled: props.consumerEnabled === true,
      eventPattern: {
        account: [this.account],
        region: [this.region],
        source: ['org.apps.puncher', 'org.apps.packs', 'org.apps.fmea'],
        detailType: [
          'puncher.credit.changed.v1',
          'packs.pack.opened.v1',
          'packs.battle.finalized.v1',
          'fmea.submission.changed.v1',
        ],
        detail: { orgId: [props.orgId] },
      },
    });
    rule.addTarget(
      new targets.SqsQueue(queue, {
        deadLetterQueue: deliveryDead,
        retryAttempts: 185,
        maxEventAge: Duration.hours(24),
      }),
    );
    for (const [name, dead] of [
      ['Processing', processingDead],
      ['Delivery', deliveryDead],
    ] as const)
      new cw.Alarm(this, name + 'DeadLetters', {
        metric: dead.metricApproximateNumberOfMessagesVisible(),
        threshold: 1,
        evaluationPeriods: 1,
        treatMissingData: cw.TreatMissingData.NOT_BREACHING,
      });
    new cw.Alarm(this, 'ActivityLag', {
      metric: queue.metricApproximateAgeOfOldestMessage(),
      threshold: 300,
      evaluationPeriods: 1,
      treatMissingData: cw.TreatMissingData.NOT_BREACHING,
    });
    new CfnOutput(this, 'ActivityTableName', { value: table.tableName });
    new CfnOutput(this, 'ActivityQueueArn', { value: queue.queueArn });
  }
}
