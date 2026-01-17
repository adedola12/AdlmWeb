import React from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../store.jsx";
import { apiAuthed } from "../http.js";

function Table({ rows }) {
  return (
    <div className="overflow-x-auto">
      <table className="min-w-full text-sm">
        <thead>
          <tr className="text-left border-b">
            <th className="py-2 pr-4">S/N</th>
            <th className="py-2 pr-4">Description</th>
            <th className="py-2 pr-4">Unit</th>
            <th className="py-2 pr-4">Price</th>
            <th className="py-2 pr-4">Category</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={`${r.sn}-${r.description}`} className="border-b">
              <td className="py-2 pr-4">{r.sn}</td>
              <td className="py-2 pr-4">{r.description}</td>
              <td className="py-2 pr-4">{r.unit}</td>
              <td className="py-2 pr-4">{Number(r.price).toLocaleString()}</td>
              <td className="py-2 pr-4">{r.category || ""}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function RateGenLibrary() {
  const { accessToken } = useAuth();
  const [tab, setTab] = React.useState("materials");
  const [master, setMaster] = React.useState(null); // { materials, labour, zone }
  const [mine, setMine] = React.useState(null); // { materials, labour, version }
  const [err, setErr] = React.useState("");
  const [zone, setZone] = React.useState("");

  const navigate = useNavigate();

  // NEW: search text
  const [search, setSearch] = React.useState("");

  async function load() {
    if (!accessToken) {
      setErr("You’re signed out. Please sign in again.");
      return;
    }
    setErr("");
    try {
      const [m, lib] = await Promise.all([
        apiAuthed("/rategen/master", { token: accessToken }),
        apiAuthed("/rategen/library", { token: accessToken }),
      ]);
      setMaster(m);
      setZone(m.zone || "");
      setMine(lib);
    } catch (e) {
      setErr(e.message || "Failed to load");
    }
  }

  React.useEffect(() => {
    load(); // eslint-disable-next-line
  }, [accessToken]);

  const tabs = [
    { key: "materials", label: "Master · Materials" },
    { key: "labour", label: "Master · Labour" },
    { key: "my-materials", label: "My Materials" },
    { key: "my-labour", label: "My Labour" },
  ];

  function rowsForTab() {
    if (!master) return [];
    switch (tab) {
      case "materials":
        return master.materials || [];
      case "labour":
        return master.labour || [];
      case "my-materials":
        return (mine?.materials || []).sort((a, b) => a.sn - b.sn);
      case "my-labour":
        return (mine?.labour || []).sort((a, b) => a.sn - b.sn);
      default:
        return [];
    }
  }

  // Filter by search text (applies to all tabs)
  const allRows = rowsForTab();
  const trimmed = search.trim().toLowerCase();
  const visibleRows = trimmed
    ? allRows.filter((r) => {
        const fields = [
          r.description,
          r.unit,
          r.category,
          r.sn != null ? String(r.sn) : "",
        ];
        return fields.some(
          (val) => val && String(val).toLowerCase().includes(trimmed)
        );
      })
    : allRows;

  return (
    <div className="space-y-4">
      <div className="card">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h1 className="font-semibold">RateGen Library</h1>
            {zone && (
              <div className="text-xs text-slate-600 mt-1">
                Showing master prices for{" "}
                <span className="font-medium">{zone.replace(/_/g, " ")}</span>
              </div>
            )}
          </div>
          <button className="btn btn-sm" onClick={load}>
            Refresh
          </button>
          <button
            className="btn btn-sm"
            onClick={() => navigate("/rategen/updates")}
          >
            Updates
          </button>
        </div>

        <div className="mt-3 border-b">
          <nav className="flex flex-wrap gap-4">
            {tabs.map((t) => (
              <button
                key={t.key}
                onClick={() => setTab(t.key)}
                className={`py-2 -mb-px border-b-2 ${
                  tab === t.key
                    ? "border-blue-600 text-blue-700"
                    : "border-transparent text-slate-600"
                }`}
              >
                {t.label}
              </button>
            ))}
          </nav>
        </div>

        {/* Search bar */}
        <div className="mt-3 flex flex-col md:flex-row md:items-center md:justify-between gap-3">
          <p className="text-xs text-slate-500">
            Showing {visibleRows.length} of {allRows.length} items
          </p>
          <div className="w-full md:w-64">
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search description, unit, category…"
              className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
          </div>
        </div>

        {err && <div className="text-red-600 text-sm mt-2">{err}</div>}
      </div>

      <div className="card">
        {!master ? (
          <div className="text-sm text-slate-600">Loading…</div>
        ) : (
          <Table rows={visibleRows} />
        )}
      </div>
    </div>
  );
}
