// Click an element in the model, see what it is worth.
//
// WHY THIS IS A REBUILD RATHER THAN THE PANEL NEXT DOOR
//
// The classic ModelViewer has this panel already (features/projects/
// ModelViewer.jsx, its non-compact side column). Mounting that version here
// would drag the classic utility classes into a page built from the ported
// design system, and the join would show — which is why the Model tab mounts
// the viewer in `compact` and this is written in his idiom instead.
//
// The ARITHMETIC is not rebuilt. Both screens compute an element's cost from
// lib/elementTrace.js, because two copies of a money calculation is how one
// element comes to be worth two figures on two screens.
//
// It lives in the side column his .pj-model grid already defines, and it takes
// that column over while an element is selected: the question "what did I just
// click" is the only one anybody has at that moment, and the model list it
// replaces is one click away again.

import React from "react";
import { elementQtyFor, elementCostFor, itemLabel, traceForElement } from "../../lib/elementTrace.js";
import { EN_DASH, money } from "./workProjectFormat.js";

const qty = (n) => (Number(n) || 0).toLocaleString("en-NG", { maximumFractionDigits: 3 });

/**
 * One measured line: what it is, how much of it is this element, what that costs.
 *
 * Uses his .vv row, the same one the model list uses, so the column reads as one
 * surface rather than two. .vv is scoped to .pj-model in his sheet, which is
 * what this renders inside.
 */
function TraceLine({ it, id, showMoney }) {
  const q = elementQtyFor(it, id);
  const cost = elementCostFor(it, id);
  return (
    <div className="vv">
      <span className="v">
        {/* The marker column. An approximate figure is flagged HERE as well as
            in the note at the foot, because a reader scanning the numbers will
            not have read the note. */}
        {q.estimated ? "≈" : ""}
      </span>
      <span className="ds">
        <b title={itemLabel(it)}>{itemLabel(it)}</b>
        <em>
          {qty(q.qty)} {it.unit || ""}
        </em>
      </span>
      {/* Money is absent, not zero, when the viewer may not see rates: the
          server serves rate 0 to a collaborator without rate access, so a "₦0"
          here would be a statement about the job rather than about them. */}
      <span className="tag">{showMoney && cost > 0 ? money(cost) : EN_DASH}</span>
    </div>
  );
}

export default function WorkProjectElementTrace({ id, items, materialItems, onClear }) {
  const trace = React.useMemo(
    () => traceForElement({ id, items, materialItems }),
    [id, items, materialItems],
  );
  if (!trace) return null;

  const showMoney = trace.billCost > 0 || trace.materialCost > 0;

  return (
    <section className="wk-panel vs">
      <div className="wk-ph">
        <h2>Element {trace.id}</h2>
        <button type="button" className="pj-lnk" onClick={onClear}>
          Back to models
        </button>
      </div>

      {showMoney ? (
        <div className="vv">
          <span className="v" />
          <span className="ds">
            <b>This element</b>
            <em>
              {trace.bill.length} bill line{trace.bill.length === 1 ? "" : "s"}
              {trace.materials.length
                ? ` · ${trace.materials.length} material line${trace.materials.length === 1 ? "" : "s"}`
                : ""}
            </em>
          </span>
          <span className="tag">{money(trace.billCost)}</span>
        </div>
      ) : null}

      {trace.unreferenced ? (
        <div className="pj-empty sm">
          <b>Nothing was measured from this</b>
          <p>
            It is in the model but no bill line references it. That is the answer to
            {" "}&ldquo;why is this not in my bill&rdquo;, and it is worth checking before the
            takeoff is issued.
          </p>
        </div>
      ) : null}

      {trace.bill.length ? (
        <>
          <p className="wk-grp">Bill of quantity</p>
          {trace.bill.slice(0, 8).map((it, i) => (
            <TraceLine key={`b${i}`} it={it} id={trace.id} showMoney={showMoney} />
          ))}
          {trace.bill.length > 8 ? (
            <p className="pj-foot">
              and {trace.bill.length - 8} more bill line
              {trace.bill.length - 8 === 1 ? "" : "s"}.
            </p>
          ) : null}
        </>
      ) : null}

      {trace.materials.length ? (
        <>
          <p className="wk-grp">Material and labour</p>
          {trace.materials.slice(0, 12).map((it, i) => (
            <TraceLine key={`m${i}`} it={it} id={trace.id} showMoney={showMoney} />
          ))}
          {trace.materials.length > 12 ? (
            <p className="pj-foot">
              and {trace.materials.length - 12} more.
            </p>
          ) : null}
        </>
      ) : null}

      {trace.anyEstimated ? (
        <p className="pj-foot">
          {"≈"} is an even split of a line across its elements, not a measurement — the
          takeoff did not record a figure per element here. Do not value off it.
        </p>
      ) : null}
    </section>
  );
}
