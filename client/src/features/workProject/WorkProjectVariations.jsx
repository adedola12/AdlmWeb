// His Variations and Final account, the other two views behind the Valuations
// tab's segmented control (work-proj.js:1608 and :1672).
//
// variationsModel.js sets out where his fixture and our data part. The one to
// know while reading this: approved and completed are two different states here
// — approved means it counts toward the contract value, completed means it has
// been built — and his screen has only the one.
//
// Raising a variation is not here. It is a measured item with a quantity, a
// rate, a reference and an approval trail, and the place that does all of that
// is the full workspace; a second form for it would be two ways to create the
// same row.

import React from "react";
import {
  accountClosed,
  againstContract,
  finalAccountRows,
  variationKpis,
  variationRows,
} from "./variationsModel.js";
import { EN_DASH, compact, money, num } from "./workProjectFormat.js";

const day = (d) => {
  if (!d) return "No date";
  const t = new Date(d);
  return Number.isFinite(t.getTime())
    ? t.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })
    : "No date";
};

/* ──────────────────────────── Variations ──────────────────────────── */

export function WorkProjectVariationsView({ project, onOpenVariation }) {
  const rows = React.useMemo(() => variationRows(project), [project]);
  const k = React.useMemo(() => variationKpis(project), [project]);

  if (!rows.length) {
    return (
      <div className="pj-empty">
        <b>No variations yet</b>
        <p>
          Architect&rsquo;s instructions, site instructions and client changes are logged as
          variations. An approved one changes the contract value and the final account.
        </p>
      </div>
    );
  }

  return (
    <>
      <div className="pj-kpi c4">
        <div>
          <span>Approved, net</span>
          <b>{money(k.net)}</b>
          <em>Moves the contract value</em>
        </div>
        <div>
          <span>Additions</span>
          <b>{money(k.additions)}</b>
          <em>{k.additionCount} approved</em>
        </div>
        <div>
          <span>Omissions</span>
          <b>{money(k.omissions)}</b>
          <em>{k.omissionCount} approved</em>
        </div>
        <div className={k.pendingCount ? "warn" : ""}>
          <span>Waiting for approval</span>
          <b>{k.pendingCount}</b>
          <em>
            {k.pendingCount ? `${compact(k.pendingValue)} not counted yet` : "None"}
          </em>
        </div>
      </div>

      <div className="pj-vars">
        {rows.map((r) => (
          <button
            type="button"
            className="vr"
            key={r.index}
            onClick={() => onOpenVariation?.(r.index)}
          >
            <span className="no">V{r.no}</span>
            <span className="ds">
              <b>{r.title}</b>
              <em>
                {[
                  r.reference || "No reference",
                  day(r.issuedAt),
                  r.qty ? `${num(r.qty)} ${r.unit}`.trim() : null,
                  // Approved but not built is money owed later, not money
                  // earned now, and the row is the only place that can say so.
                  r.status === "approved" && !r.completed ? "Not yet executed" : null,
                  r.automatic ? "Raised on lock" : null,
                ]
                  .filter(Boolean)
                  .join(" · ")}
              </em>
            </span>
            <span className={r.amount < 0 ? "n om" : "n ad"}>
              <b>
                {r.amount > 0 ? "+" : ""}
                {money(r.amount)}
              </b>
            </span>
            <span className={`pj-stage ${r.statusClass}`}>{r.statusLabel}</span>
          </button>
        ))}
      </div>

      {k.awaitingExecution ? (
        <p className="pj-foot">
          {k.awaitingExecution} approved{" "}
          {k.awaitingExecution === 1 ? "variation has" : "variations have"} not been marked
          executed, so {k.awaitingExecution === 1 ? "it counts" : "they count"} toward the
          contract value but not toward what has been earned.
        </p>
      ) : null}
    </>
  );
}

/* ─────────────────────────── Final account ─────────────────────────── */

export function WorkProjectFinalView({ project, totals, contractSum, certified }) {
  const rows = React.useMemo(() => finalAccountRows(totals), [totals]);
  const c = React.useMemo(
    () => againstContract({ total: totals?.total, contractSum, certified }),
    [totals, contractSum, certified],
  );
  const closed = accountClosed(project);

  return (
    <div className="pj-final">
      <section className="pj-card2">
        <h3>Final account · {closed ? "closed" : "live"}</h3>
        <dl className="brk">
          {rows.map((r) => (
            <div key={r.key}>
              <dt>
                {r.label}
                {/* Linked services are listed but not added: that project
                    carries its own preliminaries, contingency and VAT and is
                    valued on its own certificates. Saying so beside the figure
                    is the difference between a breakdown that adds up and one
                    that looks like it does not. */}
                {r.outside ? " (valued separately)" : ""}
              </dt>
              <dd>{money(r.value)}</dd>
            </div>
          ))}
          <div className="t">
            <dt>Final account</dt>
            <dd>{money(totals?.total)}</dd>
          </div>
        </dl>
      </section>

      <section className="pj-card2 cmp2">
        <h3>Against the contract</h3>
        <div className="big2">
          <span>Contract sum</span>
          <b>{c.contractSum ? money(c.contractSum) : EN_DASH}</b>
          {c.contractSum ? null : <em>No contract sum recorded yet</em>}
        </div>
        <div className={c.over ? "big2 over" : "big2 under"}>
          <span>{c.label}</span>
          <b>{c.difference ? money(c.difference) : EN_DASH}</b>
          <em>
            {c.contractSum
              ? `${c.percentOfContract.toFixed(1)}% of the contract`
              : "Against the estimate, not a contract"}
          </em>
        </div>
        <div className="big2">
          <span>Certified so far</span>
          <b>{money(c.certified)}</b>
          <em>{Math.round(c.certifiedShare)}% of the final account</em>
        </div>
      </section>
    </div>
  );
}
