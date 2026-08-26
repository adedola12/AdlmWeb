// The programme — as a timeline of what has actually been recorded.
//
// A necessary distinction, because his screen and ours are not the same thing
// and pretending otherwise would be the dishonest kind of port.
//
// HIS programme is PLANNED: "sequenced from the same quantities, no durations
// typed". That means deriving a duration for every bill line from its quantity
// and a gang output, then ordering the lot by trade dependency. It needs a
// scheduling engine, and we do not have one. Nothing in this repo turns a
// quantity into a duration.
//
// OURS is ACTUAL. TimeMgtTask records what a gang did: the item of work, the
// trade, skilled and unskilled hours, output, and a start and end date. That
// is a real programme of real work, and until now the only way to read it was
// as a list of rows sorted by date. Seeing it on a timeline is the thing that
// was missing, and every bar on it is a fact rather than an estimate.
//
// So the screen says which it is, in its own subheading, rather than letting
// somebody mistake a site record for a plan.
//
// His markup: .wk-head / .wk-panel / .wk-ph / .wk-bar for the bars, .dsh-stats
// for the figures.

import React from "react";
import { Link } from "react-router-dom";
import { apiAuthed } from "../api.js";
import { useAuth } from "../store.jsx";

const num = (n) => new Intl.NumberFormat("en-NG", { maximumFractionDigits: 1 }).format(Number(n) || 0);

// Midnight on the day of `d`, or null if there is no usable date.
//
// The null check in front is not defensive padding. `new Date(null)` returns
// the EPOCH rather than an invalid date — only `undefined` is invalid — so a
// task with taskStartDate: null was being placed on 1 January 1970. That put
// the timeline's span at twenty thousand days and squashed every real bar to a
// sliver at the far right. Empty strings do the same thing on some engines.
const dayOf = (d) => {
  if (d === null || d === undefined || d === "") return null;
  const t = new Date(d);
  return Number.isNaN(t.getTime()) ? null : new Date(t.getFullYear(), t.getMonth(), t.getDate());
};

const shortDate = (d) =>
  d ? new Date(d).toLocaleDateString("en-GB", { day: "numeric", month: "short" }) : "";

const longDate = (d) =>
  d
    ? new Date(d).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" })
    : "";

const DAY = 864e5;

