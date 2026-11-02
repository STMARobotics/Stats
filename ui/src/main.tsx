import React, { useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import "@fontsource/figtree/400.css";
import "@fontsource/figtree/500.css";
import "@fontsource/figtree/600.css";
import "@fontsource/figtree/700.css";
import "@fontsource/figtree/800.css";
import "./style.css";

type Config = {
  googleClientId: string;
  allowedDomain: string;
  demo: boolean;
  demoNow?: string;
  puncherUrl?: string;
};
type Me = {
  displayName: string;
  student: boolean;
  staff: boolean;
  currentYear: number;
};
type History = {
  id: string;
  kind: string;
  title: string;
  date: string | null;
  status: string;
  recordedSeconds: number | null;
  creditedSeconds: number;
  startedAt: string | null;
  endedAt: string | null;
  provisionalSeconds: number | null;
};
type Interval = { label: string; start: string; end: string };
type Hours = {
  interval: Interval;
  asOf: string;
  selected: { shopSeconds: number; volunteerSeconds: number };
  career: { shopSeconds: number; volunteerSeconds: number };
  years: number[];
  ranks: { shop: number | null; volunteer: number | null };
  history: History[];
};
type Standing = {
  rank: number;
  displayName: string;
  active: boolean;
  creditedSeconds: number;
  isMe: boolean;
};
type Board = {
  interval: Interval;
  asOf: string;
  rows: Standing[];
  me: Standing | null;
  total: number;
  offset: number;
  limit: number;
  years: number[];
};
type Report = {
  interval: Interval;
  asOf: string;
  view: string;
  rows: Record<string, any>[];
};
type Failure = { code: string; message: string };
const hours = (s: number) =>
  (s / 3600).toLocaleString("en-US", {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  });
const date = (s: string | null) =>
  s
    ? new Intl.DateTimeFormat("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
        timeZone: "UTC",
      }).format(new Date(s + "T12:00:00Z"))
    : "Date unknown";
const time = (s: string | null) =>
  s
    ? new Intl.DateTimeFormat("en-US", {
        hour: "numeric",
        minute: "2-digit",
        timeZone: "America/Chicago",
      }).format(new Date(s))
    : "—";
const stamp = (s: string) =>
  new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZone: "America/Chicago",
    timeZoneName: "short",
  }).format(new Date(s));
