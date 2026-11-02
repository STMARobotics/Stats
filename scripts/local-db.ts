// Disposable loopback-only test database. Never accepts a cloud endpoint/table.
import {
  CreateTableCommand,
  DescribeTableCommand,
  DynamoDBClient,
} from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, PutCommand } from "@aws-sdk/lib-dynamodb";
import { demoRecords } from "../service/fixtures";
const endpoint = process.env.DYNAMODB_ENDPOINT,
  table = process.env.TABLE_NAME;
if (
  !/^http:\/\/(localhost|127\.0\.0\.1):\d+$/.test(endpoint ?? "") ||
  !table?.startsWith("stats-local-") ||
  process.env.AWS_LAMBDA_FUNCTION_NAME ||
  process.env.STATS_ENV === "production"
)
  throw new Error(
    "Only loopback endpoint and stats-local-* disposable tables are allowed.",
  );
const client = new DynamoDBClient({
  endpoint,
  region: "us-east-2",
  credentials: { accessKeyId: "local", secretAccessKey: "local" },
});
try {
  await client.send(new DescribeTableCommand({ TableName: table }));
} catch (e: any) {
  if (e.name !== "ResourceNotFoundException") throw e;
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
}
const doc = DynamoDBDocumentClient.from(client);
for (const Item of demoRecords())
  await doc.send(new PutCommand({ TableName: table, Item }));
if (
  process.env.LOCAL_GOOGLE_SUB &&
  process.env.LOCAL_GOOGLE_EMAIL?.endsWith("@stmarobotics.org")
) {
  await doc.send(
    new PutCommand({
      TableName: table,
      Item: {
        schemaVersion: 1,
        pk: `IDENTITY#${process.env.LOCAL_GOOGLE_SUB}`,
        sk: "METADATA",
        googleSub: process.env.LOCAL_GOOGLE_SUB,
        email: process.env.LOCAL_GOOGLE_EMAIL,
        memberId: "synthetic-alex",
        enabled: true,
        roles: [
          "stats:student",
          ...(process.env.LOCAL_STATS_STAFF === "true" ? ["stats:staff"] : []),
        ],
      },
    }),
  );
}
console.log(
  "Seeded disposable local synthetic data. Real Google authentication still applies to npm run dev.",
);
