// src/features/archicad/ArchiCADBoQTable.jsx
// Costed BoQ table grouped by the 8 fixed NRM-style categories.
//  - expand/collapse per category, search filter, column sorting
//  - inline margin % editing per line (PATCH on blur/Enter, optimistic)
//  - "set global margin" control
//  - rows link to the element view (single GUID) or expand to a GUID list
//  - changed lines get a subtle orange highlight; unpriced/flagged lines are marked
// All quantities arrive metric; conversion happens at display time only.
import React from "react";
import { Link } from "react-router-dom";
import {
  FaChevronDown,
  FaChevronRight,
  FaSearch,
  FaExclamationTriangle,
  FaCubes,
} from "react-icons/fa";
import {
  convertQuantity,
  unitLabel,
  imperialFactor,
  formatQty,
  fmtMoney,
  safeNum,
} from "../../utils/archicadUnits.js";
import { ARCHICAD_CATEGORIES } from "./archicadApi.js";

function compareItemRef(a, b) {
  const pa = String(a?.itemRef || "").split(".").map(Number);
  const pb = String(b?.itemRef || "").split(".").map(Number);
  for (let i = 0; i < Math.max(pa.length, pb.length); i += 1) {
    const d = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (d) return d;
  }
  return 0;
}

const SORTS = {
  itemRef: compareItemRef,
  description: (a, b) => String(a?.description || "").localeCompare(String(b?.description || "")),
  quantity: (a, b) => safeNum(a?.quantity) - safeNum(b?.quantity),
  totalAmount: (a, b) => safeNum(a?.totalAmount) - safeNum(b?.totalAmount),
};

function SortHeader({ label, sortKey, sort, onSort, className = "" }) {
  const active = sort.key === sortKey;
  return (
    <th
      className={`cursor-pointer select-none whitespace-nowrap px-3 py-2 text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-adlm-dark-muted ${className}`}
      onClick={() => onSort(sortKey)}
      title={`Sort by ${label.toLowerCase()}`}
    >
      {label}
      {active ? <span className="ml-1">{sort.dir === 1 ? "▲" : "▼"}</span> : null}
    </th>
  );
}

function MarginCell({ line, readOnly, onCommit }) {
  const [val, setVal] = React.useState(String(safeNum(line?.marginPercent)));
  // Re-sync when the server (or an optimistic update) changes the line.
  React.useEffect(() => {
    setVal(String(safeNum(line?.marginPercent)));
  }, [line?.marginPercent]);

  if (readOnly) {
    return <span className="tabular-nums">{formatQty(line?.marginPercent, 2)}%</span>;
  }

  function commit() {
    const next = Number(val);
    if (!Number.isFinite(next) || next < 0) {
      setVal(String(safeNum(line?.marginPercent)));
      return;
    }
    if (next === safeNum(line?.marginPercent)) return;
    onCommit?.(line.itemRef, next);
  }

  return (
    <span className="inline-flex items-center gap-1">
      <input
        type="number"
        min="0"
        step="0.5"
        value={val}
        onChange={(e) => setVal(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Enter") e.currentTarget.blur();
          if (e.key === "Escape") setVal(String(safeNum(line?.marginPercent)));
        }}
        className="w-16 rounded-adlm border border-slate-300 bg-white px-1.5 py-1 text-right text-sm tabular-nums text-slate-900 focus:border-adlm-blue-600 focus:outline-none dark:border-adlm-dark-border dark:bg-adlm-dark-raised dark:text-adlm-dark-text"
        aria-label={`Margin percent for item ${line?.itemRef}`}
      />
      <span className="text-slate-400 dark:text-adlm-dark-dim">%</span>
    </span>
  );
}

