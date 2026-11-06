import { describe, expect, it } from "vitest";
import { createApi } from "../service/api";
import { demoNow, FixtureRepository } from "../service/fixtures";
function setup() {
  const repo = new FixtureRepository();
  const api = createApi(repo, () => demoNow);
  return {
    repo,
    call: (
      path: string,
      query: Record<string, string> = {},
      id = "alex",
      method = "GET",
    ) =>
      api({
        path,
        query,
        method,
        principal: { sub: `demo-${id}`, email: `${id}@stmarobotics.org` },
      }),
  };
}
describe("read-only Stats API", () => {
  it("returns only personal history and explicit limited team fields", async () => {
    const { call } = setup();
    const r = await call("/api/hours", { year: "2027" });
    expect(r.statusCode).toBe(200);
    const body = JSON.parse(r.body);
    expect(body.selected).toEqual({
      shopSeconds: 86400,
      volunteerSeconds: 7200,
    });
    expect(body.career).toEqual({ shopSeconds: 97200, volunteerSeconds: 7200 });
    expect(body.history.every((r: any) => !("memberId" in r))).toBe(true);
    const board = await call("/api/leaderboard");
    const b = JSON.parse(board.body);
    expect(b.rows.length).toBe(12);
    expect(b.rows[0].rank).toBe(1);
    expect(b.rows[1].rank).toBe(1);
    expect(b.rows[2].rank).toBe(3);
    expect(Object.keys(b.rows[0]).sort()).toEqual([
      "active",
      "creditedSeconds",
      "displayName",
      "isMe",
      "rank",
    ]);
    for (const source of [r.body, board.body])
      for (const secret of [
        "@stmarobotics",
        "googleSub",
        "provenance",
        "pk",
        "roles",
        "barcode",
        "email",
        "originalApproval",
      ])
        expect(source).not.toContain(`"${secret}"`);
    expect(r.headers["Cache-Control"]).toBe("private, no-store");
    expect(r.headers.Vary).toBe("Cookie");
  });
  it("blocks IDOR, mutation, device access and staff escalation", async () => {
    const { call } = setup();
    for (const path of ["/api/hours", "/api/leaderboard"])
      expect(
        (await call(path, { memberId: "demo-jordan" })).statusCode,
      ).toBe(400);
    expect((await call("/api/hours/demo-jordan")).statusCode).toBe(404);
    expect((await call("/api/reports")).statusCode).toBe(403);
    expect((await call("/api/reports", { format: "csv" })).statusCode).toBe(
      403,
    );
    expect((await call("/api/hours", {}, "alex", "POST")).statusCode).toBe(405);
    expect((await call("/api/reports", {}, "device")).statusCode).toBe(403);
    expect((await call("/api/hours", {}, "unlinked")).statusCode).toBe(403);
  });
  it("allows team standings before the first sign-in to Puncher", async () => {
    const { call } = setup();
    const id = "unlinked";
    const profile = await call("/api/me", {}, id);
    expect(profile.statusCode).toBe(200);
    expect(JSON.parse(profile.body)).toMatchObject({
      student: false,
      staff: false,
    });
    const board = await call("/api/leaderboard", {}, id);
    expect(board.statusCode).toBe(200);
    expect(JSON.parse(board.body).rows).toHaveLength(12);
    expect((await call("/api/hours", {}, id)).statusCode).toBe(403);
    expect((await call("/api/reports", { format: "csv" }, id)).statusCode).toBe(403);
  });
  it("uses current Puncher roles for private views and hides email fallback names", async () => {
    const { call, repo } = setup();
    const user = repo.records.find((r) => r.pk === "USER#demo-alex")!;
    user.displayName = user.email;
    expect(JSON.parse((await call("/api/me")).body)).toMatchObject({
      displayName: "Team member",
      student: true,
      staff: false,
    });
    expect((await call("/api/leaderboard")).body).not.toContain(user.email);
    for (const id of ["mentor", "admin"]) {
      expect((await call("/api/reports", {}, id)).statusCode).toBe(200);
      expect((await call("/api/hours", {}, id)).statusCode).toBe(403);
    }
    user.role = "MENTOR";
    expect((await call("/api/reports")).statusCode).toBe(200);
    expect((await call("/api/hours")).statusCode).toBe(403);
  });
  it("switches year/metric, retains former students and paginates exact rankings", async () => {
    const { call } = setup();
    const get = async (q: Record<string, string>) =>
      JSON.parse((await call("/api/leaderboard", q)).body);
    const first = await get({ year: "2027", metric: "shop", limit: "2" }),
      second = await get({
        year: "2027",
        metric: "shop",
        limit: "2",
        offset: "2",
      });
    expect(first.rows.map((r: any) => r.rank)).toEqual([1, 1]);
    expect(second.rows[0].rank).toBe(3);
    expect(second.me).toMatchObject({ isMe: true, displayName: "Alex Morgan" });
    expect(
      (await get({ year: "2026" })).rows.find(
        (r: any) => r.displayName === "Alex Morgan",
      ).creditedSeconds,
    ).toBe(3600);
    expect(
      (await get({ year: "2027", metric: "volunteer" })).rows[0]
        .creditedSeconds,
    ).toBe(10800);
    expect(
      (await get({ year: "2027" })).rows.some((r: any) => r.active === false),
    ).toBe(true);
    expect(
      JSON.parse((await call("/api/hours", { year: "2024" })).body).selected,
    ).toEqual({ shopSeconds: 0, volunteerSeconds: 0 });
  });
  it("rechecks disabled accounts and isolates users without stale caches", async () => {
    const { repo, call } = setup();
    const a = JSON.parse((await call("/api/hours")).body),
      b = JSON.parse((await call("/api/hours", {}, "jordan")).body);
    expect(a.selected.shopSeconds).not.toBe(b.selected.shopSeconds);
    repo.records.find((r) => r.pk === "USER#demo-alex")!.active = false;
    expect((await call("/api/leaderboard")).statusCode).toBe(403);
    expect((await call("/api/hours", {}, "jordan")).statusCode).toBe(200);
  });
  it("reports source and schema failures explicitly without returning plausible zero totals", async () => {
    const { repo, call } = setup();
    repo.records[0].schemaVersion = 1;
    const r = await call("/api/hours");
    expect(r.statusCode).toBe(503);
    expect(JSON.parse(r.body).code).toBe("UNSUPPORTED_SCHEMA");
    expect(r.body).not.toContain("shopSeconds");
    repo.records[0].schemaVersion = 2;
    repo.history = async () => {
      throw new Error("network failed with sensitive data");
    };
    const unavailable = await call("/api/hours");
    expect(unavailable.statusCode).toBe(503);
    expect(unavailable.body).not.toContain("sensitive");
  });
  it("exports matching staff summaries and offers inside/event/forfeiture/legacy scopes", async () => {
    const { call } = setup();
    const summary = JSON.parse(
      (await call("/api/reports", { year: "2027", search: "Alex" }, "mentor"))
        .body,
    );
    expect(summary.rows).toHaveLength(1);
    expect(summary.rows[0].shopSeconds).toBe(86400);
    const exported = await call(
      "/api/reports",
      { year: "2027", search: "Alex", format: "csv" },
      "mentor",
    );
    expect(exported.headers["Content-Type"]).toContain("text/csv");
    expect(exported.body).toContain('"86400"');
    const inside = JSON.parse(
      (await call("/api/reports", { view: "inside" }, "mentor")).body,
    );
    expect(inside.rows).toHaveLength(1);
    expect(inside.rows[0].id).toBe("active-demo");
    const forfeits = JSON.parse(
      (await call("/api/reports", { view: "forfeitures" }, "mentor")).body,
    );
    expect(forfeits.rows[0].id).toBe("expired-demo");
    const events = JSON.parse(
      (
        await call(
          "/api/reports",
          { view: "events", eventId: "open-house" },
          "mentor",
        )
      ).body,
    );
    expect(events.rows).toHaveLength(12);
    const legacy = JSON.parse(
      (
        await call(
          "/api/reports",
          { view: "legacy", year: "2025", search: "Alex" },
          "mentor",
        )
      ).body,
    );
    expect(legacy.rows[0].startedAt).toBeNull();
    const range = JSON.parse(
      (
        await call(
          "/api/reports",
          {
            view: "history",
            start: "2026-10-24",
            end: "2026-10-24",
            search: "Alex",
          },
          "mentor",
        )
      ).body,
    );
    expect(range.rows).toHaveLength(1);
    expect(
      (await call("/api/reports", { start: "2026-02-30" }, "mentor"))
        .statusCode,
    ).not.toBe(200);
  });
  it("never calls persistence write methods or mutates warning/source state", async () => {
    const { repo, call } = setup();
    const before = JSON.stringify(repo.records);
    await call("/api/hours");
    await call("/api/reports", {}, "mentor");
    expect(JSON.stringify(repo.records)).toBe(before);
    expect(
      Object.getOwnPropertyNames(Object.getPrototypeOf(repo)).sort(),
    ).toEqual(["constructor", "get", "history", "roster"]);
  });
});
