import React from "react";
import { useAuth } from "../store.jsx";
import { apiAuthed } from "../http.js";
import { useParams, useSearchParams } from "react-router-dom";

const TITLES = {
  revit: "Revit Projects",
  mep: "Revit MEP Projects",
  planswift: "PlanSwift Projects",
};

export default function ProjectsGeneric() {
  const { tool } = useParams(); // "revit" | "revitmep" | "planswift"
  const title = TITLES[tool] || "Projects";
  const { accessToken } = useAuth();
  const [rows, setRows] = React.useState([]);
  const [sel, setSel] = React.useState(null);
  const [err, setErr] = React.useState("");
  const [searchParams] = useSearchParams();

  async function load() {
    setErr("");
    try {
      const list = await apiAuthed(`/projects/${tool}`, { token: accessToken });
      setRows(list);

      const preselectId = searchParams.get("project");
      const toOpen = preselectId
        ? list.find((x) => x._id === preselectId)?._id
        : list[0]?._id;

      if (toOpen) view(toOpen);
      else setSel(null);
    } catch (e) {
      setErr(e.message || "Failed to load projects");
    }
  }

  async function view(id) {
    setErr("");
    try {
      const p = await apiAuthed(`/projects/${tool}/${id}`, {
        token: accessToken,
      });
      setSel(p);
    } catch (e) {
      setErr(e.message || "Failed to open project");
    }
  }

  React.useEffect(() => {
    load(); /* eslint-disable-next-line */
  }, [accessToken, tool]);

  function copyId() {
    if (!sel?._id) return;
    navigator.clipboard.writeText(sel._id).catch(() => {});
  }

  return (
    <div className="grid md:grid-cols-3 gap-6">
      <div className="card md:col-span-1">
        <div className="flex items-center justify-between">
          <h1 className="font-semibold">{title}</h1>
          <button className="btn btn-sm" onClick={load}>
            Refresh
          </button>
        </div>
        {err && <div className="text-red-600 text-sm mt-2">{err}</div>}
        <div className="mt-3 space-y-2">
          {rows.map((r) => (
            <button
              key={r._id}
              className={`w-full text-left p-2 border rounded transition hover:bg-slate-50 ${
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
            <div className="flex items-start justify-between">
              <h2 className="font-semibold mb-3">{sel.name}</h2>
              <div className="flex gap-2">
                <button className="btn btn-sm" onClick={copyId}>
                  Copy ID
                </button>
              </div>
            </div>

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

            <div className="text-xs text-slate-500 mt-3 space-y-1">
              <div>
                Project ID: <code>{sel._id}</code> (use this in the {title}{" "}
                plugin to open/update)
              </div>
              <div>
                <b>Tip:</b> Paste this ID in your plugin’s “Open from Cloud”.
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