export default function ArchiCADBoQTable({
  boq,
  units = "metric",
  projectId,
  readOnly = false,
  onLineMargin, // async (itemRef, marginPercent)
  onGlobalMargin, // async (marginPercent)
}) {
  const [query, setQuery] = React.useState("");
  const [sort, setSort] = React.useState({ key: "itemRef", dir: 1 });
  const [collapsed, setCollapsed] = React.useState({});
  const [openGuidRows, setOpenGuidRows] = React.useState({});
  const [globalMargin, setGlobalMargin] = React.useState("");
  const [applyingGlobal, setApplyingGlobal] = React.useState(false);

  const lines = Array.isArray(boq?.lines) ? boq.lines : [];
  const currency = boq?.currency || "NGN";
  const changed = React.useMemo(
    () => new Set(Array.isArray(boq?.changedLineRefs) ? boq.changedLineRefs : []),
    [boq?.changedLineRefs],
  );

  const categories = React.useMemo(() => {
    const fromDoc = Array.isArray(boq?.categories) && boq.categories.length
      ? boq.categories
      : ARCHICAD_CATEGORIES;
    // Keep the fixed contract order.
    return ARCHICAD_CATEGORIES.map(
      (c) => fromDoc.find((d) => d.key === c.key) || c,
    );
  }, [boq?.categories]);

  const q = query.trim().toLowerCase();
  const visible = React.useMemo(() => {
    const filtered = !q
      ? lines
      : lines.filter(
          (l) =>
            String(l?.description || "").toLowerCase().includes(q) ||
            String(l?.itemRef || "").toLowerCase().includes(q),
        );
    const cmp = SORTS[sort.key] || SORTS.itemRef;
    return [...filtered].sort((a, b) => cmp(a, b) * sort.dir);
  }, [lines, q, sort]);

  function toggleSort(key) {
    setSort((prev) =>
      prev.key === key ? { key, dir: -prev.dir } : { key, dir: 1 },
    );
  }

  function displayRate(line) {
    // Under imperial the quantity basis changes (m³ → ft³ etc.), so the rate
    // per displayed unit divides by the same factor — the ₦ line amounts are
    // untouched and Qty × Rate still equals Total.
    const rate = safeNum(line?.unitRate);
    if (units !== "imperial") return rate;
    return rate / imperialFactor(line?.unit);
  }

  async function applyGlobal() {
    const next = Number(globalMargin);
    if (!Number.isFinite(next) || next < 0 || applyingGlobal) return;
    setApplyingGlobal(true);
    try {
      await onGlobalMargin?.(next);
      setGlobalMargin("");
    } finally {
      setApplyingGlobal(false);
    }
  }

  const numCell =
    "whitespace-nowrap px-3 py-2 text-right tabular-nums text-slate-700 dark:text-adlm-dark-text";

  return (
    <div className="rounded-adlm-lg border border-slate-200 bg-white shadow-sm dark:border-adlm-dark-border dark:bg-adlm-dark-panel">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-3 border-b border-slate-200 p-3 dark:border-adlm-dark-border">
        <div className="relative min-w-[220px] flex-1">
          <FaSearch className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-xs text-slate-400 dark:text-adlm-dark-dim" />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Filter by description or item ref…"
            className="w-full rounded-adlm border border-slate-300 bg-white py-1.5 pl-8 pr-3 text-sm text-slate-900 placeholder:text-slate-400 focus:border-adlm-blue-600 focus:outline-none dark:border-adlm-dark-border dark:bg-adlm-dark-raised dark:text-adlm-dark-text dark:placeholder:text-adlm-dark-dim"
          />
        </div>
        {!readOnly ? (
          <div className="flex items-center gap-2">
            <label className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-adlm-dark-muted">
              Global margin
            </label>
            <input
              type="number"
              min="0"
              step="0.5"
              value={globalMargin}
              onChange={(e) => setGlobalMargin(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && applyGlobal()}
              placeholder="%"
              className="w-20 rounded-adlm border border-slate-300 bg-white px-2 py-1.5 text-right text-sm tabular-nums text-slate-900 focus:border-adlm-blue-600 focus:outline-none dark:border-adlm-dark-border dark:bg-adlm-dark-raised dark:text-adlm-dark-text"
            />
            <button
              type="button"
              disabled={applyingGlobal || globalMargin === ""}
              onClick={applyGlobal}
              className="rounded-adlm bg-adlm-blue-600 px-3 py-1.5 text-sm font-semibold text-white transition hover:bg-adlm-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {applyingGlobal ? "Applying…" : "Apply to all"}
            </button>
          </div>
        ) : null}
      </div>

      <div className="overflow-x-auto">
        <table className="w-full min-w-[960px] border-collapse text-sm">
          <thead>
            <tr className="border-b border-slate-200 bg-slate-50 dark:border-adlm-dark-border dark:bg-white/5">
              <SortHeader label="Item ref" sortKey="itemRef" sort={sort} onSort={toggleSort} className="text-left" />
              <SortHeader label="Description" sortKey="description" sort={sort} onSort={toggleSort} className="text-left" />
              <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-adlm-dark-muted">
                Unit
              </th>
              <SortHeader label="Qty" sortKey="quantity" sort={sort} onSort={toggleSort} className="text-right" />
              <th className="px-3 py-2 text-right text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-adlm-dark-muted">
                Unit rate
              </th>
              <th className="px-3 py-2 text-right text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-adlm-dark-muted">
                Material
              </th>
              <th className="px-3 py-2 text-right text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-adlm-dark-muted">
                Labour
              </th>
              <SortHeader label="Total" sortKey="totalAmount" sort={sort} onSort={toggleSort} className="text-right" />
              <th className="px-3 py-2 text-right text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-adlm-dark-muted">
                Margin
              </th>
            </tr>
          </thead>

          {categories.map((cat) => {
            const catLines = visible.filter((l) => l?.category === cat.key);
            if (!catLines.length && q) return null; // hide empty groups while filtering
            const isCollapsed = !!collapsed[cat.key];
            const subtotal = {
              material: catLines.reduce((s, l) => s + safeNum(l.materialAmount), 0),
              labour: catLines.reduce((s, l) => s + safeNum(l.labourAmount), 0),
              total: catLines.reduce((s, l) => s + safeNum(l.totalAmount), 0),
              margin: catLines.reduce((s, l) => s + safeNum(l.marginAmount), 0),
            };
            return (
              <tbody key={cat.key}>
                {/* Category header */}
                <tr
                  className="cursor-pointer border-b border-slate-200 bg-slate-100/70 hover:bg-slate-200/60 dark:border-adlm-dark-border dark:bg-adlm-dark-raised dark:hover:bg-adlm-dark-hover"
                  onClick={() =>
                    setCollapsed((prev) => ({ ...prev, [cat.key]: !prev[cat.key] }))
                  }
                >
                  <td colSpan={7} className="px-3 py-2">
                    <span className="inline-flex items-center gap-2 font-semibold text-slate-800 dark:text-white">
                      {isCollapsed ? (
                        <FaChevronRight className="text-xs text-slate-400 dark:text-adlm-dark-dim" />
                      ) : (
                        <FaChevronDown className="text-xs text-slate-400 dark:text-adlm-dark-dim" />
                      )}
                      {cat.title || cat.key}
                      <span className="text-xs font-normal text-slate-500 dark:text-adlm-dark-muted">
                        {catLines.length} item{catLines.length === 1 ? "" : "s"}
                      </span>
                    </span>
                  </td>
                  <td className="whitespace-nowrap px-3 py-2 text-right font-semibold tabular-nums text-slate-800 dark:text-white">
                    {fmtMoney(subtotal.total, currency)}
                  </td>
                  <td className="whitespace-nowrap px-3 py-2 text-right tabular-nums text-slate-500 dark:text-adlm-dark-muted">
                    {fmtMoney(subtotal.margin, currency)}
                  </td>
                </tr>

                {!isCollapsed &&
                  catLines.map((line) => {
                    const guids = Array.isArray(line?.elementGuids) ? line.elementGuids : [];
                    const flagged =
                      Array.isArray(line?.flags) && line.flags.length > 0;
                    const unpriced =
                      flagged &&
                      (line.flags.includes("unpriced") ||
                        line?.rateProvenance?.rateSource === "unpriced");
                    const isChanged = changed.has(line?.itemRef);
                    const rowKey = `${cat.key}:${line?.itemRef}`;
                    const guidsOpen = !!openGuidRows[rowKey];
                    const singleGuid = guids.length === 1 ? guids[0] : null;
                    return (
                      <React.Fragment key={rowKey}>
                        <tr
                          className={[
                            "border-b border-slate-100 dark:border-adlm-dark-border/60",
                            isChanged
                              ? "bg-orange-50 dark:bg-orange-400/10"
                              : "hover:bg-slate-50 dark:hover:bg-white/5",
                          ].join(" ")}
                          title={isChanged ? "Quantity changed vs previous version" : undefined}
                        >
                          <td className="whitespace-nowrap px-3 py-2 font-medium tabular-nums text-slate-600 dark:text-adlm-dark-muted">
                            {line?.itemRef}
                          </td>
                          <td className="px-3 py-2 text-slate-800 dark:text-adlm-dark-text">
                            <span className="inline-flex flex-wrap items-center gap-2">
                              {singleGuid ? (
                                <Link
                                  to={`/archicad/${projectId}/element/${encodeURIComponent(singleGuid)}`}
                                  className="text-adlm-blue-700 hover:underline dark:text-adlm-blue-300"
                                >
                                  {line?.description || "—"}
                                </Link>
                              ) : (
                                <span>{line?.description || "—"}</span>
                              )}
                              {guids.length > 1 ? (
                                <button
                                  type="button"
                                  onClick={() =>
                                    setOpenGuidRows((prev) => ({
                                      ...prev,
                                      [rowKey]: !prev[rowKey],
                                    }))
                                  }
                                  className="inline-flex items-center gap-1 rounded-full border border-slate-200 px-2 py-0.5 text-xs text-slate-500 transition hover:border-adlm-blue-600 hover:text-adlm-blue-700 dark:border-adlm-dark-border dark:text-adlm-dark-muted dark:hover:text-adlm-blue-300"
                                  title="Show the model elements measured into this item"
                                >
                                  <FaCubes className="text-[10px]" />
                                  {guids.length} elements
                                  {guidsOpen ? (
                                    <FaChevronDown className="text-[9px]" />
                                  ) : (
                                    <FaChevronRight className="text-[9px]" />
                                  )}
                                </button>
                              ) : null}
                              {flagged ? (
                                <span
                                  title={line.flags.join(", ")}
                                  className="inline-flex items-center gap-1 rounded-full border border-amber-300 bg-amber-50 px-2 py-0.5 text-[11px] font-semibold text-amber-700 dark:border-amber-500/40 dark:bg-amber-500/10 dark:text-amber-300"
                                >
                                  <FaExclamationTriangle className="text-[10px]" />
                                  {unpriced ? "Unpriced" : line.flags[0]}
                                </span>
                              ) : null}
                            </span>
                          </td>
                          <td className="whitespace-nowrap px-3 py-2 text-slate-500 dark:text-adlm-dark-muted">
                            {unitLabel(line?.unit, units)}
                          </td>
                          <td className={numCell}>
                            {formatQty(convertQuantity(line?.quantity, line?.unit, units))}
                          </td>
                          <td className={`${numCell} ${unpriced ? "text-amber-600 dark:text-amber-400" : ""}`}>
                            {fmtMoney(displayRate(line), currency)}
                          </td>
                          <td className={numCell}>{fmtMoney(line?.materialAmount, currency)}</td>
                          <td className={numCell}>{fmtMoney(line?.labourAmount, currency)}</td>
                          <td className={`${numCell} font-semibold ${unpriced ? "text-amber-600 dark:text-amber-400" : "text-slate-900 dark:text-white"}`}>
                            {fmtMoney(line?.totalAmount, currency)}
                          </td>
                          <td className="whitespace-nowrap px-3 py-2 text-right">
                            <MarginCell
                              line={line}
                              readOnly={readOnly}
                              onCommit={onLineMargin}
                            />
                          </td>
                        </tr>
                        {guidsOpen && guids.length > 1 ? (
                          <tr className="border-b border-slate-100 bg-slate-50/70 dark:border-adlm-dark-border/60 dark:bg-white/5">
                            <td />
                            <td colSpan={8} className="px-3 py-2">
                              <div className="flex flex-wrap gap-2">
                                {guids.map((g) => (
                                  <Link
                                    key={g}
                                    to={`/archicad/${projectId}/element/${encodeURIComponent(g)}`}
                                    className="rounded-adlm border border-slate-200 bg-white px-2 py-1 font-mono text-xs text-adlm-blue-700 transition hover:border-adlm-blue-600 dark:border-adlm-dark-border dark:bg-adlm-dark-raised dark:text-adlm-blue-300"
                                  >
                                    {g}
                                  </Link>
                                ))}
                              </div>
                            </td>
                          </tr>
                        ) : null}
                      </React.Fragment>
                    );
                  })}

                {/* Category subtotal */}
                {!isCollapsed && catLines.length ? (
                  <tr className="border-b border-slate-200 bg-slate-50 text-slate-700 dark:border-adlm-dark-border dark:bg-white/5 dark:text-adlm-dark-text">
                    <td className="px-3 py-2" />
                    <td className="px-3 py-2 text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-adlm-dark-muted">
                      {cat.title || cat.key} subtotal
                    </td>
                    <td colSpan={3} />
                    <td className={`${numCell} font-semibold`}>{fmtMoney(subtotal.material, currency)}</td>
                    <td className={`${numCell} font-semibold`}>{fmtMoney(subtotal.labour, currency)}</td>
                    <td className={`${numCell} font-semibold`}>{fmtMoney(subtotal.total, currency)}</td>
                    <td className={`${numCell} font-semibold`}>{fmtMoney(subtotal.margin, currency)}</td>
                  </tr>
                ) : null}
              </tbody>
            );
          })}

          {/* Grand total */}
          <tfoot>
            <tr className="bg-adlm-navy-tertiary text-white">
              <td className="px-3 py-2.5" />
              <td className="px-3 py-2.5 text-sm font-bold uppercase tracking-wide">
                Grand total
              </td>
              <td colSpan={3} />
              <td className="whitespace-nowrap px-3 py-2.5 text-right font-semibold tabular-nums">
                {fmtMoney(boq?.totals?.materialAmount, currency)}
              </td>
              <td className="whitespace-nowrap px-3 py-2.5 text-right font-semibold tabular-nums">
                {fmtMoney(boq?.totals?.labourAmount, currency)}
              </td>
              <td className="whitespace-nowrap px-3 py-2.5 text-right text-base font-bold tabular-nums">
                {fmtMoney(boq?.totals?.grandTotal, currency)}
              </td>
              <td className="whitespace-nowrap px-3 py-2.5 text-right font-semibold tabular-nums">
                {fmtMoney(boq?.totals?.marginAmount, currency)}
              </td>
            </tr>
          </tfoot>
        </table>
      </div>

      {!lines.length ? (
        <div className="p-6 text-center text-sm text-slate-500 dark:text-adlm-dark-muted">
          No BoQ lines yet. Extract quantities from ArchiCAD via the connector
          panel to populate this bill.
        </div>
      ) : null}
    </div>
  );
}
