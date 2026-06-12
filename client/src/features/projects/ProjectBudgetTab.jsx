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
    Boolean(it?.procured || it?.purchased || it?.completed) ||
    safeNum(it?.procuredPercent) >= 100 ||
    safeNum(it?.percentComplete) >= 100
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
    (it?.takeoffLine || it?.sourceTakeoffCode || it?.billIdentity || it?.description || "")
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

// Order resources within a bill item so material and labour read together:
// materials first, then labour, then plant / consumable / equipment, others
// last. Array.sort is stable, so lines keep their order inside each kind.
const KIND_ORDER = { material: 0, labour: 1, labor: 1, plant: 2, consumable: 3, equipment: 4 };
function kindRank(kind) {
  const k = String(kind || "").trim().toLowerCase();
  return KIND_ORDER[k] ?? 5;
}

// The bill line a breakdown row belongs to. budgetItems carry billIdentity,
// QUIV materialItems carry sourceTakeoffCode; both equal the bill item's code.
function billCode(it) {
  return (
    (it?.billIdentity || "").toString().trim() ||
    (it?.sourceTakeoffCode || "").toString().trim() ||
    (it?.code || "").toString().trim()
  )
    .toString()
    .toLowerCase();
}

export default function ProjectBudgetTab({
  items = [],
  budgetItems = [],
  materialItems = [],
  pmDashboard = null,
  onSaveBudget,
  showMaterials = false,
  // The Bill's grouping, so the budget can be arranged the same way.
  categoryOptions = [],
  tradeOptions = [],
  groupByMode = "category",
}) {
  // Map every bill line (items[] is the Bill, in bill order) to its place +
  // section, so the budget can mirror the Bill: code → {order, category,
  // trade, description}. Breakdown rows link back via billCode() === code.
  const billMeta = React.useMemo(() => {
    const m = new Map();
    (items || []).forEach((it, idx) => {
      const code = (it?.code || "").toString().trim().toLowerCase();
      if (!code || m.has(code)) return; // first occurrence sets the order
      m.set(code, {
        order: idx,
        category: (it?.category || "").toString().trim(),
        trade: (it?.trade || "").toString().trim(),
        description: (it?.description || it?.takeoffLine || "").toString().trim(),
      });
    });
    return m;
  }, [items]);

  // Group breakdown rows under their parent bill line. Prefer the
  // consolidated budgetItems[] (material + labour folded onto the unified
  // project); fall back to the project's own items (materials view). Each
  // group inherits the Bill order + section of the line it belongs to, and
  // its rows are sorted material → labour so the two read together.
  const groups = React.useMemo(() => {
    const source = budgetItems.length
      ? budgetItems
      : materialItems.length
        ? materialItems
        : items;
    const map = new Map();
    let seen = 0;
    for (const it of source || []) {
      const code = billCode(it);
      const tl = (it?.takeoffLine || "").toString().trim().toLowerCase();
      const key = code || (tl ? `tl:${tl}` : "") || "__unlinked__";
      if (!map.has(key)) {
        const meta = code ? billMeta.get(code) : null;
        map.set(key, {
          key,
          label:
            (it?.takeoffLine || "").toString().trim() ||
            meta?.description ||
            groupLabel(it),
          category: meta?.category || (it?.category || "").toString().trim(),
          trade: meta?.trade || (it?.trade || "").toString().trim(),
          // Linked groups follow the Bill order; unlinked ones trail it in
          // first-seen order.
          order: meta ? meta.order : 1e6 + seen,
          lines: [],
        });
        seen += 1;
      }
      map.get(key).lines.push(it);
    }
    return [...map.values()]
      .map((g) => {
        const lines = [...g.lines].sort(
          (a, b) => kindRank(a?.componentKind) - kindRank(b?.componentKind),
        );
        const cost = lines.reduce(
          (a, l) => a + safeNum(l.qty) * safeNum(l.rate),
          0,
        );
        const procuredCost = lines.reduce(
          (a, l) => a + (lineDone(l) ? safeNum(l.qty) * safeNum(l.rate) : 0),
          0,
        );
        const doneCount = lines.filter(lineDone).length;
        return {
          ...g,
          lines,
          cost,
          procuredCost,
          doneCount,
          total: lines.length,
          allDone: lines.length > 0 && doneCount === lines.length,
        };
      })
      .sort((a, b) => a.order - b.order);
  }, [items, budgetItems, materialItems, billMeta]);

  // Bucket the bill-line groups into the Bill's sections (category, or trade
  // when the Bill is in trade mode), honouring the same canonical order the
  // Bill uses. Mirrors ProjectBillTable's groupedRows.
  const isTradeGrouping = String(groupByMode || "category") === "trade";
  const canonicalSections = React.useMemo(
    () =>
      isTradeGrouping
        ? Array.isArray(tradeOptions)
          ? tradeOptions
          : []
        : Array.isArray(categoryOptions)
          ? categoryOptions
          : [],
    [isTradeGrouping, tradeOptions, categoryOptions],
  );
  const sections = React.useMemo(() => {
    const map = new Map();
    for (const g of groups) {
      const cat =
        (isTradeGrouping ? g.trade : g.category).toString().trim() ||
        "Uncategorized";
      if (!map.has(cat)) map.set(cat, []);
      map.get(cat).push(g);
    }
    const ordered = [
      ...canonicalSections
        .filter((c) => map.has(c))
        .map((c) => ({ category: c, groups: map.get(c) })),
      ...[...map.entries()]
        .filter(([c]) => !canonicalSections.includes(c))
        .map(([c, gs]) => ({ category: c, groups: gs })),
    ];
    return ordered.map((s) => ({
      ...s,
      cost: s.groups.reduce((a, g) => a + g.cost, 0),
    }));
  }, [groups, canonicalSections, isTradeGrouping]);

  // Only show section headers when the Bill actually carries sections —
  // otherwise (e.g. a bare QUIV materials push) keep the clean flat list.
  const hasRealCategories = sections.some(
    (s) => s.category && s.category !== "Uncategorized",
  );

  // Does the project carry a breakdown? (Unified budgetItems[] or a
  // materials-view items[] both qualify; a pure takeoff/bill view does not.)
  const hasBreakdown = React.useMemo(() => {
    const source = budgetItems.length
      ? budgetItems
      : materialItems.length
        ? materialItems
        : items;
    return (source || []).some(
      (it) =>
        it?.componentKind ||
        it?.sourceTakeoffCode ||
        it?.billIdentity ||
        it?.derived,
    );
  }, [items, budgetItems, materialItems]);

  const budgetTotal = groups.reduce((a, g) => a + g.cost, 0);
  const procuredTotal = groups.reduce((a, g) => a + g.procuredCost, 0);
  const doneTone = "text-emerald-700 dark:text-emerald-400";

  // Procurement marking is enabled only when budgetItems[] is the canonical
  // source (the unified bill project). In the materials-view fallback we stay
  // read-only — that surface has its own purchased flow.
  const canMark = budgetItems.length > 0 && typeof onSaveBudget === "function";
  const [saving, setSaving] = React.useState(false);

  const keyOf = (it) =>
    [
      it?.billIdentity || it?.sourceTakeoffCode || "",
      it?.componentKind || "",
      it?.materialName || it?.description || "",
      it?.sn ?? "",
    ].join("|");

  async function persist(next) {
    if (saving) return;
    setSaving(true);
    try {
      await onSaveBudget(next);
    } finally {
      setSaving(false);
    }
  }

  // Toggle one budget line procured (autosaves).
  function toggleLine(line) {
    const k = keyOf(line);
    const wasDone = lineDone(line);
    persist(
      budgetItems.map((b) =>
        keyOf(b) === k
          ? {
              ...b,
              procured: !wasDone,
              procuredAt: !wasDone ? new Date().toISOString() : null,
            }
          : b,
      ),
    );
  }

  // Mark every line under one bill item — the down-cascade ("mark the bill
  // item complete -> the whole breakdown is procured").
  function markGroup(group, value) {
    const keys = new Set(group.lines.map(keyOf));
    persist(
      budgetItems.map((b) =>
        keys.has(keyOf(b))
          ? {
              ...b,
              procured: value,
              procuredAt: value ? new Date().toISOString() : null,
            }
          : b,
      ),
    );
  }

  // ── Buy schedule (3c) — "what to buy & when" ──────────────────────────
  // Need-on-site = earliest Program-of-Works (WBS) task start linked to a
  // material's bill line; Buy-by = need-on-site − lead time. Labour is
  // scheduled, not bought, so it's excluded.
  const [view, setView] = React.useState("breakdown");
  const [leadDays, setLeadDays] = React.useState(14);

  const buyRows = React.useMemo(() => {
    const src = budgetItems.length
      ? budgetItems
      : materialItems.length
        ? materialItems
        : items;
    const tasks = pmDashboard?.tasks || [];
    // Map a bill code -> earliest linked task start. Task identities are
    // "sn::code::desc::…", so the code is the second segment.
    const codeToStart = new Map();
    for (const t of tasks) {
      const s = t?.startDate ? new Date(t.startDate) : null;
      if (!s || Number.isNaN(s.getTime())) continue;
      for (const ident of t?.linkedBoqIdentities || []) {
        const norm = String(ident).split("::")[1];
        const code = (norm || "").trim().toLowerCase();
        if (!code) continue;
        const cur = codeToStart.get(code);
        if (!cur || s < cur) codeToStart.set(code, s);
      }
    }
    const rows = [];
    for (const it of src || []) {
      const kind = String(it?.componentKind || "").toLowerCase();
      if (kind === "labour" || kind === "labor") continue;
      const code = String(it?.billIdentity || it?.sourceTakeoffCode || "")
        .trim()
        .toLowerCase();
      const needBy = code ? codeToStart.get(code) || null : null;
      const buyBy = needBy
        ? new Date(needBy.getTime() - leadDays * 86400000)
        : null;
      rows.push({
        key: keyOf(it),
        name: lineName(it),
        qty: safeNum(it?.qty),
        unit: it?.unit || "",
        forLine: groupLabel(it),
        needBy,
        buyBy,
        done: lineDone(it),
      });
    }
    rows.sort((a, b) => {
      if (a.buyBy && b.buyBy) return a.buyBy - b.buyBy;
      if (a.buyBy) return -1;
      if (b.buyBy) return 1;
      return 0;
    });
    return rows;
  }, [budgetItems, materialItems, items, pmDashboard, leadDays]);

  const scheduledCount = buyRows.filter((r) => r.buyBy).length;

  function fmtDate(d) {
    if (!d) return "—";
    try {
      return d.toLocaleDateString(undefined, {
        day: "numeric",
        month: "short",
        year: "numeric",
      });
    } catch {
      return "—";
    }
  }

  return (
    <div className="space-y-4">
      {/* Intro + the completion rule. Intentionally light — no dashboard. */}
      <div className="rounded-2xl border border-slate-200 dark:border-adlm-dark-border bg-white dark:bg-adlm-dark-panel shadow-depth p-5">
        <div className="text-base font-bold text-slate-900 dark:text-white">
          Material &amp; Labour breakdown
        </div>
        <div className="mt-1 text-sm text-slate-600 dark:text-adlm-dark-muted">
          The build-up of each bill item — its materials, labour and plant
          shown together — pushed from your QUIV / Heron save and arranged in
          the same order and sections as your Bill of Quantity.
        </div>
        <div className="mt-3 rounded-xl border border-blue-200 bg-blue-50 px-3 py-2 text-[11px] text-blue-900">
          A bill item is only complete when <b>every</b> line below it is
          marked procured/done — buying the materials isn’t enough until the
          labour is done too.{" "}
          {canMark
            ? "Tick a line to mark it procured, or use “Mark all” to procure a whole bill item’s breakdown."
            : "Re-save this project from the plugin to enable procurement marking here."}
        </div>
      </div>

      {hasBreakdown ? (
        <div className="inline-flex rounded-xl border border-slate-200 bg-slate-100 p-1 dark:border-adlm-dark-border dark:bg-white/5">
          {[
            { id: "breakdown", label: "Breakdown" },
            { id: "schedule", label: "Buy schedule" },
          ].map((opt) => {
            const active = view === opt.id;
            return (
              <button
                key={opt.id}
                type="button"
                onClick={() => setView(opt.id)}
                className={[
                  "rounded-lg px-3.5 py-1.5 text-xs font-semibold transition",
                  active
                    ? "bg-white text-adlm-blue-700 shadow-sm dark:bg-adlm-dark-panel dark:text-adlm-blue-300"
                    : "text-slate-600 hover:text-slate-900 dark:text-adlm-dark-muted dark:hover:text-white",
                ].join(" ")}
              >
                {opt.label}
              </button>
            );
          })}
        </div>
      ) : null}

      {!hasBreakdown ? (
        <div className="rounded-2xl border border-dashed border-slate-300 dark:border-adlm-dark-border bg-slate-50 dark:bg-white/5 p-8 text-center text-sm text-slate-500 dark:text-adlm-dark-muted">
          No material &amp; labour breakdown on this project yet. The breakdown
          is generated when you save from the Revit plugin (QUIV / Heron) and
          appears in the <span className="font-semibold">Materials</span> view.
        </div>
      ) : view === "schedule" ? (
        <div className="overflow-hidden rounded-2xl border border-slate-200 dark:border-adlm-dark-border bg-white dark:bg-adlm-dark-panel shadow-depth">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 dark:border-adlm-dark-border px-4 py-3">
            <div className="min-w-0">
              <div className="text-sm font-semibold text-slate-900 dark:text-white">
                Procurement buy schedule
              </div>
              <div className="text-[11px] text-slate-500 dark:text-adlm-dark-muted">
                What to buy &amp; when — materials timed off the Program of
                Works. {scheduledCount} of {buyRows.length} dated.
              </div>
            </div>
            <label className="inline-flex items-center gap-1.5 text-[11px] text-slate-600 dark:text-adlm-dark-muted">
              Lead time
              <input
                type="number"
                min="0"
                value={leadDays}
                onChange={(e) =>
                  setLeadDays(Math.max(0, Number(e.target.value) || 0))
                }
                className="w-16 rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs text-slate-900 dark:border-adlm-dark-border dark:bg-white/5 dark:text-white"
              />
              days
            </label>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="bg-slate-50 dark:bg-white/5 text-left text-slate-600 dark:text-adlm-dark-muted">
                <tr>
                  <th className="px-3 py-2">Buy by</th>
                  <th className="px-3 py-2">Need on site</th>
                  <th className="px-3 py-2">Material</th>
                  <th className="px-3 py-2 text-right">Qty</th>
                  <th className="px-3 py-2">Unit</th>
                  <th className="px-3 py-2">For</th>
                  <th className="px-3 py-2 text-center">Procured</th>
                </tr>
              </thead>
              <tbody>
                {buyRows.length === 0 ? (
                  <tr>
                    <td
                      colSpan={7}
                      className="px-3 py-6 text-center text-slate-500 dark:text-adlm-dark-muted"
                    >
                      No materials to buy on this project.
                    </td>
                  </tr>
                ) : (
                  buyRows.map((r) => (
                    <tr
                      key={r.key}
                      className={[
                        "border-t border-slate-100 dark:border-adlm-dark-border",
                        r.done ? "opacity-60" : "",
                      ].join(" ")}
                    >
                      <td className="px-3 py-2 font-semibold text-slate-900 dark:text-white">
                        {r.buyBy ? (
                          fmtDate(r.buyBy)
                        ) : (
                          <span className="text-slate-400 dark:text-adlm-dark-dim">
                            Not scheduled
                          </span>
                        )}
                      </td>
                      <td className="px-3 py-2 text-slate-600 dark:text-adlm-dark-muted">
                        {fmtDate(r.needBy)}
                      </td>
                      <td className="px-3 py-2 font-medium text-slate-800 dark:text-adlm-dark-text">
                        <span className="line-clamp-1" title={r.name}>
                          {r.name}
                        </span>
                      </td>
                      <td className="px-3 py-2 text-right text-slate-700 dark:text-adlm-dark-text">
                        {money(r.qty)}
                      </td>
                      <td className="px-3 py-2 text-slate-600 dark:text-adlm-dark-muted">
                        {r.unit}
                      </td>
                      <td className="px-3 py-2 text-slate-500 dark:text-adlm-dark-muted">
                        <span className="line-clamp-1" title={r.forLine}>
                          {r.forLine}
                        </span>
                      </td>
                      <td className="px-3 py-2 text-center">
                        {r.done ? (
                          <span className="font-semibold text-emerald-700 dark:text-emerald-400">
                            ✓
                          </span>
                        ) : (
                          <span className="text-slate-300 dark:text-adlm-dark-dim">
                            —
                          </span>
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
          <div className="border-t border-slate-100 dark:border-adlm-dark-border px-4 py-2 text-[11px] text-slate-500 dark:text-adlm-dark-muted">
            “Need on site” is the earliest Program-of-Works task linked to each
            item’s bill line; “Buy by” subtracts the lead time. Link bill lines
            to tasks on the PM Dashboard to schedule the “Not scheduled” items.
          </div>
        </div>
      ) : (
        <div className="space-y-5">
          {sections.map((section) => (
            <div key={section.category} className="space-y-3">
              {hasRealCategories ? (
                <div className="flex items-center justify-between gap-2 px-1 pt-1">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold uppercase tracking-wide text-slate-500 dark:text-adlm-dark-muted">
                      {section.category}
                    </span>
                    <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-500 dark:bg-white/10 dark:text-adlm-dark-muted">
                      {section.groups.length} item
                      {section.groups.length === 1 ? "" : "s"}
                    </span>
                  </div>
                  <span className="text-xs font-semibold text-slate-600 dark:text-adlm-dark-muted">
                    &#8358;{money(section.cost)}
                  </span>
                </div>
              ) : null}
              {section.groups.map((g) => (
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
                  {canMark ? (
                    <button
                      type="button"
                      disabled={saving}
                      onClick={() => markGroup(g, !g.allDone)}
                      className="rounded-lg border border-slate-200 px-2 py-1 text-[10px] font-semibold text-slate-600 transition hover:bg-slate-50 disabled:opacity-50 dark:border-adlm-dark-border dark:text-adlm-dark-muted dark:hover:bg-white/5"
                      title={g.allDone ? "Unmark all lines" : "Mark all lines procured"}
                    >
                      {g.allDone ? "Unmark all" : "Mark all"}
                    </button>
                  ) : null}
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
                            {canMark ? (
                              <input
                                type="checkbox"
                                checked={done}
                                disabled={saving}
                                onChange={() => toggleLine(l)}
                                className="h-4 w-4 cursor-pointer accent-emerald-600 disabled:opacity-50"
                                title={done ? "Mark not procured" : "Mark procured"}
                              />
                            ) : done ? (
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
