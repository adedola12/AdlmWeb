// features/reports/ReportModal.jsx
// Full-screen report preview + PDF download. Fetches the report payload from
// the /reports endpoints, renders the matching document (Project / PM /
// Management) inside a scrollable preview, and exports it with
// downloadReportPdf(). Open it from any page via:
//
//   <ReportModal
//     open={open} onClose={...}
//     type="project" | "pm" | "management"
//     productKey="revit" projectId={id}      // project-scoped types only
//   />
import React, { useEffect, useRef, useState } from "react";
import { apiAuthed } from "../../api.js";
import { useAuth } from "../../store.jsx";
import { ReportShell } from "./reportKit.jsx";
import { downloadReportPdf, reportFilename } from "./reportPdf.js";
import ProjectReport from "./ProjectReport.jsx";
import PmReport from "./PmReport.jsx";
import ManagementReport from "./ManagementReport.jsx";
import ActivityReport from "./ActivityReport.jsx";

const TITLES = {
  project: "Project Progress Report",
  pm: "Project Management Report",
  management: "Management Report",
  activity: "Project Activity Report",
};

function endpointFor(type, productKey, projectId) {
  if (type === "management") return "/reports/management";
  if (type === "activity") return "/me/activity/report";
  return `/reports/${type}/${productKey}/${projectId}`;
}

export default function ReportModal({ open, onClose, type, productKey, projectId }) {
  const { accessToken } = useAuth();
  const previewRef = useRef(null);
  const [report, setReport] = useState(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [downloading, setDownloading] = useState(false);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setReport(null);
    setError("");
    setLoading(true);
    apiAuthed(endpointFor(type, productKey, projectId), { token: accessToken })
      .then((res) => {
        if (cancelled) return;
        if (res?.report) setReport(res.report);
        else setError(res?.error || "Could not build the report.");
      })
      .catch((e) => {
        if (!cancelled) setError(e?.message || "Could not build the report.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open, type, productKey, projectId, accessToken]);

  if (!open) return null;

  const title = TITLES[type] || "Report";
  const nameForFile =
    type === "management"
      ? report?.organization?.name || "portfolio"
      : type === "activity"
        ? report?.user?.firm || report?.user?.name || "activity"
        : report?.meta?.name || "project";

  async function handleDownload() {
    if (!previewRef.current || downloading) return;
    setDownloading(true);
    try {
      await downloadReportPdf(previewRef, reportFilename(`adlm-${type}-report`, nameForFile));
    } finally {
      setDownloading(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[90] flex flex-col bg-black/60 backdrop-blur-sm">
      {/* Toolbar, in his head. It carries its own .ds scope because this
          modal also opens from pages outside his app frame. The report
          document below is the printable PDF and keeps its own styling. */}
      <div className="ds" style={{ boxShadow: "0 10px 30px rgba(0,0,0,.25)" }}>
        <div className="wk-ph" style={{ borderBottom: "1px solid var(--line)" }}>
          <div style={{ minWidth: 0 }}>
            <h2 style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{title}</h2>
            <div className="wk-locnote" style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {loading ? "Building report…" : report ? nameForFile : ""}
            </div>
          </div>
          <div className="wk-acts" style={{ flex: "none" }}>
            <button
              type="button"
              onClick={handleDownload}
              disabled={!report || loading || downloading}
              className="ds-btn ds-btn-sm btn-p"
            >
              {downloading ? "Preparing PDF…" : "Download PDF"}
            </button>
            <button type="button" onClick={onClose} className="ds-btn ds-btn-sm btn-o">
              Close
            </button>
          </div>
        </div>
      </div>

      {/* Preview */}
      <div className="flex-1 overflow-auto">
        {loading && (
          <div className="flex items-center justify-center h-full text-white/80 text-sm">
            Gathering project data and drawing charts…
          </div>
        )}
        {!loading && error && (
          <div className="ds flex items-center justify-center h-full" style={{ background: "transparent" }}>
            <p
              className="mk-note"
              role="alert"
              style={{
                margin: 0,
                maxWidth: 440,
                textAlign: "center",
                background: "var(--pal-orange-wash)",
                color: "var(--pal-orange-key)",
                borderColor: "var(--pal-orange-line)",
              }}
            >
              {error}
            </p>
          </div>
        )}
        {!loading && report && (
          <ReportShell previewRef={previewRef}>
            {type === "project" && <ProjectReport report={report} />}
            {type === "pm" && <PmReport report={report} />}
            {type === "management" && <ManagementReport report={report} />}
            {type === "activity" && <ActivityReport report={report} />}
          </ReportShell>
        )}
      </div>
    </div>
  );
}
