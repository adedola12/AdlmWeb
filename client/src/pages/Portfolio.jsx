// src/pages/Portfolio.jsx
import React, { useEffect, useState } from "react";
import dayjs from "dayjs";
import relativeTime from "dayjs/plugin/relativeTime";
import { useNavigate, Link } from "react-router-dom";
import { useAuth } from "../store.jsx";
import { apiAuthed } from "../http.js";
import { foldMaterials, isMaterialsKey, materialsBase } from "../lib/projectLinks.js";
import { IconArrowRight, IconLink } from "../components/icons.jsx";

dayjs.extend(relativeTime);

const PRODUCT_LABELS = {
  revit: "QUIV (Revit)",
  planswift: "HERON (PlanSwift)",
  mep: "MEP Services",
  civil3d: "Civil 3D",
};

// A materials schedule is its bill's Budget: one with a bill is dropped, one
// without is listed under its own product (see lib/projectLinks.js).
function groupProjects(projects) {
  const groups = {};
  for (const p of foldMaterials(projects)) {
    const key = isMaterialsKey(p.productKey)
      ? materialsBase(p.productKey)
      : p.productKey || "other";
    if (!groups[key]) groups[key] = [];
    groups[key].push(p);
  }
  return groups;
}

function labelForKey(key) {
  return PRODUCT_LABELS[key] || key;
}

// Loading placeholder, in his card.
function SkeletonCard() {
  return <div className="wk-proj animate-pulse" aria-hidden="true" style={{ minHeight: 150 }} />;
}

// His project card (.wk-proj), as on /work/projects and the project list.
function ProjectCard({ project, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="wk-proj"
      style={{ textAlign: "left", font: "inherit", cursor: "pointer", width: "100%" }}
    >
      <div className="t">
        <h3>{project.name}</h3>
        {project.publicShareEnabled ? (
          <span className="stage" title="Publicly shared">
            <IconLink size={12} style={{ verticalAlign: "-2px", marginRight: 4 }} />
            Shared
          </span>
        ) : null}
      </div>
      <p className="c">{labelForKey(project.productKey)}</p>
      <div className="f">
        <div>
          <b>{Number(project.itemCount || 0).toLocaleString()}</b>
          <span>item{project.itemCount !== 1 ? "s" : ""}</span>
        </div>
        <div>
          <b>{dayjs(project.updatedAt).fromNow()}</b>
          <span>last updated</span>
        </div>
      </div>
    </button>
  );
}

export default function Portfolio() {
  const { user } = useAuth();
  const navigate = useNavigate();

  const [projects, setProjects] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [hasRevit, setHasRevit] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const [portfolioRes, summaryRes] = await Promise.all([
          apiAuthed("/me/portfolio"),
          apiAuthed("/me/summary"),
        ]);
        if (cancelled) return;
        setProjects(portfolioRes.projects || []);
        const subs = summaryRes?.subscriptions || {};
        setHasRevit(!!subs["revit"]);
      } catch (err) {
        if (!cancelled) setError(err.message || "Failed to load portfolio.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, []);

  const groups = groupProjects(projects);
  const groupKeys = Object.keys(groups).sort();

  return (
    <div style={{ display: "grid", gap: 18, gridTemplateColumns: "minmax(0, 1fr)" }}>
      <div className="wk-head" style={{ marginBottom: 0 }}>
        <div>
          <Link to="/dashboard" className="wk-back">
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <use href="#hi-right" />
            </svg>
            Back to Dashboard
          </Link>
          <h1>All Projects</h1>
          <p className="wk-ref">Projects synced from your ADLM desktop plugins.</p>
        </div>
      </div>

      {/* QUIV PM Tracker note */}
      {hasRevit && (
        <Link
          to="/pm-tracker"
          className="mk-note"
          style={{
            margin: 0,
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 12,
            textDecoration: "none",
            background: "var(--pal-light-wash)",
            color: "var(--pal-light-key)",
            borderColor: "var(--pal-light-line)",
          }}
        >
          <span>
            <b style={{ fontWeight: 500 }}>QUIV users:</b> track your project schedule in
            the PM Tracker
          </span>
          <IconArrowRight size={16} />
        </Link>
      )}

      {error && (
        <p className="mk-note" role="alert" style={{ margin: 0, background: "var(--pal-orange-wash)", color: "var(--pal-orange-key)", borderColor: "var(--pal-orange-line)" }}>
          {error}
        </p>
      )}

      {loading && (
        <div className="wk-projs">
          <SkeletonCard />
          <SkeletonCard />
          <SkeletonCard />
        </div>
      )}

      {!loading && !error && projects.length === 0 && (
        <div className="wk-panel wk-empty" style={{ marginBottom: 0 }}>
          No projects yet. Open a project from your ADLM plugin to get started.
        </div>
      )}

      {!loading &&
        !error &&
        groupKeys.map((key) => (
          <section key={key}>
            <p className="wk-grp" style={{ paddingTop: 0 }}>
              {labelForKey(key)}
            </p>
            <div className="wk-projs">
              {groups[key].map((project) => (
                <ProjectCard
                  key={project._id || project.slug}
                  project={project}
                  onClick={() =>
                    navigate(`/projects/${project.productKey}?project=${project.slug}`)
                  }
                />
              ))}
            </div>
          </section>
        ))}
    </div>
  );
}