export default function DsWorkProgramme() {
  const { accessToken } = useAuth();
  const [tasks, setTasks] = React.useState(null);
  const [failed, setFailed] = React.useState(false);
  const [trade, setTrade] = React.useState("");

  React.useEffect(() => {
    if (!accessToken) return undefined;
    let alive = true;
    apiAuthed("/api/tasks", { token: accessToken, params: { limit: 500 } })
      .then((d) => alive && setTasks(Array.isArray(d.tasks) ? d.tasks : []))
      .catch(() => alive && setFailed(true));
    return () => {
      alive = false;
    };
  }, [accessToken]);

  const view = React.useMemo(() => {
    if (!tasks) return null;

    // A task without a start is not on a programme. It is still in the log,
    // and the count says how many were left out rather than quietly dropping
    // them.
    const dated = [];
    let undated = 0;
    for (const t of tasks) {
      const start = dayOf(t.taskStartDate);
      if (!start) {
        undated += 1;
        continue;
      }
      // A task with no end is a one-day task, which is what a daily record
      // usually is.
      const end = dayOf(t.taskEndDate) || start;
      dated.push({
        ...t,
        start,
        end: end < start ? start : end,
        days: Math.max(1, Math.round((Math.max(end, start) - start) / DAY) + 1),
        net: Math.max(0, (Number(t.hoursWorked) || 0) - (Number(t.breakHours) || 0)),
      });
    }

    if (!dated.length) return { dated: [], undated, trades: [], span: null };

    const min = new Date(Math.min(...dated.map((t) => t.start.getTime())));
    const max = new Date(Math.max(...dated.map((t) => t.end.getTime())));
    const span = Math.max(1, Math.round((max - min) / DAY) + 1);

    const trades = [...new Set(dated.map((t) => t.trade).filter(Boolean))].sort();

    return { dated, undated, trades, span, min, max };
  }, [tasks]);

  if (failed) {
    return (
      <div className="dsh-in">
        <p className="sub">The programme could not be loaded just now. Please refresh.</p>
      </div>
    );
  }
  if (!view) {
    return (
      <div className="dsh-in">
        <p className="sub">Loading the programme…</p>
      </div>
    );
  }

  const shown = trade ? view.dated.filter((t) => t.trade === trade) : view.dated;
  const ordered = [...shown].sort((a, b) => a.start - b.start || a.end - b.end);

  const hours = shown.reduce((n, t) => n + t.net, 0);
  const people = shown.reduce(
    (n, t) => n + (Number(t.skilledLabor) || 0) + (Number(t.unskilledLabor) || 0),
    0,
  );

  // Each bar is positioned as a percentage of the whole span, so the timeline
  // reflows with the column instead of needing a fixed pixel scale.
  const offset = (d) => ((d - view.min) / DAY / view.span) * 100;
  const width = (t) => Math.max(1.2, (t.days / view.span) * 100);

  return (
    <div className="dsh-in">
      <div className="wk-head">
        <div>
          <h1>Programme</h1>
          <p>
            What has actually been recorded on site, on a timeline. These are days that
            happened, not a plan: a programme sequenced from quantities needs a scheduling
            engine, and that is still ahead of us.
          </p>
        </div>
        <div className="wk-acts">
          <Link className="btn btn-p btn-sm" to="/time-management">
            Record a day
          </Link>
        </div>
      </div>

      {!view.dated.length ? (
        <section className="wk-panel">
          <div style={{ padding: "16px 20px" }}>
            <p style={{ margin: 0, fontSize: 14, color: "var(--ink-3)" }}>
              {view.undated
                ? `${view.undated} task${view.undated === 1 ? " has" : "s have"} been recorded without a start date, so there is nothing to place on a timeline yet.`
                : "Nothing recorded yet. Log a day's work and it appears here as a bar."}
            </p>
            <Link className="btn btn-p btn-sm" to="/time-management" style={{ marginTop: 16 }}>
              Record a day
            </Link>
          </div>
        </section>
      ) : (
        <>
          <div className="dsh-stats">
            <div className="dsh-stat">
              <span className="k">Days on site</span>
              <b>{view.span}</b>
              <span className="sub">
                {shortDate(view.min)} to {shortDate(view.max)}
              </span>
            </div>
            <div className="dsh-stat">
              <span className="k">Tasks recorded</span>
              <b>{num(shown.length)}</b>
              <span className="sub">
                {view.trades.length} trade{view.trades.length === 1 ? "" : "s"}
              </span>
            </div>
            <div className="dsh-stat">
              <span className="k">Hours worked</span>
              <b>{num(hours)}</b>
              <span className="sub">net of breaks</span>
            </div>
            <div className="dsh-stat">
              <span className="k">Labour on the books</span>
              <b>{num(people)}</b>
              <span className="sub">skilled and unskilled, summed per task</span>
            </div>
          </div>

          {view.trades.length > 1 && (
            <div className="wk-bar">
              <div className="wk-tabs">
                <button
                  type="button"
                  className={trade === "" ? "on" : ""}
                  onClick={() => setTrade("")}
                >
                  All trades
                </button>
                {view.trades.map((t) => (
                  <button
                    key={t}
                    type="button"
                    className={trade === t ? "on" : ""}
                    onClick={() => setTrade(t)}
                  >
                    {t}
                  </button>
                ))}
              </div>
            </div>
          )}

          <section className="wk-panel">
            <div className="wk-ph">
              <h2>{trade || "Every trade"}</h2>
              <span className="wk-locnote">
                {shortDate(view.min)} to {shortDate(view.max)} · {view.span} days
              </span>
            </div>
            <div style={{ padding: "8px 20px 18px" }}>
              {ordered.map((t, i) => (
                <div
                  key={t.taskKey || t.iD || i}
                  style={{
                    display: "grid",
                    gridTemplateColumns: "minmax(160px, 260px) 1fr",
                    gap: 16,
                    alignItems: "center",
                    padding: "9px 0",
                    borderBottom: "1px solid var(--line)",
                  }}
                >
                  <div style={{ minWidth: 0 }}>
                    <b
                      style={{
                        display: "block",
                        fontSize: 13.5,
                        fontWeight: 500,
                        color: "var(--ink)",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {t.itemOfWork || "Untitled task"}
                    </b>
                    <span style={{ fontSize: 12, color: "var(--ink-3)" }}>
                      {[
                        t.trade,
                        t.days === 1 ? "1 day" : `${t.days} days`,
                        t.output ? `${num(t.output)} ${t.outputUnit || ""}`.trim() : null,
                      ]
                        .filter(Boolean)
                        .join(" · ")}
                    </span>
                  </div>

                  <div
                    style={{
                      position: "relative",
                      height: 22,
                      background: "var(--bg-inset)",
                      borderRadius: 6,
                    }}
                    title={`${longDate(t.start)} to ${longDate(t.end)}`}
                  >
                    <div
                      style={{
                        position: "absolute",
                        left: `${offset(t.start)}%`,
                        width: `${width(t)}%`,
                        top: 3,
                        bottom: 3,
                        minWidth: 4,
                        background: "var(--action)",
                        borderRadius: 5,
                      }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </section>

          {view.undated > 0 && (
            <p className="sub">
              {view.undated} task{view.undated === 1 ? "" : "s"} could not be placed, having no
              start date recorded. {view.undated === 1 ? "It is" : "They are"} still in the log.
            </p>
          )}
        </>
      )}
    </div>
  );
}
