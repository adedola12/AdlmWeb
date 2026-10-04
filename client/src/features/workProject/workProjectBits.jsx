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

/**
 * "Still reading this" — NOT "there is nothing here".
 *
 * WHY THIS IS A SHARED PIECE RATHER THAN A FLAG PER TAB
 *
 * The shell holds two documents: a rollup that arrives with the projects list,
 * and the full project fetched per id (WorkProjectShell.jsx). Until the second
 * lands it renders `project` as the rollup, which carries the head — name,
 * client, tool — but no bill lines, no models and no linked services.
 *
 * So for the whole of that read EVERY tab answers from a document that is not
 * the project: Overview totals to zero, the Model tab says "No model attached"
 * about a job with two, Services says none are linked, Drawings says nought
 * places. Then the fetch lands and the screen changes its mind. That is what
 * "it feels stuck" is — not slowness, but the screen stating the wrong thing
 * confidently while it waits.
 *
 * One component, gated once in the shell, because the thing that regresses is a
 * NEW tab being added without the flag. There is nowhere to forget it now.
 *
 * Reuses his .pj-empty: the box was already the right shape and the only thing
 * wrong with it was the words.
 */
export function StillLoading({ what }) {
  return (
    // Announced as well as drawn — a sighted reader sees the box change, and
    // this is how everybody else learns the same thing.
    <div className="pj-empty" role="status" aria-live="polite">
      {/* An ellipsis, not the en dash. EN_DASH is the house placeholder for a
          value that is ABSENT; this is one that is on its way, and the two must
          not look the same. */}
      <b>Loading{"…"}</b>
      <p>Reading this project{"’"}s {what}.</p>
    </div>
  );
}
