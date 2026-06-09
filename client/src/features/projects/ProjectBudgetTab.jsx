import React from "react";
import { FaCubes, FaHardHat, FaTools, FaBoxes, FaLayerGroup } from "react-icons/fa";

// ─────────────────────────────────────────────────────────────────────
// Project Budget tab — Material & Labour breakdown
//
// The budget is the material + labour build-up of each Bill of Quantity
// item, pushed by the desktop plugins (QUIV / Heron / ADLM) during save.
// One bill line explodes into several budget lines: its materials, its
// labour, plant, etc. Each breakdown row links back to its bill item via
// `sourceTakeoffCode` (= the bill item's `code`) and is classified by
// `componentKind`.
//
// Completion linkage (interactive marking lands in the next phase):
//   • A bill item is only 100% when EVERY line below it is done/procured —
//     fully buying the materials isn't "done" until the labour is too.
//   • Marking the bill item complete cascades down and marks every line.
// ─────────────────────────────────────────────────────────────────────

function safeNum(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function money(v) {
  return safeNum(v).toLocaleString(undefined, { maximumFractionDigits: 2 });
}

function lineDone(it) {
  return (
    Boolean(it?.purchased || it?.completed) || safeNum(it?.percentComplete) >= 100
  );
}

// componentKind → label + visual treatment.
const KIND_META = {
  material: { label: "Material", icon: FaCubes, cls: "bg-amber-100 text-amber-800" },
  labour: { label: "Labour", icon: FaHardHat, cls: "bg-blue-100 text-blue-800" },
  labor: { label: "Labour", icon: FaHardHat, cls: "bg-blue-100 text-blue-800" },
  plant: { label: "Plant", icon: FaTools, cls: "bg-violet-100 text-violet-800" },
  equipment: { label: "Equipment", icon: FaTools, cls: "bg-violet-100 text-violet-800" },
  consumable: { label: "Consumable", icon: FaBoxes, cls: "bg-emerald-100 text-emerald-800" },
};

function kindMeta(kind) {
  const key = String(kind || "").trim().toLowerCase();
  return (
    KIND_META[key] || {
      label: kind ? String(kind) : "Item",
      icon: FaLayerGroup,
      cls: "bg-slate-100 text-slate-700",
    }
  );
}

function groupLabel(it) {
  return (
    (it?.takeoffLine || it?.sourceTakeoffCode || it?.description || "")
      .toString()
      .trim() || "Unlinked lines"
  );
}

function lineName(it) {
  return (
    (it?.materialName || it?.description || it?.takeoffLine || "")
      .toString()
      .trim() || "(unnamed)"
  );
}

export default function ProjectBudgetTab({ items = [], showMaterials = false }) {
  // Group breakdown rows under their parent bill line (sourceTakeoffCode).
  const groups = React.useMemo(() => {
    const map = new Map();
    for (const it of items || []) {
      const key =
        (it?.sourceTakeoffCode || "").toString().trim() ||
        (it?.takeoffLine || "").toString().trim() ||
        (it?.code || "").toString().trim() ||
        "__unlinked__";
      if (!map.has(key)) {
        map.set(key, { key, label: groupLabel(it), lines: [] });
      }
      map.get(key).lines.push(it);
    }
    return [...map.values()].map((g) => {
      const cost = g.lines.reduce(
        (a, l) => a + safeNum(l.qty) * safeNum(l.rate),
        0,
      );
      const procuredCost = g.lines.reduce(
        (a, l) => a + (lineDone(l) ? safeNum(l.qty) * safeNum(l.rate) : 0),
        0,
      );
      const doneCount = g.lines.filter(lineDone).length;
      return {
        ...g,
        cost,
        procuredCost,
        doneCount,
        total: g.lines.length,
        allDone: g.lines.length > 0 && doneCount === g.lines.length,
      };
    });
  }, [items]);

  // Does the current project actually carry a breakdown? (Materials view
  // does; a pure takeoff/bill view does not.)
  const hasBreakdown = React.useMemo(
    () =>
      (items || []).some(
        (it) => it?.componentKind || it?.sourceTakeoffCode || it?.derived,
      ),
    [items],
  );

  const budgetTotal = groups.reduce((a, g) => a + g.cost, 0);
  const procuredTotal = groups.reduce((a, g) => a + g.procuredCost, 0);
  const doneTone = "text-emerald-700 dark:text-emerald-400";

  return (
    <div className="space-y-4">
      {/* Intro + the completion rule. Intentionally light — no dashboard. */}
      <div className="rounded-2xl border border-slate-200 dark:border-adlm-dark-border bg-white dark:bg-adlm-dark-panel shadow-depth p-5">
        <div className="text-base font-bold text-slate-900 dark:text-white">
          Material &amp; Labour breakdown
        </div>
        <div className="mt-1 text-sm text-slate-600 dark:text-adlm-dark-muted">
          The build-up of each bill item — its materials, labour and plant —
          pushed from your QUIV / Heron save and linked back to the bill.
        </div>
        <div className="mt-3 rounded-xl border border-blue-200 bg-blue-50 px-3 py-2 text-[11px] text-blue-900">
          A bill item is only complete when <b>every</b> line below it is
          marked done/procured — buying the materials isn’t enough until the
          labour is done too. Marking the bill item complete will mark all of
          its lines. <b>Interactive marking arrives in the next phase.</b>
        </div>
      </div>

      {!hasBreakdown ? (
        <div className="rounded-2xl border border-dashed border-slate-300 dark:border-adlm-dark-border bg-slate-50 dark:bg-white/5 p-8 text-center text-sm text-slate-500 dark:text-adlm-dark-muted">
          No material &amp; labour breakdown on this project yet. The breakdown
          is generated when you save from the Revit plugin (QUIV / Heron) and
          appears in the <span className="font-semibold">Materials</span> view.
        </div>
      ) : (
        <div className="space-y-3">
          {groups.map((g) => (
            <div
              key={g.key}
              className="overflow-hidden rounded-2xl border border-slate-200 dark:border-adlm-dark-border bg-white dark:bg-adlm-dark-panel shadow-depth"
            >
              {/* Bill-line header + rolled-up status. */}
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 dark:border-adlm-dark-border px-4 py-3">
                <div className="min-w-0">
                  <div className="truncate text-sm font-semibold text-slate-900 dark:text-white">
                    {g.label}
                  </div>
                  <div className="text-[11px] text-slate-500 dark:text-adlm-dark-muted">
                    {g.total} line{g.total === 1 ? "" : "s"} ·{" "}
                    {showMaterials ? "procured" : "done"} {g.doneCount}/{g.total}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-sm font-bold text-slate-900 dark:text-white">
                    &#8358;{money(g.cost)}
                  </span>
                  <span
                    className={[
                      "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide",
                      g.allDone
                        ? "bg-emerald-100 text-emerald-800"
                        : g.doneCount > 0
                          ? "bg-amber-100 text-amber-800"
                          : "bg-slate-200 text-slate-600 dark:bg-white/10 dark:text-adlm-dark-muted",
                    ].join(" ")}
                  >
                    {g.allDone
                      ? "Complete"
                      : g.doneCount > 0
                        ? "Part"
                        : "Pending"}
                  </span>
                </div>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead className="bg-slate-50 dark:bg-white/5 text-left text-slate-600 dark:text-adlm-dark-muted">
                    <tr>
                      <th className="px-3 py-2">Type</th>
                      <th className="px-3 py-2">Resource</th>
                      <th className="px-3 py-2">Unit</th>
                      <th className="px-3 py-2 text-right">Qty</th>
                      <th className="px-3 py-2 text-right">Rate</th>
                      <th className="px-3 py-2 text-right">Amount</th>
                      <th className="px-3 py-2 text-center">
                        {showMaterials ? "Procured" : "Done"}
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {g.lines.map((l, i) => {
                      const meta = kindMeta(l?.componentKind);
                      const Icon = meta.icon;
                      const amount = safeNum(l.qty) * safeNum(l.rate);
                      const done = lineDone(l);
                      return (
                        <tr
                          key={`${g.key}-${i}`}
                          className="border-t border-slate-100 dark:border-adlm-dark-border"
                        >
                          <td className="px-3 py-2">
                            <span
                              className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold ${meta.cls}`}
                            >
                              <Icon className="text-[9px]" />
                              {meta.label}
                            </span>
                          </td>
                          <td className="px-3 py-2 font-medium text-slate-800 dark:text-adlm-dark-text">
                            <span className="line-clamp-1" title={lineName(l)}>
                              {lineName(l)}
                            </span>
                          </td>
                          <td className="px-3 py-2 text-slate-600 dark:text-adlm-dark-muted">
                            {l?.unit || ""}
                          </td>
                          <td className="px-3 py-2 text-right text-slate-700 dark:text-adlm-dark-text">
                            {money(l?.qty)}
                          </td>
                          <td className="px-3 py-2 text-right text-slate-700 dark:text-adlm-dark-text">
                            {money(l?.rate)}
                          </td>
                          <td className="px-3 py-2 text-right font-semibold text-slate-900 dark:text-white">
                            {money(amount)}
                          </td>
                          <td className="px-3 py-2 text-center">
                            {done ? (
                              <span className={`font-semibold ${doneTone}`}>✓</span>
                            ) : (
                              <span className="text-slate-300 dark:text-adlm-dark-dim">
                                —
                              </span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          ))}

          {/* Compact totals — a single line, not a dashboard. */}
          <div className="flex flex-wrap items-center justify-end gap-x-6 gap-y-1 rounded-2xl border border-slate-200 dark:border-adlm-dark-border bg-slate-50 dark:bg-white/5 px-5 py-3 text-sm">
            <span className="text-slate-600 dark:text-adlm-dark-muted">
              {showMaterials ? "Procured" : "Done"} to date:{" "}
              <b className="text-slate-900 dark:text-white">
                &#8358;{money(procuredTotal)}
              </b>
            </span>
            <span className="text-slate-600 dark:text-adlm-dark-muted">
              Budget total:{" "}
              <b className="text-adlm-orange">&#8358;{money(budgetTotal)}</b>
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
