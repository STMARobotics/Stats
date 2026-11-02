import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import {
  DynamoDBDocumentClient,
  GetCommand,
  QueryCommand,
} from "@aws-sdk/lib-dynamodb";
import { AppError, type Item } from "./domain";

export interface Repository {
  get(pk: string, sk: string): Promise<Item | undefined>;
  roster(): Promise<Item[]>;
  history(memberId: string): Promise<Item[]>;
}
export class DynamoRepository implements Repository {
  constructor(
    private client: DynamoDBDocumentClient,
    private table: string,
  ) {}
  async get(pk: string, sk: string) {
    const r = await this.client.send(
      new GetCommand({
        TableName: this.table,
        Key: { pk, sk },
        ConsistentRead: true,
      }),
    );
    return r.Item as Item | undefined;
  }
  private async query(partition: string, index?: string, prefix?: string) {
    const items: Item[] = [];
    let key: Record<string, any> | undefined;
    for (let page = 0; page < 100; page++) {
      const r = await this.client.send(
        new QueryCommand({
          TableName: this.table,
          IndexName: index,
          ConsistentRead: !index,
          KeyConditionExpression: `${index ? "gsi1pk" : "pk"} = :pk${prefix ? " AND begins_with(sk, :prefix)" : ""}`,
          ExpressionAttributeValues: {
            ":pk": partition,
            ...(prefix ? { ":prefix": prefix } : {}),
          },
          Limit: 100,
          ExclusiveStartKey: key,
        }),
      );
      items.push(...((r.Items ?? []) as Item[]));
      key = r.LastEvaluatedKey;
      if (items.length > 10000) break;
      if (!key) return items;
    }
    throw new AppError(
      503,
      "QUERY_LIMIT",
      "The source exceeded the bounded query limit. No partial totals were returned.",
    );
  }
  roster() {
    return this.query("MEMBERS", "GSI1");
  }
  async history(memberId: string) {
    const rows: Item[] = [];
    for (const prefix of ["SHOP#", "LEGACYSHOP#", "VOLUNTEER#"])
      rows.push(...(await this.query(`MEMBER#${memberId}`, undefined, prefix)));
    return rows;
  }
}
export function productionRepository(env = process.env): Repository {
  if (!env.TABLE_NAME || !env.SOURCE_REGION)
    throw new Error(
      "Explicit TABLE_NAME and SOURCE_REGION are required; there is no fixture fallback.",
    );
  const deployed =
    Boolean(env.AWS_LAMBDA_FUNCTION_NAME) || env.STATS_ENV === "production";
  if (
    deployed &&
    (env.DATA_MODE !== "cloud" || env.DYNAMODB_ENDPOINT || env.DEV_AUTH)
  )
    throw new Error("Production requires cloud data and Google OIDC.");
  if (
    !deployed &&
    env.DATA_MODE === "cloud" &&
    env.CLOUD_DEV_CONFIRMED !== "true"
  )
    throw new Error(
      "Explicit CLOUD_DEV_CONFIRMED=true and a development table are required.",
    );
  if (!["cloud", "dynamo-local"].includes(env.DATA_MODE ?? ""))
    throw new Error("Choose DATA_MODE=cloud or dynamo-local.");
  if (
    env.DATA_MODE === "dynamo-local" &&
    !/^http:\/\/(127\.0\.0\.1|localhost):\d+$/.test(env.DYNAMODB_ENDPOINT ?? "")
  )
    throw new Error(
      "DynamoDB Local requires an explicit loopback HTTP endpoint.",
    );
  const client = new DynamoDBClient({
    region: env.SOURCE_REGION,
    ...(env.DATA_MODE === "dynamo-local"
      ? {
          endpoint: env.DYNAMODB_ENDPOINT,
          credentials: { accessKeyId: "local", secretAccessKey: "local" },
        }
      : {}),
  });
  return new DynamoRepository(
    DynamoDBDocumentClient.from(client),
    env.TABLE_NAME,
  );
}
