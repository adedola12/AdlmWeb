// One bill line, in his side panel (work-proj.js:891-960).
//
// Five sections in his order — Quantity, Element, Rate, Progress — then Previous
// / Next. It is the page's main interaction: WORK.md §13 says progress is
// recorded "on bill lines only", and this is the only place that happens.
//
// THE TWO EDITS
//
// Recording progress and moving a line to another section are his two edits here,
// and both write through saveProject.js. Neither can send just the line it
// changed: sending `items` REPLACES the array, so every other line has to go
// back with it, whole. That rule and its tests live in saveProject.js.

import React from "react";
import {
  amountOf,
  doneOf,
  elementOf,
  isPriced,
  measuredAt,
  tradeOf,
  unitOf,
} from "./billModel.js";
import { EN_DASH, money, num } from "./workProjectFormat.js";
import { Bar } from "./workProjectBits.jsx";
import { withLineElement, withLineProgress } from "./saveProject.js";
import {
  actualAmountOf,
  actualQtyOf,
  isLocked,
  measuredWhen,
  optional as actualsOf,
  showActuals as actualsShowing,
  varianceOf,
  withActualQty,
} from "./actualsModel.js";

/** His progress steps (work-proj.js:920). */
const STEPS = [0, 25, 50, 75, 100];

