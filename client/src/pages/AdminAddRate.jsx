// src/pages/AdminAddRate.jsx
import React from "react";
import { useAuth } from "../store.jsx";
import { apiAuthed } from "../http.js";
import { FaTrash, FaEdit, FaTimes } from "react-icons/fa";

const SECTIONS = [
  { key: "ground", label: "Groundwork" },
  { key: "concrete", label: "Concrete Works" },
  { key: "blockwork", label: "Blockwork" },
  { key: "finishes", label: "Finishes" },
  { key: "roofing", label: "Roofing" },
  { key: "doors_windows", label: "Windows & Doors" },
  { key: "paint", label: "Painting" },
  { key: "steelwork", label: "Steelwork" },
];

const ADMIN_RATEGEN_V2_BASE = "/admin/rategen-v2";

const toNum = (v, fallback = 0) => {
  const n = Number(String(v ?? "").replace(/,/g, ""));
  return Number.isFinite(n) ? n : fallback;
};

const escapeRegExp = (s) => String(s).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

function makeNameAliases(name) {
  const raw = String(name || "").trim();
  if (!raw) return [];
  const lower = raw.toLowerCase();
  const noSpace = lower.replace(/\s+/g, "");
  const snake = lower.replace(/\s+/g, "_");
  return Array.from(new Set([raw, lower, noSpace, snake]));
}

function evalFormula(input, ctx) {
  const s0 = String(input ?? "").trim();
  if (!s0) return { value: 0, error: null };

  // numeric direct
  if (!s0.startsWith("=")) {
    return { value: toNum(s0, 0), error: null };
  }

  let expr = s0.slice(1);

  // Convert "3%" => "(3/100)"
  expr = expr.replace(/(\d+(?:\.\d+)?)\s*%/g, "($1/100)");

  // Replace variables (longest first to avoid partial replacements)
  const keys = Object.keys(ctx).sort((a, b) => b.length - a.length);
  for (const k of keys) {
    const v = toNum(ctx[k], 0);
    // replace case-insensitively
    expr = expr.replace(new RegExp(escapeRegExp(k), "gi"), String(v));
  }

  // Only allow safe characters after substitution
  const safe = /^[0-9+\-*/().\s]+$/;
  if (!safe.test(expr)) {
    return { value: 0, error: "Invalid characters in formula" };
  }

  try {
    // eslint-disable-next-line no-new-func
    const out = Function(`"use strict"; return (${expr});`)();
    const val = Number(out);
    if (!Number.isFinite(val))
      return { value: 0, error: "Formula returned NaN" };
    return { value: val, error: null };
  } catch (e) {
    return { value: 0, error: "Failed to evaluate formula" };
  }
}

function computeBreakdown(lines, manualNetCostStr, ohPct, prPct) {
  const qtys = lines.map((l) => toNum(l.quantity, 0));
  let unitPrices = lines.map((l) => toNum(l.unitPrice, 0));
  let lineTotals = lines.map((_, i) => qtys[i] * unitPrices[i]);
  let errorsByIndex = lines.map(() => null);

  // iterative evaluation (helps formulas that reference other lines)
  for (let iter = 0; iter < 6; iter++) {
    const breakdownNet = lineTotals.reduce((s, x) => s + toNum(x, 0), 0);
    const netCost =
      breakdownNet > 0 ? breakdownNet : toNum(manualNetCostStr, 0);

    const overheadValue = (netCost * ohPct) / 100;
    const profitValue = (netCost * prPct) / 100;
    const totalCost = netCost + overheadValue + profitValue;

    const ctx = {
      "Net Cost": netCost,
      "Overhead Value": overheadValue,
      "Profit Value": profitValue,
      "Total Cost": totalCost,
      "Overhead %": ohPct,
      "Profit %": prPct,

      // aliases
      NetCost: netCost,
      NETCOST: netCost,
      NET: netCost,
      Overhead: overheadValue,
      Profit: profitValue,
      Total: totalCost,
    };

    // add component name variables -> line total
    lines.forEach((l, idx) => {
      const nm = String(l.componentName || "").trim();
      if (!nm) return;
      const aliases = makeNameAliases(nm);
      for (const a of aliases) ctx[a] = lineTotals[idx];
    });

    // recompute unit prices + totals
    const nextUnitPrices = [...unitPrices];
    const nextTotals = [...lineTotals];
    const nextErrors = [...errorsByIndex];

    lines.forEach((l, idx) => {
      const raw = String(l.unitPrice ?? "").trim();
      const r = evalFormula(raw, ctx);
      nextUnitPrices[idx] = r.value;
      nextTotals[idx] = qtys[idx] * r.value;
      nextErrors[idx] = r.error;
    });

    unitPrices = nextUnitPrices;
    lineTotals = nextTotals;
    errorsByIndex = nextErrors;
  }

  const breakdownNet = lineTotals.reduce((s, x) => s + toNum(x, 0), 0);
  const netCost = breakdownNet > 0 ? breakdownNet : toNum(manualNetCostStr, 0);
  const overheadValue = (netCost * ohPct) / 100;
  const profitValue = (netCost * prPct) / 100;
  const totalCost = netCost + overheadValue + profitValue;

  return {
    unitPrices,
    lineTotals,
    errorsByIndex,
    breakdownNet,
    netCost,
    overheadValue,
    profitValue,
    totalCost,
  };
}

