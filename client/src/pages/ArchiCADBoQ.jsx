// src/pages/ArchiCADBoQ.jsx
// Full BoQ view for an ArchiCAD project: costed table, version selector,
// exports, share link, connector badge, unit toggle, changed-line
// highlighting and the data-issues banner.
import React from "react";
import { Link, useParams } from "react-router-dom";
import {
  FaArrowLeft,
  FaChartBar,
  FaLink,
  FaCopy,
  FaCheck,
  FaExclamationTriangle,
  FaHistory,
} from "react-icons/fa";
import { useAuth } from "../store.jsx";
import { apiAuthed } from "../http.js";
import { unwrap, unwrapList } from "../features/archicad/archicadApi.js";
import { safeNum } from "../utils/archicadUnits.js";
import useArchicadUnits from "../features/archicad/useArchicadUnits.jsx";
import ArchiCADBoQTable from "../features/archicad/ArchiCADBoQTable.jsx";
import ArchiCADVersionSelector from "../features/archicad/ArchiCADVersionSelector.jsx";
import ArchiCADExportBar from "../features/archicad/ArchiCADExportBar.jsx";
import ArchiCADConnectorStatus from "../features/archicad/ArchiCADConnectorStatus.jsx";
import ArchiCADUnitToggle from "../features/archicad/ArchiCADUnitToggle.jsx";

// Optimistic repricing of a line after a margin edit (margin rules from
// api-contract.md): unitRate = netUnitCost × (1 + OH%/100) × (1 + margin%/100).
function repriceLine(line, marginPercent) {
  const net = safeNum(line.netUnitCost);
  const oh = safeNum(line.overheadPercent);
  const qty = safeNum(line.quantity);
  if (net <= 0) return { ...line, marginPercent };
  const baseUnit = net * (1 + oh / 100);
  const unitRate = baseUnit * (1 + marginPercent / 100);
  const totalAmount = qty * unitRate;
  const marginAmount = totalAmount - baseUnit * qty;
  return { ...line, marginPercent, unitRate, totalAmount, marginAmount };
}

