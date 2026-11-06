import { describe, expect, it } from "vitest";
import {
  checkMetadata,
  csv,
  currentYear,
  entriesFor,
  leaderboard,
  localDate,
  readMember,
  reportingYear,
  totals,
  yearInterval,
} from "../service/domain";
import { demoNow, demoRecords } from "../service/fixtures";
import fixture from "../contracts/fixtures/puncher-reader-v2.json";

describe("Puncher reader v2", () => {
  it("agrees with Puncher published fixture totals and event-date grouping", () => {
    const id = "11111111-1111-4111-8111-111111111111";
    checkMetadata(fixture.records[0]);
    expect(readMember(fixture.records[1])).toEqual({
      memberId: id,
      displayName: "Alex Example",
      role: "STUDENT",
      active: true,
    });
    const entries = entriesFor(
      fixture.records.filter((r) => r.pk === `ATTENDANCE#${id}`),
      id,
      demoNow,
    );
    expect(totals(entries)).toEqual({
      shopSeconds: fixture.expected.careerShopSeconds,
      volunteerSeconds: fixture.expected.careerVolunteerSeconds,
    });
    for (const [year, expected] of Object.entries(fixture.expected.years))
      expect(totals(entries, Number(year))).toEqual(expected);
    expect(
      entries.find((e) => e.kind === "legacy" && e.status === "approved")
        ?.startedAt,
    ).toBeNull();
    expect(entries.find((e) => e.date === null)?.recordedSeconds).toBeNull();
  });
  it("includes June 1, starts June 2 locally and handles UTC offset changes", () => {
    expect(currentYear("2026-06-02T04:59:59.999Z")).toBe(2026);
    expect(currentYear("2026-06-02T05:00:00.000Z")).toBe(2027);
    expect(reportingYear("2025-06-02")).toBe(2026);
    expect(reportingYear("2026-06-01")).toBe(2026);
    expect(yearInterval(2026).endExclusive).toBe("2026-06-02T05:00:00Z");
    expect(localDate("2026-03-08T05:59:59Z")).toBe("2026-03-07");
    expect(localDate("2026-03-08T06:00:00Z")).toBe("2026-03-08");
    expect(localDate("2026-11-02T05:59:59Z")).toBe("2026-11-01");
    expect(localDate("2026-11-02T06:00:00Z")).toBe("2026-11-02");
  });
  it("groups volunteer awards by event date even when recorded in a later reporting year", () => {
    const row = fixture.records.find(
      (r) => r.sk.startsWith("VOLUNTEER#") && r.status === "approved",
    )!;
    const entry = {
      ...row,
      sk: "VOLUNTEER#2026-06-01#synthetic-award",
      eventDate: "2026-06-01",
      reportingYear: 2026,
      recordedAt: "2026-06-03T18:00:00.000Z",
    };
    const entries = entriesFor([entry], row.memberId!, demoNow);
    expect(totals(entries, 2026).volunteerSeconds).toBe(5400);
    expect(totals(entries, 2027).volunteerSeconds).toBe(0);
  });
  it("logically expires active visits without a write and preserves earlier same-day credit", () => {
    const rows = demoRecords().filter((r) => r.pk === "ATTENDANCE#demo-alex");
    const before = JSON.stringify(rows);
    const entries = entriesFor(rows, "demo-alex", demoNow);
    expect(entries.find((e) => e.id === "active-demo")).toMatchObject({
      status: "active",
      creditedSeconds: 0,
      provisionalSeconds: 3600,
    });
    expect(entries.find((e) => e.id === "expired-demo")).toMatchObject({
      status: "forfeited_missing_checkout",
      creditedSeconds: 0,
    });
    expect(totals(entries, 2027)).toEqual({
      shopSeconds: 86400,
      volunteerSeconds: 7200,
    });
    expect(
      entries.find((e) => e.date === "2026-10-17" && e.status === "completed")
        ?.creditedSeconds,
    ).toBe(10800);
    expect(JSON.stringify(rows)).toBe(before);
  });
  it("ignores additive fields/internal rollups and rejects unknown status/schema/invalid credit", () => {
    const row = fixture.records.find(
      (r) => r.sk.startsWith("SHOP#") && r.status === "completed",
    )!;
    const id = row.memberId!;
    expect(
      totals(
        entriesFor(
          [
            { ...row, newField: "ok" },
            { pk: `ATTENDANCE#${id}`, sk: "SUMMARY#SHOP", creditedSeconds: 999999 },
          ],
          id,
          demoNow,
        ),
      ).shopSeconds,
    ).toBe(3600);
    for (const patch of [
      { status: "new-status" },
      { schemaVersion: 1 },
      { creditedSeconds: 3601 },
      { reportingYear: 2027 },
      { endedAt: row.cutoffAt },
    ])
      expect(() => entriesFor([{ ...row, ...patch }], id, demoNow)).toThrow();
    expect(() =>
      checkMetadata({ ...fixture.records[0], schemaVersion: 1 }),
    ).toThrow(/unsupported/);
    expect(() => reportingYear("2026-02-30")).toThrow();
    const legacy = fixture.records.find(
      (r) => r.sk.startsWith("LEGACYSHOP#") && r.status === "approved",
    )!;
    expect(() =>
      entriesFor([{ ...legacy, creditedSeconds: -10 }], id, demoNow),
    ).toThrow();
    expect(() =>
      entriesFor(
        [
          {
            ...legacy,
            shopDate: undefined,
            reportingYear: undefined,
            sk: "LEGACYSHOP#UNDATED#x",
          },
        ],
        id,
        demoNow,
      ),
    ).toThrow();
  });
  it("uses shared competition ranks, exact seconds, student-only membership and stable ties", () => {
    const data = ["z", "a", "b", "former", "mentor", "test"].map((id, i) => ({
      member: {
        memberId: id,
        displayName: i < 3 ? "Same name" : id,
        role: id === "mentor" ? ("MENTOR" as const) : ("STUDENT" as const),
        active: id !== "former",
        testAccount: id === "test",
      },
      entries: [
        {
          kind: "shop" as const,
          year: 2027,
          creditedSeconds: i < 2 ? 3600 : i === 2 ? 3599 : 1800,
        } as any,
      ],
    }));
    const rows = leaderboard(data, 2027, "shop");
    expect(rows.map((r) => [r.memberId, r.rank])).toEqual([
      ["a", 1],
      ["z", 1],
      ["b", 3],
      ["former", 4],
    ]);
    expect(rows[1].creditedSeconds / 3600).not.toBe(
      rows[2].creditedSeconds / 3600,
    );
  });
  it("quotes CSV and neutralizes spreadsheet formulas including whitespace prefixes", () => {
    const out = csv([
      ["=SUM(A1)", " \t@bad", "+bad", "-bad", 'a,"b"\nline', 3600, null],
    ]);
    expect(out).toContain('"\'=SUM(A1)"');
    expect(out).toContain('"\' \t@bad"');
    expect(out).toContain('"a,""b""\nline"');
    expect(out).toContain('"3600"');
  });
});
