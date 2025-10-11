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
  const [lib, setLib] = React.useState(null);
  const [err, setErr] = React.useState("");

  async function load() {
    setErr("");
    try {
      const data = await apiAuthed("/rategen/master", { token: accessToken });
      // matches { materials, labour }
      setLib(data);
    } catch (e) {
      setErr(e.message || "Failed to load");
    }
  }

  React.useEffect(() => {
    load(); /* eslint-disable-next-line */
  }, [accessToken]);

  return (
    <div className="space-y-4">
      <div className="card">
        <div className="flex items-center justify-between">
          <h1 className="font-semibold">RateGen Library</h1>
          <button className="btn btn-sm" onClick={load}>
            Refresh
          </button>
        </div>
        <div className="mt-3 border-b">
          <nav className="flex gap-6">
            <button
              onClick={() => setTab("materials")}
              className={`py-2 -mb-px border-b-2 ${
                tab === "materials"
                  ? "border-blue-600 text-blue-700"
                  : "border-transparent text-slate-600"
              }`}
            >
              Materials
            </button>
            <button
              onClick={() => setTab("labour")}
              className={`py-2 -mb-px border-b-2 ${
                tab === "labour"
                  ? "border-blue-600 text-blue-700"
                  : "border-transparent text-slate-600"
              }`}
            >
              Labour
            </button>
          </nav>
        </div>
        {err && <div className="text-red-600 text-sm mt-2">{err}</div>}
      </div>

      <div className="card">
        {!lib ? (
          <div className="text-sm text-slate-600">Loading…</div>
        ) : tab === "materials" ? (
          <Table rows={lib.materials || []} />
        ) : (
          <Table rows={lib.labour || []} />
        )}
      </div>
    </div>
  );
}
