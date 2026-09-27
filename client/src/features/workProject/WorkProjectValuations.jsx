// His Valuations tab (work-proj.js:1508-1575).
//
// WORK.md §13: "Valuations stay locked until the contract is, with a checklist
// saying why." That gate is the first thing this renders, and it is the whole
// point of the tab: before the lock there is an estimate, after it there is a
// contract sum and progress on the bill is what gets valued.

import React from "react";
import {
  VALUATION_VIEWS,
  certificateBars,
  certificateStatus,
  certificatesNewestFirst,
  contractIsLocked,
  cumulativePercent,
  lockChecklist,
  readyToLock,
  resolveValuationView,
  valuationKpis,
} from "./valuationsModel.js";
import { EN_DASH, compact, money } from "./workProjectFormat.js";
import {
  WorkProjectFinalView,
  WorkProjectVariationsView,
} from "./WorkProjectVariations.jsx";
import { Bar } from "./workProjectBits.jsx";
import { completePercent, totalsFor } from "./overviewModel.js";

const when = (d) => {
  const t = new Date(d);
  return Number.isFinite(t.getTime())
    ? t.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })
    : EN_DASH;
};

export default function WorkProjectValuations({
  project,
  canEdit = false,
  view = "certs",
  onView,
  onGo,
  drift = null,
}) {
  const locked = contractIsLocked(project);

  if (!locked) {
    return <LockedOut project={project} canEdit={canEdit} drift={drift} onGo={onGo} />;
  }

  return <Unlocked project={project} canEdit={canEdit} view={view} onView={onView} />;
}

/** His .pj-lock — the gate, and the checklist that explains it. */
function LockedOut({ project, canEdit, drift, onGo }) {
  const checks = lockChecklist(project, { drift });
  const ready = readyToLock(project);

  return (
    <div className="pj-lock">
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <rect x="4" y="11" width="16" height="10" rx="2" />
        <path d="M8 11V7a4 4 0 1 1 8 0v4" />
      </svg>
      <b>Valuations open once the contract is locked</b>
      <p>
        Locking turns the estimated total into the contract sum. From then on, progress on the
        bill is what gets valued, and quantities change only through variations.
      </p>
      <ul>
        {checks.map((c) => (
          <li key={c.key} className={c.ok ? "ok" : ""}>
            <svg viewBox="0 0 24 24" aria-hidden="true">
              {c.ok ? (
                <path d="m20 6-11 11-5-5" />
              ) : (
                <path d="M12 9v4m0 4h.01M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z" />
              )}
            </svg>
            {c.text}
          </li>
        ))}
      </ul>
      {canEdit ? (
        <button
          type="button"
          className={ready ? "ds-btn btn-p ds-btn-sm" : "ds-btn btn-o ds-btn-sm"}
          onClick={() => onGo?.("overview")}
        >
          {ready ? "Lock the contract on the full workspace" : "See the project stages"}
        </button>
      ) : null}
    </div>
  );
}

function Unlocked({ project, canEdit, view, onView }) {
  const mode = resolveValuationView(view);
  const totals = React.useMemo(() => totalsFor(project), [project]);
  // completePercent is value-weighted and returns 0 before the contract is
  // locked — which is his rule, and harmless here because this branch only
  // renders once it IS locked.
  const progress = React.useMemo(() => completePercent(project), [project]);
  const contractSum = Number(project?.contract?.contractSum) || totals.total;

  const k = React.useMemo(
    () => valuationKpis(project, { contractSum, progressPercent: progress }),
    [project, contractSum, progress],
  );
  const bars = React.useMemo(
    () => certificateBars(project, { contractSum, progressPercent: progress }),
    [project, contractSum, progress],
  );
  const certs = React.useMemo(() => certificatesNewestFirst(project), [project]);
  const settings = project?.valuationSettings || {};

  return (
    <>
      <div className="pj-kpi">
        <div>
          <span>Contract sum</span>
          <b>{compact(k.contractSum)}</b>
          <em>Locked {when(project?.contract?.lockedAt)}</em>
        </div>

        <div>
          <span>Certified to date</span>
          <b>{compact(k.certified)}</b>
          <Bar percent={k.certifiedPercent} tone="ok" />
          <em>{Math.round(k.certifiedPercent)}% of the contract</em>
        </div>

        <div>
          <span>Retention held</span>
          <b>{compact(k.retained)}</b>
          <em>{Number(settings.retentionPct) || 0}% of each certificate</em>
        </div>

        <div>
          <span>Paid to date</span>
          <b>{compact(k.paid)}</b>
          <em>After VAT and WHT</em>
        </div>

        <div className={k.notYetValued >= 1 ? "warn" : ""}>
          <span>Work done now</span>
          <b>{Math.round(k.progress)}%</b>
          <em>
            {k.notYetValued >= 1
              ? `${Math.round(k.notYetValued)}% not yet valued`
              : "All valued"}
          </em>
        </div>
      </div>

      <div className="pj-tb">
        <div className="pj-seg" role="group" aria-label="View">
          {VALUATION_VIEWS.map((v) => {
            const count =
              v.key === "certs"
                ? k.count
                : v.key === "variations"
                  ? (project?.variations || []).length
                  : null;
            return (
              <button
                key={v.key}
                type="button"
                aria-pressed={mode === v.key}
                onClick={() => onView?.(v.key)}
              >
                {v.label}
                {count != null ? <em>{count}</em> : null}
              </button>
            );
          })}
        </div>
        <span className="pj-by">
          Retention {Number(settings.retentionPct) || 0}% · VAT {Number(settings.vatPct) || 0}% ·
          WHT {Number(settings.withholdingPct) || 0}%
        </span>
      </div>

      {mode === "certs" ? (
        <Certificates bars={bars} certs={certs} contractSum={contractSum} canEdit={canEdit} />
      ) : mode === "variations" ? (
        <WorkProjectVariationsView project={project} />
      ) : (
        <WorkProjectFinalView
          project={project}
          totals={totals}
          contractSum={contractSum}
          certified={k.certified}
        />
      )}
    </>
  );
}

function Certificates({ bars, certs, contractSum, canEdit }) {
  return (
    <div className="pj-vals">
      <div className="ch" aria-hidden="true">
        {bars.map((b) => (
          <div className={b.key === "now" ? "c now" : "c"} key={b.key}>
            <i style={{ height: `${b.percent}%` }} className={b.status} />
            <span>{b.label}</span>
          </div>
        ))}
      </div>

      <div className="ls">
        {certs.length ? (
          certs.map((c) => {
            const st = certificateStatus(c);
            return (
              <div className="vr" key={c.number}>
                <span className="no">IPC {c.number}</span>
                <span className="ds">
                  <b>{when(c.date)}</b>
                  <em>
                    Cumulative {Math.round(cumulativePercent(c, contractSum))}% ·{" "}
                    {compact(c.cumulativeValue)}
                  </em>
                </span>
                <span className="n">
                  <em>This certificate</em>
                  <b>{money(c.netPayable)}</b>
                </span>
                <span className={`pj-stage v-${st.key}`}>{st.label}</span>
              </div>
            );
          })
        ) : (
          <div className="pj-empty sm">
            <b>No valuations yet</b>
            <p>
              {canEdit
                ? "Record progress on the bill, then raise the first certificate in the full workspace."
                : "Nothing has been certified on this contract yet."}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
