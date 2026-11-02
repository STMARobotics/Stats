import { Temporal } from "@js-temporal/polyfill";
import Ajv from "ajv";
import schema from "../contracts/stats-reader.v1.json";

export type Item = Record<string, any> & { pk: string; sk: string };
export type Member = {
  memberId: string;
  displayName: string;
  memberKind: "student" | "mentor";
  active: boolean;
  testAccount?: boolean;
};
export type Entry = {
  id: string;
  memberId: string;
  kind: "shop" | "legacy" | "volunteer";
  title: string;
  date: string | null;
  year: number | null;
  status: string;
  recordedSeconds: number | null;
  creditedSeconds: number;
  startedAt: string | null;
  endedAt: string | null;
  cutoffAt: string | null;
  provisionalSeconds: number | null;
  eventId: string | null;
};
export class AppError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
  ) {
    super(message);
  }
}
export const badData = () =>
  new AppError(
    503,
    "DATA_QUALITY",
    "Puncher data does not match the supported contract. Staff must review the source data.",
  );
const ajv = new Ajv({ strict: false, allErrors: true });
ajv.addSchema(schema);
const validators = Object.fromEntries(
  Object.keys(schema.definitions).map((name) => [
    name,
    ajv.compile({ $ref: `${schema.$id}#/definitions/${name}` }),
  ]),
);
export function validate(item: Item | undefined, type: string): Item {
  if (!item || !validators[type]?.(item)) throw badData();
  return item;
}
export function checkMetadata(item?: Item) {
  if (!item || item.schemaVersion !== 1)
    throw new AppError(
      503,
      "UNSUPPORTED_SCHEMA",
      "Puncher schema is missing or unsupported. Stats supports reader contract v1.",
    );
  validate(item, "metadata");
  if (
    item.reportingYearConvention !==
    "ending year; June 2 through June 1 inclusive"
  )
    throw badData();
}
export const zone = "America/Chicago";
export function localDate(instant: string) {
  return Temporal.Instant.from(instant)
    .toZonedDateTimeISO(zone)
    .toPlainDate()
    .toString();
}
export function validDate(date: unknown): string {
  if (typeof date !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(date))
    throw badData();
  try {
    if (Temporal.PlainDate.from(date).toString() !== date) throw badData();
  } catch {
    throw badData();
  }
  return date;
}
export function reportingYear(date: string): number {
  const d = Temporal.PlainDate.from(validDate(date));
  return d.year + (d.month > 6 || (d.month === 6 && d.day >= 2) ? 1 : 0);
}
export const currentYear = (now: string) => reportingYear(localDate(now));
export function yearInterval(year: number) {
  const start = `${year - 1}-06-02`,
    end = `${year}-06-01`;
  const boundary = (y: number) =>
    Temporal.PlainDate.from(`${y}-06-02`)
      .toZonedDateTime({ timeZone: zone, plainTime: "00:00" })
      .toInstant()
      .toString();
  return {
    year,
    label: `${year - 1}–${year}`,
    start,
    end,
    startInstant: boundary(year - 1),
    endExclusive: boundary(year),
    timezone: zone,
  };
}
const millis = (value: unknown) => {
  if (typeof value !== "string" || !value.endsWith("Z")) throw badData();
  try {
    return Temporal.Instant.from(value).epochMilliseconds;
  } catch {
    throw badData();
  }
};
export function readMember(raw: Item): Member {
  validate(raw, "member");
  if (raw.pk !== `MEMBER#${raw.memberId}` || raw.sk !== "METADATA")
    throw badData();
  return {
    memberId: raw.memberId,
    displayName: raw.displayName,
    memberKind: raw.memberKind,
    active: raw.active,
    ...(raw.testAccount === true ? { testAccount: true } : {}),
  };
}
export function entriesFor(
  items: Item[],
  memberId: string,
  now: string,
): Entry[] {
  const entries: Entry[] = [];
  for (const r of items) {
    const kind = r.sk.startsWith("SHOP#")
      ? "shop"
      : r.sk.startsWith("LEGACYSHOP#")
        ? "legacy"
        : r.sk.startsWith("VOLUNTEER#")
          ? "volunteer"
          : null;
    if (!kind) continue; // Metadata and writer-internal keys are never credits.
    validate(
      r,
      kind === "shop" ? "shop" : kind === "legacy" ? "legacyShop" : "volunteer",
    );
    if (r.memberId !== memberId || r.pk !== `MEMBER#${memberId}`)
      throw badData();
    const date = (kind === "volunteer" ? r.eventDate : r.shopDate) ?? null;
    if (date !== null) validDate(date);
    const year = date === null ? null : reportingYear(date);
    if (r.reportingYear !== undefined && r.reportingYear !== year)
      throw badData();
    let status = r.status,
      credit = 0,
      provisional: number | null = null;
    const amount = r.creditedSeconds ?? null;
    if (kind === "shop") {
      const start = millis(r.startedAt),
        cutoff = millis(r.cutoffAt);
      if (
        cutoff <= start ||
        localDate(r.startedAt) !== date ||
        r.sk !== `SHOP#${r.startedAt}#${r.sessionId}`
      )
        throw badData();
      if (status === "completed") {
        const end = millis(r.endedAt);
        if (
          end < start ||
          end >= cutoff ||
          amount !== Math.floor((end - start) / 1000)
        )
          throw badData();
        credit = amount;
      } else {
        if (amount !== 0 || r.endedAt !== undefined) throw badData();
        if (status === "active") {
          if (cutoff <= millis(now)) status = "forfeited_missing_checkout";
          else
            provisional = Math.max(0, Math.floor((millis(now) - start) / 1000));
        }
      }
    } else {
      const expectedDate = date ?? "UNDATED";
      if (
        !r.sk.startsWith(
          `${kind === "legacy" ? "LEGACYSHOP" : "VOLUNTEER"}#${expectedDate}#`,
        )
      )
        throw badData();
      if (status === "approved") {
        if (!date || !Number.isSafeInteger(amount) || amount < 0)
          throw badData();
        credit = amount;
      }
    }
    entries.push({
      id:
        kind === "shop" ? r.sessionId : kind === "volunteer" ? r.awardId : r.sk,
      memberId,
      kind,
      title:
        kind === "volunteer"
          ? r.title
          : kind === "legacy"
            ? "Historical shop credit"
            : "Shop visit",
      date,
      year,
      status,
      recordedSeconds: amount,
      creditedSeconds: credit,
      startedAt: kind === "shop" ? r.startedAt : null,
      endedAt: kind === "shop" ? (r.endedAt ?? null) : null,
      cutoffAt: kind === "shop" ? r.cutoffAt : null,
      provisionalSeconds: provisional,
      eventId: r.eventId ?? null,
    });
  }
  return entries.sort(
    (a, b) =>
      (b.date ?? "").localeCompare(a.date ?? "") ||
      (b.startedAt ?? "").localeCompare(a.startedAt ?? "") ||
      a.id.localeCompare(b.id),
  );
}
export function totals(entries: Entry[], year?: number) {
  return entries
    .filter((e) => year === undefined || e.year === year)
    .reduce(
      (sum, e) => {
        sum[e.kind === "volunteer" ? "volunteerSeconds" : "shopSeconds"] +=
          e.creditedSeconds;
        return sum;
      },
      { shopSeconds: 0, volunteerSeconds: 0 },
    );
}
export type MemberData = { member: Member; entries: Entry[] };
export function leaderboard(
  data: MemberData[],
  year: number,
  metric: "shop" | "volunteer",
) {
  const rows = data
    .filter((d) => d.member.memberKind === "student" && !d.member.testAccount)
    .map((d) => ({
      memberId: d.member.memberId,
      displayName: d.member.displayName,
      active: d.member.active,
      creditedSeconds: totals(d.entries, year)[
        metric === "shop" ? "shopSeconds" : "volunteerSeconds"
      ],
    }))
    .filter((r) => r.active || r.creditedSeconds > 0)
    .sort(
      (a, b) =>
        b.creditedSeconds - a.creditedSeconds ||
        a.displayName.localeCompare(b.displayName, "en") ||
        a.memberId.localeCompare(b.memberId),
    );
  let rank = 0;
  return rows.map((r, i) => {
    if (i === 0 || r.creditedSeconds !== rows[i - 1].creditedSeconds)
      rank = i + 1;
    return { ...r, rank };
  });
}
export function csv(rows: unknown[][]) {
  const cell = (value: unknown) => {
    let s = value == null ? "" : String(value);
    if (typeof value !== "number" && /^[\s\u0000-\u001f]*[=+\-@]/.test(s))
      s = `'${s}`;
    return `"${s.replaceAll('"', '""')}"`;
  };
  return (
    "\uFEFF" + rows.map((row) => row.map(cell).join(",")).join("\r\n") + "\r\n"
  );
}
