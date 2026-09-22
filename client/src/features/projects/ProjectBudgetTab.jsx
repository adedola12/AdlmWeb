import React from "react";
import { FaBoxes, FaCubes, FaHardHat, FaLayerGroup, FaTimes, FaTools } from "../../components/icons.jsx";
import SectionRail from "./SectionRail.jsx";
import { RateCell } from "./ProjectBillTable.jsx";
import { resolveAll, normalizeTitle } from "../../lib/budgetBillLink.js";
import {
  buyByDate,
  buyScheduleGroups,
  clampLeadDays,
} from "../../lib/buySchedule.js";

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

function naira(v) {
  return "₦" + money(v);
}

function lineDone(it) {
  return (
    Boolean(it?.procured || it?.purchased || it?.completed) ||
    safeNum(it?.procuredPercent) >= 100 ||
    safeNum(it?.percentComplete) >= 100
  );
}

// componentKind → label + visual treatment.
// His four palettes, one per resource kind, for his .wk-src chips.
function tone(pal) {
  return {
    background: `var(--pal-${pal}-wash)`,
    color: `var(--pal-${pal}-key)`,
    borderColor: `var(--pal-${pal}-line)`,
  };
}
const NO_MB = { marginBottom: 0 };
// A slim toolbar panel: his card, laid out as one wrapping row.
const STRIP = {
  marginBottom: 0,
  display: "flex",
  flexWrap: "wrap",
  alignItems: "center",
  gap: "8px 12px",
  padding: "12px 16px",
};
const INLINE_FIELD = { display: "inline-flex", alignItems: "center", gap: 4 };
const STRIP_TITLE = { padding: 0 };
const WARN_TEXT = { color: "var(--pal-orange-key)" };
const TRUNCATE = { overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" };
// The search totals float over the page, so they take a solid ground.
const FLOAT = {
  position: "fixed",
  bottom: 24,
  left: 24,
  zIndex: 30,
  width: 288,
  padding: 12,
  marginBottom: 0,
  backgroundColor: "var(--bg)",
  boxShadow: "var(--shadow-c)",
};

const KIND_META = {
  material: { label: "Material", icon: FaCubes, tone: tone("orange") },
  labour: { label: "Labour", icon: FaHardHat, tone: tone("light") },
  labor: { label: "Labour", icon: FaHardHat, tone: tone("light") },
  plant: { label: "Plant", icon: FaTools, tone: tone("deep") },
  equipment: { label: "Equipment", icon: FaTools, tone: tone("deep") },
  consumable: { label: "Consumable", icon: FaBoxes, tone: tone("grad") },
};

function kindMeta(kind) {
  const key = String(kind || "").trim().toLowerCase();
  return (
    KIND_META[key] || {
      label: kind ? String(kind) : "Item",
      icon: FaLayerGroup,
      tone: undefined,
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
  // Rebuild the material & labour schedule from the current constants library.
  // Absent (null) for products/projects where regeneration does not apply.
  onRebuildSchedule = null,
  // S18: the procurement lead time is saved on the project now, so it
  // survives a reload. The default is the same 14 days it always was.
  leadDays: leadDaysProp = 14,
  onLeadDaysChange = null,
}) {
  const [view, setView] = React.useState("breakdown");
  const leadDays = clampLeadDays(leadDaysProp);
  const [query, setQuery] = React.useState("");
  const [saving, setSaving] = React.useState(false);
  const [rebuilding, setRebuilding] = React.useState(false);
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
    // code → the earliest linked task, so a row can name the task it is for.
    const codeToTask = new Map();
    for (const t of tasks) {
      const start = t?.startDate ? new Date(t.startDate) : null;
      if (!start || Number.isNaN(start.getTime())) continue;
      for (const ident of t?.linkedBoqIdentities || []) {
        const norm = String(ident).split("::")[1];
        const code = (norm || "").trim().toLowerCase();
        if (!code) continue;
        const cur = codeToTask.get(code);
        if (!cur || start < cur.start) {
          codeToTask.set(code, { start, name: String(t?.name || "").trim() });
        }
      }
    }
    const rows = [];
    for (const it of sourceLines) {
      if (isLabour(it)) continue;
      const code = String(it?.billIdentity || it?.sourceTakeoffCode || "")
        .trim()
        .toLowerCase();
      const task = code ? codeToTask.get(code) || null : null;
      const needBy = task ? task.start : null;
      const buyBy = buyByDate(needBy, leadDays);
      rows.push({
        key: keyOf(it),
        line: it,
        name: lineName(it),
        qty: safeNum(it?.qty),
        unit: it?.unit || "",
        forLine: groupLabel(it),
        taskName: task?.name || "",
        // What this material is worth, on the same rate the breakdown uses.
        amount: safeNum(it?.qty) * safeNum(it?.rate),
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

  // The three groups his KPI row counts, measured against TODAY — the real
  // date, not a fixed one. A row already ticked as bought is in none of them.
  const buyGroups = React.useMemo(() => buyScheduleGroups(buyRows), [buyRows]);

  function fmtDate(d) {
    if (!d) return "–";
    try {
      return d.toLocaleDateString(undefined, {
        day: "numeric",
        month: "short",
        year: "numeric",
      });
    } catch {
      return "–";
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
    <div style={{ display: "grid", gap: 18, gridTemplateColumns: "minmax(0, 1fr)" }}>
      {/* Intro + the completion rule. */}
      <section className="wk-panel" style={NO_MB}>
        <div className="wk-ph">
          <h2>Material &amp; Labour breakdown</h2>
        </div>
        <p className="wk-note" style={{ paddingBottom: 0 }}>
          The build-up of each bill item, its materials and labour shown
          together, arranged in the same order and sections as your Bill of
          Quantity. Price each row (type a rate, paste a <code>=</code>formula,
          or pull from RateGen) and set Overhead &amp; Profit; the
          <b> Bill Rate = Material + Labour + O&amp;P</b> flows up to the BoQ.
        </p>
        <p className="mk-note" style={{ margin: "14px 20px 18px" }}>
          A bill item is only complete when <b>every</b> line below it is
          marked procured/done, buying the materials isn’t enough until the
          labour is done too.{" "}
          {canEdit
            ? "Tick a line to mark it procured, or use “Mark all” for a whole bill item."
            : contractLocked
              ? "The contract is locked, so per-line procurement marking is frozen, but bill items you mark complete on the Bill of Quantity now show as done here."
              : sourceLines.length === 0
                ? "Re-save this project from the plugin to load its material & labour breakdown."
                : "You have view-only access, so procurement marking is disabled."}
        </p>
      </section>

      {hasBreakdown ? (
        <div className="wk-bar" style={NO_MB}>
          <div className="wk-loc-sw" role="tablist" aria-label="Budget view">
            {[
              { id: "breakdown", label: "Breakdown" },
              { id: "schedule", label: "Buy schedule" },
            ].map((opt) => {
              const active = view === opt.id;
              return (
                <button
                  key={opt.id}
                  type="button"
                  role="tab"
                  aria-selected={active}
                  onClick={() => setView(opt.id)}
                  className={active ? "on" : ""}
                >
                  {opt.label}
                </button>
              );
            })}
          </div>

          {view === "breakdown" ? (
            <>
              <label className="wk-find">
                <svg viewBox="0 0 24 24" aria-hidden="true">
                  <use href="#hi-search" />
                </svg>
                <input
                  type="search"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search material / labour…"
                  aria-label="Search material and labour"
                  autoComplete="off"
                />
              </label>
              {query ? (
                <button
                  type="button"
                  className="ds-btn ds-btn-sm btn-o"
                  onClick={() => setQuery("")}
                  title="Clear search"
                >
                  Clear
                </button>
              ) : null}
            </>
          ) : null}
        </div>
      ) : null}

      {hasBreakdown && view === "breakdown" ? (
        <div className="wk-panel" style={STRIP}>
          <span className="wk-grp" style={STRIP_TITLE}>
            Global Overhead &amp; Profit
          </span>
          <span className="wk-locnote">
            one rate for every item, overrides each item’s own O&amp;P
          </span>
          <label className="wk-locnote" style={INLINE_FIELD}>
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
          <label className="wk-locnote" style={INLINE_FIELD}>
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
            className="ds-btn ds-btn-sm btn-p"
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
                className="ds-btn ds-btn-sm btn-o"
              >
                Clear
              </button>
              <span className="wk-locnote" style={WARN_TEXT}>
                Previewing {safeNum(globalOH) + safeNum(globalPR)}% on every item
              </span>
            </>
          ) : null}
        </div>
      ) : null}

      {onRebuildSchedule && view === "breakdown" ? (
        <div className="wk-panel" style={STRIP}>
          <span className="wk-grp" style={STRIP_TITLE}>
            Material &amp; Labour schedule
          </span>
          <span className="wk-locnote">
            built from the bill using your constants. Your prices and
            procurement marks are kept
          </span>
          <button
            type="button"
            disabled={!canEdit || saving || rebuilding}
            onClick={async () => {
              setRebuilding(true);
              try {
                await onRebuildSchedule();
              } finally {
                setRebuilding(false);
              }
            }}
            className="ds-btn ds-btn-sm btn-p"
            title="Re-derive every generated material and labour row from the current Material Constants"
          >
            {rebuilding ? "Rebuilding…" : "Rebuild schedule"}
          </button>
          <a
            href="/rategen/material-constants"
            target="_blank"
            rel="noreferrer"
            className="ds-btn ds-btn-sm btn-o"
          >
            Material constants →
          </a>
        </div>
      ) : null}

      {!hasBreakdown ? (
        <div className="wk-panel wk-empty" style={NO_MB}>
          No material &amp; labour breakdown on this project yet. The breakdown
          is generated when you save from QUIV or Heron and
          appears in the <span className="font-semibold">Materials</span> view.
        </div>
      ) : view === "schedule" ? (
        <div style={{ display: "grid", gap: 14 }}>
          <div className="pj-kpi c4">
            <div className={buyGroups.late.length ? "warn" : ""}>
              <span>Should already be bought</span>
              <b>{buyGroups.late.length}</b>
              <em>
                {buyGroups.late.length
                  ? `${naira(buyGroups.lateValue)} of materials`
                  : "Nothing late"}
              </em>
            </div>
            <div>
              <span>Buy this week</span>
              <b>{buyGroups.week.length}</b>
              <em>
                {buyGroups.week.length ? naira(buyGroups.weekValue) : "Nothing due"}
              </em>
            </div>
            <div>
              <span>Not yet scheduled</span>
              <b>{buyGroups.unscheduled.length}</b>
              <em>
                {buyGroups.unscheduled.length
                  ? "Their bill lines are in no task"
                  : "Every line is in a task"}
              </em>
            </div>
            <div>
              <span>Lead time</span>
              <b>
                {onLeadDaysChange ? (
                  <>
                    <input
                      type="number"
                      min="0"
                      max="120"
                      value={leadDays}
                      aria-label="Lead time in days"
                      onChange={(e) => onLeadDaysChange(e.target.value)}
                    />{" "}
                    days
                  </>
                ) : (
                  `${leadDays} days`
                )}
              </b>
              <em>Bought this long before work starts</em>
            </div>
          </div>

          {buyRows.length === 0 ? (
            <div className="pj-empty">
              <b>Nothing to buy yet</b>
              <p>
                Price the bill first: the buy schedule is built from each bill
                line’s material build-up.
              </p>
            </div>
          ) : (
            <div className="pj-buy" role="table" aria-label="Buy schedule">
              <div className="hd" role="row">
                <span />
                <span>Buy by</span>
                <span>Material</span>
                <span className="n">Quantity</span>
                <span>For</span>
              </div>
              {buyRows.map((r) => {
                const state = r.done
                  ? "got"
                  : !r.buyBy
                    ? "none"
                    : r.buyBy < buyGroups.today
                      ? "late"
                      : "";
                return (
                  <label className={`rw ${state}`.trim()} role="row" key={r.key}>
                    <input
                      type="checkbox"
                      checked={r.done}
                      disabled={!canEdit || saving}
                      aria-label={`Bought: ${r.name}`}
                      title={
                        contractLocked
                          ? "The contract is locked, procurement is frozen."
                          : canEdit
                            ? "Tick when this material has been bought"
                            : "You cannot edit this project"
                      }
                      onChange={() => toggleLine(r.line)}
                    />
                    <span className="by">
                      {r.buyBy ? fmtDate(r.buyBy) : "Not scheduled"}
                      {r.needBy ? <em>on site {fmtDate(r.needBy)}</em> : null}
                    </span>
                    <span className="m">
                      <b title={r.name}>{r.name}</b>
                      <em>{r.amount ? naira(r.amount) : "–"}</em>
                    </span>
                    <span className="n">
                      {money(r.qty)} {r.unit || ""}
                    </span>
                    <span className="f" title={r.forLine}>
                      {r.forLine}
                      {r.taskName ? <em>{r.taskName}</em> : null}
                    </span>
                  </label>
                );
              })}
            </div>
          )}

          <p className="pj-foot">
            “On site” is the start of the earliest Program-of-Works task linked
            to the material’s bill line; “Buy by” takes the lead time off it.
            Link bill lines to tasks on the PM Dashboard to date the
            unscheduled ones. {scheduledCount} of {buyRows.length} dated.
            {onLeadDaysChange
              ? " The lead time is saved with the project when you save."
              : ""}
          </p>
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
              <div className="wk-panel wk-empty" style={NO_MB}>
                No build-up on this project yet.
              </div>
            ) : null}

            {/* Search mode, flat results showing each resource's work item + section. */}
            {q ? (
              searchResults.length === 0 ? (
                <div className="wk-panel wk-empty" style={NO_MB}>
                  No material / labour matches “{query}”.
                </div>
              ) : (
                <div className="wk-panel" style={NO_MB}>
                  <div className="wk-ph">
                    <h2>
                      {searchResults.length} result
                      {searchResults.length === 1 ? "" : "s"} for “{query}”
                    </h2>
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
                                  className="wk-src sm"
                                  style={meta.tone}
                                >
                                  <Icon size={11} />
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
                                <span className="wk-src sm">
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
–
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
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      gap: 8,
                      padding: "4px 4px 0",
                    }}
                  >
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <span className="wk-grp" style={STRIP_TITLE}>
                        {section.category}
                      </span>
                      <span className="wk-src sm">
                        {section.groups.length} item
                        {section.groups.length === 1 ? "" : "s"}
                      </span>
                    </div>
                    <b style={{ fontSize: 13, fontWeight: 500, color: "var(--ink)" }}>
                      &#8358;{money(section.cost)}
                    </b>
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
                      className="wk-panel" style={NO_MB}
                    >
                      {/* Bill-line header + rolled-up status. */}
                      <div
                        className="wk-ph"
                        style={{ flexWrap: "wrap", alignItems: "flex-start" }}
                      >
                        <div style={{ minWidth: 0, flex: "1 1 240px" }}>
                          <h2 style={TRUNCATE} title={g.label}>
                            {g.label}
                          </h2>
                          <div className="wk-locnote" style={{ marginTop: 4 }}>
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
                          <div className="wk-locnote" style={{ display: "flex", alignItems: "center", gap: 8 }}>
                            <label style={INLINE_FIELD}>
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
                            <label style={INLINE_FIELD}>
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
                            className="wk-src sm"
                            style={
                              g.allDone
                                ? tone("light")
                                : g.doneCount > 0
                                  ? tone("orange")
                                  : undefined
                            }
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
                              className="ds-btn ds-btn-sm btn-o"
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
                                      className="wk-src sm"
                                  style={meta.tone}
                                    >
                                      <Icon size={11} />
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
–
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

            {/* Totals, in his expression rows. */}
            <section className="wk-panel" style={NO_MB}>
              <div className="wk-expr">
                <div>
                  <span>{showMaterials ? "Procured" : "Done"} to date</span>
                  <b>&#8358;{money(procuredTotal)}</b>
                </div>
                <div>
                  <span>Net build-up</span>
                  <b>&#8358;{money(budgetTotal)}</b>
                </div>
                <div className="t">
                  <span>Bill total (incl. O&amp;P)</span>
                  <b>&#8358;{money(billTotal)}</b>
                </div>
              </div>
            </section>

            <div ref={bottomRef} aria-hidden="true" />
          </div>
        </div>
      )}

      {/* Floating Material/Labour total for the active search. */}
      {view === "breakdown" && floatTotals && floatTotals.length ? (
        <div className="wk-panel" style={FLOAT} role="status">
          <div className="mb-2 flex items-center justify-between">
            <span className="wk-grp" style={STRIP_TITLE}>
              “{query}” totals
            </span>
            <button
              type="button"
              onClick={() => setQuery("")}
              className="rounded p-0.5 text-slate-400 hover:text-slate-700"
              title="Clear"
            >
              <FaTimes size={12} />
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
