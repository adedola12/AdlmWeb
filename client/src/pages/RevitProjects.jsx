// src/pages/RevitProjects.jsx
import React from "react";
import { useAuth } from "../store.jsx";
import { apiAuthed } from "../http.js";

export default function RevitProjects() {
  const { accessToken } = useAuth();
  const [rows, setRows] = React.useState([]);
  const [sel, setSel] = React.useState(null);
  const [err, setErr] = React.useState("");

  async function load() {
    setErr("");
    try {
      const list = await apiAuthed("/projects", { token: accessToken });
      setRows(list);
      if (list.length && !sel) view(list[0]._id);
    } catch (e) {
      setErr(e.message);
    }
  }
  async function view(id) {
    setErr("");
    try {
      const p = await apiAuthed(`/projects/${id}`, { token: accessToken });
      setSel(p);
    } catch (e) {
      setErr(e.message);
    }
  }

  React.useEffect(() => {
    load();
  }, []);

  return (
    <div className="grid md:grid-cols-3 gap-6">
      <div className="card md:col-span-1">
        <div className="flex items-center justify-between">
          <h1 className="font-semibold">Revit Projects</h1>
          <button className="btn btn-sm" onClick={load}>
            Refresh
          </button>
        </div>
        {err && <div className="text-red-600 text-sm">{err}</div>}
        <div className="mt-3 space-y-2">
          {rows.map((r) => (
            <button
              key={r._id}
              className={`w-full text-left p-2 border rounded ${
                sel?._id === r._id ? "bg-blue-50" : ""
              }`}
              onClick={() => view(r._id)}
            >
              <div className="font-medium">{r.name}</div>
              <div className="text-xs text-slate-600">
                {r.itemCount} items · {new Date(r.updatedAt).toLocaleString()}
              </div>
            </button>
          ))}
          {rows.length === 0 && (
            <div className="text-sm text-slate-600">No projects yet.</div>
          )}
        </div>
      </div>

      <div className="card md:col-span-2">
        {!sel ? (
          <div className="text-sm text-slate-600">Select a project</div>
        ) : (
          <>
            <h2 className="font-semibold mb-3">{sel.name}</h2>
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead>
                  <tr className="text-left border-b">
                    <th className="py-2 pr-4">S/N</th>
                    <th className="py-2 pr-4">Description</th>
                    <th className="py-2 pr-4">Qty</th>
                    <th className="py-2 pr-4">Unit</th>
                  </tr>
                </thead>
                <tbody>
                  {sel.items.map((it, i) => (
                    <tr key={i} className="border-b">
                      <td className="py-2 pr-4">{it.sn}</td>
                      <td className="py-2 pr-4">{it.description}</td>
                      <td className="py-2 pr-4">{Number(it.qty).toFixed(2)}</td>
                      <td className="py-2 pr-4">{it.unit || ""}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="text-xs text-slate-500 mt-2">
              Project ID: <code>{sel._id}</code> (use this in the Revit plugin
              to open/update)
            </div>
          </>
        )}
      </div>
    </div>
  );
}
