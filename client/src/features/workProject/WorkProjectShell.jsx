// Richard's project workspace, as a route shell.
//
// This is step one of adopting his design (work-proj.js, which builds the
// whole view into <div id="pj-app"> from fixture data). His chrome is real
// here and wired to the account's own projects; the tab bodies are not built
// yet and say so rather than pretending.
//
// It lives at /work/project/:productKey/:id, which was a bare redirect, so
// nothing that exists today changes while this is built. /projects/:tool
// remains the workspace customers price jobs from, untouched, and the
// redirect still runs for every role that is not staff — see pages/WorkProject.jsx.
//
// The CSS is already ours: 59 .pj-* classes came across in
// styles/ds-work-proj.css when his stylesheet was ported and have been dead
// since. This is what turns them on.

import React from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useProjects } from "../../ds/useProjects.js";
import { tabsFor, resolveTab, tabCount, tabNeedsAttention } from "./workProjectTabs.js";

const TOOL_NAMES = {
  revit: "QUIV",
  planswift: "HERON",
  mep: "Revit MEP",
  civil3d: "CIVIQ",
  archicad: "ArchiCAD",
  rategen: "RateGen",
  "qs-takeoff": "Time Pro",
};

const toolName = (k) => TOOL_NAMES[String(k || "").toLowerCase()] || String(k || "").toUpperCase();

/** Match on either id or slug: both appear in links and bookmarks. */
function findProject(projects, productKey, id) {
  if (!Array.isArray(projects)) return null;
  const want = String(id || "").toLowerCase();
  const key = String(productKey || "").toLowerCase();
  return (
    projects.find(
      (p) =>
        String(p?.slug || "").toLowerCase() === want ||
        String(p?.id || p?._id || "").toLowerCase() === want,
    ) ||
    // A project whose id is not in the rollup still deserves the right tool
    // chrome rather than a blank page, so fall back to the tool itself.
    projects.find((p) => String(p?.productKey || "").toLowerCase() === key) ||
    null
  );
}

/** What each tab will hold, named honestly until it does. */
const TAB_BODIES = {
  overview: "the headline figures, the two donuts and the stage rail",
  bill: "the bill lines, with their rates and the build-up behind each one",
  rates: "the budget: material, labour and plant per line, against the rate library",
  pm: "tasks, risks and issues, and the programme they drive",
  valuations: "valuations, certificates and the approved variations",
  model: "the model versions this bill was measured from, and what changed between them",
  drawings: "the PlanSwift sheets this takeoff came from",
  services: "the services projects linked into this bill",
};

export default function WorkProjectShell({ productKey, id }) {
  const { projects, failed } = useProjects();
  const [params, setParams] = useSearchParams();

  const project = React.useMemo(
    () => findProject(projects, productKey, id),
    [projects, productKey, id],
  );

  const tabs = tabsFor(productKey);
  const tab = resolveTab(params.get("tab"), productKey);

  // A panel opens over the tab body. Escape closes it, which is his behaviour
  // and also the thing a keyboard user will try first.
  const [panel, setPanel] = React.useState(null);
  React.useEffect(() => {
    if (!panel) return undefined;
    const onKey = (e) => {
      if (e.key === "Escape") setPanel(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [panel]);

  // Changing tab closes whatever was open over the old one.
  const go = React.useCallback(
    (next) => {
      setPanel(null);
      const p = new URLSearchParams(params);
      if (next === "overview") p.delete("tab");
      else p.set("tab", next);
      // push, not replace: the back button should walk the tabs, which is the
      // thing ProjectsGeneric gets wrong today — it reads ?project= and then
      // deletes it, so back leaves the workspace entirely.
      setParams(p);
    },
    [params, setParams],
  );

  const viewOnly = project?.access === "view" || project?.readOnly === true;

  return (
    <div className="ds">
      <div className="pj-head">
        <nav className="pj-crumb">
          <Link to="/work/projects">Projects</Link>
          <span aria-hidden="true">›</span>
          <Link to={`/work/tool/${encodeURIComponent(String(productKey || "").toLowerCase())}`}>
            {toolName(productKey)}
          </Link>
        </nav>

        <div className="pj-title">
          <h1>{project?.name || (projects ? "Project" : "Loading…")}</h1>
          {project?.stage ? <span className="pill">{project.stage}</span> : null}
        </div>

        <p className="pj-meta">
          <span>
            {toolName(productKey)}
            {project?.fileName ? ` · ${project.fileName}` : ""}
          </span>
          {project?.client ? <span>{project.client}</span> : null}
        </p>

        <div className="pj-hacts">
          <Link
            className="ds-btn btn-o ds-btn-sm"
            to={`/projects/${encodeURIComponent(String(productKey || "").toLowerCase())}?project=${encodeURIComponent(id || "")}`}
          >
            Open the full workspace
          </Link>
        </div>
      </div>

      {viewOnly ? (
        <div className="pj-note">
          <div>
            <b>Shared with you.</b> You can see everything and follow progress. Editing needs a
            seat on the owner&rsquo;s account.
          </div>
        </div>
      ) : null}

      {failed ? (
        <div className="pj-note">
          <div>
            <b>This project could not be loaded just now.</b> The tabs below are still the right
            ones for {toolName(productKey)}; the figures are what is missing.
          </div>
        </div>
      ) : null}

      <div className="pj-tabs" role="tablist">
        {tabs.map((t) => {
          const count = tabCount(t.key, project);
          return (
            <button
              key={t.key}
              type="button"
              role="tab"
              aria-selected={tab === t.key}
              onClick={() => go(t.key)}
            >
              {t.label}
              {count != null ? <em>{count}</em> : null}
              {tabNeedsAttention(t.key, project) ? (
                <i className="adlm-dot" aria-label="Needs attention" />
              ) : null}
            </button>
          );
        })}
      </div>

      <div className="pj-body">
        <div className="pj-empty">
          <p>
            <b>{tabs.find((t) => t.key === tab)?.label}</b> is not built here yet.
          </p>
          <p className="ds-sub">
            This is where {TAB_BODIES[tab]} will go. Until then it lives in the full workspace,
            which is still the one to use.
          </p>
          <Link
            className="ds-btn btn-p ds-btn-sm"
            to={`/projects/${encodeURIComponent(String(productKey || "").toLowerCase())}?project=${encodeURIComponent(id || "")}`}
          >
            Open the full workspace
          </Link>
        </div>
      </div>

      {panel ? (
        <div className="pj-panel" role="dialog" aria-modal="true">
          <button type="button" className="ds-btn btn-o ds-btn-sm" onClick={() => setPanel(null)}>
            Close
          </button>
        </div>
      ) : null}
    </div>
  );
}
