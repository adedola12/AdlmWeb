// src/features/archicad/ArchiCADElementPanel.jsx
// Single-element drill-down: quantities with proper unit labels, cost
// breakdown, and — per the spec — the full rate & labour provenance
// (rate name/source/id, labour method, gang composition, labour unit rate).
import React from "react";
import { Link } from "react-router-dom";
import { FaCube, FaTag, FaUsers } from "react-icons/fa";
import {
  breakdownFieldLabel,
  formatBreakdownValue,
  fmtMoney,
  formatQty,
  safeNum,
} from "../../utils/archicadUnits.js";

const RATE_SOURCE_LABELS = {
  rategen: "RateGen library",
  "compute-item": "Compute item build-up",
  custom: "Custom rate",
  manual: "Manual rate",
  unpriced: "Unpriced",
};

const LABOUR_METHOD_LABELS = {
  "rate-breakdown": "Rate build-up labour lines",
  residual: "Residual derivation",
  "labour-library": "Labour library match",
  manual: "Manual",
  unpriced: "Unpriced",
};

function SectionCard({ title, icon, children }) {
  return (
    <div className="rounded-adlm-lg border border-slate-200 bg-white p-4 shadow-sm dark:border-adlm-dark-border dark:bg-adlm-dark-panel">
      <div className="mb-3 flex items-center gap-2 font-semibold text-slate-900 dark:text-white">
        {icon}
        {title}
      </div>
      {children}
    </div>
  );
}

function KV({ label, value, mono = false }) {
  return (
    <div className="flex items-start justify-between gap-4 border-b border-slate-100 py-1.5 text-sm last:border-0 dark:border-adlm-dark-border/60">
      <span className="text-slate-500 dark:text-adlm-dark-muted">{label}</span>
      <span
        className={`text-right text-slate-900 dark:text-adlm-dark-text ${
          mono ? "break-all font-mono text-xs" : "tabular-nums"
        }`}
      >
        {value ?? "—"}
      </span>
    </div>
  );
}