export default function AdminAddRate() {
  const { accessToken } = useAuth();

  // edit state
  const [editingId, setEditingId] = React.useState(null);

  // selection
  const [sectionKey, setSectionKey] = React.useState("");
  const sectionLabel = React.useMemo(
    () => SECTIONS.find((s) => s.key === sectionKey)?.label || "",
    [sectionKey]
  );

  // main fields
  const [itemNo, setItemNo] = React.useState("");
  const [description, setDescription] = React.useState("");
  const [unit, setUnit] = React.useState("m2");

  // net + P/O inputs
  const [manualNetCost, setManualNetCost] = React.useState("");
  const [overheadPercent, setOverheadPercent] = React.useState("10");
  const [profitPercent, setProfitPercent] = React.useState("25");

  // breakdown builder
  const [lines, setLines] = React.useState([
    { componentName: "", quantity: "", unit: "", unitPrice: "" },
  ]);

  // list existing for selected section
  const [existing, setExisting] = React.useState([]);
  const [loadingExisting, setLoadingExisting] = React.useState(false);

  // ui state
  const [saving, setSaving] = React.useState(false);
  const [msg, setMsg] = React.useState("");

  const ohPct = toNum(overheadPercent, 10);
  const prPct = toNum(profitPercent, 25);

  const calc = React.useMemo(
    () => computeBreakdown(lines, manualNetCost, ohPct, prPct),
    [lines, manualNetCost, ohPct, prPct]
  );

  async function loadExistingRates(sk) {
    if (!sk || !accessToken) return;
    setLoadingExisting(true);
    try {
      const res = await apiAuthed(
        `${ADMIN_RATEGEN_V2_BASE}/rates?sectionKey=${encodeURIComponent(sk)}`,
        { token: accessToken }
      );
      setExisting(Array.isArray(res?.items) ? res.items : []);
    } catch (e) {
      setExisting([]);
      setMsg(e?.message || "Failed to load existing rates");
    } finally {
      setLoadingExisting(false);
    }
  }

  React.useEffect(() => {
    setMsg("");
    setExisting([]);
    if (sectionKey) loadExistingRates(sectionKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sectionKey, accessToken]);

  function updateLine(i, patch) {
    setLines((prev) =>
      prev.map((x, idx) => (idx === i ? { ...x, ...patch } : x))
    );
  }

  function addLine() {
    setLines((prev) => [
      ...prev,
      { componentName: "", quantity: "", unit: "", unitPrice: "" },
    ]);
  }

  function removeLine(i) {
    setLines((prev) => prev.filter((_, idx) => idx !== i));
  }

  function resetForm() {
    setEditingId(null);
    setItemNo("");
    setDescription("");
    setUnit("m2");
    setManualNetCost("");
    setOverheadPercent("10");
    setProfitPercent("25");
    setLines([{ componentName: "", quantity: "", unit: "", unitPrice: "" }]);
  }

  function startEdit(r) {
    setMsg("");
    setEditingId(r?._id || null);

    setSectionKey(r?.sectionKey || "");
    setItemNo(r?.itemNo != null ? String(r.itemNo) : "");
    setDescription(r?.description || "");
    setUnit(r?.unit || "m2");

    setOverheadPercent(
      r?.overheadPercent != null ? String(r.overheadPercent) : "10"
    );
    setProfitPercent(r?.profitPercent != null ? String(r.profitPercent) : "25");

    const b = Array.isArray(r?.breakdown) ? r.breakdown : [];
    if (b.length > 0) {
      setManualNetCost("");
      setLines(
        b.map((l) => ({
          componentName: l.componentName || "",
          quantity: l.quantity != null ? String(l.quantity) : "",
          unit: l.unit || "",
          unitPrice: l.unitPrice != null ? String(l.unitPrice) : "",
        }))
      );
    } else {
      setManualNetCost(r?.netCost != null ? String(r.netCost) : "");
      setLines([{ componentName: "", quantity: "", unit: "", unitPrice: "" }]);
    }

    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function saveRate(e) {
    e.preventDefault();
    setMsg("");

    if (!accessToken) return setMsg("❌ Missing access token.");
    if (!sectionKey) return setMsg("❌ Please select a Section of Work.");
    if (!description.trim()) return setMsg("❌ Description is required.");
    if (!unit.trim()) return setMsg("❌ Unit is required.");
    if (!(calc.netCost > 0))
      return setMsg("❌ Net cost must be > 0 (use breakdown or manual net).");

    // If any formula is invalid, block save (so you don’t store wrong values)
    const bad = calc.errorsByIndex.find((x) => x);
    if (bad)
      return setMsg(
        "❌ One or more Unit Price formulas are invalid. Fix them before saving."
      );

    const cleanedLines = lines
      .map((l, i) => ({
        componentName: String(l.componentName || "").trim(),
        quantity: toNum(l.quantity, 0),
        unit: String(l.unit || "").trim(),
        unitPrice: toNum(calc.unitPrices[i], 0), // ✅ evaluated value
      }))
      .filter((l) => l.componentName && (l.quantity > 0 || l.unitPrice > 0));

    const payload = {
      sectionKey,
      sectionLabel,
      itemNo: itemNo ? Number(itemNo) : undefined,
      description: description.trim(),
      unit: unit.trim(),
      netCost: calc.netCost,
      overheadPercent: ohPct,
      profitPercent: prPct,
      breakdown: cleanedLines,
    };

    setSaving(true);
    try {
      if (editingId) {
        const res = await apiAuthed(
          `${ADMIN_RATEGEN_V2_BASE}/rates/${editingId}`,
          {
            token: accessToken,
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
          }
        );

        setMsg("✅ Rate updated.");
        setExisting((prev) => {
          const updated = res?.item;
          if (!updated) return prev;
          const next = prev.map((x) => (x._id === updated._id ? updated : x));
          // move updated to top
          return [updated, ...next.filter((x) => x._id !== updated._id)];
        });
        resetForm();
      } else {
        const res = await apiAuthed(`${ADMIN_RATEGEN_V2_BASE}/rates`, {
          token: accessToken,
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });

        setMsg("✅ Rate saved to library.");
        resetForm();
        if (sectionKey)
          setExisting((prev) => [res?.item, ...prev].filter(Boolean));
      }
    } catch (e2) {
      setMsg(`❌ ${e2?.message || "Failed to save rate"}`);
    } finally {
      setSaving(false);
    }
  }

  async function deleteRate(id) {
    if (!accessToken || !id) return;
    const ok = window.confirm("Delete this rate? This cannot be undone.");
    if (!ok) return;

    setMsg("");
    try {
      await apiAuthed(`${ADMIN_RATEGEN_V2_BASE}/rates/${id}`, {
        token: accessToken,
        method: "DELETE",
      });
      setExisting((prev) => prev.filter((x) => x._id !== id));
      setMsg("🗑️ Rate deleted.");
      if (editingId === id) resetForm();
    } catch (e) {
      setMsg(`❌ ${e?.message || "Failed to delete rate"}`);
    }
  }

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <div className="card">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h1 className="text-xl font-semibold">
              Admin · Build Rate Library
            </h1>
            <p className="text-sm text-slate-600 mt-1">
              Select a section of work, build the rate (breakdown or manual
              net), set Profit/Overhead, and save.
            </p>
            <p className="text-xs text-slate-500 mt-2">
              Unit Price formula examples:{" "}
              <span className="font-mono">=3%*Labour Cost</span>,{" "}
              <span className="font-mono">=10%*(Net Cost)</span>
            </p>
          </div>

          {editingId && (
            <button
              type="button"
              className="btn btn-sm flex items-center gap-2"
              onClick={resetForm}
              disabled={saving}
              title="Cancel edit"
            >
              <FaTimes />
              Cancel Edit
            </button>
          )}
        </div>

        {editingId && (
          <div className="mt-3 text-sm bg-amber-50 border border-amber-200 rounded-md p-2">
            ✏️ You are editing an existing rate. Click <b>Update rate</b> to
            save changes.
          </div>
        )}
      </div>

      <form onSubmit={saveRate} className="card space-y-4">
        <div className="grid md:grid-cols-3 gap-3">
          <div>
            <label className="form-label">Section of Work</label>
            <select
              className="input"
              value={sectionKey}
              onChange={(e) => setSectionKey(e.target.value)}
              disabled={saving}
            >
              <option value="">— Select section —</option>
              {SECTIONS.map((s) => (
                <option key={s.key} value={s.key}>
                  {s.label}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="form-label">Item No (optional)</label>
            <input
              className="input"
              value={itemNo}
              onChange={(e) => setItemNo(e.target.value)}
              placeholder="e.g. 7"
              disabled={saving}
              inputMode="numeric"
            />
          </div>

          <div>
            <label className="form-label">Unit</label>
            <input
              className="input"
              value={unit}
              onChange={(e) => setUnit(e.target.value)}
              placeholder="e.g. m2, m3, m, nr"
              disabled={saving}
            />
          </div>
        </div>

        <div>
          <label className="form-label">Description</label>
          <textarea
            className="input"
            rows={3}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Describe the rate item..."
            disabled={saving}
          />
        </div>

        <div className="border rounded-lg p-3 space-y-3">
          <div className="flex items-center justify-between gap-2">
            <div>
              <div className="font-semibold">Breakdown builder (optional)</div>
              <div className="text-xs text-slate-600">
                If breakdown totals &gt; 0, Net Cost is computed from breakdown
                automatically.
              </div>
              <div className="text-xs text-slate-500 mt-1">
                Unit Price can be number or formula starting with <b>=</b> (e.g.{" "}
                <span className="font-mono">=3%*Labour Cost</span>)
              </div>
            </div>
            <button
              type="button"
              className="btn btn-sm"
              onClick={addLine}
              disabled={saving}
            >
              + Add line
            </button>
          </div>

          <div className="space-y-2">
            {lines.map((l, i) => {
              const lineTotal = toNum(calc.lineTotals[i], 0);
              const unitPriceCalc = toNum(calc.unitPrices[i], 0);
              const err = calc.errorsByIndex[i];

              return (
                <div
                  key={i}
                  className="grid md:grid-cols-12 gap-2 items-center"
                >
                  <div className="md:col-span-5">
                    <input
                      className="input"
                      value={l.componentName}
                      onChange={(e) =>
                        updateLine(i, { componentName: e.target.value })
                      }
                      placeholder="Component name (e.g. Labour Cost)"
                      disabled={saving}
                    />
                  </div>

                  <div className="md:col-span-2">
                    <input
                      className="input"
                      value={l.quantity}
                      onChange={(e) =>
                        updateLine(i, { quantity: e.target.value })
                      }
                      placeholder="Qty"
                      disabled={saving}
                      inputMode="decimal"
                    />
                  </div>

                  <div className="md:col-span-2">
                    <input
                      className="input"
                      value={l.unit}
                      onChange={(e) => updateLine(i, { unit: e.target.value })}
                      placeholder="Unit"
                      disabled={saving}
                    />
                  </div>

                  <div className="md:col-span-2">
                    <input
                      className={`input ${err ? "border-red-400" : ""}`}
                      value={l.unitPrice}
                      onChange={(e) =>
                        updateLine(i, { unitPrice: e.target.value })
                      }
                      placeholder="Unit price (or =formula)"
                      disabled={saving}
                      // ✅ must be text to allow formulas
                      inputMode="text"
                    />
                    <div className="text-[11px] text-slate-500 mt-1">
                      UnitPrice: {unitPriceCalc.toFixed(2)}
                      {err ? (
                        <span className="text-red-600"> · {err}</span>
                      ) : null}
                    </div>
                  </div>

                  <div className="md:col-span-1 flex items-center justify-between gap-2">
                    <span className="text-xs text-slate-600">
                      {lineTotal.toFixed(2)}
                    </span>
                    {lines.length > 1 && (
                      <button
                        type="button"
                        className="btn btn-sm"
                        onClick={() => removeLine(i)}
                        disabled={saving}
                        title="Remove line"
                      >
                        ×
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <div className="grid md:grid-cols-3 gap-3">
          <div>
            <label className="form-label">
              Manual Net Cost (used if breakdown total is 0)
            </label>
            <input
              className="input"
              value={manualNetCost}
              onChange={(e) => setManualNetCost(e.target.value)}
              placeholder="0.00"
              disabled={saving}
              inputMode="decimal"
            />
          </div>

          <div>
            <label className="form-label">Overhead (%)</label>
            <input
              className="input"
              value={overheadPercent}
              onChange={(e) => setOverheadPercent(e.target.value)}
              placeholder="10"
              disabled={saving}
              inputMode="decimal"
            />
          </div>

          <div>
            <label className="form-label">Profit (%)</label>
            <input
              className="input"
              value={profitPercent}
              onChange={(e) => setProfitPercent(e.target.value)}
              placeholder="25"
              disabled={saving}
              inputMode="decimal"
            />
          </div>
        </div>

        <div className="grid md:grid-cols-4 gap-3">
          <div className="border rounded-lg p-3">
            <div className="text-xs text-slate-600">Net Cost</div>
            <div className="text-lg font-semibold">
              {toNum(calc.netCost).toFixed(2)}
            </div>
          </div>
          <div className="border rounded-lg p-3">
            <div className="text-xs text-slate-600">Overhead Value</div>
            <div className="text-lg font-semibold">
              {toNum(calc.overheadValue).toFixed(2)}
            </div>
          </div>
          <div className="border rounded-lg p-3">
            <div className="text-xs text-slate-600">Profit Value</div>
            <div className="text-lg font-semibold">
              {toNum(calc.profitValue).toFixed(2)}
            </div>
          </div>
          <div className="border rounded-lg p-3">
            <div className="text-xs text-slate-600">Total Cost</div>
            <div className="text-lg font-semibold">
              {toNum(calc.totalCost).toFixed(2)}
            </div>
          </div>
        </div>

        {msg && <div className="text-sm">{msg}</div>}

        <button className="btn w-full" disabled={!accessToken || saving}>
          {saving
            ? "Saving..."
            : editingId
            ? "Update rate"
            : "Save rate to library"}
        </button>
      </form>

      <div className="card">
        <div className="flex items-center justify-between gap-3">
          <h2 className="font-semibold">Existing Rates (selected section)</h2>
          {loadingExisting && (
            <span className="text-xs text-slate-600">Loading…</span>
          )}
        </div>

        {!sectionKey ? (
          <div className="text-sm text-slate-600 mt-2">
            Select a section to view saved rates.
          </div>
        ) : existing.length === 0 ? (
          <div className="text-sm text-slate-600 mt-2">
            No rates saved under this section yet.
          </div>
        ) : (
          <div className="mt-3 space-y-2">
            {existing.map((r) => (
              <div
                key={r._id}
                className="border rounded-lg p-3 flex items-start justify-between gap-3"
              >
                <div className="min-w-0">
                  <div className="font-semibold truncate">
                    {r.itemNo ? `${r.itemNo}. ` : ""}
                    {r.description}
                  </div>
                  <div className="text-xs text-slate-600 mt-1">
                    Unit: {r.unit} · Net: {toNum(r.netCost).toFixed(2)} · OH{" "}
                    {toNum(r.overheadPercent).toFixed(2)}% · Profit{" "}
                    {toNum(r.profitPercent).toFixed(2)}% · Total:{" "}
                    {toNum(r.totalCost).toFixed(2)}
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    className="btn btn-sm flex items-center gap-2"
                    onClick={() => startEdit(r)}
                    disabled={saving}
                    title="Edit rate"
                  >
                    <FaEdit />
                    Edit
                  </button>

                  <button
                    type="button"
                    className="btn btn-sm flex items-center gap-2 bg-red-600 hover:bg-red-700 text-white"
                    onClick={() => deleteRate(r._id)}
                    disabled={saving}
                    title="Delete rate"
                  >
                    <FaTrash />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
