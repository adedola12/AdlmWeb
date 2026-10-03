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
import { applicableCount, searchRates } from "./rateSearch.js";
import { pricedSentence, similarLines } from "./similarLines.js";
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
  onSearchRates,
  libraryFailed = false,
  onApplyRate,
  onPriceMany,
  pricedNote = null,
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
  // FINDING A RATE BY NAME.
  //
  // The suggestions answer "what would price this line?". This answers "I know
  // which rate I want" — which is how a QS usually thinks, and the only way to
  // price a line at all on a server that does not have the suggestions endpoint
  // yet. Both are offered; neither replaces the other.
  const [query, setQuery] = React.useState("");
  const [library, setLibrary] = React.useState(null);

  // Loaded on the first keystroke, not on open: most lines are never priced
  // from this box, and the merged library is the whole rate set.
  React.useEffect(() => {
    if (!query.trim() || library || typeof onSearchRates !== "function") return undefined;
    let live = true;
    onSearchRates().then((items) => {
      if (live && items) setLibrary(items);
    });
    return () => {
      live = false;
    };
  }, [query, library, onSearchRates]);

  // THE SAME ITEM ELSEWHERE ON THE BILL.
  //
  // "Lintel Concrete" on every level is one decision, not thirty-six. The
  // unpriced lines that are the same item, in the same unit, are listed and
  // ticked; picking a rate prices this line and every ticked one in one write.
  // Unticking is how a QS says "not that one". A priced line is never touched.
  const similar = React.useMemo(() => (it ? similarLines(items, it) : []), [items, it]);
  // Codes the QS unticked. Kept per line opened: moving to another line starts
  // with everything ticked again.
  const [unticked, setUnticked] = React.useState(() => new Set());
  const [showAllSimilar, setShowAllSimilar] = React.useState(false);
  React.useEffect(() => {
    setUnticked(new Set());
    setShowAllSimilar(false);
  }, [code]);
  const ticked = similar.filter((l) => !unticked.has(l.code));

  // One rate for this line and the ticked ones; one rate per line otherwise.
  const applyRate = (r) => {
    if (ticked.length && typeof onPriceMany === "function") {
      const pick = { rateId: r.rateId, description: r.description, unit: r.unit };
      onPriceMany(
        [{ code, ...pick }, ...ticked.map((l) => ({ code: l.code, ...pick }))],
        "similar",
      );
      return;
    }
    onApplyRate?.(code, r);
  };

  const found = React.useMemo(
    () => (library ? searchRates(library, query, { unit: unitOf(it), limit: 8 }) : []),
    [library, query, it],
  );

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

        {canEdit && similar.length ? (
          <SimilarLines
            lines={similar}
            unticked={unticked}
            showAll={showAllSimilar}
            onShowAll={() => setShowAllSimilar(true)}
            disabled={pricing || saving}
            onToggle={(c) =>
              setUnticked((prev) => {
                const next = new Set(prev);
                if (next.has(c)) next.delete(c);
                else next.add(c);
                return next;
              })
            }
            onOpen={onGoToLine}
            priced={priced}
            unit={unitOf(it)}
          />
        ) : null}

        {canEdit && priced && ticked.length && typeof onPriceMany === "function" ? (
          // This line already has its rate. Copying it to the rest is the same
          // decision, so it is one button. The server copies the rate this line
          // was priced FROM, which only exists if it was priced on the web; a
          // rate typed in a plugin is skipped with that reason.
          <button
            type="button"
            className="ds-btn ds-btn-sm"
            disabled={pricing || saving}
            onClick={() =>
              onPriceMany(
                ticked.map((l) => ({ code: l.code, sameAs: code })),
                "similar",
              )
            }
          >
            Price {ticked.length} similar {ticked.length === 1 ? "line" : "lines"} at this rate
          </button>
        ) : null}

        {pricedNote && (pricedNote.priced.length || pricedNote.skipped.length) ? (
          <div className="pn-done" role="status">
            <p>{pricedSentence({ _priced: pricedNote.priced, _skipped: pricedNote.skipped })}</p>
            {pricedNote.skipped.length ? (
              <ul className="pn-notes">
                {pricedNote.skipped.slice(0, 6).map((k) => (
                  <li key={k.code}>{k.reason}</li>
                ))}
              </ul>
            ) : null}
          </div>
        ) : null}
        {canEdit && !priced && picks?.length ? (
          <div className="pn-rates">
            <span className="pn-rates-k">Price it from your own rates</span>
            {picks.map((r) => (
              <button
                key={r.rateId || r.description}
                type="button"
                className="pn-rate"
                disabled={pricing || saving}
                onClick={() => applyRate(r)}
              >
                <b>{money(r.unitPrice)}</b>
                <span className="d">{r.description}</span>
                <span className="w">
                  per {r.unit} &middot; {r.why}
                </span>
              </button>
            ))}
            <p className="hint">
              Applying one sets this line&rsquo;s rate
              {ticked.length
                ? ` and the ${ticked.length} ticked ${ticked.length === 1 ? "line" : "lines"} like it`
                : ""}
              , and prices material, labour and plant in the budget.
            </p>
          </div>
        ) : null}

        {canEdit && !priced ? (
          <div className="pn-find">
            <label className="pn-num">
              <span>Or find a rate by name</span>
              <input
                type="search"
                value={query}
                placeholder={`Search your rates in ${unitOf(it)}`}
                disabled={pricing || saving}
                onChange={(e) => setQuery(e.target.value)}
              />
            </label>

            {query.trim() && libraryFailed ? (
              <p className="pn-bad">
                Your rate library could not be read just now. That is not the same as having no
                matching rate.
              </p>
            ) : null}

            {query.trim() && !library && !libraryFailed ? (
              <p className="hint">Reading your rate library&hellip;</p>
            ) : null}

            {library && query.trim() ? (
              found.length ? (
                <div className="pn-rates">
                  {found.map((r) => (
                    <button
                      key={r.rateId || r.description}
                      type="button"
                      className={r.canApply ? "pn-rate" : "pn-rate off"}
                      // A rate in another unit is SHOWN so nobody hunts for one
                      // they can see in Rate Gen — and cannot be applied,
                      // because pricing an m2 line at an m3 rate is wrong by the
                      // thickness and looks entirely reasonable on the bill.
                      disabled={!r.canApply || pricing || saving}
                      title={r.canApply ? undefined : r.why}
                      onClick={() => applyRate(r)}
                    >
                      <b>{money(r.amount)}</b>
                      <span className="d">{r.description}</span>
                      <span className="w">
                        per {r.unit} &middot; {r.why}
                      </span>
                    </button>
                  ))}
                  {applicableCount(found) === 0 ? (
                    <p className="hint">
                      None of these is in {unitOf(it)}, so none can price this line. Build the rate
                      in that unit in Rate Gen.
                    </p>
                  ) : null}
                </div>
              ) : (
                <p className="hint">Nothing in your library matches that.</p>
              )
            ) : null}
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

/** How many lines to list before "Show all": a 36-level item would fill the panel. */
const SIMILAR_SHOWN = 6;

/**
 * The lines that are the same item as this one, each with a tick.
 *
 * Ticked by default, because that is what the QS almost always means; the
 * list is there so "almost always" is never a surprise.
 */
function SimilarLines({ lines, unticked, showAll, onShowAll, onToggle, onOpen, disabled, priced, unit }) {
  const shown = showAll ? lines : lines.slice(0, SIMILAR_SHOWN);
  const on = lines.filter((l) => !unticked.has(l.code)).length;
  return (
    <div className="pn-similar">
      <span className="pn-rates-k">
        {priced ? "Same item, no rate yet" : "Also price the same item on"} &middot; {on} of{" "}
        {lines.length}
      </span>
      <ul>
        {shown.map((l) => (
          <li key={l.code}>
            <label>
              <input
                type="checkbox"
                checked={!unticked.has(l.code)}
                disabled={disabled}
                onChange={() => onToggle(l.code)}
              />
              <span className="lv">{l.level || l.code}</span>
              <span className="q">
                {num(l.qty)} {l.unit || unit}
              </span>
            </label>
            <button type="button" className="pj-lnk" onClick={() => onOpen?.(l.index)}>
              Open
            </button>
          </li>
        ))}
      </ul>
      {!showAll && lines.length > SIMILAR_SHOWN ? (
        <button type="button" className="pj-lnk" onClick={onShowAll}>
          Show all {lines.length}
        </button>
      ) : null}
      <p className="hint">
        {priced
          ? "Untick any line that should not take this rate."
          : "Picking a rate below prices this line and every ticked one. Untick any that should differ."}
      </p>
    </div>
  );
}

/** A date a person reads on a bill: "on 30 Sept 2026". */
const onThe = (d) =>
  d
    ? `on ${d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}`
    : "";