export default function ArchiCADBoQ() {
  const { projectId } = useParams();
  const { accessToken } = useAuth();
  const [units, setUnits] = useArchicadUnits();

  const [boq, setBoq] = React.useState(null);
  const [versions, setVersions] = React.useState([]);
  const [viewingVersionId, setViewingVersionId] = React.useState(null); // null = current
  const [loading, setLoading] = React.useState(true);
  const [err, setErr] = React.useState("");
  const [notice, setNotice] = React.useState("");
  const [share, setShare] = React.useState({ enabled: false, url: null });
  const [shareBusy, setShareBusy] = React.useState(false);
  const [copied, setCopied] = React.useState(false);
  const [reapplying, setReapplying] = React.useState(false);

  const readOnly = viewingVersionId != null;

  const load = React.useCallback(async () => {
    setLoading(true);
    setErr("");
    try {
      const [boqRes, versRes] = await Promise.all([
        apiAuthed(`/api/archicad/boq/${projectId}`, { token: accessToken }),
        apiAuthed(`/api/archicad/boq/${projectId}/versions`, { token: accessToken }).catch(
          () => [],
        ),
      ]);
      const doc = unwrap(boqRes);
      setBoq(doc);
      setVersions(unwrapList(versRes));
      setViewingVersionId(null);
      if (doc?.share) setShare({ enabled: !!doc.share.enabled, url: doc.share.url || null });
    } catch (e) {
      setErr(e?.message || "Failed to load the BoQ.");
    } finally {
      setLoading(false);
    }
  }, [accessToken, projectId]);

  React.useEffect(() => {
    load();
  }, [load]);

  async function selectVersion(versionId) {
    setErr("");
    setNotice("");
    if (!versionId) {
      // back to current
      await load();
      return;
    }
    setLoading(true);
    try {
      const res = await apiAuthed(
        `/api/archicad/boq/${projectId}/versions/${versionId}`,
        { token: accessToken },
      );
      setBoq(unwrap(res));
      setViewingVersionId(versionId);
    } catch (e) {
      setErr(e?.message || "Failed to load that version.");
    } finally {
      setLoading(false);
    }
  }

  async function reapplyRates() {
    if (reapplying) return;
    setReapplying(true);
    setErr("");
    try {
      const res = await apiAuthed(`/api/archicad/boq/${projectId}/reapply-rates`, {
        token: accessToken,
        method: "POST",
        data: {},
      });
      setBoq(unwrap(res));
      setViewingVersionId(null);
      const vers = await apiAuthed(`/api/archicad/boq/${projectId}/versions`, {
        token: accessToken,
      }).catch(() => null);
      if (vers) setVersions(unwrapList(vers));
      setNotice("Rates reapplied — a new version was created.");
    } catch (e) {
      setErr(e?.message || "Failed to reapply rates.");
    } finally {
      setReapplying(false);
    }
  }

  async function patchMargin(payload, optimistic) {
    const prev = boq;
    if (optimistic) setBoq(optimistic);
    try {
      const res = await apiAuthed(`/api/archicad/boq/${projectId}/margin`, {
        token: accessToken,
        method: "PATCH",
        data: payload,
      });
      setBoq(unwrap(res));
    } catch (e) {
      setBoq(prev); // roll back the optimistic update
      setErr(e?.message || "Failed to update margin.");
    }
  }

  async function onLineMargin(itemRef, marginPercent) {
    if (readOnly || !boq) return;
    const optimistic = {
      ...boq,
      lines: (boq.lines || []).map((l) =>
        l.itemRef === itemRef ? repriceLine(l, marginPercent) : l,
      ),
    };
    await patchMargin({ lines: [{ itemRef, marginPercent }] }, optimistic);
  }

  async function onGlobalMargin(marginPercent) {
    if (readOnly || !boq) return;
    const optimistic = {
      ...boq,
      lines: (boq.lines || []).map((l) => repriceLine(l, marginPercent)),
    };
    await patchMargin({ global: marginPercent }, optimistic);
  }

  async function toggleShare() {
    if (shareBusy) return;
    setShareBusy(true);
    setErr("");
    try {
      const res = await apiAuthed(`/api/archicad/boq/${projectId}/share`, {
        token: accessToken,
        method: "POST",
        data: { enabled: !share.enabled },
      });
      setShare({ enabled: !!res?.enabled, url: res?.url || null });
    } catch (e) {
      setErr(e?.message || "Failed to update the share link.");
    } finally {
      setShareBusy(false);
    }
  }

  async function copyShareUrl() {
    if (!share.url) return;
    try {
      await navigator.clipboard.writeText(share.url);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      /* clipboard unavailable — the URL is visible to copy manually */
    }
  }

  const issues = Array.isArray(boq?.issues) ? boq.issues : [];
  const viewedVersion = versions.find((v) => v.versionId === viewingVersionId);

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-adlm-dark-bg">
      <div className="mx-auto max-w-7xl space-y-4 px-4 py-8">
        {/* Header */}
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
                {boq?.projectName || "ArchiCAD BoQ"}
              </h1>
              <div className="text-xs text-slate-400 dark:text-adlm-dark-dim">
                Bill of Quantities
                {boq?.modelVersion ? ` · model ${boq.modelVersion}` : ""}
                {boq?.versionNumber ? ` · v${boq.versionNumber}` : ""}
              </div>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <ArchiCADConnectorStatus />
            <ArchiCADUnitToggle units={units} onChange={setUnits} />
            <Link
              to={`/archicad/${projectId}/dashboard`}
              className="inline-flex items-center gap-1.5 rounded-adlm border border-slate-300 bg-white px-3 py-1.5 text-sm font-semibold text-slate-700 transition hover:border-adlm-blue-600 hover:text-adlm-blue-700 dark:border-adlm-dark-border dark:bg-adlm-dark-raised dark:text-adlm-dark-text dark:hover:text-adlm-blue-300"
            >
              <FaChartBar /> Dashboard
            </Link>
            <ArchiCADExportBar
              projectId={projectId}
              projectName={boq?.projectName}
              disabled={loading || !boq}
            />
          </div>
        </div>

        {/* Version + share controls */}
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-adlm-lg border border-slate-200 bg-white p-3 dark:border-adlm-dark-border dark:bg-adlm-dark-panel">
          <ArchiCADVersionSelector
            versions={versions}
            currentVersionId={viewingVersionId ? null : boq?.versionId}
            selectedVersionId={viewingVersionId}
            onSelect={selectVersion}
            onReapply={reapplyRates}
            reapplying={reapplying}
            currency={boq?.currency}
          />
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              disabled={shareBusy}
              onClick={toggleShare}
              className={[
                "inline-flex items-center gap-1.5 rounded-adlm px-3 py-1.5 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-50",
                share.enabled
                  ? "border border-slate-300 bg-white text-slate-700 hover:text-red-600 dark:border-adlm-dark-border dark:bg-adlm-dark-raised dark:text-adlm-dark-text dark:hover:text-red-400"
                  : "bg-adlm-blue-600 text-white hover:bg-adlm-blue-700",
              ].join(" ")}
            >
              <FaLink />
              {shareBusy
                ? "Working…"
                : share.enabled
                  ? "Disable share link"
                  : "Create share link"}
            </button>
            {share.enabled && share.url ? (
              <span className="inline-flex max-w-[340px] items-center gap-1.5 rounded-adlm border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-xs text-slate-600 dark:border-adlm-dark-border dark:bg-white/5 dark:text-adlm-dark-muted">
                <span className="truncate">{share.url}</span>
                <button
                  type="button"
                  onClick={copyShareUrl}
                  title="Copy link"
                  className="shrink-0 text-adlm-blue-700 transition hover:opacity-80 dark:text-adlm-blue-300"
                >
                  {copied ? <FaCheck /> : <FaCopy />}
                </button>
              </span>
            ) : null}
          </div>
        </div>

        {/* Banners */}
        {readOnly ? (
          <div className="flex items-center gap-2 rounded-adlm-lg border border-adlm-blue-600/40 bg-adlm-blue-600/10 px-4 py-3 text-sm font-medium text-adlm-blue-700 dark:text-adlm-blue-300">
            <FaHistory />
            Viewing old version{viewedVersion ? ` v${viewedVersion.versionNumber}` : ""} —
            read-only.{" "}
            <button
              type="button"
              onClick={() => selectVersion(null)}
              className="underline underline-offset-2"
            >
              Back to current
            </button>
          </div>
        ) : null}

        {err ? (
          <div className="rounded-adlm-lg border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-500/40 dark:bg-red-500/10 dark:text-red-300">
            {err}
          </div>
        ) : null}
        {notice ? (
          <div className="rounded-adlm-lg border border-emerald-300 bg-emerald-50 px-4 py-3 text-sm text-emerald-700 dark:border-emerald-500/40 dark:bg-emerald-500/10 dark:text-emerald-300">
            {notice}
          </div>
        ) : null}

        {issues.length > 0 ? (
          <div className="rounded-adlm-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-800 dark:border-amber-500/40 dark:bg-amber-500/10 dark:text-amber-300">
            <div className="flex items-center gap-2 font-semibold">
              <FaExclamationTriangle />
              {issues.length} data issue{issues.length === 1 ? "" : "s"} detected in the
              model extraction
            </div>
            <ul className="mt-2 list-disc space-y-1 pl-6">
              {issues.slice(0, 8).map((iss, i) => (
                <li key={`${iss?.guid || i}`}>
                  <Link
                    to={`/archicad/${projectId}/element/${encodeURIComponent(iss?.guid || "")}`}
                    className="font-mono text-xs underline underline-offset-2"
                  >
                    {iss?.guid || "unknown element"}
                  </Link>{" "}
                  ({iss?.quivType || "element"}) — {iss?.field || "field"}:{" "}
                  {iss?.reason || "flagged"}
                </li>
              ))}
              {issues.length > 8 ? <li>…and {issues.length - 8} more.</li> : null}
            </ul>
          </div>
        ) : null}

        {/* Table */}
        {loading ? (
          <div className="animate-pulse space-y-2 rounded-adlm-lg border border-slate-200 bg-white p-6 dark:border-adlm-dark-border dark:bg-adlm-dark-panel">
            {[...Array(8)].map((_, i) => (
              <div key={i} className="h-4 rounded bg-slate-100 dark:bg-white/10" />
            ))}
          </div>
        ) : boq ? (
          <ArchiCADBoQTable
            boq={boq}
            units={units}
            projectId={projectId}
            readOnly={readOnly}
            onLineMargin={onLineMargin}
            onGlobalMargin={onGlobalMargin}
          />
        ) : !err ? (
          <div className="rounded-adlm-lg border border-dashed border-slate-300 bg-white p-8 text-center text-sm text-slate-500 dark:border-adlm-dark-border dark:bg-adlm-dark-panel dark:text-adlm-dark-muted">
            No BoQ found for this project yet. Run an extraction from the
            connector panel (start it with{" "}
            <code className="rounded bg-slate-100 px-1.5 py-0.5 font-mono text-xs dark:bg-white/10">
              node index.js
            </code>
            , then open http://localhost:4823).
          </div>
        ) : null}
      </div>
    </div>
  );
}
