// src/features/archicad/ArchiCADBudgetDashboard.jsx
// Budget dashboard for an ArchiCAD BoQ: summary cards, a custom-SVG stacked
// bar chart of cost by category (no chart library — same approach as
// features/projects/ProjectDashboardChart.jsx), and a budget-vs-actual
// tracker persisted via PATCH /api/archicad/boq/:projectId/budget.
import React from "react";
import { FaSpinner } from "react-icons/fa";
import {
  fmtMoney,
  formatQty,
  safeNum,
  convertQuantity,
  unitLabel,
  FT2_PER_M2,
} from "../../utils/archicadUnits.js";
import { ARCHICAD_CATEGORIES } from "./archicadApi.js";

// Brand palette (matches the adlm tokens / api-contract brand colours)
const MATERIAL_COLOR = "#1E6BCC"; // blue
const LABOUR_COLOR = "#40B0E0"; // sky
const MARGIN_COLOR = "#F07020"; // orange

function StatCard({ label, value, helper, tone }) {
  const toneClass =
    tone === "success"
      ? "text-emerald-600 dark:text-emerald-400"
      : tone === "warning"
        ? "text-amber-600 dark:text-amber-400"
        : tone === "danger"
          ? "text-red-600 dark:text-red-400"
          : "text-slate-900 dark:text-white";
  return (
    <div className="rounded-adlm-lg border border-slate-200 bg-white p-4 shadow-sm dark:border-adlm-dark-border dark:bg-adlm-dark-panel">
      <div className="text-xs uppercase tracking-wide text-slate-500 dark:text-adlm-dark-muted">
        {label}
      </div>
      <div className={`mt-1 text-xl font-bold tabular-nums ${toneClass}`}>{value}</div>
      {helper ? (
        <div className="mt-0.5 text-xs text-slate-400 dark:text-adlm-dark-dim">{helper}</div>
      ) : null}
    </div>
  );
}

// Horizontal stacked bars — material / labour / margin per category.
function CategoryBarChart({ categories, currency }) {
  const entries = categories.filter((c) => safeNum(c.totalAmount) > 0);
  if (!entries.length) {
    return (
      <div className="rounded-adlm border border-dashed border-slate-300 p-6 text-sm text-slate-500 dark:border-adlm-dark-border dark:text-adlm-dark-muted">
        No costed lines yet — the category chart appears once the BoQ is priced.
      </div>
    );
  }
  const W = 560;
  const ROW = 34;
  const PAD_L = 150;
  const PAD_R = 78;
  const INNER = W - PAD_L - PAD_R;
  const H = entries.length * ROW + 8;
  const maxVal = Math.max(...entries.map((e) => safeNum(e.totalAmount)), 1);

  return (
    <div>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ minHeight: H }}>
        {entries.map((e, i) => {
          const y = i * ROW + 6;
          const mat = safeNum(e.materialAmount);
          const lab = safeNum(e.labourAmount);
          const mar = safeNum(e.marginAmount);
          const tot = safeNum(e.totalAmount);
          const other = Math.max(tot - mat - lab - mar, 0);
          const scale = (v) => (v / maxVal) * INNER;
          let x = PAD_L;
          const segs = [
            { v: mat, color: MATERIAL_COLOR },
            { v: lab, color: LABOUR_COLOR },
            { v: other, color: "#94a3b8" },
            { v: mar, color: MARGIN_COLOR },
          ];
          return (
            <g key={e.key}>
              <text
                x={PAD_L - 8}
                y={y + 14}
                textAnchor="end"
                fontSize={11}
                fontWeight={600}
                className="fill-slate-500 dark:fill-adlm-dark-muted"
              >
                {e.title || e.key}
              </text>
              <rect
                x={PAD_L}
                y={y + 3}
                width={Math.max(scale(tot), 2)}
                height={16}
                rx={4}
                className="fill-slate-100 dark:fill-white/10"
              />
              {segs.map((s, j) => {
                if (s.v <= 0) return null;
                const w = scale(s.v);
                const rect = (
                  <rect key={j} x={x} y={y + 3} width={Math.max(w, 1)} height={16} fill={s.color} />
                );
                x += w;
                return rect;
              })}
              <text
                x={PAD_L + scale(tot) + 6}
                y={y + 15}
                fontSize={10}
                className="fill-slate-500 dark:fill-adlm-dark-muted"
              >
                {fmtMoney(tot, currency)}
              </text>
            </g>
          );
        })}
      </svg>
      <div className="mt-3 flex flex-wrap items-center gap-4 text-xs text-slate-600 dark:text-adlm-dark-muted">
        <span className="inline-flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-sm" style={{ backgroundColor: MATERIAL_COLOR }} />
          Material
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-sm" style={{ backgroundColor: LABOUR_COLOR }} />
          Labour
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-sm" style={{ backgroundColor: MARGIN_COLOR }} />
          Margin
        </span>
      </div>
    </div>
  );
}

