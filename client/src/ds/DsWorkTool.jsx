// His tool page (work-tool.html, work-proj.js toolHead(), 17 Sep 2026) at
// /work/tool/:t, on real data (P0.4): the tool's head (its projects, their
// value, when one was last saved), a note when the account does not hold the
// tool, how a project starts, and the gallery fixed to that tool.
//
// The tool's own workspace (/projects/:key), where projects are created,
// imported and opened, stays one click away: his page has no create action,
// and ours must not lose it.

import React from "react";
import { Link, Navigate, useParams } from "react-router-dom";
import { apiAuthed } from "../api.js";
import { useAuth } from "../store.jsx";
import DsProjectGallery from "./DsProjectGallery.jsx";
import SampleProjectsStrip from "../features/projects/SampleProjectsStrip.jsx";
import { useProjects } from "./useProjects.js";
import { FaChevronRight, FaLock } from "../components/icons.jsx";
import { SOURCES, compact, estimatedOf, short, sourceOf } from "../lib/projectGallery.js";

const BY_SLUG = Object.fromEntries(Object.entries(SOURCES).map(([key, s]) => [s.slug, key]));

const STEPS = {
  revit: ["Open the model in Revit", "Run QUIV and extract", "Save to ADLM Cloud"],
  planswift: ["Open the drawings in PlanSwift", "Take off with HERON", "Save to ADLM Cloud"],
  mep: ["Open the services model in Revit", "Run Revit MEP and extract", "Save to ADLM Cloud"],
  civil3d: ["Open the corridor in Civil 3D", "Run CIVIQ and extract", "Save to ADLM Cloud"],
};

export default function DsWorkTool() {
  const { t } = useParams();
  const { accessToken } = useAuth();
  const { projects, failed } = useProjects();
  const [owned, setOwned] = React.useState(null);
  const [samples, setSamples] = React.useState([]);
  const key = BY_SLUG[String(t || "").toLowerCase()];
  const S = SOURCES[key];

  React.useEffect(() => {
    if (!accessToken) return undefined;
    let alive = true;
    apiAuthed("/me/rail", { token: accessToken })
      // No list (an older API) means unknown, and unknown never warns: the
      // same rule the rail follows (DsAppShell).
      .then((d) => alive && setOwned(Array.isArray(d?.ownedKeys) ? new Set(d.ownedKeys) : null))
      .catch(() => alive && setOwned(null));
    return () => {
      alive = false;
    };
  }, [accessToken]);

  // Read-only learning samples for this tool; none (or an older API) hides the row.
  React.useEffect(() => {
    if (!accessToken || !key) return undefined;
    let alive = true;
    apiAuthed(`/projects/${key}/samples`, { token: accessToken })
      .then((d) => alive && setSamples(Array.isArray(d) ? d : []))
      .catch(() => alive && setSamples([]));
    return () => {
      alive = false;
    };
  }, [accessToken, key]);

  if (String(t).toLowerCase() === "rategen") return <Navigate to="/work/library" replace />;
  if (!S || !STEPS[key]) return <Navigate to="/work/projects" replace />;

  const mine = (projects || []).filter((p) => sourceOf(p) === key);
  // The same "Estimated" figure the gallery and the Bill show: the whole
  // grand summary, not measured work alone (S18, PR2-08).
  const total = mine.reduce((a, p) => a + estimatedOf(p), 0);
  const last = mine.map((p) => p.updatedAt).filter(Boolean).sort().pop();
  const holds = !owned || owned.has(key);

  return (
    <div className="dsh-in">
      <div className={holds ? "pj-tool" : "pj-tool off"}>
        <div className="id">
          <img className="big" src={S.icon} alt="" />
          <div>
            <h1>{S.name}</h1>
            <p>
              Projects that started in {S.host}, measured with {S.name}. Once the quantities are on ADLM
              Cloud, the project is where you price, plan and value them.
            </p>
          </div>
        </div>
        <div className="kp">
          <div>
            <span>Projects</span>
            <b>{projects ? mine.length : "–"}</b>
          </div>
          <div>
            <span>Estimated</span>
            <b>{projects ? compact(total) : "–"}</b>
          </div>
          <div>
            <span>Last saved</span>
            <b>{last ? short(last) : "–"}</b>
          </div>
        </div>
      </div>

      {holds ? null : (
        <div className="pj-note warn">
          <FaLock size={18} aria-hidden="true" />
          <div>
            <b>{S.name} is not on this account.</b> Projects a consultant shares with you still open here.{" "}
            <Link to="/manage/products">Add {S.name}</Link>
          </div>
        </div>
      )}

      <div className="pj-how">
        <span className="k">How a project starts</span>
        {STEPS[key].map((s, i) => (
          <React.Fragment key={s}>
            {i ? (
              <span className="ar">
                <FaChevronRight size={14} aria-hidden="true" />
              </span>
            ) : null}
            <span className="st">
              <i>{i + 1}</i>
              {s}
            </span>
          </React.Fragment>
        ))}
        <Link className="ver" to={`/projects/${key}`}>
          Open the {S.name} workspace
        </Link>
      </div>

      <SampleProjectsStrip samples={samples} productKey={key} />

      {failed ? (
        <p className="ds-sub">Your projects could not be loaded just now. Please refresh.</p>
      ) : (
        // Keyed by tool: moving from /work/tool/quiv to /work/tool/heron must
        // not carry QUIV's filter, search or stage over (review, 2026-09-22).
        <DsProjectGallery key={key} projects={projects} fixedTool={key} />
      )}
    </div>
  );
}
