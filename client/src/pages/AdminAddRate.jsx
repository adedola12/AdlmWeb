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

  if (!s0.startsWith("=")) {
    return { value: toNum(s0, 0), error: null };
  }

  let expr = s0.slice(1);

  // Convert "3%" => "(3/100)"
  expr = expr.replace(/(\d+(?:\.\d+)?)\s*%/g, "($1/100)");

  const keys = Object.keys(ctx).sort((a, b) => b.length - a.length);
  for (const k of keys) {
    const v = toNum(ctx[k], 0);
    expr = expr.replace(new RegExp(escapeRegExp(k), "gi"), String(v));
  }

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
  } catch {
    return { value: 0, error: "Failed to evaluate formula" };
  }
}

function computeBreakdown(lines, manualNetCostStr, ohPct, prPct) {
  const qtys = lines.map((l) => toNum(l.quantity, 0));
  let unitPrices = lines.map((l) => toNum(l.unitPrice, 0));
  let lineTotals = lines.map((_, i) => qtys[i] * unitPrices[i]);
  let errorsByIndex = lines.map(() => null);

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

      NetCost: netCost,
      NETCOST: netCost,
      NET: netCost,
      Overhead: overheadValue,
      Profit: profitValue,
      Total: totalCost,
    };

    lines.forEach((l, idx) => {
      const nm = String(l.componentName || "").trim();
      if (!nm) return;
      const aliases = makeNameAliases(nm);
      for (const a of aliases) ctx[a] = lineTotals[idx];
    });

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