export default function ArchiCADBudgetDashboard({
  boq,
  units = "metric",
  onSaveBudget, // async (targetBudget: number)
  savingBudget = false,
}) {
  const totals = boq?.totals || {};
  const currency = boq?.currency || "NGN";
  const grandTotal = safeNum(totals.grandTotal);
  const storedTarget = safeNum(boq?.targetBudget ?? totals.targetBudget);
  const [target, setTarget] = React.useState(storedTarget ? String(storedTarget) : "");

  React.useEffect(() => {
    setTarget(storedTarget ? String(storedTarget) : "");
  }, [storedTarget]);

  const categories = React.useMemo(() => {
    const fromDoc = Array.isArray(boq?.categories) ? boq.categories : [];
    return ARCHICAD_CATEGORIES.map(
      (c) => fromDoc.find((d) => d.key === c.key) || { ...c, totalAmount: 0 },
    );
  }, [boq?.categories]);

  // Cost per unit floor area — the area basis converts with the unit system
  // (₦/m² ↔ ₦/ft²); the currency itself is never converted.
  const floorArea = safeNum(totals.floorArea);
  const dispFloorArea = convertQuantity(floorArea, "m2", units);
  const costPerArea =
    units === "imperial"
      ? safeNum(totals.costPerM2) / FT2_PER_M2
      : safeNum(totals.costPerM2);
  const areaLabel = unitLabel("m2", units);

  const variance = storedTarget > 0 ? storedTarget - grandTotal : 0;
  const over = storedTarget > 0 && variance < 0;
  const usedPct =
    storedTarget > 0 ? Math.min(150, (grandTotal / storedTarget) * 100) : 0;

  function submitBudget(e) {
    e?.preventDefault?.();
    const val = Number(target);
    if (!Number.isFinite(val) || val < 0 || savingBudget) return;
    onSaveBudget?.(val);
  }

  return (
    <div className="space-y-6">
      {/* Summary cards */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        <StatCard label="Total material" value={fmtMoney(totals.materialAmount, currency)} />
        <StatCard label="Total labour" value={fmtMoney(totals.labourAmount, currency)} />
        <StatCard label="Total direct cost" value={fmtMoney(totals.directCost, currency)} />
        <StatCard label="Margin" value={fmtMoney(totals.marginAmount, currency)} />
        <StatCard
          label="Total with margin"
          value={fmtMoney(grandTotal, currency)}
          helper="Grand total"
        />
        <StatCard
          label={`Cost per ${areaLabel}`}
          value={`${fmtMoney(costPerArea, currency)}`}
          helper={
            floorArea > 0
              ? `Floor area ${formatQty(dispFloorArea, 1)} ${areaLabel}`
              : "No slab floor area detected"
          }
        />
      </div>

      {/* Cost by category */}
      <div className="rounded-adlm-lg border border-slate-200 bg-white p-4 shadow-sm dark:border-adlm-dark-border dark:bg-adlm-dark-panel">
        <div className="mb-3 font-semibold text-slate-900 dark:text-white">
          Cost by category
        </div>
        <CategoryBarChart categories={categories} currency={currency} />
      </div>

      {/* Budget vs actual */}
      <div className="rounded-adlm-lg border border-slate-200 bg-white p-4 shadow-sm dark:border-adlm-dark-border dark:bg-adlm-dark-panel">
        <div className="mb-1 font-semibold text-slate-900 dark:text-white">
          Budget tracker
        </div>
        <div className="mb-4 text-sm text-slate-500 dark:text-adlm-dark-muted">
          Set a target budget for this project and track the estimate against it.
        </div>

        <form onSubmit={submitBudget} className="flex flex-wrap items-end gap-3">
          <label className="flex flex-col gap-1">
            <span className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-adlm-dark-muted">
              Target budget ({currency})
            </span>
            <input
              type="number"
              min="0"
              step="any"
              value={target}
              onChange={(e) => setTarget(e.target.value)}
              placeholder="e.g. 50,000,000"
              className="w-56 rounded-adlm border border-slate-300 bg-white px-3 py-2 text-sm tabular-nums text-slate-900 focus:border-adlm-blue-600 focus:outline-none dark:border-adlm-dark-border dark:bg-adlm-dark-raised dark:text-adlm-dark-text"
            />
          </label>
          <button
            type="submit"
            disabled={savingBudget || target === ""}
            className="inline-flex items-center gap-1.5 rounded-adlm bg-adlm-blue-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-adlm-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {savingBudget ? <FaSpinner className="animate-spin" /> : null}
            Save budget
          </button>
        </form>

        {storedTarget > 0 ? (
          <div className="mt-5 space-y-3">
            <div className="h-4 overflow-hidden rounded-full bg-slate-100 dark:bg-white/10">
              <div
                className={`h-full rounded-full transition-[width] duration-700 ease-out ${
                  over ? "bg-red-500" : "bg-emerald-500"
                }`}
                style={{ width: `${Math.min(usedPct, 100)}%` }}
              />
            </div>
            <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
              <span className="text-slate-600 dark:text-adlm-dark-muted">
                Estimate {fmtMoney(grandTotal, currency)} of{" "}
                {fmtMoney(storedTarget, currency)} target (
                {formatQty(storedTarget > 0 ? (grandTotal / storedTarget) * 100 : 0, 1)}%)
              </span>
              <span
                className={`font-semibold ${
                  over
                    ? "text-red-600 dark:text-red-400"
                    : "text-emerald-600 dark:text-emerald-400"
                }`}
              >
                {over
                  ? `Over budget by ${fmtMoney(Math.abs(variance), currency)}`
                  : `Under budget by ${fmtMoney(variance, currency)}`}
              </span>
            </div>
          </div>
        ) : (
          <div className="mt-4 text-sm text-slate-400 dark:text-adlm-dark-dim">
            No target budget set yet.
          </div>
        )}
      </div>
    </div>
  );
}
