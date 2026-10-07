// The labour activity schedule.
//
// One row per labour item: what it is doing, which section, what it costs, and
// the dates it inherits from the task that builds its bill line. Above it, the
// week-by-week load — how many trades are on site at once, which is the
// collision a planner is actually looking for.
//
// Nothing here is estimated. There is no man-day, no gang and no output rate,
// because a project holds none of them: a labour budget row carries the WORK
// quantity, not the hours. See activityModel.js.

import React from "react";
import { activityTotals, labourActivities, peakWeek, weeklyLoad } from "./activityModel.js";
import { EN_DASH, compact, money, num } from "./workProjectFormat.js";

const day = (d) =>
  d ? new Date(d).toLocaleDateString("en-GB", { day: "numeric", month: "short" }) : EN_DASH;

const weekOf = (t) =>
  new Date(t).toLocaleDateString("en-GB", { day: "numeric", month: "short" });

export default function WorkProjectActivity({ project, onGo, onOpenLine }) {
  const rows = React.useMemo(() => labourActivities(project), [project]);
  const totals = React.useMemo(() => activityTotals(rows), [rows]);
  const load = React.useMemo(() => weeklyLoad(rows), [rows]);
  const peak = React.useMemo(() => peakWeek(load), [load]);
  const [onlyUnscheduled, setOnlyUnscheduled] = React.useState(false);

  const shown = onlyUnscheduled ? rows.filter((r) => !r.scheduled) : rows;
  const busiest = Math.max(1, ...load.map((w) => w.count));

  if (!rows.length) {
    return (
      <div className="pj-empty">
        <b>No labour in the budget yet</b>
        <p>
          The activity schedule is built from the labour side of the Material &amp; Labour
          schedule, which arrives with the bill from QUIV or HERON, or from cost rates typed
          against each line. Price the bill and the trades appear here with the dates their
          work is programmed for.
        </p>
        <div className="pj-acts">
          <button type="button" className="ds-btn btn-o ds-btn-sm" onClick={() => onGo?.("rates")}>
            Open the budget
          </button>
        </div>
      </div>
    );
  }

  return (
    <>
      <div className="pj-kpi c4">
        <div>
          <span>Labour activities</span>
          <b>{totals.count}</b>
          <em>
            {totals.trades} {totals.trades === 1 ? "trade" : "trades"}
          </em>
        </div>
        <div>
          <span>Labour cost</span>
          <b>{compact(totals.cost)}</b>
          <em>Across every activity</em>
        </div>
        <div className={totals.unscheduled ? "warn" : ""}>
          <span>Not programmed</span>
          <b>{totals.unscheduled || EN_DASH}</b>
          <em>
            {totals.unscheduled
              ? `${compact(totals.unscheduledCost)} of labour with no dates`
              : "Every activity has dates"}
          </em>
        </div>
        <div>
          <span>Busiest week</span>
          <b>{peak ? peak.count : EN_DASH}</b>
          <em>{peak ? `${peak.count} at once from ${weekOf(peak.at)}` : "Nothing is programmed"}</em>
        </div>
      </div>

      {totals.unscheduled ? (
        <div className="pj-note">
          <div>
            <b>
              {totals.unscheduled} {totals.unscheduled === 1 ? "activity has" : "activities have"}{" "}
              no dates.
            </b>{" "}
            Their bill lines are not covered by any task, so nobody has planned when the trade
            comes. Plan the work from the bill on the PM dashboard and they fall into place.
          </div>
          <button type="button" className="ds-btn btn-o ds-btn-sm" onClick={() => onGo?.("pm")}>
            PM dashboard
          </button>
        </div>
      ) : null}

      {load.length ? (
        <div className="ac-load">
          <div className="hd">
            <b>Trades on site, week by week</b>
            <em>Two at once is a face to check, not necessarily a clash</em>
          </div>
          <div className="bars">
            {load.map((w) => (
              <span
                key={w.at}
                className={peak && w.at === peak.at ? "b pk" : "b"}
                style={{ height: `${Math.max(6, (w.count / busiest) * 100)}%` }}
                title={`${weekOf(w.at)} — ${w.count} ${w.count === 1 ? "activity" : "activities"}: ${w.trades.join(", ")}`}
              />
            ))}
          </div>
          <div className="ft">
            <span>{weekOf(load[0].at)}</span>
            <span>{weekOf(load[load.length - 1].at)}</span>
          </div>
        </div>
      ) : null}

      <div className="pj-tb">
        <div className="pj-chips">
          <button
            type="button"
            className={onlyUnscheduled ? "" : "on"}
            onClick={() => setOnlyUnscheduled(false)}
          >
            All {rows.length}
          </button>
          <button
            type="button"
            className={onlyUnscheduled ? "on" : ""}
            onClick={() => setOnlyUnscheduled(true)}
          >
            Not programmed {totals.unscheduled}
          </button>
        </div>
        <span className="tot">
          {totals.from ? (
            <>
              {day(totals.from)} {EN_DASH} {day(totals.to)}
            </>
          ) : (
            "No dates yet"
          )}
        </span>
      </div>

      <div className="ac-list" role="table">
        <div className="hd" role="row">
          <span>Activity</span>
          <span>Trade</span>
          <span className="n">Quantity</span>
          <span className="n">Cost</span>
          <span>Starts</span>
          <span>Finishes</span>
          <span className="n">Days</span>
        </div>
        {shown.map((r) => (
          <button
            type="button"
            className={r.scheduled ? "rw" : "rw un"}
            key={`${r.index}-${r.trade}`}
            onClick={() => (r.lineIndex != null ? onOpenLine?.(r.lineIndex) : null)}
          >
            <span className="ac">
              <b>{r.activity || "Untitled activity"}</b>
              {r.section ? <em>{r.section}</em> : null}
            </span>
            <span className="td">{r.trade}</span>
            <span className="n">
              {r.qty ? `${num(Math.ceil(r.qty * 100) / 100)} ${r.unit}`.trim() : EN_DASH}
            </span>
            <span className="n">{r.amount ? money(r.amount) : EN_DASH}</span>
            <span className="dt">{r.scheduled ? day(r.start) : "Not programmed"}</span>
            <span className="dt">{r.scheduled ? day(r.finish) : EN_DASH}</span>
            <span className="n">{r.days || EN_DASH}</span>
          </button>
        ))}
      </div>

      <p className="pj-foot">
        Dates come from the programme task that builds each activity&rsquo;s bill line. Durations
        are the task&rsquo;s own; there are no man-days or gang sizes here because nothing in a
        project records them {EN_DASH} a labour line carries the quantity of work, not the hours
        to do it.
      </p>
    </>
  );
}
