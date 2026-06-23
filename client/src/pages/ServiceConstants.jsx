// src/pages/ServiceConstants.jsx
import React from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../store.jsx";
import { apiAuthed } from "../http.js";

const CONNECTOR_RULES = [
  { value: "perBreak", label: "Per joint (sticks − 1)" },
  { value: "perStick", label: "Per stick" },
  { value: "none", label: "None" },
];

// House standards used to price MEP services (standard lengths → bundle/Nr,
// connector rules, fittings allowance per type). Edits feed the shared
// serviceCompute engine via /rategen-v2/services/constants.
export default function ServiceConstants() {
  const { accessToken } = useAuth();
  const [unitSystem, setUnitSystem] = React.useState("metric");
  const [rows, setRows] = React.useState([]);
  const [loading, setLoading] = React.useState(true);
  const [saving, setSaving] = React.useState(false);
  const [msg, setMsg] = React.useState("");

  React.useEffect(() => {
    if (!accessToken) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await apiAuthed("/rategen-v2/services/constants", {
          token: accessToken,
        });
        if (cancelled) return;
        setUnitSystem(res?.unitSystem || "metric");
        setRows(Object.values(res?.types || {}).map((t) => ({ ...t })));
      } catch (e) {
        if (!cancelled) setMsg(e?.message || "Failed to load constants.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [accessToken]);

  function patch(i, key, value) {
    setRows((rs) => rs.map((r, idx) => (idx === i ? { ...r, [key]: value } : r)));
  }

  async function save() {
    setSaving(true);
    setMsg("");
    try {
      const payload = {
        unitSystem,
        types: rows.map((r) => ({
          type: r.type,
          measure: r.measure,
          unit: r.unit,
          standardLength: Number(r.standardLength) || 0,
          connectorRule: r.connectorRule,
          connectorsPerJoint: Number(r.connectorsPerJoint) || 1,
          fittingUpliftPercent: Number(r.fittingUpliftPercent) || 0,
        })),
      };
      const res = await apiAuthed("/rategen-v2/services/constants", {
        token: accessToken,
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      setRows(Object.values(res?.types || {}).map((t) => ({ ...t })));
      setUnitSystem(res?.unitSystem || unitSystem);
      setMsg("✅ Saved.");
    } catch (e) {
      setMsg(e?.message || "Failed to save.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div className="card">
        <div className="flex items-center justify-between gap-3 mb-1">
          <h1 className="text-xl font-semibold">Services Constants</h1>
          <Link to="/rategen" className="text-sm underline">
            ← RateGen
          </Link>
        </div>
        <p className="text-sm text-slate-600 dark:text-slate-400 mb-4">
          House standards for pricing MEP services: standard lengths (used to
          compute bundles / Nr), connector rules, and a fittings allowance per
          type. These feed the build-up when you press “Price services” on a
          services project.
        </p>

        <div className="mb-4 flex items-center gap-3">
          <label className="form-label mb-0" htmlFor="unit-system">
            Unit system
          </label>
          <select
            id="unit-system"
            className="input max-w-[160px]"
            value={unitSystem}
            onChange={(e) => setUnitSystem(e.target.value)}
          >
            <option value="metric">Metric</option>
            <option value="imperial">Imperial</option>
          </select>
        </div>

        {loading ? (
          <div role="status" className="text-sm text-slate-500">
            Loading…
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs uppercase text-slate-500 dark:text-slate-400">
                  <th className="py-2 pr-3">Type</th>
                  <th className="py-2 pr-3">Measure</th>
                  <th className="py-2 pr-3">Std length</th>
                  <th className="py-2 pr-3">Unit</th>
                  <th className="py-2 pr-3">Connectors</th>
                  <th className="py-2 pr-3">Per joint</th>
                  <th className="py-2 pr-3">Fitting uplift %</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => {
                  const isCount = r.measure === "count";
                  return (
                    <tr
                      key={r.type}
                      className="border-t border-slate-100 dark:border-white/10"
                    >
                      <td className="py-2 pr-3 font-medium capitalize">{r.type}</td>
                      <td className="py-2 pr-3 text-slate-500">{r.measure}</td>
                      <td className="py-2 pr-3">
                        <input
                          type="number"
                          min="0"
                          step="0.1"
                          className="input w-24"
                          value={r.standardLength}
                          disabled={isCount}
                          onChange={(e) => patch(i, "standardLength", e.target.value)}
                          aria-label={`${r.type} standard length`}
                        />
                      </td>
                      <td className="py-2 pr-3">
                        <input
                          className="input w-16"
                          value={r.unit}
                          onChange={(e) => patch(i, "unit", e.target.value)}
                          aria-label={`${r.type} unit`}
                        />
                      </td>
                      <td className="py-2 pr-3">
                        <select
                          className="input w-44"
                          value={r.connectorRule}
                          disabled={isCount}
                          onChange={(e) => patch(i, "connectorRule", e.target.value)}
                          aria-label={`${r.type} connector rule`}
                        >
                          {CONNECTOR_RULES.map((c) => (
                            <option key={c.value} value={c.value}>
                              {c.label}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td className="py-2 pr-3">
                        <input
                          type="number"
                          min="1"
                          step="1"
                          className="input w-16"
                          value={r.connectorsPerJoint}
                          disabled={isCount || r.connectorRule === "none"}
                          onChange={(e) =>
                            patch(i, "connectorsPerJoint", e.target.value)
                          }
                          aria-label={`${r.type} connectors per joint`}
                        />
                      </td>
                      <td className="py-2 pr-3">
                        <input
                          type="number"
                          min="0"
                          step="1"
                          className="input w-20"
                          value={r.fittingUpliftPercent}
                          onChange={(e) =>
                            patch(i, "fittingUpliftPercent", e.target.value)
                          }
                          aria-label={`${r.type} fitting uplift percent`}
                        />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {msg && <div className="mt-3 text-sm">{msg}</div>}

        <button
          className="btn mt-4"
          onClick={save}
          disabled={saving || loading || !accessToken}
        >
          {saving ? "Saving…" : "Save constants"}
        </button>
      </div>
    </div>
  );
}
