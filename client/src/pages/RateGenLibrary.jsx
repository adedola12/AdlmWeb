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

/** localStorage key matches your updates page */
const LAST_SEEN_KEY = "rategen_updates_last_seen_at";

function getLastSeenMs() {
  const raw = localStorage.getItem(LAST_SEEN_KEY);
  const ms = raw ? Number(raw) : 0;
  return Number.isFinite(ms) ? ms : 0;
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

  // ✅ Updates count
  const [updatesCount, setUpdatesCount] = React.useState(0);
  const [updatesLoading, setUpdatesLoading] = React.useState(false);

  async function loadUpdatesCount() {
    if (!accessToken) return;

    setUpdatesLoading(true);
    try {
      // pulls latest rates; we only need count of "new since last seen"
      const res = await apiAuthed(
        "/rategen-v2/library/rates/updates?limit=200",
        {
          token: accessToken,
        }
      );

      const items = Array.isArray(res?.items) ? res.items : [];
      const lastSeenMs = getLastSeenMs();

      // count new items since last seen (use updatedAt or createdAt)
      const n = items.filter((x) => {
        const ts = x?.updatedAt || x?.createdAt || null;
        const ms = ts ? new Date(ts).getTime() : 0;
        return ms > lastSeenMs;
      }).length;

      setUpdatesCount(n);
    } catch {
      // don't block the page if updates endpoint fails
      setUpdatesCount(0);
    } finally {
      setUpdatesLoading(false);
    }
  }

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

  // ✅ load updates count on mount + when token changes
  React.useEffect(() => {
    loadUpdatesCount(); // eslint-disable-next-line
  }, [accessToken]);

  // optional: refresh count every 45s (lightweight)
  React.useEffect(() => {
    if (!accessToken) return;
    const t = setInterval(() => loadUpdatesCount(), 45000);
    return () => clearInterval(t);
    // eslint-disable-next-line
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

  const hasNew = updatesCount > 0;

  return (
    <div className="space-y-4">
      <div className="card">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
          <div>
            <h1 className="font-semibold">RateGen Library</h1>
            {zone && (
              <div className="text-xs text-slate-600 mt-1">
                Showing master prices for{" "}
                <span className="font-medium">{zone.replace(/_/g, " ")}</span>
              </div>
            )}
          </div>

          {/* ✅ Mobile-friendly action row */}
          <div className="flex flex-wrap items-center gap-2">
            <button
              className="btn btn-sm"
              onClick={() => {
                load();
                loadUpdatesCount();
              }}
            >
              Refresh
            </button>

            {/* ✅ Improved Updates button */}
            <button
              onClick={() => navigate("/rategen/updates")}
              className={[
                "relative inline-flex items-center gap-2",
                "rounded-full px-3 py-2 text-sm font-medium",
                "border shadow-sm transition",
                "active:scale-[0.99]",
                hasNew
                  ? "border-blue-200 bg-blue-50 text-blue-700 hover:bg-blue-100"
                  : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50",
                "focus:outline-none focus:ring-2 focus:ring-blue-500/40",
              ].join(" ")}
              aria-label="Open RateGen updates"
            >
              <span className="inline-flex items-center gap-2">
                {/* tiny dot when new */}
                <span
                  className={[
                    "h-2 w-2 rounded-full",
                    hasNew ? "bg-blue-600" : "bg-slate-300",
                  ].join(" ")}
                />
                <span>Updates</span>
              </span>

              {/* badge */}
              <span
                className={[
                  "min-w-[28px] h-6 px-2",
                  "inline-flex items-center justify-center",
                  "rounded-full text-xs font-semibold",
                  hasNew
                    ? "bg-blue-600 text-white"
                    : "bg-slate-100 text-slate-700",
                ].join(" ")}
                title={
                  hasNew ? `${updatesCount} new update(s)` : "No new updates"
                }
              >
                {updatesLoading ? "…" : updatesCount}
              </span>
            </button>
          </div>
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
