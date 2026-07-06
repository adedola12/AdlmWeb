// src/features/archicad/ArchiCADExportBar.jsx
// Excel + PDF export buttons. Downloads go through an authenticated raw
// fetch → blob → anchor click (same pattern as the BoQ exports in
// ProjectsGeneric.jsx — apiAuthed parses JSON/text, so binary uses fetch).
import React from "react";
import { FaFileExcel, FaFilePdf, FaSpinner } from "react-icons/fa";
import { useAuth } from "../../store.jsx";
import { API_BASE } from "../../config";

function filenameFromDisposition(cd, fallback) {
  const m = /filename\*?=(?:UTF-8'')?"?([^";]+)"?/i.exec(cd || "");
  if (!m) return fallback;
  try {
    return decodeURIComponent(m[1]);
  } catch {
    return m[1];
  }
}

function sanitizeFilename(name) {
  return String(name || "Project").replace(/[\\/:*?"<>|]+/g, "-").slice(0, 120);
}

export default function ArchiCADExportBar({ projectId, projectName, disabled = false }) {
  const { accessToken } = useAuth();
  const [busy, setBusy] = React.useState(""); // "" | "excel" | "pdf"
  const [err, setErr] = React.useState("");

  async function download(kind) {
    if (!projectId || busy) return;
    setBusy(kind);
    setErr("");
    try {
      const res = await fetch(
        `${API_BASE}/api/archicad/boq/${projectId}/export/${kind}`,
        {
          method: "GET",
          headers: { Authorization: `Bearer ${accessToken}` },
          credentials: "include",
        },
      );
      if (!res.ok) {
        const txt = await res.text().catch(() => "");
        let msg = txt;
        try {
          msg = JSON.parse(txt)?.error || txt;
        } catch {
          /* keep raw text */
        }
        throw new Error(msg?.slice(0, 200) || `Export failed (HTTP ${res.status})`);
      }
      const blob = await res.blob();
      const ext = kind === "excel" ? "xlsx" : "pdf";
      const fallback = `${sanitizeFilename(projectName)} - ArchiCAD BoQ.${ext}`;
      const filename = filenameFromDisposition(
        res.headers.get("content-disposition"),
        fallback,
      );
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(a.href);
    } catch (e) {
      setErr(e?.message || "Export failed");
    } finally {
      setBusy("");
    }
  }

  const baseBtn =
    "inline-flex items-center gap-1.5 rounded-adlm px-3 py-1.5 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-50";

  return (
    <div className="flex flex-col items-end gap-1">
      <div className="flex items-center gap-2">
        <button
          type="button"
          disabled={disabled || !!busy}
          onClick={() => download("excel")}
          className={`${baseBtn} bg-emerald-600 text-white hover:bg-emerald-700 dark:bg-emerald-600 dark:hover:bg-emerald-500`}
        >
          {busy === "excel" ? <FaSpinner className="animate-spin" /> : <FaFileExcel />}
          Excel
        </button>
        <button
          type="button"
          disabled={disabled || !!busy}
          onClick={() => download("pdf")}
          className={`${baseBtn} bg-adlm-orange text-white hover:opacity-90`}
        >
          {busy === "pdf" ? <FaSpinner className="animate-spin" /> : <FaFilePdf />}
          PDF
        </button>
      </div>
      {err ? (
        <div className="text-xs text-red-600 dark:text-red-400">{err}</div>
      ) : null}
    </div>
  );
}