const statusNames: Record<string, string> = {
  completed: "Completed",
  active: "In progress",
  forfeited_missing_checkout: "Missed checkout",
  approved: "Approved",
  pending_review: "Pending review",
  quarantined: "Needs review",
  voided: "Voided",
};
function Icon({ type, size = 20 }: { type: string; size?: number }) {
  const paths: Record<string, React.ReactNode> = {
    hours: (
      <>
        <circle cx="12" cy="12" r="8" />
        <path d="M12 7v5l3 2" />
      </>
    ),
    board: (
      <>
        <path d="M4 20V12h5v8m0 0V5h6v15m0 0v-11h5v11M3 20h18" />
      </>
    ),
    reports: (
      <>
        <path d="M6 3h9l4 4v14H6zM14 3v5h5M9 12h7m-7 4h7" />
      </>
    ),
    arrow: <path d="M5 12h14m-5-5 5 5-5 5" />,
    download: (
      <>
        <path d="M12 3v12m-4-4 4 4 4-4M4 16v5h16v-5" />
      </>
    ),
    spark: (
      <>
        <path d="m12 2 2.8 6.7L22 12l-7.2 3.3L12 22l-2.8-6.7L2 12l7.2-3.3z" />
      </>
    ),
    lock: (
      <>
        <rect x="5" y="10" width="14" height="11" rx="2" />
        <path d="M8 10V7a4 4 0 0 1 8 0v3m-4 5v2" />
      </>
    ),
  };
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {paths[type] ?? paths.hours}
    </svg>
  );
}
function useData<T>(
  path: string,
  token: string,
  onExpired: () => void,
  revision = 0,
) {
  const [data, setData] = useState<T | null>(null),
    [error, setError] = useState<Failure | null>(null),
    [loading, setLoading] = useState(true);
  const expiredRef = useRef(onExpired);
  expiredRef.current = onExpired;
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError(null);
    setData(null);
    if (!token) {
      setLoading(false);
      return () => controller.abort();
    }
    fetch(path, {
      headers: { Authorization: `Bearer ${token}` },
      cache: "no-store",
      signal: controller.signal,
    })
      .then(async (r) => {
        const body = await r.json();
        if (!r.ok) {
          if (r.status === 401) expiredRef.current();
          throw body;
        }
        return body;
      })
      .then(setData)
      .catch((e) => {
        if (e.name !== "AbortError")
          setError({
            code: e.code ?? "NETWORK",
            message:
              e.message ??
              "Unable to connect to Stats. Check your connection and retry.",
          });
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [path, token, revision]);
  return { data, error, loading };
}
function State({
  loading,
  error,
  retry,
}: {
  loading: boolean;
  error: Failure | null;
  retry: () => void;
}) {
  return (
    <div className="state" role={error ? "alert" : "status"}>
      <Icon type={error ? "lock" : "hours"} size={30} />
      <h2>
        {error
          ? error.code === "ACCOUNT_SETUP"
            ? "Account setup needed"
            : "Data unavailable"
          : "Loading your data"}
      </h2>
      <p>{error?.message ?? "Reading the latest available Puncher records…"}</p>
      {error && <button onClick={retry}>Try again</button>}
    </div>
  );
}
function Badge({ status }: { status: string }) {
  return (
    <span className={`badge ${status}`}>{statusNames[status] ?? status}</span>
  );
}
function Period({ interval }: { interval: Interval }) {
  return (
    <p className="period">
      {date(interval.start)} — {date(interval.end)} <span>America/Chicago</span>
    </p>
  );
}
function HistoryTable({
  rows,
  volunteer,
}: {
  rows: History[];
  volunteer: boolean;
}) {
  return rows.length === 0 ? (
    <div className="empty">
      No {volunteer ? "volunteer events" : "shop visits"} in this reporting
      year.
    </div>
  ) : (
    <div
      className="table-wrap"
      tabIndex={0}
      role="region"
      aria-label="Scrollable records"
    >
      <table>
        <caption className="sr-only">
          {volunteer ? "Volunteer history" : "Shop history"}
        </caption>
        <thead>
          <tr>
            <th>{volunteer ? "Event" : "Visit"}</th>
            <th>Status</th>
            {!volunteer && (
              <>
                <th>Clock in</th>
                <th>Clock out</th>
              </>
            )}
            <th className="numeric">Credited hours</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id}>
              <td>
                <strong>{volunteer ? r.title : date(r.date)}</strong>
                <span className="cell-sub">
                  {volunteer
                    ? date(r.date)
                    : r.kind === "legacy"
                      ? "Legacy · no scan timestamps"
                      : "Shop attendance"}
                </span>
              </td>
              <td>
                <Badge status={r.status} />
                {r.provisionalSeconds !== null && (
                  <span className="cell-sub">
                    {hours(r.provisionalSeconds)}h provisional · uncredited
                  </span>
                )}
              </td>
              {!volunteer && (
                <>
                  <td>{time(r.startedAt)}</td>
                  <td>{time(r.endedAt)}</td>
                </>
              )}
              <td className="numeric">
                {r.recordedSeconds === null ? (
                  <span className="muted">Unknown · excluded</span>
                ) : (
                  <>
                    <strong>{hours(r.creditedSeconds)}</strong>
                    <span className="unit"> h</span>
                  </>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
function MyHours({
  data,
  goBoard,
}: {
  data: Hours;
  goBoard: (metric: string) => void;
}) {
  const [tab, setTab] = useState("shop");
  const missed = data.history.filter(
    (h) => h.status === "forfeited_missing_checkout",
  );
  const undated = data.history.filter((h) => h.date === null);
  return (
    <>
      <Period interval={data.interval} />
      <div className="stat-grid">
        <article className="stat primary">
          <h2>Shop hours</h2>
          <div className="big-number">
            {hours(data.selected.shopSeconds)}
            <span>h</span>
          </div>
          <div className="stat-bottom">
            <span>Career: {hours(data.career.shopSeconds)} h</span>
            <button className="rank-link" onClick={() => goBoard("shop")}>
              {data.ranks.shop ? "Rank #" + data.ranks.shop : "Leaderboard"}{" "}
              <Icon type="arrow" size={16} />
            </button>
          </div>
        </article>
        <article className="stat">
          <h2>Volunteer hours</h2>
          <div className="big-number">
            {hours(data.selected.volunteerSeconds)}
            <span>h</span>
          </div>
          <div className="stat-bottom">
            <span>Career: {hours(data.career.volunteerSeconds)} h</span>
            <button className="rank-link" onClick={() => goBoard("volunteer")}>
              {data.ranks.volunteer
                ? "Rank #" + data.ranks.volunteer
                : "Leaderboard"}{" "}
              <Icon type="arrow" size={16} />
            </button>
          </div>
        </article>
      </div>
      {missed.length > 0 && (
        <div className="notice">
          <div>
            <strong>
              {missed.length} missed checkout{missed.length !== 1 ? "s" : ""}
            </strong>
            <p>
              Unfinished visits earn no credit. Earlier completed visits keep
              their hours.
            </p>
          </div>
        </div>
      )}
      <section className="panel history">
        <div className="tabs" role="group" aria-label="History type">
          <button aria-pressed={tab === "shop"} onClick={() => setTab("shop")}>
            Shop visits{" "}
            <span>
              {data.history.filter((r) => r.kind !== "volunteer").length}
            </span>
          </button>
          <button
            aria-pressed={tab === "volunteer"}
            onClick={() => setTab("volunteer")}
          >
            Volunteer events{" "}
            <span>
              {data.history.filter((r) => r.kind === "volunteer").length}
            </span>
          </button>
          <button
            aria-pressed={tab === "missed"}
            onClick={() => setTab("missed")}
          >
            Missed checkouts <span>{missed.length}</span>
          </button>
        </div>
        <HistoryTable
          rows={
            tab === "missed"
              ? missed
              : data.history.filter((r) =>
                  tab === "volunteer"
                    ? r.kind === "volunteer"
                    : r.kind !== "volunteer",
                )
          }
          volunteer={tab === "volunteer"}
        />
        {undated.length > 0 && (
          <p className="table-note">
            {undated.length} undated record{undated.length !== 1 ? "s" : ""}{" "}
            excluded from totals.
          </p>
        )}
      </section>
      <AsOf value={data.asOf} />
    </>
  );
}
function AsOf({ value }: { value: string }) {
  return (
    <p className="asof">
      <span className="live-dot" /> Updated {stamp(value)} · Roster may lag
      recent changes
    </p>
  );
}
function Leaderboard({
  data,
  metric,
  setMetric,
  offset,
  setOffset,
}: {
  data: Board;
  metric: string;
  setMetric: (m: string) => void;
  offset: number;
  setOffset: (n: number) => void;
}) {
  return (
    <>
      <Period interval={data.interval} />
      <div className="board-top">
        <div className="segmented" role="group" aria-label="Leaderboard metric">
          <button
            aria-pressed={metric === "shop"}
            onClick={() => setMetric("shop")}
          >
            Shop hours
          </button>
          <button
            aria-pressed={metric === "volunteer"}
            onClick={() => setMetric("volunteer")}
          >
            Volunteer hours
          </button>
        </div>
      </div>
      {data.me && (
        <div className="your-rank">
          <div className="rank-number">#{data.me.rank}</div>
          <div>
            <span className="eyebrow">Your standing</span>
            <strong>{data.me.displayName}</strong>
          </div>
          <div className="rank-hours">
            {hours(data.me.creditedSeconds)}
            <span>credited {metric} hours</span>
          </div>
        </div>
      )}
      <section className="panel">
        <div className="panel-heading">
          <h2>Team standings</h2>
          <span className="small muted">{data.total} students</span>
        </div>
        <div
          className="table-wrap"
          tabIndex={0}
          role="region"
          aria-label="Scrollable records"
        >
          <table>
            <caption className="sr-only">{metric} hours leaderboard</caption>
            <thead>
              <tr>
                <th className="rank-col">Rank</th>
                <th>Student</th>
                <th className="numeric">
                  {metric === "shop" ? "Shop" : "Volunteer"} hours
                </th>
              </tr>
            </thead>
            <tbody>
              {data.rows.map((r, i) => (
                <tr className={r.isMe ? "me-row" : ""} key={`${offset}-${i}`}>
                  <td className="rank-col">
                    <span className={r.rank <= 3 ? "top-rank" : ""}>
                      {String(r.rank).padStart(2, "0")}
                    </span>
                  </td>
                  <td>
                    <div className="student-name">
                      <span className="avatar">
                        {r.displayName
                          .split(" ")
                          .map((n) => n[0])
                          .slice(0, 2)
                          .join("")}
                      </span>
                      <strong>{r.displayName}</strong>
                      {r.isMe && <span className="you">You</span>}
                      {!r.active && (
                        <span className="muted small">Former student</span>
                      )}
                    </div>
                  </td>
                  <td className="numeric">
                    <strong>{hours(r.creditedSeconds)}</strong>
                    <span className="unit"> h</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {data.rows.length === 0 && (
          <div className="empty">No student standings for this year.</div>
        )}
        <div className="pagination">
          <span>Exact seconds determine ranks. Ties share a rank.</span>
          <div>
            <button
              disabled={offset === 0}
              onClick={() => setOffset(Math.max(0, offset - data.limit))}
            >
              Previous
            </button>
            <span>
              {data.total ? offset + 1 : 0}–
              {Math.min(offset + data.limit, data.total)} of {data.total}
            </span>
            <button
              disabled={offset + data.limit >= data.total}
              onClick={() => setOffset(offset + data.limit)}
            >
              Next
            </button>
          </div>
        </div>
      </section>
      <AsOf value={data.asOf} />
    </>
  );
}
function StaffReports({
  token,
  year,
  expired,
  puncherUrl,
}: {
  token: string;
  year: number;
  expired: () => void;
  puncherUrl?: string;
}) {
  const [view, setView] = useState("summary"),
    [search, setSearch] = useState(""),
    [start, setStart] = useState(""),
    [end, setEnd] = useState(""),
    [memberId, setMemberId] = useState(""),
    [eventId, setEventId] = useState(""),
    [revision, setRevision] = useState(0),
    [exportError, setExportError] = useState("");
  const params = new URLSearchParams({
    year: String(year),
    view,
    ...(search ? { search } : {}),
    ...(start ? { start } : {}),
    ...(end ? { end } : {}),
    ...(memberId ? { memberId } : {}),
    ...(eventId ? { eventId } : {}),
  });
  const path = "/api/reports?" + params;
  const { data, error, loading } = useData<Report>(
    path,
    token,
    expired,
    revision,
  );
  const download = async () => {
    setExportError("");
    try {
      const r = await fetch(path + "&format=csv", {
        headers: { Authorization: `Bearer ${token}` },
        cache: "no-store",
      });
      if (!r.ok) {
        if (r.status === 401) expired();
        throw new Error((await r.json()).message);
      }
      const url = URL.createObjectURL(await r.blob());
      const a = document.createElement("a");
      a.href = url;
      a.download = `stats-${view}-${year}.csv`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (e) {
      setExportError(e instanceof Error ? e.message : "Export failed.");
    }
  };
  return (
    <>
      <p className="intro">
        Manage records and approvals in Puncher.{" "}
        {puncherUrl && (
          <a
            href={puncherUrl}
            target="_blank"
            rel="noreferrer"
            style={{ color: "var(--mint)", textDecoration: "underline" }}
          >
            Open Puncher ↗
          </a>
        )}
      </p>
      <div className="report-toolbar">
        <label>
          Report
          <select value={view} onChange={(e) => setView(e.target.value)}>
            <option value="summary">Member summaries</option>
            <option value="inside">Currently in shop</option>
            <option value="history">All activity history</option>
            <option value="events">Volunteer event rosters</option>
            <option value="forfeitures">Missed checkouts</option>
            <option value="legacy">Approved legacy history</option>
          </select>
        </label>
        <label>
          Find a member
          <input
            type="search"
            placeholder="Search by name"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </label>
        {view !== "inside" && (
          <>
            <label>
              From
              <input
                type="date"
                value={start}
                onChange={(e) => setStart(e.target.value)}
              />
            </label>
            <label>
              Through
              <input
                type="date"
                value={end}
                onChange={(e) => setEnd(e.target.value)}
              />
            </label>
          </>
        )}
        <button onClick={download} disabled={!data || loading}>
          <Icon type="download" size={17} />
          Export CSV
        </button>
      </div>
      <details className="filters">
        <summary>Member and event filters</summary>
        <div>
          <label>
            Internal member ID
            <input
              value={memberId}
              onChange={(e) => setMemberId(e.target.value)}
              placeholder="All members"
            />
          </label>
          <label>
            Event ID
            <input
              value={eventId}
              onChange={(e) => setEventId(e.target.value)}
              placeholder="All events"
            />
          </label>
        </div>
      </details>
      {exportError && (
        <p role="alert" className="error-text">
          {exportError}
        </p>
      )}
      {loading || error ? (
        <State
          loading={loading}
          error={error}
          retry={() => setRevision((v) => v + 1)}
        />
      ) : (
        data && (
          <>
            <Period interval={data.interval} />
            {view === "inside" && (
              <p className="notice">
                Currently in shop uses unexpired active visits across years.
                Date filters do not apply.
              </p>
            )}
            <section className="panel">
              <div className="panel-heading">
                <h2>
                  {view === "summary"
                    ? "Member summaries"
                    : view === "inside"
                      ? "Currently in shop"
                      : "Activity records"}
                </h2>
                <span className="muted small">{data.rows.length} records</span>
              </div>
              <div
                className="table-wrap"
                tabIndex={0}
                role="region"
                aria-label="Scrollable records"
              >
                <table>
                  <caption className="sr-only">Staff report</caption>
                  <thead>
                    <tr>
                      <th>Member</th>
                      {view === "summary" ? (
                        <>
                          <th className="numeric">Shop hours</th>
                          <th className="numeric">Volunteer hours</th>
                        </>
                      ) : (
                        <>
                          <th>Activity / date</th>
                          <th>Status</th>
                          <th className="numeric">Credited hours</th>
                        </>
                      )}
                    </tr>
                  </thead>
                  <tbody>
                    {data.rows.map((r, i) => (
                      <tr key={i}>
                        <td>
                          <strong>{r.displayName}</strong>
                          <span className="cell-sub">
                            {r.memberId}
                            {r.active === false ? " · Former member" : ""}
                          </span>
                        </td>
                        {view === "summary" ? (
                          <>
                            <td className="numeric">{hours(r.shopSeconds)}</td>
                            <td className="numeric">
                              {hours(r.volunteerSeconds)}
                            </td>
                          </>
                        ) : (
                          <>
                            <td>
                              {r.title}
                              <span className="cell-sub">
                                {date(r.date)}
                                {r.startedAt
                                  ? ` · ${time(r.startedAt)}–${time(r.endedAt)}`
                                  : ""}
                              </span>
                            </td>
                            <td>
                              <Badge status={r.status} />
                            </td>
                            <td className="numeric">
                              {r.recordedSeconds === null
                                ? "Unknown · excluded"
                                : hours(r.creditedSeconds)}
                            </td>
                          </>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {data.rows.length === 0 && (
                <div className="empty">No records match these filters.</div>
              )}
            </section>
            <p className="small muted">
              Pending, quarantined and voided records are excluded from credit.
              Undated records appear in student review history but cannot match
              a yearly staff report.
            </p>
            <AsOf value={data.asOf} />
          </>
        )
      )}
    </>
  );
}
function Login({
  config,
  signIn,
  message,
}: {
  config: Config;
  signIn: (token: string) => void;
  message: string;
}) {
  const googleRef = useRef<HTMLDivElement>(null),
    [googleError, setGoogleError] = useState("");
  useEffect(() => {
    if (config.demo || !config.googleClientId) return;
    const script = document.createElement("script");
    script.src = "https://accounts.google.com/gsi/client";
    script.async = true;
    script.onload = () => {
      const g = (window as any).google;
      g.accounts.id.initialize({
        client_id: config.googleClientId,
        hd: config.allowedDomain,
        callback: (r: any) => signIn(r.credential),
        auto_select: false,
      });
      if (googleRef.current)
        g.accounts.id.renderButton(googleRef.current, {
          theme: "filled_black",
          size: "large",
          text: "signin_with",
          shape: "rectangular",
        });
    };
    script.onerror = () =>
      setGoogleError(
        "Google sign-in could not load. Check your connection and reload.",
      );
    document.head.append(script);
    return () => {
      script.remove();
    };
  }, [config]);
  return (
    <main className="login">
      <div className="login-brand">
        <strong>STATS</strong>
      </div>
      <div className="login-content">
        <div className="login-card">
          <h2>Sign in to Stats</h2>
          <p>Use your @stmarobotics.org Google account.</p>
          {message && (
            <p role="alert" className="error-text">
              {message}
            </p>
          )}
          {config.demo ? (
            <>
              <div className="demo-tag">Synthetic local demo · Nov 2, 2026</div>
              <button
                className="mint-button"
                onClick={() => signIn("demo-alex")}
              >
                View as Alex · Student <Icon type="arrow" />
              </button>
              <button onClick={() => signIn("demo-mentor")}>
                View as Robin · Staff
              </button>
              <details>
                <summary>Access-state examples</summary>
                <button onClick={() => signIn("demo-unlinked")}>
                  Unlinked account
                </button>
                <button onClick={() => signIn("demo-casey")}>
                  Disabled former student
                </button>
              </details>
            </>
          ) : config.googleClientId ? (
            <div ref={googleRef} />
          ) : (
            <p className="error-text">
              Stats Google OAuth client is not configured. Ask the deployment
              administrator to configure this app’s client and origin.
            </p>
          )}
          {googleError && <p role="alert">{googleError}</p>}
        </div>
      </div>
    </main>
  );
}
function Portal({
  token,
  config,
  signOut,
}: {
  token: string;
  config: Config;
  signOut: (message?: string) => void;
}) {
  const [revision, setRevision] = useState(0),
    [page, setPage] = useState(location.hash.slice(1) || "hours"),
    [year, setYear] = useState<number | null>(null),
    [metric, setMetric] = useState("shop"),
    [offset, setOffset] = useState(0);
  const expired = () =>
    signOut("Your login expired. Sign in again to continue.");
  const me = useData<Me>("/api/me", token, expired, revision);
  useEffect(() => {
    const update = () => {
      const route = location.hash.slice(1);
      if (route !== "main") setPage(route || "hours");
    };
    window.addEventListener("hashchange", update);
    return () => window.removeEventListener("hashchange", update);
  }, []);
  useEffect(() => {
    if (me.data && year === null) setYear(me.data.currentYear);
    if (me.data && !me.data.student && page === "hours")
      location.hash = "reports";
  }, [me.data]);
  const selectedYear = year ?? me.data?.currentYear ?? 2027;
  const h = useData<Hours>(
    `/api/hours?year=${selectedYear}`,
    me.data?.student && page === "hours" ? token : "",
    expired,
    revision,
  );
  const b = useData<Board>(
    `/api/leaderboard?year=${selectedYear}&metric=${metric}&offset=${offset}&limit=10`,
    me.data && page === "leaderboard" ? token : "",
    expired,
    revision,
  );
  const navigate = (p: string) => {
    location.hash = p;
    setPage(p);
  };
  if (!me.data)
    return (
      <div className="access-state">
        <State
          loading={me.loading}
          error={me.error}
          retry={() => setRevision((v) => v + 1)}
        />
        <button onClick={() => signOut()}>Back to sign in</button>
      </div>
    );
  const selected = page === "hours" ? h : b,
    years = [
      ...new Set([
        selectedYear,
        me.data.currentYear,
        ...Array.from({ length: 5 }, (_, i) => me.data!.currentYear - i),
        ...(h.data?.years ?? []),
        ...(b.data?.years ?? []),
      ]),
    ].sort((a, b) => b - a);
  return (
    <div className="app-shell">
      <a href="#main" className="skip-link">
        Skip to content
      </a>
      <header className="app-header">
        <a className="brand" href={me.data.student ? "#hours" : "#reports"}>
          STATS
        </a>
        <nav aria-label="Main navigation">
          {me.data.student && (
            <a
              aria-current={page === "hours" ? "page" : undefined}
              href="#hours"
            >
              My Hours
            </a>
          )}
          <a
            aria-current={page === "leaderboard" ? "page" : undefined}
            href="#leaderboard"
          >
            Leaderboard
          </a>
          {me.data.staff && (
            <a
              aria-current={page === "reports" ? "page" : undefined}
              href="#reports"
            >
              Staff Reports
            </a>
          )}
        </nav>
        <div className="profile">
          <strong>{me.data.displayName}</strong>
          <button className="signout" onClick={() => signOut()}>
            Sign out
          </button>
        </div>
      </header>
      <main id="main" tabIndex={-1}>
        <div className="page-heading">
          <h1>
            {page === "hours"
              ? "My Hours"
              : page === "leaderboard"
                ? "Leaderboard"
                : "Staff Reports"}
          </h1>
          <label className="year-picker">
            <span>Reporting year</span>
            <select
              aria-label="Reporting year"
              value={selectedYear}
              onChange={(e) => {
                setYear(Number(e.target.value));
                setOffset(0);
              }}
            >
              {years.map((y) => (
                <option value={y} key={y}>
                  {y - 1}–{y}
                  {y === me.data!.currentYear ? " · Current" : ""}
                </option>
              ))}
            </select>
          </label>
        </div>
        {config.demo && (
          <p className="demo-banner">
            Synthetic demo · {stamp(config.demoNow!)}
          </p>
        )}
        {page === "reports" ? (
          me.data.staff ? (
            <StaffReports
              token={token}
              year={selectedYear}
              expired={expired}
              puncherUrl={config.puncherUrl}
            />
          ) : (
            <State
              loading={false}
              error={{
                code: "STAFF_ONLY",
                message: "An explicit Stats staff permission is required.",
              }}
              retry={() => navigate("hours")}
            />
          )
        ) : page === "hours" || page === "leaderboard" ? (
          selected.loading || selected.error ? (
            <State
              loading={selected.loading}
              error={selected.error}
              retry={() => setRevision((v) => v + 1)}
            />
          ) : page === "hours" && h.data ? (
            <MyHours
              data={h.data}
              goBoard={(m) => {
                setMetric(m);
                setOffset(0);
                navigate("leaderboard");
              }}
            />
          ) : (
            b.data && (
              <Leaderboard
                data={b.data}
                metric={metric}
                setMetric={(m) => {
                  setMetric(m);
                  setOffset(0);
                }}
                offset={offset}
                setOffset={setOffset}
              />
            )
          )
        ) : (
          <State
            loading={false}
            error={{ code: "NOT_FOUND", message: "This page does not exist." }}
            retry={() => navigate("leaderboard")}
          />
        )}
      </main>
    </div>
  );
}
function App() {
  const [config, setConfig] = useState<Config | null>(null),
    [configError, setConfigError] = useState(""),
    [token, setToken] = useState(""),
    [message, setMessage] = useState("");
  useEffect(() => {
    fetch("/config.json", { cache: "no-store" })
      .then((r) => {
        if (!r.ok) throw new Error();
        return r.json();
      })
      .then(setConfig)
      .catch(() =>
        setConfigError(
          "Stats configuration could not load. Reload the page or contact the deployment administrator.",
        ),
      );
  }, []);
  if (!config)
    return (
      <div className="access-state">
        <State
          loading={!configError}
          error={configError ? { code: "CONFIG", message: configError } : null}
          retry={() => location.reload()}
        />
      </div>
    );
  return token ? (
    <Portal
      token={token}
      config={config}
      signOut={(m) => {
        setToken("");
        setMessage(m ?? "");
        (window as any).google?.accounts.id.disableAutoSelect();
      }}
    />
  ) : (
    <Login
      config={config}
      signIn={(t) => {
        setToken(t);
        setMessage("");
      }}
      message={message}
    />
  );
}
createRoot(document.getElementById("root")!).render(<App />);
