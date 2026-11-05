import {
  AppError,
  checkMetadata,
  csv,
  currentYear,
  entriesFor,
  leaderboard,
  readMember,
  totals,
  validDate,
  yearInterval,
  type MemberData,
} from "./domain";
import { resolveViewer, type Principal } from "./auth";
import type { Repository } from "./repository";

export type Request = {
  method: string;
  path: string;
  query: Record<string, string>;
  principal: Principal;
};
export type Response = {
  statusCode: number;
  headers: Record<string, string>;
  body: string;
};
export const respond = (
  statusCode: number,
  body: unknown,
  contentType = "application/json",
): Response => ({
  statusCode,
  headers: {
    "Content-Type": contentType,
    "Cache-Control": "private, no-store",
    Vary: "Cookie",
    "X-Content-Type-Options": "nosniff",
  },
  body:
    contentType === "application/json" ? JSON.stringify(body) : String(body),
});
async function teamData(repo: Repository, now: string): Promise<MemberData[]> {
  const roster = (await repo.roster()).map(readMember);
  if (
    roster.length > 250 ||
    new Set(roster.map((m) => m.memberId)).size !== roster.length
  )
    throw new AppError(
      503,
      "ROSTER_LIMIT",
      "Roster requires integration review.",
    );
  const result: MemberData[] = [];
  // Four concurrent member reads, all pagination stays in the backend.
  let index = 0;
  await Promise.all(
    Array.from({ length: 4 }, async () => {
      while (index < roster.length) {
        const m = roster[index++];
        result.push({
          member: m,
          entries: entriesFor(await repo.history(m.memberId), m.memberId, now),
        });
      }
    }),
  );
  return result;
}
export function createApi(
  repo: Repository,
  clock = () => new Date().toISOString(),
) {
  return async (request: Request): Promise<Response> => {
    try {
      const { method, path, query: q, principal } = request;
      if (method !== "GET")
        throw new AppError(
          405,
          "READ_ONLY",
          "Stats only supports read operations.",
        );
      const viewer = await resolveViewer(repo, principal);
      await checkMetadata(await repo.get("APP#PUNCHER", "SCHEMA"));
      const now = clock(),
        current = currentYear(now);
      const year = q.year === undefined ? current : Number(q.year);
      if (!Number.isInteger(year) || year < 2000 || year > current + 1)
        throw new AppError(400, "FILTER", "Select a valid reporting year.");
      const allowed =
        path === "/api/me" || path === "/api/health"
          ? []
          : path === "/api/hours"
            ? ["year"]
            : path === "/api/leaderboard"
              ? ["year", "metric", "offset", "limit"]
              : path === "/api/reports"
                ? [
                    "year",
                    "view",
                    "search",
                    "start",
                    "end",
                    "memberId",
                    "eventId",
                    "format",
                  ]
                : [];
      if (Object.keys(q).some((k) => !allowed.includes(k)))
        throw new AppError(400, "FILTER", "Unsupported query parameter.");
      if (path === "/api/me")
        return respond(200, {
          displayName: viewer.member?.displayName ?? "Staff",
          student: viewer.student,
          staff: viewer.staff,
          currentYear: current,
        });
      if (path === "/api/health")
        return respond(200, {
          schemaVersion: 1,
          source: "Puncher",
          status: "available",
          asOf: now,
        });
      if (path === "/api/hours") {
        if (!viewer.student || !viewer.member)
          throw new AppError(
            403,
            "STUDENT_ONLY",
            "My Hours requires a student member link. Use staff reports.",
          );
        const data = await teamData(repo, now);
        // Direct member lookup preserves private history if roster GSI has not caught up.
        const mine = entriesFor(
          await repo.history(viewer.member.memberId),
          viewer.member.memberId,
          now,
        );
        const shop = leaderboard(data, year, "shop"),
          volunteer = leaderboard(data, year, "volunteer");
        return respond(200, {
          interval: yearInterval(year),
          asOf: now,
          selected: totals(mine, year),
          career: totals(mine),
          years: [
            ...new Set([
              current,
              ...mine.flatMap((e) => (e.year ? [e.year] : [])),
            ]),
          ].sort((a, b) => b - a),
          ranks: {
            shop:
              shop.find((r) => r.memberId === viewer.member!.memberId)?.rank ??
              null,
            volunteer:
              volunteer.find((r) => r.memberId === viewer.member!.memberId)
                ?.rank ?? null,
          },
          history: mine
            .filter((e) => e.year === year || e.year === null)
            .map(({ memberId: _member, eventId: _event, ...entry }) => entry),
        });
      }
      if (path === "/api/leaderboard") {
        const metric = q.metric ?? "shop";
        if (metric !== "shop" && metric !== "volunteer")
          throw new AppError(400, "FILTER", "Choose shop or volunteer hours.");
        const offset = Number(q.offset ?? 0),
          limit = Number(q.limit ?? 20);
        if (
          !Number.isInteger(offset) ||
          offset < 0 ||
          !Number.isInteger(limit) ||
          limit < 1 ||
          limit > 100
        )
          throw new AppError(400, "FILTER", "Invalid pagination.");
        const data = await teamData(repo, now),
          rows = leaderboard(data, year, metric);
        const publicRow = (r: (typeof rows)[number]) => ({
          rank: r.rank,
          displayName: r.displayName,
          active: r.active,
          creditedSeconds: r.creditedSeconds,
          isMe: r.memberId === viewer.member?.memberId,
        });
        return respond(200, {
          interval: yearInterval(year),
          metric,
          asOf: now,
          total: rows.length,
          offset,
          limit,
          years: [
            ...new Set([
              current,
              ...data.flatMap((d) =>
                d.entries.flatMap((e) => (e.year ? [e.year] : [])),
              ),
            ]),
          ].sort((a, b) => b - a),
          me: rows.find((r) => r.memberId === viewer.member?.memberId)
            ? publicRow(
                rows.find((r) => r.memberId === viewer.member?.memberId)!,
              )
            : null,
          rows: rows.slice(offset, offset + limit).map(publicRow),
        });
      }
      if (path === "/api/reports") {
        if (!viewer.staff)
          throw new AppError(
            403,
            "STAFF_ONLY",
            "An explicit Stats staff permission is required for team reports.",
          );
        const view = q.view ?? "summary";
        if (
          ![
            "summary",
            "history",
            "inside",
            "events",
            "forfeitures",
            "legacy",
          ].includes(view) ||
          (q.format && q.format !== "csv")
        )
          throw new AppError(400, "FILTER", "Invalid report type or format.");
        try {
          if (q.start) validDate(q.start);
          if (q.end) validDate(q.end);
        } catch {
          throw new AppError(
            400,
            "FILTER",
            "Use valid calendar dates for report filters.",
          );
        }
        if (q.start && q.end && q.start > q.end)
          throw new AppError(
            400,
            "FILTER",
            "Start date must precede end date.",
          );
        const data = (await teamData(repo, now)).filter(
          (d) =>
            (!q.memberId || d.member.memberId === q.memberId) &&
            (!q.search ||
              d.member.displayName
                .toLowerCase()
                .includes(q.search.toLowerCase())),
        );
        const selected = (entries: MemberData["entries"]) =>
          entries.filter(
            (e) =>
              e.year === year &&
              (!q.start || (e.date !== null && e.date >= q.start)) &&
              (!q.end || (e.date !== null && e.date <= q.end)) &&
              (!q.eventId || e.eventId === q.eventId),
          );
        const rows =
          view === "summary"
            ? data.map((d) => ({
                memberId: d.member.memberId,
                displayName: d.member.displayName,
                active: d.member.active,
                ...totals(selected(d.entries)),
              }))
            : data.flatMap((d) =>
                (view === "inside"
                  ? d.entries.filter((e) => e.status === "active")
                  : selected(d.entries)
                )
                  .filter(
                    (e) =>
                      view === "inside" ||
                      view === "history" ||
                      (view === "events"
                        ? e.kind === "volunteer"
                        : view === "forfeitures"
                          ? e.status === "forfeited_missing_checkout"
                          : e.kind === "legacy" && e.status === "approved"),
                  )
                  .map((e) => ({ displayName: d.member.displayName, ...e })),
              );
        rows.sort(
          (a, b) =>
            a.displayName.localeCompare(b.displayName, "en") ||
            a.memberId.localeCompare(b.memberId),
        );
        if (q.format === "csv") {
          const cols =
            view === "summary"
              ? [
                  "displayName",
                  "memberId",
                  "active",
                  "shopSeconds",
                  "volunteerSeconds",
                ]
              : [
                  "displayName",
                  "memberId",
                  "kind",
                  "title",
                  "date",
                  "status",
                  "recordedSeconds",
                  "creditedSeconds",
                  "startedAt",
                  "endedAt",
                  "eventId",
                ];
          const result = respond(
            200,
            csv([cols, ...rows.map((r) => cols.map((c) => (r as any)[c]))]),
            "text/csv; charset=utf-8",
          );
          result.headers["Content-Disposition"] =
            `attachment; filename="stats-${view}-${year}.csv"`;
          return result;
        }
        return respond(200, {
          interval: yearInterval(year),
          view,
          asOf: now,
          rows,
        });
      }
      throw new AppError(
        404,
        "NOT_FOUND",
        "This Stats endpoint does not exist.",
      );
    } catch (error) {
      if (error instanceof AppError) {
        if (error.status === 503)
          console.error(
            JSON.stringify({ event: "source_unavailable", code: error.code }),
          );
        return respond(error.status, {
          code: error.code,
          message: error.message,
        });
      }
      console.error(
        JSON.stringify({
          event: "source_unavailable",
          type: error instanceof Error ? error.name : "unknown",
        }),
      );
      return respond(503, {
        code: "DATA_UNAVAILABLE",
        message:
          "Puncher data is temporarily unavailable. Retry shortly; no estimated totals are shown.",
      });
    }
  };
}
