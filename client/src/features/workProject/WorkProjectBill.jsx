// His Bill tab (work-proj.js:708-823), on a real bill.
//
// The toolbar, the grouped table and the summary box below it, in his markup and
// his order. Which lines show and how they group is billModel.js; what anything
// is worth is projectTotals(), the same source the Overview tab and the classic
// bill read. Nothing here does arithmetic of its own except qty × rate, which is
// his (:768).
//
// Clicking a row opens the line in his side panel — layer L5, "never a new page".

import React from "react";
import {
  FILTERS,
  amountOf,
  chipCounts,
  descOf,
  doneOf,
  foldLabel,
  groupBill,
  isPriced,
  measuredAt,
  sectionOpen,
  unitOf,
} from "./billModel.js";
import { EN_DASH, money, num } from "./workProjectFormat.js";
import { Bar } from "./workProjectBits.jsx";
// One mapping from a project to its figures, not two: totalsFor() is what the
// Overview tab reads, and it is the only place that knows where a percentage
// lives on the document.
import { totalsFor } from "./overviewModel.js";
import {
  orderedSections,
  sectionIndex,
  suggestedArrangement,
  withSectionAdded,
  withSectionMoved,
} from "./sectionsModel.js";
// The actual columns, after a lock. Every rule about what a null means and what
// a variance is worth is in actualsModel.js, tested without a project.
import {
  actualAmountOf,
  actualQtyOf,
  actualTotals,
  isLocked,
  showActuals,
  varianceOf,
  withActualColumns,
} from "./actualsModel.js";

