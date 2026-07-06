// src/pages/ArchiCADLanding.jsx
// QUIV for ArchiCAD — product intro + the user's ArchiCAD projects
// (GET /api/archicad/projects), each linking into its BoQ.
import React from "react";
import { Link } from "react-router-dom";
import dayjs from "dayjs";
import relativeTime from "dayjs/plugin/relativeTime";
import { FaCubes, FaChartBar, FaSyncAlt, FaTerminal } from "react-icons/fa";
import { useAuth } from "../store.jsx";
import { apiAuthed } from "../http.js";
import { unwrapList } from "../features/archicad/archicadApi.js";
import { fmtMoney } from "../utils/archicadUnits.js";
import ArchiCADConnectorStatus from "../features/archicad/ArchiCADConnectorStatus.jsx";

dayjs.extend(relativeTime);

function ConnectorHowTo() {
  return (
    <div className="rounded-adlm-lg border border-dashed border-slate-300 bg-white p-6 dark:border-adlm-dark-border dark:bg-adlm-dark-panel">
      <div className="flex items-center gap-2 font-semibold text-slate-900 dark:text-white">
        <FaTerminal className="text-adlm-blue-600 dark:text-adlm-blue-300" />
        No ArchiCAD projects yet
      </div>
      <ol className="mt-3 list-decimal space-y-2 pl-5 text-sm text-slate-600 dark:text-adlm-dark-muted">
        <li>
          Start the QUIV connector on the machine running ArchiCAD:{" "}
          <code className="rounded bg-slate-100 px-1.5 py-0.5 font-mono text-xs text-slate-800 dark:bg-white/10 dark:text-adlm-dark-text">
            node index.js
          </code>{" "}
          in the connector folder.
        </li>
        <li>
          Open the connector panel at{" "}
          <code className="rounded bg-slate-100 px-1.5 py-0.5 font-mono text-xs text-slate-800 dark:bg-white/10 dark:text-adlm-dark-text">
            http://localhost:4823
          </code>{" "}
          with your ArchiCAD model open.
        </li>
        <li>
          Extract quantities and push the BoQ to ADLM Cloud — the project will
          appear here automatically.
        </li>
      </ol>
    </div>
  );
}

function SkeletonCard() {
  return (
    <div className="animate-pulse rounded-adlm-lg border border-slate-200 bg-white p-5 dark:border-adlm-dark-border dark:bg-adlm-dark-panel">
      <div className="h-4 w-2/3 rounded bg-slate-100 dark:bg-white/10" />
      <div className="mt-3 h-3 w-1/2 rounded bg-slate-100 dark:bg-white/10" />
      <div className="mt-6 h-8 w-full rounded bg-slate-100 dark:bg-white/10" />
    </div>
  );
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
    <div className="min-h-screen bg-slate-50 dark:bg-adlm-dark-bg">
      <div className="mx-auto max-w-6xl space-y-6 px-4 py-8">
        {/* Product intro */}
        <div className="overflow-hidden rounded-adlm-xl bg-adlm-navy-tertiary p-6 text-white sm:p-8">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="max-w-2xl">
              <div className="inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-sky-300">
                <FaCubes /> QUIV for ArchiCAD
              </div>
              <h1 className="mt-3 text-2xl font-bold sm:text-3xl">
                Live costed Bills of Quantities from your ArchiCAD models
              </h1>
              <p className="mt-2 text-sm text-slate-300">
                The QUIV connector measures your ArchiCAD model, prices every
                item against your RateGen libraries and keeps a versioned,
                shareable BoQ with budget tracking in ADLM Cloud.
              </p>
            </div>
            <ArchiCADConnectorStatus />
          </div>
        </div>

        {/* Projects */}
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-lg font-bold text-slate-900 dark:text-white">
            Your ArchiCAD projects
          </h2>
          <button
            type="button"
            onClick={load}
            className="inline-flex items-center gap-1.5 rounded-adlm border border-slate-300 bg-white px-3 py-1.5 text-sm font-semibold text-slate-700 transition hover:border-adlm-blue-600 hover:text-adlm-blue-700 dark:border-adlm-dark-border dark:bg-adlm-dark-raised dark:text-adlm-dark-text dark:hover:text-adlm-blue-300"
          >
            <FaSyncAlt className={loading ? "animate-spin" : ""} /> Refresh
          </button>
        </div>

        {err ? (
          <div className="rounded-adlm-lg border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-500/40 dark:bg-red-500/10 dark:text-red-300">
            {err}
          </div>
        ) : null}

        {loading ? (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <SkeletonCard />
            <SkeletonCard />
            <SkeletonCard />
          </div>
        ) : rows.length ? (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {rows.map((p) => (
              <div
                key={p.id}
                className="flex flex-col rounded-adlm-lg border border-slate-200 bg-white p-5 shadow-sm transition hover:border-adlm-blue-600/50 dark:border-adlm-dark-border dark:bg-adlm-dark-panel"
              >
                <div className="font-semibold text-slate-900 dark:text-white">
                  {p.name || "Untitled project"}
                </div>
                <div className="mt-1 text-xs text-slate-400 dark:text-adlm-dark-dim">
                  Updated {p.updatedAt ? dayjs(p.updatedAt).fromNow() : "—"} ·{" "}
                  {p.versionCount ?? 0} version{(p.versionCount ?? 0) === 1 ? "" : "s"}
                </div>
                <div className="mt-3 text-lg font-bold tabular-nums text-slate-900 dark:text-white">
                  {fmtMoney(p.grandTotal)}
                </div>
                <div className="mt-4 flex gap-2">
                  <Link
                    to={`/archicad/${p.id}/boq`}
                    className="flex-1 rounded-adlm bg-adlm-blue-600 px-3 py-2 text-center text-sm font-semibold text-white transition hover:bg-adlm-blue-700"
                  >
                    Open BoQ
                  </Link>
                  <Link
                    to={`/archicad/${p.id}/dashboard`}
                    title="Budget dashboard"
                    className="inline-flex items-center justify-center rounded-adlm border border-slate-300 px-3 py-2 text-slate-600 transition hover:border-adlm-blue-600 hover:text-adlm-blue-700 dark:border-adlm-dark-border dark:text-adlm-dark-muted dark:hover:text-adlm-blue-300"
                  >
                    <FaChartBar />
                  </Link>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <ConnectorHowTo />
        )}
      </div>
    </div>
  );
}
