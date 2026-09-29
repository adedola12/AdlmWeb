// His Budget and Buy schedule, the other two views behind the Rates tab's
// segmented control (work-proj.js:1209 and :1155).
//
// budgetModel.js sets out at length where his fixture and our data part — the
// short version is that he derives a budget from RateGen build-ups at read time
// and we store one, so these read budgetItems rather than recomputing it.
//
// His one change on these screens is here: ticking a material as bought. A
// budget row's cost rate, its supplier and its target date are all editable in
// the full workspace, and a second place to type a cost rate is how two screens
// come to disagree about what a job costs.

import React from "react";
import {
  budgetColumns,
  budgetTotals,
  buyKpis,
  buyRows,
  withRowProcured,
} from "./budgetModel.js";
import { clampLeadDays } from "../../lib/buySchedule.js";
import { EN_DASH, compact, money, num } from "./workProjectFormat.js";
import { Donut } from "./workProjectBits.jsx";

const day = (d) => {
  if (!d) return EN_DASH;
  const t = d instanceof Date ? d : new Date(d);
  return Number.isFinite(t.getTime())
    ? t.toLocaleDateString("en-GB", { day: "numeric", month: "short" })
    : EN_DASH;
};

/* ───────────────────────────── Budget ───────────────────────────── */

export function WorkProjectBudgetView({ project, canEdit = false, saving = false, onSave, onGo }) {
  const cols = React.useMemo(() => budgetColumns(project), [project]);
  const t = React.useMemo(() => budgetTotals(project), [project]);

  // Whether there IS a budget is a question about ROWS, not about value. A
  // QUIV save writes the Material & Labour schedule with quantities long before
  // anything is priced, so testing the total hid a real budget — 271 rows, every
  // one linked to its bill line — behind "No budget yet" on an unpriced job.
  const rowCount = cols.material.length + cols.labour.length + cols.plant.length;

  if (!rowCount) {
    return (
      <div className="pj-empty">
        <b>No budget yet</b>
        <p>
          The budget is what the job costs you, beside what it is billed at. It comes from the
          Material &amp; Labour schedule, from QUIV or HERON, or from cost rates typed against each
          line.
        </p>
        <button type="button" className="ds-btn btn-o ds-btn-sm" onClick={() => onGo?.("bill")}>
          Back to the bill
        </button>
      </div>
    );
  }

  return (
    <>
      {!t.all ? (
        <div className="pj-note">
          <div>
            <b>
              {rowCount} {rowCount === 1 ? "row" : "rows"} of material and labour, measured
              from the bill.
            </b>{" "}
            None of it carries a cost rate yet, so every figure below is a quantity
            rather than money. Price the bill and the budget follows.
          </div>
        </div>
      ) : null}

      <div className="pj-ov c">
        <section className="pj-card2">
          <Donut
            percent={t.materialShare}
            label="Materials"
            sub={`Materials ${compact(t.material)} · Labour ${compact(t.labour)}${
              t.plant ? ` · Plant ${compact(t.plant)}` : ""
            }`}
          />
        </section>
        <section className="pj-card2">
          <Donut
            percent={t.procuredShare}
            label="Procured"
            tone="ok"
            sub={`${compact(t.bought)} of ${compact(t.material)} bought`}
          />
        </section>
      </div>

      <div className="wk-two">
        <Column
          title="Materials"
          note={canEdit ? "Tick what has been bought" : `${t.counts.material} rows`}
          rows={cols.material}
          tickable={canEdit}
          saving={saving}
          onTick={(index, next) => onSave?.(withRowProcured(project, index, next))}
        />
        <Column title="Labour" note="Gang days" rows={cols.labour} unitWord="days" />
      </div>

      {/* Plant is its own panel, not a share of labour. TakeoffProject's own
          comment on resourceItems is why: folded in, it would be added to the
          single Labour row, and a plant figure hidden inside labour is one a QS
          cannot check. */}
      {cols.plant.length ? (
        <div className="wk-two">
          <Column title="Plant" note="Hire and running" rows={cols.plant} unitWord="days" />
          <section className="wk-panel">
            <div className="wk-ph">
              <h2>What this adds up to</h2>
              <span className="wk-locnote">Cost, not price</span>
            </div>
            <div className="pj-bud">
              {[
                ["Materials", t.material],
                ["Labour", t.labour],
                ["Plant", t.plant],
              ].map(([label, value]) => (
                <div className="br" key={label}>
                  <span />
                  <span className="ds">
                    <b>{label}</b>
                    <em>{Math.round((value / t.all) * 100)}% of the budget</em>
                  </span>
                  <span className="n">{money(value)}</span>
                </div>
              ))}
              <div className="br">
                <span />
                <span className="ds">
                  <b>Total cost</b>
                  <em>Before overheads and profit</em>
                </span>
                <span className="n">{money(t.all)}</span>
              </div>
            </div>
          </section>
        </div>
      ) : null}
    </>
  );
}

function Column({ title, note, rows, tickable = false, saving = false, onTick, unitWord }) {
  return (
    <section className="wk-panel">
      <div className="wk-ph">
        <h2>{title}</h2>
        <span className="wk-locnote">{note}</span>
      </div>
      {rows.length ? (
        <div className="pj-bud">
          {rows.map((r) =>
            tickable ? (
              <label className="br" key={r.index}>
                <input
                  type="checkbox"
                  checked={r.procured}
                  disabled={saving}
                  aria-label={`Bought: ${r.name}`}
                  onChange={(e) => onTick?.(r.index, e.target.checked)}
                />
                <BudRow row={r} unitWord={unitWord} />
                <span className="n">{r.amount ? money(r.amount) : "Not priced"}</span>
              </label>
            ) : (
              <div className="br" key={r.index}>
                <span />
                <BudRow row={r} unitWord={unitWord} />
                <span className="n">{r.amount ? money(r.amount) : "Not priced"}</span>
              </div>
            ),
          )}
        </div>
      ) : (
        <div className="pj-empty sm">
          <b>Nothing under {title.toLowerCase()}</b>
          <p>The budget for this project records no {title.toLowerCase()} rows.</p>
        </div>
      )}
    </section>
  );
}

