// src/pages/ArchiCADBoQ.jsx
// Full BoQ view for an ArchiCAD project: costed table, version selector,
// exports, share link, connector badge, unit toggle, changed-line
// highlighting and the data-issues banner.
import React from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { FaChartBar, FaCheck, FaCopy, FaLink } from "../components/icons.jsx";
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


  // An old link carries the database id; once the project is known, show its
  // slug in the address instead (a history replace, not a new entry).
  const navigate = useNavigate();
  React.useEffect(() => {
    if (boq?.slug && boq?.projectId === projectId && /^[a-f\d]{24}$/i.test(projectId)) {
      navigate(`/archicad/${encodeURIComponent(boq.slug)}/boq`, { replace: true });
    }
  }, [boq?.slug, boq?.projectId, projectId, navigate]);

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
      setNotice("Rates reapplied. A new version was created.");
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
    <div style={{ display: "grid", gap: 18, gridTemplateColumns: "minmax(0, 1fr)" }}>
        {/* Header */}
        <div className="wk-head" style={{ marginBottom: 0 }}>
          <div>
            <Link to="/archicad" className="wk-back">
              <svg viewBox="0 0 24 24" aria-hidden="true">
              <use href="#hi-right" />
            </svg>
              Projects
            </Link>
            <h1>{boq?.projectName || "ArchiCAD BoQ"}</h1>
            <p className="wk-ref">
              Bill of Quantities
              {boq?.modelVersion ? ` · model ${boq.modelVersion}` : ""}
              {boq?.versionNumber ? ` · v${boq.versionNumber}` : ""}
            </p>
          </div>
          <div className="wk-acts" style={{ alignItems: "center" }}>
            <ArchiCADConnectorStatus />
            <ArchiCADUnitToggle units={units} onChange={setUnits} />
            <Link to={`/archicad/${projectId}/dashboard`} className="ds-btn ds-btn-sm btn-o">
              <FaChartBar size={14} /> Dashboard
            </Link>
            <ArchiCADExportBar
              projectId={projectId}
              projectName={boq?.projectName}
              disabled={loading || !boq}
            />
          </div>
        </div>

        {/* Version + share controls */}
        <div
          className="wk-panel wk-bar"
          style={{ marginBottom: 0, padding: "12px 16px", justifyContent: "space-between" }}
        >
          <ArchiCADVersionSelector
            versions={versions}
            currentVersionId={viewingVersionId ? null : boq?.versionId}
            selectedVersionId={viewingVersionId}
            onSelect={selectVersion}
            onReapply={reapplyRates}
            reapplying={reapplying}
            currency={boq?.currency}
          />
          <div className="wk-acts" style={{ alignItems: "center" }}>
            <button
              type="button"
              disabled={shareBusy}
              onClick={toggleShare}
              className={`ds-btn ds-btn-sm ${share.enabled ? "btn-o" : "btn-p"}`}
            >
              <FaLink size={14} />
              {shareBusy
                ? "Working…"
                : share.enabled
                  ? "Disable share link"
                  : "Create share link"}
            </button>
            {share.enabled && share.url ? (
              <span className="wk-src" style={{ maxWidth: 340 }}>
                <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {share.url}
                </span>
                <button
                  type="button"
                  onClick={copyShareUrl}
                  title="Copy link"
                  aria-label="Copy link"
                  style={{ background: "none", border: 0, padding: 0, cursor: "pointer", color: "var(--action)", display: "inline-flex" }}
                >
                  {copied ? <FaCheck size={13} /> : <FaCopy size={13} />}
                </button>
              </span>
            ) : null}
          </div>
        </div>

        {/* Notes */}
        {readOnly ? (
          <p className="mk-note" style={{ margin: 0, background: "var(--pal-light-wash)", color: "var(--pal-light-key)", borderColor: "var(--pal-light-line)" }}>
            Viewing old version{viewedVersion ? ` v${viewedVersion.versionNumber}` : ""},
            read-only.{" "}
            <button
              type="button"
              onClick={() => selectVersion(null)}
              style={{ background: "none", border: 0, padding: 0, cursor: "pointer", color: "inherit", font: "inherit", textDecoration: "underline" }}
            >
              Back to current
            </button>
          </p>
        ) : null}

        {err ? (
          <p className="mk-note" role="alert" style={{ margin: 0, background: "var(--pal-orange-wash)", color: "var(--pal-orange-key)", borderColor: "var(--pal-orange-line)" }}>
            {err}
          </p>
        ) : null}
        {notice ? (
          <p className="mk-note" style={{ margin: 0, background: "var(--pal-light-wash)", color: "var(--pal-light-key)", borderColor: "var(--pal-light-line)" }}>
            {notice}
          </p>
        ) : null}

        {issues.length > 0 ? (
          <div className="mk-note" style={{ margin: 0, background: "var(--pal-orange-wash)", color: "var(--pal-orange-key)", borderColor: "var(--pal-orange-line)" }}>
            <b style={{ fontWeight: 500 }}>
              {issues.length} data issue{issues.length === 1 ? "" : "s"} detected in the
              model extraction
            </b>
            <ul style={{ margin: "8px 0 0", paddingLeft: 20, display: "grid", gap: 4 }}>
              {issues.slice(0, 8).map((iss, i) => (
                <li key={`${iss?.guid || i}`}>
                  <Link
                    to={`/archicad/${projectId}/element/${encodeURIComponent(iss?.guid || "")}`}
                    style={{ fontFamily: "ui-monospace, monospace", fontSize: 12, color: "inherit" }}
                  >
                    {iss?.guid || "unknown element"}
                  </Link>{" "}
                  ({iss?.quivType || "element"}), {iss?.field || "field"}:{" "}
                  {iss?.reason || "flagged"}
                </li>
              ))}
              {issues.length > 8 ? <li>…and {issues.length - 8} more.</li> : null}
            </ul>
          </div>
        ) : null}

        {/* Table */}
        {loading ? (
          <div className="wk-panel animate-pulse" style={{ marginBottom: 0, minHeight: 280 }} aria-hidden="true" />
        ) : boq ? (
          <div className="wk-legacy">
          <ArchiCADBoQTable
            boq={boq}
            units={units}
            projectId={projectId}
            readOnly={readOnly}
            onLineMargin={onLineMargin}
            onGlobalMargin={onGlobalMargin}
          />
          </div>
        ) : !err ? (
          <div className="wk-panel wk-empty" style={{ marginBottom: 0 }}>
            No BoQ found for this project yet. Run an extraction from the
            connector panel (start it with <code>node index.js</code>, then open
            http://localhost:4823).
          </div>
        ) : null}
    </div>
  );
}