export default function ArchiCADElementPanel({ element, units = "metric", projectId }) {
  if (!element) return null;

  const quantities = element.quantities || element.quantitiesBreakdown || {};
  const qtyEntries = Object.entries(quantities).filter(([, v]) => v != null);
  const rate = element.rateProvenance || {};
  const labour = element.labourProvenance || {};
  const gang = Array.isArray(labour.gangComposition) ? labour.gangComposition : [];
  const currency = element.currency || "NGN";
  const sharePct = safeNum(element.lineQuantityShare) * 100;

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="rounded-adlm-lg border border-slate-200 bg-white p-4 shadow-sm dark:border-adlm-dark-border dark:bg-adlm-dark-panel">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-lg font-bold text-slate-900 dark:text-white">
                {element.description || "ArchiCAD element"}
              </h2>
              {element.quivType ? (
                <span className="rounded-full bg-adlm-blue-600/10 px-2.5 py-0.5 text-xs font-semibold text-adlm-blue-700 dark:bg-adlm-blue-600/20 dark:text-adlm-blue-300">
                  {element.quivType}
                </span>
              ) : null}
            </div>
            <div className="mt-1 break-all font-mono text-xs text-slate-400 dark:text-adlm-dark-dim">
              GUID {element.guid}
            </div>
          </div>
          {element.itemRef ? (
            <Link
              to={`/archicad/${projectId}/boq`}
              className="rounded-adlm border border-slate-300 px-3 py-1.5 text-sm font-semibold text-slate-700 transition hover:border-adlm-blue-600 hover:text-adlm-blue-700 dark:border-adlm-dark-border dark:text-adlm-dark-text dark:hover:text-adlm-blue-300"
            >
              BoQ item {element.itemRef}
            </Link>
          ) : null}
        </div>
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        {/* Quantities */}
        <SectionCard
          title="Quantities"
          icon={<FaCube className="text-adlm-blue-600 dark:text-adlm-blue-300" />}
        >
          {qtyEntries.length ? (
            <table className="w-full text-sm">
              <tbody>
                {qtyEntries.map(([key, value]) => (
                  <tr
                    key={key}
                    className="border-b border-slate-100 last:border-0 dark:border-adlm-dark-border/60"
                  >
                    <td className="py-1.5 text-slate-500 dark:text-adlm-dark-muted">
                      {breakdownFieldLabel(key)}
                    </td>
                    <td className="py-1.5 text-right tabular-nums text-slate-900 dark:text-adlm-dark-text">
                      {formatBreakdownValue(key, value, units)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <div className="text-sm text-slate-400 dark:text-adlm-dark-dim">
              No quantity breakdown was extracted for this element.
            </div>
          )}
        </SectionCard>

        {/* Cost breakdown */}
        <SectionCard
          title="Cost breakdown"
          icon={<FaTag className="text-adlm-blue-600 dark:text-adlm-blue-300" />}
        >
          <KV label="Unit rate" value={fmtMoney(element.unitRate, currency)} />
          <KV label="Material" value={fmtMoney(element.materialAmount, currency)} />
          <KV label="Labour" value={fmtMoney(element.labourAmount, currency)} />
          <KV label="Margin" value={fmtMoney(element.marginAmount, currency)} />
          <KV
            label="Total"
            value={
              <span className="font-semibold">{fmtMoney(element.totalAmount, currency)}</span>
            }
          />
          {Number.isFinite(Number(element.lineQuantityShare)) ? (
            <KV
              label="Share of BoQ line"
              value={`${formatQty(sharePct, 2)}%`}
            />
          ) : null}
        </SectionCard>
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        {/* Rate provenance */}
        <SectionCard
          title="Rate provenance"
          icon={<FaTag className="text-adlm-orange" />}
        >
          <KV label="Rate" value={rate.name || "—"} />
          <KV
            label="Source"
            value={RATE_SOURCE_LABELS[rate.rateSource] || rate.rateSource || "—"}
          />
          <KV label="Section" value={rate.section || "—"} />
          {rate.matchScore != null ? (
            <KV label="Match score" value={formatQty(rate.matchScore, 2)} />
          ) : null}
          <KV label="Rate id" value={rate.rateId || "—"} mono />
        </SectionCard>

        {/* Labour provenance */}
        <SectionCard
          title="Labour provenance"
          icon={<FaUsers className="text-adlm-orange" />}
        >
          <KV
            label="Method"
            value={LABOUR_METHOD_LABELS[labour.method] || labour.method || "—"}
          />
          <KV
            label="Labour unit rate"
            value={fmtMoney(labour.labourUnitRate, currency)}
          />
          {labour.sourceRateId ? (
            <KV label="Labour rate id" value={labour.sourceRateId} mono />
          ) : null}
          {labour.notes ? <KV label="Notes" value={labour.notes} /> : null}

          {gang.length ? (
            <div className="mt-3">
              <div className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-adlm-dark-muted">
                Gang composition
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-500 dark:border-adlm-dark-border dark:text-adlm-dark-muted">
                      <th className="py-1.5 pr-2 font-semibold">Trade</th>
                      <th className="py-1.5 pr-2 font-semibold">Unit</th>
                      <th className="py-1.5 pr-2 text-right font-semibold">Qty / unit</th>
                      <th className="py-1.5 text-right font-semibold">Unit price</th>
                    </tr>
                  </thead>
                  <tbody>
                    {gang.map((g, i) => (
                      <tr
                        key={`${g?.name || "gang"}-${i}`}
                        className="border-b border-slate-100 last:border-0 dark:border-adlm-dark-border/60"
                      >
                        <td className="py-1.5 pr-2 text-slate-900 dark:text-adlm-dark-text">
                          {g?.name || "—"}
                        </td>
                        <td className="py-1.5 pr-2 text-slate-500 dark:text-adlm-dark-muted">
                          {g?.unit || "—"}
                        </td>
                        <td className="py-1.5 pr-2 text-right tabular-nums text-slate-900 dark:text-adlm-dark-text">
                          {formatQty(g?.qtyPerUnit)}
                        </td>
                        <td className="py-1.5 text-right tabular-nums text-slate-900 dark:text-adlm-dark-text">
                          {fmtMoney(g?.unitPrice, currency)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ) : null}
        </SectionCard>
      </div>
    </div>
  );
}
