import React from "react";
import {
  FaTimes,
  FaInfoCircle,
  FaFileImport,
  FaCheck,
  FaArrowRight,
  FaShieldAlt,
} from "react-icons/fa";

// PmMppHelperModal — appears when the server returns MPP_NOT_ENABLED
// after a .mpp upload. Walks the user through MS Project's XML export
// in three short steps and offers a "try another file" CTA so they can
// drop in the .xml without leaving the screen.
//
// The modal is intentionally task-focused (no "OK / Cancel" jargon) and
// styled in the ADLM blue family so it reads as a guided handoff, not
// an error dialog.

export default function PmMppHelperModal({
  open,
  errorMessage = "",
  onClose,
  onPickXml, // optional — fires a file picker scoped to .xml
}) {
  const fileRef = React.useRef(null);

  // Lock body scroll while the modal is open and respond to Escape.
  React.useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    function onKey(e) {
      if (e.key === "Escape") onClose?.();
    }
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener("keydown", onKey);
    };
  }, [open, onClose]);

  if (!open) return null;

  function handlePickXml(e) {
    const file = e.target.files?.[0];
    if (file && onPickXml) onPickXml(file);
    e.target.value = "";
  }

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm"
      aria-modal="true"
      role="dialog"
    >
      <div className="w-full max-w-2xl overflow-hidden rounded-2xl bg-white shadow-2xl">
        {/* Header */}
        <div className="flex items-start justify-between gap-3 bg-gradient-to-r from-adlm-blue-700 to-blue-800 px-5 py-4 text-white">
          <div className="flex items-start gap-3">
            <div className="rounded-lg bg-white/20 p-2">
              <FaFileImport className="text-xl" />
            </div>
            <div>
              <div className="text-[10px] uppercase tracking-widest opacity-80">
                Quick conversion
              </div>
              <div className="text-lg font-bold leading-tight">
                Convert your .mpp to XML — it takes 10 seconds
              </div>
              <div className="mt-1 text-[12px] opacity-90">
                Native .mpp parsing isn't enabled on this server yet. MS Project
                has a built-in XML export that gives us the same data with
                identical fidelity.
              </div>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-white/80 hover:bg-white/10 hover:text-white"
            title="Close"
          >
            <FaTimes />
          </button>
        </div>

        {/* Steps */}
        <div className="px-5 py-4">
          <div className="space-y-3">
            <Step
              n={1}
              title="Open the project in MS Project"
              body="Double-click your .mpp file. If you don't have Project on this machine, ask the original author to do this step and send you the .xml."
            />
            <Step
              n={2}
              title="File → Save As → choose “XML”"
              body={
                <>
                  In the Save As dialog, click the <em>Save as type</em>{" "}
                  dropdown and pick{" "}
                  <span className="font-mono text-[11px] rounded bg-slate-100 px-1.5 py-0.5">
                    XML Format (*.xml)
                  </span>
                  . Save next to your .mpp file.
                </>
              }
            />
            <Step
              n={3}
              title="Upload the .xml here"
              body="Click the button below (or use the “Import MS Project” action again) and select the new .xml file. We'll parse everything: tasks, dates, durations, WBS, predecessors, baseline costs."
            />
          </div>

          {/* Privacy / fidelity note */}
          <div className="mt-4 flex items-start gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-[11px] text-emerald-800">
            <FaShieldAlt className="mt-0.5 shrink-0" />
            <div>
              <strong>Same data, no compromise.</strong> The XML export is
              Microsoft's documented Project XML schema — every field we use
              (tasks, predecessors, baseline cost, dates, % complete) is
              preserved 1:1.
            </div>
          </div>

          {/* Server-provided error message (collapsible details) */}
          {errorMessage ? (
            <details className="mt-3 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-[11px] text-slate-600">
              <summary className="cursor-pointer font-semibold text-slate-700">
                <FaInfoCircle className="inline mr-1 text-slate-400" />
                Why this happened (technical detail)
              </summary>
              <div className="mt-2 whitespace-pre-wrap text-slate-600">
                {errorMessage}
              </div>
              <div className="mt-2 text-[10px] text-slate-500">
                Admins: set <code>MPXJ_API_URL</code> (HTTPS endpoint of a
                Java MPXJ converter service) or <code>MPXJ_CLI_PATH</code>{" "}
                (local CLI) on the server to enable direct .mpp imports.
              </div>
            </details>
          ) : null}
        </div>

        {/* Footer actions */}
        <div className="flex items-center justify-between gap-2 border-t border-slate-100 bg-slate-50 px-5 py-3">
          <button
            type="button"
            onClick={onClose}
            className="text-xs font-medium text-slate-500 hover:text-slate-700"
          >
            Dismiss
          </button>
          <div className="flex items-center gap-2">
            <input
              ref={fileRef}
              type="file"
              accept=".xml"
              className="hidden"
              onChange={handlePickXml}
            />
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              className="inline-flex items-center gap-2 rounded-lg bg-adlm-blue-700 px-4 py-2 text-xs font-bold text-white shadow hover:bg-blue-800 transition"
            >
              <FaFileImport />
              Upload .xml now
              <FaArrowRight className="text-[10px]" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function Step({ n, title, body }) {
  return (
    <div className="flex items-start gap-3 rounded-xl border border-slate-200 bg-white px-3 py-2.5">
      <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-adlm-blue-700 text-[11px] font-bold text-white">
        {n}
      </div>
      <div className="min-w-0">
        <div className="text-sm font-semibold text-slate-900">{title}</div>
        <div className="mt-0.5 text-xs text-slate-600 leading-relaxed">
          {body}
        </div>
      </div>
      <FaCheck className="ml-auto text-slate-300 text-xs" />
    </div>
  );
}
