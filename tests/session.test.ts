import { describe, expect, it } from "vitest";
import { requestHeaders } from "../service/session";

describe("API Gateway HTTP API request cookies", () => {
  it("normalizes the v2 cookies array for cookie-backed auth", () => {
    expect(
      requestHeaders({ "content-type": "text/plain" }, [
        "__Host-stats-oauth-state=state-value",
        "other=value",
      ]),
    ).toEqual({
      "content-type": "text/plain",
      cookie: "__Host-stats-oauth-state=state-value;other=value",
    });
  });

  it("preserves cookies already present in headers", () => {
    expect(requestHeaders({ Cookie: "first=value" }, ["second=value"])).toEqual(
      {
        Cookie: "first=value",
        cookie: "first=value;second=value",
      },
    );
  });
});
