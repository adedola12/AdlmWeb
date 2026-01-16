// src/pages/AdminAddRate.jsx
import React from "react";
import { useAuth } from "../store.jsx";
import { apiAuthed } from "../http.js";

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

const toNum = (v) => {
  const n = Number(String(v ?? "").replace(/,/g, ""));
  return Number.isFinite(n) ? n : 0;
};

// ✅ v2 admin base (matches server/index.js)
const ADMIN_RATEGEN_V2_BASE = "/admin/rategen-v2";

export default function AdminAddRate() {
  const { accessToken } = useAuth();

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

  const breakdownNet = React.useMemo(() => {
    return lines.reduce((sum, l) => {
      const qty = toNum(l.quantity);
      const price = toNum(l.unitPrice);
      return sum + qty * price;
    }, 0);
  }, [lines]);

  const netCost = breakdownNet > 0 ? breakdownNet : toNum(manualNetCost);
  const ohPct = toNum(overheadPercent);
  const prPct = toNum(profitPercent);

  const overheadValue = (netCost * ohPct) / 100;
  const profitValue = (netCost * prPct) / 100;
  const totalCost = netCost + overheadValue + profitValue;

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
    setItemNo("");
    setDescription("");
    setUnit("m2");
    setManualNetCost("");
    setOverheadPercent("10");
    setProfitPercent("25");
    setLines([{ componentName: "", quantity: "", unit: "", unitPrice: "" }]);
  }

  async function saveRate(e) {
    e.preventDefault();
    setMsg("");

    if (!accessToken) return setMsg("❌ Missing access token.");
    if (!sectionKey) return setMsg("❌ Please select a Section of Work.");
    if (!description.trim()) return setMsg("❌ Description is required.");
    if (!unit.trim()) return setMsg("❌ Unit is required.");
    if (!(netCost > 0))
      return setMsg(
        "❌ Net cost must be > 0 (use breakdown or manual net cost)."
      );

    const cleanedLines = lines
      .map((l) => ({
        componentName: String(l.componentName || "").trim(),
        quantity: toNum(l.quantity),
        unit: String(l.unit || "").trim(),
        unitPrice: toNum(l.unitPrice),
      }))
      .filter((l) => l.componentName && (l.quantity > 0 || l.unitPrice > 0));

    const payload = {
      sectionKey,
      sectionLabel,
      itemNo: itemNo ? Number(itemNo) : undefined,
      description: description.trim(),
      unit: unit.trim(),
      netCost,
      overheadPercent: ohPct,
      profitPercent: prPct,
      breakdown: cleanedLines,
    };

    setSaving(true);
    try {
      const res = await apiAuthed(`${ADMIN_RATEGEN_V2_BASE}/rates`, {
        token: accessToken,
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      setMsg("✅ Rate saved to library.");
      resetForm();

      // refresh list for this section
      if (sectionKey)
        setExisting((prev) => [res?.item, ...prev].filter(Boolean));
    } catch (e2) {
      setMsg(`❌ ${e2?.message || "Failed to save rate"}`);
    } finally {
      setSaving(false);
    }
  }

  async function deleteRate(id) {
    if (!accessToken || !id) return;
    setMsg("");
    try {
      await apiAuthed(`${ADMIN_RATEGEN_V2_BASE}/rates/${id}`, {
        token: accessToken,
        method: "DELETE",
      });
      setExisting((prev) => prev.filter((x) => x._id !== id));
      setMsg("🗑️ Rate deleted.");
    } catch (e) {
      setMsg(`❌ ${e?.message || "Failed to delete rate"}`);
    }
  }

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <div className="card">
        <h1 className="text-xl font-semibold">Admin · Build Rate Library</h1>
        <p className="text-sm text-slate-600 mt-1">
          Select a section of work, build the rate (breakdown or manual net),
          set Profit/Overhead, and save. P/O is stored in Mongo so it won’t get
          lost.
        </p>
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
              const lineTotal = toNum(l.quantity) * toNum(l.unitPrice);
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
                      placeholder="Component name (e.g. Cement)"
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
                      className="input"
                      value={l.unitPrice}
                      onChange={(e) =>
                        updateLine(i, { unitPrice: e.target.value })
                      }
                      placeholder="Unit price"
                      disabled={saving}
                      inputMode="decimal"
                    />
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
            <div className="text-lg font-semibold">{netCost.toFixed(2)}</div>
          </div>
          <div className="border rounded-lg p-3">
            <div className="text-xs text-slate-600">Overhead Value</div>
            <div className="text-lg font-semibold">
              {overheadValue.toFixed(2)}
            </div>
          </div>
          <div className="border rounded-lg p-3">
            <div className="text-xs text-slate-600">Profit Value</div>
            <div className="text-lg font-semibold">
              {profitValue.toFixed(2)}
            </div>
          </div>
          <div className="border rounded-lg p-3">
            <div className="text-xs text-slate-600">Total Cost</div>
            <div className="text-lg font-semibold">{totalCost.toFixed(2)}</div>
          </div>
        </div>

        {msg && <div className="text-sm">{msg}</div>}

        <button className="btn w-full" disabled={!accessToken || saving}>
          {saving ? "Saving..." : "Save rate to library"}
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

                <button
                  type="button"
                  className="btn btn-sm"
                  onClick={() => deleteRate(r._id)}
                  disabled={saving}
                >
                  Delete
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
