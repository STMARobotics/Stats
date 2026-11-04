// Separate opt-in entry point. The existing Stats reader/deployment is unchanged.
import { App, Tags } from 'aws-cdk-lib';
import { ActivityStack } from '../lib/activity-stack';
const app = new App();
const validation = ['true', true].includes(app.node.tryGetContext('validation'));
const account = validation ? '111111111111' : process.env.INTEGRATION_ACCOUNT;
const orgId = validation ? 'example-team' : process.env.INTEGRATION_ORG_ID;
const busArn = validation
  ? 'arn:aws:events:us-east-2:111111111111:event-bus/example-team-validation-activity'
  : process.env.INTEGRATION_BUS_ARN;
const environment = validation ? 'validation' : process.env.INTEGRATION_ENV;
const generation = process.env.ACTIVITY_PROJECTION_GENERATION ?? 'shadow-v1';
if (
  !account ||
  !orgId ||
  !busArn ||
  !environment ||
  !['dev', 'prod', 'validation'].includes(environment)
)
  throw new Error('Explicit activity infrastructure configuration is required.');
Tags.of(app).add('AppName', 'Stats');
Tags.of(app).add('Environment', environment);
new ActivityStack(app, 'stats-' + environment + '-activity', {
  orgId,
  busArn,
  generation,
  consumerEnabled:
    app.node.tryGetContext('activityConsumerEnabled') === true ||
    app.node.tryGetContext('activityConsumerEnabled') === 'true',
  env: { account, region: 'us-east-2' },
});
