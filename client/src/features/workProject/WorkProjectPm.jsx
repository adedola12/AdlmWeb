// His PM dashboard (work-proj.js:1263-1360).
//
// WORK.md §13: "PM dashboard is not Time Pro. Tasks (created from bill
// sections, not one per line), risks, issues, a timeline with today's line, and
// plain-language schedule figures. Time Pro is desktop (side one)."
//
// The arithmetic is pmModel.js. This is his chrome: three views behind a
// segmented control, five figures across the top, then the Gantt or a register.

import React from "react";
import {
  PM_VIEWS,
  issueSeverity,
  pmKpis,
  resolvePmView,
  riskSeverity,
  taskIsLate,
  taskProgress,
  timelineScale,
} from "./pmModel.js";
import { EN_DASH, compact } from "./workProjectFormat.js";
import { Bar } from "./workProjectBits.jsx";

const short = (d) => {
  const t = new Date(d);
  return Number.isFinite(t.getTime())
    ? t.toLocaleDateString("en-GB", { day: "numeric", month: "short" })
    : EN_DASH;
};

export default function WorkProjectPm({
  project,
  canEdit = false,
  view = "timeline",
  onView,
  onGo,
  now: nowProp,
}) {
  // Fixed for the life of the mount. A fresh Date() on every render would make
  // every memo below recompute, and would also mean two figures on the same
  // screen could be drawn against two different "todays".
  const now = React.useMemo(() => nowProp || new Date(), [nowProp]);
  const items = React.useMemo(
    () => (Array.isArray(project?.items) ? project.items : []),
    [project],
  );
  // Its own memo: the `|| {}` would otherwise hand a new object to the memos
  // below on every render, and they would all recompute.
  const pm = React.useMemo(
    () => project?.pm || project?.projectManagement || {},
    [project],
  );
  const tasks = React.useMemo(() => (Array.isArray(pm.tasks) ? pm.tasks : []), [pm]);
  const risks = React.useMemo(() => (Array.isArray(pm.risks) ? pm.risks : []), [pm]);
  const issues = React.useMemo(() => (Array.isArray(pm.issues) ? pm.issues : []), [pm]);

  const mode = resolvePmView(view);
  const k = React.useMemo(
    () => pmKpis({ tasks, items, risks, issues, now }),
    [tasks, items, risks, issues, now],
  );
  const scale = React.useMemo(
    () => timelineScale(tasks, { start: pm.projectStart, finish: pm.projectFinish, now }),
    [tasks, pm, now],
  );

  if (!tasks.length) {
    return (
      <div className="pj-empty big">
        <b>Plan the work for {project?.name || "this project"}</b>
        <p>
          Tasks come from the bill&rsquo;s sections, so each one already knows what it is worth.
          Progress on the bill moves them.
        </p>
        <p className="ds-sub">
          {canEdit
            ? "Planning is done in the full workspace for now."
            : "No tasks have been planned yet."}
        </p>
        {canEdit ? (
          <button type="button" className="ds-btn btn-o ds-btn-sm" onClick={() => onGo?.("bill")}>
            Back to the bill
          </button>
        ) : null}
      </div>
    );
  }

  return (
    <>
      <div className="pj-tb">
        <div className="pj-seg" role="group" aria-label="View">
          {PM_VIEWS.map((v) => {
            const count =
              v.key === "risks"
                ? k.openRisks.length
                : v.key === "issues"
                  ? k.openIssues.length
                  : tasks.length;
            return (
              <button
                key={v.key}
                type="button"
                aria-pressed={mode === v.key}
                onClick={() => onView?.(v.key)}
              >
                {v.label} <em>{count}</em>
              </button>
            );
          })}
        </div>
      </div>

      <div className="pj-kpi">
        <div>
          <span>Complete</span>
          <b>{Math.round(k.complete)}%</b>
          <Bar percent={k.complete} tone="ok" />
          <em>Planned by today: {Math.round(k.planned)}%</em>
        </div>

        <div className={k.scheduleWarn ? "warn" : ""}>
          <span>Schedule</span>
          <b>{k.onTime ? "On time" : `${k.behindPercent}% behind`}</b>
          <em>Work done ÷ work planned = {k.spi.toFixed(2)}</em>
        </div>

        <div className={k.uncoveredIndexes.length ? "warn" : ""}>
          <span>Bill not in any task</span>
          <b>{k.uncoveredIndexes.length ? compact(k.uncoveredValue) : "None"}</b>
          <em>
            {k.uncoveredIndexes.length
              ? `${k.uncoveredIndexes.length} line${k.uncoveredIndexes.length > 1 ? "s" : ""}`
              : "Every line is in a task"}
          </em>
        </div>

        <div className={k.overdue.length ? "warn" : ""}>
          <span>Overdue tasks</span>
          <b>{k.overdue.length}</b>
          <em>{k.overdue.length ? k.overdue[0].name : "None past their end date"}</em>
        </div>

        <div>
          <span>Open risks · issues</span>
          <b>
            {k.openRisks.length} · {k.openIssues.length}
          </b>
          <em>{k.likelyAndCostly.length} likely and costly</em>
        </div>
      </div>

      {mode === "timeline" ? (
        <Timeline tasks={tasks} items={items} scale={scale} now={now} />
      ) : (
        <Register
          kind={mode}
          rows={mode === "risks" ? risks : issues}
        />
      )}

      {scale ? (
        <p className="pj-foot">
          {short(scale.from)} to {short(scale.to)} · the blue line is today. Task progress is read
          from its bill lines — record it on the Bill.
        </p>
      ) : null}
    </>
  );
}