export default function WorkProjectBill({
  project,
  productKey = "",
  canEdit = false,
  driftByIndex = null,
  initialQuery = "",
  onOpenLine,
  onGo,
  onSave,
  saving = false,
}) {
  const items = React.useMemo(
    () => (Array.isArray(project?.items) ? project.items : []),
    [project],
  );

  // THE ACTUAL COLUMNS.
  //
  // Only after a lock, because before one there is a single quantity and it is
  // the estimate — there is nothing to compare against. After a lock the
  // contract quantity is frozen and a re-measure is recorded beside it, which is
  // what makes a variation due to measured work visible instead of letting the
  // contract sum drift with no record of why.
  //
  // The switch is saved on the project rather than in this browser, so two
  // people looking at the same locked contract see the same columns.
  const locked = isLocked(project);
  const actuals = locked && showActuals(project);
  const actualSums = React.useMemo(
    () => (actuals ? actualTotals(items) : null),
    [actuals, items],
  );

  // The Drawings tab jumps here with ?q=<where it was measured>, which is his
  // [data-sheet] behaviour. Re-seeded when it changes so a second jump moves
  // the box, but typed edits after that are the reader's own.
  const [query, setQuery] = React.useState(initialQuery);

  // The project's own arrangement of its sections. sectionsModel keeps it in
  // `customCategories`, which the project already had and the PUT already
  // accepts as an ordered array — so reordering needs no server change.
  const order = React.useMemo(() => orderedSections(project), [project]);
  // Which section is being dragged. Index into `order`, not a name: two
  // sections can read alike after trimming and the index cannot be ambiguous.
  const [dragFrom, setDragFrom] = React.useState(null);
  React.useEffect(() => setQuery(initialQuery), [initialQuery]);
  const [filter, setFilter] = React.useState("all");
  const [by, setBy] = React.useState("element");
  // Only the sections the reader has opened or shut by hand. Everything else
  // follows the default, which depends on how big the bill is.
  const [openMap, setOpenMap] = React.useState({});

  const counts = React.useMemo(
    () => chipCounts(items, driftByIndex),
    [items, driftByIndex],
  );
  const groups = React.useMemo(
    () => groupBill(items, { by, query, filter, driftByIndex, order }),
    [items, by, query, filter, driftByIndex, order],
  );
  const totals = React.useMemo(() => totalsFor(project), [project]);

  // Null when the bill is already arranged the way the engine would, so the
  // control is simply absent rather than offering a change that does nothing.
  const suggestion = React.useMemo(
    () => suggestedArrangement(project, productKey),
    [project, productKey],
  );

  const anyShown = groups.some((g) => g.indexes.length > 0);

  function toggleAll() {
    // His [data-fold]: if everything is shut, open everything; otherwise shut it.
    const shutting = foldLabel(groups, openMap) === "Collapse all";
    const next = {};
    groups.forEach((g) => {
      next[g.name] = !shutting;
    });
    setOpenMap(next);
  }

  return (
    <>
      <div className="pj-tb">
        <label className="pj-search">
          <span className="ds-sr-only">Search the bill</span>
          <input
            type="search"
            placeholder="Search descriptions and elements"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </label>

        <div className="pj-chips" role="group" aria-label="Show">
          {FILTERS.map((f) =>
            // His rule (:731): a chip with nothing behind it is not drawn —
            // except All, which is how you get back.
            counts[f.key] || f.key === "all" ? (
              <button
                key={f.key}
                type="button"
                aria-pressed={filter === f.key}
                onClick={() => setFilter(f.key)}
              >
                {f.label} <em>{counts[f.key]}</em>
              </button>
            ) : null,
          )}
        </div>

        <div className="pj-seg sm" role="group" aria-label="Group by">
          <button type="button" aria-pressed={by === "element"} onClick={() => { setBy("element"); setOpenMap({}); }}>
            By element
          </button>
          <button type="button" aria-pressed={by === "trade"} onClick={() => { setBy("trade"); setOpenMap({}); }}>
            By trade
          </button>
        </div>

        <button type="button" className="pj-lnk" onClick={toggleAll}>
          {foldLabel(groups, openMap)}
        </button>

        {/* Arranging the bill is only meaningful on the whole bill by element:
            a filtered or searched view is a subset, and "by trade" is a
            different question about the same lines. Offering the controls there
            would let a QS reorder something they cannot see. */}
        {canEdit && by === "element" && !query && filter === "all" ? (
          <>
            <button
              type="button"
              className="pj-lnk"
              disabled={saving}
              onClick={() => {
                const name = window.prompt("Name the new section");
                const patch = withSectionAdded(project, name || "");
                if (patch) onSave?.(patch);
              }}
            >
              Add a section
            </button>
            {suggestion ? (
              <button
                type="button"
                className="pj-lnk"
                disabled={saving}
                onClick={() => onSave?.(suggestion)}
                title="Puts the sections in the order the bill engine files them"
              >
                Suggest an arrangement
              </button>
            ) : null}
          </>
        ) : null}

        {locked ? (
          // Eight columns is a lot to read, and before a lock they are all
          // empty, so this is off by default and can be put away again.
          <button
            type="button"
            className="pj-lnk"
            disabled={saving || !canEdit}
            aria-pressed={actuals}
            title={
              canEdit
                ? "What was measured on site, beside what the contract says"
                : "Only an editor can change which columns everybody sees"
            }
            onClick={() => onSave?.(withActualColumns(project, !actuals))}
          >
            {actuals ? "Hide actuals" : "Show actuals"}
          </button>
        ) : null}

        <span className="tot">
          Measured <b>{money(totals.measured)}</b>
        </span>
      </div>

      <div
        className={actuals ? "pj-bill act" : "pj-bill"}
        role="table"
        aria-label="Bill of quantities"
      >
        <div className="hd" role="row">
          <span>Ref</span>
          <span>Description</span>
          <span className="n">{actuals ? "Contract qty" : "Qty"}</span>
          <span className="n">Rate</span>
          <span className="n">Amount</span>
          {actuals ? (
            <>
              <span className="n">Actual qty</span>
              <span className="n">Actual amount</span>
              <span className="n">Variation</span>
            </>
          ) : null}
          <span>Done</span>
        </div>

        {groups.map((g) => {
          // A section with no lines AT ALL is drawn — that is a section somebody
          // just added, and skipping it is what made "Add a section" look
          // broken. A section whose lines a filter hid is still skipped.
          if (!g.indexes.length && !g.empty) return null;
          const open = sectionOpen({
            name: g.name,
            openMap,
            itemCount: items.length,
            query,
            filter,
          });
          return (
            <div
              key={g.name}
              className={open ? "bsec open" : "bsec"}
              // Reordering is on the section, not on its lines: a bill is
              // arranged by moving whole sections, and dragging a header is
              // what a QS reaches for. Only an editor gets it — a drag that
              // silently did nothing would be worse than no handle.
              draggable={canEdit && !query && filter === "all" && by === "element"}
              // Case-insensitively: `order` keeps the project's spelling of a
              // section ("Frames") while a group takes its name from the lines
              // ("frames"), and an exact match returned -1 — which
              // withSectionMoved answers with null, so the drag silently did
              // nothing.
              onDragStart={() => setDragFrom(sectionIndex(order, g.name))}
              onDragOver={(e) => (dragFrom == null ? null : e.preventDefault())}
              onDrop={() => {
                const to = sectionIndex(order, g.name);
                const patch = withSectionMoved(project, dragFrom, to);
                setDragFrom(null);
                if (patch) onSave?.(patch);
              }}
              onDragEnd={() => setDragFrom(null)}
            >
              <button
                type="button"
                className="sh"
                aria-expanded={open}
                onClick={() => setOpenMap((m) => ({ ...m, [g.name]: !open }))}
              >
                <svg className="chev" viewBox="0 0 24 24" aria-hidden="true">
                  <path d="m9 18 6-6-6-6" />
                </svg>
                <b>
                  {g.letter} · {g.name}
                </b>
                <em>
                  {g.indexes.length} {g.indexes.length === 1 ? "item" : "items"}
                </em>
                <span>{money(g.total)}</span>
              </button>

              {open && g.empty ? (
                // Says what it is and what to do with it. An added section that
                // drew as a bare header would read as half-broken, and a QS has
                // no way to know a line gets here by being re-filed rather than
                // typed.
                <div className="pj-empty sm">
                  <b>Nothing filed under {g.name} yet</b>
                  <p>
                    Open a line and change its section to move it here. The section is saved
                    and keeps its place in the arrangement either way.
                  </p>
                </div>
              ) : null}

              {open
                ? g.rows.map(({ index, ref }) => {
                    const it = items[index];
                    const priced = isPriced(it);
                    const drift = driftByIndex?.[index] || null;
                    return (
                      <div
                        key={index}
                        className="rw"
                        role="row"
                        tabIndex={0}
                        onClick={() => onOpenLine?.(index)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" || e.key === " ") {
                            e.preventDefault();
                            onOpenLine?.(index);
                          }
                        }}
                      >
                        <span className="ref">{ref}</span>
                        <span className="ds">
                          <b>{descOf(it)}</b>
                          <em>
                            {measuredAt(it)}
                            {drift ? <i className="tag warn">Model changed</i> : null}
                            {!priced ? <i className="tag">Needs rate</i> : null}
                          </em>
                        </span>
                        <span className="n">
                          {num(it?.qty)} <small>{unitOf(it)}</small>
                        </span>
                        <span className="n">{priced ? money(it.rate) : EN_DASH}</span>
                        <span className="n">
                          <b>{priced ? money(amountOf(it)) : EN_DASH}</b>
                        </span>
                        {actuals ? <ActualCells item={it} /> : null}
                        <span className="dn">
                          <Bar percent={doneOf(it)} tone="ok" />
                          <em>{doneOf(it)}%</em>
                        </span>
                      </div>
                    );
                  })
                : null}
            </div>
          );
        })}

        {!items.length ? (
          <div className="pj-empty sm">
            <b>No lines yet</b>
            <p>
              Lines arrive when quantities are saved from the tool this project was measured in.
            </p>
          </div>
        ) : !anyShown ? (
          <div className="pj-empty sm">
            <b>No lines match</b>
            <p>Try another word or show All.</p>
          </div>
        ) : null}
      </div>

      {actualSums ? <ActualsStrip sums={actualSums} onGo={onGo} /> : null}

      <BillSummary project={project} totals={totals} canEdit={canEdit} onGo={onGo} />

      <p className="pj-foot">
        Click a line to see where its quantity came from, its rate and its progress. Progress
        recorded here feeds the PM dashboard and valuations.
      </p>
    </>
  );
}

