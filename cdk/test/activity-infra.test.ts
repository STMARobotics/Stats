import { App } from 'aws-cdk-lib';
import { Template } from 'aws-cdk-lib/assertions';
import { expect, it } from 'vitest';
import { resolve } from 'node:path';
import { ActivityStack } from '../lib/activity-stack';
it('isolates shadow data permissions, filters tenants, and disables capture by default', () => {
  const app = new App({ outdir: resolve('work/activity-cdk') });
  const stack = new ActivityStack(app, 'stats-activity', {
    env: { account: '111111111111', region: 'us-east-2' },
    orgId: 'example-team',
    busArn: 'arn:aws:events:us-east-2:111111111111:event-bus/activity',
    generation: 'shadow-v1',
  });
  const t = Template.fromStack(stack);
  t.resourceCountIs('AWS::DynamoDB::Table', 1);
  t.resourceCountIs('AWS::SQS::Queue', 3);
  t.hasResourceProperties('AWS::Lambda::EventSourceMapping', {
    Enabled: false,
    FunctionResponseTypes: ['ReportBatchItemFailures'],
  });
  t.hasResourceProperties('AWS::Events::Rule', {
    State: 'DISABLED',
    EventPattern: { account: ['111111111111'], detail: { orgId: ['example-team'] } },
  });
  const policies = Object.values(t.findResources('AWS::IAM::Policy')) as any[];
  const dynamo = policies
    .flatMap((p) => p.Properties.PolicyDocument.Statement)
    .filter((s) => JSON.stringify(s.Action).includes('dynamodb:'));
  expect(dynamo).toHaveLength(1);
  expect(dynamo[0].Action).toEqual(['dynamodb:GetItem', 'dynamodb:PutItem']);
  expect(JSON.stringify(dynamo)).not.toMatch(/puncher|Scan|Query/);
});
