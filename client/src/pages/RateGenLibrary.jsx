import React from "react";
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
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={`${r.sn}-${r.description}`} className="border-b">
              <td className="py-2 pr-4">{r.sn}</td>
              <td className="py-2 pr-4">{r.description}</td>
              <td className="py-2 pr-4">{r.unit}</td>
              <td className="py-2 pr-4">{Number(r.price).toLocaleString()}</td>
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

  return (
    <div className="space-y-4">
      <div className="card">
        <div className="flex items-center justify-between">
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
        </div>

        <div className="mt-3 border-b">
          <nav className="flex gap-6">
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
        {err && <div className="text-red-600 text-sm mt-2">{err}</div>}
      </div>

      <div className="card">
        {!master ? (
          <div className="text-sm text-slate-600">Loading…</div>
        ) : (
          <Table rows={rowsForTab()} />
        )}
      </div>
    </div>
  );
}