/**
 * His summary box (work-proj.js:825-857) — everything below the measured work.
 *
 * Read-only for now. His version edits the percentages and the PC / provisional
 * sums in place, and that writes the whole project back; wiring it is the next
 * step and is deliberately not half-done here, because a save from this page
 * that omits an array would delete it (the PUT replaces them outright — see the
 * note in ProjectsGeneric.jsx's saveRatesToCloud).
 */
function BillSummary({ project, totals, canEdit, onGo }) {
  const locked = Boolean(project?.contract?.locked);
  const pcSums = (project?.provisionalSums || []).filter((s) => s?.kind === "pc");
  const provSums = (project?.provisionalSums || []).filter((s) => s?.kind !== "pc");

  const Row = ({ label, value, cls = "" }) => (
    <div className={`r ${cls}`.trim()}>
      <span className="l">{label}</span>
      <b>{money(value)}</b>
    </div>
  );

  const SumGroup = ({ label, rows, total }) => (
    <div className="grp">
      <div className="r h">
        <span className="l">{label}</span>
        <b>{money(total)}</b>
      </div>
      {rows.map((s, i) => (
        <div className="r s" key={`${s?.description || "sum"}-${i}`}>
          <span className="l">{s?.description || "Unnamed sum"}</span>
          <b>{money(s?.amount)}</b>
        </div>
      ))}
    </div>
  );

  return (
    <section className="pj-sumbox">
      <div className="hd">
        <h3>Summary</h3>
        <span>
          {locked
            ? "Contract locked — changes go through variations"
            : "Everything below the measured work"}
        </span>
      </div>

      <Row label="Measured work" value={totals.measured} />
      <div className="r">
        <span className="l">
          Preliminaries · {totals.preliminaryPercent}%
        </span>
        <b>{money(totals.prelims)}</b>
      </div>

      <SumGroup label="PC sums" rows={pcSums} total={totals.pc} />
      <SumGroup label="Provisional sums" rows={provSums} total={totals.provisional} />

      <div className="r">
        <span className="l">
          Contingency · {totals.contingencyPercent}%
        </span>
        <b>{money(totals.contingency)}</b>
      </div>

      {locked ? (
        <div className="r">
          <span className="l">
            Approved variations{" "}
            <button type="button" className="pj-lnk" onClick={() => onGo?.("valuations")}>
              See variations
            </button>
          </span>
          <b>{money(totals.variations)}</b>
        </div>
      ) : null}

      <div className="r">
        <span className="l">VAT · {totals.taxPercent}%</span>
        <b>{money(totals.tax)}</b>
      </div>

      <div className="r t">
        <span className="l">Estimated total</span>
        <b>{money(totals.total)}</b>
      </div>

      {canEdit && !locked ? (
        <p className="hint">
          The percentages and the sums are edited in the classic workspace for now.
        </p>
      ) : null}
    </section>
  );
}

