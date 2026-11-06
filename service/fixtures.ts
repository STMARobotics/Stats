import { puncherSchemaVersion, type Item } from "./domain";
import type { Repository } from "./repository";
export const demoNow = "2026-11-02T21:00:00.000Z";
const base = { schemaVersion: puncherSchemaVersion };
export const demoMembers = [
  ["alex", "Alex Morgan", true],
  ["jordan", "Jordan Lee", true],
  ["riley", "Riley Chen", true],
  ["sam", "Sam Patel", true],
  ["avery", "Avery Johnson", true],
  ["casey", "Casey Brooks", false],
  ["taylor", "Taylor Rivera", true],
  ["morgan", "Morgan Davis", true],
  ["quinn", "Quinn Wilson", true],
  ["sage", "Sage Thompson", true],
  ["jamie", "Jamie Anderson", true],
  ["drew", "Drew Williams", true],
  ["mentor", "Robin Mentor", true],
  ["admin", "Pat Admin", true],
  ["test", "Synthetic test account", true],
] as const;
export function demoRecords(): Item[] {
  const records: Item[] = [
    {
      ...base,
      pk: "APP#PUNCHER",
      sk: "SCHEMA",
      timezone: "America/Chicago",
      durationUnit: "seconds",
      reportingYearConvention: "ending year; June 2 through June 1 inclusive",
    },
  ];
  demoMembers.forEach(([id, name, active], i) => {
    const memberId = `demo-${id}`;
    const role = id === "mentor" ? "MENTOR" : id === "admin" ? "ADMIN" : "STUDENT";
    records.push({
      ...base,
      pk: `USER#${memberId}`,
      sk: "METADATA",
      memberId,
      displayName: name,
      role,
      email: `${id}@stmarobotics.org`,
      barcode: String(i + 1).padStart(6, "0"),
      active,
      gsi1pk: "USERS",
      gsi1sk: memberId,
      testAccount: id === "test",
    });
    const shop = (date: string, duration: number, n: number) => {
      const start = `${date}T19:00:00.000Z`,
        sessionId = `${id}-${n}`;
      records.push({
        ...base,
        pk: `ATTENDANCE#${memberId}`,
        sk: `SHOP#${start}#${sessionId}`,
        sessionId,
        memberId,
        shopDate: date,
        reportingYear:
          Number(date.slice(0, 4)) + (date.slice(5) >= "06-02" ? 1 : 0),
        startedAt: start,
        endedAt: new Date(Date.parse(start) + duration * 1000).toISOString(),
        cutoffAt: new Date(
          Date.parse(date + "T05:00:00.000Z") + 86400000,
        ).toISOString(),
        status: "completed",
        creditedSeconds: duration,
      });
    };
    if (role === "STUDENT" && id !== "test") {
      const seconds = [
        10800, 14400, 14400, 9901, 9900, 12600, 9000, 8100, 7200, 6300, 5400,
        4500,
      ][i];
      for (let n = 0; n < 8; n++)
        shop(`2026-10-${String(10 + n).padStart(2, "0")}`, seconds, n);
      shop("2026-06-01", 3600 + i * 100, 20);
      records.push({
        ...base,
        pk: `ATTENDANCE#${memberId}`,
        sk: `LEGACYSHOP#2025-04-01#legacy-${id}`,
        memberId,
        shopDate: "2025-04-01",
        reportingYear: 2025,
        status: "approved",
        creditedSeconds: 7200 + i * 100,
        provenance: { synthetic: true },
      });
      records.push({
        ...base,
        pk: `ATTENDANCE#${memberId}`,
        sk: `VOLUNTEER#2026-10-24#award-${id}`,
        memberId,
        awardId: `award-${id}`,
        eventId: "open-house",
        title: "Community open house",
        eventDate: "2026-10-24",
        reportingYear: 2027,
        status: "approved",
        creditedSeconds: 7200 + (i % 3) * 1800,
        recordedAt: "2026-11-01T18:00:00.000Z",
      });
    }
  });
  const memberId = "demo-alex";
  records.push({
    ...base,
    pk: `ATTENDANCE#${memberId}`,
    sk: "SHOP#2026-11-02T20:00:00.000Z#active-demo",
    sessionId: "active-demo",
    memberId,
    shopDate: "2026-11-02",
    reportingYear: 2027,
    startedAt: "2026-11-02T20:00:00.000Z",
    cutoffAt: "2026-11-03T06:00:00.000Z",
    status: "active",
    creditedSeconds: 0,
  });
  records.push({
    ...base,
    pk: `ATTENDANCE#${memberId}`,
    sk: "SHOP#2026-10-17T23:00:00.000Z#expired-demo",
    sessionId: "expired-demo",
    memberId,
    shopDate: "2026-10-17",
    reportingYear: 2027,
    startedAt: "2026-10-17T23:00:00.000Z",
    cutoffAt: "2026-10-18T05:00:00.000Z",
    status: "active",
    creditedSeconds: 0,
  });
  for (const [id, status, date, seconds] of [
    ["pending", "pending_review", "2026-10-20", 5400],
    ["quarantine", "quarantined", null, null],
    ["void", "voided", "2026-10-19", 3600],
  ] as const) {
    records.push({
      ...base,
      pk: `ATTENDANCE#${memberId}`,
      sk: `VOLUNTEER#${date ?? "UNDATED"}#${id}`,
      memberId,
      awardId: id,
      title:
        id === "pending"
          ? "Library robot demonstration"
          : "Historical outreach",
      ...(date ? { eventDate: date, reportingYear: 2027 } : {}),
      status,
      creditedSeconds: seconds,
    });
  }
  return records;
}
export class FixtureRepository implements Repository {
  constructor(public records: Item[] = demoRecords()) {}
  async get(pk: string, sk: string) {
    return this.records.find((r) => r.pk === pk && r.sk === sk);
  }
  async roster() {
    return this.records.filter((r) => r.gsi1pk === "USERS");
  }
  async history(id: string) {
    return this.records.filter((r) => r.pk === `ATTENDANCE#${id}`);
  }
}
export function assertDemoAllowed(env = process.env) {
  if (
    env.AWS_LAMBDA_FUNCTION_NAME ||
    env.STATS_ENV === "production" ||
    env.NODE_ENV === "production"
  )
    throw new Error("Synthetic auth/data are forbidden in production.");
}
