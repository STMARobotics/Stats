import { test } from "node:test";
import assert from "node:assert/strict";
import {
  CreateTableCommand,
  DeleteTableCommand,
  DynamoDBClient,
} from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, PutCommand } from "@aws-sdk/lib-dynamodb";
import { DynamoRepository } from "../service/repository";
import { createApi } from "../service/api";
import { demoRecords, demoNow } from "../service/fixtures";
const endpoint = process.env.DYNAMODB_ENDPOINT;
test(
  "DynamoDB Local: real pagination, v2 source queries, account revocation, reader DTOs",
  { skip: !endpoint },
  async () => {
    assert.match(endpoint!, /^http:\/\/(localhost|127\.0\.0\.1):\d+$/);
    const table = `stats-local-integration-${Date.now()}`;
    const client = new DynamoDBClient({
        endpoint,
        region: "us-east-2",
        credentials: { accessKeyId: "local", secretAccessKey: "local" },
      }),
      doc = DynamoDBDocumentClient.from(client);
    await client.send(
      new CreateTableCommand({
        TableName: table,
        BillingMode: "PAY_PER_REQUEST",
        KeySchema: [
          { AttributeName: "pk", KeyType: "HASH" },
          { AttributeName: "sk", KeyType: "RANGE" },
        ],
        AttributeDefinitions: ["pk", "sk", "gsi1pk", "gsi1sk"].map(
          (AttributeName) => ({ AttributeName, AttributeType: "S" }),
        ),
        GlobalSecondaryIndexes: [
          {
            IndexName: "GSI1",
            KeySchema: [
              { AttributeName: "gsi1pk", KeyType: "HASH" },
              { AttributeName: "gsi1sk", KeyType: "RANGE" },
            ],
            Projection: { ProjectionType: "ALL" },
          },
        ],
      }),
    );
    try {
      for (const Item of demoRecords())
        await doc.send(new PutCommand({ TableName: table, Item }));
      const repo = new DynamoRepository(doc, table),
        api = createApi(repo, () => demoNow);
      const principal = { sub: "demo-alex", email: "alex@stmarobotics.org" };
      const r = await api({
        method: "GET",
        path: "/api/hours",
        query: { year: "2027" },
        principal,
      });
      assert.equal(r.statusCode, 200);
      assert.equal(JSON.parse(r.body).selected.shopSeconds, 86400);
      // Force a real >100-item history query across pages using non-credit internal fields on canonical approved records.
      for (let i = 0; i < 115; i++)
        await doc.send(
          new PutCommand({
            TableName: table,
            Item: {
              schemaVersion: 2,
              pk: "ATTENDANCE#demo-alex",
              sk: `LEGACYSHOP#2026-07-01#page-${String(i).padStart(3, "0")}`,
              memberId: "demo-alex",
              shopDate: "2026-07-01",
              reportingYear: 2027,
              status: "approved",
              creditedSeconds: 1,
              provenance: { synthetic: true },
            },
          }),
        );
      assert.ok((await repo.history("demo-alex")).length > 100);
      const updated = await api({
        method: "GET",
        path: "/api/hours",
        query: {},
        principal,
      });
      assert.equal(JSON.parse(updated.body).selected.shopSeconds, 86515);
      const user = await repo.get("USER#demo-alex", "METADATA");
      await doc.send(
        new PutCommand({
          TableName: table,
          Item: { ...user, active: false },
        }),
      );
      assert.equal(
        (await api({ method: "GET", path: "/api/hours", query: {}, principal }))
          .statusCode,
        403,
      );
    } finally {
      await client.send(new DeleteTableCommand({ TableName: table }));
      client.destroy();
    }
  },
);
