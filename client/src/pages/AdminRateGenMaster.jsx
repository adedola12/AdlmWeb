// src/pages/AdminRateGenMaster.jsx
import React from "react";
import { useAuth } from "../store.jsx";
import { apiAuthed } from "../http.js";
import { useNavigate, useSearchParams } from "react-router-dom";

function norm(v) {
  return String(v ?? "").trim();
}

function money(v) {
  const x = Number(v ?? 0);
  return Number.isFinite(x) ? x : 0;
}

export default function AdminRateGenMaster() {
  const { accessToken } = useAuth();
  const navigate = useNavigate();
  const [sp] = useSearchParams();

  // ✅ read query params INSIDE component
  const qpKindRaw = (sp.get("kind") || "material").toLowerCase();
  const qpKind = qpKindRaw === "labour" ? "labour" : "material";
  const qpAdd = sp.get("add") === "1";

  // ✅ initialize kind from URL once
  const [kind, setKind] = React.useState(qpKind);

  const [zones, setZones] = React.useState([]);
  const [rows, setRows] = React.useState([]);
  const [loading, setLoading] = React.useState(false);
  const [saving, setSaving] = React.useState(false);
  const [err, setErr] = React.useState("");
  const [notice, setNotice] = React.useState("");

  const [search, setSearch] = React.useState("");
  const [activeZone, setActiveZone] = React.useState("");
  const [showAllZones, setShowAllZones] = React.useState(false);

  // optional: UI-only filter (won't work unless server returns/stores "source")
  const [sourceFilter, setSourceFilter] = React.useState(""); // "" | "web"

  // Add modal
  const [openAdd, setOpenAdd] = React.useState(false);
  const [newName, setNewName] = React.useState("");
  const [newUnit, setNewUnit] = React.useState("");
  const [newCategory, setNewCategory] = React.useState("");

  const [singlePriceMode, setSinglePriceMode] = React.useState(true);
  const [newPrice, setNewPrice] = React.useState(0);
  const [newPricesByZone, setNewPricesByZone] = React.useState({});

  const dirtyCount = React.useMemo(
    () => rows.filter((r) => r && r._dirty).length,
    [rows]
  );

  function setKindAndUrl(k) {
    const next = k === "labour" ? "labour" : "material";
    setKind(next);
    // keep URL in sync (also clears any ?add=1)
    navigate(`/admin/rategen-master?kind=${next}`, { replace: true });
  }

  async function loadZonesOnly() {
    if (!accessToken) return;
    const z = await apiAuthed("/admin/rategen/zones", { token: accessToken });
    const arr = Array.isArray(z) ? z : z?.zones || [];

    setZones(arr);

    // ensure activeZone is valid
    setActiveZone((prev) => {
      if (prev && arr.some((x) => x.key === prev)) return prev;
      return arr?.[0]?.key || "";
    });

    // init per-zone add map
    const init = {};
    for (const zz of arr) init[zz.key] = 0;
    setNewPricesByZone(init);
  }

  async function loadGrid() {
    if (!accessToken) {
      setErr("You’re signed out. Please sign in again.");
      return;
    }

    setErr("");
    setNotice("");
    setLoading(true);

    try {
      const qs = new URLSearchParams();
      qs.set("kind", kind);
      if (search.trim()) qs.set("search", search.trim());
      if (sourceFilter) qs.set("source", sourceFilter); // harmless if server ignores

      const res = await apiAuthed(`/admin/rategen/grid?${qs.toString()}`, {
        token: accessToken,
      });

      const z = Array.isArray(res?.zones) ? res.zones : [];
      const r = Array.isArray(res?.rows) ? res.rows : [];

      setZones(z);

      setActiveZone((prev) => {
        if (prev && z.some((x) => x.key === prev)) return prev;
        return z?.[0]?.key || "";
      });

      const zoneKeys = z.map((x) => x.key);

      const fixed = r.map((row) => {
        const prices = { ...(row?.prices || {}) };
        for (const zk of zoneKeys) {
          if (!(zk in prices)) prices[zk] = 0;
        }
        return {
          ...row,
          name: norm(row?.name),
          unit: norm(row?.unit),
          category: norm(row?.category),
          prices,
          _dirty: false,
        };
      });

      setRows(fixed);
    } catch (e) {
      setErr(e?.message || "Failed to load master grid");
    } finally {
      setLoading(false);
    }
  }

  // ✅ load zones once
  React.useEffect(() => {
    loadZonesOnly().catch(() => {});
    // eslint-disable-next-line
  }, [accessToken]);

  // ✅ if URL kind changes, sync state
  React.useEffect(() => {
    if (qpKind !== kind) setKind(qpKind);
    // eslint-disable-next-line
  }, [qpKind]);

  // ✅ load grid when kind/filter changes
  React.useEffect(() => {
    loadGrid().catch(() => {});
    // eslint-disable-next-line
  }, [kind, sourceFilter]);

  // ✅ debounce search
  React.useEffect(() => {
    const t = setTimeout(() => loadGrid().catch(() => {}), 350);
    return () => clearTimeout(t);
    // eslint-disable-next-line
  }, [search]);

  function openAddModal() {
    setNewName("");
    setNewUnit("");
    setNewCategory("");

    setSinglePriceMode(true);
    setNewPrice(0);

    const init = {};
    for (const z of zones) init[z.key] = 0;
    setNewPricesByZone(init);

    setOpenAdd(true);
  }

  // ✅ auto-open modal if ?add=1 (after zones available)
  React.useEffect(() => {
    if (!qpAdd) return;
    if (!zones.length) return;

    // ensure kind matches URL
    if (kind !== qpKind) setKind(qpKind);

    openAddModal();

    // clear add=1 so refresh doesn't reopen
    navigate(`/admin/rategen-master?kind=${qpKind}`, { replace: true });
    // eslint-disable-next-line
  }, [qpAdd, zones.length]);

  // keep per-zone prices synced in single mode
  React.useEffect(() => {
    if (!singlePriceMode) return;
    setNewPricesByZone((prev) => {
      const next = { ...(prev || {}) };
      for (const z of zones) next[z.key] = money(newPrice);
      return next;
    });
    // eslint-disable-next-line
  }, [newPrice, singlePriceMode, zones.length]);

  function updateField(idx, key, value) {
    setRows((prev) => {
      const next = [...prev];
      const row = { ...(next[idx] || {}) };
      row[key] = value;
      row._dirty = true;
      next[idx] = row;
      return next;
    });
  }

  function updatePrice(idx, zoneKey, value) {
    setRows((prev) => {
      const next = [...prev];
      const row = { ...(next[idx] || {}) };
      row.prices = { ...(row.prices || {}), [zoneKey]: money(value) };
      row._dirty = true;
      next[idx] = row;
      return next;
    });
  }

  function copyZoneToAll(idx, zoneKey) {
    setRows((prev) => {
      const next = [...prev];
      const row = { ...(next[idx] || {}) };
      const v = money(row?.prices?.[zoneKey] ?? 0);
      const p = { ...(row.prices || {}) };
      for (const z of zones) p[z.key] = v;
      row.prices = p;
      row._dirty = true;
      next[idx] = row;
      return next;
    });
  }

  function addRowLocal() {
    const name = norm(newName);
    if (!name) return;

    const exists = rows.some(
      (r) => norm(r?.name).toLowerCase() === name.toLowerCase()
    );
    if (exists) {
      alert("That name already exists. Use search to edit it.");
      return;
    }

    const prices = {};
    for (const z of zones) prices[z.key] = money(newPricesByZone?.[z.key] ?? 0);

    const row = {
      name,
      unit: norm(newUnit),
      category: norm(newCategory),
      prices,
      _dirty: true,
      source: "web", // UI-only unless server stores it
    };

    setRows((prev) => [row, ...prev]);
    setOpenAdd(false);
  }

  async function saveAll() {
    if (!accessToken) return;

    setErr("");
    setNotice("");
    setSaving(true);

    try {
      const payloadRows = rows.map((r) => ({
        name: norm(r?.name),
        unit: norm(r?.unit),
        category: norm(r?.category),
        prices: r?.prices || {},
        // source: r?.source, // only include if your backend stores it
      }));

      await apiAuthed("/admin/rategen/grid", {
        token: accessToken,
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind, rows: payloadRows }),
      });

      setRows((prev) => prev.map((r) => ({ ...r, _dirty: false })));
      setNotice("✅ Saved to Mongo successfully.");
    } catch (e) {
      setErr(e?.message || "Save failed");
    } finally {
      setSaving(false);
    }
  }

  async function deleteRow(name) {
    if (!accessToken) return;

    const ok = window.confirm(
      `Delete "${name}" from master library across ALL zones?\n\nThis cannot be undone.`
    );
    if (!ok) return;

    setErr("");
    setNotice("");

    try {
      // NOTE: this requires you to implement DELETE on /admin/rategen/grid in backend
      const res = await apiAuthed("/admin/rategen/grid", {
        token: accessToken,
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind, name }),
      });

      setRows((prev) =>
        prev.filter(
          (r) => norm(r?.name).toLowerCase() !== norm(name).toLowerCase()
        )
      );
      setNotice(`🗑️ Deleted (${res?.deleted ?? 0} docs).`);
    } catch (e) {
      setErr(e?.message || "Delete failed (is DELETE route implemented?)");
    }
  }

  const zoneKeys = zones.map((z) => z.key);
  const visibleZoneKeys = showAllZones
    ? zoneKeys
    : activeZone
    ? [activeZone]
    : zoneKeys.slice(0, 1);

  return (
    <div className="space-y-4">
      <div className="card">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
          <div>
            <h1 className="font-semibold">RateGen Master Library (Admin)</h1>
            <p className="text-xs text-slate-600 mt-1">
              Editing here updates master Materials/Labour only — it does not
              touch user libraries.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <div className="inline-flex rounded-full border border-slate-200 bg-white p-1">
              <button
                className={[
                  "px-3 py-1.5 text-sm rounded-full",
                  kind === "material"
                    ? "bg-blue-600 text-white"
                    : "text-slate-700 hover:bg-slate-50",
                ].join(" ")}
                onClick={() => setKindAndUrl("material")}
                type="button"
              >
                Materials
              </button>
              <button
                className={[
                  "px-3 py-1.5 text-sm rounded-full",
                  kind === "labour"
                    ? "bg-blue-600 text-white"
                    : "text-slate-700 hover:bg-slate-50",
                ].join(" ")}
                onClick={() => setKindAndUrl("labour")}
                type="button"
              >
                Labour
              </button>
            </div>

            <div className="inline-flex rounded-full border border-slate-200 bg-white p-1">
              <button
                className={[
                  "px-3 py-1.5 text-sm rounded-full",
                  sourceFilter === ""
                    ? "bg-slate-900 text-white"
                    : "text-slate-700 hover:bg-slate-50",
                ].join(" ")}
                onClick={() => setSourceFilter("")}
                type="button"
              >
                All
              </button>
              <button
                className={[
                  "px-3 py-1.5 text-sm rounded-full",
                  sourceFilter === "web"
                    ? "bg-slate-900 text-white"
                    : "text-slate-700 hover:bg-slate-50",
                ].join(" ")}
                onClick={() => setSourceFilter("web")}
                title="Show items created from this web admin screen (requires backend support)"
                type="button"
              >
                Web-added
              </button>
            </div>

            <button
              className="btn btn-sm"
              onClick={loadGrid}
              disabled={loading}
              type="button"
            >
              {loading ? "Loading…" : "Refresh"}
            </button>

            <button className="btn btn-sm" onClick={openAddModal} type="button">
              + Add {kind === "material" ? "Material" : "Labour"}
            </button>

            <button
              className={[
                "relative inline-flex items-center gap-2 rounded-full px-3 py-2 text-sm font-medium",
                "border shadow-sm transition active:scale-[0.99]",
                dirtyCount > 0
                  ? "border-emerald-200 bg-emerald-50 text-emerald-800 hover:bg-emerald-100"
                  : "border-slate-200 bg-white text-slate-500",
              ].join(" ")}
              onClick={saveAll}
              disabled={saving || dirtyCount === 0}
              title={
                dirtyCount ? `${dirtyCount} pending change(s)` : "No changes"
              }
              type="button"
            >
              <span>Save</span>
              <span
                className={[
                  "min-w-[28px] h-6 px-2 inline-flex items-center justify-center rounded-full text-xs font-semibold",
                  dirtyCount > 0
                    ? "bg-emerald-700 text-white"
                    : "bg-slate-100 text-slate-600",
                ].join(" ")}
              >
                {saving ? "…" : dirtyCount}
              </span>
            </button>
          </div>
        </div>

        <div className="mt-4 flex flex-col md:flex-row md:items-center md:justify-between gap-3">
          <div className="w-full md:w-80">
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={`Search ${kind} name…`}
              className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <select
              className="rounded-md border border-slate-300 px-3 py-2 text-sm"
              value={activeZone}
              onChange={(e) => setActiveZone(e.target.value)}
            >
              {zones.map((z) => (
                <option key={z.key} value={z.key}>
                  {z.label}
                </option>
              ))}
            </select>

            <label className="inline-flex items-center gap-2 text-sm text-slate-700 select-none">
              <input
                type="checkbox"
                checked={showAllZones}
                onChange={(e) => setShowAllZones(e.target.checked)}
              />
              Show all zones (wide)
            </label>
          </div>
        </div>

        {err && <div className="text-red-600 text-sm mt-3">{err}</div>}
        {notice && (
          <div className="text-emerald-700 text-sm mt-3">{notice}</div>
        )}
      </div>

      {/* Desktop/table view */}
      <div className="card hidden md:block">
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="text-left border-b">
                <th className="py-2 pr-3">#</th>
                <th className="py-2 pr-3">Name</th>
                <th className="py-2 pr-3">Unit</th>
                <th className="py-2 pr-3">Category</th>
                {visibleZoneKeys.map((z) => (
                  <th key={z} className="py-2 pr-3 whitespace-nowrap">
                    {zones.find((x) => x.key === z)?.label || z}
                  </th>
                ))}
                <th className="py-2 pr-3">Actions</th>
              </tr>
            </thead>

            <tbody>
              {rows.map((r, idx) => (
                <tr key={`${r.name}-${idx}`} className="border-b align-top">
                  <td className="py-2 pr-3 text-slate-500">{idx + 1}</td>

                  <td className="py-2 pr-3">
                    <input
                      value={r.name}
                      onChange={(e) => updateField(idx, "name", e.target.value)}
                      className={[
                        "w-64 rounded-md border px-2 py-1 text-sm",
                        r._dirty ? "border-emerald-300" : "border-slate-300",
                      ].join(" ")}
                    />
                  </td>

                  <td className="py-2 pr-3">
                    <input
                      value={r.unit}
                      onChange={(e) => updateField(idx, "unit", e.target.value)}
                      className={[
                        "w-28 rounded-md border px-2 py-1 text-sm",
                        r._dirty ? "border-emerald-300" : "border-slate-300",
                      ].join(" ")}
                    />
                  </td>

                  <td className="py-2 pr-3">
                    <input
                      value={r.category}
                      onChange={(e) =>
                        updateField(idx, "category", e.target.value)
                      }
                      className={[
                        "w-64 rounded-md border px-2 py-1 text-sm",
                        r._dirty ? "border-emerald-300" : "border-slate-300",
                      ].join(" ")}
                    />
                  </td>

                  {visibleZoneKeys.map((z) => (
                    <td key={z} className="py-2 pr-3">
                      <div className="flex items-center gap-2">
                        <input
                          type="number"
                          inputMode="decimal"
                          value={money(r.prices?.[z] ?? 0)}
                          onChange={(e) =>
                            updatePrice(idx, z, Number(e.target.value))
                          }
                          className={[
                            "w-32 rounded-md border px-2 py-1 text-sm",
                            r._dirty
                              ? "border-emerald-300"
                              : "border-slate-300",
                          ].join(" ")}
                        />
                        <button
                          className="text-xs text-blue-700 hover:underline"
                          onClick={() => copyZoneToAll(idx, z)}
                          title="Copy this zone price to all zones"
                          type="button"
                        >
                          Copy→All
                        </button>
                      </div>
                    </td>
                  ))}

                  <td className="py-2 pr-3">
                    <div className="flex items-center gap-2">
                      <button
                        className="text-xs text-red-600 hover:text-red-700"
                        onClick={() => deleteRow(r.name)}
                        title="Delete from DB (all zones)"
                        type="button"
                      >
                        Delete
                      </button>

                      {r._dirty && (
                        <span className="inline-flex items-center rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-semibold text-emerald-800">
                          changed
                        </span>
                      )}
                    </div>
                  </td>
                </tr>
              ))}

              {!rows.length && (
                <tr>
                  <td
                    className="py-4 text-slate-600"
                    colSpan={6 + visibleZoneKeys.length}
                  >
                    {loading ? "Loading…" : "No rows found."}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <p className="text-xs text-slate-500 mt-3">
          Tip: On small screens, use the zone selector to edit one zone at a
          time.
        </p>
      </div>

      {/* Mobile/card view */}
      <div className="md:hidden space-y-3">
        {rows.map((r, idx) => (
          <div key={`${r.name}-${idx}`} className="card">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="text-sm font-semibold truncate">{r.name}</div>
                <div className="text-xs text-slate-600 mt-1">
                  Unit: {r.unit || "—"} • Category: {r.category || "—"}
                </div>
              </div>
              {r._dirty && (
                <span className="shrink-0 rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-semibold text-emerald-800">
                  changed
                </span>
              )}
            </div>

            <div className="mt-3 grid grid-cols-1 gap-2">
              <label className="text-xs text-slate-600">Name</label>
              <input
                value={r.name}
                onChange={(e) => updateField(idx, "name", e.target.value)}
                className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
              />

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-xs text-slate-600">Unit</label>
                  <input
                    value={r.unit}
                    onChange={(e) => updateField(idx, "unit", e.target.value)}
                    className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                  />
                </div>
                <div>
                  <label className="text-xs text-slate-600">Category</label>
                  <input
                    value={r.category}
                    onChange={(e) =>
                      updateField(idx, "category", e.target.value)
                    }
                    className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                  />
                </div>
              </div>

              <label className="text-xs text-slate-600">
                Price (
                {zones.find((z) => z.key === activeZone)?.label || activeZone})
              </label>

              <div className="flex items-center gap-2">
                <input
                  type="number"
                  inputMode="decimal"
                  value={money(r.prices?.[activeZone] ?? 0)}
                  onChange={(e) =>
                    updatePrice(idx, activeZone, Number(e.target.value))
                  }
                  className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                />
                <button
                  className="shrink-0 rounded-full border border-blue-200 bg-blue-50 px-3 py-2 text-xs font-semibold text-blue-700"
                  onClick={() => copyZoneToAll(idx, activeZone)}
                  type="button"
                >
                  Copy All
                </button>
              </div>

              <div className="flex items-center justify-between mt-2">
                <button
                  className="text-xs text-red-600"
                  onClick={() => deleteRow(r.name)}
                  type="button"
                >
                  Delete
                </button>
                <span className="text-xs text-slate-500">
                  Save to apply edits
                </span>
              </div>
            </div>
          </div>
        ))}

        {!rows.length && (
          <div className="card text-sm text-slate-600">
            {loading ? "Loading…" : "No rows found."}
          </div>
        )}
      </div>

      {/* Add modal */}
      {openAdd && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-end md:items-center justify-center p-3">
          <div className="w-full max-w-lg rounded-2xl bg-white shadow-xl p-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="text-base font-semibold">
                  Add {kind === "material" ? "Material" : "Labour"} (Master)
                </div>
                <div className="text-xs text-slate-600 mt-1">
                  Default: enter one price and it applies to all zones (you can
                  edit per zone later).
                </div>
              </div>
              <button
                className="text-slate-600 hover:text-slate-900"
                onClick={() => setOpenAdd(false)}
                type="button"
              >
                ✕
              </button>
            </div>

            <div className="mt-4 space-y-3">
              <div>
                <label className="text-xs text-slate-600">Name</label>
                <input
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                  placeholder={
                    kind === "material"
                      ? "e.g. Cement (Dangote)"
                      : "e.g. Skilled labour"
                  }
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-xs text-slate-600">Unit</label>
                  <input
                    value={newUnit}
                    onChange={(e) => setNewUnit(e.target.value)}
                    className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                    placeholder="Bag / m3 / Nr"
                  />
                </div>
                <div>
                  <label className="text-xs text-slate-600">Category</label>
                  <input
                    value={newCategory}
                    onChange={(e) => setNewCategory(e.target.value)}
                    className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                    placeholder="Cement Based Products"
                  />
                </div>
              </div>

              <div className="flex items-center justify-between gap-2">
                <div className="text-sm font-medium text-slate-700">
                  Pricing mode
                </div>
                <div className="inline-flex rounded-full border border-slate-200 bg-white p-1">
                  <button
                    className={[
                      "px-3 py-1.5 text-sm rounded-full",
                      singlePriceMode
                        ? "bg-blue-600 text-white"
                        : "text-slate-700 hover:bg-slate-50",
                    ].join(" ")}
                    onClick={() => setSinglePriceMode(true)}
                    type="button"
                  >
                    Single price
                  </button>
                  <button
                    className={[
                      "px-3 py-1.5 text-sm rounded-full",
                      !singlePriceMode
                        ? "bg-blue-600 text-white"
                        : "text-slate-700 hover:bg-slate-50",
                    ].join(" ")}
                    onClick={() => setSinglePriceMode(false)}
                    type="button"
                  >
                    Per-zone
                  </button>
                </div>
              </div>

              {singlePriceMode ? (
                <div>
                  <label className="text-xs text-slate-600">
                    Price (applies to all zones)
                  </label>
                  <input
                    type="number"
                    inputMode="decimal"
                    value={money(newPrice)}
                    onChange={(e) => setNewPrice(Number(e.target.value))}
                    className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                  />
                </div>
              ) : (
                <div className="space-y-2">
                  <div className="text-xs text-slate-600">
                    Enter prices for zones (missing zones will be treated as 0
                    until you fill them).
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    {zones.map((z) => (
                      <div key={z.key}>
                        <label className="text-[11px] text-slate-600">
                          {z.label}
                        </label>
                        <input
                          type="number"
                          inputMode="decimal"
                          value={money(newPricesByZone?.[z.key] ?? 0)}
                          onChange={(e) =>
                            setNewPricesByZone((p) => ({
                              ...(p || {}),
                              [z.key]: Number(e.target.value),
                            }))
                          }
                          className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                        />
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  className="btn btn-sm"
                  onClick={() => setOpenAdd(false)}
                  type="button"
                >
                  Cancel
                </button>
                <button
                  className="btn btn-sm"
                  onClick={addRowLocal}
                  disabled={!norm(newName)}
                  type="button"
                >
                  Add to list
                </button>
              </div>

              <p className="text-xs text-slate-500">
                After adding, click <b>Save</b> to push to Mongo.
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
