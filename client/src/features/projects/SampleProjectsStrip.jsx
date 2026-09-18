// "Learning samples" row above a product's project grid: fully worked,
// read-only sample projects (bill, budget, valuations, programme, model) every
// subscriber can open to see how the cloud workspace is used on a real job.
// Served by GET /projects/:productKey/samples; hidden when there are none.

import React from "react";
import { FaCube, FaEye, FaHardHat } from "../../components/icons.jsx";

function naira(n) {
  const v = Number(n) || 0;
  if (v >= 1e6) return `₦${(v / 1e6).toFixed(1)}m`;
  return `₦${Math.round(v).toLocaleString()}`;
}

export default function SampleProjectsStrip({ samples = [], onOpenProject }) {
  const [open, setOpen] = React.useState(() => {
    try {
      return localStorage.getItem("adlm.samples.collapsed") !== "1";
    } catch {
      return true;
    }
  });
  if (!samples.length) return null;

  const toggle = () => {
    setOpen((v) => {
      try {
        localStorage.setItem("adlm.samples.collapsed", v ? "1" : "0");
      } catch {
        /* storage unavailable: keep the in-memory state only */
      }
      return !v;
    });
  };

  return (
    <section className="mt-5 rounded-2xl border border-amber-200 bg-amber-50/60 p-4 dark:border-amber-500/20 dark:bg-amber-500/5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <div className="flex items-center gap-2 text-sm font-bold text-slate-900 dark:text-white">
            <FaHardHat className="text-amber-600" />
            Learning samples
          </div>
          <div className="text-xs text-slate-600 dark:text-adlm-dark-muted">
            Worked duplex projects, one per foundation type. Open one to see every tab
            filled in on a real job. Samples are read-only.
          </div>
        </div>
        <button type="button" className="btn btn-sm" onClick={toggle} aria-expanded={open}>
          {open ? "Hide samples" : `Show ${samples.length} samples`}
        </button>
      </div>

      {open ? (
        <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {samples.map((s) => (
            <button
              key={s.id}
              type="button"
              onClick={() => onOpenProject?.(s.id)}
              className="group flex h-full flex-col rounded-xl border border-slate-200 bg-white p-3.5 text-left shadow-depth transition hover:-translate-y-0.5 hover:border-amber-400 focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-500 dark:border-adlm-dark-border dark:bg-adlm-dark-panel"
            >
              <div className="flex items-center justify-between gap-2">
                <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-semibold text-amber-800 dark:bg-amber-500/15 dark:text-amber-300">
                  {s.sample?.foundation || "Sample"}
                </span>
                <span className="inline-flex items-center gap-1 text-[11px] text-slate-500 dark:text-adlm-dark-muted">
                  <FaEye /> Read-only
                </span>
              </div>
              <div className="mt-2 text-sm font-semibold leading-snug text-slate-900 dark:text-white">
                {String(s.name || "").replace(/^Sample:\s*/, "")}
              </div>
              <div className="mt-0.5 text-xs text-slate-500 dark:text-adlm-dark-muted">
                {s.sample?.location}
              </div>
              <div className="mt-2 text-xs text-slate-700 dark:text-slate-300">{s.sample?.stage}</div>
              <div className="mt-auto flex flex-wrap items-center gap-x-3 gap-y-1 pt-3 text-[11px] text-slate-500 dark:text-adlm-dark-muted">
                <span>{s.itemCount} lines</span>
                <span>Contract {naira(s.contractSum)}</span>
                <span>
                  {s.certificateCount} cert{s.certificateCount === 1 ? "" : "s"}
                </span>
                {s.hasModel ? (
                  <span className="inline-flex items-center gap-1">
                    <FaCube /> 3D model
                  </span>
                ) : null}
              </div>
            </button>
          ))}
        </div>
      ) : null}
    </section>
  );
}
