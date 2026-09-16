// src/pages/ArchiCADElement.jsx
// Element drill-down route — GET /api/archicad/element/:projectId/:guid.
import React from "react";
import { Link, useParams } from "react-router-dom";
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
    <div style={{ display: "grid", gap: 18, gridTemplateColumns: "minmax(0, 1fr)" }}>
      <div className="wk-bar" style={{ marginBottom: 0, justifyContent: "space-between" }}>
        <Link to={`/archicad/${projectId}/boq`} className="wk-back">
          <svg viewBox="0 0 24 24" aria-hidden="true">
              <use href="#hi-right" />
            </svg>
          Back to BoQ
        </Link>
        <ArchiCADUnitToggle units={units} onChange={setUnits} />
      </div>

      {err ? (
        <p className="mk-note" role="alert" style={{ margin: 0, background: "var(--pal-orange-wash)", color: "var(--pal-orange-key)", borderColor: "var(--pal-orange-line)" }}>
          {err}
        </p>
      ) : null}

      {loading ? (
        <div className="wk-panel animate-pulse" style={{ marginBottom: 0, minHeight: 260 }} aria-hidden="true" />
      ) : element ? (
        <div className="wk-legacy">
          <ArchiCADElementPanel element={element} units={units} projectId={projectId} />
        </div>
      ) : !err ? (
        <div className="wk-panel wk-empty" style={{ marginBottom: 0 }}>
          Element not found in this project&apos;s BoQ.
        </div>
      ) : null}
    </div>
  );
}
