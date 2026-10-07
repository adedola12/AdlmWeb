// The Budget, in HERON 3.0's shape (View/MaterialView.xaml).
//
// WHY THIS AND NOT THE COLUMNS
//
// The material/labour/plant columns answer "what do I have to buy", which is a
// procurement question. HERON's Budget answers the one a QS opens a budget for:
// is this line making money, and where am I losing it. It does that per BILL
// ITEM rather than per resource class, which is why a QS reads it without being
// taught.
//
// Its three figures across the top are project cost (material + labour),
// take-off value (the BoQ), and the difference — which it calls overhead +
// profit and colours by sign. Then one card per bill item: item number,
// description, and a margin chip whose tooltip is HERON's own wording.
//
// Both this and the columns read budgetModel.js, so the two views cannot come
// to disagree about a total.
//
// The procurement tick is kept, on the material rows inside each card. Moving
// to HERON's shape should not cost a QS the ability to mark what has been
// bought.

import React from "react";
import { budgetByBillLine, heronTotals, withRowProcured } from "./budgetModel.js";
import { EN_DASH, money, num } from "./workProjectFormat.js";

const pct = (v) => `${v >= 0 ? "" : "−"}${Math.abs(v).toFixed(1)}%`;

export default function WorkProjectBudgetHeron({
  project,
  canEdit = false,
  saving = false,
  onSave,
  onGo,
}) {
  const t = React.useMemo(() => heronTotals(project), [project]);
  const { lines, orphans } = React.useMemo(() => budgetByBillLine(project), [project]);

  if (!lines.length && !orphans.length) {
    return (
      <div className="pj-empty">
        <b>No budget yet</b>
        <p>
          The budget is what the job costs you, beside what it is billed at. It comes from the
          Material &amp; Labour schedule, from QUIV or HERON, or from cost rates typed against
          each line.
        </p>
        <button type="button" className="ds-btn btn-o ds-btn-sm" onClick={() => onGo?.("bill")}>
          Back to the bill
        </button>
      </div>
    );
  }

  return (
    <>
      {/* HERON's three KPIs (MaterialView.xaml:90-120). */}
      <div className="pj-kpi c4">
        <div>
          <span>Project cost</span>
          <b>{money(t.cost)}</b>
          <em>Material, labour and plant</em>
        </div>
        <div>
          <span>Take-off value</span>
          <b>{t.boq ? money(t.boq) : EN_DASH}</b>
          <em>{t.boq ? "What the bill is priced at" : "The bill is not priced yet"}</em>
        </div>
        <div className={t.boq && !t.isProfit ? "warn" : ""}>
          <span>Overhead + profit</span>
          <b>{t.boq ? money(t.overheadProfit) : EN_DASH}</b>
          <em>
            {!t.boq
              ? "Needs a priced bill"
              : t.isProfit
                ? `${pct(t.marginPercent)} of the bill`
                : `Losing ${pct(Math.abs(t.marginPercent))} of the bill`}
          </em>
        </div>
        <div>
          <span>Lines costed</span>
          <b>{lines.length}</b>
          <em>{orphans.length ? `${orphans.length} not on a bill line` : "All on a bill line"}</em>
        </div>
      </div>

      {!t.boq ? (
        <div className="pj-note">
          <div>
            <b>The bill is not priced, so there is no margin to show yet.</b> The costs below are
            real; what each line earns cannot be known until the bill carries rates.
          </div>
        </div>
      ) : null}

      {/* .pj-budline, not .pj-vars .vr.
          ds-work-proj.css:637 was written FOR this card — its own frame, its own
          header grid, no inner 420px scroll — and says in its own comment that
          the markup used to borrow the variations row and force display:block
          over it inline. The stylesheet landed and the markup never changed, so
          every HERON budget card has been rendering as a four-column variations
          row ever since. Same shape as .pj-model: a class written and never used.
          .pj-budline carries its own spacing (the + rule), so there is no list
          wrapper here. */}
      <div>
        {lines.map((l) => (
          <div className="pj-budline" key={l.code}>
            {/* His item header band (MaterialView.xaml:306). */}
            <div className="hd">
              {/* The bill's serial number, which is what a QS matches on. It used
                  to print `code`, and on a QUIV bill that is a hash
                  (e48c57473c148a56) — unreadable and impossible to find on paper. */}
              <span className="no">{l.sn}</span>
              <span className="ds">
                <b>{l.description || "Untitled line"}</b>
                <em>
                  {[
                    l.qty ? `${num(l.qty)} ${l.unit}`.trim() : null,
                    l.value ? `billed ${money(l.value)}` : "not priced",
                    `costs ${money(l.cost)}`,
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                </em>
              </span>
              {l.marginPercent == null ? (
                <span className="tag">No margin yet</span>
              ) : (
                <span
                  className={l.margin >= 0 ? "pj-stage s-final" : "pj-stage v-rejected"}
                  title="Proposed profit margin = (BoQ rate − material − labour) ÷ BoQ rate"
                >
                  {pct(l.marginPercent)}
                </span>
              )}
            </div>

            <div className="pj-bud">
              {l.rows.map((r) => (
                // Only a material is bought, so only a material row is tickable.
                <label className="br" key={`${r.kind}-${r.index}`}>
                  {canEdit && r.kind === "material" ? (
                    <input
                      type="checkbox"
                      checked={r.procured}
                      disabled={saving}
                      aria-label={`Bought: ${r.name}`}
                      onChange={(e) => onSave?.(withRowProcured(project, r.index, e.target.checked))}
                    />
                  ) : (
                    <span />
                  )}
                  {/* Three cells, not a name with the quantity tucked under it:
                      name, how much, what it costs, so the figures line up down
                      the card and two materials can be compared at a glance. */}
                  <span className="ds">
                    <b>{r.name}</b>
                  </span>
                  <span className="q">
                    {r.qty ? `${num(Math.ceil(r.qty))} ${r.unit}`.trim() : EN_DASH}
                  </span>
                  <span className="n">{r.amount ? money(r.amount) : "Not priced"}</span>
                </label>
              ))}
            </div>
          </div>
        ))}
      </div>

      {orphans.length ? (
        <p className="pj-foot">
          {orphans.length} budget {orphans.length === 1 ? "row belongs" : "rows belong"} to no bill
          line — {money(orphans.reduce((a, r) => a + r.amount, 0))} of cost that is real but
          unplaced. It is counted in the project cost above.
        </p>
      ) : null}
    </>
  );
}
