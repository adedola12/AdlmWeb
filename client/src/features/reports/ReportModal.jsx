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
      {/* Toolbar */}
      <div className="flex items-center justify-between gap-3 px-4 py-3 bg-adlm-navy text-white shadow-lg">
        <div className="min-w-0">
          <div className="text-sm font-semibold truncate">{title}</div>
          <div className="text-[11px] text-white/60 truncate">
            {loading ? "Building report…" : report ? nameForFile : ""}
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={handleDownload}
            disabled={!report || loading || downloading}
            className="px-4 py-2 rounded-lg text-sm font-semibold bg-adlm-orange text-white disabled:opacity-40 hover:opacity-90 transition"
          >
            {downloading ? "Preparing PDF…" : "Download PDF"}
          </button>
          <button
            type="button"
            onClick={onClose}
            className="px-3 py-2 rounded-lg text-sm font-medium bg-white/10 hover:bg-white/20 transition"
          >
            Close
          </button>
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
          <div className="flex items-center justify-center h-full">
            <div className="bg-white rounded-xl px-6 py-5 text-sm text-red-600 max-w-md text-center">
              {error}
            </div>
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
