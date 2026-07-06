// src/pages/ArchiCADDashboard.jsx
// Budget dashboard route for an ArchiCAD project — wraps
// ArchiCADBudgetDashboard around the current costed BoQ document.
import React from "react";
import { Link, useParams } from "react-router-dom";
import { FaArrowLeft, FaListUl } from "react-icons/fa";
import { useAuth } from "../store.jsx";
import { apiAuthed } from "../http.js";
import { unwrap } from "../features/archicad/archicadApi.js";
import useArchicadUnits from "../features/archicad/useArchicadUnits.jsx";
import ArchiCADBudgetDashboard from "../features/archicad/ArchiCADBudgetDashboard.jsx";
import ArchiCADUnitToggle from "../features/archicad/ArchiCADUnitToggle.jsx";

export default function ArchiCADDashboard() {
  const { projectId } = useParams();
  const { accessToken } = useAuth();
  const [units, setUnits] = useArchicadUnits();

  const [boq, setBoq] = React.useState(null);
  const [loading, setLoading] = React.useState(true);
  const [err, setErr] = React.useState("");
  const [savingBudget, setSavingBudget] = React.useState(false);

  const load = React.useCallback(async () => {
    setLoading(true);
    setErr("");
    try {
      const res = await apiAuthed(`/api/archicad/boq/${projectId}`, {
        token: accessToken,
      });
      setBoq(unwrap(res));
    } catch (e) {
      setErr(e?.message || "Failed to load the dashboard.");
    } finally {
      setLoading(false);
    }
  }, [accessToken, projectId]);

  React.useEffect(() => {
    load();
  }, [load]);

  async function saveBudget(targetBudget) {
    setSavingBudget(true);
    setErr("");
    try {
      const res = await apiAuthed(`/api/archicad/boq/${projectId}/budget`, {
        token: accessToken,
        method: "PATCH",
        data: { targetBudget },
      });
      setBoq(unwrap(res));
    } catch (e) {
      setErr(e?.message || "Failed to save the target budget.");
    } finally {
      setSavingBudget(false);
    }
  }

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-adlm-dark-bg">
      <div className="mx-auto max-w-6xl space-y-4 px-4 py-8">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <Link
              to="/archicad"
              className="inline-flex items-center gap-1.5 text-sm text-slate-500 transition hover:text-slate-700 dark:text-adlm-dark-muted dark:hover:text-adlm-dark-text"
            >
              <FaArrowLeft className="text-xs" /> Projects
            </Link>
            <div>
              <h1 className="text-xl font-bold text-slate-900 dark:text-white">
                {boq?.projectName || "ArchiCAD project"}
              </h1>
              <div className="text-xs text-slate-400 dark:text-adlm-dark-dim">
                Budget dashboard{boq?.versionNumber ? ` · v${boq.versionNumber}` : ""}
              </div>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <ArchiCADUnitToggle units={units} onChange={setUnits} />
            <Link
              to={`/archicad/${projectId}/boq`}
              className="inline-flex items-center gap-1.5 rounded-adlm border border-slate-300 bg-white px-3 py-1.5 text-sm font-semibold text-slate-700 transition hover:border-adlm-blue-600 hover:text-adlm-blue-700 dark:border-adlm-dark-border dark:bg-adlm-dark-raised dark:text-adlm-dark-text dark:hover:text-adlm-blue-300"
            >
              <FaListUl /> Open BoQ
            </Link>
          </div>
        </div>

        {err ? (
          <div className="rounded-adlm-lg border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-500/40 dark:bg-red-500/10 dark:text-red-300">
            {err}
          </div>
        ) : null}

        {loading ? (
          <div className="grid animate-pulse gap-3 md:grid-cols-3">
            {[...Array(6)].map((_, i) => (
              <div
                key={i}
                className="h-24 rounded-adlm-lg border border-slate-200 bg-white dark:border-adlm-dark-border dark:bg-adlm-dark-panel"
              />
            ))}
          </div>
        ) : boq ? (
          <ArchiCADBudgetDashboard
            boq={boq}
            units={units}
            onSaveBudget={saveBudget}
            savingBudget={savingBudget}
          />
        ) : !err ? (
          <div className="rounded-adlm-lg border border-dashed border-slate-300 bg-white p-8 text-center text-sm text-slate-500 dark:border-adlm-dark-border dark:bg-adlm-dark-panel dark:text-adlm-dark-muted">
            No BoQ data yet for this project — extract quantities from the
            connector first.
          </div>
        ) : null}
      </div>
    </div>
  );
}
