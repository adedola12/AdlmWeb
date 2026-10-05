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
  drift = null, classicHref = "" }) {
  const locked = contractIsLocked(project);

  if (!locked) {
    return <LockedOut project={project} canEdit={canEdit} drift={drift} onGo={onGo} classicHref={classicHref} />;
  }

  return <Unlocked project={project} canEdit={canEdit} view={view} onView={onView} />;
}

/** His .pj-lock — the gate, and the checklist that explains it. */
function LockedOut({ project, canEdit, drift, onGo, classicHref = "" }) {
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
      {/* THE BUTTON USED TO NAME ONE PLACE AND GO TO ANOTHER.
          It read "Lock the contract on the classic workspace" and called
          onGo("overview") — the Overview tab of THIS workspace, which cannot
          lock anything. Somebody who had worked through the checklist pressed
          it, arrived at a summary of their own project, and had no idea where
          the lock actually was.
          Locking needs a step-up re-authentication and exists only on the
          classic workspace today, so the honest fix is to go there. When the
          lock is built here, this becomes the control rather than a link, and
          the checklist above it is already the right gate for it. */}
      {canEdit ? (
        ready ? (
          classicHref ? (
            <a className="ds-btn btn-p ds-btn-sm" href={classicHref}>
              Lock the contract on the classic workspace
            </a>
          ) : (
            // Same sentence, not a link. Without an href there is nowhere to
            // send anybody, and a dead button is what this change exists to
            // remove — but the reader still needs to be told the same thing, so
            // the wording does not change with whether we happen to have a URL.
            <p className="ds-sub">Lock the contract on the classic workspace.</p>
          )
        ) : (
          <button type="button" className="ds-btn btn-o ds-btn-sm" onClick={() => onGo?.("overview")}>
            See the project stages
          </button>
        )
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
  // What a certificate is drawn against: measured work, sums, preliminaries and
  // approved variations — not contingency, not VAT. One definition, in
  // projectTotals, so this screen and the certificate cannot disagree.
  const worksValue = Number(totals.works) || 0;

  const k = React.useMemo(
    () => valuationKpis(project, { contractSum, worksValue, progressPercent: progress }),
    [project, contractSum, worksValue, progress],
  );
  const bars = React.useMemo(
    () => certificateBars(project, { contractSum, worksValue, progressPercent: progress }),
    [project, contractSum, worksValue, progress],
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
                ? "Record progress on the bill, then raise the first certificate in the classic workspace."
                : "Nothing has been certified on this contract yet."}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
