import { expect, it } from "vitest";
import { DynamoRepository } from "../service/repository";
it("paginates queries, reads identity authoritatively and never scans", async () => {
  const calls: any[] = [];
  let n = 0;
  const client = {
    send: async (command: any) => {
      calls.push(command);
      if (command.constructor.name === "GetCommand")
        return { Item: { pk: "IDENTITY#sub", sk: "METADATA" } };
      return n++ === 0
        ? {
            Items: [{ pk: "MEMBER#a", sk: "METADATA" }],
            LastEvaluatedKey: {
              gsi1pk: "MEMBERS",
              gsi1sk: "a",
              pk: "MEMBER#a",
              sk: "METADATA",
            },
          }
        : { Items: [{ pk: "MEMBER#b", sk: "METADATA" }] };
    },
  };
  const repo = new DynamoRepository(client as any, "explicit-source");
  expect(await repo.roster()).toHaveLength(2);
  await repo.get("IDENTITY#sub", "METADATA");
  expect(calls[1].input.ExclusiveStartKey).toBeDefined();
  expect(calls[2].input.ConsistentRead).toBe(true);
  expect(calls.map((c) => c.constructor.name)).toEqual([
    "QueryCommand",
    "QueryCommand",
    "GetCommand",
  ]);
});
