// src/pages/ArchiCADLanding.jsx
// QUIV for ArchiCAD — product intro + the user's ArchiCAD projects
// (GET /api/archicad/projects), each linking into its BoQ.
import React from "react";
import { Link } from "react-router-dom";
import dayjs from "dayjs";
import relativeTime from "dayjs/plugin/relativeTime";
import { FaChartBar, FaSyncAlt } from "../components/icons.jsx";
import { useAuth } from "../store.jsx";
import { apiAuthed } from "../http.js";
import { unwrapList } from "../features/archicad/archicadApi.js";
import { fmtMoney } from "../utils/archicadUnits.js";
import ArchiCADConnectorStatus from "../features/archicad/ArchiCADConnectorStatus.jsx";

dayjs.extend(relativeTime);

function ConnectorHowTo() {
  return (
    <section className="wk-panel" style={{ marginBottom: 0 }}>
      <div className="wk-ph">
        <h2>No ArchiCAD projects yet</h2>
      </div>
      <ol className="wk-note" style={{ margin: 0, paddingLeft: 40, display: "grid", gap: 8 }}>
        <li>
          Start the QUIV connector on the machine running ArchiCAD:{" "}
          <code>node index.js</code> in the connector folder.
        </li>
        <li>
          Open the connector panel at <code>http://localhost:4823</code> with your
          ArchiCAD model open.
        </li>
        <li>
          Extract quantities and push the BoQ to ADLM Cloud. The project will
          appear here automatically.
        </li>
      </ol>
    </section>
  );
}

function SkeletonCard() {
  return <div className="wk-proj animate-pulse" aria-hidden="true" style={{ minHeight: 160 }} />;
}

export default function ArchiCADLanding() {
  const { accessToken } = useAuth();
  const [rows, setRows] = React.useState([]);
  const [loading, setLoading] = React.useState(true);
  const [err, setErr] = React.useState("");

  const load = React.useCallback(async () => {
    setLoading(true);
    setErr("");
    try {
      const res = await apiAuthed("/api/archicad/projects", { token: accessToken });
      setRows(unwrapList(res));
    } catch (e) {
      setErr(e?.message || "Failed to load ArchiCAD projects.");
    } finally {
      setLoading(false);
    }
  }, [accessToken]);

  React.useEffect(() => {
    load();
  }, [load]);

  return (
    <div style={{ display: "grid", gap: 18, gridTemplateColumns: "minmax(0, 1fr)" }}>
      <div className="wk-head" style={{ marginBottom: 0 }}>
        <div>
          <h1>QUIV for ArchiCAD</h1>
          <p className="wk-ref">
            Live costed Bills of Quantities from your ArchiCAD models. The connector
            measures the model, prices every item against your RateGen libraries and
            keeps a versioned, shareable BoQ with budget tracking.
          </p>
        </div>
        <div className="wk-acts" style={{ alignItems: "center" }}>
          <ArchiCADConnectorStatus />
          <button type="button" onClick={load} className="ds-btn ds-btn-sm btn-o">
            <FaSyncAlt size={14} className={loading ? "animate-spin" : ""} /> Refresh
          </button>
        </div>
      </div>

      {err ? (
        <p className="mk-note" role="alert" style={{ margin: 0, background: "var(--pal-orange-wash)", color: "var(--pal-orange-key)", borderColor: "var(--pal-orange-line)" }}>
          {err}
        </p>
      ) : null}

      <p className="wk-grp" style={{ padding: 0, margin: 0 }}>
        Your ArchiCAD projects
      </p>

      {loading ? (
        <div className="wk-projs">
          <SkeletonCard />
          <SkeletonCard />
          <SkeletonCard />
        </div>
      ) : rows.length ? (
        <div className="wk-projs">
          {rows.map((p) => (
            <div key={p.id} className="wk-proj">
              <div className="t">
                <h3>{p.name || "Untitled project"}</h3>
                <span className="stage">
                  v{p.versionCount ?? 0}
                </span>
              </div>
              <p className="c">
                Updated {p.updatedAt ? dayjs(p.updatedAt).fromNow() : "–"} ·{" "}
                {p.versionCount ?? 0} version{(p.versionCount ?? 0) === 1 ? "" : "s"}
              </p>
              <div className="f">
                <div>
                  <b>{fmtMoney(p.grandTotal)}</b>
                  <span>estimate</span>
                </div>
              </div>
              <div className="wk-acts" style={{ marginTop: 16 }}>
                <Link to={`/archicad/${encodeURIComponent(p.slug || p.id)}/boq`} className="ds-btn ds-btn-sm btn-p">
                  Open BoQ
                </Link>
                <Link
                  to={`/archicad/${encodeURIComponent(p.slug || p.id)}/dashboard`}
                  title="Budget dashboard"
                  className="ds-btn ds-btn-sm btn-o"
                >
                  <FaChartBar size={14} /> Dashboard
                </Link>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <ConnectorHowTo />
      )}
    </div>
  );
}
