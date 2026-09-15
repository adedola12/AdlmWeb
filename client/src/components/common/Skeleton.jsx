import React from "react";

// Placeholder shapes for content that is still loading.
//
// These exist because the project explorer had no loading state at all: on
// first mount `rows` is [] and the fetch is in flight, so the grid rendered
// "No projects found." and then swapped in the user's projects a beat later.
// A skeleton says "still fetching"; an empty state says "there is nothing".
// They are not interchangeable.

export function SkeletonLine({ className = "rounded", width }) {
  return (
    <span
      aria-hidden="true"
      className={`skeleton block h-3 ${className}`}
      style={width ? { width } : undefined}
    />
  );
}

// Mirrors the shape of a project card in ProjectExplorerGrid — icon tile,
// two lines of label, a progress bar, a timestamp — so the grid doesn't
// visibly reflow when the real cards arrive.
export function SkeletonProjectCard() {
  return (
    <div
      aria-hidden="true"
      className="rounded-2xl border border-slate-200 bg-white p-4 shadow-depth dark:border-adlm-dark-border dark:bg-adlm-dark-panel"
    >
      <div className="mt-2 flex items-center justify-center">
        <span className="skeleton block h-16 w-16 rounded-2xl" />
      </div>
      <div className="mt-3 flex flex-col items-center gap-2">
        <SkeletonLine width="72%" />
        <SkeletonLine className="h-2.5 rounded" width="48%" />
      </div>
      <div className="mt-4">
        <span className="skeleton block h-1.5 w-full rounded-full" />
      </div>
      <div className="mt-3 flex justify-center">
        <SkeletonLine className="h-2.5 rounded" width="56%" />
      </div>
    </div>
  );
}

export function SkeletonProjectGrid({ count = 8 }) {
  return (
    <div
      className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4"
      role="status"
      aria-live="polite"
      aria-busy="true"
    >
      <span className="sr-only">Loading projects…</span>
      {Array.from({ length: count }).map((_, i) => (
        <SkeletonProjectCard key={i} />
      ))}
    </div>
  );
}

export default SkeletonProjectGrid;
