import React from "react";
import { useAuth } from "../store.jsx";
import { apiAuthed } from "../http.js";
import { useParams, useSearchParams } from "react-router-dom";

const TITLES = {
  revit: "Revit Projects",
  revitmep: "Revit MEP Projects",
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

  const rowId = (r) => r?._id || r?.id || null;

  async function load() {
    setErr("");
    try {
      const list = await apiAuthed(`/projects/${tool}`, { token: accessToken });
      setRows(Array.isArray(list) ? list : []);

      const preselectId = searchParams.get("project");
      const firstId = rowId(list?.[0]);
      const found = preselectId
        ? list.find((x) => rowId(x) === preselectId)
        : null;

      const toOpen = rowId(found) || firstId;

      if (toOpen) await view(toOpen);
      else setSel(null);
    } catch (e) {
      setErr(e.message || "Failed to load projects");
      setSel(null);
    }
  }

  async function view(id) {
    if (!id || id === "undefined") {
      setErr("Invalid project id");
      return;
    }

    setErr("");
    try {
      const p = await apiAuthed(`/projects/${tool}/${id}`, {
        token: accessToken,
      });
      setSel(p);
    } catch (e) {
      setErr(e.message || "Failed to open project");
      setSel(null);
    }
  }

  React.useEffect(() => {
    load(); // eslint-disable-next-line
  }, [accessToken, tool]);

  function copyId() {
    const id = sel?._id || sel?.id;
    if (!id) return;
    navigator.clipboard.writeText(id).catch(() => {});
  }

  const selectedId = sel?._id || sel?.id;

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
          {rows.map((r) => {
            const id = rowId(r);
            return (
              <button
                key={id || Math.random()}
                className={`w-full text-left p-2 border rounded transition hover:bg-slate-50 ${
                  selectedId === id ? "bg-blue-50" : ""
                }`}
                onClick={() => id && view(id)}
                disabled={!id}
              >
                <div className="font-medium">{r.name}</div>
                <div className="text-xs text-slate-600">
                  {r.itemCount} items · {new Date(r.updatedAt).toLocaleString()}
                </div>
              </button>
            );
          })}

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
                  {(sel.items || []).map((it, i) => (
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
                Project ID: <code>{selectedId}</code>
              </div>
              <div>
                <b>Tip:</b> View Recent project in your plugin UI (coming soon).
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
