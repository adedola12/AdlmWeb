import React from "react";
import { useAuth } from "../store.jsx";
import { apiAuthed } from "../http.js";

type Zone = { key: string; label: string };

type GridRow = {
  sn?: number;
  name: string;
  unit: string;
  category: string;
  prices: Record<string, number>;
  source?: string; // optional (from server)
  _dirty?: boolean; // local only
};

type GridResponse = {
  rows: GridRow[];
  zones: Zone[];
  kind: "material" | "labour";
};

function norm(s: any) {
  return String(s ?? "").trim();
}

function money(n: any) {
  const x = Number(n || 0);
  return Number.isFinite(x) ? x : 0;
}

export default function AdminRateGenMaster() {
  const { accessToken } = useAuth();

  const [kind, setKind] = React.useState<"material" | "labour">("material");
  const [zones, setZones] = React.useState<Zone[]>([]);
  const [rows, setRows] = React.useState<GridRow[]>([]);
  const [loading, setLoading] = React.useState(false);
  const [saving, setSaving] = React.useState(false);
  const [err, setErr] = React.useState("");
  const [notice, setNotice] = React.useState("");

  const [search, setSearch] = React.useState("");
  const [activeZone, setActiveZone] = React.useState<string>("");
  const [showAllZones, setShowAllZones] = React.useState(false);

  // NEW: show all vs web-added items
  const [sourceFilter, setSourceFilter] = React.useState<"" | "web">("");

  // Add modal
  const [openAdd, setOpenAdd] = React.useState(false);
  const [newName, setNewName] = React.useState("");
  const [newUnit, setNewUnit] = React.useState("");
  const [newCategory, setNewCategory] = React.useState("");

  // NEW: single price mode vs per-zone
  const [singlePriceMode, setSinglePriceMode] = React.useState(true);
  const [newPrice, setNewPrice] = React.useState<number>(0);
  const [newPricesByZone, setNewPricesByZone] = React.useState<
    Record<string, number>
  >({});

  const dirtyCount = React.useMemo(
    () => rows.filter((r) => r._dirty).length,
    [rows]
  );

  async function loadZonesOnly() {
    if (!accessToken) return;
    const z = await apiAuthed("/admin/rategen/zones", { token: accessToken });
    const arr = Array.isArray(z) ? z : z?.zones || [];
    setZones(arr);
    if (!activeZone && arr?.[0]?.key) setActiveZone(arr[0].key);

    // initialize per-zone add inputs
    const init: Record<string, number> = {};
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
      if (sourceFilter) qs.set("source", sourceFilter);

      const res: GridResponse = await apiAuthed(
        `/admin/rategen/grid?${qs.toString()}`,
        { token: accessToken }
      );

      setZones(res.zones || []);
      if (!activeZone && res.zones?.[0]?.key) setActiveZone(res.zones[0].key);

      const zoneKeys = (res.zones || []).map((z) => z.key);

      const fixed = (res.rows || []).map((r) => {
        const prices: Record<string, number> = { ...(r.prices || {}) };
        for (const z of zoneKeys) if (!(z in prices)) prices[z] = 0;
        return {
          ...r,
          name: norm(r.name),
          unit: norm(r.unit),
          category: norm(r.category),
          prices,
          _dirty: false,
        };
      });

      setRows(fixed);
    } catch (e: any) {
      setErr(e?.message || "Failed to load master grid");
    } finally {
      setLoading(false);
    }
  }

  React.useEffect(() => {
    loadZonesOnly();
    // eslint-disable-next-line
  }, [accessToken]);

  React.useEffect(() => {
    loadGrid();
    // eslint-disable-next-line
  }, [kind, sourceFilter]);

  // light debounce on search
  React.useEffect(() => {
    const t = setTimeout(() => loadGrid(), 350);
    return () => clearTimeout(t);
    // eslint-disable-next-line
  }, [search]);

  function updateField(
    idx: number,
    key: "name" | "unit" | "category",
    value: string
  ) {
    setRows((prev) => {
      const next = [...prev];
      const row = { ...next[idx] };
      row[key] = value;
      row._dirty = true;
      next[idx] = row;
      return next;
    });
  }

  function updatePrice(idx: number, zoneKey: string, value: number) {
    setRows((prev) => {
      const next = [...prev];
      const row = { ...next[idx] };
      row.prices = { ...(row.prices || {}), [zoneKey]: money(value) };
      row._dirty = true;
      next[idx] = row;
      return next;
    });
  }

  function copyZoneToAll(idx: number, zoneKey: string) {
    setRows((prev) => {
      const next = [...prev];
      const row = { ...next[idx] };
      const v = money(row.prices?.[zoneKey] ?? 0);
      const p = { ...(row.prices || {}) };
      for (const z of zones) p[z.key] = v;
      row.prices = p;
      row._dirty = true;
      next[idx] = row;
      return next;
    });
  }

  function openAddModal() {
    setNewName("");
    setNewUnit("");
    setNewCategory("");

    setSinglePriceMode(true);
    setNewPrice(0);

    const init: Record<string, number> = {};
    for (const z of zones) init[z.key] = 0;
    setNewPricesByZone(init);

    setOpenAdd(true);
  }

  // keep per-zone map in sync when in single mode
  React.useEffect(() => {
    if (!singlePriceMode) return;
    setNewPricesByZone((prev) => {
      const next = { ...prev };
      for (const z of zones) next[z.key] = money(newPrice);
      return next;
    });
    // eslint-disable-next-line
  }, [newPrice, singlePriceMode, zones.length]);

  function addRowLocal() {
    const name = norm(newName);
    if (!name) return;

    const exists = rows.some(
      (r) => norm(r.name).toLowerCase() === name.toLowerCase()
    );
    if (exists) {
      alert("That name already exists. Use search to edit it.");
      return;
    }

    const prices: Record<string, number> = {};
    for (const z of zones) prices[z.key] = money(newPricesByZone?.[z.key] ?? 0);

    // if singlePriceMode and activeZone exists, ensure active zone uses newPrice
    if (singlePriceMode && activeZone) prices[activeZone] = money(newPrice);

    const row: GridRow = {
      name,
      unit: norm(newUnit),
      category: norm(newCategory),
      prices,
      _dirty: true,
      source: "web",
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
        name: norm(r.name),
        unit: norm(r.unit),
        category: norm(r.category),
        prices: r.prices || {},
      }));

      await apiAuthed("/admin/rategen/grid", {
        token: accessToken,
        method: "PUT",
        body: { kind, rows: payloadRows },
      });

      setRows((prev) => prev.map((r) => ({ ...r, _dirty: false })));
      setNotice("✅ Saved to Mongo successfully.");
    } catch (e: any) {
      setErr(e?.message || "Save failed");
    } finally {
      setSaving(false);
    }
  }

  async function deleteRow(name: string) {
    if (!accessToken) return;

    const ok = window.confirm(
      `Delete "${name}" from master library across ALL zones?\n\nThis cannot be undone.`
    );
    if (!ok) return;

    setErr("");
    setNotice("");
    try {
      const res = await apiAuthed("/admin/rategen/grid", {
        token: accessToken,
        method: "DELETE",
        body: { kind, name }, // deletes across zones
      });

      setRows((prev) =>
        prev.filter(
          (r) => norm(r.name).toLowerCase() !== norm(name).toLowerCase()
        )
      );
      setNotice(`🗑️ Deleted (${res?.deleted ?? 0} docs).`);
    } catch (e: any) {
      setErr(e?.message || "Delete failed");
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
                onClick={() => setKind("material")}
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
                onClick={() => setKind("labour")}
              >
                Labour
              </button>
            </div>

            {/* NEW: All vs Web-added */}
            <div className="inline-flex rounded-full border border-slate-200 bg-white p-1">
              <button
                className={[
                  "px-3 py-1.5 text-sm rounded-full",
                  sourceFilter === ""
                    ? "bg-slate-900 text-white"
                    : "text-slate-700 hover:bg-slate-50",
                ].join(" ")}
                onClick={() => setSourceFilter("")}
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
                title="Show items created from this web admin screen"
              >
                Web-added
              </button>
            </div>

            <button
              className="btn btn-sm"
              onClick={loadGrid}
              disabled={loading}
            >
              {loading ? "Loading…" : "Refresh"}
            </button>

            <button className="btn btn-sm" onClick={openAddModal}>
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
                    {r.source === "web" && (
                      <div className="mt-1 text-[11px] text-slate-500">
                        <span className="inline-flex rounded-full bg-slate-100 px-2 py-0.5">
                          web-added
                        </span>
                      </div>
                    )}
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
                {r.source === "web" && (
                  <div className="mt-2">
                    <span className="inline-flex rounded-full bg-slate-100 px-2 py-0.5 text-[11px] text-slate-600">
                      web-added
                    </span>
                  </div>
                )}
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
                >
                  Copy All
                </button>
              </div>

              <div className="flex items-center justify-between mt-2">
                <button
                  className="text-xs text-red-600"
                  onClick={() => deleteRow(r.name)}
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
                              ...p,
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
                >
                  Cancel
                </button>
                <button
                  className="btn btn-sm"
                  onClick={addRowLocal}
                  disabled={!norm(newName)}
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
