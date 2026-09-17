// src/features/archicad/ArchiCADBudgetDashboard.jsx
// Budget dashboard for an ArchiCAD BoQ: summary cards, a custom-SVG stacked
// bar chart of cost by category (no chart library — same approach as
// features/projects/ProjectDashboardChart.jsx), and a budget-vs-actual
// tracker persisted via PATCH /api/archicad/boq/:projectId/budget.
import React from "react";
import { FaSpinner } from "../../components/icons.jsx";
import {
  fmtMoney,
  formatQty,
  safeNum,
  convertQuantity,
  unitLabel,
  FT2_PER_M2,
} from "../../utils/archicadUnits.js";
import { ARCHICAD_CATEGORIES } from "./archicadApi.js";

// The four cost parts, in his tokens.
const PARTS = [
  { key: "material", label: "Material", color: "var(--action)" },
  { key: "labour", label: "Labour", color: "var(--pal-deep-key)" },
  { key: "other", label: "Other", color: "var(--ink-3)" },
  { key: "margin", label: "Margin", color: "var(--pal-orange-key)" },
];

// One figure, in his dashboard tile.
function StatCard({ label, value, helper, tone }) {
  const cls = tone === "success" ? " pal-on" : tone === "warning" || tone === "danger" ? " warn" : "";
  return (
    <div className={`dsh-stat${cls}`}>
      <span className="k">{label}</span>
      <b>{value}</b>
      {helper ? <span className="ds-sub">{helper}</span> : null}
    </div>
  );
}

// Cost by category as his meters: each track split into material, labour,
// other and margin, scaled to the largest category.
function CategoryBarChart({ categories, currency }) {
  const entries = categories.filter((c) => safeNum(c.totalAmount) > 0);
  if (!entries.length) {
    return (
      <div className="wk-empty">
        No costed lines yet, the category chart appears once the BoQ is priced.
      </div>
    );
  }
  const maxVal = Math.max(...entries.map((e) => safeNum(e.totalAmount)), 1);

  return (
    <div>
      <div className="dsh-meter">
        {entries.map((e) => {
          const mat = safeNum(e.materialAmount);
          const lab = safeNum(e.labourAmount);
          const mar = safeNum(e.marginAmount);
          const tot = safeNum(e.totalAmount);
          const other = Math.max(tot - mat - lab - mar, 0);
          const values = { material: mat, labour: lab, other, margin: mar };
          return (
            <div className="row" key={e.key}>
              <div className="lab">
                <span>{e.title || e.key}</span>
                <b>{fmtMoney(tot, currency)}</b>
              </div>
              <div className="track" style={{ display: "flex" }}>
                <div style={{ display: "flex", width: `${(tot / maxVal) * 100}%`, height: "100%" }}>
                  {PARTS.map((p) =>
                    values[p.key] > 0 ? (
                      <i
                        key={p.key}
                        title={`${p.label}: ${fmtMoney(values[p.key], currency)}`}
                        style={{
                          width: `${(values[p.key] / tot) * 100}%`,
                          borderRadius: 0,
                          background: p.color,
                        }}
                      />
                    ) : null,
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>
      <div className="wk-locnote" style={{ marginTop: 12, display: "flex", flexWrap: "wrap", gap: "4px 16px" }}>
        {PARTS.filter((p) => p.key !== "other").map((p) => (
          <span key={p.key} style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
            <i aria-hidden="true" style={{ width: 9, height: 9, borderRadius: 3, background: p.color }} />
            {p.label}
          </span>
        ))}
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
    <div style={{ display: "grid", gap: 18, gridTemplateColumns: "minmax(0, 1fr)" }}>
      {/* Summary tiles */}
      <div
        className="dsh-stats"
        style={{ marginBottom: 0, gridTemplateColumns: "repeat(auto-fit, minmax(230px, 1fr))" }}
      >
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
      <section className="wk-panel" style={{ marginBottom: 0 }}>
        <div className="wk-ph">
          <h2>Cost by category</h2>
        </div>
        <div style={{ padding: "18px 20px 20px" }}>
          <CategoryBarChart categories={categories} currency={currency} />
        </div>
      </section>

      {/* Budget vs actual */}
      <section className="wk-panel" style={{ marginBottom: 0 }}>
        <div className="wk-ph" style={{ flexWrap: "wrap" }}>
          <div>
            <h2>Budget tracker</h2>
            <div className="wk-locnote" style={{ marginTop: 4 }}>
              Set a target budget for this project and track the estimate against it.
            </div>
          </div>
        </div>
        <div style={{ padding: "18px 20px 20px" }}>

        <form onSubmit={submitBudget} className="wk-bar" style={{ margin: 0, alignItems: "flex-end" }}>
          <label className="wk-f" style={{ flex: "0 1 260px", margin: 0 }}>
            <span>Target budget ({currency})</span>
            <input
              type="number"
              min="0"
              step="any"
              value={target}
              onChange={(e) => setTarget(e.target.value)}
              placeholder="e.g. 50,000,000"
              style={{ fontVariantNumeric: "tabular-nums" }}
            />
          </label>
          <button
            type="submit"
            disabled={savingBudget || target === ""}
            className="ds-btn ds-btn-sm btn-p"
          >
            {savingBudget ? <FaSpinner size={14} className="animate-spin" /> : null}
            Save budget
          </button>
        </form>

        {storedTarget > 0 ? (
          <div className="dsh-meter" style={{ marginTop: 20 }}>
            <div className="row">
            <div className="lab" style={{ flexWrap: "wrap" }}>
              <span>
                Estimate {fmtMoney(grandTotal, currency)} of{" "}
                {fmtMoney(storedTarget, currency)} target (
                {formatQty(storedTarget > 0 ? (grandTotal / storedTarget) * 100 : 0, 1)}%)
              </span>
              <b style={{ color: over ? "var(--pal-orange-key)" : "var(--pal-light-key)" }}>
                {over
                  ? `Over budget by ${fmtMoney(Math.abs(variance), currency)}`
                  : `Under budget by ${fmtMoney(variance, currency)}`}
              </b>
            </div>
            <div className="track">
              <i
                style={{
                  width: `${Math.min(usedPct, 100)}%`,
                  background: over ? "var(--pal-orange-key)" : undefined,
                }}
              />
            </div>
            </div>
          </div>
        ) : (
          <p className="wk-locnote" style={{ margin: "16px 0 0" }}>
            No target budget set yet.
          </p>
        )}
        </div>
      </section>
    </div>
  );
}