export default function WorkProjectLinePanel({
  project,
  index,
  canEdit = false,
  drift = null,
  contractLocked = false,
  saving = false,
  onSave,
  onGoToLine,
  onGo,
  onFetchRates,
  onApplyRate,
  pricing = false,
  priceFailed = "",
  priceNotes = [],
}) {
  // Both memos sit above the "no such line" return: a hook after an early
  // return runs in a different order on the render that takes it.
  const items = React.useMemo(
    () => (Array.isArray(project?.items) ? project.items : []),
    [project],
  );
  const it = items[index];
  // Every section on this bill, plus this line's own in case it is the only
  // line in it — otherwise changing it would be a one-way trip.
  const sections = React.useMemo(() => {
    const seen = new Set(items.map(elementOf).filter(Boolean));
    if (it) seen.add(elementOf(it));
    return [...seen].filter(Boolean).sort((a, b) => a.localeCompare(b));
  }, [items, it]);

  // THE RATE THIS LINE COULD BE PRICED WITH.
  //
  // This panel used to offer "Price it", which opened the Rates tab — which is
  // read-only, because a rate is built in RateGen. So the two screens sent the
  // reader to each other and neither took a rate. A tester hit exactly that
  // today.
  //
  // The suggestions are the QS's OWN rates, matched on description and unit
  // (server-side, in util/rateSuggestions.js). Nothing here invents a figure
  // and nothing here posts one: the body names the rate, and the server
  // re-resolves it from that user's library before writing anything.
  const code = String(it?.code || "").trim();
  const priced = it ? isPriced(it) : false;
  const [picks, setPicks] = React.useState(null); // null = not asked yet
  const [looking, setLooking] = React.useState(false);
  // Why a measurement was not taken. Cleared on the next good one.
  const [refused, setRefused] = React.useState("");

  React.useEffect(() => {
    // Only for a line somebody can actually price. An unpriced line with no
    // code cannot be addressed by the endpoint at all (it matches on the code),
    // so asking would 400 for nothing.
    if (!canEdit || priced || !code || typeof onFetchRates !== "function") {
      setPicks(null);
      return undefined;
    }
    let live = true;
    setLooking(true);
    setPicks(null);
    onFetchRates(code)
      .then((list) => {
        // The reader may have moved to another line while this was in flight;
        // showing its answer here would offer rates for a different item.
        if (live) setPicks(Array.isArray(list) ? list : []);
      })
      .finally(() => {
        if (live) setLooking(false);
      });
    return () => {
      live = false;
    };
  }, [canEdit, priced, code, onFetchRates]);

  if (!it) return null;

  const done = doneOf(it);
  // The measured figures.
  //
  // `contractLocked` is the prop the shell passes; isLocked(project) is the same
  // fact read off the document. BOTH are required, not either: a stale prop
  // showing these columns on an unlocked bill would invite somebody to record a
  // variation against a contract that does not exist yet. They come from the
  // same document in practice, so requiring both costs nothing.
  const showActuals =
    contractLocked && isLocked(project) && actualsShowing(project);
  const actualQty = actualQtyOf(it);
  const actualAmount = actualAmountOf(it);
  const variance = varianceOf(it);
  const measured = measuredWhen(it);

  return (
    <>
      <div className="pn-sec">
        <span className="k">Quantity</span>
        <div className="big">
          {num(it.qty)} <small>{unitOf(it)}</small>
        </div>
        <p>
          {[it.code, measuredAt(it)].filter(Boolean).join(" · ") || "Measured on this bill"}
        </p>

        {drift ? (
          <div className="pn-drift">
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M12 9v4m0 4h.01M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z" />
            </svg>
            <div>
              <b>
                The latest model says {num(drift.now)} {unitOf(it)}
              </b>
              <span>
                {drift.why || "The model changed"} · was {num(it.qty)}
              </span>
            </div>
          </div>
        ) : null}
      </div>

      <div className="pn-sec">
        <span className="k">Element</span>
        {canEdit ? (
          // His <select> of ELEMENTS (work-proj.js:909). His list is a fixed
          // table; ours is the sections this bill actually uses, because a real
          // bill states its own and offering a line a section no other line has
          // would make a group of one.
          <select
            className="pn-sel"
            aria-label="Element"
            value={elementOf(it)}
            disabled={saving}
            onChange={(e) => onSave?.(withLineElement(project, index, e.target.value))}
          >
            {sections.map((s) => (
              <option key={s}>{s}</option>
            ))}
          </select>
        ) : (
          <p>{elementOf(it)}</p>
        )}
        <p className="hint">Trade: {tradeOf(it)}</p>
      </div>

      <div className="pn-sec">
        <span className="k">Rate</span>
        {priced ? (
          <>
            <div className="big">
              {money(it.rate)} <small>per {unitOf(it)}</small>
            </div>
            <p className="amt">
              Amount <b>{money(amountOf(it))}</b>
            </p>
          </>
        ) : (
          <p className="none">No rate yet — it is not counted in the estimated total.</p>
        )}
        {canEdit && !priced && picks?.length ? (
          <div className="pn-rates">
            <span className="pn-rates-k">Price it from your own rates</span>
            {picks.map((r) => (
              <button
                key={r.rateId || r.description}
                type="button"
                className="pn-rate"
                disabled={pricing || saving}
                onClick={() => onApplyRate?.(code, r)}
              >
                <b>{money(r.unitPrice)}</b>
                <span className="d">{r.description}</span>
                <span className="w">
                  per {r.unit} &middot; {r.why}
                </span>
              </button>
            ))}
            <p className="hint">
              Applying one sets this line&rsquo;s rate and prices its material, labour and
              plant in the budget.
            </p>
          </div>
        ) : null}

        {canEdit && !priced && looking ? (
          <p className="hint">Looking through your rate library&hellip;</p>
        ) : null}

        {canEdit && !priced && picks?.length === 0 && !looking ? (
          <p className="hint">
            Nothing in your rate library matches this line in {unitOf(it)}. Build the rate in
            Rate Gen and it will be offered here.
          </p>
        ) : null}

        {priceFailed ? <p className="pn-bad">{priceFailed}</p> : null}
        {priceNotes.length ? (
          <ul className="pn-notes">
            {priceNotes.map((w) => (
              <li key={w}>{w}</li>
            ))}
          </ul>
        ) : null}

        {canEdit ? (
          <button
            type="button"
            className="ds-btn btn-o ds-btn-sm"
            onClick={() => onGo?.("rates")}
          >
            {priced ? "Open in Rates & budget" : "Open Rates & budget"}
          </button>
        ) : null}
      </div>

      {/* WHAT WAS ACTUALLY MEASURED.
          Only after a lock, and only when the columns are showing — this is the
          place the figure in them is entered. The contract quantity above does
          not move: that is the whole point, and it is why a variation due to
          measured work is visible at all. New scope is not this; it is its own
          row in the variations list. */}
      {showActuals ? (
        <div className="pn-sec">
          <span className="k">Measured on site</span>
          <label className="pn-num">
            <span>Actual quantity</span>
            <input
              // KEYED ON THE LINE, so Previous/Next gives a fresh box.
              //
              // The panel keeps its place in the tree as the reader moves
              // between lines, so React reuses this input — and defaultValue is
              // read on mount only. Without the key, moving from a line
              // measured at 134 to an unmeasured one leaves 134 sitting in the
              // box, which reads as that line's measurement. The key forces a
              // remount, so the box always shows the line it belongs to.
              key={code}
              type="number"
              min="0"
              step="any"
              inputMode="decimal"
              disabled={!canEdit || saving}
              // The raw stored value, not a formatted one: a number box fed
              // "1,234" shows empty, which reads as "nothing measured".
              defaultValue={actualQty === null ? "" : actualQty}
              // On blur rather than per keystroke: each save is a whole-project
              // write, and one per digit would be a write per digit.
              onBlur={(e) => {
                const typed = e.target.value;
                const next = actualsOf(typed);
                if (next === actualQty) {
                  setRefused("");
                  return;
                }
                const patch = withActualQty(project, index, typed);
                if (patch) {
                  setRefused("");
                  onSave?.(patch);
                  return;
                }
                // withActualQty refuses a negative. Saying nothing left the box
                // showing -5 with no save and no explanation, which reads as a
                // broken screen. A reduction is a SMALLER quantity, not a
                // negative one; an omission is 0.
                setRefused(
                  next !== null && next < 0
                    ? "A measured quantity cannot be negative. Record a reduction as the smaller quantity, or 0 if none of it was done."
                    : "That quantity could not be recorded.",
                );
              }}
              placeholder={`${num(it.qty)} in the contract`}
            />
          </label>
          <p className="amt">
            {actualQty === null ? (
              // Not the same as agreeing. Said plainly so an empty row is not
              // read as a line that has been checked.
              <>Not measured yet &mdash; this line stands at its contract figure.</>
            ) : (
              <>
                Actual <b>{money(actualAmount)}</b> against {money(amountOf(it))}
                {variance === 0 ? (
                  <> &middot; agrees with the contract</>
                ) : (
                  <>
                    {" "}
                    &middot;{" "}
                    <b>
                      {variance > 0 ? "+" : EN_DASH}
                      {money(Math.abs(variance))}
                    </b>
                  </>
                )}
              </>
            )}
          </p>
          {refused ? <p className="pn-bad">{refused}</p> : null}
          {/* When it was measured. The server has stamped this since the field
              existed and nothing ever showed it — and it is the provenance that
              makes a variation defensible rather than a number from nowhere. */}
          {measured.recorded ? (
            <p className="hint">
              Measured {onThe(measured.recorded)}
              {measured.revised ? <>, revised {onThe(measured.updated)}</> : null}.
            </p>
          ) : null}
          <p className="hint">
            Clear the box to go back to &ldquo;not measured&rdquo;. A measured 0 is an omission of
            the whole line, which is a different thing.
          </p>
        </div>
      ) : null}

      <div className="pn-sec">
        <span className="k">Progress</span>
        <div className="pn-prog">
          <b>{done}%</b>
          <Bar percent={done} tone="ok" />
        </div>

        {canEdit ? (
          <div className="pn-steps" role="group" aria-label="Set progress">
            {STEPS.map((v) => (
              <button
                key={v}
                type="button"
                aria-pressed={done === v}
                disabled={saving}
                onClick={() => onSave?.(withLineProgress(project, index, v))}
              >
                {v}%
              </button>
            ))}
          </div>
        ) : null}

        <p className="hint">
          {contractLocked
            ? "Feeds the next valuation and the PM dashboard."
            : "Progress counts once the contract is locked."}
        </p>
      </div>

      <div className="pn-nav">
        <button
          type="button"
          className="ds-btn btn-o ds-btn-sm"
          disabled={index === 0}
          onClick={() => onGoToLine?.(index - 1)}
        >
          Previous line
        </button>
        <button
          type="button"
          className="ds-btn btn-o ds-btn-sm"
          disabled={index === items.length - 1}
          onClick={() => onGoToLine?.(index + 1)}
        >
          Next line
        </button>
      </div>
    </>
  );
}

/** A date a person reads on a bill: "on 30 Sept 2026". */
const onThe = (d) =>
  d
    ? `on ${d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}`
    : "";
