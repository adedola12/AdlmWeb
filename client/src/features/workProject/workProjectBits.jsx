// The small drawn pieces of his project page: the donut and the progress bar.
//
// Split from the formatters next door so each file exports one kind of thing.

import React from "react";
import { safeNum } from "../projects/lib/projectTotals.js";

const R = 42;
const C = 2 * Math.PI * R;

/** His donut() (work-proj.js:92). */
export function Donut({ percent, label, tone = "", sub }) {
  const v = Math.max(0, Math.min(100, safeNum(percent)));
  return (
    <div className={`pj-donut ${tone}`.trim()}>
      <svg viewBox="0 0 100 100" aria-hidden="true">
        <circle cx="50" cy="50" r={R} className="tr" />
        {v > 0 ? (
          <circle
            cx="50"
            cy="50"
            r={R}
            className="fg"
            strokeDasharray={`${((C * v) / 100).toFixed(1)} ${C.toFixed(1)}`}
          />
        ) : null}
      </svg>
      <div className="lb">
        <b>{Math.round(v)}%</b>
        <span>{label}</span>
      </div>
      {sub ? <p>{sub}</p> : null}
    </div>
  );
}

/** His bar() (work-proj.js:102). */
export function Bar({ percent, tone = "" }) {
  return (
    <span className={`pj-bar ${tone}`.trim()}>
      <i style={{ width: `${Math.max(0, Math.min(100, safeNum(percent)))}%` }} />
    </span>
  );
}