function Timeline({ tasks, items, scale, now }) {
  if (!scale) {
    return (
      <div className="pj-empty sm">
        <b>No dates to draw</b>
        <p>These tasks have no start or finish, so there is no timeline to place them on.</p>
      </div>
    );
  }

  return (
    <div className="pj-gantt">
      <div className="gh">
        <span />
        <div className="mo">
          {scale.months.map((m) => (
            <i key={`${m.label}-${m.left}`} style={{ left: `${m.left}%` }}>
              {m.label}
            </i>
          ))}
        </div>
      </div>

      {tasks.map((t, i) => {
        const tp = taskProgress(t, items);
        const late = taskIsLate(t, items, now);
        const left = scale.pos(t.startDate);
        const width = Math.max(1.5, scale.pos(t.endDate) - left);
        const cls = ["gr", late ? "late" : "", t.isMilestone ? "ms" : ""].filter(Boolean).join(" ");
        return (
          <div className={cls} key={t.taskId || `${t.name}-${i}`}>
            <span className="nm">
              <b>
                {String(t.priority || "").toLowerCase() === "critical" || t.criticalPath ? (
                  <i className="crit" title="Critical" />
                ) : null}
                {t.name || "Untitled task"}
              </b>
              <em>
                {t.isMilestone
                  ? `Milestone · ${short(t.startDate)}`
                  : [t.assignedTo, `${short(t.startDate)}–${short(t.endDate)}`]
                      .filter(Boolean)
                      .join(" · ")}
              </em>
            </span>
            <span className="gt">
              <i className="today" style={{ left: `${scale.today}%` }} />
              {t.isMilestone ? (
                <i className="dm" style={{ left: `${left}%` }} />
              ) : (
                <i className="bx" style={{ left: `${left}%`, width: `${width}%` }}>
                  <i style={{ width: `${tp}%` }} />
                </i>
              )}
            </span>
            <span className="pc">
              {t.isMilestone ? (tp >= 100 ? "Met" : EN_DASH) : `${tp}%`}
            </span>
          </div>
        );
      })}
    </div>
  );
}

function Register({ kind, rows }) {
  const list = Array.isArray(rows) ? rows : [];
  if (!list.length) {
    return (
      <div className="pj-empty sm">
        <b>No {kind} recorded</b>
        <p>Add one when something could affect time or cost.</p>
      </div>
    );
  }

  return (
    <div className="pj-reg">
      {list.map((r, i) => {
        const sev = kind === "risks" ? riskSeverity(r) : issueSeverity(r);
        return (
          <div className="rg" key={r.riskId || r.issueId || `${r.title}-${i}`}>
            <i className={`sv ${sev}`} />
            <div className="ds">
              <b>{r.title || "Untitled"}</b>
              <em>
                {kind === "risks"
                  ? `Likelihood ${r.probability || EN_DASH} · impact ${r.impact || EN_DASH}`
                  : `Severity ${r.severity || EN_DASH}`}
                {" · "}
                {r.owner || "No owner"}
                {kind === "risks" && r.mitigation ? ` · ${r.mitigation}` : ""}
              </em>
            </div>
            <span className="tag">{r.status || "open"}</span>
          </div>
        );
      })}
    </div>
  );
}
