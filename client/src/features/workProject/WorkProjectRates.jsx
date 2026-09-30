// His Rates & budget tab (work-proj.js:975-1040).
//
// WORK.md §13: "The Rates & budget tab *is* RateGen inside the project." His
// three views sit behind one segmented control — Rates, Budget, Buy schedule —
// and the Rates view is two lists: what still needs a rate, and what is priced.
//
// Clicking a priced line opens its build-up in the side panel, layer L5, which
// is the same panel the Bill tab opens a line into.

import React from "react";
import {
  RATE_VIEWS,
  lineAmount,
  provenanceOf,
  rateNotes,
  resolveRateView,
  splitByRate,
  suggestionFor,
} from "./ratesModel.js";
import { descOf, measuredAt, unitOf } from "./billModel.js";
import { EN_DASH, money, num } from "./workProjectFormat.js";
import { totalsFor } from "./overviewModel.js";
import { WorkProjectBudgetView, WorkProjectBuyView } from "./WorkProjectBudget.jsx";
import WorkProjectBudgetHeron from "./WorkProjectBudgetHeron.jsx";

export default function WorkProjectRates({
  project,
  canEdit = false,
  view = "rates",
  onView,
  onOpenLine,
  onGo,
  onSave,
  saving = false,
  rateMap = null,
  onApplyRate,
  pricing = false,
  priceFailed = "",
  priceNotes = [],
}) {
  const items = React.useMemo(
    () => (Array.isArray(project?.items) ? project.items : []),
    [project],
  );
  const mode = resolveRateView(view);
  const { unpriced, priced } = React.useMemo(() => splitByRate(items), [items]);
  const notes = React.useMemo(
    () => rateNotes(items, project?.budgetItems),
    [items, project],
  );
  const totals = React.useMemo(() => totalsFor(project), [project]);

  return (
    <>
      <div className="pj-tb">
        <div className="pj-seg" role="group" aria-label="View">
          {RATE_VIEWS.map((v) => (
            <button
              key={v.key}
              type="button"
              aria-pressed={mode === v.key}
              onClick={() => onView?.(v.key)}
            >
              {v.label}
            </button>
          ))}
        </div>

        <span className="pj-by">Priced with RateGen</span>

        <button type="button" className="pj-lnk" onClick={() => onGo?.("library")}>
          Open in RateGen
        </button>
      </div>

      {mode === "rates" ? (
        <RatesView
          items={items}
          unpriced={unpriced}
          priced={priced}
          notes={notes}
          total={totals.total}
          canEdit={canEdit}
          onOpenLine={onOpenLine}
          rateMap={rateMap}
          onApplyRate={onApplyRate}
          pricing={pricing}
          saving={saving}
          priceFailed={priceFailed}
          priceNotes={priceNotes}
        />
      ) : mode === "budget" ? (
        // HERON 3.0's shape: cost against value per bill line, with the margin
        // on each. The resource columns it replaced answered a procurement
        // question; this one answers the question a QS opens a budget for.
        // Both read budgetModel.js, so they cannot disagree about a total.
        <WorkProjectBudgetHeron
          project={project}
          canEdit={canEdit}
          saving={saving}
          onSave={onSave}
          onGo={onGo}
        />
      ) : (
        <WorkProjectBuyView
          project={project}
          canEdit={canEdit}
          saving={saving}
          onSave={onSave}
          onGo={onGo}
        />
      )}
    </>
  );
}

