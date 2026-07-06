// src/pages/ArchiCADElement.jsx
// Element drill-down route — GET /api/archicad/element/:projectId/:guid.
import React from "react";
import { Link, useParams } from "react-router-dom";
import { FaArrowLeft } from "react-icons/fa";
import { useAuth } from "../store.jsx";
import { apiAuthed } from "../http.js";
import { unwrap } from "../features/archicad/archicadApi.js";
import useArchicadUnits from "../features/archicad/useArchicadUnits.jsx";
import ArchiCADElementPanel from "../features/archicad/ArchiCADElementPanel.jsx";
import ArchiCADUnitToggle from "../features/archicad/ArchiCADUnitToggle.jsx";

export default function ArchiCADElement() {
  const { projectId, guid } = useParams();
  const { accessToken } = useAuth();
  const [units, setUnits] = useArchicadUnits();

  const [element, setElement] = React.useState(null);
  const [loading, setLoading] = React.useState(true);
  const [err, setErr] = React.useState("");

  const load = React.useCallback(async () => {
    setLoading(true);
    setErr("");
    try {
      const res = await apiAuthed(
        `/api/archicad/element/${projectId}/${encodeURIComponent(guid)}`,
        { token: accessToken },
      );
      setElement(unwrap(res));
    } catch (e) {
      setErr(e?.message || "Failed to load the element.");
    } finally {
      setLoading(false);
    }
  }, [accessToken, projectId, guid]);

  React.useEffect(() => {
    load();
  }, [load]);

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-adlm-dark-bg">
      <div className="mx-auto max-w-5xl space-y-4 px-4 py-8">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Link
            to={`/archicad/${projectId}/boq`}
            className="inline-flex items-center gap-1.5 text-sm text-slate-500 transition hover:text-slate-700 dark:text-adlm-dark-muted dark:hover:text-adlm-dark-text"
          >
            <FaArrowLeft className="text-xs" /> Back to BoQ
          </Link>
          <ArchiCADUnitToggle units={units} onChange={setUnits} />
        </div>

        {err ? (
          <div className="rounded-adlm-lg border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-500/40 dark:bg-red-500/10 dark:text-red-300">
            {err}
          </div>
        ) : null}

        {loading ? (
          <div className="animate-pulse space-y-4">
            <div className="h-20 rounded-adlm-lg border border-slate-200 bg-white dark:border-adlm-dark-border dark:bg-adlm-dark-panel" />
            <div className="grid gap-4 lg:grid-cols-2">
              <div className="h-48 rounded-adlm-lg border border-slate-200 bg-white dark:border-adlm-dark-border dark:bg-adlm-dark-panel" />
              <div className="h-48 rounded-adlm-lg border border-slate-200 bg-white dark:border-adlm-dark-border dark:bg-adlm-dark-panel" />
            </div>
          </div>
        ) : element ? (
          <ArchiCADElementPanel element={element} units={units} projectId={projectId} />
        ) : !err ? (
          <div className="rounded-adlm-lg border border-dashed border-slate-300 bg-white p-8 text-center text-sm text-slate-500 dark:border-adlm-dark-border dark:bg-adlm-dark-panel dark:text-adlm-dark-muted">
            Element not found in this project's BoQ.
          </div>
        ) : null}
      </div>
    </div>
  );
}