// --- library helpers ---
const norm = (s) =>
  String(s || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

const normKey = (s) => norm(s).replace(/\s+/g, "");

export default function AdminAddRate() {
  const { accessToken } = useAuth();

  const [editingId, setEditingId] = React.useState(null);

  const [sectionKey, setSectionKey] = React.useState("");
  const sectionLabel = React.useMemo(
    () => SECTIONS.find((s) => s.key === sectionKey)?.label || "",
    [sectionKey]
  );

  const [itemNo, setItemNo] = React.useState("");
  const [description, setDescription] = React.useState("");
  const [unit, setUnit] = React.useState("m2");

  const [manualNetCost, setManualNetCost] = React.useState("");
  const [overheadPercent, setOverheadPercent] = React.useState("10");
  const [profitPercent, setProfitPercent] = React.useState("25");

  const [lines, setLines] = React.useState([
    {
      componentName: "",
      quantity: "",
      unit: "",
      unitPrice: "",
      refKind: null,
      refSn: null,
      refName: null,
    },
  ]);

  const [existing, setExisting] = React.useState([]);
  const [loadingExisting, setLoadingExisting] = React.useState(false);
  const [existingErr, setExistingErr] = React.useState("");

  const [saving, setSaving] = React.useState(false);
  const [msg, setMsg] = React.useState("");

  const ohPct = toNum(overheadPercent, 10);
  const prPct = toNum(profitPercent, 25);

  const calc = React.useMemo(
    () => computeBreakdown(lines, manualNetCost, ohPct, prPct),
    [lines, manualNetCost, ohPct, prPct]
  );

  // =========================
  // Master library
  // =========================
  const [libLoading, setLibLoading] = React.useState(false);
  const [libErr, setLibErr] = React.useState("");
  const [libFlat, setLibFlat] = React.useState([]);

  React.useEffect(() => {
    if (!accessToken) return;

    let alive = true;

    (async () => {
      setLibErr("");
      setLibLoading(true);

      try {
        const tryUrls = [
          `${ADMIN_RATEGEN_V2_BASE}/master?zone=south_west`,
          `/rategen/master?zone=south_west`,
        ];

        let res = null;
        let lastErr = null;

        for (const url of tryUrls) {
          try {
            // eslint-disable-next-line no-await-in-loop
            res = await apiAuthed(url, { token: accessToken });
            break;
          } catch (e) {
            lastErr = e;
          }
        }

        if (!res) throw lastErr || new Error("Failed to fetch master library");

        const mats = Array.isArray(res?.materials) ? res.materials : [];
        const labs = Array.isArray(res?.labour) ? res.labour : [];

        const flat = [
          ...mats.map((x) => ({
            kind: "material",
            description: x.description || "",
            unit: x.unit || "",
            price: toNum(x.price, 0),
            sn: x.sn ?? null,
            k: normKey(x.description || ""),
          })),
          ...labs.map((x) => ({
            kind: "labour",
            description: x.description || "",
            unit: x.unit || "",
            price: toNum(x.price, 0),
            sn: x.sn ?? null,
            k: normKey(x.description || ""),
          })),
        ].filter((x) => x.description);

        flat.sort((a, b) => a.description.localeCompare(b.description));

        if (alive) setLibFlat(flat);
      } catch (e) {
        if (alive) setLibErr(e?.message || "Failed to load master library");
      } finally {
        if (alive) setLibLoading(false);
      }
    })();

    return () => {
      alive = false;
    };
  }, [accessToken]);

  function getSuggestions(query) {
    const q = normKey(query);
    if (!q || q.length < 2) return [];
    const hits = libFlat.filter((x) => x.k.includes(q));
    return hits.slice(0, 10);
  }

  const [openSuggestFor, setOpenSuggestFor] = React.useState(null);

  function applySuggestion(i, item) {
    setLines((prev) =>
      prev.map((x, idx) => {
        if (idx !== i) return x;
        return {
          ...x,
          componentName: item.description,
          unit: item.unit || "",
          unitPrice: String(item.price ?? ""),
          refKind: item.kind,
          refSn: item.sn ?? null,
          refName: item.description,
        };
      })
    );
    setOpenSuggestFor(null);
  }

  // =========================
  // ✅ Existing rates (FIXED)
  // - Load ALL rates if sectionKey is empty
  // - Filter when section is selected
  // =========================
  async function loadExistingRates(sk) {
    if (!accessToken) return;

    setLoadingExisting(true);
    setExistingErr("");

    try {
      const qs = sk
        ? `?sectionKey=${encodeURIComponent(sk)}&limit=500`
        : `?limit=500`;
      const res = await apiAuthed(`${ADMIN_RATEGEN_V2_BASE}/rates${qs}`, {
        token: accessToken,
      });

      setExisting(Array.isArray(res?.items) ? res.items : []);
    } catch (e) {
      setExisting([]);
      setExistingErr(e?.message || "Failed to load existing rates");
    } finally {
      setLoadingExisting(false);
    }
  }

  React.useEffect(() => {
    setMsg("");
    setExisting([]);
    if (accessToken) loadExistingRates(sectionKey);
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
      {
        componentName: "",
        quantity: "",
        unit: "",
        unitPrice: "",
        refKind: null,
        refSn: null,
        refName: null,
      },
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
    setLines([
      {
        componentName: "",
        quantity: "",
        unit: "",
        unitPrice: "",
        refKind: null,
        refSn: null,
        refName: null,
      },
    ]);
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
          refKind: l.refKind ?? null,
          refSn: l.refSn ?? null,
          refName: l.refName ?? null,
        }))
      );
    } else {
      setManualNetCost(r?.netCost != null ? String(r.netCost) : "");
      setLines([
        {
          componentName: "",
          quantity: "",
          unit: "",
          unitPrice: "",
          refKind: null,
          refSn: null,
          refName: null,
        },
      ]);
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

    const bad = calc.errorsByIndex.find((x) => x);
    if (bad) {
      return setMsg(
        "❌ One or more Unit Price formulas are invalid. Fix them before saving."
      );
    }

    const cleanedLines = lines
      .map((l, i) => ({
        componentName: String(l.componentName || "").trim(),
        quantity: toNum(l.quantity, 0),
        unit: String(l.unit || "").trim(),
        unitPrice: toNum(calc.unitPrices[i], 0),

        refKind: l.refKind || null,
        refSn: l.refSn != null ? Number(l.refSn) : null,
        refName: l.refName || null,
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
        resetForm();
        // reload list (keeps filter)
        loadExistingRates(sectionKey);
      } else {
        await apiAuthed(`${ADMIN_RATEGEN_V2_BASE}/rates`, {
          token: accessToken,
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });

        setMsg("✅ Rate saved to library.");
        resetForm();
        loadExistingRates(sectionKey);
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
      setMsg("🗑️ Rate deleted.");
      if (editingId === id) resetForm();
      loadExistingRates(sectionKey);
    } catch (e) {
      setMsg(`❌ ${e?.message || "Failed to delete rate"}`);
    }
  }

  const existingTitle = sectionKey
    ? `Existing Rates (${sectionLabel || sectionKey})`
    : "Existing Rates (all sections)";

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <div className="card">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h1 className="text-xl font-semibold">
              Admin · Build Rate Library
            </h1>
            <p className="text-sm text-slate-600 mt-1">
              Component Name links to Material/Labour master library (South West
              default).
            </p>

            <div className="text-xs text-slate-500 mt-2">
              {libLoading
                ? "⏳ Fetching Master Library..."
                : libErr
                ? `⚠️ ${libErr}`
                : `✅ Fetched Master Library: ${libFlat.length} items`}
            </div>
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
              <option value="">— All sections (no filter) —</option>
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
              <div className="font-semibold">
                Breakdown builder (linked to master library)
              </div>
              <div className="text-xs text-slate-600">
                Type Component Name → pick match → Name/Unit/UnitPrice
                auto-fills (you only enter Qty).
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

              const qk = normKey(l.componentName);
              const suggestions =
                openSuggestFor === i ? getSuggestions(l.componentName) : [];

              const linkedTag =
                l.refKind === "material"
                  ? "Material"
                  : l.refKind === "labour"
                  ? "Labour"
                  : null;

              const showDropdown = openSuggestFor === i;

              return (
                <div
                  key={i}
                  className="grid md:grid-cols-12 gap-2 items-center"
                >
                  <div className="md:col-span-5 relative">
                    <div className="flex items-center gap-2">
                      <input
                        className="input w-full"
                        value={l.componentName}
                        onChange={(e) => {
                          updateLine(i, {
                            componentName: e.target.value,
                            refKind: null,
                            refSn: null,
                            refName: null,
                          });
                          setOpenSuggestFor(i);
                        }}
                        onFocus={() => setOpenSuggestFor(i)}
                        onBlur={() =>
                          setTimeout(
                            () =>
                              setOpenSuggestFor((x) => (x === i ? null : x)),
                            140
                          )
                        }
                        placeholder="Component name (search materials/labour...)"
                        disabled={saving}
                      />

                      {linkedTag ? (
                        <span className="text-[11px] px-2 py-1 rounded bg-emerald-50 border border-emerald-200 text-emerald-700 whitespace-nowrap">
                          Linked: {linkedTag}
                        </span>
                      ) : libLoading && showDropdown ? (
                        <span className="text-[11px] px-2 py-1 rounded bg-slate-50 border border-slate-200 text-slate-600 whitespace-nowrap">
                          Fetching...
                        </span>
                      ) : null}
                    </div>

                    {showDropdown && (
                      <div className="absolute z-20 mt-1 w-full rounded-md border bg-white shadow-lg max-h-64 overflow-auto">
                        {libLoading ? (
                          <div className="px-3 py-3 text-sm text-slate-600">
                            ⏳ Fetching Master Library...
                          </div>
                        ) : libErr ? (
                          <div className="px-3 py-3 text-sm text-amber-700">
                            ⚠️ {libErr}
                          </div>
                        ) : qk.length >= 2 && suggestions.length === 0 ? (
                          <div className="px-3 py-3 text-sm text-slate-600">
                            No match in Master Library (try another keyword).
                          </div>
                        ) : suggestions.length > 0 ? (
                          suggestions.map((sug, idx) => (
                            <div
                              key={`${sug.kind}-${sug.sn}-${idx}`}
                              className="px-3 py-2 hover:bg-slate-50 cursor-pointer"
                              onMouseDown={(e) => {
                                e.preventDefault();
                                applySuggestion(i, sug);
                              }}
                            >
                              <div className="text-sm font-medium">
                                {sug.description}
                              </div>
                              <div className="text-xs text-slate-600">
                                {sug.kind.toUpperCase()} · {sug.unit || "-"} ·{" "}
                                {toNum(sug.price).toFixed(2)}
                              </div>
                            </div>
                          ))
                        ) : (
                          <div className="px-3 py-3 text-sm text-slate-500">
                            Start typing to search master materials/labour...
                          </div>
                        )}
                      </div>
                    )}
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
          <h2 className="font-semibold">{existingTitle}</h2>
          {loadingExisting && (
            <span className="text-xs text-slate-600">Loading…</span>
          )}
        </div>

        {!sectionKey && (
          <div className="text-xs text-slate-500 mt-1">
            Showing latest rates across all sections. Select a section to
            filter.
          </div>
        )}

        {existingErr ? (
          <div className="text-sm text-red-600 mt-2">❌ {existingErr}</div>
        ) : existing.length === 0 ? (
          <div className="text-sm text-slate-600 mt-2">No rates found.</div>
        ) : (
          <div className="mt-3 space-y-2">
            {existing.map((r) => (
              <div
                key={String(r._id)}
                className="border rounded-lg p-3 flex items-start justify-between gap-3"
              >
                <div className="min-w-0">
                  <div className="font-semibold truncate">
                    {r.itemNo ? `${r.itemNo}. ` : ""}
                    {r.description}
                  </div>
                  <div className="text-xs text-slate-600 mt-1">
                    Section: {r.sectionLabel || r.sectionKey} · Unit: {r.unit} ·
                    Net: {toNum(r.netCost).toFixed(2)} · OH{" "}
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
