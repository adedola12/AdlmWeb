// src/pages/ArchiCADDashboard.jsx
// Budget dashboard route for an ArchiCAD project — wraps
// ArchiCADBudgetDashboard around the current costed BoQ document.
import React from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { FaListUl } from "../components/icons.jsx";
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


  // An old link carries the database id; once the project is known, show its
  // slug in the address instead (a history replace, not a new entry).
  const navigate = useNavigate();
  React.useEffect(() => {
    if (boq?.slug && boq?.projectId === projectId && /^[a-f\d]{24}$/i.test(projectId)) {
      navigate(`/archicad/${encodeURIComponent(boq.slug)}/dashboard`, { replace: true });
    }
  }, [boq?.slug, boq?.projectId, projectId, navigate]);

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
    <div style={{ display: "grid", gap: 18, gridTemplateColumns: "minmax(0, 1fr)" }}>
      <div className="wk-head" style={{ marginBottom: 0 }}>
        <div>
          <Link to="/archicad" className="wk-back">
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <use href="#hi-right" />
            </svg>
            Projects
          </Link>
          <h1>{boq?.projectName || "ArchiCAD project"}</h1>
          <p className="wk-ref">
            Budget dashboard{boq?.versionNumber ? ` · v${boq.versionNumber}` : ""}
          </p>
        </div>
        <div className="wk-acts" style={{ alignItems: "center" }}>
          <ArchiCADUnitToggle units={units} onChange={setUnits} />
          <Link to={`/archicad/${projectId}/boq`} className="ds-btn ds-btn-sm btn-o">
            <FaListUl size={14} /> Open BoQ
          </Link>
        </div>
      </div>

      {err ? (
        <p className="mk-note" role="alert" style={{ margin: 0, background: "var(--pal-orange-wash)", color: "var(--pal-orange-key)", borderColor: "var(--pal-orange-line)" }}>
          {err}
        </p>
      ) : null}

      {loading ? (
        <div className="dsh-stats" style={{ marginBottom: 0 }}>
          {[...Array(4)].map((_, i) => (
            <div key={i} className="dsh-stat animate-pulse" style={{ minHeight: 96 }} aria-hidden="true" />
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
        <div className="wk-panel wk-empty" style={{ marginBottom: 0 }}>
          No BoQ data yet for this project, extract quantities from the
          connector first.
        </div>
      ) : null}
    </div>
  );
}
