import React from "react";
import {
  FaCubes,
  FaHardHat,
  FaTools,
  FaBoxes,
  FaLayerGroup,
  FaSearch,
  FaTimes,
} from "react-icons/fa";
import SectionRail from "./SectionRail.jsx";
import { RateCell } from "./ProjectBillTable.jsx";
import { resolveAll, normalizeTitle } from "../../lib/budgetBillLink.js";

// ─────────────────────────────────────────────────────────────────────
// Project Budget tab — Material & Labour build-up of each Bill line.
//
// The Bill of Quantity is the determinant of the arrangement: every budget
// row is matched back to its bill line (code → Revit element overlap → title),
// then laid out in Bill order and the Bill's sections, with each line's
// material AND labour bundled together. Users can price each row (manually or
// from RateGen) and set a per-line Overhead & Profit %; the resulting
// Bill Rate = Material + Labour + O&P flows up to the BoQ automatically.
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

function isLabour(it) {
  const k = String(it?.componentKind || "").trim().toLowerCase();
  return k === "labour" || k === "labor";
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
  // RateGen search (material + labour) for pricing budget rows.
  onSearchRateGen,
  canRateGen = false,
  contractLocked = false,
}) {
  const [view, setView] = React.useState("breakdown");
  const [leadDays, setLeadDays] = React.useState(14);
  const [query, setQuery] = React.useState("");
  const [saving, setSaving] = React.useState(false);
  // In-progress Overhead/Profit edits, keyed by group — committed on blur.
  const [opDraft, setOpDraft] = React.useState({});
  // Global Overhead/Profit — when set, overrides every item's O&P. Empty = off.
  const [globalOH, setGlobalOH] = React.useState("");
  const [globalPR, setGlobalPR] = React.useState("");

  // The active breakdown source: prefer the consolidated budgetItems[]; fall
  // back to the QUIV materials view. Edits persist as budgetItems either way.
  const sourceLines = React.useMemo(
    () =>
      budgetItems.length
        ? budgetItems
        : materialItems.length
          ? materialItems
          : [],
    [budgetItems, materialItems],
  );

  const isTradeGrouping = String(groupByMode || "category") === "trade";

  // Per-code bill metadata (order/section/qty) for laying groups out like the Bill.
  const billByCode = React.useMemo(() => {
    const m = new Map();
    (items || []).forEach((it, idx) => {
      const code = (it?.code || "").toString().trim().toLowerCase();
      if (!code || m.has(code)) return;
      m.set(code, {
        code: (it?.code || "").toString().trim(),
        order: idx,
        category: (it?.category || "").toString().trim(),
        trade: (it?.trade || "").toString().trim(),
        description: (it?.description || it?.takeoffLine || "").toString().trim(),
        qty: safeNum(it?.qty),
        unit: (it?.unit || "").toString().trim(),
        // The BoQ line's own completion — marking a bill item done on the
        // Bill of Quantity should show its budget build-up as done here too,
        // independent of (and even when locked out of) per-line procurement.
        billCompleted: Boolean(it?.completed) || safeNum(it?.percentComplete) >= 100,
        billPercent: Boolean(it?.completed) ? 100 : safeNum(it?.percentComplete),
      });
    });
    return m;
  }, [items]);

  // Element IDs by line key, harvested from materialItems — lets budgetItems
  // saved before elementIds existed still match the bill by element overlap.
  const elementEnrich = React.useMemo(() => {
    const m = new Map();
    for (const mi of materialItems || []) {
      const eids = Array.isArray(mi?.elementIds) ? mi.elementIds : [];
      if (!eids.length) continue;
      const snKey = `sn:${mi?.sn ?? ""}`;
      const tKey = `t:${normalizeTitle(mi?.materialName)}|${normalizeTitle(
        mi?.unit,
      )}|${normalizeTitle(mi?.takeoffLine)}`;
      if (!m.has(snKey)) m.set(snKey, eids);
      if (!m.has(tKey)) m.set(tKey, eids);
    }
    return m;
  }, [materialItems]);

  const eidsFor = React.useCallback(
    (l) => {
      if (Array.isArray(l?.elementIds) && l.elementIds.length) return l.elementIds;
      return (
        elementEnrich.get(`sn:${l?.sn ?? ""}`) ||
        elementEnrich.get(
          `t:${normalizeTitle(l?.materialName)}|${normalizeTitle(
            l?.unit,
          )}|${normalizeTitle(l?.takeoffLine)}`,
        ) ||
        []
      );
    },
    [elementEnrich],
  );

  const keyOf = (it) =>
    [
      it?.billIdentity || it?.sourceTakeoffCode || "",
      it?.componentKind || "",
      it?.materialName || it?.description || "",
      it?.sn ?? "",
    ].join("|");

  // Build the bill-line groups: every budget row resolved to its bill line,
  // bundled, sorted material → labour, ordered like the Bill.
  const groups = React.useMemo(() => {
    // Two-pass resolve so a work item's materials bundle with its labour (which
    // carries the bill code) even when the materials arrived without one.
    const codes = resolveAll(items, sourceLines, eidsFor);
    const map = new Map();
    let seen = 0;
    sourceLines.forEach((it, idx) => {
      const resolved = codes[idx];
      const lc = resolved ? resolved.toLowerCase() : "";
      const tl = normalizeTitle(it?.takeoffLine || it?.materialName);
      const key = lc || (tl ? `tl:${tl}` : `__${seen}`);
      if (!map.has(key)) {
        const meta = lc ? billByCode.get(lc) : null;
        map.set(key, {
          key,
          code: resolved || "",
          // Linked groups read with the bill line's description; unlinked ones
          // fall back to their own takeoff line.
          label:
            meta?.description ||
            (it?.takeoffLine || "").toString().trim() ||
            groupLabel(it),
          category: meta?.category || (it?.category || "").toString().trim(),
          trade: meta?.trade || (it?.trade || "").toString().trim(),
          order: meta ? meta.order : 1e6 + seen,
          billQty: meta ? meta.qty : 0,
          billUnit: meta ? meta.unit : (it?.unit || "").toString().trim(),
          // Parent BoQ line completion — drives the group's done status so a
          // bill item ticked complete shows as done in the budget breakdown.
          billCompleted: meta ? Boolean(meta.billCompleted) : false,
          billPercent: meta ? safeNum(meta.billPercent) : 0,
          lines: [],
        });
        seen += 1;
      }
      map.get(key).lines.push(it);
    });
    return [...map.values()]
      .map((g) => {
        const lines = [...g.lines].sort(
          (a, b) => kindRank(a?.componentKind) - kindRank(b?.componentKind),
        );
        const net = lines.reduce(
          (a, l) => a + safeNum(l.qty) * safeNum(l.rate),
          0,
        );
        const overheadPercent = lines.reduce(
          (a, l) => Math.max(a, safeNum(l.overheadPercent)),
          0,
        );
        const profitPercent = lines.reduce(
          (a, l) => Math.max(a, safeNum(l.profitPercent)),
          0,
        );
        // When the parent BoQ line is complete, the whole build-up counts as
        // done — the work is done regardless of per-line procurement ticks
        // (which may be frozen by a locked contract). Otherwise fall back to
        // the per-line procured/done count.
        const billDone = Boolean(g.billCompleted);
        const lineDoneCount = lines.filter(lineDone).length;
        const doneCount = billDone ? lines.length : lineDoneCount;
        const procuredCost = billDone
          ? net
          : lines.reduce(
              (a, l) => a + (lineDone(l) ? safeNum(l.qty) * safeNum(l.rate) : 0),
              0,
            );
        return {
          ...g,
          lines,
          net,
          procuredCost,
          overheadPercent,
          profitPercent,
          doneCount,
          total: lines.length,
          allDone: lines.length > 0 && (billDone || lineDoneCount === lines.length),
        };
      })
      .sort((a, b) => a.order - b.order);
  }, [sourceLines, items, billByCode, eidsFor]);

  // Global O&P overrides every item when either field is set.
  const globalActive = globalOH !== "" || globalPR !== "";
  // Effective Overhead/Profit for a group: global override → live draft → saved.
  const effOH = (g) => {
    if (globalActive) return safeNum(globalOH);
    const d = opDraft[g.key]?.overheadPercent;
    return d != null && d !== "" ? safeNum(d) : g.overheadPercent;
  };
  const effPR = (g) => {
    if (globalActive) return safeNum(globalPR);
    const d = opDraft[g.key]?.profitPercent;
    return d != null && d !== "" ? safeNum(d) : g.profitPercent;
  };
  const billAmountOf = (g) => g.net * (1 + (effOH(g) + effPR(g)) / 100);
  const billRateOf = (g) => {
    const amt = billAmountOf(g);
    return g.billQty > 0 ? amt / g.billQty : amt;
  };

  // ── Search filter ────────────────────────────────────────────────────
  // Match the resource (material / labour) name only — NOT the bill-line title
  // — so "cement" returns cement rows, not every row under a concrete line.
  const q = normalizeTitle(query);
  const lineMatches = React.useCallback(
    (l) => {
      if (!q) return true;
      const hay = normalizeTitle(
        [lineName(l), kindMeta(l?.componentKind).label].join(" "),
      );
      return hay.includes(q);
    },
    [q],
  );

  // Bucket groups into the Bill's sections (category, or trade), honouring the
  // same canonical order the Bill uses (+ any custom categories the user added).
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
      // When searching, only keep groups that have a matching line.
      const matched = q ? g.lines.filter(lineMatches) : g.lines;
      if (q && matched.length === 0) continue;
      const cat =
        (isTradeGrouping ? g.trade : g.category).toString().trim() ||
        "Uncategorized";
      if (!map.has(cat)) map.set(cat, []);
      map.get(cat).push({ ...g, shownLines: matched });
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
      cost: s.groups.reduce((a, g) => a + g.net, 0),
    }));
  }, [groups, canonicalSections, isTradeGrouping, q, lineMatches]);

  const hasRealCategories = sections.some(
    (s) => s.category && s.category !== "Uncategorized",
  );

  // Flat search results — each matched resource with the work item (bill line)
  // it belongs to and its section, so a search for "cement" shows where it's used.
  const searchResults = React.useMemo(() => {
    if (!q) return [];
    const out = [];
    for (const g of groups) {
      const section =
        (isTradeGrouping ? g.trade : g.category).toString().trim() ||
        "Uncategorized";
      for (const l of g.lines) {
        if (lineMatches(l)) {
          out.push({ line: l, workItem: g.label, section, key: `${g.key}-${keyOf(l)}` });
        }
      }
    }
    return out;
  }, [q, groups, isTradeGrouping, lineMatches]);

  // Floating Material/Labour total for the active search.
  const floatTotals = React.useMemo(() => {
    if (!q) return null;
    const byKind = new Map();
    for (const l of sourceLines) {
      if (!lineMatches(l)) continue;
      const label = kindMeta(l?.componentKind).label;
      if (!byKind.has(label)) {
        byKind.set(label, {
          label,
          count: 0,
          qtyByUnit: new Map(),
          done: 0,
          priced: 0,
        });
      }
      const e = byKind.get(label);
      e.count += 1;
      const unit = (l?.unit || "").toString().trim() || "—";
      e.qtyByUnit.set(unit, (e.qtyByUnit.get(unit) || 0) + safeNum(l.qty));
      if (lineDone(l)) e.done += 1;
      if (safeNum(l.rate) > 0) e.priced += 1;
    }
    return [...byKind.values()].sort(
      (a, b) => kindRank(a.label.toLowerCase()) - kindRank(b.label.toLowerCase()),
    );
  }, [q, sourceLines, lineMatches]);

  // Does the project carry a breakdown at all?
  const hasBreakdown = React.useMemo(
    () =>
      (sourceLines || []).some(
        (it) =>
          it?.componentKind ||
          it?.sourceTakeoffCode ||
          it?.billIdentity ||
          it?.derived,
      ),
    [sourceLines],
  );

  const budgetTotal = groups.reduce((a, g) => a + g.net, 0);
  const billTotal = groups.reduce((a, g) => a + billAmountOf(g), 0);
  const procuredTotal = groups.reduce((a, g) => a + g.procuredCost, 0);
  const doneTone = "text-emerald-700 dark:text-emerald-400";

  // Editing (procurement + pricing) is available whenever we can save and the
  // contract isn't locked. Persisted as budgetItems regardless of source.
  const canEdit =
    typeof onSaveBudget === "function" && !contractLocked && sourceLines.length > 0;

  async function persist(next) {
    if (saving) return;
    setSaving(true);
    try {
      await onSaveBudget(next);
    } finally {
      setSaving(false);
    }
  }

  function patchLines(predicate, patch) {
    persist(
      sourceLines.map((b) => (predicate(b) ? { ...b, ...patch } : b)),
    );
  }

  function toggleLine(line) {
    const k = keyOf(line);
    const wasDone = lineDone(line);
    patchLines((b) => keyOf(b) === k, {
      procured: !wasDone,
      procuredAt: !wasDone ? new Date().toISOString() : null,
    });
  }

  function markGroup(group, value) {
    const keys = new Set(group.lines.map(keyOf));
    patchLines((b) => keys.has(keyOf(b)), {
      procured: value,
      procuredAt: value ? new Date().toISOString() : null,
    });
  }

  function updateLineRate(line, raw) {
    const k = keyOf(line);
    const rate = safeNum(raw);
    // Same-name price linking: setting a material's rate applies it to ALL materials
    // with the same name (price "Cement" once → every Cement row updates). Materials
    // only (skip Labour); the edited row is included by the same-name match.
    const kind = String(line?.componentKind || "").toLowerCase();
    const name = normalizeTitle(line?.materialName);
    if (name && kind !== "labour" && kind !== "labor") {
      patchLines((b) => {
        const bk = String(b?.componentKind || "").toLowerCase();
        return bk !== "labour" && bk !== "labor" && normalizeTitle(b?.materialName) === name;
      }, { rate });
      return;
    }
    patchLines((b) => keyOf(b) === k, { rate });
  }

  function commitGroupMarkup(group, overheadPercent, profitPercent) {
    const keys = new Set(group.lines.map(keyOf));
    patchLines((b) => keys.has(keyOf(b)), {
      overheadPercent: safeNum(overheadPercent),
      profitPercent: safeNum(profitPercent),
    });
    setOpDraft((prev) => {
      const next = { ...prev };
      delete next[group.key];
      return next;
    });
  }

  // Stamp the global Overhead/Profit onto EVERY line (overrides per-item).
  function commitGlobalMarkup() {
    if (!canEdit) return;
    const oh = safeNum(globalOH);
    const pr = safeNum(globalPR);
    patchLines(() => true, { overheadPercent: oh, profitPercent: pr });
    setOpDraft({});
  }

  // ── Buy schedule — "what to buy & when" ────────────────────────────────
  const buyRows = React.useMemo(() => {
    const tasks = pmDashboard?.tasks || [];
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
    for (const it of sourceLines) {
      if (isLabour(it)) continue;
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
  }, [sourceLines, pmDashboard, leadDays]);

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

  // Section rail wiring.
  const sectionRefs = React.useRef({});
  const topRef = React.useRef(null);
  const bottomRef = React.useRef(null);
  const railSections = React.useMemo(
    () =>
      hasRealCategories
        ? sections.map((s) => ({
            id: `budget-sec-${s.category}`,
            label: s.category,
            badge: isTradeGrouping ? "Trade" : "Cat",
            refGetter: () => sectionRefs.current[s.category] || null,
          }))
        : [],
    [sections, hasRealCategories, isTradeGrouping],
  );
  const scrollToRef = (node) => {
    if (!node) return;
    try {
      node.scrollIntoView({ behavior: "auto", block: "start" });
    } catch {
      node.scrollIntoView();
    }
  };

  function qtyByUnitText(map) {
    return [...map.entries()]
      .map(([u, v]) => `${money(v)} ${u}`)
      .join(" · ");
  }

  function pct(n, d) {
    return d > 0 ? Math.round((n / d) * 100) : 0;
  }

  return (
    <div className="space-y-4">
      {/* Intro + the completion rule. */}
      <div className="rounded-2xl border border-slate-200 dark:border-adlm-dark-border bg-white dark:bg-adlm-dark-panel shadow-depth p-5">
        <div className="text-base font-bold text-slate-900 dark:text-white">
          Material &amp; Labour breakdown
        </div>
        <div className="mt-1 text-sm text-slate-600 dark:text-adlm-dark-muted">
          The build-up of each bill item — its materials and labour shown
          together — arranged in the same order and sections as your Bill of
          Quantity. Price each row (type a rate, paste a <code>=</code>formula,
          or pull from RateGen) and set Overhead &amp; Profit; the
          <b> Bill Rate = Material + Labour + O&amp;P</b> flows up to the BoQ.
        </div>
        <div className="mt-3 rounded-xl border border-blue-200 bg-blue-50 px-3 py-2 text-[11px] text-blue-900">
          A bill item is only complete when <b>every</b> line below it is
          marked procured/done — buying the materials isn’t enough until the
          labour is done too.{" "}
          {canEdit
            ? "Tick a line to mark it procured, or use “Mark all” for a whole bill item."
            : contractLocked
              ? "The contract is locked, so per-line procurement marking is frozen — but bill items you mark complete on the Bill of Quantity now show as done here."
              : sourceLines.length === 0
                ? "Re-save this project from the plugin to load its material & labour breakdown."
                : "You have view-only access, so procurement marking is disabled."}
        </div>
      </div>

      {hasBreakdown ? (
        <div className="flex flex-wrap items-center justify-between gap-3">
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

          {view === "breakdown" ? (
            <div className="relative min-w-[220px] flex-1 max-w-sm">
              <FaSearch className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-xs text-slate-400" />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search material / labour…"
                className="w-full rounded-xl border border-slate-200 bg-white py-2 pl-9 pr-8 text-xs text-slate-900 dark:border-adlm-dark-border dark:bg-white/5 dark:text-white"
              />
              {query ? (
                <button
                  type="button"
                  onClick={() => setQuery("")}
                  className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-slate-400 hover:text-slate-700"
                  title="Clear search"
                >
                  <FaTimes className="text-xs" />
                </button>
              ) : null}
            </div>
          ) : null}
        </div>
      ) : null}

      {hasBreakdown && view === "breakdown" ? (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-2.5 text-xs dark:border-adlm-dark-border dark:bg-white/5">
          <span className="font-semibold text-slate-700 dark:text-adlm-dark-text">
            Global Overhead &amp; Profit
          </span>
          <span className="text-[11px] text-slate-500 dark:text-adlm-dark-muted">
            one rate for every item — overrides each item’s own O&amp;P
          </span>
          <label className="inline-flex items-center gap-1 text-slate-600 dark:text-adlm-dark-muted">
            O/H
            <input
              type="number"
              min="0"
              step="0.5"
              value={globalOH}
              disabled={!canEdit || saving}
              onChange={(e) => setGlobalOH(e.target.value)}
              placeholder="—"
              className="w-14 rounded-md border border-slate-200 bg-white px-1.5 py-0.5 text-right text-slate-900 disabled:opacity-50 dark:border-adlm-dark-border dark:bg-white/5 dark:text-white"
            />
            %
          </label>
          <label className="inline-flex items-center gap-1 text-slate-600 dark:text-adlm-dark-muted">
            Profit
            <input
              type="number"
              min="0"
              step="0.5"
              value={globalPR}
              disabled={!canEdit || saving}
              onChange={(e) => setGlobalPR(e.target.value)}
              placeholder="—"
              className="w-14 rounded-md border border-slate-200 bg-white px-1.5 py-0.5 text-right text-slate-900 disabled:opacity-50 dark:border-adlm-dark-border dark:bg-white/5 dark:text-white"
            />
            %
          </label>
          <button
            type="button"
            disabled={!canEdit || saving || !globalActive}
            onClick={commitGlobalMarkup}
            className="rounded-lg bg-adlm-blue-700 px-2.5 py-1 text-[10px] font-semibold text-white transition hover:bg-adlm-blue-600 disabled:opacity-50"
            title="Write this Overhead & Profit onto every item"
          >
            Apply to all
          </button>
          {globalActive ? (
            <>
              <button
                type="button"
                onClick={() => {
                  setGlobalOH("");
                  setGlobalPR("");
                }}
                className="rounded-lg border border-slate-200 px-2 py-1 text-[10px] font-semibold text-slate-600 transition hover:bg-white dark:border-adlm-dark-border dark:text-adlm-dark-muted"
              >
                Clear
              </button>
              <span className="text-[10px] font-semibold text-adlm-orange">
                Previewing {safeNum(globalOH) + safeNum(globalPR)}% on every item
              </span>
            </>
          ) : null}
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
        <div className="relative flex gap-4">
          {!q && railSections.length > 1 ? (
            <SectionRail
              title="Budget sections"
              sections={railSections}
              scrollOffset={96}
              onScrollTop={() => scrollToRef(topRef.current)}
              onScrollBottom={() => scrollToRef(bottomRef.current)}
            />
          ) : null}

          <div className="min-w-0 flex-1 space-y-5">
            <div ref={topRef} className="scroll-mt-24" aria-hidden="true" />

            {!q && sections.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-slate-300 dark:border-adlm-dark-border bg-slate-50 dark:bg-white/5 p-8 text-center text-sm text-slate-500 dark:text-adlm-dark-muted">
                No build-up on this project yet.
              </div>
            ) : null}

            {/* Search mode — flat results showing each resource's work item + section. */}
            {q ? (
              searchResults.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-slate-300 dark:border-adlm-dark-border bg-slate-50 dark:bg-white/5 p-8 text-center text-sm text-slate-500 dark:text-adlm-dark-muted">
                  No material / labour matches “{query}”.
                </div>
              ) : (
                <div className="overflow-hidden rounded-2xl border border-slate-200 dark:border-adlm-dark-border bg-white dark:bg-adlm-dark-panel shadow-depth">
                  <div className="border-b border-slate-100 dark:border-adlm-dark-border px-4 py-3 text-sm font-semibold text-slate-900 dark:text-white">
                    {searchResults.length} result
                    {searchResults.length === 1 ? "" : "s"} for “{query}”
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs">
                      <thead className="bg-slate-50 dark:bg-white/5 text-left text-slate-600 dark:text-adlm-dark-muted">
                        <tr>
                          <th className="px-3 py-2">Type</th>
                          <th className="px-3 py-2">Resource</th>
                          <th className="px-3 py-2">Work item</th>
                          <th className="px-3 py-2">Section</th>
                          <th className="px-3 py-2">Unit</th>
                          <th className="px-3 py-2 text-right">Qty</th>
                          <th className="px-3 py-2 text-right">Rate</th>
                          <th className="px-3 py-2 text-center">
                            {showMaterials ? "Procured" : "Done"}
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {searchResults.map(({ line: l, workItem, section, key }) => {
                          const meta = kindMeta(l?.componentKind);
                          const Icon = meta.icon;
                          const done = lineDone(l);
                          return (
                            <tr
                              key={key}
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
                              <td className="px-3 py-2 text-slate-700 dark:text-adlm-dark-text">
                                <span className="line-clamp-1" title={workItem}>
                                  {workItem}
                                </span>
                              </td>
                              <td className="px-3 py-2">
                                <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-500 dark:bg-white/10 dark:text-adlm-dark-muted">
                                  {section}
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
              )
            ) : null}

            {!q && sections.map((section) => (
              <div
                key={section.category}
                ref={(el) => {
                  sectionRefs.current[section.category] = el;
                }}
                className="space-y-3 scroll-mt-24"
              >
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

                {section.groups.map((g) => {
                  const oh = effOH(g);
                  const pr = effPR(g);
                  const billAmount = billAmountOf(g);
                  const billRate = billRateOf(g);
                  const shown = g.shownLines || g.lines;
                  return (
                    <div
                      key={g.key}
                      className="overflow-hidden rounded-2xl border border-slate-200 dark:border-adlm-dark-border bg-white dark:bg-adlm-dark-panel shadow-depth"
                    >
                      {/* Bill-line header + rolled-up status. */}
                      <div className="flex flex-wrap items-start justify-between gap-2 border-b border-slate-100 dark:border-adlm-dark-border px-4 py-3">
                        <div className="min-w-0">
                          <div className="truncate text-sm font-semibold text-slate-900 dark:text-white">
                            {g.label}
                          </div>
                          <div className="text-[11px] text-slate-500 dark:text-adlm-dark-muted">
                            {g.total} item{g.total === 1 ? "" : "s"} ·{" "}
                            {showMaterials ? "procured" : "done"} {g.doneCount}/
                            {g.total}
                            {g.billQty > 0 ? (
                              <>
                                {" "}
                                · bill {money(g.billQty)} {g.billUnit}
                              </>
                            ) : null}
                          </div>
                        </div>
                        <div className="flex flex-wrap items-center justify-end gap-x-4 gap-y-1">
                          {/* Overhead / Profit. */}
                          <div className="flex items-center gap-2 text-[10px] text-slate-500 dark:text-adlm-dark-muted">
                            <label className="inline-flex items-center gap-1">
                              O/H
                              <input
                                type="number"
                                min="0"
                                step="0.5"
                                disabled={!canEdit || saving || globalActive}
                                title={
                                  globalActive
                                    ? "Overridden by the global Overhead & Profit above"
                                    : undefined
                                }
                                value={
                                  globalActive
                                    ? safeNum(globalOH)
                                    : opDraft[g.key]?.overheadPercent != null
                                      ? opDraft[g.key].overheadPercent
                                      : g.overheadPercent || ""
                                }
                                onChange={(e) =>
                                  setOpDraft((p) => ({
                                    ...p,
                                    [g.key]: {
                                      ...p[g.key],
                                      overheadPercent: e.target.value,
                                    },
                                  }))
                                }
                                onBlur={() =>
                                  opDraft[g.key] != null
                                    ? commitGroupMarkup(g, oh, pr)
                                    : null
                                }
                                placeholder="0"
                                className="w-12 rounded-md border border-slate-200 bg-white px-1 py-0.5 text-right text-[11px] text-slate-900 disabled:opacity-50 dark:border-adlm-dark-border dark:bg-white/5 dark:text-white"
                              />
                              %
                            </label>
                            <label className="inline-flex items-center gap-1">
                              Profit
                              <input
                                type="number"
                                min="0"
                                step="0.5"
                                disabled={!canEdit || saving || globalActive}
                                title={
                                  globalActive
                                    ? "Overridden by the global Overhead & Profit above"
                                    : undefined
                                }
                                value={
                                  globalActive
                                    ? safeNum(globalPR)
                                    : opDraft[g.key]?.profitPercent != null
                                      ? opDraft[g.key].profitPercent
                                      : g.profitPercent || ""
                                }
                                onChange={(e) =>
                                  setOpDraft((p) => ({
                                    ...p,
                                    [g.key]: {
                                      ...p[g.key],
                                      profitPercent: e.target.value,
                                    },
                                  }))
                                }
                                onBlur={() =>
                                  opDraft[g.key] != null
                                    ? commitGroupMarkup(g, oh, pr)
                                    : null
                                }
                                placeholder="0"
                                className="w-12 rounded-md border border-slate-200 bg-white px-1 py-0.5 text-right text-[11px] text-slate-900 disabled:opacity-50 dark:border-adlm-dark-border dark:bg-white/5 dark:text-white"
                              />
                              %
                            </label>
                          </div>
                          {/* Net + derived bill rate. */}
                          <div className="text-right leading-tight">
                            <div className="text-[10px] text-slate-400 dark:text-adlm-dark-dim">
                              net &#8358;{money(g.net)}
                            </div>
                            <div className="text-sm font-bold text-slate-900 dark:text-white">
                              &#8358;{money(billAmount)}
                            </div>
                            {g.billQty > 0 ? (
                              <div className="text-[10px] text-adlm-orange">
                                rate &#8358;{money(billRate)}/{g.billUnit}
                              </div>
                            ) : null}
                          </div>
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
                          {canEdit ? (
                            <button
                              type="button"
                              disabled={saving}
                              onClick={() => markGroup(g, !g.allDone)}
                              className="rounded-lg border border-slate-200 px-2 py-1 text-[10px] font-semibold text-slate-600 transition hover:bg-slate-50 disabled:opacity-50 dark:border-adlm-dark-border dark:text-adlm-dark-muted dark:hover:bg-white/5"
                              title={
                                g.allDone
                                  ? "Unmark all lines"
                                  : "Mark all lines procured"
                              }
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
                            {shown.map((l) => {
                              const meta = kindMeta(l?.componentKind);
                              const Icon = meta.icon;
                              const amount = safeNum(l.qty) * safeNum(l.rate);
                              const done = lineDone(l);
                              // Read-only indicator also reflects the parent
                              // BoQ line's completion (the checkbox stays tied
                              // to the actual procurement flag the user edits).
                              const displayDone = done || Boolean(g.billCompleted);
                              return (
                                <tr
                                  key={`${g.key}-${keyOf(l)}`}
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
                                    <span
                                      className="line-clamp-1"
                                      title={lineName(l)}
                                    >
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
                                    {canEdit ? (
                                      <div className="ml-auto w-28">
                                        <RateCell
                                          value={
                                            safeNum(l.rate) ? l.rate : ""
                                          }
                                          placeholder="0"
                                          onChange={(v) => updateLineRate(l, v)}
                                          onSearchRateGen={onSearchRateGen}
                                          canRateGenBoq={Boolean(
                                            canRateGen && onSearchRateGen,
                                          )}
                                          boqCandidates={[]}
                                          itemUnit={l?.unit || ""}
                                          itemDescription={lineName(l)}
                                        />
                                      </div>
                                    ) : (
                                      money(l?.rate)
                                    )}
                                  </td>
                                  <td className="px-3 py-2 text-right font-semibold text-slate-900 dark:text-white">
                                    {money(amount)}
                                  </td>
                                  <td className="px-3 py-2 text-center">
                                    {canEdit ? (
                                      <input
                                        type="checkbox"
                                        checked={done}
                                        disabled={saving}
                                        onChange={() => toggleLine(l)}
                                        className="h-4 w-4 cursor-pointer accent-emerald-600 disabled:opacity-50"
                                        title={
                                          done
                                            ? "Mark not procured"
                                            : "Mark procured"
                                        }
                                      />
                                    ) : displayDone ? (
                                      <span
                                        className={`font-semibold ${doneTone}`}
                                      >
                                        ✓
                                      </span>
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
                  );
                })}
              </div>
            ))}

            {/* Compact totals. */}
            <div className="flex flex-wrap items-center justify-end gap-x-6 gap-y-1 rounded-2xl border border-slate-200 dark:border-adlm-dark-border bg-slate-50 dark:bg-white/5 px-5 py-3 text-sm">
              <span className="text-slate-600 dark:text-adlm-dark-muted">
                {showMaterials ? "Procured" : "Done"} to date:{" "}
                <b className="text-slate-900 dark:text-white">
                  &#8358;{money(procuredTotal)}
                </b>
              </span>
              <span className="text-slate-600 dark:text-adlm-dark-muted">
                Net build-up:{" "}
                <b className="text-slate-900 dark:text-white">
                  &#8358;{money(budgetTotal)}
                </b>
              </span>
              <span className="text-slate-600 dark:text-adlm-dark-muted">
                Bill total (incl. O&amp;P):{" "}
                <b className="text-adlm-orange">&#8358;{money(billTotal)}</b>
              </span>
            </div>

            <div ref={bottomRef} aria-hidden="true" />
          </div>
        </div>
      )}

      {/* Floating Material/Labour total for the active search. */}
      {view === "breakdown" && floatTotals && floatTotals.length ? (
        <div className="fixed bottom-6 left-6 z-30 w-72 rounded-2xl border border-slate-200 bg-white/95 p-3 shadow-depth backdrop-blur dark:border-adlm-dark-border dark:bg-adlm-dark-panel/95">
          <div className="mb-2 flex items-center justify-between">
            <span className="text-xs font-bold text-slate-900 dark:text-white">
              “{query}” totals
            </span>
            <button
              type="button"
              onClick={() => setQuery("")}
              className="rounded p-0.5 text-slate-400 hover:text-slate-700"
              title="Clear"
            >
              <FaTimes className="text-[10px]" />
            </button>
          </div>
          <div className="space-y-2">
            {floatTotals.map((t) => (
              <div
                key={t.label}
                className="rounded-xl border border-slate-100 bg-slate-50 px-3 py-2 dark:border-adlm-dark-border dark:bg-white/5"
              >
                <div className="flex items-center justify-between text-[11px] font-semibold text-slate-800 dark:text-adlm-dark-text">
                  <span>{t.label}</span>
                  <span className="text-slate-500 dark:text-adlm-dark-muted">
                    {t.count} item{t.count === 1 ? "" : "s"}
                  </span>
                </div>
                <div className="mt-0.5 text-[11px] text-slate-600 dark:text-adlm-dark-muted">
                  Qty: <b>{qtyByUnitText(t.qtyByUnit)}</b>
                </div>
                <div className="mt-0.5 flex items-center gap-3 text-[10px]">
                  <span className="text-emerald-700 dark:text-emerald-400">
                    {pct(t.done, t.count)}% available
                  </span>
                  <span className="text-adlm-blue-700 dark:text-adlm-blue-300">
                    {pct(t.priced, t.count)}% priced
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}
