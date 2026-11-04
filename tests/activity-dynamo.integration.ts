import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { CreateTableCommand, DeleteTableCommand, DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import { DynamoProjectionStore, projectActivity } from '../service/activity-projection';
import { digest, makeActivity, type Activity } from '../service/activity-contract';
const endpoint = process.env.DYNAMODB_ENDPOINT;
test(
  'DynamoDB Local: projection transactions survive duplicate delivery, races and corrections',
  { skip: !endpoint },
  async () => {
    assert.match(endpoint!, /^http:\/\/(localhost|127\.0\.0\.1):\d+$/);
    const client = new DynamoDBClient({
      endpoint,
      region: 'us-east-2',
      credentials: { accessKeyId: 'local', secretAccessKey: 'local' },
    });
    const table = 'stats-activity-integration-' + Date.now();
    await client.send(
      new CreateTableCommand({
        TableName: table,
        BillingMode: 'PAY_PER_REQUEST',
        KeySchema: [
          { AttributeName: 'pk', KeyType: 'HASH' },
          { AttributeName: 'sk', KeyType: 'RANGE' },
        ],
        AttributeDefinitions: [
          { AttributeName: 'pk', AttributeType: 'S' },
          { AttributeName: 'sk', AttributeType: 'S' },
        ],
      }),
    );
    try {
      const store = new DynamoProjectionStore(table, DynamoDBDocumentClient.from(client));
      const first: Activity = JSON.parse(
        readFileSync('contracts/fixtures/activity-v1.json', 'utf8'),
      )[0];
      await Promise.all(Array.from({ length: 4 }, () => projectActivity(store, first, 'local-v1')));
      const key = 'SUBJECT#' + digest([first.subject.namespace, first.subject.id]);
      const total = () => store.get('GEN#local-v1#ORG#example-team#TOTAL#career', key);
      assert.equal((await total())?.metrics?.shopSeconds, 3600);
      await Promise.all(
        [1, 2, 3].map((n) =>
          projectActivity(store, makeActivity({ ...first, entityId: 'visit:' + n }), 'local-v1'),
        ),
      );
      assert.equal((await total())?.metrics?.shopSeconds, 14400);
      const correction = makeActivity({
        ...first,
        entityVersion: 3,
        metrics: { ...first.metrics, shopSeconds: 0 },
      });
      await projectActivity(store, correction, 'local-v1');
      assert.equal(await projectActivity(store, first, 'local-v1'), 'stale');
      assert.equal((await total())?.metrics?.shopSeconds, 10800);
    } finally {
      await client.send(new DeleteTableCommand({ TableName: table }));
      client.destroy();
    }
  },
);