/**
 * One line's measured quantity, what it came to, and the difference.
 *
 * An unmeasured line shows an en dash in all three rather than repeating its
 * contract figures, which would read as a confirmed measurement.
 */
function ActualCells({ item }) {
  const qty = actualQtyOf(item);
  const amount = actualAmountOf(item);
  const variance = varianceOf(item);
  return (
    <>
      <span className="n">
        {qty === null ? (
          EN_DASH
        ) : (
          <>
            {num(qty)} <small>{unitOf(item)}</small>
          </>
        )}
      </span>
      <span className="n">{amount === null ? EN_DASH : money(amount)}</span>
      <span className={variance ? (variance > 0 ? "n vr up" : "n vr dn") : "n vr"}>
        {variance === null
          ? EN_DASH
          : variance === 0
            ? "agrees"
            : `${variance > 0 ? "+" : EN_DASH}${money(Math.abs(variance))}`}
      </span>
    </>
  );
}

/**
 * The two totals and what separates them.
 *
 * Says how many lines the actual figure rests on, because an unmeasured line
 * counts at its contract amount: a bill with three lines measured out of four
 * hundred has an "actual" total that is almost entirely the contract one, and
 * presenting that as a fact would be the wrong impression.
 */
function ActualsStrip({ sums, onGo }) {
  return (
    <section className="pj-actsum">
      <div className="r">
        <span className="l">Contract</span>
        <b>{money(sums.contract)}</b>
      </div>
      <div className="r">
        <span className="l">
          Measured to date
          <em>
            {sums.anyMeasured
              ? `${sums.measured} of ${sums.lines} lines re-measured; the rest stand as agreed`
              : "nothing re-measured yet, so this is the contract figure"}
          </em>
        </span>
        <b>{money(sums.actual)}</b>
      </div>
      <div className={sums.variance ? (sums.variance > 0 ? "r t up" : "r t dn") : "r t"}>
        <span className="l">
          Variation from measured work
          <em>
            New scope is a variation of its own and is not counted here.{" "}
            <button type="button" className="pj-lnk" onClick={() => onGo?.("valuations")}>
              See variations
            </button>
          </em>
        </span>
        <b>
          {sums.variance === 0
            ? "None"
            : `${sums.variance > 0 ? "+" : EN_DASH}${money(Math.abs(sums.variance))}`}
        </b>
      </div>
    </section>
  );
}
