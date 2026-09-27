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

  if (!it) return null;

  const priced = isPriced(it);
  const done = doneOf(it);

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
        {canEdit ? (
          <button
            type="button"
            className="ds-btn btn-o ds-btn-sm"
            onClick={() => onGo?.("rates")}
          >
            {priced ? "Open in Rates & budget" : "Price it"}
          </button>
        ) : null}
      </div>

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
