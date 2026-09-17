// src/pages/Portfolio.jsx
import React, { useEffect, useState } from "react";
import dayjs from "dayjs";
import relativeTime from "dayjs/plugin/relativeTime";
import { useNavigate, Link } from "react-router-dom";
import { useAuth } from "../store.jsx";
import { apiAuthed } from "../http.js";
import { IconArrowLeft, IconArrowRight, IconLink } from "../components/icons.jsx";

dayjs.extend(relativeTime);

const PRODUCT_LABELS = {
  revit: "QUIV (Revit)",
  planswift: "HERON (PlanSwift)",
  mep: "MEP Services",
  civil3d: "Civil 3D",
};

const SKIP_KEYS = new Set(["revit-materials", "planswift-materials"]);

function groupProjects(projects) {
  const groups = {};
  for (const p of projects) {
    const key = p.productKey || "other";
    if (SKIP_KEYS.has(key)) continue;
    if (!groups[key]) groups[key] = [];
    groups[key].push(p);
  }
  return groups;
}

function labelForKey(key) {
  return PRODUCT_LABELS[key] || key;
}

function SkeletonCard() {
  return (
    <div className="bg-white rounded-2xl shadow-sm p-5 animate-pulse">
      <div className="h-4 bg-slate-200 rounded w-2/3 mb-3" />
      <div className="h-3 bg-slate-100 rounded w-1/3" />
    </div>
  );
}

function ProjectCard({ project, onClick }) {
  return (
    <button
      onClick={onClick}
      className="w-full text-left bg-white rounded-2xl shadow-sm p-5 hover:shadow-md transition-shadow border border-slate-100 group"
    >
      <div className="flex items-start justify-between gap-2">
        <span className="font-medium text-slate-800 group-hover:text-blue-600 transition-colors line-clamp-2">
          {project.name}
        </span>
        {project.publicShareEnabled && (
          <span
            title="Publicly shared"
            className="flex-shrink-0 text-blue-500 mt-0.5"
          >
            <IconLink className="w-4 h-4" />
          </span>
        )}
      </div>
      <div className="mt-2 flex items-center gap-3 text-xs text-slate-400">
        <span>{project.itemCount} item{project.itemCount !== 1 ? "s" : ""}</span>
        <span>·</span>
        <span>Updated {dayjs(project.updatedAt).fromNow()}</span>
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
    <div className="min-h-screen bg-slate-50">
      <div className="max-w-5xl mx-auto px-4 py-10">
        {/* Back link */}
        <Link
          to="/dashboard"
          className="inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-700 mb-6 transition-colors"
        >
          <IconArrowLeft className="w-4 h-4" />
          Back to Dashboard
        </Link>

        {/* Header */}
        <h1 className="text-2xl font-bold text-slate-900 mb-2">All Projects</h1>
        <p className="text-sm text-slate-500 mb-6">
          Projects synced from your ADLM desktop plugins.
        </p>

        {/* QUIV PM Tracker banner */}
        {hasRevit && (
          <Link
            to="/pm-tracker"
            className="flex items-center justify-between gap-3 bg-blue-50 border border-blue-100 rounded-2xl px-5 py-3.5 mb-6 hover:bg-blue-100 transition-colors group"
          >
            <span className="text-sm text-blue-800">
              <span className="font-semibold">QUIV users:</span> track your
              project schedule in the PM Tracker
            </span>
            <IconArrowRight className="w-4 h-4 text-blue-500 flex-shrink-0 group-hover:translate-x-0.5 transition-transform" />
          </Link>
        )}

        {/* Error */}
        {error && (
          <div className="bg-rose-50 border border-rose-100 text-rose-700 rounded-2xl px-5 py-4 mb-6 text-sm">
            {error}
          </div>
        )}

        {/* Loading skeleton */}
        {loading && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            <SkeletonCard />
            <SkeletonCard />
            <SkeletonCard />
          </div>
        )}

        {/* Empty state */}
        {!loading && !error && projects.length === 0 && (
          <div className="text-center py-20 text-slate-400 text-sm">
            No projects yet. Open a project from your ADLM plugin to get
            started.
          </div>
        )}

        {/* Groups */}
        {!loading &&
          !error &&
          groupKeys.map((key) => (
            <section key={key} className="mb-10">
              <h2 className="text-sm font-semibold text-slate-500 uppercase tracking-wider mb-3">
                {labelForKey(key)}
              </h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {groups[key].map((project) => (
                  <ProjectCard
                    key={project._id || project.slug}
                    project={project}
                    onClick={() =>
                      navigate(
                        `/projects/${project.productKey}?project=${project.slug}`,
                      )
                    }
                  />
                ))}
              </div>
            </section>
          ))}
      </div>
    </div>
  );
}