function BudRow({ row, unitWord }) {
  const qty = Math.ceil(row.qty);
  return (
    <span className="ds">
      <b>{row.name}</b>
      <em>
        {[
          // His row is the quantity and its unit, and nothing else
          // (work-proj.js:1244). What the row is FOR belongs in the buy
          // schedule's own column, where he puts it.
          qty ? `${num(qty)} ${row.unit || unitWord || ""}`.trim() : null,
          // A part-order is a real state in this codebase and the row has to say
          // so, or half-ordered reads as not ordered at all.
          !row.procured && row.procuredPercent > 0
            ? `${Math.round(row.procuredPercent)}% ordered`
            : null,
        ]
          .filter(Boolean)
          .join(" · ") || EN_DASH}
      </em>
    </span>
  );
}

/* ─────────────────────────── Buy schedule ─────────────────────────── */

export function WorkProjectBuyView({
  project,
  canEdit = false,
  saving = false,
  onSave,
  onGo,
  now,
}) {
  const today = React.useMemo(() => now || new Date(), [now]);
  // His editable lead time (work-proj.js:1181). Ours is not saved: the stored
  // lead time belongs to the budget rows' own target dates, and a figure typed
  // here that quietly rewrote every date would be a change nobody asked for.
  // It re-dates the list you are looking at, and says so.
  const [lead, setLead] = React.useState(() => clampLeadDays(project?.leadDays ?? 14));
  const rows = React.useMemo(() => buyRows(project, { leadDays: lead }), [project, lead]);
  const k = React.useMemo(() => buyKpis(rows, today), [rows, today]);
  const dated = rows.filter((r) => r.buyBy).length;

  if (!rows.length) {
    return (
      <div className="pj-empty">
        <b>Nothing to buy yet</b>
        <p>
          The buy schedule lists the materials in the budget and when each has to be ordered. It
          fills in once this project has a budget.
        </p>
        <button type="button" className="ds-btn btn-o ds-btn-sm" onClick={() => onGo?.("rates")}>
          Open the budget
        </button>
      </div>
    );
  }

  return (
    <>
      <div className="pj-kpi c4">
        <div className={k.late.length ? "warn" : ""}>
          <span>Should already be bought</span>
          <b>{k.late.length}</b>
          <em>{k.late.length ? `${compact(k.lateValue)} of materials` : "Nothing late"}</em>
        </div>
        <div>
          <span>Buy this week</span>
          <b>{k.week.length}</b>
          <em>{k.week.length ? compact(k.weekValue) : "Nothing due"}</em>
        </div>
        <div>
          <span>Not yet scheduled</span>
          <b>{k.unscheduled.length}</b>
          <em>
            {k.unscheduled.length ? "Their lines are in no task" : "Every line is in a task"}
          </em>
        </div>
        <div>
          <span>Lead time</span>
          <b>
            {canEdit ? (
              <>
                <input
                  type="number"
                  min="0"
                  max="120"
                  value={lead}
                  aria-label="Lead time in days"
                  onChange={(e) => setLead(clampLeadDays(e.target.value, lead))}
                />{" "}
                days
              </>
            ) : (
              `${lead} days`
            )}
          </b>
          <em>Bought this long before work starts</em>
        </div>
      </div>

      <div className="pj-buy" role="table">
        <div className="hd" role="row">
          <span />
          <span>Buy by</span>
          <span>Material</span>
          <span className="n">Quantity</span>
          <span>For</span>
        </div>
        {rows.map((r) => {
          const late = r.buyBy && !r.done && r.buyBy < today;
          const cls = ["rw", r.done ? "got" : "", late ? "late" : "", r.buyBy ? "" : "none"]
            .filter(Boolean)
            .join(" ");
          const cells = (
            <>
              <span className="by">
                {r.buyBy ? day(r.buyBy) : "Not scheduled"}
                {r.needBy ? <em>on site {day(r.needBy)}</em> : null}
              </span>
              <span className="m">
                <b>{r.name}</b>
                <em>
                  {compact(r.amount)}
                  {!r.done && r.procuredPercent > 0
                    ? ` · ${Math.round(r.procuredPercent)}% ordered`
                    : ""}
                </em>
              </span>
              <span className="n">
                {num(Math.ceil(r.qty * 100) / 100)} {r.unit}
              </span>
              <span className="f">
                {r.forLine || EN_DASH}
                {r.taskName ? <em>{r.taskName}</em> : null}
              </span>
            </>
          );
          return canEdit ? (
            <label className={cls} role="row" key={r.index}>
              <input
                type="checkbox"
                checked={r.done}
                disabled={saving}
                aria-label={`Bought: ${r.name}`}
                onChange={(e) => onSave?.(withRowProcured(project, r.index, e.target.checked))}
              />
              {cells}
            </label>
          ) : (
            <div className={cls} role="row" key={r.index}>
              <span />
              {cells}
            </div>
          );
        })}
      </div>

      <p className="pj-foot">
        {dated} of {rows.length} dated. A buy-by date is the start of the earliest task its bill
        line is in, less the lead time — so a material whose line is in no task has no date rather
        than a guessed one. Plan it on the PM dashboard and it appears here.
      </p>
    </>
  );
}
