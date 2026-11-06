import { expect, it } from "vitest";
import { DynamoRepository } from "../service/repository";
it("paginates the v2 roster and reads users and attendance consistently", async () => {
  const calls: any[] = [];
  let n = 0;
  const client = {
    send: async (command: any) => {
      calls.push(command);
      if (command.constructor.name === "GetCommand")
        return { Item: { pk: "USER#sub", sk: "METADATA" } };
      if (!command.input.IndexName) return { Items: [] };
      return n++ === 0
        ? {
            Items: [{ pk: "USER#a", sk: "METADATA" }],
            LastEvaluatedKey: {
              gsi1pk: "USERS",
              gsi1sk: "a",
              pk: "USER#a",
              sk: "METADATA",
            },
          }
        : { Items: [{ pk: "USER#b", sk: "METADATA" }] };
    },
  };
  const repo = new DynamoRepository(client as any, "explicit-source");
  expect(await repo.roster()).toHaveLength(2);
  await repo.get("USER#sub", "METADATA");
  await repo.history("sub");
  expect(calls[0].input.ExpressionAttributeValues).toEqual({ ":pk": "USERS" });
  expect(calls[1].input.ExclusiveStartKey).toBeDefined();
  expect(calls[2].input.ConsistentRead).toBe(true);
  expect(calls.slice(3).map((c) => c.input.ExpressionAttributeValues)).toEqual(
    ["SHOP#", "LEGACYSHOP#", "VOLUNTEER#"].map((prefix) => ({
      ":pk": "ATTENDANCE#sub",
      ":prefix": prefix,
    })),
  );
  expect(calls.slice(3).every((c) => c.input.ConsistentRead)).toBe(true);
});