function RatesView({
  items,
  unpriced,
  priced,
  notes,
  total,
  canEdit,
  onOpenLine,
  rateMap = null,
  onApplyRate,
  pricing = false,
  saving = false,
  priceFailed = "",
  priceNotes = [],
}) {
  return (
    <>
      {notes.size ? (
        <div className="pj-note">
          <div>
            <b>
              {notes.size} rate{notes.size > 1 ? "s" : ""} no longer{" "}
              {notes.size > 1 ? "agree" : "agrees"} with the build-up pricing{" "}
              {notes.size > 1 ? "them" : "it"}.
            </b>{" "}
            The line keeps the figure the QS applied. Each one is marked below.
          </div>
        </div>
      ) : null}

      {unpriced.length ? (
        <section className="wk-panel pj-need">
          <div className="wk-ph">
            <h2>
              Needs a rate <em>{unpriced.length}</em>
            </h2>
          </div>
          {priceFailed ? <p className="pj-need-bad">{priceFailed}</p> : null}
          {priceNotes.length ? (
            <ul className="pj-need-notes">
              {priceNotes.map((w) => (
                <li key={w}>{w}</li>
              ))}
            </ul>
          ) : null}
          {unpriced.map((i) => {
            const it = items[i];
            const sg = suggestionFor(rateMap, it);
            return (
              <div className="nr" key={i}>
                <div className="ds">
                  <b>{descOf(it)}</b>
                  <em>
                    {num(it?.qty)} {unitOf(it)}
                    {measuredAt(it) ? ` · ${measuredAt(it)}` : ""}
                  </em>
                </div>
                {/* His design puts a SUGGESTED library rate here, and for a
                    long time this said there was no honest source for one. There
                    is: RateGen holds this QS's own rates, and a rate they built
                    themselves, for work whose description matches, in the same
                    unit, is not a figure put in their mouth. The server does the
                    matching and re-resolves the pick before writing, so nothing
                    a screen sends can become a price. */}
                {sg ? (
                  <div className="sg">
                    <b>{money(sg.unitPrice)}</b>
                    <span>
                      per {sg.unit} &middot; {sg.why}
                    </span>
                  </div>
                ) : (
                  <div className="sg none">
                    <span>
                      {rateMap
                        ? "No suggestion — price it from the build-up"
                        : "Checking your rate library…"}
                    </span>
                  </div>
                )}
                {canEdit ? (
                  <div className="ac">
                    {sg ? (
                      <button
                        type="button"
                        className="ds-btn ds-btn-sm"
                        disabled={pricing || saving}
                        onClick={() => onApplyRate?.(String(it?.code || "").trim(), sg)}
                      >
                        Use this rate
                      </button>
                    ) : null}
                    <button
                      type="button"
                      className="ds-btn btn-o ds-btn-sm"
                      onClick={() => onOpenLine?.(i)}
                    >
                      Open the line
                    </button>
                  </div>
                ) : null}
              </div>
            );
          })}
        </section>
      ) : null}

      <section className="wk-panel">
        <div className="wk-ph">
          <h2>
            Priced <em>{priced.length}</em>
          </h2>
          <span className="wk-locnote">Estimated total {money(total)}</span>
        </div>

        {priced.length ? (
          <div className="pj-rt">
            {priced.map((i) => {
              const it = items[i];
              const prov = provenanceOf(it);
              const note = notes.get(i);
              return (
                <button
                  type="button"
                  className="rr"
                  key={i}
                  onClick={() => onOpenLine?.(i)}
                >
                  <span className="ds">
                    <b>{prov.name || descOf(it)}</b>
                    <em>
                      {num(it?.qty)} {unitOf(it)}
                    </em>
                  </span>
                  <span className={prov.fromLibrary ? "tag" : "tag proj"}>{prov.label}</span>
                  {note ? (
                    // His tag here says "Library changed". Ours cannot: we do not
                    // track the library's own history. This is the same question
                    // asked of a different pair — the rate against the build-up
                    // that prices it — so it is worded for what it actually
                    // checked.
                    <span className="tag warn">
                      {note.state === "released" ? "Rate released" : "Differs from build-up"}
                    </span>
                  ) : (
                    <span />
                  )}
                  <span className="n">
                    {money(it?.rate)} <small>/ {unitOf(it) || EN_DASH}</small>
                  </span>
                  <span className="n">
                    <b>{money(lineAmount(it))}</b>
                  </span>
                </button>
              );
            })}
          </div>
        ) : (
          <div className="pj-empty sm">
            <b>Nothing priced yet</b>
            <p>Rates arrive from RateGen, from the plugin, or from this project&rsquo;s budget.</p>
          </div>
        )}
      </section>
    </>
  );
}
